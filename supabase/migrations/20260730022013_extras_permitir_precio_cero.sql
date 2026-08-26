-- Un extra en $0 debe verse igual.
--
-- La regla anterior era `activo = (p_precio > 0)`, heredada de los productos
-- de reventa: un producto sin precio no se puede vender, así que se apaga.
-- Para un extra la lógica es otra: el tipo de leche o "sin aderezo" son
-- MODIFICADORES, no productos. Valen $0 y aun así la cocina tiene que verlos
-- impresos en la comanda para preparar bien el pedido.
--
-- Con la regla vieja, poner un extra en $0 lo desaparecía de la pantalla del
-- cajero, que es justo cuando más se necesita verlo.
--
-- Para dejar de ofrecer un extra en un producto está `fn_quitar_extra`, que
-- es explícito; el precio ya no decide la visibilidad.
create or replace function fn_guardar_extra(
  p_producto_id uuid, p_insumo_id uuid, p_nombre text, p_precio numeric,
  p_cantidad numeric default null::numeric
) returns productos
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_extra productos;
  v_cat uuid;
  v_cant numeric;
begin
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio del extra no puede ser negativo';
  end if;
  select id into v_cat from categorias where nombre = 'Extras';

  v_cant := coalesce(p_cantidad,
    (select cantidad from recetas where producto_id = p_producto_id and insumo_id = p_insumo_id),
    0);

  select p.* into v_extra
  from productos p
  join recetas r on r.producto_id = p.id and r.insumo_id = p_insumo_id
  where p.es_extra = true
  limit 1;

  if found then
    update productos set
      nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
      precio = p_precio,
      activo = true
    where id = v_extra.id
    returning * into v_extra;
    update recetas set cantidad = v_cant
    where producto_id = v_extra.id and insumo_id = p_insumo_id;
  else
    insert into productos (nombre, precio, iva_incluido, es_reventa, es_extra, activo, categoria_id)
    values (
      coalesce(nullif(trim(p_nombre), ''), 'Extra ' || (select nombre from insumos where id = p_insumo_id)),
      p_precio, true, false, true, true, v_cat
    )
    returning * into v_extra;
    insert into recetas (producto_id, insumo_id, cantidad, nota)
    values (v_extra.id, p_insumo_id, v_cant, 'extra');
  end if;

  insert into producto_extras (producto_id, extra_id)
  values (p_producto_id, v_extra.id)
  on conflict do nothing;

  return v_extra;
end;
$function$;

revoke execute on function fn_guardar_extra(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant  execute on function fn_guardar_extra(uuid, uuid, text, numeric, numeric) to anon, authenticated;