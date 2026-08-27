-- La lista de precios por canal, y el cobro que la respeta.
--
-- (El valor 'rappi' del enum va en su propia migracion: Postgres no deja
-- usar un valor de enum recien agregado dentro de la misma transaccion.)

create table if not exists public.precios_canal (
  producto_id uuid not null references public.productos(id) on delete cascade,
  canal       canal_orden not null,
  precio      numeric(10,2) not null check (precio >= 0),
  updated_at  timestamptz not null default now(),
  primary key (producto_id, canal)
);

comment on table public.precios_canal is
  'Precio de venta por canal. Solo las EXCEPCIONES: sin fila aqui, manda productos.precio.';

alter table public.precios_canal enable row level security;

-- Leer es publico (el menu de una plataforma es publico); escribir, solo el
-- personal. Es una lista de precios: la misma leccion de `productos`.
drop policy if exists precios_canal_lee on public.precios_canal;
create policy precios_canal_lee on public.precios_canal for select using (true);

drop policy if exists precios_canal_staff on public.precios_canal;
create policy precios_canal_staff on public.precios_canal for all to authenticated
  using (public.fn_rol_staff() is not null)
  with check (public.fn_rol_staff() is not null);

grant select on public.precios_canal to anon, authenticated;
grant insert, update, delete on public.precios_canal to authenticated;

-- ------------------------------------------------------------------------
-- El precio de una linea, ahora enterado del canal.
--
-- Se crea una funcion NUEVA de tres argumentos en vez de cambiarle la firma
-- a la de dos: cambiar los parametros no reemplaza una funcion, la DUPLICA,
-- y ya hubo tres `fn_crear_orden` viejas conviviendo por eso (CLAUDE.md, 4).
-- La de dos argumentos se borra al final, cuando ya nadie la llama.
-- ------------------------------------------------------------------------
create or replace function public.fn_precio_linea(
  p_producto_id       uuid,
  p_padre_producto_id uuid,
  p_canal             canal_orden
)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    -- 1. Sobreprecio del extra dentro de su producto padre. Manda sobre todo
    --    lo demas: es el precio de ESE extra en ESE producto.
    (select pe.precio from producto_extras pe
      where pe.producto_id = p_padre_producto_id and pe.extra_id = p_producto_id),
    -- 2. Precio del canal, si el producto tiene uno.
    (select pc.precio from precios_canal pc
      where pc.producto_id = p_producto_id and pc.canal = p_canal),
    -- 3. El de mostrador.
    (select precio from productos where id = p_producto_id)
  )
$function$;

comment on function public.fn_precio_linea(uuid, uuid, canal_orden) is
  'Precio de una linea: sobreprecio del extra > precio del canal > precio de mostrador.';
