do $$ begin
  perform cron.schedule('imprimir-liberar-vencidos', '* * * * *',
    $cron$select public.fn_imprimir_liberar_vencidos();$cron$);
exception when others then null; end $$;

alter table impresoras enable row level security;
alter table trabajos_impresion enable row level security;
alter table impresion_auditoria enable row level security;

do $$ begin
  create policy sel_impresoras on impresoras for select using (true);
  create policy ins_impresoras on impresoras for insert with check (true);
  create policy upd_impresoras on impresoras for update using (true);
  create policy sel_trabajos_impresion on trabajos_impresion for select using (true);
  create policy sel_impresion_auditoria on impresion_auditoria for select using (true);
exception when duplicate_object then null; end $$;

grant execute on function public.fn_imprimir_reclamar_trabajos(uuid, text, integer) to anon, authenticated;
grant execute on function public.fn_imprimir_confirmar(uuid, uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_fallar(uuid, uuid, text) to anon, authenticated;
grant execute on function public.fn_imprimir_latido(uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_prueba(uuid) to anon, authenticated;
grant execute on function public.fn_imprimir_reimprimir(uuid, uuid, text, uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trabajos_impresion'
  ) then
    execute 'alter publication supabase_realtime add table public.trabajos_impresion';
  end if;
end $$;