-- FASE 1 de blindaje: cerrar el acceso anonimo a los datos personales.
--
-- Evidencia (edge_logs, ventana de 24 h):
--   clientes                -> 0 lecturas REST
--   mancuernas_movimientos  -> 0 lecturas REST
--   cupones                 -> 4 lecturas, siempre con cliente_id=eq.<uuid>,
--                              es decir la app del cliente, ya cubierta por
--                              la politica `sel_cupones_propio` (authenticated).
-- Ademas `cupones` esta vacia, asi que cerrarla ahora no rompe canjes.

drop policy if exists sel_clientes_caja      on public.clientes;
drop policy if exists sel_cupones_caja       on public.cupones;
drop policy if exists sel_mancuernas_caja    on public.mancuernas_movimientos;

-- Reemplazo para la caja: consulta puntual por codigo exacto, sin barridos.
-- Devuelve solo lo necesario para cobrar; nada de correo ni telefono.
create or replace function public.fn_validar_cupon(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cup public.cupones%rowtype;
  v_cli public.clientes%rowtype;
begin
  if length(coalesce(btrim(p_codigo),'')) < 6 then
    return jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  end if;

  select * into v_cup from public.cupones
   where codigo = upper(btrim(p_codigo));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  if v_cup.estado <> 'activo' then
    return jsonb_build_object('ok', false, 'error', 'ya_' || v_cup.estado::text);
  end if;
  if v_cup.vence_en <= now() then
    return jsonb_build_object('ok', false, 'error', 'vencido');
  end if;

  select * into v_cli from public.clientes where id = v_cup.cliente_id;

  return jsonb_build_object(
    'ok', true,
    'cupon', jsonb_build_object('id', v_cup.id, 'codigo', v_cup.codigo,
                                'tipo', v_cup.tipo::text, 'beneficio', v_cup.beneficio,
                                'vence_en', v_cup.vence_en),
    -- Solo nombre y codigo publico. El correo NO sale de la base.
    'cliente', jsonb_build_object('id', v_cli.id, 'nombre', v_cli.nombre, 'codigo', v_cli.codigo));
end;
$$;

grant execute on function public.fn_validar_cupon(text) to anon, authenticated;

notify pgrst, 'reload schema';