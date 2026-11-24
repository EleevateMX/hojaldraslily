-- Hojaldr-IA: herramientas de SOLO LECTURA para consultar la base.
--
-- La casa quiere que la asistente conteste cosas como «¿dónde quedó el folio
-- tal?» — consultas, nunca cambios. Estas funciones son el único canal por el
-- que la Edge Function `hojaldria-chat` toca la base, y las tres cosas que las
-- hacen seguras:
--   1. Solo LEEN (select). No hay insert/update/delete en ninguna.
--   2. Exigen `fn_es_staff()`: la cajera/gerencia que ya entró a Admin, no anon.
--   3. `security definer` + `revoke from public, anon`: la puerta es el rol,
--      no el GRANT (la lección de §5 de CLAUDE.md: un grant suma, no quita).
--
-- Devuelven jsonb para que el modelo lo lea y lo explique en palabras.

-- ── ¿Dónde quedó el folio N? ────────────────────────────────────────────────
-- Contesta: existe o no; y si existe, en qué quedó (pagado, cancelado,
-- modificado), cuánto, cómo se pagó, a qué hora. Si NO existe, dice si es un
-- hueco (un folio que se pidió pero no se llegó a cobrar / se revirtió — no es
-- venta ni dinero perdido) o un folio que todavía no llega.
create or replace function public.fn_ia_buscar_folio(p_folio integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_max integer;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede consultar folios.';
  end if;

  select max(folio) into v_max from ordenes;

  select jsonb_build_object(
    'existe', true,
    'folio', o.folio,
    'estado', o.estado::text,
    'pagado', o.pagado,
    'cancelada', o.cancelada_en is not null,
    'cancelada_motivo', o.cancelada_motivo,
    'modificada', o.modificada_en is not null,
    'total', o.total,
    'canal', o.canal::text,
    'metodo_pago', o.metodo_pago::text,
    'cliente', o.nombre_cliente,
    'es_demo', o.es_demo,
    'cuando', to_char(o.created_at at time zone 'America/Merida', 'DD/MM/YYYY hh12:mi am')
  )
  into v
  from ordenes o
  where o.folio = p_folio
  order by o.created_at desc
  limit 1;

  if v is not null then
    return v;
  end if;

  -- No hay fila con ese folio.
  return jsonb_build_object(
    'existe', false,
    'folio', p_folio,
    'folio_max_actual', v_max,
    'caso', case when p_folio <= coalesce(v_max, 0) then 'hueco' else 'aun_no_existe' end
  );
end;
$$;

revoke all on function public.fn_ia_buscar_folio(integer) from public, anon;
grant execute on function public.fn_ia_buscar_folio(integer) to authenticated;

-- ── ¿Cuánto se vendió el día X? ─────────────────────────────────────────────
-- Ventas pagadas, sin canceladas, del día en Mérida (la misma regla de día que
-- el inventario y el corte). Total, número de folios y desglose por método.
create or replace function public.fn_ia_resumen_dia(p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede consultar las ventas.';
  end if;

  with pagadas as (
    select o.folio, o.total, o.metodo_pago::text as metodo
    from ordenes o
    where o.pagado
      and o.cancelada_en is null
      and (o.created_at at time zone 'America/Merida')::date = p_fecha
  )
  select jsonb_build_object(
    'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
    'num_folios', (select count(*) from pagadas),
    'total', coalesce((select sum(total) from pagadas), 0),
    'por_metodo', coalesce(
      (select jsonb_agg(jsonb_build_object('metodo', metodo, 'total', t, 'folios', c) order by t desc)
       from (select metodo, sum(total) t, count(*) c from pagadas group by metodo) m),
      '[]'::jsonb
    )
  )
  into v;

  return v;
end;
$$;

revoke all on function public.fn_ia_resumen_dia(date) from public, anon;
grant execute on function public.fn_ia_resumen_dia(date) to authenticated;
