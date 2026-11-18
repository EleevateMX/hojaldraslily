-- Marcar un encargo como ENTREGADO (recogido por el cliente).
--
-- El cobro de un encargo lo deja en 'pagado' (no 'entregado'): asi un encargo
-- pagado al 100% sigue apareciendo como "pendiente de entrega" hasta que el
-- cliente pasa por el. Esta funcion cierra ese ultimo paso, sin tocar dinero
-- ni inventario (ya se descontaron al cobrar): solo cambia el estado.
create or replace function public.fn_encargo_marcar_entregado(p_encargo_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede entregar.';
  end if;

  select estado into v_estado from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  if v_estado <> 'pagado' then
    raise exception 'Solo se entrega un encargo ya pagado (esta %).', v_estado;
  end if;

  update encargos set estado = 'entregado', updated_at = now() where id = p_encargo_id;
end;
$function$;

revoke all on function public.fn_encargo_marcar_entregado(uuid) from public;
revoke all on function public.fn_encargo_marcar_entregado(uuid) from anon;
grant execute on function public.fn_encargo_marcar_entregado(uuid) to authenticated;
