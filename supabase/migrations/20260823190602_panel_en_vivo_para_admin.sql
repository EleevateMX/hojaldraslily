-- Panel "En vivo" del Admin: una sola llamada trae la foto del momento —
-- ventas del día, corte abierto, lo que está en cocina, últimos pedidos,
-- los más pedidos de hoy y el pulso de las impresoras.
--
-- Es UNA función y no seis consultas del navegador porque:
--   · el gate es uno solo (fn_es_jefe) y queda del lado del servidor;
--   · el panel refresca cada pocos segundos — un viaje, no seis.
create or replace function public.fn_panel_en_vivo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Medianoche de HOY en Mérida, en timestamptz.
  v_inicio timestamptz := ((now() at time zone 'America/Merida')::date)::timestamp at time zone 'America/Merida';
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver el panel en vivo';
  end if;

  return jsonb_build_object(
    'ahora', to_char(now() at time zone 'America/Merida', 'HH24:MI:SS'),

    'dia', (
      select jsonb_build_object(
        'ordenes', count(*) filter (where o.pagado),
        'total', coalesce(sum(o.total) filter (where o.pagado), 0),
        'ticket', case when count(*) filter (where o.pagado) > 0
                       then round(sum(o.total) filter (where o.pagado) / (count(*) filter (where o.pagado)), 2)
                       else 0 end
      )
      from ordenes o
      where o.created_at >= v_inicio and not o.es_demo
    ),

    'por_metodo', (
      select coalesce(jsonb_object_agg(m.metodo, m.monto), '{}'::jsonb)
      from (
        select p.metodo::text as metodo, sum(p.monto) as monto
        from pagos p
        where p.estado = 'aprobado' and p.created_at >= v_inicio
        group by p.metodo
      ) m
    ),

    'corte', (
      select jsonb_build_object(
        'desde', to_char(cc.abierto_en at time zone 'America/Merida', 'HH24:MI'),
        'fondo', cc.fondo_inicial,
        'abrio', e.nombre
      )
      from caja_cortes cc
      left join empleados e on e.id = cc.empleado_apertura_id
      where cc.estado = 'abierta'
      order by cc.abierto_en desc
      limit 1
    ),

    'en_cocina', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'estacion', k.nombre,
        'estado', pc.estado,
        'folio', o.folio,
        'nombre', o.nombre_cliente,
        'minutos', floor(extract(epoch from (now() - pc.created_at)) / 60)
      ) order by pc.created_at), '[]'::jsonb)
      from pedidos_cocina pc
      join ordenes o on o.id = pc.orden_id
      join cocinas k on k.id = pc.cocina_id
      where pc.estado <> 'entregado' and pc.created_at >= v_inicio
    ),

    'pedidos_recientes', (
      select coalesce(jsonb_agg(x order by (x->>'folio')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'folio', o.folio,
          'nombre', nullif(trim(coalesce(o.nombre_cliente, '')), ''),
          'hora', to_char(o.created_at at time zone 'America/Merida', 'HH24:MI'),
          'total', o.total,
          'canal', o.canal,
          'items', (
            select coalesce(string_agg(
              case when oi.cantidad > 1 then oi.cantidad || '× ' else '' end || coalesce(pr.nombre, '?'),
              ' · ' order by pr.nombre), '')
            from orden_items oi
            left join productos pr on pr.id = oi.producto_id
            where oi.orden_id = o.id and oi.padre_item_id is null
          )
        ) as x
        from ordenes o
        where o.pagado and not o.es_demo
        order by o.folio desc
        limit 8
      ) t
    ),

    'top_productos', (
      select coalesce(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'cantidad', t.cant)
                                order by t.cant desc), '[]'::jsonb)
      from (
        select pr.nombre, sum(oi.cantidad) as cant
        from orden_items oi
        join ordenes o on o.id = oi.orden_id
        join productos pr on pr.id = oi.producto_id
        where o.created_at >= v_inicio and o.pagado and not o.es_demo
          and oi.padre_item_id is null
        group by pr.nombre
        order by cant desc
        limit 10
      ) t
    ),

    'impresoras', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', i.nombre,
        'en_linea', coalesce(i.ultima_conexion > now() - interval '90 seconds', false),
        'ultima_impresion', to_char(i.ultima_impresion at time zone 'America/Merida', 'HH24:MI')
      ) order by i.nombre), '[]'::jsonb)
      from impresoras i
      where i.activa
    )
  );
end;
$$;

revoke all on function public.fn_panel_en_vivo() from public;
-- Solo authenticated: el gate real es fn_es_jefe() adentro — un cliente de
-- lealtad también es authenticated y por eso no basta con el grant.
grant execute on function public.fn_panel_en_vivo() to authenticated, service_role;