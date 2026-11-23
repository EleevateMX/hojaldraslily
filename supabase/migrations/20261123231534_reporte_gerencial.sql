-- Reporte gerencial con datos REALES: una sola función de solo lectura que
-- arma todo el JSON que pinta Admin → Reporte gerencial, a partir de las
-- órdenes pagadas (no canceladas) del periodo, en hora de Mérida.
--
-- Devuelve: KPIs del periodo con delta vs el periodo inmediato anterior,
-- mapa de calor día-de-la-semana × hora, ventas promedio por día de la
-- semana, producto estrella por día, composición por categoría y por canal,
-- lo que más subió/bajó (movers) y unos titulares (insights).
--
-- Es SECURITY DEFINER con guard de staff (como el resto de lo gerencial): el
-- Reporte lo abre gerencia/contabilidad, nunca `anon`.

create or replace function public.fn_reporte_gerencial(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  if not fn_es_staff() then raise exception 'Solo el personal puede ver el reporte'; end if;
  with params as (select p_desde as d0, p_hasta as d1, (p_hasta - p_desde + 1) as n),
  ok as (
    select o.id, o.total, o.canal::text as canal,
      (o.created_at at time zone 'America/Merida') as tsl,
      (o.created_at at time zone 'America/Merida')::date as dia
    from ordenes o, params
    where o.pagado and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date between d0 and d1),
  prev as (select o.id, o.total from ordenes o, params
    where o.pagado and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date between (d0 - n) and (d0 - 1)),
  tot as (select coalesce(sum(total),0) as ventas, count(*)::int as ordenes from ok),
  totp as (select coalesce(sum(total),0) as ventas from prev),
  por_dia as (select dia, sum(total) as t from ok group by dia),
  mejor as (select dia, t from por_dia order by t desc limit 1),
  calor as (select jsonb_agg(jsonb_build_object('dia', d, 'hora', h, 'total', round(t))) j from (
      select (extract(isodow from tsl)::int - 1) as d, extract(hour from tsl)::int as h, sum(total) as t
      from ok where extract(hour from tsl) between 7 and 21 group by 1,2) z),
  dow_daily as (select (extract(isodow from tsl)::int -1) as d, dia, sum(total) as t from ok group by 1, dia),
  dow_avg as (select d, avg(t) as prom from dow_daily group by d),
  dow_pico as (select d from dow_avg order by prom desc limit 1),
  por_dow as (select jsonb_agg(jsonb_build_object('dia', (array['lun','mar','mié','jue','vie','sáb','dom'])[d+1], 'promedio', round(prom), 'esPico', (d = (select d from dow_pico))) order by d) j from dow_avg),
  prod_dia as (select distinct on (d) d, nombre, u from (
      select (extract(isodow from oo.tsl)::int -1) as d, p.nombre, sum(oi.cantidad) as u
      from ok oo join orden_items oi on oi.orden_id=oo.id join productos p on p.id=oi.producto_id
      group by 1, p.nombre) q order by d, u desc),
  prod_dia_j as (select jsonb_agg(jsonb_build_object('dia', (array['lun','mar','mié','jue','vie','sáb','dom'])[d+1], 'producto', nombre, 'unidades', u) order by d) j from prod_dia),
  cat as (select coalesce(c.nombre,'Sin categoría') as nombre, sum(oi.cantidad*oi.precio_unitario) as t
    from ok oo join orden_items oi on oi.orden_id=oo.id join productos p on p.id=oi.producto_id left join categorias c on c.id=p.categoria_id group by 1),
  cat_tot as (select coalesce(sum(t),0) as s from cat),
  cat_j as (select jsonb_agg(jsonb_build_object('etiqueta', nombre, 'pct', case when (select s from cat_tot)>0 then round(t/(select s from cat_tot)*100) else 0 end, 'total', round(t)) order by t desc) j
    from (select * from cat order by t desc limit 6) z),
  can as (select canal, sum(total) as t from ok group by canal),
  can_tot as (select coalesce(sum(t),0) as s from can),
  can_j as (select jsonb_agg(jsonb_build_object('etiqueta', case canal when 'pos' then 'Mostrador' when 'rappi' then 'Rappi' when 'kiosko' then 'Kiosko' when 'delivery' then 'Delivery' else canal end,
       'pct', case when (select s from can_tot)>0 then round(t/(select s from can_tot)*100) else 0 end, 'total', round(t)) order by t desc) j from can),
  cur_u as (select p.nombre, sum(oi.cantidad) as u from ok oo join orden_items oi on oi.orden_id=oo.id join productos p on p.id=oi.producto_id group by p.nombre),
  prev_u as (select p.nombre, sum(oi.cantidad) as u from prev oo join orden_items oi on oi.orden_id=oo.id join productos p on p.id=oi.producto_id group by p.nombre),
  movers as (select c.nombre, c.u as cu, coalesce(pv.u,0) as pu,
      case when coalesce(pv.u,0) > 0 then round((c.u - pv.u)::numeric / pv.u * 100, 1) else null end as pct
    from cur_u c left join prev_u pv on pv.nombre=c.nombre),
  sub_j as (select jsonb_agg(jsonb_build_object('producto', nombre, 'pct', pct)) j from (select * from movers where pct is not null and pct > 0 order by pct desc limit 3) z),
  baj_j as (select jsonb_agg(jsonb_build_object('producto', nombre, 'pct', pct)) j from (select * from movers where pct is not null and pct < 0 order by pct asc limit 3) z),
  peak as (select extract(hour from tsl)::int as h, sum(total) as t from ok group by 1 order by t desc limit 1),
  star as (select nombre, u from cur_u order by u desc limit 1),
  ins as (
    select 1 ord, 'alza' tono, 'El '||(array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[(select d from dow_pico)+1]||' es tu mejor día' titulo, 'Es el día de mayor venta promedio del periodo.' detalle where exists(select 1 from dow_pico)
    union all select 2,'dato','Hora pico: '|| (select case when h<12 then h||' a.m.' when h=12 then '12 p.m.' else (h-12)||' p.m.' end from peak), 'Es la franja de más ventas del día.' where exists(select 1 from peak)
    union all select 3,'alza', (select nombre from star)||' es tu producto estrella', 'Es lo más vendido del periodo.' where exists(select 1 from star)
    union all select 4,'dato','El periodo va '|| round(((select ventas from tot)-(select ventas from totp))/nullif((select ventas from totp),0)*100) ||'% vs el anterior', 'Comparado con el periodo inmediato anterior.' where (select ventas from totp) > 0),
  ins_j as (select jsonb_agg(jsonb_build_object('tono',tono,'titulo',titulo,'detalle',detalle) order by ord) j from ins)
  select jsonb_build_object(
    'periodo', to_char(p_desde,'DD Mon') || ' - ' || to_char(p_hasta,'DD Mon YYYY'),
    'horas', (select jsonb_agg(h) from generate_series(7,21) h),
    'dias', jsonb_build_array('lun','mar','mié','jue','vie','sáb','dom'),
    'calor', coalesce((select j from calor),'[]'::jsonb),
    'porDiaSemana', coalesce((select j from por_dow),'[]'::jsonb),
    'productoPorDia', coalesce((select j from prod_dia_j),'[]'::jsonb),
    'categorias', coalesce((select j from cat_j),'[]'::jsonb),
    'canales', coalesce((select j from can_j),'[]'::jsonb),
    'subieron', coalesce((select j from sub_j),'[]'::jsonb),
    'bajaron', coalesce((select j from baj_j),'[]'::jsonb),
    'insights', coalesce((select j from ins_j),'[]'::jsonb),
    'kpis', jsonb_build_array(
      jsonb_build_object('lbl','Ventas del periodo','val','$'||to_char(round((select ventas from tot)),'FM999,999,999'),'sub','acumulado',
        'delta', case when (select ventas from totp) > 0 then jsonb_build_object('pct', round(((select ventas from tot)-(select ventas from totp))/(select ventas from totp)*100,1), 'buenoSiSube', true) else null end),
      jsonb_build_object('lbl','Órdenes','val',(select ordenes from tot)::text,'sub','en el periodo'),
      jsonb_build_object('lbl','Ticket promedio','val','$'||to_char(case when (select ordenes from tot)>0 then round((select ventas from tot)/(select ordenes from tot)) else 0 end,'FM999,999,999'),'sub','por orden'),
      jsonb_build_object('lbl','Mejor día','val', coalesce((select to_char(dia,'DD Mon') from mejor),'-'),'sub', '$'||to_char(round(coalesce((select t from mejor),0)),'FM999,999,999'))
    )
  ) into v;
  return v;
end $fn$;

revoke all on function public.fn_reporte_gerencial(date, date) from public, anon;
grant execute on function public.fn_reporte_gerencial(date, date) to authenticated;
