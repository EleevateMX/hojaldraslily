-- El expediente del cliente ahora incluye las dos bolsas, los sellos y los
-- paquetes de recarga: la app tiene que poder pintar la tarjeta completa
-- sin hacer cinco consultas más.
create or replace function public.fn_mi_resumen_lealtad()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_cliente clientes;
  v_meta int := 100;
  v_tasa int := fn_tasa_mancuernas();
begin
  select * into v_cliente from clientes where auth_user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('registrado', false);
  end if;

  return jsonb_build_object(
    'registrado', true,
    'tasa', v_tasa,

    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'nombre', v_cliente.nombre,
      'codigo', v_cliente.codigo,
      'telefono', v_cliente.telefono,
      'mancuernas', v_cliente.mancuernas,
      'saldo', v_cliente.saldo_mancuernas,
      'total_canjeable', coalesce(v_cliente.mancuernas,0) + coalesce(v_cliente.saldo_mancuernas,0),
      'vale_pesos', round((coalesce(v_cliente.mancuernas,0) + coalesce(v_cliente.saldo_mancuernas,0))::numeric / v_tasa, 2),
      'desde', to_char(v_cliente.created_at at time zone 'America/Merida', 'TMMonth YYYY')
    ),

    'progreso', jsonb_build_object(
      'meta', v_meta,
      'faltan', greatest(0, v_meta - (v_cliente.mancuernas % v_meta)),
      'pct', least(100, round(((v_cliente.mancuernas % v_meta)::numeric / v_meta) * 100))
    ),

    -- Las dos tarjetas de sellos, con lo que falta y si ya se puede cobrar.
    'sellos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', cs.tipo,
        'tiene', case when cs.tipo = 'bebida' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end,
        'requeridos', cs.requeridos,
        'faltan', greatest(0, cs.requeridos - case when cs.tipo = 'bebida' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end),
        'listo', (case when cs.tipo = 'bebida' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end) >= cs.requeridos
      ) order by cs.tipo), '[]'::jsonb)
      from config_sellos cs where cs.activo
    ),

    'premios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', ps.tipo, 'nombre', p.nombre, 'precio', p.precio
      ) order by ps.tipo, p.nombre), '[]'::jsonb)
      from premios_sellos ps join productos p on p.id = ps.producto_id
      where ps.activo and p.activo
    ),

    'paquetes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', pq.nombre,
        'precio', pq.precio_mxn,
        'mancuernas', pq.mancuernas,
        'vale', round(pq.mancuernas::numeric / v_tasa, 2),
        'bono_pct', round(((pq.mancuernas::numeric / v_tasa) / pq.precio_mxn - 1) * 100)
      ) order by pq.orden), '[]'::jsonb)
      from paquetes_saldo pq where pq.activo
    ),

    'vida', (
      select jsonb_build_object(
        'visitas', count(*),
        'gastado', coalesce(sum(o.total), 0),
        'ticket', case when count(*) > 0 then round(sum(o.total) / count(*), 2) else 0 end,
        'ultima', to_char(max(o.created_at) at time zone 'America/Merida', 'DD/MM/YYYY')
      )
      from ordenes o where o.cliente_id = v_cliente.id and o.pagado and not o.es_demo
    ),

    'ganadas_total', (
      select coalesce(sum(m.puntos), 0) from mancuernas_movimientos m
      where m.cliente_id = v_cliente.id and m.puntos > 0
    ),

    'cupones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', c.codigo, 'beneficio', c.beneficio,
        'vence', to_char(c.vence_en at time zone 'America/Merida', 'DD/MM/YYYY'),
        'dias_restantes', greatest(0, extract(day from c.vence_en - now())::int)
      ) order by c.vence_en), '[]'::jsonb)
      from cupones c
      where c.cliente_id = v_cliente.id and c.estado = 'activo' and c.vence_en > now()
    ),

    'favoritos', (
      select coalesce(jsonb_agg(jsonb_build_object('nombre', f.nombre, 'veces', f.veces)
                                order by f.veces desc), '[]'::jsonb)
      from (
        select pr.nombre, sum(oi.cantidad)::int as veces
        from orden_items oi
        join ordenes o on o.id = oi.orden_id
        join productos pr on pr.id = oi.producto_id
        where o.cliente_id = v_cliente.id and o.pagado and not o.es_demo
          and oi.padre_item_id is null
        group by pr.nombre order by veces desc limit 5
      ) f
    ),

    'historial', (
      select coalesce(jsonb_agg(h order by (h->>'folio')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'folio', o.folio, 'orden_id', o.id,
          'fecha', to_char(o.created_at at time zone 'America/Merida', 'DD/MM/YYYY HH24:MI'),
          'total', o.total,
          'items', (
            select coalesce(string_agg(
              case when oi.cantidad > 1 then oi.cantidad || '× ' else '' end || coalesce(pr.nombre, '?'),
              ' · ' order by pr.nombre), '')
            from orden_items oi left join productos pr on pr.id = oi.producto_id
            where oi.orden_id = o.id and oi.padre_item_id is null
          ),
          'mancuernas', coalesce((
            select sum(m.puntos)::int from mancuernas_movimientos m
            where m.orden_id = o.id and m.cliente_id = v_cliente.id and m.puntos > 0), 0)
        ) as h
        from ordenes o
        where o.cliente_id = v_cliente.id and o.pagado and not o.es_demo
        order by o.folio desc limit 30
      ) t
    ),

    -- Movimientos de las dos bolsas, mezclados en una sola línea de tiempo:
    -- para el cliente es "lo que pasó con mis mancuernas", no dos listas.
    'movimientos', (
      select coalesce(jsonb_agg(x order by (x->>'ts') desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'ts', m.created_at, 'puntos', m.puntos,
          'descripcion', coalesce(m.descripcion, m.tipo), 'bolsa', 'ganadas',
          'fecha', to_char(m.created_at at time zone 'America/Merida', 'DD/MM/YYYY')
        ) as x
        from mancuernas_movimientos m where m.cliente_id = v_cliente.id
        union all
        select jsonb_build_object(
          'ts', s.created_at, 'puntos', s.mancuernas,
          'descripcion', coalesce(s.descripcion, s.tipo), 'bolsa', 'saldo',
          'fecha', to_char(s.created_at at time zone 'America/Merida', 'DD/MM/YYYY')
        )
        from saldo_movimientos s where s.cliente_id = v_cliente.id
        order by 1 desc limit 25
      ) t
    )
  );
end;
$fn$;