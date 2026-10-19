-- (Parte de «Un encargo del sábado no se come el pan del martes». El porqué
--  completo está en 20261019071436_apartados_del_dia_que_se_entregan_1_por_molde.sql.
--  Va en tres pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 2. Por sabor
-- ---------------------------------------------------------------------------

create or replace function public.fn_existencias_por_sabor(p_fecha date default null)
returns table(sabor text, imagen_url text, categoria text, cuadros_horneados bigint,
              cuadros_mermados bigint, cuadros_vendidos bigint, cuadros_apartados bigint,
              cuadros_libres bigint, cuadros_por_molde integer, moldes_horneados numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with dia as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  par as (select coalesce(min(cuadros_por_molde), 48) as cpm from parametros),
  sabores as (
    select distinct p.sabor, c.nombre as categoria
    from productos p join categorias c on c.id = p.categoria_id
    where p.activo and not p.es_extra and c.activa and p.cuadros is not null
  ),
  foto as (
    select p.sabor, min(p.imagen_url) as imagen_url
    from productos p where p.sabor is not null group by p.sabor
  ),
  hecho as (
    select pr.sabor,
           sum(pr.cantidad) filter (where pr.motivo = 'horneado')   as horneados,
           -sum(pr.cantidad) filter (where pr.motivo <> 'horneado') as mermados,
           sum(pr.cantidad)                                         as neto
    from produccion pr cross join dia
    where pr.fecha = dia.d and pr.sabor is not null
    group by pr.sabor
  ),
  vendido as (
    select p.sabor, sum(oi.cantidad * coalesce(p.cuadros, 0)) as cuadros
    from orden_items oi
    join productos p on p.id = oi.producto_id
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado and coalesce(o.es_demo, false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
      and p.sabor is not null
    group by p.sabor
  ),
  -- Solo lo que se entrega ese dia o antes. Ver la cabecera de la migracion.
  apartado as (
    select p.sabor, sum(ei.cantidad * coalesce(p.cuadros, 0)) as cuadros
    from encargo_items ei
    join productos p on p.id = ei.producto_id
    join encargos e on e.id = ei.encargo_id
    cross join dia
    where e.estado = 'apartado' and p.sabor is not null
      and (e.fecha_entrega is null or e.fecha_entrega <= dia.d)
    group by p.sabor
  )
  select
    s.sabor,
    foto.imagen_url,
    s.categoria,
    coalesce(hecho.horneados, 0)::bigint,
    coalesce(hecho.mermados, 0)::bigint,
    coalesce(vendido.cuadros, 0)::bigint,
    coalesce(apartado.cuadros, 0)::bigint,
    (coalesce(hecho.neto, 0) - coalesce(vendido.cuadros, 0)
       - coalesce(apartado.cuadros, 0))::bigint,
    par.cpm,
    round(coalesce(hecho.horneados, 0)::numeric / par.cpm, 1)
  from sabores s
  cross join par
  left join foto     on foto.sabor = s.sabor
  left join hecho    on hecho.sabor = s.sabor
  left join vendido  on vendido.sabor = s.sabor
  left join apartado on apartado.sabor = s.sabor
  order by s.categoria, s.sabor;
$function$;
