-- Dos cosas que pidio la casa y que viven en la base.
--
-- 1. MASAS EN PRODUCCION. "Abajo de molde, cuantas masas quedan". Lo teclea
--    la mesa de produccion y NO se calcula: una masa no rinde siempre los
--    mismos moldes, asi que deducirlo seria inventar un numero que la gente
--    de la mesa ya sabe mejor que el sistema. `null` es "todavia nadie
--    conto", que no es lo mismo que cero -- la misma distincion que
--    `paquetes_posibles = null` en el catalogo del dia (§2.0).
--
-- 2. ENCARGO DE VIAJE. Cambia COMO se empaca (sellado, sin glass encima),
--    asi que empaque tiene que verlo antes de armarlo, no al entregarlo.

alter table public.orden_produccion_items
  add column if not exists masas_restantes integer;

alter table public.orden_produccion_items
  drop constraint if exists opi_masas_restantes_check;
alter table public.orden_produccion_items
  add constraint opi_masas_restantes_check
  check (masas_restantes is null or masas_restantes >= 0);

comment on column public.orden_produccion_items.masas_restantes is
  'Cuantas masas le quedan a produccion para este renglon. Lo teclea la mesa de produccion: NO se calcula, porque una masa no rinde siempre los mismos moldes. NULL = todavia nadie conto, que no es lo mismo que cero.';

alter table public.encargos
  add column if not exists para_viaje boolean not null default false;

comment on column public.encargos.para_viaje is
  'El cliente se lo lleva de viaje. Cambia como se empaca (va sellado y sin glass encima), asi que empaque tiene que verlo antes de armarlo.';

create or replace function public.fn_produccion_masas(
  p_item_id uuid,
  p_masas integer
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_quedan integer;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede apuntar las masas.';
  end if;
  if p_masas is not null and p_masas < 0 then
    raise exception 'Las masas no pueden ser negativas.';
  end if;

  update orden_produccion_items
     set masas_restantes = p_masas
   where id = p_item_id
   returning masas_restantes into v_quedan;

  if not found then
    raise exception 'Ese renglon de produccion no existe.';
  end if;
  return v_quedan;
end;
$function$;

comment on function public.fn_produccion_masas(uuid, integer) is
  'Apunta cuantas masas le quedan a produccion en un renglon. Pasar NULL borra la cuenta (vuelve a "nadie conto").';

revoke all on function public.fn_produccion_masas(uuid, integer) from public;
revoke all on function public.fn_produccion_masas(uuid, integer) from anon;
grant execute on function public.fn_produccion_masas(uuid, integer) to authenticated;
