-- Dos arreglos a lo que la pantalla de Sistema estaba marcando en rojo.
--
-- 1) "Comandas que fallaron: 21" contaba TODA la historia — 18 de ellas las
--    marqué yo al limpiar la cola atorada de julio, y 3 son del 16/08 cuando
--    la etiquetadora estaba desconectada. Nada de eso se puede reimprimir ya
--    ni indica un problema de hoy. Un indicador que nunca puede volver a
--    verde deja de leerse, así que ahora mira solo las últimas 24 h. Lo
--    mismo para las ventas sin inventario: 7 días.
--
-- 2) Las opciones de café del Paquete Americano no tenían receta, así que
--    ese paquete se vendía sin descontar NADA (folio 552 lo delató). Cada
--    opción copia la receta del americano que le corresponde: así el
--    descuento sigue lo que el cliente realmente eligió.
create or replace function public.fn_salud_sistema()
returns table(pagos_pendientes integer, pagos_desconocidos integer, ordenes_esperando_caja integer,
              ordenes_expiradas_24h integer, impresoras_activas integer, impresoras_conectadas integer,
              trabajos_impresion_fallidos integer, pedidos_sin_comanda integer,
              ventas_sin_movimiento_inventario integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (select count(*)::int from pagos where estado_transaccion in ('pending','processing')),
    (select count(*)::int from pagos where estado_transaccion = 'unknown'),
    (select count(*)::int from ordenes where estado_pago_orden = 'awaiting_counter_payment'),
    (select count(*)::int from ordenes where estado_pago_orden = 'expired' and updated_at >= now() - interval '24 hours'),
    (select count(*)::int from impresoras where activa),
    (select count(*)::int from impresoras where activa and ultima_conexion >= now() - interval '2 minutes'),
    -- Solo lo reciente: lo viejo ya no se reimprime y ensucia el tablero.
    (select count(*)::int from trabajos_impresion
       where estado = 'failed' and coalesce(failed_at, created_at) >= now() - interval '24 hours'),
    (select count(*)::int from pedidos_cocina pc
       where not exists (select 1 from trabajos_impresion ti where ti.pedido_id = pc.id)),
    (select count(*)::int from ordenes o
       where o.pagado = true and o.es_demo = false
       and o.created_at >= now() - interval '7 days'
       and not exists (select 1 from inventario_movimientos im where im.referencia_id = o.id));
$function$;

-- Las dos opciones de café del paquete heredan la receta de su americano.
insert into recetas (producto_id, insumo_id, cantidad, nota)
select destino.id, r.insumo_id, r.cantidad,
       coalesce(r.nota, '') || ' (opción del Paquete Americano)'
from (values
  ('Café: Americano Caliente', 'Americano Caliente'),
  ('Café: Americano Helado',   'Americano Helado')
) as m(extra, base)
join productos destino on destino.nombre = m.extra and destino.es_extra
join productos origen  on origen.nombre  = m.base  and not origen.es_extra
join recetas r on r.producto_id = origen.id
where not exists (
  select 1 from recetas r2 where r2.producto_id = destino.id and r2.insumo_id = r.insumo_id
);