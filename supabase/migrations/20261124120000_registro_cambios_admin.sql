-- Registro de cancelaciones y modificaciones, para Admin (histórico, no solo
-- el turno de la caja).
--
-- La casa pidió «registro de modificaciones/cancelaciones». Ya se guardaba
-- todo (ordenes.cancelada_en/motivo/por y modificada_en/por), pero solo se
-- veía dentro del turno abierto en la caja (fn_ventas_del_turno). Esto lo
-- expone como histórico por rango de fechas en Admin: qué se canceló o
-- modificó, cuándo, de qué folio, por cuánto, con qué método y QUIÉN lo
-- autorizó.
--
-- Es gerencia: un registro de quién autorizó devoluciones es justo lo que no
-- debe ver cualquier staff. Guard con fn_es_jefe() (no fn_es_staff).
--
-- El día del evento se decide en Mérida (cancelada_en/modificada_en), igual
-- que el inventario y la facturación: «qué se canceló esta semana» es por la
-- fecha en que se canceló, no por la fecha de la venta.

create or replace function public.fn_registro_cambios(p_desde date, p_hasta date)
returns table (
  tipo text,
  cuando timestamptz,
  folio integer,
  total numeric,
  metodo_pago metodo_pago,
  canal canal_orden,
  motivo text,
  autorizo text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver el registro de cambios.';
  end if;
  return query
    select 'cancelada'::text, o.cancelada_en, o.folio, o.total, o.metodo_pago, o.canal,
           o.cancelada_motivo, e.nombre, o.created_at
      from ordenes o
      left join empleados e on e.id = o.cancelada_por
     where o.cancelada_en is not null
       and (o.cancelada_en at time zone 'America/Merida')::date between p_desde and p_hasta
       and coalesce(o.es_demo, false) = false
    union all
    select 'modificada'::text, o.modificada_en, o.folio, o.total, o.metodo_pago, o.canal,
           null::text, e.nombre, o.created_at
      from ordenes o
      left join empleados e on e.id = o.modificada_por
     where o.modificada_en is not null
       and (o.modificada_en at time zone 'America/Merida')::date between p_desde and p_hasta
       and coalesce(o.es_demo, false) = false
    order by 2 desc;
end$$;

revoke all on function public.fn_registro_cambios(date, date) from public, anon;
grant execute on function public.fn_registro_cambios(date, date) to authenticated;
