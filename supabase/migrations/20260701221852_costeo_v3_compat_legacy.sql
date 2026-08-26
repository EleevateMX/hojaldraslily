-- =====================================================================
-- vw_costeo_producto v3 — fórmula alineada 1:1 con el tablero legacy
-- (auditoría de costosshake-main/index.html, función finishCalc):
--   1. La merma aplica SOLO a los insumos de receta, NO al empaque:
--      total = receta×(1+merma) + empaque + mano_obra
--   2. Mano de obra: la del producto si > 0; si no, la global
--      (parametros.mano_obra), como params.mano en el legacy.
-- Mismas columnas y orden que v2 (solo cambia la fórmula).
-- =====================================================================
create or replace view vw_costeo_producto as
with p as (
  select * from parametros where id = 'default'
), costos as (
  select
    pr.id as producto_id,
    coalesce(sum(r.cantidad * i.costo_unitario), 0) as costo_insumos,
    coalesce(sum(r.cantidad * i.costo_unitario) filter (where i.tipo = 'empaque'), 0) as costo_empaque,
    coalesce(sum(r.cantidad * i.costo_unitario) filter (where i.tipo <> 'empaque'), 0) as costo_receta
  from productos pr
  left join recetas r on r.producto_id = pr.id
  left join insumos i on i.id = r.insumo_id
  group by pr.id
), calc as (
  select
    pr.id, pr.nombre, pr.codigo, pr.precio, pr.iva_incluido, pr.es_reventa,
    c.costo_insumos, c.costo_empaque, c.costo_receta,
    coalesce(pr.merma_pct, p.merma_default) as merma,
    case when pr.mano_obra > 0 then pr.mano_obra else p.mano_obra end as mano_efectiva,
    c.costo_receta * (1 + coalesce(pr.merma_pct, p.merma_default)) as con_merma,
    c.costo_receta * (1 + coalesce(pr.merma_pct, p.merma_default))
      + c.costo_empaque
      + case when pr.mano_obra > 0 then pr.mano_obra else p.mano_obra end as total,
    case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end as sin_iva,
    case when pr.iva_incluido then pr.precio else pr.precio * (1 + p.iva) end as con_iva,
    p.iva, p.food_cost_meta
  from productos pr
  join costos c on c.producto_id = pr.id
  cross join p
)
select
  id,
  nombre,
  codigo,
  precio,
  iva_incluido,
  es_reventa,
  costo_insumos,
  round(con_merma, 2) as costo_con_merma,
  mano_efectiva as mano_obra,
  round(total, 2) as costo_total,
  round(sin_iva, 2) as precio_sin_iva,
  round(total / nullif(sin_iva, 0), 4) as food_cost_pct,
  round(sin_iva - total, 2) as margen,
  round(round(total / nullif(food_cost_meta, 0) * (1 + iva) / 5.0) * 5.0, 2) as precio_sugerido,
  round(costo_empaque, 2) as costo_empaque,
  round(costo_receta, 2) as costo_receta,
  round(con_iva, 2) as precio_con_iva,
  round((sin_iva - total) / nullif(sin_iva, 0), 4) as margen_pct
from calc;