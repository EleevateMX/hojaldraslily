-- ============================================================================
-- La categoria viaja con el costeo
-- ============================================================================
-- Costeo (app_data.data) es la fuente de verdad del catalogo, pero no sabia
-- de categorias: Admin movia productos y el JSON de costeo se quedaba como
-- estaba — dos mundos. Ahora:
--
--   · Mover en Admin escribe `categoria` DENTRO del item del JSON de costeo
--     (fn_producto_mover_categoria). La pagina de costeo conserva campos que
--     no conoce, asi que el dato sobrevive a sus guardados.
--   · La sincronizacion respeta `categoria` del JSON si viene (al crear Y al
--     actualizar), y si no viene, deja la actual — nunca regresa nada a
--     Shakes por su cuenta.
--
-- Con esto un producto NUEVO capturado en costeo puede nacer ya en su
-- categoria, y un movimiento hecho en Admin queda escrito en la base de la
-- que se arma todo.
-- ============================================================================

create or replace function fn_producto_mover_categoria(p_producto_id uuid, p_categoria_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre   text;
  v_es_extra boolean;
  v_cat      text;
  v_llave    text;
begin
  select nombre, es_extra into v_nombre, v_es_extra from productos where id = p_producto_id;
  if not found then
    raise exception 'El producto no existe.';
  end if;
  if p_categoria_id is not null then
    select nombre into v_cat from categorias where id = p_categoria_id;
    if v_cat is null then
      raise exception 'La categoría no existe.';
    end if;
  end if;

  update productos set categoria_id = p_categoria_id where id = p_producto_id;

  -- Los extras no viven en los arreglos de costeo: solo se mueve el producto.
  if v_es_extra then
    return;
  end if;

  foreach v_llave in array array['shakeRecipes','foodRecipes','bebidas','snacks'] loop
    update app_data ad
       set data = jsonb_set(ad.data, array[v_llave], (
         select jsonb_agg(
           case when lower(trim(x->>'nombre')) = lower(trim(v_nombre))
                then case when v_cat is null then x - 'categoria'
                          else x || jsonb_build_object('categoria', v_cat) end
                else x end)
           from jsonb_array_elements(ad.data->v_llave) x
       ))
     where jsonb_typeof(ad.data->v_llave) = 'array'
       and exists (
         select 1 from jsonb_array_elements(ad.data->v_llave) x
         where lower(trim(x->>'nombre')) = lower(trim(v_nombre))
       );
  end loop;
end;
$$;

revoke execute on function fn_producto_mover_categoria(uuid, uuid) from public;
grant execute on function fn_producto_mover_categoria(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- fn_sync_app_data: respeta `categoria` del JSON, en alta y en actualizacion
-- ---------------------------------------------------------------------------
create or replace function fn_sync_app_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  drop table if exists _ins;
  create temp table _ins on commit drop as
  with cand as (
    select * from (
      select 1 ord, trim(x->>'marca')||' - '||trim(x->>'sabor') nombre,'proteina'::tipo_insumo tipo,'scoop' unidad,
        coalesce(nullif(x->>'scoops','')::numeric,0) contenido,coalesce(nullif(x->>'costo','')::numeric,0) costo_compra,
        nullif(x->>'marca','') marca,nullif(x->>'proveedor','') proveedor,nullif(x->>'codigo','') codigo,nullif(x->>'codigoBarras','') codigo_barras,nullif(x->>'pres','') presentacion
      from app_data, jsonb_array_elements(data->'proteins') x where coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>''
      union all select 2,trim(x->>'nombre'),'shake',coalesce(nullif(x->>'unidad',''),'g'),coalesce(nullif(x->>'cont','')::numeric,0),coalesce(nullif(x->>'costo','')::numeric,0),
        nullif(x->>'marca',''),nullif(x->>'proveedor',''),nullif(x->>'codigo',''),nullif(x->>'codigoBarras',''),nullif(x->>'presCompra','')
      from app_data, jsonb_array_elements(data->'shakeIngs') x where coalesce(trim(x->>'nombre'),'')<>''
      union all select 3,trim(x->>'nombre'),'alimento',coalesce(nullif(x->>'unidad',''),'g'),coalesce(nullif(x->>'cont','')::numeric,0),coalesce(nullif(x->>'costo','')::numeric,0),
        nullif(x->>'marca',''),nullif(x->>'proveedor',''),nullif(x->>'codigo',''),nullif(x->>'codigoBarras',''),nullif(x->>'presCompra','')
      from app_data, jsonb_array_elements(data->'foodIngs') x where coalesce(trim(x->>'nombre'),'')<>''
      union all select 4,trim(x->>'nombre'),'empaque','pza',1,coalesce(nullif(x->>'costo','')::numeric,0),
        nullif(x->>'marca',''),nullif(x->>'proveedor',''),nullif(x->>'codigo',''),nullif(x->>'codigoBarras',''),nullif(x->>'presentacion','')
      from app_data, jsonb_array_elements(data->'empaque') x where coalesce(trim(x->>'nombre'),'')<>''
      union all select 5,trim(x->>'nombre'),'reventa','pza',1,
        coalesce(nullif(x->>'costo','')::numeric, case when coalesce(nullif(x->>'equivPiezas','')::numeric,0)>0 then nullif(x->>'costoCaja','')::numeric/nullif(x->>'equivPiezas','')::numeric else 0 end),
        nullif(x->>'marca',''),nullif(x->>'proveedor',''),nullif(x->>'codigo',''),nullif(x->>'codigoBarras',''),nullif(x->>'presOriginal','')
      from app_data, jsonb_array_elements(data->'bebidas') x where coalesce(trim(x->>'nombre'),'')<>''
      union all select 6,trim(x->>'nombre'),'reventa','pza',1,
        coalesce(nullif(x->>'costo','')::numeric, case when coalesce(nullif(x->>'equivPiezas','')::numeric,0)>0 then nullif(x->>'costoCaja','')::numeric/nullif(x->>'equivPiezas','')::numeric else 0 end),
        nullif(x->>'marca',''),nullif(x->>'proveedor',''),nullif(x->>'codigo',''),nullif(x->>'codigoBarras',''),nullif(x->>'presOriginal','')
      from app_data, jsonb_array_elements(data->'snacks') x where coalesce(trim(x->>'nombre'),'')<>''
    ) u
  ) select distinct on (lower(nombre)) * from cand order by lower(nombre), ord;

  update insumos i set costo_compra=d.costo_compra, contenido=d.contenido, marca=coalesce(d.marca,i.marca),
    codigo=coalesce(d.codigo,i.codigo), codigo_barras=coalesce(d.codigo_barras,i.codigo_barras),
    proveedor=coalesce(d.proveedor,i.proveedor), presentacion=coalesce(d.presentacion,i.presentacion)
  from _ins d where lower(i.nombre)=lower(d.nombre);
  insert into insumos (nombre,tipo,unidad,contenido,costo_compra,marca,proveedor,codigo,codigo_barras,presentacion)
  select nombre,tipo,unidad,contenido,costo_compra,marca,proveedor,codigo,codigo_barras,presentacion
  from _ins d where not exists (select 1 from insumos i where lower(i.nombre)=lower(d.nombre));

  drop table if exists _prod;
  create temp table _prod on commit drop as
  select distinct on (lower(nombre)) nombre, precio, iva, es_rev, cat, cat_json, codigo, codigo_barras, merma, marca, orden from (
    select 1 ord, trim(x->>'nombre') nombre, coalesce(nullif(x->>'precio','')::numeric,0) precio, true iva, true es_rev, 'Bebidas' cat,
      nullif(x->>'categoria','') cat_json,
      nullif(x->>'codigo','') codigo, nullif(x->>'codigoBarras','') codigo_barras, null::numeric merma,
      nullif(x->>'marca','') marca, n::int orden
    from app_data, jsonb_array_elements(data->'bebidas') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 2, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), true, true, 'Snacks',
      nullif(x->>'categoria',''),
      nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''), null,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'snacks') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 3, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), (x->>'ivaIncluido')::boolean is not false, false, 'Shakes',
      nullif(x->>'categoria',''),
      nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''),
      case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end,
      null, n::int
    from app_data, jsonb_array_elements(data->'shakeRecipes') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 4, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), (x->>'ivaIncluido')::boolean is not false, false, 'Alimentos',
      nullif(x->>'categoria',''),
      nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''),
      case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end,
      null, n::int
    from app_data, jsonb_array_elements(data->'foodRecipes') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 5, trim(x->>'marca')||' - '||trim(x->>'sabor'),
      coalesce(nullif(x->>'precioBote','')::numeric,0), true, true, 'Suplementos',
      null::text,
      nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''), 0::numeric,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'proteins') with ordinality as t(x, n)
    where x->>'sabor' ilike '%- R'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')
    union all select 6, 'Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*B$', '')),
      coalesce(nullif(x->>'precioScoop','')::numeric,0), true, true, 'Scoops',
      null::text,
      nullif(x->>'codigo',''), null, 0::numeric,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'proteins') with ordinality as t(x, n)
    where x->>'sabor' ilike '%- B'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')
  ) u order by lower(nombre), ord;

  -- `categoria` del JSON manda si viene; si no, se conserva la actual. Asi un
  -- movimiento hecho en Admin (que tambien escribe el JSON) nunca se revierte.
  update productos p set precio=d.precio, iva_incluido=d.iva, merma_pct=d.merma,
    codigo=coalesce(d.codigo,p.codigo), codigo_barras=coalesce(d.codigo_barras,p.codigo_barras),
    marca=coalesce(d.marca,p.marca), orden=d.orden, activo=(d.precio>0),
    categoria_id=coalesce((select c2.id from categorias c2 where c2.nombre=d.cat_json), p.categoria_id)
  from _prod d where lower(p.nombre)=lower(d.nombre);
  insert into productos (nombre,precio,iva_incluido,es_reventa,activo,categoria_id,codigo,codigo_barras,merma_pct,marca,orden)
  select d.nombre,d.precio,d.iva,d.es_rev,d.precio>0,
         (select id from categorias where nombre=coalesce(d.cat_json,d.cat)),
         d.codigo,d.codigo_barras,d.merma,d.marca,d.orden
  from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre));

  -- La baja por desaparecer del costeo tambien cubre las categorias nuevas:
  -- si no, un producto movido a Cafe y borrado de costeo quedaria activo
  -- para siempre.
  update productos p set activo=false
  from categorias c
  where c.id=p.categoria_id
    and c.nombre in ('Shakes','Alimentos','Bebidas','Snacks','Suplementos','Scoops',
                     'Collagen Drinks','Amino Refreshers','Hydration Drinks','Café','Tés','Kombuchas')
    and p.es_combo=false
    and p.es_extra=false
    and p.activo=true
    and not exists (select 1 from _prod d where lower(d.nombre)=lower(p.nombre));

  delete from recetas where producto_id in (
    select p.id from productos p where lower(p.nombre) in (
      select lower(trim(x->>'nombre')) from app_data, jsonb_array_elements(data->'bebidas'||data->'snacks'||data->'shakeRecipes'||data->'foodRecipes') x
      where coalesce(trim(x->>'nombre'),'')<>''));
  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select pr.id,i.id,1,null from productos pr join insumos i on lower(i.nombre)=lower(pr.nombre) and i.tipo='reventa'
  where pr.es_reventa and not exists (select 1 from recetas r where r.producto_id=pr.id);

  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id) pr.id, i.id, coalesce(nullif(x->>'scoops','')::numeric,1), 'bote completo (reventa)'
  from app_data ad cross join jsonb_array_elements(ad.data->'proteins') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and pr.es_extra=false and pr.es_combo=false
  join insumos i on lower(i.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and i.tipo='proteina'
  where x->>'sabor' ilike '%- R'
    and not exists (select 1 from recetas r where r.producto_id=pr.id)
  order by pr.id;

  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id) pr.id, i.id, 1, 'scoop suelto'
  from app_data ad cross join jsonb_array_elements(ad.data->'proteins') x
  join productos pr on lower(pr.nombre)=lower('Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*B$', ''))) and pr.es_extra=false and pr.es_combo=false
  join insumos i on lower(i.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and i.tipo='proteina'
  where x->>'sabor' ilike '%- B'
    and not exists (select 1 from recetas r where r.producto_id=pr.id)
  order by pr.id;

  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id,i.id) pr.id,i.id,coalesce(nullif(ing->>1,'')::numeric,0),case when nullif(ing->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(ing->>2,'') end
  from app_data ad cross join jsonb_array_elements(ad.data->'shakeRecipes') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre')) cross join jsonb_array_elements(x->'ings') ing join insumos i on lower(i.nombre)=lower(trim(ing->>0))
  where coalesce(trim(ing->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id) order by pr.id,i.id,(nullif(ing->>1,'') is null);
  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id,i.id) pr.id,i.id,coalesce(nullif(x->>'scoops','')::numeric,1),'proteína'
  from app_data ad cross join jsonb_array_elements(ad.data->'shakeRecipes') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre')) join insumos i on lower(i.nombre)=lower(trim(x->>'protein')) and i.tipo='proteina'
  where coalesce(trim(x->>'protein'),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id and r.insumo_id=i.id) order by pr.id,i.id;
  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id,i.id) pr.id,i.id,coalesce(nullif(ing->>1,'')::numeric,0),case when nullif(ing->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(ing->>2,'') end
  from app_data ad cross join jsonb_array_elements(ad.data->'foodRecipes') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre')) cross join jsonb_array_elements(x->'ings') ing join insumos i on lower(i.nombre)=lower(trim(ing->>0))
  where coalesce(trim(ing->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id) order by pr.id,i.id,(nullif(ing->>1,'') is null);

  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id,i.id) pr.id,i.id,coalesce(nullif(emp->>1,'')::numeric,0),case when nullif(emp->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(emp->>2,'') end
  from app_data ad cross join jsonb_array_elements(ad.data->'shakeRecipes') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre')) cross join jsonb_array_elements(x->'empaques') emp join insumos i on lower(i.nombre)=lower(trim(emp->>0)) and i.tipo='empaque'
  where coalesce(trim(emp->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id and r.insumo_id=i.id)
  order by pr.id,i.id,(nullif(emp->>1,'') is null);
  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id,i.id) pr.id,i.id,coalesce(nullif(emp->>1,'')::numeric,0),case when nullif(emp->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(emp->>2,'') end
  from app_data ad cross join jsonb_array_elements(ad.data->'foodRecipes') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre')) cross join jsonb_array_elements(x->'empaques') emp join insumos i on lower(i.nombre)=lower(trim(emp->>0)) and i.tipo='empaque'
  where coalesce(trim(emp->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id and r.insumo_id=i.id)
  order by pr.id,i.id,(nullif(emp->>1,'') is null);
end $$;

-- ---------------------------------------------------------------------------
-- Sello inicial: los movimientos ya hechos quedan escritos en el costeo
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.id, p.categoria_id
      from productos p join categorias c on c.id = p.categoria_id
     where not p.es_extra
       and c.nombre in ('Collagen Drinks','Amino Refreshers','Hydration Drinks','Café','Tés','Kombuchas')
  loop
    perform fn_producto_mover_categoria(r.id, r.categoria_id);
  end loop;
end $$;