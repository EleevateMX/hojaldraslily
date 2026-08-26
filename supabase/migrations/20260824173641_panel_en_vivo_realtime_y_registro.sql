-- El panel "En vivo" pasa de fotos cada 5 s a tiempo real de verdad:
--   · caja_cortes entra a Realtime (las demás tablas ya estaban);
--   · el panel gana 'registro' — la bitácora del día: cobros, comandas,
--     cambios de estado en cocina, impresiones (y sus fallas), aperturas y
--     cierres de caja — y 'impresion_atorada' para gritar cuando el papel
--     no está saliendo.
alter publication supabase_realtime add table caja_cortes;

create or replace function public.fn_panel_en_vivo(p_todos_los_pedidos boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_inicio timestamptz := ((now() at time zone 'America/Merida')::date)::timestamp at time zone 'America/Merida';
  v_turno timestamptz;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver el panel en vivo';
  end if;

  select cc.abierto_en into v_turno
  from caja_cortes cc where cc.estado = 'abierta'
  order by cc.abierto_en desc limit 1;
  v_turno := coalesce(v_turno, v_inicio);

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

    'turno', (
      select jsonb_build_object('ordenes', count(*), 'total', coalesce(sum(o.total), 0))
      from ordenes o
      where o.pagado and not o.es_demo and o.created_at >= v_turno
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
          and (not p_todos_los_pedidos or o.created_at >= v_turno)
        order by o.folio desc
        limit case when p_todos_los_pedidos then 200 else 8 end
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
    ),

    -- Trabajos que llevan más de 90 s esperando: el agente caído o la
    -- impresora tragándose el papel. Cero = todo fluye.
    'impresion_atorada', (
      select count(*)
      from trabajos_impresion t
      where t.estado in ('pending', 'retry')
        and t.created_at < now() - interval '90 seconds'
    ),

    -- La bitácora del día, más nuevo primero.
    'registro', (
      select coalesce(jsonb_agg(ev order by (ev->>'ts') desc), '[]'::jsonb)
      from (
        select jsonb_build_object('ts', x.ts, 'hora', to_char(x.ts at time zone 'America/Merida', 'HH24:MI:SS'),
                                  'tipo', x.tipo, 'texto', x.texto) as ev
        from (
          select p.created_at as ts, 'cobro' as tipo,
                 'Cobro ' || p.metodo || ' $' || p.monto || ' — folio ' || o.folio ||
                 coalesce(' · ' || nullif(trim(o.nombre_cliente), ''), '') as texto
          from pagos p join ordenes o on o.id = p.orden_id
          where p.estado = 'aprobado' and p.created_at >= v_inicio and not o.es_demo
          union all
          select pc.created_at, 'comanda',
                 'Comanda a ' || k.nombre || ' — folio ' || o.folio
          from pedidos_cocina pc
          join ordenes o on o.id = pc.orden_id
          join cocinas k on k.id = pc.cocina_id
          where pc.created_at >= v_inicio
          union all
          select pc.updated_at, 'cocina',
                 initcap(replace(pc.estado::text, '_', ' ')) || ' en ' || k.nombre || ' — folio ' || o.folio
          from pedidos_cocina pc
          join ordenes o on o.id = pc.orden_id
          join cocinas k on k.id = pc.cocina_id
          where pc.updated_at >= v_inicio and pc.updated_at > pc.created_at
          union all
          select t.printed_at, 'impresion',
                 'Impresa comanda del folio ' || coalesce(t.payload->>'folio', '?') ||
                 ' (' || coalesce(t.payload->>'estacion', '?') || ')'
          from trabajos_impresion t
          where t.printed_at >= v_inicio
          union all
          select t.failed_at, 'falla',
                 'FALLÓ impresión del folio ' || coalesce(t.payload->>'folio', '?') ||
                 coalesce(': ' || left(t.error_ultimo, 60), '')
          from trabajos_impresion t
          where t.failed_at >= v_inicio
          union all
          select cc.abierto_en, 'caja',
                 'Caja abierta por ' || coalesce(e.nombre, 'sin registro') || ' con fondo $' || cc.fondo_inicial
          from caja_cortes cc left join empleados e on e.id = cc.empleado_apertura_id
          where cc.abierto_en >= v_inicio
          union all
          select cc.cerrado_en, 'caja',
                 'Caja cerrada por ' || coalesce(e2.nombre, 'sin registro') || ' — contado $' || coalesce(cc.efectivo_contado, 0)
          from caja_cortes cc left join empleados e2 on e2.id = cc.empleado_cierre_id
          where cc.cerrado_en >= v_inicio
        ) x
        order by x.ts desc
        limit 40
      ) t
    )
  );
end;
$fn$;

revoke all on function public.fn_panel_en_vivo(boolean) from public;
grant execute on function public.fn_panel_en_vivo(boolean) to authenticated, service_role;