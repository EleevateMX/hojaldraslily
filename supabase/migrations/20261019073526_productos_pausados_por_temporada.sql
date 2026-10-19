-- Cambiar de temporada sin volver a teclear ocho precios.
--
-- El Menú de Temporada lleva el Pan de Muerto **y** la Rosca de Reyes: son
-- dieciséis productos en la misma sección, de los cuales ocho se venden en
-- octubre y los otros ocho en enero. El interruptor de Admin → Menús del día
-- vive en la categoría, así que prende o apaga los dieciséis a la vez.
--
-- Hasta hoy la única manera de cambiar de temporada era **ponerle cero a los
-- ocho precios** del que sale (o sea borrarlos) y capturar los ocho del que
-- entra. En octubre, al revés. Cada cambio de temporada era volver a teclear
-- precios que ya se sabían, y perder los del otro.
--
-- Y apagar producto por producto desde Admin **no servía**: el siguiente
-- guardado de Costeos los revive, porque `fn_sync_app_data` recalcula
-- `activo = precio > 0` (§4). Esa es la trampa que hace que `categorias.activa`
-- sea, hasta hoy, la única bandera del catálogo que aguanta.
--
-- Así que la pausa es una bandera **aparte**, con la misma propiedad: el
-- guardado de Costeos no la toca. `productos.pausado` es la intención de la
-- casa («esto existe pero hoy no se vende») y `activo` sigue siendo lo que
-- leen todas las pantallas; lo que cambia es que ahora el sync lo calcula
-- como `precio > 0 AND NOT pausado`.
--
-- Guardar una pieza para después no le quita el precio ni la receta: vuelve
-- tal cual estaba.

alter table public.productos
  add column if not exists pausado boolean not null default false;

comment on column public.productos.pausado is
  'Guardado para despues: el producto existe, tiene su precio y su receta, '
  'pero hoy no se vende. Lo pone gerencia desde Admin y `fn_sync_app_data` '
  'NO lo toca, asi que sobrevive a cada guardado de Costeos — al reves que '
  '`activo`, que el sync recalcula como `precio > 0`.';

create or replace function public.fn_producto_pausar(
  p_producto_id uuid,
  p_pausado boolean default true
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_precio numeric; v_nombre text;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede guardar un producto para despues.';
  end if;

  select precio, nombre into v_precio, v_nombre
    from productos where id = p_producto_id for update;
  if v_nombre is null then
    raise exception 'Ese producto no existe.';
  end if;

  -- `activo` se recalcula con la misma regla que usa el sync de Costeos
  -- (`precio > 0`), pero con la pausa encima. Asi la pantalla lo esconde en
  -- el momento y no hay que esperar a que alguien guarde en Costeos.
  update productos
     set pausado = coalesce(p_pausado, true),
         activo  = (coalesce(v_precio, 0) > 0 and not coalesce(p_pausado, true))
   where id = p_producto_id;

  return coalesce(p_pausado, true);
end;
$function$;

comment on function public.fn_producto_pausar(uuid, boolean) is
  'Guarda un producto para despues sin perderle el precio ni la receta. Es lo '
  'que permite cambiar de temporada: pausar el Pan de Muerto en enero y '
  'despausar la Rosca de Reyes, sin volver a teclear ocho precios.';

revoke all on function public.fn_producto_pausar(uuid, boolean) from public;
revoke all on function public.fn_producto_pausar(uuid, boolean) from anon;
grant execute on function public.fn_producto_pausar(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Y que el guardado de Costeos la respete
-- ---------------------------------------------------------------------------
-- `fn_sync_app_data` es larga y se genera desde Costeos; reescribirla entera
-- aquí sería copiarla para cambiarle doce caracteres, y la copia se queda
-- vieja. Se parchea como manda el repo (§4): leer `pg_get_functiondef`,
-- **verificar que el ancla aparece exactamente una vez**, reemplazar y
-- `execute`. Si el ancla no cuadra, aborta — así el parche falla ruidosamente
-- en vez de corromper la función.

do $$
declare
  v_def text; v_nuevo text;
  v_ancla constant text := 'activo=(d.precio>0),';
  v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if v_def is null then
    raise exception 'No existe fn_sync_app_data. No se parchea.';
  end if;

  -- Si ya está parcheada (se corrió esta migración dos veces), no hay nada
  -- que hacer y no es un error.
  if position('and not coalesce(p.pausado,false)' in v_def) > 0 then
    raise notice 'fn_sync_app_data ya respeta la pausa.';
    return;
  end if;

  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_n <> 1 then
    raise exception 'El ancla aparece % veces, no 1. No se parchea.', v_n;
  end if;

  v_nuevo := replace(v_def, v_ancla,
    'activo=(d.precio>0 and not coalesce(p.pausado,false)),');

  execute v_nuevo;
end $$;
