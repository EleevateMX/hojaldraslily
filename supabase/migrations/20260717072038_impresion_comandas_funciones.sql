create or replace function public.fn_encolar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payload jsonb;
  v_printer_id uuid;
  v_key uuid;
begin
  select p.id into v_printer_id from impresoras p where p.cocina_id = NEW.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', NEW.created_at,
    'cajero', e.nombre,
    'cliente', cl.nombre,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cantidad', ci.cantidad,
        'nombre', pr.nombre,
        'personalizacion', ci.personalizacion
      ) order by pr.nombre)
      from cocina_items ci left join productos pr on pr.id = ci.producto_id
      where ci.pedido_id = NEW.id
    ), '[]'::jsonb)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = NEW.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = NEW.orden_id;

  v_key := NEW.id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (NEW.orden_id, NEW.id, NEW.cocina_id, v_printer_id, 'comanda', v_payload, v_key)
  on conflict (idempotency_key) do nothing;

  return NEW;
end;
$function$;

drop trigger if exists trg_encolar_comanda on pedidos_cocina;
create trigger trg_encolar_comanda
  after insert on pedidos_cocina
  for each row execute function fn_encolar_comanda();

create or replace function public.fn_imprimir_reclamar_trabajos(
  p_token uuid, p_agente text, p_limite integer default 5
) returns setof trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  update impresoras set ultima_conexion = now() where id = v_printer_id;

  return query
  update trabajos_impresion t
  set estado = 'claimed', claimed_by = p_agente, claim_expires_at = now() + interval '2 minutes'
  from (
    select id from trabajos_impresion
    where printer_id = v_printer_id
      and (
        estado in ('pending', 'retry')
        or (estado in ('claimed', 'printing') and claim_expires_at < now())
      )
      and (next_retry_at is null or next_retry_at <= now())
    order by created_at
    limit p_limite
    for update skip locked
  ) elegibles
  where t.id = elegibles.id
  returning t.*;
end;
$function$;

create or replace function public.fn_imprimir_confirmar(p_token uuid, p_trabajo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  update trabajos_impresion
  set estado = 'printed', printed_at = now()
  where id = p_trabajo_id and printer_id = v_printer_id;

  update impresoras set ultima_impresion = now() where id = v_printer_id;
end;
$function$;

create or replace function public.fn_imprimir_fallar(p_token uuid, p_trabajo_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_printer_id uuid;
  v_trabajo trabajos_impresion;
  v_backoff interval;
begin
  select id into v_printer_id from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  select * into v_trabajo from trabajos_impresion where id = p_trabajo_id and printer_id = v_printer_id;
  if not found then
    return;
  end if;

  if v_trabajo.intentos + 1 >= v_trabajo.max_intentos then
    update trabajos_impresion
    set estado = 'failed', intentos = intentos + 1, error_ultimo = p_error, failed_at = now()
    where id = p_trabajo_id;
  else
    v_backoff := (30 * power(2, v_trabajo.intentos))::text || ' seconds';
    update trabajos_impresion
    set estado = 'retry', intentos = intentos + 1, error_ultimo = p_error,
        next_retry_at = now() + v_backoff
    where id = p_trabajo_id;
  end if;
end;
$function$;

create or replace function public.fn_imprimir_latido(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  update impresoras set ultima_conexion = now() where agente_token = p_token and activa;
end;
$function$;

create or replace function public.fn_imprimir_prueba(p_token uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
begin
  select * into v_impresora from impresoras where agente_token = p_token and activa;
  if not found then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'prueba', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end;
$function$;

create or replace function public.fn_imprimir_reimprimir(
  p_trabajo_id uuid, p_empleado_id uuid, p_motivo text default null, p_printer_id uuid default null
) returns trabajos_impresion
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_original trabajos_impresion;
  v_nuevo trabajos_impresion;
begin
  select * into v_original from trabajos_impresion where id = p_trabajo_id;
  if not found then
    raise exception 'Trabajo de impresión % no existe', p_trabajo_id;
  end if;

  insert into trabajos_impresion (
    orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload,
    copia_de, numero_copia, idempotency_key
  ) values (
    v_original.orden_id, v_original.pedido_id, v_original.estacion_id,
    coalesce(p_printer_id, v_original.printer_id), v_original.tipo_documento, v_original.payload,
    v_original.id,
    (select coalesce(max(numero_copia), v_original.numero_copia) + 1
       from trabajos_impresion where copia_de = v_original.id or id = v_original.id),
    gen_random_uuid()
  ) returning * into v_nuevo;

  insert into impresion_auditoria (trabajo_id, trabajo_original_id, empleado_id, motivo)
  values (v_nuevo.id, v_original.id, p_empleado_id, p_motivo);

  return v_nuevo;
end;
$function$;

create or replace function public.fn_imprimir_liberar_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n integer;
begin
  update trabajos_impresion
  set estado = 'retry', next_retry_at = now()
  where estado in ('claimed', 'printing') and claim_expires_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;