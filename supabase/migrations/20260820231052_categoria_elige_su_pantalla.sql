-- Cada categoria elige a que pantalla va — incluida la opcion "a ninguna".
-- Ver supabase/migrations/categoria_elige_su_pantalla.sql para el detalle.
alter table categorias add column if not exists va_a_pantalla boolean not null default true;

comment on column categorias.va_a_pantalla is
  'Si sus productos llegan a una pantalla de cocina. False = se venden pero nadie los prepara (embotellados, snacks de anaquel). No borra el dato: la venta se registra igual en la orden.';

update categorias set va_a_pantalla = false where nombre in ('Snacks', 'Bebidas');

create or replace function public.fn_crear_pedidos_cocina()
returns trigger
language plpgsql
security definer set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and not NEW.es_demo then
    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id,
      coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    where oi.orden_id = NEW.id
      and coalesce(c.va_a_pantalla, true)
    on conflict (orden_id, cocina_id) do nothing;

    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion)
    select pc.id, oi.id, oi.producto_id, oi.cantidad, oi.personalizacion
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    join pedidos_cocina pc on pc.orden_id = NEW.id
      and pc.cocina_id = coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    where oi.orden_id = NEW.id
      and coalesce(c.va_a_pantalla, true)
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$function$;

create or replace function public.fn_categorias_pantalla()
returns table (id uuid, nombre text, cocina_slug text, cocina text, va_a_pantalla boolean, productos_activos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre, k.slug, k.nombre, c.va_a_pantalla,
         (select count(*) from productos p where p.categoria_id = c.id and p.activo)
  from categorias c
  join cocinas k on k.id = c.cocina_id
  where c.activa
  order by c.orden, c.nombre
$$;

create or replace function public.fn_categoria_pantalla(p_categoria_id uuid, p_cocina_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := nullif(trim(coalesce(p_cocina_slug, '')), '');
  v_cocina uuid;
begin
  if v_slug is null then
    update categorias set va_a_pantalla = false where id = p_categoria_id;
  else
    select id into v_cocina from cocinas where slug = v_slug;
    if v_cocina is null then
      raise exception 'No existe la estacion "%".', v_slug;
    end if;
    update categorias set cocina_id = v_cocina, va_a_pantalla = true where id = p_categoria_id;
  end if;
  if not found then
    raise exception 'No existe esa categoria.';
  end if;
end;
$$;

revoke all on function public.fn_categorias_pantalla() from public;
revoke all on function public.fn_categoria_pantalla(uuid, text) from public;
grant execute on function public.fn_categorias_pantalla() to anon, authenticated, service_role;
grant execute on function public.fn_categoria_pantalla(uuid, text) to anon, authenticated, service_role;