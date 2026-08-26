-- El tablero de Rewards para gerencia.
--
-- Lo importante aqui no es el numero bonito: es el SALDO EN LA CALLE. Las
-- mancuernas compradas son dinero que ya entro a la caja pero que todavia
-- se debe en producto. Es un pasivo, y hay que poder verlo aparte de las
-- ganadas, que son promocion y no le deben nada a nadie.
create or replace function fn_rewards_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_tasa int := fn_tasa_mancuernas();
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede ver esto';
  end if;

  return jsonb_build_object(
    'tasa', v_tasa,

    'en_la_calle', (
      select jsonb_build_object(
        'compradas', coalesce(sum(saldo_mancuernas), 0),
        'compradas_pesos', round(coalesce(sum(saldo_mancuernas),0)::numeric / v_tasa, 2),
        'ganadas', coalesce(sum(mancuernas), 0),
        'ganadas_pesos', round(coalesce(sum(mancuernas),0)::numeric / v_tasa, 2),
        'clientes_con_saldo', count(*) filter (where coalesce(saldo_mancuernas,0) > 0)
      ) from clientes where activo
    ),

    'sellos', (
      select jsonb_build_object(
        'bebida_listas', count(*) filter (where sellos_bebida >= 13),
        'alimento_listas', count(*) filter (where sellos_alimento >= 13),
        'con_sellos', count(*) filter (where sellos_bebida > 0 or sellos_alimento > 0)
      ) from clientes where activo
    ),

    'tarjetas', (
      select coalesce(jsonb_agg(x order by x->>'lote'), '[]'::jsonb) from (
        select jsonb_build_object(
          'lote', coalesce(lote, '(sin lote)'),
          'mancuernas', mancuernas,
          'total', count(*),
          'nuevas', count(*) filter (where estado = 'nueva'),
          'canjeadas', count(*) filter (where estado = 'canjeada'),
          'anuladas', count(*) filter (where estado = 'anulada'),
          -- Lo que falta por canjear de este lote tambien es pasivo.
          'pendiente_pesos', round((count(*) filter (where estado='nueva') * mancuernas)::numeric / v_tasa, 2)
        ) as x
        from tarjetas_regalo group by lote, mancuernas
      ) t
    ),

    'ultimos_movimientos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cliente', c.nombre,
        'mancuernas', s.mancuernas,
        'tipo', s.tipo,
        'descripcion', s.descripcion,
        'cuando', to_char(s.created_at at time zone 'America/Merida', 'DD/MM HH24:MI')
      ) order by s.created_at desc), '[]'::jsonb)
      from (select * from saldo_movimientos order by created_at desc limit 20) s
      join clientes c on c.id = s.cliente_id
    )
  );
end;
$$;
grant execute on function fn_rewards_admin() to authenticated;