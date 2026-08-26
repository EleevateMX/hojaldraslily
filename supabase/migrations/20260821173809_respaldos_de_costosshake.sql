-- Respaldos de costosshake: uno de hoy y uno automatico cada noche.
-- Ver supabase/migrations/respaldos_de_costosshake.sql para el razonamiento.
create table if not exists public.app_data_respaldos (
  id bigserial primary key,
  data jsonb not null,
  tomado_en timestamptz not null default now(),
  origen text not null default 'automatico',
  nota text
);

create index if not exists ix_app_data_respaldos_fecha
  on public.app_data_respaldos (tomado_en desc);

alter table public.app_data_respaldos enable row level security;

create or replace function public.fn_respaldar_costosshake(p_origen text default 'automatico', p_nota text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_actual jsonb; v_ultimo jsonb; v_id bigint;
begin
  select data into v_actual from app_data limit 1;
  if v_actual is null then return null; end if;

  select data into v_ultimo from app_data_respaldos order by tomado_en desc limit 1;
  if v_ultimo is not null and v_ultimo = v_actual then return null; end if;

  insert into app_data_respaldos (data, origen, nota)
  values (v_actual, coalesce(p_origen, 'automatico'), p_nota)
  returning id into v_id;

  delete from app_data_respaldos
  where id not in (select id from app_data_respaldos order by tomado_en desc limit 60);

  return v_id;
end;
$$;

create or replace function public.fn_restaurar_costosshake(p_respaldo_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_data jsonb;
begin
  select data into v_data from app_data_respaldos where id = p_respaldo_id;
  if v_data is null then
    raise exception 'No existe el respaldo %.', p_respaldo_id;
  end if;
  perform fn_respaldar_costosshake('antes-de-restaurar',
                                   'estado previo a restaurar el respaldo ' || p_respaldo_id);
  update app_data set data = v_data, updated_at = now(), updated_by = 'restauracion';
end;
$$;

revoke all on function public.fn_respaldar_costosshake(text, text) from public;
revoke all on function public.fn_restaurar_costosshake(bigint) from public;
grant execute on function public.fn_respaldar_costosshake(text, text) to service_role;
grant execute on function public.fn_restaurar_costosshake(bigint) to service_role;

select public.fn_respaldar_costosshake('manual', 'primer respaldo, a peticion de la sucursal');

select cron.unschedule('respaldo-costosshake')
where exists (select 1 from cron.job where jobname = 'respaldo-costosshake');

select cron.schedule(
  'respaldo-costosshake',
  '30 5 * * *',
  $cron$select public.fn_respaldar_costosshake('automatico', null)$cron$
);