create or replace function public.fn_encolar_comanda_para_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payload jsonb;
  v_printer_id uuid;
  v_pedido pedidos_cocina;
begin
  select * into v_pedido from pedidos_cocina where id = p_pedido_id;
  if not found then
    return;
  end if;

  select p.id into v_printer_id from impresoras p where p.cocina_id = v_pedido.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', v_pedido.created_at,
    'cajero', e.nombre,
    'cliente', cl.nombre,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cantidad', ci.cantidad,
        'nombre', pr.nombre,
        'personalizacion', ci.personalizacion
      ) order by pr.nombre)
      from cocina_items ci left join productos pr on pr.id = ci.producto_id
      where ci.pedido_id = v_pedido.id
    ), '[]'::jsonb)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = v_pedido.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = v_pedido.orden_id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (v_pedido.orden_id, v_pedido.id, v_pedido.cocina_id, v_printer_id, 'comanda', v_payload, v_pedido.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
end;
$function$;

create or replace function public.fn_encolar_comandas_desde_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_pedido_id uuid;
begin
  for v_pedido_id in select distinct pedido_id from nuevos_items loop
    perform fn_encolar_comanda_para_pedido(v_pedido_id);
  end loop;
  return null;
end;
$function$;

drop trigger if exists trg_encolar_comanda on pedidos_cocina;
drop trigger if exists trg_encolar_comandas_desde_items on cocina_items;
create trigger trg_encolar_comandas_desde_items
  after insert on cocina_items
  referencing new table as nuevos_items
  for each statement
  execute function fn_encolar_comandas_desde_items();