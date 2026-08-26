-- ============================================================================
-- Las cuatro vistas de reportes dejan de saltarse RLS
-- ============================================================================
-- Es la trampa #1 del CLAUDE.md, encontrada en carne propia: en el motor
-- original estas cuatro vistas se redefinieron con `create or replace view`
-- despues de haberse creado, y eso **borra las reloptions**. Se quedaron sin
-- `security_invoker`, o sea leyendo con los permisos de quien las creo
-- (postgres) en vez de los de quien consulta. El advisor de Supabase las
-- marca como ERROR `security_definer_view`.
--
-- Que hay dentro: cortes de caja, ventas por dia, existencias y productos mas
-- vendidos. Lo que se ve con la llave publicable —la que viaja dentro del
-- frontend desplegado—, o sea el corte del dia de cualquiera que la copie.
--
-- Hoy no cambia quien ve que: las tablas de abajo (`caja_cortes`, `pagos`,
-- `ordenes`, `inventario_stock`…) tienen policy de select abierta, asi que el
-- Admin y el POS siguen leyendo igual. Lo que cambia es el futuro: el dia que
-- se endurezca una de esas tablas, la vista lo respetara en vez de seguir
-- entregando los datos por la puerta de atras.
--
-- Se hace ahora porque Hojaldras Lily esta en pre-apertura: sin ventas reales,
-- el costo de equivocarse es cero. En la tienda abierta habria que probarlo
-- antes.
alter view public.vw_corte_resumen         set (security_invoker = true);
alter view public.vw_stock_almacen         set (security_invoker = true);
alter view public.vw_ventas_diarias        set (security_invoker = true);
alter view public.vw_productos_mas_vendidos set (security_invoker = true);

-- Candado: si alguien vuelve a hacer `create or replace view` sobre estas y
-- se le olvida la reloption, esta verificacion lo caza en la siguiente corrida.
do $$
declare n int;
begin
  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'v'
    and c.relname in ('vw_corte_resumen','vw_stock_almacen','vw_ventas_diarias',
                      'vw_productos_mas_vendidos','vw_costeo_producto')
    and not coalesce(array_to_string(c.reloptions, ',') like '%security_invoker=true%', false);
  if n > 0 then
    raise exception 'Quedaron % vistas de reportes sin security_invoker.', n;
  end if;
end $$;
