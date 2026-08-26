-- Lo que la caja necesita saber de un cliente para cobrarle, en un viaje.
--
-- El cajero tiene a alguien enfrente esperando: no puede ser una consulta
-- para el saldo, otra para los sellos y otra para el catalogo de premios.
--
-- Devuelve tambien QUE productos cuentan como premio, porque el canje de
-- sellos exige que el premio ya este en la orden: la caja tiene que poder
-- decir "de lo que traes en el carrito, estos pueden ir gratis".
create or replace function fn_rewards_para_caja(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_c clientes;
  v_tasa int := fn_tasa_mancuernas();
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede consultar esto';
  end if;

  select * into v_c from clientes where id = p_cliente_id and activo;
  if not found then return jsonb_build_object('existe', false); end if;

  return jsonb_build_object(
    'existe', true,
    'nombre', v_c.nombre,
    'codigo', v_c.codigo,
    'foto', v_c.foto_url,
    'tasa', v_tasa,
    'ganadas', coalesce(v_c.mancuernas, 0),
    'compradas', coalesce(v_c.saldo_mancuernas, 0),
    'total', coalesce(v_c.mancuernas,0) + coalesce(v_c.saldo_mancuernas,0),
    'vale_pesos', round((coalesce(v_c.mancuernas,0) + coalesce(v_c.saldo_mancuernas,0))::numeric / v_tasa, 2),

    'sellos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', cs.tipo,
        'tiene', case when cs.tipo='bebida' then v_c.sellos_bebida else v_c.sellos_alimento end,
        'requeridos', cs.requeridos,
        'listo', (case when cs.tipo='bebida' then v_c.sellos_bebida else v_c.sellos_alimento end) >= cs.requeridos,
        -- Los productos que pueden ir gratis con esta tarjeta.
        'premios', (
          select coalesce(jsonb_agg(ps.producto_id), '[]'::jsonb)
          from premios_sellos ps join productos p on p.id = ps.producto_id
          where ps.tipo = cs.tipo and ps.activo and p.activo
        )
      ) order by cs.tipo desc), '[]'::jsonb)
      from config_sellos cs where cs.activo
    )
  );
end;
$$;
grant execute on function fn_rewards_para_caja(uuid) to authenticated;