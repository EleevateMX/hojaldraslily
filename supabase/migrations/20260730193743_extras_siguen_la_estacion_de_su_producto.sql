-- Un extra debe prepararse donde se prepara el producto que acompaña.
--
-- El servidor rutea las comandas por `categorias.cocina_id` del producto
-- (fn_crear_pedidos_cocina). Como TODOS los extras vivían en una sola
-- categoría "Extras" atada a Alimentos, la leche de almendras de un shake se
-- imprimía en la cocina de comida y el de la barra nunca se enteraba de que
-- ese shake llevaba otra leche.
--
-- La solución no es tocar el trigger —rutear por categoría está bien— sino
-- tener una categoría de extras POR ESTACIÓN, y que `fn_guardar_extra`
-- coloque cada extra en la que corresponde al producto al que se engancha.
--
-- Como efecto secundario deseable, un mismo insumo puede ser extra en las dos
-- estaciones (chía en un shake y en una ensalada) y cada uno rutea a su lado:
-- son dos productos extra distintos, uno por categoría.

insert into categorias (nombre, cocina_id, activa)
select 'Extras Bebidas', (select id from cocinas where slug = 'bebidas'), true
where not exists (select 1 from categorias where nombre = 'Extras Bebidas');

create or replace function fn_guardar_extra(
  p_producto_id uuid, p_insumo_id uuid, p_nombre text, p_precio numeric,
  p_cantidad numeric default null::numeric
) returns productos
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_extra   productos;
  v_cocina  uuid;
  v_cat     uuid;
  v_cant    numeric;
begin
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio del extra no puede ser negativo';
  end if;

  -- Estación del producto que acompaña: el extra se prepara con él.
  select c.cocina_id into v_cocina
  from productos p join categorias c on c.id = p.categoria_id
  where p.id = p_producto_id;

  -- Categoría de extras de ESA estación.
  select id into v_cat from categorias
  where cocina_id is not distinct from v_cocina and nombre like 'Extras%'
  limit 1;
  if v_cat is null then
    select id into v_cat from categorias where nombre = 'Extras';
  end if;

  v_cant := coalesce(p_cantidad,
    (select cantidad from recetas where producto_id = p_producto_id and insumo_id = p_insumo_id),
    0);

  -- Se reutiliza el extra de ese insumo SOLO si ya está en la categoría
  -- correcta; si no, se crea el de esta estación.
  select p.* into v_extra
  from productos p
  join recetas r on r.producto_id = p.id and r.insumo_id = p_insumo_id
  where p.es_extra = true and p.categoria_id = v_cat
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

-- Mover los extras que hoy están mal ruteados: los que SOLO se ofrecen en
-- productos de la barra pasan a la categoría de barra.
update productos e
set categoria_id = (select id from categorias where nombre = 'Extras Bebidas')
where e.es_extra
  and exists (select 1 from producto_extras pe where pe.extra_id = e.id)
  and not exists (
    select 1 from producto_extras pe
    join productos p on p.id = pe.producto_id
    join categorias c on c.id = p.categoria_id
    where pe.extra_id = e.id
      and c.cocina_id is distinct from (select id from cocinas where slug = 'bebidas')
  );