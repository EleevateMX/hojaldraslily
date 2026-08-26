create or replace function public.fn_salud_sistema()
returns table(
  pagos_pendientes integer,
  pagos_desconocidos integer,
  ordenes_esperando_caja integer,
  ordenes_expiradas_24h integer,
  impresoras_activas integer,
  impresoras_conectadas integer,
  trabajos_impresion_fallidos integer,
  pedidos_sin_comanda integer,
  ventas_sin_movimiento_inventario integer
)
language sql
security definer
set search_path = public
stable
as $function$
  select
    (select count(*)::int from pagos where estado_transaccion in ('pending','processing')),
    (select count(*)::int from pagos where estado_transaccion = 'unknown'),
    (select count(*)::int from ordenes where estado_pago_orden = 'awaiting_counter_payment'),
    (select count(*)::int from ordenes where estado_pago_orden = 'expired' and updated_at >= now() - interval '24 hours'),
    (select count(*)::int from impresoras where activa),
    (select count(*)::int from impresoras where activa and ultima_conexion >= now() - interval '2 minutes'),
    (select count(*)::int from trabajos_impresion where estado = 'failed'),
    (select count(*)::int from pedidos_cocina pc
       where not exists (select 1 from trabajos_impresion ti where ti.pedido_id = pc.id)),
    (select count(*)::int from ordenes o
       where o.pagado = true and o.es_demo = false
       and not exists (select 1 from inventario_movimientos im where im.referencia_id = o.id));
$function$;

grant execute on function public.fn_salud_sistema() to anon, authenticated;