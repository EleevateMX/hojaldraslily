-- ============================================================================
-- Vincular extras de bebida producto por producto, desde Admin
-- ============================================================================
-- Cierra el ciclo del autoservicio: hasta ahora se podia crear un extra y
-- mandarlo "a todos los shakes" o "solo El Clasico", pero las familias de
-- agua (Hydration, Amino, aguas frescas) las ligue yo por lista de nombres.
-- Cada bebida nueva nacia sin bases y habia que pedirmelo.
--
-- Con esto, Admin ve por cada extra la lista completa de bebidas activas y
-- lo prende o apaga por producto. Una Hydration nueva capturada en costeo
-- aparece en la lista sola (la lista es "todo lo activo de la estacion de
-- bebidas", no una lista fija).
-- ============================================================================

-- En que productos se ofrece (y en cuales no) un extra dado.
create or replace function fn_extra_bebida_productos(p_extra_id uuid)
returns table (producto_id uuid, nombre text, categoria text, ofrecido boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, c.nombre,
         exists (
           select 1 from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id
         )
    from productos p
    join categorias c on c.id = p.categoria_id
    join cocinas k on k.id = c.cocina_id
   where p.activo and not p.es_extra and k.slug = 'bebidas'
   order by c.nombre, p.nombre;
$$;

-- Prender/apagar el extra en UN producto.
create or replace function fn_extra_bebida_vincular(
  p_extra_id uuid, p_producto_id uuid, p_ofrecer boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from productos where id = p_extra_id and es_extra) then
    raise exception 'El extra no existe.';
  end if;
  if p_ofrecer then
    insert into producto_extras (producto_id, extra_id)
    values (p_producto_id, p_extra_id)
    on conflict do nothing;
  else
    delete from producto_extras
    where producto_id = p_producto_id and extra_id = p_extra_id;
  end if;
end;
$$;

revoke execute on function fn_extra_bebida_productos(uuid) from public;
revoke execute on function fn_extra_bebida_vincular(uuid, uuid, boolean) from public;
grant execute on function fn_extra_bebida_productos(uuid) to anon, authenticated;
grant execute on function fn_extra_bebida_vincular(uuid, uuid, boolean) to anon, authenticated;