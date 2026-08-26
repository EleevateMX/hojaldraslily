-- 1) `productos.marca`: hasta ahora la marca solo vivía en `insumos`, así
--    que POS/Kiosko no podían agrupar snacks/bebidas por marca (Lenny &
--    Larrys, Raw, Kirkland…). Se copia del JSON en cada sync.
-- 2) `productos.orden`: el catálogo se ordenaba alfabéticamente, que
--    descuadra los shakes numerados (#10 caía antes que #2). Ahora se
--    guarda la posición real del producto dentro de su lista en
--    costosshake, para que el POS respete el orden del menú.
-- 3) Venta de scoops: las proteínas " - B" (el bote que se abre en barra)
--    ahora también pueden venderse por scoop suelto — producto en la
--    categoría nueva Scoops, receta de 1 scoop contra su insumo, precio
--    desde `precioScoop`. Vender un scoop descuenta exactamente un scoop.
alter table public.productos add column if not exists marca text;
alter table public.productos add column if not exists orden integer not null default 999;

insert into public.categorias (nombre, cocina_id, activa, orden)
select 'Scoops', (select id from cocinas where slug='bebidas'), true, 6
where not exists (select 1 from categorias where nombre='Scoops');

create or replace function public.fn_sync_app_data()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select distinct on (lower(nombre)) nombre, precio, iva, es_rev, cat, codigo, codigo_barras, merma, marca, orden from (
    select 1 ord, trim(x->>'nombre') nombre, coalesce(nullif(x->>'precio','')::numeric,0) precio, true iva, true es_rev, 'Bebidas' cat,
      nullif(x->>'codigo','') codigo, nullif(x->>'codigoBarras','') codigo_barras, null::numeric merma,
      nullif(x->>'marca','') marca, n::int orden
    from app_data, jsonb_array_elements(data->'bebidas') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 2, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), true, true, 'Snacks', nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''), null,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'snacks') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 3, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), (x->>'ivaIncluido')::boolean is not false, false, 'Shakes', nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''),
      case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end,
      null, n::int
    from app_data, jsonb_array_elements(data->'shakeRecipes') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    union all select 4, trim(x->>'nombre'), coalesce(nullif(x->>'precio','')::numeric,0), (x->>'ivaIncluido')::boolean is not false, false, 'Alimentos', nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''),
      case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end,
      null, n::int
    from app_data, jsonb_array_elements(data->'foodRecipes') with ordinality as t(x, n) where coalesce(trim(x->>'nombre'),'')<>''
    -- Suplementos de reventa: bote cerrado " - R", precio en `precioBote`.
    union all select 5, trim(x->>'marca')||' - '||trim(x->>'sabor'),
      coalesce(nullif(x->>'precioBote','')::numeric,0), true, true, 'Suplementos',
      nullif(x->>'codigo',''), nullif(x->>'codigoBarras',''), 0::numeric,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'proteins') with ordinality as t(x, n)
    where x->>'sabor' ilike '%- R'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')
    -- Scoop suelto: proteína " - B" (el bote de barra), precio en
    -- `precioScoop`. Se le quita el sufijo técnico al nombre visible.
    union all select 6, 'Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*B$', '')),
      coalesce(nullif(x->>'precioScoop','')::numeric,0), true, true, 'Scoops',
      nullif(x->>'codigo',''), null, 0::numeric,
      nullif(x->>'marca',''), n::int
    from app_data, jsonb_array_elements(data->'proteins') with ordinality as t(x, n)
    where x->>'sabor' ilike '%- B'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')
  ) u order by lower(nombre), ord;

  update productos p set precio=d.precio, iva_incluido=d.iva, merma_pct=d.merma,
    codigo=coalesce(d.codigo,p.codigo), codigo_barras=coalesce(d.codigo_barras,p.codigo_barras),
    marca=coalesce(d.marca,p.marca), orden=d.orden, activo=(d.precio>0)
  from _prod d where lower(p.nombre)=lower(d.nombre);
  insert into productos (nombre,precio,iva_incluido,es_reventa,activo,categoria_id,codigo,codigo_barras,merma_pct,marca,orden)
  select d.nombre,d.precio,d.iva,d.es_rev,d.precio>0,(select id from categorias where nombre=d.cat),d.codigo,d.codigo_barras,d.merma,d.marca,d.orden
  from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre));

  update productos p set activo=false
  from categorias c
  where c.id=p.categoria_id
    and c.nombre in ('Shakes','Alimentos','Bebidas','Snacks','Suplementos','Scoops')
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

  -- Receta del bote de reventa: 1 bote = todos sus scoops.
  insert into recetas (producto_id,insumo_id,cantidad,nota)
  select distinct on (pr.id) pr.id, i.id, coalesce(nullif(x->>'scoops','')::numeric,1), 'bote completo (reventa)'
  from app_data ad cross join jsonb_array_elements(ad.data->'proteins') x
  join productos pr on lower(pr.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and pr.es_extra=false and pr.es_combo=false
  join insumos i on lower(i.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and i.tipo='proteina'
  where x->>'sabor' ilike '%- R'
    and not exists (select 1 from recetas r where r.producto_id=pr.id)
  order by pr.id;

  -- Receta del scoop suelto: 1 scoop del bote de barra.
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
end $function$;