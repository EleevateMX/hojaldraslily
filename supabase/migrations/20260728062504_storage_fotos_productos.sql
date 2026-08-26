-- Bucket público para las fotos de producto que ya renderizan POS y Kiosko
-- (`productos.imagen_url`). Público de lectura porque las fotos del menú se
-- muestran en pantallas sin sesión (kiosko), igual que el logo. Escritura
-- abierta al anon key con el mismo criterio que el resto del catálogo
-- (deuda A3 ya documentada: Admin todavía no tiene rol propio de Supabase
-- Auth), pero acotada a este bucket, a 5 MB y solo a tipos de imagen — no
-- se puede subir otra cosa ni tocar ningún otro bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_productos_lectura on storage.objects;
create policy fotos_productos_lectura on storage.objects
  for select using (bucket_id = 'productos');

drop policy if exists fotos_productos_subir on storage.objects;
create policy fotos_productos_subir on storage.objects
  for insert with check (bucket_id = 'productos');

drop policy if exists fotos_productos_actualizar on storage.objects;
create policy fotos_productos_actualizar on storage.objects
  for update using (bucket_id = 'productos');

drop policy if exists fotos_productos_borrar on storage.objects;
create policy fotos_productos_borrar on storage.objects
  for delete using (bucket_id = 'productos');