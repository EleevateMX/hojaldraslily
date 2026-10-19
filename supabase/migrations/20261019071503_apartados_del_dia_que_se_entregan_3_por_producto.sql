-- (Parte de «Un encargo del sábado no se come el pan del martes». El porqué
--  completo está en 20261019071436_apartados_del_dia_que_se_entregan_1_por_molde.sql.
--  Va en tres pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 3. Por producto
-- ---------------------------------------------------------------------------

create or replace function public.fn_existencias_del_dia(p_fecha date default null)
returns table(producto_id uuid, nombre text, categoria text, imagen_url text,
              precio numeric, horneados bigint, mermados bigint, vendidos bigint,
              disponibles bigint, apartados bigint, libres bigint)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
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
  -- Solo lo que se entrega ese dia o antes. Ver la cabecera de la migracion.
  apartado as (
    select ei.producto_id, sum(ei.cantidad) as piezas
    from encargo_items ei
    join encargos e on e.id = ei.encargo_id
    cross join dia
    where e.estado = 'apartado'
      and (e.fecha_entrega is null or e.fecha_entrega <= dia.d)
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
$function$;
