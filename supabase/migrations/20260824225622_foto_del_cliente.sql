-- La cara del cliente en su tarjeta.
--
-- Google ya manda la foto en el token, asi que no hace falta que el cliente
-- suba nada para que su tarjeta deje de verse anonima: se toma sola al
-- entrar. Y si quiere otra, la sube y esa manda -- `foto_propia` existe
-- justo para que el siguiente login de Google no le pise su eleccion.

alter table clientes
  add column if not exists foto_url text,
  add column if not exists foto_propia boolean not null default false;

-- El bucket de las fotos de perfil. Publico de lectura porque la foto se
-- pinta en la app del propio cliente; de escritura, cada quien solo su
-- carpeta (ver las politicas de abajo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 3145728,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

-- La carpeta es el uid de quien sube: avatares/<auth.uid()>/<archivo>.
-- Sin esto, cualquier cliente con sesion podria sobrescribir la foto de
-- otro, que es una forma barata de hacer una travesura visible.
drop policy if exists "avatares lectura publica" on storage.objects;
create policy "avatares lectura publica" on storage.objects
  for select using (bucket_id = 'avatares');

drop policy if exists "avatares subo la mia" on storage.objects;
create policy "avatares subo la mia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares reemplazo la mia" on storage.objects;
create policy "avatares reemplazo la mia" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares borro la mia" on storage.objects;
create policy "avatares borro la mia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- Guardar una foto propia.
--
-- Solo se acepta una URL de NUESTRO storage. Si se aceptara cualquier URL,
-- la foto de perfil se volveria un hueco por donde meter la direccion de
-- un servidor ajeno que se carga en la app de la tienda cada vez que
-- alguien abre su tarjeta.
create or replace function fn_guardar_mi_foto(p_url text)
returns clientes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row clientes;
  v_permitido text := 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/storage/v1/object/public/avatares/';
  v_propio    text := 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/storage/v1/object/public/avatares/';
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesion.' using errcode = '28000';
  end if;

  if p_url is not null
     and p_url not like v_permitido || '%'
     and p_url not like v_propio || '%' then
    raise exception 'Esa foto no esta en el almacenamiento de Hojaldras Lily';
  end if;

  update clientes
     set foto_url = p_url,
         -- Quitar la foto propia devuelve el mando a la de Google.
         foto_propia = (p_url is not null)
   where auth_user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'Primero entra a tu cuenta';
  end if;
  return v_row;
end;
$$;

grant execute on function fn_guardar_mi_foto(text) to authenticated;

-- Y que al entrar se tome la de Google, sin pisar la que el cliente eligio.
do $mig$
declare
  d text := pg_get_functiondef('fn_vincular_cliente_auth(text)'::regprocedure);
  ancla text := 'v_row   clientes;';
  ancla2 text := 'select * into v_row from clientes where auth_user_id = v_uid;
  if found then
    return v_row;
  end if;';
begin
  if (length(d) - length(replace(d, ancla, ''))) / length(ancla) <> 1 then
    raise exception 'El ancla de la declaracion no aparece exactamente 1 vez';
  end if;
  if (length(d) - length(replace(d, ancla2, ''))) / length(ancla2) <> 1 then
    raise exception 'El ancla del camino ya-vinculado no aparece exactamente 1 vez';
  end if;

  d := replace(d, ancla,
    'v_row   clientes;
  v_foto  text := nullif(trim(coalesce(
             auth.jwt() -> ''user_metadata'' ->> ''avatar_url'',
             auth.jwt() -> ''user_metadata'' ->> ''picture'', '''')), '''');');

  d := replace(d, ancla2,
    'select * into v_row from clientes where auth_user_id = v_uid;
  if found then
    -- La foto de Google se refresca sola, salvo que el cliente haya
    -- subido la suya: esa eleccion gana siempre.
    if v_foto is not null and not v_row.foto_propia
       and coalesce(v_row.foto_url, '''') is distinct from v_foto then
      update clientes set foto_url = v_foto where id = v_row.id
      returning * into v_row;
    end if;
    return v_row;
  end if;');

  -- Y en el alta, que nazca con foto.
  d := replace(d,
    'insert into clientes (auth_user_id, nombre, email)
  values (v_uid, coalesce(v_nom, v_email, ''Cliente''), v_email)',
    'insert into clientes (auth_user_id, nombre, email, foto_url)
  values (v_uid, coalesce(v_nom, v_email, ''Cliente''), v_email, v_foto)');

  execute d;
end
$mig$;