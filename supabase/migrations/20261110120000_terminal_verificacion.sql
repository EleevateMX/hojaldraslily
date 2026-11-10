-- «Verificación Banorte» desde la caja: correr la VERIFICACIÓN (consulta de
-- estado) de la matriz de certificación por la misma cola del agente DLL, para
-- que el laboratorio la valide sobre una transacción VÁLIDA (su número de
-- control) y el voucher salga por la térmica como cualquier otro.
--
-- Banorte observó (10/11/26) que la verificación se había hecho «sobre un valor
-- nulo»: la verificación consulta el número de control de una VENTA real, no uno
-- vacío. Esto le da a gerencia un botón para hacerlo desde la caja.
--
-- CLAVE DE DISEÑO: es un camino PARALELO y ADITIVO. NO toca
-- `fn_terminal_cobro_resultado` —la función que registra las ventas reales—:
-- los diagnósticos (verificación/cancelación) tienen su propio reclamar y su
-- propio resultado, que solo guardan el voucher y NO registran venta ni mueven
-- dinero. Lo único que cambia del camino de cobro es un filtro de una línea en
-- `fn_terminal_cola_reclamar` para que NO se lleve los trabajos de diagnóstico.

-- 1) La cola distingue la operación. 'cobro' (por omisión) es lo de siempre;
--    'verificacion'/'cancelacion' son los diagnósticos de la matriz.
alter table public.terminal_cola
  add column if not exists operacion text not null default 'cobro';
alter table public.terminal_cola
  add constraint terminal_cola_operacion_check
  check (operacion in ('cobro','verificacion','cancelacion'));

-- 2) El reclamar de COBROS ahora ignora los diagnósticos (una línea nueva:
--    `and c.operacion = 'cobro'`). Todo lo demás es idéntico, así que los
--    cobros reales se comportan EXACTAMENTE igual que antes.
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
       and operacion = 'cobro'
       and (estado = 'en_cola' or (estado = 'reclamado' and claim_expires_at < now()))
     order by created_at
     limit greatest(1, coalesce(p_limite, 3))
     for update skip locked
  ) e
  where c.id = e.id
  returning c.id, c.monto, c.control_number;
end;
$$;

-- ------------------------------------------------------------------- Caja ---

-- Gerencia encola una VERIFICACIÓN de un número de control (el de una venta
-- real). monto = 0: la verificación no cobra, solo consulta. hay_terminal=false
-- si no hay terminal activa (la caja lo dice y no encola).
create or replace function public.fn_terminal_verificar_pedir(
  p_idempotency_key uuid,
  p_control_number text,
  p_autorizado_por uuid default null
) returns table(cobro_id uuid, estado text, control_number text, hay_terminal boolean)
 language plpgsql security definer set search_path to 'public'
as $$
declare
  v_prev public.terminal_cola;
  v_term uuid; v_suc uuid; v_id uuid;
  v_ctrl text := nullif(trim(p_control_number), '');
begin
  -- Gerencia: por sesión (fn_es_jefe) o por el PIN del gerente que autorizó
  -- (ModalAutorizacion devuelve su id; se re-verifica aquí, no solo en el cliente).
  if not (fn_es_jefe() or exists (
      select 1 from public.empleados e join public.roles r on r.id = e.rol_id
      where e.id = p_autorizado_por and e.activo and r.slug in ('administrador','gerente'))) then
    raise exception 'Solo gerencia puede correr la verificación' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'Falta idempotency_key'; end if;
  if v_ctrl is null then raise exception 'Falta el número de control a verificar'; end if;

  select * into v_prev from public.terminal_cola where idempotency_key = p_idempotency_key;
  if found then
    return query select v_prev.id, v_prev.estado, v_prev.control_number, true;
    return;
  end if;

  select id, sucursal_id into v_term, v_suc from public.terminales where activa limit 1;
  if v_term is null then
    return query select null::uuid, 'no_configurado'::text, ''::text, false;
    return;
  end if;

  insert into public.terminal_cola
    (idempotency_key, sucursal_id, terminal_id, operacion, monto, control_number)
  values
    (p_idempotency_key, v_suc, v_term, 'verificacion', 0, v_ctrl)
  returning id into v_id;

  return query select v_id, 'en_cola'::text, v_ctrl, true;
end;
$$;

-- Los cobros/operaciones recientes de la terminal, para que gerencia elija un
-- número de control a verificar (el de una venta real aprobada).
create or replace function public.fn_terminal_cobros_recientes(p_limite integer default 10)
 returns table(cobro_id uuid, operacion text, estado text, monto numeric, control_number text,
               folio integer, autorizacion text, created_at timestamptz)
 language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver los cobros' using errcode = '42501';
  end if;
  return query
  select c.id, c.operacion, c.estado, c.monto, c.control_number, c.folio,
         (c.voucher->>'autorizacion'), c.created_at
  from public.terminal_cola c
  order by c.created_at desc
  limit greatest(1, coalesce(p_limite, 10));
end;
$$;

-- ------------------------------------------------------------ Agente (PC) ---

-- El agente reclama los DIAGNÓSTICOS (verificación/cancelación) de su sucursal,
-- aparte de los cobros. Devuelve la operación y el control a consultar.
create or replace function public.fn_terminal_diag_reclamar(p_token uuid, p_agente text, p_limite integer default 3)
 returns table(cobro_id uuid, operacion text, monto numeric, control_number text,
               referencia text, autorizacion text)
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
    -- Se califican las columnas con alias `tc`: `operacion` es también un
    -- parámetro de salida de esta función (RETURNS TABLE), y sin calificar
    -- Postgres no sabe si es la columna o el parámetro («column reference
    -- "operacion" is ambiguous»).
    select tc.id from public.terminal_cola tc
     where tc.sucursal_id = v_suc
       and tc.operacion <> 'cobro'
       and (tc.estado = 'en_cola' or (tc.estado = 'reclamado' and tc.claim_expires_at < now()))
     order by tc.created_at
     limit greatest(1, coalesce(p_limite, 3))
     for update skip locked
  ) e
  where c.id = e.id
  returning c.id, c.operacion, c.monto, c.control_number,
            (c.voucher->>'referencia'), (c.voucher->>'autorizacion');
end;
$$;

-- El agente reporta el resultado de un diagnóstico. SOLO guarda el voucher y el
-- estado: no registra venta ni toca dinero. (El cobro real usa la otra función.)
create or replace function public.fn_terminal_diag_resultado(
  p_token uuid, p_cobro_id uuid, p_aprobado boolean,
  p_voucher jsonb default null, p_crudo jsonb default null,
  p_codigo text default null, p_texto text default null
) returns void
 language plpgsql security definer set search_path to 'public'
as $$
declare v_term uuid; v_suc uuid; c public.terminal_cola;
begin
  select id, sucursal_id into v_term, v_suc
    from public.terminales where agente_token = p_token and activa;
  if v_term is null then raise exception 'Token de terminal inválido o terminal inactiva'; end if;
  select * into c from public.terminal_cola where id = p_cobro_id;
  if c.id is null then raise exception 'Ese trabajo no existe'; end if;
  if c.sucursal_id <> v_suc then raise exception 'Ese trabajo es de otra sucursal'; end if;
  if c.operacion = 'cobro' then raise exception 'Un cobro se reporta con fn_terminal_cobro_resultado'; end if;

  update public.terminal_cola
     set estado = case when p_aprobado then 'aprobado'
                       when coalesce(p_codigo,'') = 'T' then 'sin_respuesta'
                       else 'rechazado' end,
         voucher = p_voucher, crudo = p_crudo, codigo = p_codigo, texto = p_texto, updated_at = now()
   where id = p_cobro_id;
end;
$$;

-- --------------------------------------------------------------- Permisos ---
-- Caja/Admin: con sesión del personal (el candado de rol va dentro).
revoke all on function public.fn_terminal_verificar_pedir(uuid, text, uuid) from public, anon;
grant execute on function public.fn_terminal_verificar_pedir(uuid, text, uuid) to authenticated, service_role;
revoke all on function public.fn_terminal_cobros_recientes(integer) from public, anon;
grant execute on function public.fn_terminal_cobros_recientes(integer) to authenticated, service_role;

-- Agente de la PC: identidad por TOKEN (llave publicable, sin sesión).
revoke all on function public.fn_terminal_diag_reclamar(uuid, text, integer) from public;
grant execute on function public.fn_terminal_diag_reclamar(uuid, text, integer) to anon, authenticated, service_role;
revoke all on function public.fn_terminal_diag_resultado(uuid, uuid, boolean, jsonb, jsonb, text, text) from public;
grant execute on function public.fn_terminal_diag_resultado(uuid, uuid, boolean, jsonb, jsonb, text, text) to anon, authenticated, service_role;

-- --------------------------------------------- Voucher de la verificación ---
-- Imprime (y así GUARDA, en trabajos_impresion) el voucher de una verificación
-- por la térmica, SIN orden (una verificación no es una venta). La sucursal y
-- la impresora salen de la terminal activa; devuelve null si no hay térmica
-- (la caja lo lee como «se ve en pantalla, no hay papel»). El voucher además
-- ya queda guardado en `terminal_cola.voucher`.
create or replace function public.fn_imprimir_voucher_diag(p_control text, p_voucher jsonb)
 returns uuid language plpgsql security definer set search_path to 'public'
as $fn$
declare v_printer uuid; v_suc uuid; v_id uuid; v_clave uuid; v_negocio jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede imprimir un voucher.' using errcode = '42501';
  end if;
  select sucursal_id into v_suc from public.terminales where activa limit 1;
  if v_suc is null then return null; end if;
  select i.id into v_printer from public.impresoras i
   where i.sucursal_id = v_suc and i.rol = 'tickets' and i.activa limit 1;
  if v_printer is null then return null; end if;
  v_clave := md5('voucher-diag:' || coalesce(nullif(trim(p_control),''), gen_random_uuid()::text))::uuid;
  v_negocio := fn_datos_del_ticket();
  insert into public.trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_printer, 'ticket',
    case when v_negocio is null then p_voucher else p_voucher || jsonb_build_object('negocio', v_negocio) end,
    v_clave)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.trabajos_impresion where idempotency_key = v_clave; end if;
  return v_id;
end;
$fn$;

revoke all on function public.fn_imprimir_voucher_diag(text, jsonb) from public, anon;
grant execute on function public.fn_imprimir_voucher_diag(text, jsonb) to authenticated, service_role;
