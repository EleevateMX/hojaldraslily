-- Costeos deja de escribir con la llave publica: ahora tiene sesion propia.
--
-- El candado de `20260826213000` cerro la escritura DIRECTA del catalogo,
-- pero quedaba una puerta de atras: `app_data` seguia con INSERT/UPDATE para
-- `anon`, y su trigger `app_data_sync` corre como DEFINER y reescribe
-- productos, insumos y recetas. O sea que con la llave publica todavia se
-- podian mover los precios -- dando el rodeo por Costeos en vez de tocar
-- `productos`. El candado valia menos de lo que parecia.
--
-- Y habia un segundo problema, de confidencialidad: `app_data` guarda el
-- COSTEO -- costos, margenes, proveedores. Con `select` para `anon`,
-- cualquiera con la URL de las apps podia leerlo.
--
-- Costeos no puede usar sesion de Supabase Auth: es un HTML plano con su
-- propio usuario y contrasena (`fn_costos_login`). Asi que se le da lo que
-- le faltaba: al entrar recibe un TOKEN, y cargar y guardar pasan por
-- funciones que lo exigen. `app_data` se cierra a `anon` por completo.

alter table app_users add column if not exists token uuid;
alter table app_users add column if not exists token_expira timestamptz;

create index if not exists app_users_token_idx on app_users (token)
  where token is not null;

-- ---------------------------------------------------------------- login --
-- La firma de retorno cambia (ahora entrega token), y `create or replace` no
-- puede con eso: Postgres rechaza cambiar el tipo de retorno. Se suelta la
-- vieja primero. Ojo con la trampa de CLAUDE.md: si en vez del tipo de
-- retorno cambiaran los PARAMETROS, no fallaria -- crearia una segunda
-- funcion conviviendo con la vieja.
drop function if exists public.fn_costos_login(text, text);

-- Misma logica de siempre (incluye la migracion sha256 -> bcrypt al vuelo),
-- pero ahora entrega un token si la cuenta esta habilitada.
create or replace function public.fn_costos_login(p_usuario text, p_contrasena text)
returns table(ok boolean, autorizado boolean, mensaje text, token uuid)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text; v_autorizado boolean; v_correcta boolean := false; v_token uuid;
begin
  select u.hash, u.autorizado into v_hash, v_autorizado
  from app_users u where lower(u.username) = lower(trim(p_usuario)) limit 1;

  if v_hash is null then
    return query select false, false, 'Usuario o contraseña incorrectos'::text, null::uuid;
    return;
  end if;

  if v_hash like '$2%' then
    v_correcta := (v_hash = crypt(p_contrasena, v_hash));
  else
    v_correcta := (v_hash = encode(digest(p_contrasena, 'sha256'), 'hex'));
    if v_correcta then
      update app_users set hash = crypt(p_contrasena, gen_salt('bf'))
      where lower(username) = lower(trim(p_usuario));
    end if;
  end if;

  if not v_correcta then
    return query select false, false, 'Usuario o contraseña incorrectos'::text, null::uuid;
  elsif not v_autorizado then
    return query select false, false,
      'Tu cuenta existe pero todavía no está habilitada. Pídele a gerencia que la autorice.'::text,
      null::uuid;
  else
    v_token := gen_random_uuid();
    update app_users
       set token = v_token,
           -- Doce horas: mas que una jornada, para que a nadie se le cierre
           -- la sesion a media captura, y menos que "para siempre".
           token_expira = now() + interval '12 hours'
     where lower(username) = lower(trim(p_usuario));
    return query select true, true, ''::text, v_token;
  end if;
end;
$function$;

-- --------------------------------------------------------- quien es este --
create or replace function public.fn_costos_usuario_del_token(p_token uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select u.username from app_users u
  where u.token = p_token and u.autorizado and u.token_expira > now()
  limit 1
$function$;

-- ------------------------------------------------------------- cargar ----
create or replace function public.fn_costos_cargar(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_quien text;
begin
  v_quien := fn_costos_usuario_del_token(p_token);
  if v_quien is null then
    raise exception 'Sesión vencida. Vuelve a entrar.';
  end if;
  return (select data from app_data where id = 'hojaldraslily');
end;
$function$;

-- ------------------------------------------------------------- guardar ---
create or replace function public.fn_costos_guardar(p_token uuid, p_data jsonb)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_quien text;
begin
  v_quien := fn_costos_usuario_del_token(p_token);
  if v_quien is null then
    raise exception 'Sesión vencida. Vuelve a entrar.';
  end if;
  -- Un guardado vacio borraria el catalogo entero via el trigger de sync.
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos inválidos: no se guardó nada.';
  end if;

  update app_data
     set data = p_data, updated_at = now(), updated_by = v_quien
   where id = 'hojaldraslily';
  if not found then
    insert into app_data (id, data, updated_at, updated_by)
    values ('hojaldraslily', p_data, now(), v_quien);
  end if;
  return v_quien;
end;
$function$;

-- ------------------------------------------- se cierra la puerta de atras --
drop policy if exists app_data_select on app_data;
drop policy if exists app_data_insert on app_data;
drop policy if exists app_data_update on app_data;

-- El personal con sesion real (Admin) si puede verlo; Costeos entra por las
-- funciones de arriba, que corren como DEFINER y no dependen de esto.
create policy app_data_staff on app_data for all to authenticated
  using (public.fn_rol_staff() is not null)
  with check (public.fn_rol_staff() is not null);

revoke all on table app_data from anon;

grant execute on function public.fn_costos_cargar(uuid) to anon, authenticated;
grant execute on function public.fn_costos_guardar(uuid, jsonb) to anon, authenticated;
grant execute on function public.fn_costos_usuario_del_token(uuid) to anon, authenticated;
