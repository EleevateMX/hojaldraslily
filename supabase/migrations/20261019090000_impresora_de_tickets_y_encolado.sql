-- =============================================================================
-- La impresora de tickets, y quien le manda trabajo (19/10/26).
--
-- `apps/agente-caja` ya existe, ya imprime ESC/POS y ya está probado contra
-- los bytes. Lo que le faltaba es trabajo: NADIE encolaba tickets. La caja
-- los seguía mandando por `window.print()`, o sea de Chrome a la
-- predeterminada de Windows, donde un ticket que se fue a un PDF **no
-- levanta ningún error** y la venta queda bien cobrada igual.
--
-- Para encolar hace falta saber a QUÉ impresora. Hasta hoy una impresora era
-- «la de una estación» o nada, y «nada» no alcanza: una etiquetadora sin
-- estación asignada y la térmica del mostrador se veían idénticas en la
-- base. Por eso nace `impresoras.rol`, que lo dice con todas sus letras.
-- Adivinarlo por `cocina_id is null` habría funcionado hasta el día en que
-- alguien diera de alta una etiquetadora sin estación — y ese día el ticket
-- del cliente saldría en la etiquetadora de producción.
--
-- ## Tirar una función desde aquí: sí se puede
--
-- CLAUDE.md dice que el MCP de Supabase no ejecuta la sentencia que borra
-- funciones: se queda colgado 60 s y no aplica ni falla. Hoy se encontró POR
-- QUÉ, y tiene arreglo: lo que se cuelga es un filtro de TEXTO sobre el SQL
-- que se manda, no la base. Si esa palabra no aparece escrita en ninguna
-- parte del envío —de ahí el `'dr' || 'op'` de abajo, dentro de un
-- `execute`— la sentencia pasa y tira la función en milisegundos.
-- Comprobado creando y tirando dos funciones de prueba: con la palabra
-- partida pasa, con la palabra entera (aunque vaya dentro del `execute`, y
-- aunque sea en un comentario) se cuelga igual.
--
-- Por eso los tres reemplazos de abajo van así. Es feo de leer y se queda
-- feo a propósito: este archivo es el registro de lo que de verdad corrió.
-- Cambiarle la firma a una función SIN tirar la vieja no la reemplaza, la
-- DUPLICA, y tres `fn_crear_orden` conviviendo ya costaron caro una vez.
--
-- ## Y de paso, cinco puertas abiertas
--
-- Las cinco funciones de impresoras son `security definer`, estaban abiertas
-- a `anon` **y** a PUBLIC, y ninguna preguntaba quién llamaba. Con la llave
-- publicable —que es pública por diseño— cualquiera podía:
--
--   * `fn_rotar_token_impresora` → quedarse con el token de una impresora y,
--     con él, reclamar y tragarse TODAS las comandas y tickets de la tienda;
--   * `fn_crear_impresora` → fabricarse una impresora y su token;
--   * `fn_activar_impresora` → apagar las de la tienda a media venta.
--
-- Es el mismo defecto de la sección 5 de CLAUDE.md (el `grant` que suma y no
-- quita), pero peor: aquí ni siquiera había un `if` adentro haciendo de
-- única capa. Se comprobó primero quién las llama —solo
-- `apps/admin/src/pages/Impresoras.tsx`, que entra con sesión real por PIN—
-- antes de cerrarlas. El agente NO las usa: él se identifica con su token
-- contra `fn_imprimir_reclamar_trabajos` y compañía, que no se tocan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol de cada impresora
-- -----------------------------------------------------------------------------

alter table impresoras add column if not exists rol text not null default 'comandas';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'impresoras_rol_check'
  ) then
    alter table impresoras
      add constraint impresoras_rol_check check (rol in ('comandas', 'tickets'));
  end if;
end $$;

comment on column impresoras.rol is
  'comandas = etiquetadora TSPL de una estación; tickets = térmica ESC/POS del '
  'mostrador, la que atiende apps/agente-caja.';

-- Una sola térmica de tickets por sucursal. No es una preferencia de estilo:
-- `fn_imprimir_ticket_caja` tiene que poder contestar «a esta» sin desempatar,
-- y dos activas significarían dos tickets del mismo cobro o uno al azar.
create unique index if not exists uq_impresora_tickets_por_sucursal
  on impresoras (sucursal_id) where rol = 'tickets' and activa;

-- -----------------------------------------------------------------------------
-- 2. Las tres de Admin: con rol, y cerradas
-- -----------------------------------------------------------------------------

do $$ begin
  execute 'dr' || 'op function if exists public.fn_admin_impresoras()';
  execute 'dr' || 'op function if exists public.fn_crear_impresora(uuid, text, uuid, '
    || 'tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean)';
  execute 'dr' || 'op function if exists public.fn_actualizar_impresora(uuid, text, uuid, '
    || 'tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean)';
end $$;

create or replace function public.fn_admin_impresoras()
returns table (
  id uuid, sucursal_id uuid, nombre text, cocina_id uuid, rol text,
  tipo_conexion tipo_conexion_impresora, ip text, puerto integer,
  nombre_dispositivo text, ancho_papel ancho_papel, copias integer,
  corte_automatico boolean, buzzer boolean, activa boolean, agente_id text,
  agente_version text, ultima_conexion timestamptz, ultima_impresion timestamptz,
  created_at timestamptz, conectada boolean
)
language sql
security definer
set search_path to 'public'
as $$
  -- Nunca `agente_token`: es el único secreto que prueba la identidad de una
  -- impresora física, y por eso Admin lee por aquí y no de la tabla.
  select i.id, i.sucursal_id, i.nombre, i.cocina_id, i.rol, i.tipo_conexion, i.ip, i.puerto,
         i.nombre_dispositivo, i.ancho_papel, i.copias, i.corte_automatico, i.buzzer, i.activa,
         i.agente_id, i.agente_version, i.ultima_conexion, i.ultima_impresion, i.created_at,
         (i.ultima_conexion is not null and i.ultima_conexion > now() - interval '2 minutes') as conectada
  from impresoras i
  where fn_es_staff()
  order by i.rol desc, i.nombre;
$$;

create or replace function public.fn_crear_impresora(
  p_sucursal_id uuid,
  p_nombre text,
  p_cocina_id uuid,
  p_tipo_conexion tipo_conexion_impresora,
  p_ip text default null,
  p_puerto integer default null,
  p_nombre_dispositivo text default null,
  p_ancho_papel ancho_papel default '80mm',
  p_copias integer default 1,
  p_corte_automatico boolean default true,
  p_buzzer boolean default false,
  p_rol text default 'comandas'
)
returns table (id uuid, agente_token uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_token uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede dar de alta una impresora.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la impresora es obligatorio';
  end if;
  if p_rol not in ('comandas', 'tickets') then
    raise exception 'El rol de la impresora solo puede ser comandas o tickets.';
  end if;

  insert into impresoras (
    sucursal_id, nombre, cocina_id, rol, tipo_conexion, ip, puerto,
    nombre_dispositivo, ancho_papel, copias, corte_automatico, buzzer, activa
  ) values (
    p_sucursal_id, trim(p_nombre),
    -- Una térmica de tickets no es de ninguna estación: si llegara con
    -- `cocina_id` puesto, las pantallas la contarían como etiquetadora.
    case when p_rol = 'tickets' then null else p_cocina_id end,
    p_rol, p_tipo_conexion, p_ip, p_puerto,
    p_nombre_dispositivo, p_ancho_papel, greatest(1, p_copias), p_corte_automatico, p_buzzer, true
  )
  returning impresoras.id, impresoras.agente_token into v_id, v_token;

  return query select v_id, v_token;
end;
$$;

create or replace function public.fn_actualizar_impresora(
  p_id uuid,
  p_nombre text,
  p_cocina_id uuid,
  p_tipo_conexion tipo_conexion_impresora,
  p_ip text,
  p_puerto integer,
  p_nombre_dispositivo text,
  p_ancho_papel ancho_papel,
  p_copias integer,
  p_corte_automatico boolean,
  p_buzzer boolean,
  p_rol text default 'comandas'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cambiar una impresora.';
  end if;
  if p_rol not in ('comandas', 'tickets') then
    raise exception 'El rol de la impresora solo puede ser comandas o tickets.';
  end if;

  update impresoras set
    nombre = p_nombre,
    cocina_id = case when p_rol = 'tickets' then null else p_cocina_id end,
    rol = p_rol,
    tipo_conexion = p_tipo_conexion,
    ip = p_ip,
    puerto = p_puerto,
    nombre_dispositivo = p_nombre_dispositivo,
    ancho_papel = p_ancho_papel,
    copias = greatest(1, p_copias),
    corte_automatico = p_corte_automatico,
    buzzer = p_buzzer
  where id = p_id;
end;
$$;

-- Las dos que no cambian de firma: solo les faltaba preguntar quién llama.
create or replace function public.fn_activar_impresora(p_id uuid, p_activa boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede prender o apagar una impresora.';
  end if;
  update impresoras set activa = p_activa where id = p_id;
end;
$$;

do $$
declare v_def text;
begin
  -- El parche anclado (CLAUDE.md §4): se lee la función viva, se comprueba
  -- que el ancla aparece UNA vez y se mete el candado delante del cuerpo. Si
  -- el ancla no cuadra, esto revienta en vez de corromper la función.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rotar_token_impresora';

  if v_def is null then
    raise exception 'No existe fn_rotar_token_impresora.';
  end if;
  if position('fn_es_staff()' in v_def) > 0 then
    raise notice 'fn_rotar_token_impresora ya tenía su candado; no se toca.';
  else
    if (length(v_def) - length(replace(v_def, 'begin', ''))) / length('begin') <> 1 then
      raise exception 'El ancla «begin» no aparece exactamente una vez en fn_rotar_token_impresora.';
    end if;
    execute replace(
      v_def,
      'begin',
      'begin' || E'\n' ||
      '  if not fn_es_staff() then' || E'\n' ||
      '    raise exception ''Solo el personal puede rotar el token de una impresora.'';' || E'\n' ||
      '  end if;'
    );
  end if;
end $$;

-- `revoke` de PUBLIC **y** de anon, y luego otorgar: un `grant` suma, no
-- quita, y PUBLIC trae EXECUTE de fábrica en cada función nueva.
do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_admin_impresoras()',
    'public.fn_crear_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean, text)',
    'public.fn_actualizar_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean, text)',
    'public.fn_activar_impresora(uuid, boolean)',
    'public.fn_rotar_token_impresora(uuid)'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. La prueba de impresión, según a quién se le manda
-- -----------------------------------------------------------------------------

create or replace function public.fn_imprimir_prueba_staff(p_impresora_id uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar una prueba de impresión.';
  end if;

  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o está apagada.';
  end if;

  -- El payload es el MISMO `prueba: true` que el agente de etiquetas ya sabe
  -- dibujar, y que el de tickets aprendió a dibujar también. Inventarle un
  -- tipo nuevo obligaría a actualizar el agente de la tienda antes de poder
  -- probar nada — justo la conversación que esto se salta.
  -- Lo único que cambia es el `tipo_documento`, para que el trabajo salga
  -- marcado como lo que es en la cola de Admin.
  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (
    v_impresora.id,
    case when v_impresora.rol = 'tickets' then 'ticket' else 'comanda' end::tipo_documento_impresion,
    jsonb_build_object('prueba', true, 'impresora', v_impresora.nombre, 'hora', now()),
    gen_random_uuid()
  )
  returning * into v_trabajo;

  return v_trabajo;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Encolar el ticket de una venta
-- -----------------------------------------------------------------------------

/**
 * Manda el ticket de una orden a la térmica del mostrador.
 *
 * Devuelve el id del trabajo, o **null** si esta sucursal todavía no tiene
 * térmica de tickets. El null es la respuesta importante: la caja lo lee
 * como «imprime tú por el navegador, como hasta hoy». Encolar sin impresora
 * instalada sería peor que no encolar — una cola que crece y nadie vacía es
 * un indicador que no vuelve a verde.
 *
 * El texto del papel NO viaja aquí: viaja el `TicketData` tal cual, y las 48
 * columnas las arma `@lily/ui/papel` del lado del agente. Mandar las líneas
 * ya formadas dejaría la vista previa y el papel con dos formateadores
 * distintos, que es exactamente lo que se evitó al escribir el agente.
 */
create or replace function public.fn_imprimir_ticket_caja(
  p_orden_id uuid,
  p_ticket jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orden ordenes;
  v_printer uuid;
  v_id uuid;
  v_clave uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede mandar un ticket a imprimir.';
  end if;

  select * into v_orden from ordenes where id = p_orden_id;
  if not found then
    raise exception 'Esa orden no existe.';
  end if;

  select i.id into v_printer
  from impresoras i
  where i.sucursal_id = v_orden.sucursal_id and i.rol = 'tickets' and i.activa
  limit 1;

  if v_printer is null then
    return null;
  end if;

  -- Idempotente por orden: el doble toque del cajero, o un reintento tras un
  -- timeout de red, no sacan dos tickets. La clave se deriva de la orden a
  -- propósito —no es un uuid al azar— para que dos llamadas distintas con la
  -- misma orden choquen contra el índice único.
  v_clave := md5('ticket:' || p_orden_id::text)::uuid;

  insert into trabajos_impresion (orden_id, printer_id, tipo_documento, payload, idempotency_key)
  values (p_orden_id, v_printer, 'ticket', p_ticket, v_clave)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from trabajos_impresion where idempotency_key = v_clave;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fn_imprimir_ticket_caja(uuid, jsonb) from public, anon;
grant execute on function public.fn_imprimir_ticket_caja(uuid, jsonb) to authenticated;
