-- El expediente del cliente para su app: todo lo suyo en un viaje.
--
-- La PWA pedía lealtad, cupones, favoritos e historial por separado; en un
-- celular con red de tienda eso son cuatro esperas. Y ninguna respondía la
-- pregunta que de verdad engancha: "¿cuánto llevo, cuánto me falta, qué he
-- ahorrado". Esta función lo arma completo.
--
-- Lee SIEMPRE del usuario de la sesión (auth.uid()): no recibe cliente_id,
-- así nadie puede pedir el expediente de otra persona.
create or replace function public.fn_mi_resumen_lealtad()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_cliente clientes;
  v_meta int := 100;   -- mancuernas por cupón
begin
  select * into v_cliente from clientes where auth_user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('registrado', false);
  end if;

  return jsonb_build_object(
    'registrado', true,
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'nombre', v_cliente.nombre,
      'codigo', v_cliente.codigo,
      'telefono', v_cliente.telefono,
      'mancuernas', v_cliente.mancuernas,
      'desde', to_char(v_cliente.created_at at time zone 'America/Merida', 'TMMonth YYYY')
    ),

    -- El camino al próximo premio, ya calculado: la app no debe hacer
    -- cuentas que el servidor puede dar hechas.
    'progreso', jsonb_build_object(
      'meta', v_meta,
      'faltan', greatest(0, v_meta - (v_cliente.mancuernas % v_meta)),
      'pct', least(100, round(((v_cliente.mancuernas % v_meta)::numeric / v_meta) * 100))
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
        'codigo', c.codigo,
        'beneficio', c.beneficio,
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
          'folio', o.folio,
          'orden_id', o.id,
          'fecha', to_char(o.created_at at time zone 'America/Merida', 'DD/MM/YYYY HH24:MI'),
          'total', o.total,
          'items', (
            select coalesce(string_agg(
              case when oi.cantidad > 1 then oi.cantidad || '× ' else '' end || coalesce(pr.nombre, '?'),
              ' · ' order by pr.nombre), '')
            from orden_items oi
            left join productos pr on pr.id = oi.producto_id
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

    'movimientos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'puntos', m.puntos,
        'descripcion', coalesce(m.descripcion, m.tipo),
        'fecha', to_char(m.created_at at time zone 'America/Merida', 'DD/MM/YYYY')
      ) order by m.created_at desc), '[]'::jsonb)
      from (select * from mancuernas_movimientos where cliente_id = v_cliente.id
            order by created_at desc limit 20) m
    )
  );
end;
$fn$;

revoke all on function public.fn_mi_resumen_lealtad() from public;
grant execute on function public.fn_mi_resumen_lealtad() to authenticated, service_role;