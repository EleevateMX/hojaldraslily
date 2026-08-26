create index if not exists ix_entradas_compra_almacen on public.entradas_compra(almacen_id);
create index if not exists ix_entrada_lineas_lote on public.entrada_lineas(lote_id);