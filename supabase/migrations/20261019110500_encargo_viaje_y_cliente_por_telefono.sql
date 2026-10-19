-- Marcar "va de viaje" y encontrar al cliente por su telefono.
--
-- Las dos van en funciones PROPIAS y no como parametros nuevos de
-- `fn_encargo_crear`: cambiarle la firma la duplicaria y el MCP no puede
-- tirar la vieja (§4). Ademas el viaje se marca despues mas seguido de lo
-- que se marca al crear -- el cliente lo dice al final, cuando ya se le
-- capturo todo.

create or replace function public.fn_encargo_marcar_viaje(
  p_encargo_id uuid,
  p_para_viaje boolean default true
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_val boolean;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede marcar un encargo de viaje.';
  end if;
  update encargos
     set para_viaje = coalesce(p_para_viaje, false), updated_at = now()
   where id = p_encargo_id
   returning para_viaje into v_val;
  if not found then
    raise exception 'Ese encargo no existe.';
  end if;
  return v_val;
end;
$function$;

revoke all on function public.fn_encargo_marcar_viaje(uuid, boolean) from public;
revoke all on function public.fn_encargo_marcar_viaje(uuid, boolean) from anon;
grant execute on function public.fn_encargo_marcar_viaje(uuid, boolean) to authenticated;

-- El historial de encargos ES el directorio de clientes: ya guardan nombre y
-- telefono, asi que no hace falta una tabla aparte que habria que mantener
-- sincronizada. Compara solo los DIGITOS, para que "999 123 45 67" encuentre
-- al que alguien guardo como 9991234567.
create or replace function public.fn_encargo_cliente_por_telefono(
  p_telefono text
) returns table (cliente text, telefono text, encargos bigint, ultimo date)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select e.cliente,
         e.telefono,
         count(*) over (partition by e.cliente) as encargos,
         max(e.fecha_entrega) over (partition by e.cliente) as ultimo
    from encargos e
   where fn_rol_staff() is not null
     and e.telefono is not null
     and regexp_replace(e.telefono, '[^0-9]', '', 'g')
         = regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g')
     and regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') <> ''
   order by e.created_at desc
   limit 1;
$function$;

comment on function public.fn_encargo_cliente_por_telefono(text) is
  'Busca al cliente por telefono en el historial de encargos. Compara solo los digitos, asi que "999 123 4567" encuentra al que se guardo como 9991234567. Devuelve lo ultimo capturado.';

revoke all on function public.fn_encargo_cliente_por_telefono(text) from public;
revoke all on function public.fn_encargo_cliente_por_telefono(text) from anon;
grant execute on function public.fn_encargo_cliente_por_telefono(text) to authenticated;
