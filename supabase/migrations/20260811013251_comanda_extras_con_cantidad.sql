-- La cantidad del extra es el TOTAL de la linea, pero cada etiqueta es de UN
-- vaso. Formatearla aqui como texto ("2x Galletas") obliga a quien imprime a
-- repetir ese total en cada etiqueta: dos shakes con una promo cada uno
-- salian con "+2X 2 GALLETAS" en los dos, que se lee como cuatro galletas por
-- vaso.
--
-- Se manda el numero aparte y que lo reparta quien sabe cuantas etiquetas va
-- a sacar. El dato viaja completo; la presentacion se decide donde se conoce
-- el contexto.
create or replace function fn_items_comanda(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'cantidad',        ci.cantidad,
      'nombre',          pr.nombre,
      'personalizacion', ci.personalizacion,
      'extras', coalesce((
        select jsonb_agg(
          jsonb_build_object('nombre', ph.nombre, 'cantidad', h.cantidad)
          order by ph.nombre
        )
        from cocina_items h
        join orden_items oh on oh.id = h.orden_item_id
        left join productos ph on ph.id = h.producto_id
        where h.pedido_id = ci.pedido_id
          and oh.padre_item_id = ci.orden_item_id
      ), '[]'::jsonb)
    ) as x
    from cocina_items ci
    join orden_items oi on oi.id = ci.orden_item_id
    left join productos pr on pr.id = ci.producto_id
    where ci.pedido_id = p_pedido_id
      and (
        oi.padre_item_id is null
        or not exists (
          select 1 from cocina_items padre
          where padre.pedido_id = ci.pedido_id
            and padre.orden_item_id = oi.padre_item_id
        )
      )
  ) t;
$$;

revoke execute on function fn_items_comanda(uuid) from public, anon, authenticated;