-- Lo que NO se vende en Rappi.
--
-- La lista de precios de la casa marca con "X" los productos que no van en la
-- plataforma: la Hawaiana de 24, la Trenza Suiza, todo lo de anis, las roscas
-- de temporada. Hasta hoy eso no se podia escribir: `precios_canal` guarda
-- solo las EXCEPCIONES de precio, y un producto sin fila cae al precio de
-- mostrador (`fn_precio_linea`, paso 3).
--
-- Osea que la ausencia de precio significaba justo lo contrario de la X: en
-- vez de "no se vende aqui", el sistema entendia "cobralo al precio de la
-- tienda". Una Trenza Suiza saldria en Rappi a $160 -- el precio sin la
-- comision de la plataforma -- y cada venta perderia dinero en silencio.
--
-- Se marca con una fila explicita (disponible = false) y no borrando el
-- precio, porque "no lo vendo aqui" es una decision, no un dato faltante.

alter table public.precios_canal
  add column if not exists disponible boolean not null default true;

comment on column public.precios_canal.disponible is
  'false = este producto NO se vende en ese canal. La "X" de la lista de precios.';

-- El precio del canal solo cuenta si el producto se vende en el canal. Sin
-- esto, una fila con disponible = false seguiria dictando precio.
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
    (select pe.precio from producto_extras pe
      where pe.producto_id = p_padre_producto_id and pe.extra_id = p_producto_id),
    (select pc.precio from precios_canal pc
      where pc.producto_id = p_producto_id and pc.canal = p_canal and pc.disponible),
    (select precio from productos where id = p_producto_id)
  )
$function$;

comment on function public.fn_precio_linea(uuid, uuid, canal_orden) is
  'Precio de una linea: sobreprecio del extra > precio del canal (si se vende ahi) > precio de mostrador.';

-- ¿Este producto se vende en este canal?
create or replace function public.fn_producto_va_en_canal(
  p_producto_id uuid,
  p_canal       canal_orden
)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select not exists (
    select 1 from precios_canal
     where producto_id = p_producto_id and canal = p_canal and not disponible
  )
$function$;

comment on function public.fn_producto_va_en_canal(uuid, canal_orden) is
  'false solo cuando hay una X explicita para ese canal. Sin fila, se vende.';

grant execute on function public.fn_producto_va_en_canal(uuid, canal_orden) to anon, authenticated;
