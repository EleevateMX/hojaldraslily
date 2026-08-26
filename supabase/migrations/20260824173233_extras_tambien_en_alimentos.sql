-- Punto 5 del cliente: los extras deben poder ofrecerse también en
-- alimentos, igual que en bebidas. "Dónde se ofrece" ahora lista TODO el
-- catálogo activo (bebidas y alimentos), agrupado por estación y categoría.
-- Mismo nombre de función para no tocar todas las apps.
create or replace function public.fn_extra_bebida_productos(p_extra_id uuid)
returns table(producto_id uuid, nombre text, categoria text, ofrecido boolean, precio_propio numeric, precio_base numeric, grupo text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.nombre,
         coalesce(k.nombre || ' · ' || c.nombre, '—'),
         exists (select 1 from producto_extras pe
                  where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select pe.precio from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select e.precio from productos e where e.id = p_extra_id),
         (select pe.grupo from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id)
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  where p.activo and not p.es_extra
  order by k.slug, c.orden, p.nombre
$function$;