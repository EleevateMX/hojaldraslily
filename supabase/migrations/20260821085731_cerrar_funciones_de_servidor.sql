-- Las funciones que solo corren del lado del servidor dejan de estar abiertas.
-- Ver supabase/migrations/cerrar_funciones_de_servidor.sql para el detalle.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in (
        'fn_confirmar_venta', 'fn_pago_aprobado', 'fn_descontar_inventario_por_orden',
        'fn_encolar_comanda', 'fn_encolar_comanda_para_pedido', 'fn_encolar_comandas_desde_items',
        'fn_crear_pedidos_cocina', 'fn_sync_app_data', 'trg_sync_app_data',
        '_aplicar_delta_almacen', 'fn_sync_stock_costos', 'fn_imprimir_liberar_vencidos'
      )
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.firma);
    n := n + 1;
  end loop;
  raise notice 'Cerradas % funciones de servidor.', n;
end $$;