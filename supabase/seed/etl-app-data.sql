-- =====================================================================
-- ETL app_data (JSON legacy) -> insumos / productos / recetas
-- Versión SQL idempotente, APLICADA al proyecto zyjtnaystsporbuzcmqk
-- el 2026-07-02 (equivalente a supabase/seed/migrar-app-data.ts).
--
-- Idempotente: re-ejecutar no duplica (WHERE NOT EXISTS por nombre y
-- por producto sin recetas). NO toca app_data (solo lectura).
-- Resultado de la 1a corrida: 182 insumos, 57 productos, 182 recetas.
-- =====================================================================
begin;

-- ---------- INSUMOS (dedup por nombre, primera aparición) ----------
with cand as (
  select * from (
    select 1 ord, trim(x->>'marca')||' - '||trim(x->>'sabor') nombre, 'proteina'::tipo_insumo tipo, 'scoop' unidad,
      coalesce(nullif(x->>'scoops','')::numeric,0) contenido, coalesce(nullif(x->>'costo','')::numeric,0) costo_compra,
      nullif(x->>'marca','') marca, nullif(x->>'proveedor','') proveedor, nullif(x->>'codigo','') codigo, nullif(x->>'pres','') presentacion
    from app_data, jsonb_array_elements(data->'proteins') x
    where coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>''
    union all select 2, trim(x->>'nombre'), 'shake', coalesce(nullif(x->>'unidad',''),'g'),
      coalesce(nullif(x->>'cont','')::numeric,0), coalesce(nullif(x->>'costo','')::numeric,0),
      nullif(x->>'marca',''), nullif(x->>'proveedor',''), nullif(x->>'codigo',''), nullif(x->>'presCompra','')
    from app_data, jsonb_array_elements(data->'shakeIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all select 3, trim(x->>'nombre'), 'alimento', coalesce(nullif(x->>'unidad',''),'g'),
      coalesce(nullif(x->>'cont','')::numeric,0), coalesce(nullif(x->>'costo','')::numeric,0),
      nullif(x->>'marca',''), nullif(x->>'proveedor',''), nullif(x->>'codigo',''), nullif(x->>'presCompra','')
    from app_data, jsonb_array_elements(data->'foodIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all select 4, trim(x->>'nombre'), 'empaque', 'pza', 1, coalesce(nullif(x->>'costo','')::numeric,0), null, null, null, null
    from app_data, jsonb_array_elements(data->'empaque') x where coalesce(trim(x->>'nombre'),'')<>''
    union all select 5, trim(x->>'nombre'), 'reventa', 'pza', 1,
      coalesce(nullif(x->>'costo','')::numeric, case when coalesce(nullif(x->>'equivPiezas','')::numeric,0)>0 then nullif(x->>'costoCaja','')::numeric/nullif(x->>'equivPiezas','')::numeric else 0 end),
      null, nullif(x->>'proveedor',''), nullif(x->>'codigo',''), nullif(x->>'presOriginal','')
    from app_data, jsonb_array_elements(data->'bebidas') x where coalesce(trim(x->>'nombre'),'')<>''
    union all select 6, trim(x->>'nombre'), 'reventa', 'pza', 1,
      coalesce(nullif(x->>'costo','')::numeric, case when coalesce(nullif(x->>'equivPiezas','')::numeric,0)>0 then nullif(x->>'costoCaja','')::numeric/nullif(x->>'equivPiezas','')::numeric else 0 end),
      null, nullif(x->>'proveedor',''), nullif(x->>'codigo',''), nullif(x->>'presOriginal','')
    from app_data, jsonb_array_elements(data->'snacks') x where coalesce(trim(x->>'nombre'),'')<>''
  ) u
), dedup as (select distinct on (lower(nombre)) * from cand order by lower(nombre), ord)
insert into insumos (nombre, tipo, unidad, contenido, costo_compra, marca, proveedor, codigo, presentacion)
select nombre, tipo, unidad, contenido, costo_compra, marca, proveedor, codigo, presentacion
from dedup d where not exists (select 1 from insumos i where lower(i.nombre)=lower(d.nombre));

-- ---------- PRODUCTOS reventa (bebidas/snacks) ----------
insert into productos (nombre, precio, iva_incluido, es_reventa, activo, categoria_id, codigo)
select p.nombre, p.precio, true, true, p.precio>0, p.cat, p.codigo from (
  select distinct on (lower(trim(x->>'nombre'))) trim(x->>'nombre') nombre,
    coalesce(nullif(x->>'precio','')::numeric,0) precio, nullif(x->>'codigo','') codigo,
    (select id from categorias where nombre='Bebidas') cat
  from app_data, jsonb_array_elements(data->'bebidas') x where coalesce(trim(x->>'nombre'),'')<>'' order by lower(trim(x->>'nombre'))
) p where not exists (select 1 from productos pr where lower(pr.nombre)=lower(p.nombre));

insert into productos (nombre, precio, iva_incluido, es_reventa, activo, categoria_id, codigo)
select p.nombre, p.precio, true, true, p.precio>0, p.cat, p.codigo from (
  select distinct on (lower(trim(x->>'nombre'))) trim(x->>'nombre') nombre,
    coalesce(nullif(x->>'precio','')::numeric,0) precio, nullif(x->>'codigo','') codigo,
    (select id from categorias where nombre='Snacks') cat
  from app_data, jsonb_array_elements(data->'snacks') x where coalesce(trim(x->>'nombre'),'')<>'' order by lower(trim(x->>'nombre'))
) p where not exists (select 1 from productos pr where lower(pr.nombre)=lower(p.nombre));

-- ---------- PRODUCTOS shakes / alimentos ----------
insert into productos (nombre, precio, iva_incluido, es_reventa, activo, categoria_id, codigo, merma_pct)
select p.nombre, p.precio, p.iva, false, p.precio>0, p.cat, p.codigo, p.merma from (
  select distinct on (lower(trim(x->>'nombre'))) trim(x->>'nombre') nombre,
    coalesce(nullif(x->>'precio','')::numeric,0) precio, (x->>'ivaIncluido')::boolean is not false iva,
    nullif(x->>'codigo','') codigo, (select id from categorias where nombre='Shakes') cat,
    case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end merma
  from app_data, jsonb_array_elements(data->'shakeRecipes') x where coalesce(trim(x->>'nombre'),'')<>'' order by lower(trim(x->>'nombre'))
) p where not exists (select 1 from productos pr where lower(pr.nombre)=lower(p.nombre));

insert into productos (nombre, precio, iva_incluido, es_reventa, activo, categoria_id, codigo, merma_pct)
select p.nombre, p.precio, p.iva, false, p.precio>0, p.cat, p.codigo, p.merma from (
  select distinct on (lower(trim(x->>'nombre'))) trim(x->>'nombre') nombre,
    coalesce(nullif(x->>'precio','')::numeric,0) precio, (x->>'ivaIncluido')::boolean is not false iva,
    nullif(x->>'codigo','') codigo, (select id from categorias where nombre='Alimentos') cat,
    case when nullif(x->>'merma','') is null then null when (x->>'merma')::numeric>1 then (x->>'merma')::numeric/100 else (x->>'merma')::numeric end merma
  from app_data, jsonb_array_elements(data->'foodRecipes') x where coalesce(trim(x->>'nombre'),'')<>'' order by lower(trim(x->>'nombre'))
) p where not exists (select 1 from productos pr where lower(pr.nombre)=lower(p.nombre));

-- ---------- RECETAS ----------
insert into recetas (producto_id, insumo_id, cantidad, nota)
select pr.id, i.id, 1, null from productos pr
join insumos i on lower(i.nombre)=lower(pr.nombre) and i.tipo='reventa'
where pr.es_reventa and not exists (select 1 from recetas r where r.producto_id=pr.id);

insert into recetas (producto_id, insumo_id, cantidad, nota)
select distinct on (pr.id, i.id) pr.id, i.id, coalesce(nullif(ing->>1,'')::numeric,0),
  case when nullif(ing->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(ing->>2,'') end
from app_data ad cross join jsonb_array_elements(ad.data->'shakeRecipes') x
join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre'))
cross join jsonb_array_elements(x->'ings') ing
join insumos i on lower(i.nombre)=lower(trim(ing->>0))
where coalesce(trim(ing->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id)
order by pr.id, i.id, (nullif(ing->>1,'') is null);

insert into recetas (producto_id, insumo_id, cantidad, nota)
select distinct on (pr.id, i.id) pr.id, i.id, coalesce(nullif(x->>'scoops','')::numeric,1), 'proteína'
from app_data ad cross join jsonb_array_elements(ad.data->'shakeRecipes') x
join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre'))
join insumos i on lower(i.nombre)=lower(trim(x->>'protein')) and i.tipo='proteina'
where coalesce(trim(x->>'protein'),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id and r.insumo_id=i.id)
order by pr.id, i.id;

insert into recetas (producto_id, insumo_id, cantidad, nota)
select distinct on (pr.id, i.id) pr.id, i.id, coalesce(nullif(ing->>1,'')::numeric,0),
  case when nullif(ing->>1,'') is null then 'PENDIENTE-CANTIDAD' else nullif(ing->>2,'') end
from app_data ad cross join jsonb_array_elements(ad.data->'foodRecipes') x
join productos pr on lower(pr.nombre)=lower(trim(x->>'nombre'))
cross join jsonb_array_elements(x->'ings') ing
join insumos i on lower(i.nombre)=lower(trim(ing->>0))
where coalesce(trim(ing->>0),'')<>'' and not exists (select 1 from recetas r where r.producto_id=pr.id)
order by pr.id, i.id, (nullif(ing->>1,'') is null);

commit;