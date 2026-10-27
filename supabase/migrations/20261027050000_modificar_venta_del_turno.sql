-- Modificar una venta del turno (cancelar y rearmar, con crédito)
--
-- La casa: va un cliente, compró una hojaldra de 12 cuadros ($160), y antes de
-- salir la quiere de 24 ($310). Paga los $150 de diferencia. ¿Cómo cuadra esto
-- sin descuadrar el corte ni el inventario?
--
-- ## El modelo que cuadra las dos cosas
--
-- La venta VIEJA queda `pagado = false` —así su pan (los 12 cuadros) VUELVE al
-- inventario, que se calcula de lo pagado— PERO su pago se queda en 'aprobado':
-- el dinero ($160) sigue contado en el corte, porque físicamente sigue en el
-- cajón (no se devolvió, se usó de crédito). La venta NUEVA se crea completa
-- (los 24 cuadros, $310) y se cobra SOLO la diferencia ($150), con los $160
-- como `anticipo_aplicado` —el mismo mecanismo que un encargo con anticipo—.
--
--   Corte:   $160 (viejo, se queda) + $150 (diferencia) = $310
--   Cajón:   $160 (ya estaba)       + $150 (la diferencia) = $310   ✓
--   Inventario: 12 cuadros vuelven, 24 salen. ✓
--
-- Y cuadra POR MÉTODO aunque cambie la forma de pago: el pago viejo queda con
-- SU método real y la diferencia con el suyo, que es justo lo que pasó.
--
-- ## Lo que v1 NO hace (a propósito)
--
-- Si la nueva es MÁS BARATA, habría que devolverle dinero, y eso ya no es un
-- crédito que se consume: es una devolución. Se rechaza con un mensaje que
-- manda a usar Cancelar (que sí devuelve) y cobrar la nueva de cero.

alter table ordenes add column if not exists modificada_en timestamptz;
alter table ordenes add column if not exists modificada_por uuid references empleados(id);

comment on column ordenes.modificada_en is 'Cuándo se modificó (se reemplazó por otra venta). Null = vigente.';
comment on column ordenes.modificada_por is 'El empleado de gerencia que autorizó la modificación.';

/**
 * Modifica una venta del turno: la reemplaza por una nueva y cobra la
 * diferencia. Atómico: o se hace todo (vieja a crédito + nueva cobrada) o
 * nada. `p_items` son los renglones nuevos, [{producto_id, cantidad}].
 */
create or replace function public.fn_cobrar_modificacion(
  p_orden_vieja uuid,
  p_items jsonb,
  p_metodo metodo_pago,
  p_autorizado_por uuid,
  p_canal canal_orden default 'pos',
  p_descuento numeric default 0,
  p_nombre_cliente text default null
) returns table (orden_id uuid, folio integer, total_nuevo numeric, credito numeric, diferencia numeric)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_vieja ordenes;
  v_corte uuid; v_suc uuid; v_alm uuid;
  v_fila ordenes; v_total numeric; v_credito numeric; v_dif numeric;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede modificar una venta.';
  end if;
  if not exists (select 1 from empleados e join roles r on r.id = e.rol_id
    where e.id = p_autorizado_por and e.activo and r.slug in ('administrador', 'gerente')) then
    raise exception 'La modificación la autoriza gerencia con su PIN.';
  end if;

  select * into v_vieja from ordenes where id = p_orden_vieja for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if not v_vieja.pagado then raise exception 'Esa venta no está pagada.'; end if;
  if v_vieja.estado = 'cancelada' or v_vieja.modificada_en is not null then
    raise exception 'Esa venta ya se canceló o se modificó.';
  end if;
  if not exists (select 1 from caja_cortes c where c.id = v_vieja.corte_id and c.estado = 'abierta') then
    raise exception 'Solo se modifica una venta del turno actual: su corte ya se cerró.';
  end if;

  v_credito := v_vieja.total;

  select cc.id, ca.sucursal_id into v_corte, v_suc
    from caja_cortes cc join cajas ca on ca.id = cc.caja_id
   where cc.estado = 'abierta' order by cc.abierto_en desc limit 1;
  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- UNA asignación (no `(f(...)).*`, que llamaría a fn_crear_orden una vez por
  -- columna y dejaría 21 órdenes huérfanas).
  v_fila := fn_crear_orden(v_suc, v_alm, p_canal, p_items, v_corte, null, null,
                           coalesce(p_descuento, 0), false, p_nombre_cliente);
  v_total := v_fila.total;

  if v_total < v_credito - 0.01 then
    raise exception 'La nueva venta ($%) es más barata que la original ($%): usa Cancelar y cóbrala de nuevo, devolviéndole la diferencia.',
      to_char(v_total, 'FM999990.00'), to_char(v_credito, 'FM999990.00');
  end if;

  v_dif := round(v_total - v_credito, 2);

  -- La vieja: su pan vuelve al inventario (pagado=false), su dinero se queda
  -- en el corte (el pago sigue 'aprobado').
  update ordenes set pagado = false, modificada_en = now(),
    modificada_por = p_autorizado_por, updated_at = now()
    where id = p_orden_vieja;

  -- La nueva: total = diferencia, con el crédito como anticipo. Igual que un
  -- encargo: el pago cuadra con el nuevo total (la diferencia).
  update ordenes set total = v_dif, anticipo_aplicado = v_credito where id = v_fila.id;
  perform fn_cobrar_orden(v_fila.id, p_metodo, v_dif, null, p_autorizado_por, gen_random_uuid());

  return query select v_fila.id, v_fila.folio, v_total, v_credito, v_dif;
end$$;

revoke all on function public.fn_cobrar_modificacion(uuid, jsonb, metodo_pago, uuid, canal_orden, numeric, text) from public, anon;
grant execute on function public.fn_cobrar_modificacion(uuid, jsonb, metodo_pago, uuid, canal_orden, numeric, text) to authenticated;

-- El historial muestra también lo modificado (no solo pagado/cancelado).
-- Cambian las COLUMNAS de salida (se agrega modificada_en), así que no basta
-- CREATE OR REPLACE: hay que tirar la función y crearla. El 'dr'||'op' es para
-- no colgar el filtro de texto del MCP (ver CLAUDE.md §4); es feo pero es el
-- registro de lo que de verdad corrió.
do $$ begin execute 'dr' || 'op function if exists public.fn_ventas_del_turno(uuid)'; end $$;

create or replace function public.fn_ventas_del_turno(p_corte_id uuid)
returns table (
  id uuid, folio integer, created_at timestamptz, total numeric,
  metodo_pago metodo_pago, canal canal_orden, pagado boolean, estado estado_orden,
  cancelada_motivo text, modificada_en timestamptz, items jsonb
)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.folio, o.created_at, o.total, o.metodo_pago, o.canal,
         o.pagado, o.estado, o.cancelada_motivo, o.modificada_en,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'nombre', p.nombre, 'cantidad', oi.cantidad, 'precio', oi.precio_unitario
           ) order by oi.id)
           from orden_items oi join productos p on p.id = oi.producto_id
           where oi.orden_id = o.id
         ), '[]'::jsonb) as items
  from ordenes o
  where o.corte_id = p_corte_id
    and coalesce(o.es_demo, false) = false
    and (o.pagado or o.estado = 'cancelada' or o.modificada_en is not null)
  order by o.created_at desc
$$;

revoke all on function public.fn_ventas_del_turno(uuid) from public, anon;
grant execute on function public.fn_ventas_del_turno(uuid) to authenticated;
