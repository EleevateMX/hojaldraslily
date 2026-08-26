-- El POS necesita leer sus órdenes pendientes (crear → cobrar).
-- La policy legacy kds_read_ordenes solo permitía ver pagadas.
do $$ begin
  create policy sel_ordenes_pos on ordenes for select using (true);
exception when duplicate_object then null; end $$;