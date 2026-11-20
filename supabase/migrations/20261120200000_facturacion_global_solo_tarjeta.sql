-- La factura GLOBAL (a público en general) solo ampara lo cobrado con TARJETA:
-- Banorte (metodo 'tarjeta') e Inbursa (metodo 'inbursa'). El efectivo (y
-- transferencia/Rappi) no se declara aquí. Antes cada folio entraba por su
-- total completo; ahora entra por la suma de sus pagos con tarjeta, y un folio
-- sin nada de tarjeta (p. ej. todo en efectivo) no entra. Para un pago mixto
-- solo cuenta la parte de tarjeta.
--
-- Esto SOLO toca la global (fn_facturacion_dia / fn_facturacion_periodo); la
-- factura nominativa a un cliente sigue por el total del folio (es su compra).

create or replace function public.fn_facturacion_dia(p_fecha date)
 returns table(folio integer, total numeric, hora text, canal text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not fn_es_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el personal puede consultar la facturación del día' using errcode = '42501';
  end if;
  return query
    select o.folio, t.monto_tarjeta as total,
           to_char(o.created_at at time zone 'America/Merida', 'HH12:MI AM') as hora,
           o.canal::text as canal
    from ordenes o
    join lateral (
      select coalesce(sum(m.monto), 0) as monto_tarjeta
      from vw_pagos_por_metodo m
      where m.orden_id = o.id
        and m.estado = 'aprobado'
        and m.metodo::text in ('tarjeta', 'inbursa')
    ) t on true
    where o.pagado = true
      and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date = p_fecha
      and t.monto_tarjeta > 0
      and not exists (select 1 from facturas_nominativas n
                      where n.folio_venta = o.folio and n.estatus = 'timbrada')
      and not exists (select 1 from facturas_globales_folios g
                      where g.folio_venta = o.folio)
    order by o.folio;
end;
$function$;

create or replace function public.fn_facturacion_periodo(p_desde date, p_hasta date)
 returns table(folio integer, total numeric, fecha date, hora text, canal text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not fn_puede_facturar() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo gerencia o contabilidad pueden facturar' using errcode = '42501';
  end if;
  if p_hasta < p_desde then
    raise exception 'El fin del periodo es antes del inicio' using errcode = '22007';
  end if;
  return query
    select o.folio, t.monto_tarjeta as total,
           (o.created_at at time zone 'America/Merida')::date as fecha,
           to_char(o.created_at at time zone 'America/Merida', 'HH12:MI AM') as hora,
           o.canal::text as canal
    from ordenes o
    join lateral (
      select coalesce(sum(m.monto), 0) as monto_tarjeta
      from vw_pagos_por_metodo m
      where m.orden_id = o.id
        and m.estado = 'aprobado'
        and m.metodo::text in ('tarjeta', 'inbursa')
    ) t on true
    where o.pagado = true
      and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date between p_desde and p_hasta
      and t.monto_tarjeta > 0
      and not exists (select 1 from facturas_nominativas n
                      where n.folio_venta = o.folio and n.estatus = 'timbrada')
      and not exists (select 1 from facturas_globales_folios g
                      where g.folio_venta = o.folio)
    order by o.folio;
end;
$function$;
