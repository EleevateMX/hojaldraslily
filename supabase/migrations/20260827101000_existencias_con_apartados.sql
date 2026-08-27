-- Tres numeros distintos donde antes habia uno.
--
--   disponibles = horneado - merma - vendido   (lo que fisicamente hay)
--   apartados   = comprometido en encargos SIN PAGAR
--   libres      = disponibles - apartados      (lo que se puede vender hoy)
--
-- La regla que pidio el negocio: apartar NO descuenta. Un encargo separa la
-- mercancia en almacen -- deja de estar libre para el mostrador -- pero
-- sigue estando en el inventario hasta que se cobra. Si el cliente no llega,
-- la mercancia nunca se fue.
--
-- Y no se cuenta dos veces: un encargo cuenta como APARTADO mientras
-- `estado = 'apartado'`, y en cuanto pasa a 'pagado' deja de contar ahi
-- porque su venta ya entro por `ordenes` y cae en VENDIDO.

drop function if exists public.fn_existencias_del_dia(date);

create or replace function public.fn_existencias_del_dia(p_fecha date default null)
returns table (
  producto_id  uuid,
  nombre       text,
  categoria    text,
  imagen_url   text,
  precio       numeric,
  horneados    bigint,
  mermados     bigint,
  vendidos     bigint,
  disponibles  bigint,
  apartados    bigint,
  libres       bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dia as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  hecho as (
    select pr.producto_id,
           sum(pr.cantidad) filter (where pr.motivo = 'horneado')   as horneados,
           -sum(pr.cantidad) filter (where pr.motivo <> 'horneado') as mermados,
           sum(pr.cantidad)                                         as neto
    from produccion pr cross join dia
    where pr.fecha = dia.d
    group by pr.producto_id
  ),
  vendido as (
    select oi.producto_id, sum(oi.cantidad) as piezas
    from orden_items oi
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado
      and coalesce(o.es_demo, false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
    group by oi.producto_id
  ),
  apartado as (
    -- Sin filtro de fecha a proposito: lo apartado sigue apartado aunque se
    -- entregue el sabado. Separar es separar desde el momento en que se
    -- aparta, no el dia de la entrega.
    select ei.producto_id, sum(ei.cantidad) as piezas
    from encargo_items ei
    join encargos e on e.id = ei.encargo_id
    where e.estado = 'apartado'
    group by ei.producto_id
  )
  select
    p.id,
    p.nombre,
    c.nombre,
    p.imagen_url,
    p.precio,
    coalesce(hecho.horneados, 0)::bigint,
    coalesce(hecho.mermados, 0)::bigint,
    coalesce(vendido.piezas, 0)::bigint,
    (coalesce(hecho.neto, 0) - coalesce(vendido.piezas, 0))::bigint,
    coalesce(apartado.piezas, 0)::bigint,
    (coalesce(hecho.neto, 0) - coalesce(vendido.piezas, 0)
       - coalesce(apartado.piezas, 0))::bigint
  from productos p
  join categorias c on c.id = p.categoria_id
  left join hecho    on hecho.producto_id = p.id
  left join vendido  on vendido.producto_id = p.id
  left join apartado on apartado.producto_id = p.id
  where p.activo and not p.es_extra and c.activa
  order by c.orden, p.orden, p.nombre;
$$;

comment on function public.fn_existencias_del_dia(date) is
  'Horneado, merma, vendido, disponible, apartado y libre de un dia (hora de Merida). Apartar no descuenta.';

revoke all on function public.fn_existencias_del_dia(date) from public;
grant execute on function public.fn_existencias_del_dia(date) to authenticated;
