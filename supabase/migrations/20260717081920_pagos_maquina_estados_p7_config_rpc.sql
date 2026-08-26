alter table sucursales add column if not exists es_produccion boolean not null default true;

comment on column sucursales.es_produccion is
  'Si es true (default), esta sucursal es un entorno real: el modo demo del kiosko no puede activarse para ella ni desde Admin ni desde la RPC, sin importar lo que pida el llamante.';

create or replace function public.fn_actualizar_configuracion_kiosko(
  p_sucursal_id uuid,
  p_modo_pago modo_pago_kiosko,
  p_expira_minutos integer default null,
  p_clip_configurado boolean default null
) returns configuracion_kiosko
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_es_produccion boolean;
  v_config configuracion_kiosko;
begin
  select es_produccion into v_es_produccion from sucursales where id = p_sucursal_id;
  if not found then
    raise exception 'Sucursal % no existe', p_sucursal_id;
  end if;

  if p_modo_pago = 'demo' and v_es_produccion then
    raise exception 'La sucursal % está marcada como producción — el modo demo no puede activarse (sucursales.es_produccion=true)', p_sucursal_id;
  end if;

  insert into configuracion_kiosko (sucursal_id, modo_pago, expira_minutos, clip_configurado)
  values (p_sucursal_id, p_modo_pago, coalesce(p_expira_minutos, 15), coalesce(p_clip_configurado, false))
  on conflict (sucursal_id) do update set
    modo_pago = excluded.modo_pago,
    expira_minutos = coalesce(p_expira_minutos, configuracion_kiosko.expira_minutos),
    clip_configurado = coalesce(p_clip_configurado, configuracion_kiosko.clip_configurado),
    updated_at = now()
  returning * into v_config;

  return v_config;
end;
$function$;

grant execute on function public.fn_actualizar_configuracion_kiosko(uuid, modo_pago_kiosko, integer, boolean) to anon, authenticated;