-- El interruptor de cada menu, y las cuentas para decidir si dejarlo abierto.
--
-- Hojaldras Lily no vende siempre lo mismo: el "Menu del dia" esta abierto
-- todos los dias, "Por encargo" solo cuando hay quien lo hornee y "Temporada"
-- solo en su temporada. Hasta hoy no habia forma de cerrar un menu completo:
-- `categorias.activa` existia pero nadie la leia, y apagar producto por
-- producto no sirve porque el siguiente guardado de Costeos los revive
-- (fn_sync_app_data pone activo = precio > 0).
--
-- Por eso el interruptor vive en la CATEGORIA: es la unica bandera del
-- catalogo que fn_sync_app_data no toca, asi que sobrevive a cada guardado.

create or replace function public.fn_menus_del_dia()
returns table (
  id uuid,
  nombre text,
  orden int,
  activa boolean,
  cocina text,
  productos bigint,
  vendidos_hoy bigint,
  importe_hoy numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  -- El dia se corta en hora de Merida, no en UTC: si no, lo vendido despues
  -- de las 6 de la tarde aparecia como venta de manana.
  with hoy as (
    select (now() at time zone 'America/Merida')::date as d
  ),
  vendido as (
    select
      p.categoria_id,
      sum(oi.cantidad)                        as piezas,
      sum(oi.cantidad * oi.precio_unitario)   as importe
    from orden_items oi
    join productos p on p.id = oi.producto_id
    join ordenes o   on o.id = oi.orden_id
    cross join hoy
    where o.pagado
      and coalesce(o.es_demo, false) = false
      and (o.created_at at time zone 'America/Merida')::date = hoy.d
    group by p.categoria_id
  ),
  piezas as (
    select categoria_id, count(*) as n
    from productos
    where activo and not es_extra
    group by categoria_id
  )
  select
    c.id,
    c.nombre,
    c.orden,
    c.activa,
    co.nombre                          as cocina,
    coalesce(piezas.n, 0)              as productos,
    coalesce(vendido.piezas, 0)::bigint as vendidos_hoy,
    coalesce(vendido.importe, 0)       as importe_hoy
  from categorias c
  join cocinas co on co.id = c.cocina_id
  left join piezas  on piezas.categoria_id = c.id
  left join vendido on vendido.categoria_id = c.id
  -- Los extras no son un menu: nunca salen como boton en el kiosko, asi que
  -- tampoco tienen interruptor que ofrecer.
  where c.nombre not in ('Extras', 'Extras Bebidas')
  order by c.orden, c.nombre;
$$;

comment on function public.fn_menus_del_dia() is
  'Menus del catalogo con su interruptor y lo vendido hoy (hora de Merida). Trae tambien los apagados: si no, un menu cerrado no se podria volver a abrir.';

revoke all on function public.fn_menus_del_dia() from public;
grant execute on function public.fn_menus_del_dia() to authenticated;
