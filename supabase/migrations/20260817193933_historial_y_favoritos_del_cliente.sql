-- Cimientos del "expediente" del cliente en Rewards: su historial de
-- compras y lo que siempre pide. Sobre esto se montarán recomendaciones
-- y novedades en la PWA.
--
-- Ambas funciones parten de auth.uid(): cada quien ve SOLO lo suyo, sin
-- parámetros que permitan asomarse a otra ficha. Las demos no cuentan.

-- Lo que siempre pide: sus productos por número de veces compradas.
create or replace function public.fn_mis_favoritos(p_limite int default 5)
returns table (producto text, veces bigint, ultima_vez timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.nombre as producto, count(*) as veces, max(o.created_at) as ultima_vez
  from ordenes o
  join orden_items oi on oi.orden_id = o.id
  join productos p on p.id = oi.producto_id
  join clientes c on c.id = o.cliente_id
  where c.auth_user_id = auth.uid()
    and o.pagado and not o.es_demo
    and oi.padre_item_id is null          -- el shake, no sus extras
  group by p.nombre
  order by count(*) desc, max(o.created_at) desc
  limit greatest(coalesce(p_limite, 5), 1)
$$;

-- Su historial: las últimas compras con el detalle de cada una.
create or replace function public.fn_mi_historial(p_limite int default 20)
returns table (
  folio integer,
  fecha timestamptz,
  total numeric,
  mancuernas_ganadas integer,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select o.folio, o.created_at as fecha, o.total,
    coalesce((select mm.puntos from mancuernas_movimientos mm
              where mm.orden_id = o.id and mm.tipo = 'ganadas' limit 1), 0) as mancuernas_ganadas,
    (select jsonb_agg(jsonb_build_object(
        'producto', p.nombre,
        'cantidad', oi.cantidad,
        'personalizacion', oi.personalizacion
      ) order by oi.cantidad desc)
     from orden_items oi
     join productos p on p.id = oi.producto_id
     where oi.orden_id = o.id and oi.padre_item_id is null) as items
  from ordenes o
  join clientes c on c.id = o.cliente_id
  where c.auth_user_id = auth.uid()
    and o.pagado and not o.es_demo
  order by o.created_at desc
  limit greatest(coalesce(p_limite, 20), 1)
$$;

revoke all on function public.fn_mis_favoritos(int) from public;
revoke all on function public.fn_mi_historial(int) from public;
-- Solo usuarios con sesión (Google): anon no tiene auth.uid() y no ve nada.
grant execute on function public.fn_mis_favoritos(int) to authenticated, service_role;
grant execute on function public.fn_mi_historial(int) to authenticated, service_role;