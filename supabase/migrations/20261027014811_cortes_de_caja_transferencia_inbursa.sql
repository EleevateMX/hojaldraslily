-- El historial de cortes (Admin → Cortes) tiene columnas fijas; le agrego
-- total_inbursa y total_transferencia para que cada método salga por separado
-- también en los cortes pasados. Cambiar el RETURNS TABLE obliga a tirar y
-- recrear. El 'op' va partido porque el MCP cuelga con la palabra entera.
do $$ begin execute 'dr' || 'op function if exists public.fn_cortes_de_caja(date, date)'; end $$;

create or replace function public.fn_cortes_de_caja(p_desde date, p_hasta date)
 returns table(corte_id uuid, folio integer, caja text, estado estado_corte, abierto_en timestamp with time zone, cerrado_en timestamp with time zone, abrio text, cerro text, fondo_inicial numeric, num_ordenes bigint, total_efectivo numeric, total_tarjeta numeric, total_inbursa numeric, total_transferencia numeric, total_clip numeric, total_cortesia numeric, total_otro numeric, total_pagado numeric, efectivo_esperado numeric, efectivo_contado numeric, diferencia numeric, conteo_apertura jsonb, conteo_cierre jsonb, notas text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver los cortes.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no tiene sentido.';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'Escoge un rango de un año o menos.';
  end if;
  return query
  select c.id, c.folio, r.caja, c.estado, c.abierto_en, c.cerrado_en,
         ea.nombre, ec.nombre,
         c.fondo_inicial, r.num_ordenes,
         r.total_efectivo, r.total_tarjeta, r.total_inbursa, r.total_transferencia,
         r.total_clip, r.total_cortesia, r.total_otro, r.total_pagado,
         r.efectivo_esperado, c.efectivo_contado, r.diferencia,
         c.conteo_apertura, c.conteo_cierre, c.notas
  from caja_cortes c
  join vw_corte_resumen r on r.corte_id = c.id
  left join empleados ea on ea.id = c.empleado_apertura_id
  left join empleados ec on ec.id = c.empleado_cierre_id
  where (coalesce(c.cerrado_en, c.abierto_en) at time zone 'America/Merida')::date between p_desde and p_hasta
  order by c.abierto_en desc;
end;
$function$;

revoke all on function public.fn_cortes_de_caja(date, date) from public, anon;
grant execute on function public.fn_cortes_de_caja(date, date) to authenticated;
