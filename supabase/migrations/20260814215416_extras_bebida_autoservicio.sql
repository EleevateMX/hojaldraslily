-- ============================================================================
-- Autoservicio de extras de shakes (leches, proteinas, agua) desde Admin
-- ============================================================================
-- El sintoma que motiva esto: alguien creo "Leche Entera" DOS VECES desde
-- Admin -> Menu y nunca aparecio en el kiosko. Le faltaban es_extra=true y
-- los vinculos en producto_extras — y esa tabla esta cerrada a escritura
-- directa (a proposito). No habia ninguna via de autoservicio.
--
-- fn_guardar_extra no sirve aqui: exige un insumo de receta, y las leches y
-- proteinas de shake se ofrecen sin insumo (no descuentan inventario hoy).
-- ============================================================================

create or replace function fn_extra_bebida_guardar(
  p_nombre  text,
  p_precio  numeric default 0,
  p_aplicar text default 'shakes'   -- 'shakes' = todos los shakes activos | 'clasico' = solo El Clasico
) returns productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat uuid;
  v_row productos;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del extra es obligatorio.';
  end if;
  if p_aplicar not in ('shakes', 'clasico') then
    raise exception 'p_aplicar debe ser ''shakes'' o ''clasico'', llego: %', p_aplicar;
  end if;

  select id into v_cat from categorias where nombre = 'Extras Bebidas';
  if v_cat is null then
    insert into categorias (nombre, cocina_id, orden)
    values ('Extras Bebidas', (select id from cocinas where slug='bebidas'), 999)
    returning id into v_cat;
  end if;

  -- Reusar si ya existe (aunque haya quedado a medias, como las dos
  -- "Leche Entera"): mismo nombre = mismo extra, se repara en vez de duplicar.
  select * into v_row from productos
   where lower(trim(nombre)) = lower(trim(p_nombre))
     and (es_extra or categoria_id = v_cat)
   order by es_extra desc, activo desc
   limit 1;

  if found then
    update productos
       set es_extra = true, activo = true, precio = coalesce(p_precio, 0), categoria_id = v_cat
     where id = v_row.id
    returning * into v_row;
  else
    insert into productos (nombre, precio, categoria_id, es_extra, es_reventa, activo, iva_incluido)
    values (trim(p_nombre), coalesce(p_precio, 0), v_cat, true, false, true, true)
    returning * into v_row;
  end if;

  if p_aplicar = 'clasico' then
    insert into producto_extras (producto_id, extra_id)
    select p.id, v_row.id from productos p
     where lower(p.nombre) in ('el clásico', 'el clasico') and p.activo
    on conflict do nothing;
  else
    insert into producto_extras (producto_id, extra_id)
    select p.id, v_row.id
      from productos p join categorias c on c.id = p.categoria_id
     where c.nombre = 'Shakes' and p.activo and not p.es_extra
    on conflict do nothing;
  end if;

  return v_row;
end;
$$;

-- Prender/apagar un extra al momento ("ya no tenemos ese sabor").
-- Apagado desaparece del kiosko en la siguiente carga; los vinculos se
-- conservan, asi que volver a prenderlo lo deja como estaba.
create or replace function fn_extra_bebida_activar(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update productos set activo = p_activo where id = p_id and es_extra;
  if not found then
    raise exception 'El extra no existe.';
  end if;
end;
$$;

-- Cuantos productos ofrecen cada extra (para la lista del Admin, que incluye
-- los apagados; la vista vw_producto_extras solo trae activos).
create or replace function fn_extras_bebida_admin()
returns table (
  id uuid, nombre text, precio numeric, activo boolean, ligado_a bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.precio, p.activo,
         (select count(*) from producto_extras pe where pe.extra_id = p.id)
    from productos p
    join categorias c on c.id = p.categoria_id
   where p.es_extra and c.nombre = 'Extras Bebidas'
   order by p.nombre;
$$;

revoke execute on function fn_extra_bebida_guardar(text, numeric, text) from public;
revoke execute on function fn_extra_bebida_activar(uuid, boolean) from public;
revoke execute on function fn_extras_bebida_admin() from public;
grant execute on function fn_extra_bebida_guardar(text, numeric, text) to anon, authenticated;
grant execute on function fn_extra_bebida_activar(uuid, boolean) to anon, authenticated;
grant execute on function fn_extras_bebida_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datos: lo que pidio la sucursal, ya reparado con las funciones de arriba
-- ---------------------------------------------------------------------------
-- Leche Entera repara el producto que ya intentaron crear; las leches van a
-- TODOS los shakes activos (tambien los 14 que el sync agrego despues y se
-- quedaron sin selector de leche); el agua solo a El Clasico.
select fn_extra_bebida_guardar('Leche Entera', 0, 'shakes');
select fn_extra_bebida_guardar('Leche deslactosada light', 0, 'shakes');
select fn_extra_bebida_guardar('Leche de almendras', 0, 'shakes');
select fn_extra_bebida_guardar('Leche de avena', 0, 'shakes');
select fn_extra_bebida_guardar('Leche de coco', 0, 'shakes');
select fn_extra_bebida_guardar('Leche deslactosada', 0, 'shakes');
select fn_extra_bebida_guardar('Agua', 0, 'clasico');

-- Las categorias nuevas del menu. Sin productos no aparecen en el kiosko
-- (los chips salen de los productos), asi que crearlas ya es inofensivo:
-- en cuanto Admin les cuelgue el primer producto, aparecen solas.
insert into categorias (nombre, cocina_id, orden)
select v.nombre, (select id from cocinas where slug='bebidas'), 
       (select coalesce(max(orden),0) from categorias) + v.n
from (values
  ('Collagen Drinks', 1),
  ('Amino Refreshers', 2),
  ('Hydration Drinks', 3),
  ('Café', 4),
  ('Tés', 5),
  ('Kombuchas', 6)
) v(nombre, n)
where not exists (select 1 from categorias c where lower(c.nombre) = lower(v.nombre));