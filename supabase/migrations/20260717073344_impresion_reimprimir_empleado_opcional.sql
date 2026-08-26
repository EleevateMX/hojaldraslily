create or replace function public.fn_imprimir_reimprimir(
  p_trabajo_id uuid, p_empleado_id uuid default null, p_motivo text default null, p_printer_id uuid default null
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