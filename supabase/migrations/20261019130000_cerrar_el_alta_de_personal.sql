-- =============================================================================
-- Cerrar el alta de personal (19/10/26). ESTO ERA GRAVE.
--
-- Salió de seguir tirando del hilo del ACL. Cuatro funciones de personal son
-- `security definer`, estaban abiertas a `anon` y a PUBLIC, y **ninguna
-- preguntaba quién llamaba**. La llave publicable viaja en el JavaScript de
-- las nueve apps: es pública por diseño, y con ella cualquiera podía:
--
--   * `fn_crear_empleado(nombre, rol_id, pin, sucursal)` — darse de alta a sí
--     mismo **con el rol de gerencia y el PIN que quisiera**. Después basta
--     con ir al kiosko, tocar cinco veces la hojaldra y teclear ese PIN:
--     abrir y cerrar caja, descuentos, mandar a producir, Admin entero.
--   * `fn_staff_vincular_auth(empleado_id, auth_user_id)` — un `update` de
--     una línea, sin candado, que apunta el renglón de un empleado a OTRO
--     usuario de Auth. O sea: agarrar el empleado «Lily (gerencia)» y
--     colgarlo de la cuenta de uno. Sesión real de gerencia, sin PIN.
--   * `fn_actualizar_empleado(...)` — cambiarle el PIN a quien sea.
--   * `fn_admin_empleados()` — leer la plantilla completa.
--
-- Las dos primeras son escalada de privilegios directa, y estaban vivas hoy.
--
-- ## Qué las llama de verdad (comprobado antes de cerrar nada)
--
-- | Función | Quién | Con qué |
-- |---|---|---|
-- | `fn_staff_vincular_auth` | **solo** `supabase/functions/staff-login` | `service_role` |
-- | `fn_staff_por_pin` | **solo** `supabase/functions/staff-login` | `service_role` |
-- | `fn_crear_empleado` | Admin → Empleados | sesión por PIN |
-- | `fn_actualizar_empleado` | Admin → Empleados | sesión por PIN |
-- | `fn_admin_empleados` | Admin → Empleados | sesión por PIN |
--
-- `service_role` se salta los GRANT, así que a las dos de `staff-login` se
-- les puede quitar TODO y siguen funcionando. Las tres de Admin pasan a
-- exigir gerencia.
--
-- **Lo que NO se toca**: `fn_login_cajero`. Esa es la que valida un PIN para
-- *entrar*, así que por definición tiene que poder llamarse sin sesión. Su
-- defensa es otra y ya existe: `fn_pin_registrar_intento` /
-- `fn_pin_fallos_recientes`.
--
-- ## La lección, que es la de siempre y van cuatro
--
-- CLAUDE.md §5 ya decía que un `grant` suma y no quita, y que hay que
-- preguntar *quién más escribe esta tabla*. Falta la otra mitad: **hay que
-- preguntarlo listando, no leyendo**. Esto no se encontró revisando
-- funciones una por una —son cientos— sino con un solo `select` sobre
-- `pg_proc` que cruza `proacl` contra «¿el cuerpo nombra algún candado?».
-- Esa consulta está en `docs/base-de-replicacion.md` y conviene correrla
-- cada vez que se agregan funciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las dos de `staff-login`: nadie más que el service_role
-- -----------------------------------------------------------------------------

revoke all on function public.fn_staff_vincular_auth(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_staff_por_pin(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Las tres de Admin: exigen gerencia
-- -----------------------------------------------------------------------------

/**
 * Le pone el candado de gerencia a una función que no lo tiene.
 *
 * Es el parche anclado de CLAUDE.md §4, con la corrección que costó hoy: el
 * ancla se verifica por CUENTA EXACTA, no por «aparece al menos una vez».
 * Un `replace` sobre un ancla que sale dos veces parchea las dos (o ninguna,
 * si el formato cambia) y deja la función a medias.
 *
 * Es idempotente: si la función ya nombra un candado, no la toca.
 */
create or replace function public.fn_ponerle_candado(p_funcion text, p_mensaje text)
returns text
language plpgsql
as $$
declare
  v_def text;
  v_n integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_funcion;

  if v_def is null then
    raise exception 'No existe %', p_funcion;
  end if;
  if position('fn_es_jefe()' in v_def) > 0 or position('fn_es_staff()' in v_def) > 0 then
    return p_funcion || ': ya tenía candado';
  end if;

  v_n := (length(v_def) - length(replace(v_def, E'\nbegin', ''))) / length(E'\nbegin');
  if v_n <> 1 then
    raise exception 'En % el ancla «begin» aparece % veces, se esperaba 1', p_funcion, v_n;
  end if;

  -- Las DOS mitades van con `E''`. La primera vez esta de abajo quedó como
  -- cadena normal y sus `\n` se escribieron literales dentro del cuerpo de la
  -- función: Postgres la rechazó por error de sintaxis. Mejor así —falló
  -- ruidosamente y la transacción se deshizo entera— que haber colado una
  -- función con basura adentro.
  execute replace(
    v_def,
    E'\nbegin',
    E'\nbegin\n  if not fn_es_jefe() then\n    raise exception '''
      || replace(p_mensaje, '''', '''''')
      || E''';\n  end if;'
  );
  return p_funcion || ': candado puesto';
end;
$$;

do $$
begin
  raise notice '%', fn_ponerle_candado('fn_crear_empleado',
    'Solo gerencia puede dar de alta personal.');
  raise notice '%', fn_ponerle_candado('fn_actualizar_empleado',
    'Solo gerencia puede cambiar los datos o el PIN de alguien.');
end $$;

-- `fn_admin_empleados` es `language sql`: no tiene `begin` que anclar, se
-- reescribe entera. Es corta y se lee mejor así que con un parche.
-- Mismo cuerpo que tenía, letra por letra, MÁS el `where`. Se reescribe
-- entera y no con el parche porque `language sql` no tiene `begin` que
-- anclar. Ojo con lo que devuelve: `r.nombre` (el nombre del rol que se le
-- enseña a la gente), NO `r.slug` — cambiarlo aquí le rompería la pantalla a
-- Admin en silencio.
create or replace function public.fn_admin_empleados()
returns table (
  id uuid, nombre text, rol text, rol_id uuid, sucursal_id uuid,
  activo boolean, tiene_pin boolean
)
language sql
security definer
set search_path to 'public'
as $$
  select e.id, e.nombre, r.nombre, e.rol_id, e.sucursal_id, e.activo, (e.pin_hash is not null)
  from empleados e join roles r on r.id = e.rol_id
  where fn_es_jefe()
  order by e.activo desc, e.nombre;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_crear_empleado(text, uuid, text, uuid)',
    'public.fn_actualizar_empleado(uuid, text, uuid, boolean, text)',
    'public.fn_admin_empleados()'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;

-- La herramienta se queda: va a hacer falta para el resto de la lista, que
-- está en `docs/base-de-replicacion.md`.
revoke all on function public.fn_ponerle_candado(text, text) from public, anon, authenticated;
