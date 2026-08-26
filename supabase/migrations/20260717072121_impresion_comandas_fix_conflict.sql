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
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return NEW;
end;
$function$;