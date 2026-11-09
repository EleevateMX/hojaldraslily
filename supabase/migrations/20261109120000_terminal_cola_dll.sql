-- Cobro con TARJETA por el agente DLL de la PC (cola), no por la API REST.
--
-- La casa se fue por el camino CERTIFICADO de Banorte: el DLL PINPAD.TPV en la
-- PC de la tienda (`apps/agente-banorte`), no la API de TPV Solutions. Pero la
-- caja vive en la nube y no llega a la LAN de la pinpad, así que se cablea por
-- COLA, igual que el agente de tickets:
--
--   1. La caja ENCOLA un cobro (`fn_terminal_cobro_pedir`). El servidor decide
--      el importe (nunca la pantalla) y el número de control.
--   2. El agente de la PC RECLAMA la cola de su sucursal
--      (`fn_terminal_cola_reclamar`, con su token), cobra en la pinpad por DLL,
--      y REPORTA (`fn_terminal_cobro_resultado`).
--   3. Al aprobar, el servidor registra la venta por EL MISMO camino de siempre
--      —`fn_cobrar_orden` / `_mixto` / `fn_encargo_entregar_con_venta`—. No hay
--      un segundo camino del dinero: estas funciones recalculan el total, el
--      pago cae en el corte, el trigger descuenta inventario y manda comandas.
--   4. La caja SONDEA el estado (`fn_terminal_cobro_estado`) hasta que resuelve.
--
-- Si el registro falla con la tarjeta ya aprobada, el resultado le dice al
-- agente que ANULE en la pinpad (la anulación del DLL vive en la PC, no aquí),
-- como hace la Edge Function de la API.
--
-- Seguridad: igual que las impresoras. El token es la única identidad del
-- agente; las funciones de token están abiertas a `anon` (el agente usa la
-- llave publicable, sin sesión) pero no tocan nada sin un token válido. Las de
-- la caja exigen `fn_es_staff()`; las de Admin, `fn_es_jefe()`.

-- 1) El dispositivo terminal registrado. El token = su identidad (como impresoras).
create table if not exists public.terminales (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references public.sucursales(id),
  nombre         text not null default 'Banorte',
  agente_token   uuid not null default gen_random_uuid(),
  activa         boolean not null default true,
  -- Lo reporta el agente en cada latido: PRD cobra de verdad; AUT/DEC/RND simulan.
  modo           text,
  agente_version text,
  ultima_conexion timestamptz,
  created_at     timestamptz not null default now()
);
-- Una sola terminal activa por sucursal: dos serían dos cobros del mismo toque.
create unique index if not exists uq_terminal_activa_sucursal
  on public.terminales (sucursal_id) where activa;
create index if not exists ix_terminal_token on public.terminales (agente_token);
alter table public.terminales enable row level security;

-- 2) La cola de cobros.
create table if not exists public.terminal_cola (
  id               uuid primary key default gen_random_uuid(),
  -- Doble toque / reintento: la misma clave no encola dos veces.
  idempotency_key  uuid not null unique,
  sucursal_id      uuid not null references public.sucursales(id),
  terminal_id      uuid references public.terminales(id),
  estado           text not null default 'en_cola',
  -- qué cobrar (uno de los dos)
  orden_id         uuid references public.ordenes(id),
  encargo          jsonb,
  efectivo         numeric not null default 0,
  monto            numeric not null,          -- lo que va a la tarjeta (servidor)
  control_number   text not null,
  empleado_id      uuid,
  -- lo que reporta el agente
  voucher          jsonb,
  crudo            jsonb,
  codigo           text,
  texto            text,
  -- resultado del registro
  pago_id          uuid,
  folio            integer,
  resultado_orden_id uuid,
  detalle          text,
  -- cola
  claimed_by       text,
  claimed_at       timestamptz,
  claim_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint terminal_cola_estado_check check (estado in
    ('en_cola','reclamado','aprobado','rechazado','sin_respuesta','anulado','error'))
);
create index if not exists ix_terminal_cola_cola
  on public.terminal_cola (sucursal_id, estado, created_at);
alter table public.terminal_cola enable row level security;

-- ------------------------------------------------------------------ Admin ---

-- Registra (o re-registra) la terminal de una sucursal y devuelve su token UNA
-- vez — se copia al .env del agente de la PC. Desactiva la anterior para que el
-- índice único no choque.
create or replace function public.fn_terminal_registrar(p_sucursal_id uuid, p_nombre text default 'Banorte')
 returns table(id uuid, agente_token uuid)
 language plpgsql security definer set search_path to 'public'
as $$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede registrar la terminal' using errcode = '42501';
  end if;
  update public.terminales set activa = false
   where sucursal_id = p_sucursal_id and activa;
  return query
  insert into public.terminales (sucursal_id, nombre)
  values (p_sucursal_id, coalesce(nullif(trim(p_nombre), ''), 'Banorte'))
  returning terminales.id, terminales.agente_token;
end;
$$;

-- Rota el token (se perdió el .env, o sospecha de compromiso). Nuevo token UNA vez.
create or replace function public.fn_terminal_rotar_token(p_id uuid)
 returns uuid
 language plpgsql security definer set search_path to 'public'
as $$
declare v_token uuid;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede rotar el token' using errcode = '42501';
  end if;
  update public.terminales set agente_token = gen_random_uuid()
   where id = p_id
  returning agente_token into v_token;
  if v_token is null then raise exception 'Esa terminal no existe'; end if;
  return v_token;
end;
$$;

-- Enciende/apaga la terminal sin perder su token. Al encender, apaga las otras
-- de la sucursal (índice único).
create or replace function public.fn_terminal_activar(p_id uuid, p_activa boolean)
 returns void
 language plpgsql security definer set search_path to 'public'
as $$
declare v_suc uuid;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede activar la terminal' using errcode = '42501';
  end if;
  if p_activa then
    select sucursal_id into v_suc from public.terminales where id = p_id;
    if v_suc is null then raise exception 'Esa terminal no existe'; end if;
    update public.terminales set activa = false where sucursal_id = v_suc and activa and id <> p_id;
  end if;
  update public.terminales set activa = p_activa where id = p_id;
end;
$$;

-- Las terminales registradas (sin el token). `conectada` = latió hace poco.
create or replace function public.fn_terminales_listar()
 returns table(id uuid, sucursal_id uuid, nombre text, activa boolean, modo text,
               agente_version text, ultima_conexion timestamptz, conectada boolean)
 language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver las terminales' using errcode = '42501';
  end if;
  return query
  select t.id, t.sucursal_id, t.nombre, t.activa, t.modo, t.agente_version, t.ultima_conexion,
         (t.ultima_conexion is not null and t.ultima_conexion > now() - interval '90 seconds')
  from public.terminales t
  order by t.created_at;
end;
$$;

-- ------------------------------------------------------------------- Caja ---

-- La caja encola un cobro. El SERVIDOR decide el importe que va a la tarjeta
-- (total de la orden menos el efectivo, o lo que dice el encargo) y el número
-- de control. Devuelve `hay_terminal=false` si la sucursal no tiene terminal
-- dada de alta: la caja lo lee como «cobra a mano en la pinpad», igual que
-- cuando faltan secretos. Idempotente por `idempotency_key`.
create or replace function public.fn_terminal_cobro_pedir(
  p_idempotency_key uuid,
  p_orden_id uuid default null,
  p_efectivo numeric default 0,
  p_encargo jsonb default null,
  p_empleado_id uuid default null
) returns table(cobro_id uuid, estado text, monto numeric, control_number text, hay_terminal boolean)
 language plpgsql security definer set search_path to 'public'
as $$
declare
  v_prev public.terminal_cola;
  v_term uuid;
  v_suc uuid;
  v_efectivo numeric := round(coalesce(p_efectivo, 0), 2);
  v_total numeric;
  v_tarjeta numeric;
  v_folio integer;
  v_estado_pago text;
  v_demo boolean;
  v_control text;
  v_id uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cobrar en la terminal' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'Falta idempotency_key'; end if;
  if p_orden_id is null and p_encargo is null then raise exception 'Falta orden o encargo'; end if;

  -- Idempotencia: el mismo toque devuelve el cobro que ya existe.
  select * into v_prev from public.terminal_cola where idempotency_key = p_idempotency_key;
  if found then
    return query select v_prev.id, v_prev.estado, v_prev.monto, v_prev.control_number, true;
    return;
  end if;

  -- ¿De qué sucursal es, y cuánto va a la tarjeta?
  if p_orden_id is not null then
    select o.sucursal_id, o.total, o.folio, o.estado_pago_orden, o.es_demo
      into v_suc, v_total, v_folio, v_estado_pago, v_demo
      from public.ordenes o where o.id = p_orden_id;
    if v_suc is null then raise exception 'La orden no existe'; end if;
    if v_demo then raise exception 'Una orden demo no se cobra en la terminal'; end if;
    if v_estado_pago not in ('draft','pending_payment','awaiting_counter_payment','payment_processing','payment_unknown') then
      raise exception 'La orden no admite cobro (estado=%)', v_estado_pago;
    end if;
    v_tarjeta := round(v_total - v_efectivo, 2);
  else
    v_suc := (p_encargo->>'sucursal_id')::uuid;
    if v_suc is null then raise exception 'El encargo no trae sucursal'; end if;
    v_tarjeta := round((p_encargo->>'tarjeta')::numeric, 2);
    v_folio := null;
  end if;
  if v_tarjeta is null or v_tarjeta <= 0 then
    raise exception 'Lo que va con tarjeta tiene que ser mayor que cero';
  end if;

  -- ¿Hay terminal activa en esa sucursal?
  select id into v_term from public.terminales where sucursal_id = v_suc and activa;
  if v_term is null then
    return query select null::uuid, 'no_configurado'::text, 0::numeric, ''::text, false;
    return;
  end if;

  -- Número de control: lleva el folio (para cuadrar a ojo) y el reloj (para que
  -- dos intentos no choquen). <= 30 alfanuméricos.
  v_control := substr('L' || coalesce(v_folio::text, 'E') || 'T' ||
               upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint)), 1, 30);

  insert into public.terminal_cola
    (idempotency_key, sucursal_id, terminal_id, orden_id, encargo, efectivo, monto, control_number, empleado_id)
  values
    (p_idempotency_key, v_suc, v_term, p_orden_id, p_encargo, v_efectivo, v_tarjeta, v_control, p_empleado_id)
  returning id into v_id;

  return query select v_id, 'en_cola'::text, v_tarjeta, v_control, true;
end;
$$;

-- La caja sondea el estado del cobro hasta que resuelve.
create or replace function public.fn_terminal_cobro_estado(p_cobro_id uuid)
 returns table(estado text, monto numeric, folio integer, orden_id uuid, pago_id uuid,
               voucher jsonb, codigo text, texto text, detalle text, modo text)
 language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede consultar el cobro' using errcode = '42501';
  end if;
  return query
  select c.estado, c.monto, c.folio, c.resultado_orden_id, c.pago_id,
         c.voucher, c.codigo, c.texto, c.detalle, t.modo
  from public.terminal_cola c
  left join public.terminales t on t.id = c.terminal_id
  where c.id = p_cobro_id;
end;
$$;

-- ------------------------------------------------------------ Agente (PC) ---

-- El agente reclama los cobros pendientes de SU sucursal (por su token) y se
-- los lleva a cobrar en la pinpad. Reusa el control_number que puso el servidor.
create or replace function public.fn_terminal_cola_reclamar(p_token uuid, p_agente text, p_limite integer default 3)
 returns table(cobro_id uuid, monto numeric, control_number text)
 language plpgsql security definer set search_path to 'public'
as $$
declare v_term uuid; v_suc uuid;
begin
  select id, sucursal_id into v_term, v_suc
    from public.terminales where agente_token = p_token and activa;
  if v_term is null then raise exception 'Token de terminal inválido o terminal inactiva'; end if;
  update public.terminales set ultima_conexion = now() where id = v_term;

  return query
  update public.terminal_cola c
     set estado = 'reclamado', claimed_by = p_agente, terminal_id = v_term,
         claimed_at = now(), claim_expires_at = now() + interval '2 minutes', updated_at = now()
  from (
    select id from public.terminal_cola
     where sucursal_id = v_suc
       and (estado = 'en_cola' or (estado = 'reclamado' and claim_expires_at < now()))
     order by created_at
     limit greatest(1, coalesce(p_limite, 3))
     for update skip locked
  ) e
  where c.id = e.id
  returning c.id, c.monto, c.control_number;
end;
$$;

-- El agente reporta el resultado de la pinpad. Si aprobó, el servidor registra
-- la venta por el camino de siempre. Devuelve `anular=true` cuando la tarjeta
-- aprobó pero la venta NO se pudo registrar: el agente la anula en la pinpad.
create or replace function public.fn_terminal_cobro_resultado(
  p_token uuid,
  p_cobro_id uuid,
  p_aprobado boolean,
  p_voucher jsonb default null,
  p_crudo jsonb default null,
  p_codigo text default null,
  p_texto text default null
) returns table(registrada boolean, anular boolean, referencia text, autorizacion text,
                monto numeric, control_number text, mensaje text)
 language plpgsql security definer set search_path to 'public'
as $$
declare
  v_term uuid; v_suc uuid;
  c public.terminal_cola;
  v_ref text;
  v_pago public.pagos;
  v_res jsonb;
  v_orden uuid;
  v_folio integer;
  v_pago_id uuid;
begin
  select id, sucursal_id into v_term, v_suc
    from public.terminales where agente_token = p_token and activa;
  if v_term is null then raise exception 'Token de terminal inválido o terminal inactiva'; end if;

  select * into c from public.terminal_cola where id = p_cobro_id;
  if c.id is null then raise exception 'Ese cobro no existe'; end if;
  if c.sucursal_id <> v_suc then raise exception 'Ese cobro es de otra sucursal'; end if;

  -- Idempotente: si ya terminó, se devuelve lo de entonces (el agente pudo
  -- reintentar el reporte).
  if c.estado in ('aprobado','rechazado','sin_respuesta','anulado','error') then
    return query select (c.estado = 'aprobado'), false, null::text, null::text, c.monto, c.control_number,
                        coalesce(c.detalle, c.texto, c.estado);
    return;
  end if;

  -- No aprobada: se guarda y se acabó. 'T' (sin respuesta) se distingue para
  -- que la caja diga «revisa la pinpad» en vez de «rechazada».
  if not p_aprobado then
    update public.terminal_cola
       set estado = case when coalesce(p_codigo,'') = 'T' then 'sin_respuesta' else 'rechazado' end,
           voucher = p_voucher, crudo = p_crudo, codigo = p_codigo, texto = p_texto, updated_at = now()
     where id = p_cobro_id;
    return query select false, false, null::text, null::text, c.monto, c.control_number,
                        coalesce(p_texto, 'La tarjeta no se aprobó');
    return;
  end if;

  -- Aprobada: la venta entra por el camino de siempre. La autorización del
  -- banco manda como referencia.
  v_ref := coalesce(p_voucher->>'autorizacion', p_voucher->>'referencia', c.control_number);
  begin
    if c.orden_id is not null then
      if c.efectivo > 0 then
        v_pago := fn_cobrar_orden_mixto(c.orden_id, c.efectivo, c.monto, 'tarjeta'::metodo_pago,
                                        v_ref, c.empleado_id, c.idempotency_key);
      else
        -- Sin efectivo, lo que va a la tarjeta ES el total de la orden.
        v_pago := fn_cobrar_orden(c.orden_id, 'tarjeta'::metodo_pago, c.monto,
                                  v_ref, c.empleado_id, c.idempotency_key);
      end if;
      v_pago_id := v_pago.id;
      v_orden := c.orden_id;
      select o.folio into v_folio from public.ordenes o where o.id = c.orden_id;
    else
      v_res := fn_encargo_entregar_con_venta(
        (c.encargo->>'encargo_id')::uuid,
        (c.encargo->>'sucursal_id')::uuid,
        (c.encargo->>'almacen_id')::uuid,
        c.encargo->>'canal',
        c.encargo->'items',
        (c.encargo->>'corte_id')::uuid,
        c.empleado_id,
        coalesce((c.encargo->>'descuento')::numeric, 0),
        c.efectivo,
        c.monto,
        v_ref,
        c.idempotency_key);
      v_orden := (v_res->>'orden_id')::uuid;
      v_folio := (v_res->>'folio')::integer;
      select p.id into v_pago_id from public.pagos p
        where p.orden_id = v_orden and p.estado = 'aprobado' limit 1;
    end if;

    update public.terminal_cola
       set estado = 'aprobado', voucher = p_voucher, crudo = p_crudo,
           pago_id = v_pago_id, folio = v_folio, resultado_orden_id = v_orden, updated_at = now()
     where id = p_cobro_id;

    return query select true, false, v_ref, (p_voucher->>'autorizacion'), c.monto, c.control_number, 'ok'::text;
  exception when others then
    -- La tarjeta se cobró y la venta no entró: que el agente la ANULE en la
    -- pinpad. Se guarda el porqué para que gerencia lo cuadre.
    update public.terminal_cola
       set estado = 'error', voucher = p_voucher, crudo = p_crudo, detalle = SQLERRM, updated_at = now()
     where id = p_cobro_id;
    return query select false, true, (p_voucher->>'referencia'), (p_voucher->>'autorizacion'),
                        c.monto, c.control_number, SQLERRM;
  end;
end;
$$;

-- El latido del agente: lo vivo que está, su versión y su modo (PRD/AUT/...).
create or replace function public.fn_terminal_latido(p_token uuid, p_version text default null, p_modo text default null)
 returns void
 language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.terminales
     set ultima_conexion = now(),
         agente_version = coalesce(nullif(trim(p_version), ''), agente_version),
         modo = coalesce(nullif(trim(p_modo), ''), modo)
   where agente_token = p_token and activa;
end;
$$;

-- --------------------------------------------------------------- Permisos ---
-- De Admin/caja: solo con sesión del personal.
revoke all on function public.fn_terminal_registrar(uuid, text) from public, anon;
grant execute on function public.fn_terminal_registrar(uuid, text) to authenticated, service_role;
revoke all on function public.fn_terminal_rotar_token(uuid) from public, anon;
grant execute on function public.fn_terminal_rotar_token(uuid) to authenticated, service_role;
revoke all on function public.fn_terminal_activar(uuid, boolean) from public, anon;
grant execute on function public.fn_terminal_activar(uuid, boolean) to authenticated, service_role;
revoke all on function public.fn_terminales_listar() from public, anon;
grant execute on function public.fn_terminales_listar() to authenticated, service_role;
revoke all on function public.fn_terminal_cobro_pedir(uuid, uuid, numeric, jsonb, uuid) from public, anon;
grant execute on function public.fn_terminal_cobro_pedir(uuid, uuid, numeric, jsonb, uuid) to authenticated, service_role;
revoke all on function public.fn_terminal_cobro_estado(uuid) from public, anon;
grant execute on function public.fn_terminal_cobro_estado(uuid) to authenticated, service_role;

-- Del agente de la PC: identidad por TOKEN, sin sesión (usa la llave publicable).
revoke all on function public.fn_terminal_cola_reclamar(uuid, text, integer) from public;
grant execute on function public.fn_terminal_cola_reclamar(uuid, text, integer) to anon, authenticated, service_role;
revoke all on function public.fn_terminal_cobro_resultado(uuid, uuid, boolean, jsonb, jsonb, text, text) from public;
grant execute on function public.fn_terminal_cobro_resultado(uuid, uuid, boolean, jsonb, jsonb, text, text) to anon, authenticated, service_role;
revoke all on function public.fn_terminal_latido(uuid, text, text) from public;
grant execute on function public.fn_terminal_latido(uuid, text, text) to anon, authenticated, service_role;
