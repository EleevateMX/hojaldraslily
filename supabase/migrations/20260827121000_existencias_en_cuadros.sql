-- Existencias en cuadros, y cuantos paquetes salen de ahi.
--
-- Dos funciones porque son dos preguntas distintas:
--
--   fn_existencias_por_sabor  -> "¿cuanta guayaba me queda?"  (el horno)
--   fn_paquetes_del_dia       -> "¿cuantas chicas puedo vender?" (la caja)
--
-- La segunda sale de la primera: los cuadros libres de un sabor divididos
-- entre los cuadros que lleva cada paquete. Por eso NO se puede quedar sin
-- chicas mientras haya cuadros: se corta lo que pidan.

drop function if exists public.fn_existencias_del_dia(date);

-- ------------------------------------------------------------- por sabor --
create or replace function public.fn_existencias_por_sabor(p_fecha date default null)
returns table (
  sabor             text,
  imagen_url        text,
  categoria         text,
  cuadros_horneados bigint,
  cuadros_mermados  bigint,
  cuadros_vendidos  bigint,
  cuadros_apartados bigint,
  cuadros_libres    bigint,
  cuadros_por_molde int,
  moldes_horneados  numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dia as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  par as (select coalesce(min(cuadros_por_molde), 48) as cpm from parametros),
  -- Un sabor por cada uno que hoy se pueda vender. Se saca del catalogo y no
  -- de lo horneado: un sabor sin hornear tiene que aparecer en cero, que es
  -- justo el que hay que mandar a hacer.
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
  apartado as (
    -- Sin filtro de fecha: lo apartado sigue apartado aunque se entregue el
    -- sabado. Separar es separar desde que se aparta.
    select p.sabor, sum(ei.cantidad * coalesce(p.cuadros, 0)) as cuadros
    from encargo_items ei
    join productos p on p.id = ei.producto_id
    join encargos e on e.id = ei.encargo_id
    where e.estado = 'apartado' and p.sabor is not null
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
$$;

comment on function public.fn_existencias_por_sabor(date) is
  'Cuadros horneados, mermados, vendidos, apartados y libres por sabor. La unidad del inventario es el cuadro, no el paquete.';

-- ----------------------------------------------------------- por paquete --
create or replace function public.fn_paquetes_del_dia(p_fecha date default null)
returns table (
  producto_id       uuid,
  nombre            text,
  sabor             text,
  categoria         text,
  cuadros           int,
  precio            numeric,
  imagen_url        text,
  cuadros_libres    bigint,
  paquetes_posibles bigint,
  vendidos          bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dia as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  ex as (select * from fn_existencias_por_sabor(p_fecha)),
  vendido as (
    select oi.producto_id, sum(oi.cantidad) as paquetes
    from orden_items oi
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado and coalesce(o.es_demo, false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
    group by oi.producto_id
  )
  select
    p.id, p.nombre, p.sabor, c.nombre, p.cuadros, p.precio, p.imagen_url,
    coalesce(ex.cuadros_libres, 0),
    -- De 100 cuadros libres salen 8 paquetes de 12, o 4 de 24. No son
    -- existencias separadas: es el MISMO pan contado de otra forma.
    case when coalesce(p.cuadros, 0) > 0
         then greatest(0, coalesce(ex.cuadros_libres, 0) / p.cuadros)
         else 0 end::bigint,
    coalesce(vendido.paquetes, 0)::bigint
  from productos p
  join categorias c on c.id = p.categoria_id
  left join ex      on ex.sabor = p.sabor
  left join vendido on vendido.producto_id = p.id
  where p.activo and not p.es_extra and c.activa and p.cuadros is not null
  order by c.orden, p.sabor, p.cuadros;
$$;

comment on function public.fn_paquetes_del_dia(date) is
  'Cuantos paquetes de cada tamano alcanzan con los cuadros libres de su sabor. Los tamanos comparten existencias: no son inventarios separados.';

revoke all on function public.fn_existencias_por_sabor(date) from public;
revoke all on function public.fn_paquetes_del_dia(date) from public;
grant execute on function public.fn_existencias_por_sabor(date) to authenticated;
grant execute on function public.fn_paquetes_del_dia(date) to authenticated;
