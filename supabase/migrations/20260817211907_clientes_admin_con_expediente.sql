-- Admin → Clientes: la base del programa vista desde gerencia.
--
-- fn_clientes_admin: lista con búsqueda (nombre, teléfono, código, correo)
-- y los números que importan de un vistazo: compras, última visita,
-- mancuernas y cupones vigentes. Solo demos fuera.
create or replace function public.fn_clientes_admin(
  p_busqueda text default null,
  p_limite int default 100
)
returns table (
  id uuid, nombre text, telefono text, email text, codigo text,
  mancuernas integer, alta timestamptz, con_google boolean,
  compras bigint, ultima_compra timestamptz, cupones_activos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtro as (
    select nullif(trim(coalesce(p_busqueda, '')), '') as texto,
           nullif(regexp_replace(coalesce(p_busqueda, ''), '\D', '', 'g'), '') as digitos
  )
  select c.id, c.nombre, c.telefono, c.email, c.codigo, c.mancuernas,
         c.created_at as alta,
         c.auth_user_id is not null as con_google,
         (select count(*) from ordenes o
           where o.cliente_id = c.id and o.pagado and not o.es_demo) as compras,
         (select max(o.created_at) from ordenes o
           where o.cliente_id = c.id and o.pagado and not o.es_demo) as ultima_compra,
         (select count(*) from cupones cu
           where cu.cliente_id = c.id and cu.estado = 'activo' and cu.vence_en >= now()) as cupones_activos
  from clientes c, filtro f
  where c.activo
    and (
      f.texto is null
      or c.nombre ilike '%' || f.texto || '%'
      or c.codigo ilike '%' || f.texto || '%'
      or c.email ilike '%' || f.texto || '%'
      -- El teléfono solo entra al juego si la búsqueda trae dígitos:
      -- sin esta guarda, buscar "zzz" regresaría a todo el que tenga número.
      or (f.digitos is not null and c.telefono like '%' || f.digitos || '%')
    )
  order by ultima_compra desc nulls last, c.created_at desc
  limit greatest(coalesce(p_limite, 100), 1)
$$;

-- fn_expediente_cliente: lo que siempre pide + sus últimas compras.
-- Es el mismo expediente que ve el cliente en Rewards, pero por id, para
-- que en caja/gerencia puedan recomendar con datos.
create or replace function public.fn_expediente_cliente(p_cliente_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'favoritos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'producto', f.producto, 'veces', f.veces, 'ultima_vez', f.ultima_vez))
      from (
        select p.nombre as producto, count(*) as veces, max(o.created_at) as ultima_vez
        from ordenes o
        join orden_items oi on oi.orden_id = o.id
        join productos p on p.id = oi.producto_id
        where o.cliente_id = p_cliente_id and o.pagado and not o.es_demo
          and oi.padre_item_id is null
        group by p.nombre
        order by count(*) desc, max(o.created_at) desc
        limit 5
      ) f), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(jsonb_build_object(
          'folio', x.folio, 'fecha', x.fecha, 'total', x.total, 'items', x.items))
      from (
        select o.folio, o.created_at as fecha, o.total,
          (select jsonb_agg(jsonb_build_object(
              'producto', p.nombre, 'cantidad', oi.cantidad,
              'personalizacion', oi.personalizacion) order by oi.cantidad desc)
           from orden_items oi join productos p on p.id = oi.producto_id
           where oi.orden_id = o.id and oi.padre_item_id is null) as items
        from ordenes o
        where o.cliente_id = p_cliente_id and o.pagado and not o.es_demo
        order by o.created_at desc
        limit 10
      ) x), '[]'::jsonb)
  )
$$;

revoke all on function public.fn_clientes_admin(text, int) from public;
revoke all on function public.fn_expediente_cliente(uuid) from public;
grant execute on function public.fn_clientes_admin(text, int) to anon, authenticated, service_role;
grant execute on function public.fn_expediente_cliente(uuid) to anon, authenticated, service_role;