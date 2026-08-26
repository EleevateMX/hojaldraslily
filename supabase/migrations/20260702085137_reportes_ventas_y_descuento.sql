-- =====================================================================
-- Reportes de ventas (aditivo) + columna descuento en ordenes.
-- Vistas que consumirá el admin. No toca app_data ni datos.
-- =====================================================================

alter table ordenes add column if not exists descuento numeric not null default 0
  check (descuento >= 0);

-- Ventas por día y sucursal, con desglose por método (pagos aprobados).
create or replace view vw_ventas_diarias as
select
  (o.created_at at time zone 'America/Merida')::date as dia,
  o.sucursal_id,
  count(distinct o.id) as num_ordenes,
  coalesce(sum(p.monto), 0) as total_ventas,
  case when count(distinct o.id) > 0
       then round(coalesce(sum(p.monto), 0) / count(distinct o.id), 2)
       else 0 end as ticket_promedio,
  coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as efectivo,
  coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'),  0) as tarjeta,
  coalesce(sum(p.monto) filter (where p.metodo = 'clip'),     0) as clip,
  coalesce(sum(p.monto) filter (where p.metodo = 'cortesia'), 0) as cortesia,
  coalesce(sum(p.monto) filter (where p.metodo = 'otro'),     0) as otro
from ordenes o
join pagos p on p.orden_id = o.id and p.estado = 'aprobado'
where o.estado <> 'cancelada'
group by 1, 2;

-- Productos más vendidos (órdenes pagadas).
create or replace view vw_productos_mas_vendidos as
select
  pr.id,
  pr.nombre,
  c.nombre as categoria,
  sum(oi.cantidad) as total_vendido,
  round(sum(oi.cantidad * oi.precio_unitario), 2) as total_ingresos
from orden_items oi
join ordenes o on o.id = oi.orden_id and o.pagado = true and o.estado <> 'cancelada'
join productos pr on pr.id = oi.producto_id
left join categorias c on c.id = pr.categoria_id
group by pr.id, pr.nombre, c.nombre
order by total_vendido desc;