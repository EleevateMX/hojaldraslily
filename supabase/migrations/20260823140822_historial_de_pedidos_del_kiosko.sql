-- Historial de pedidos para el kiosko: los últimos N pedidos pagados con
-- nombre, hora y renglones (extras anidados bajo su producto padre).
--
-- Es una RPC y no un SELECT del cliente por dos razones:
--   · El kiosko puede estar como anon y las tablas de órdenes no deben
--     quedar abiertas de par en par para eso.
--   · Devuelve SOLO los campos que la pantalla necesita (nada de pagos,
--     clientes de lealtad ni ids internos), con tope duro de 10.
create or replace function public.fn_historial_pedidos(p_limite integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'folio')::bigint desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'folio', o.folio,
      'nombre', nullif(trim(coalesce(o.nombre_cliente, '')), ''),
      'total', o.total,
      'hora', to_char(o.created_at at time zone 'America/Merida', 'HH24:MI'),
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cantidad', oi.cantidad,
          'nombre', coalesce(pr.nombre, '(producto)'),
          'personalizacion', oi.personalizacion,
          'extras', (
            select coalesce(jsonb_agg(
              jsonb_build_object('nombre', coalesce(ph.nombre, '(extra)'), 'cantidad', h.cantidad)
              order by ph.nombre), '[]'::jsonb)
            from orden_items h
            left join productos ph on ph.id = h.producto_id
            where h.orden_id = o.id and h.padre_item_id = oi.id
          )
        ) order by pr.nombre), '[]'::jsonb)
        from orden_items oi
        left join productos pr on pr.id = oi.producto_id
        where oi.orden_id = o.id and oi.padre_item_id is null
      )
    ) as x
    from ordenes o
    where o.pagado and not o.es_demo
    order by o.folio desc
    limit greatest(1, least(coalesce(p_limite, 5), 10))
  ) t;
$$;

revoke all on function public.fn_historial_pedidos(integer) from public;
grant execute on function public.fn_historial_pedidos(integer) to anon, authenticated, service_role;