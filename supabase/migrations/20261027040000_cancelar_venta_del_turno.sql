-- Cancelar una venta del turno (devolución), con PIN de gerencia
--
-- La casa lo pidió: va un cliente, compra, se imprime el ticket y —como no ha
-- salido de la tienda— quiere su dinero de vuelta (una hojaldra cruda) o
-- cambiar por otra cosa. La cancelación es la base de las dos.
--
-- ## Por qué NO hay que revertir el inventario a mano
--
-- El inventario de cuadros NO es un total que un trigger decrementa: se
-- CALCULA de las órdenes `pagado = true` (fn_catalogo_del_dia,
-- fn_existencias_por_molde). Así que marcar la orden como NO pagada hace que
-- el stock vuelva solo, sin movimientos inversos que puedan descuadrarse.
--
-- ## Por qué el corte cuadra
--
-- El corte suma los pagos `estado = 'aprobado'`. Al cancelar se pone el pago
-- en 'cancelado', así que deja de contar: el `efectivo_esperado` baja justo lo
-- que se le devolvió al cliente, y el cajón —ya con ese dinero afuera— cuadra.
--
-- ## Por qué SOLO del turno actual
--
-- Quitarle el pago a un corte YA CERRADO cambiaría la historia de un turno que
-- alguien ya firmó. Una devolución de otro día es otra conversación (y toca al
-- banco si fue tarjeta). Aquí se exige que la venta sea del corte abierto.

alter table ordenes add column if not exists cancelada_en timestamptz;
alter table ordenes add column if not exists cancelada_motivo text;
alter table ordenes add column if not exists cancelada_por uuid references empleados(id);

comment on column ordenes.cancelada_en is 'Cuándo se canceló la venta. Null = vigente.';
comment on column ordenes.cancelada_motivo is 'Por qué se canceló (lo escribe el cajero).';
comment on column ordenes.cancelada_por is 'El empleado de gerencia que autorizó la cancelación.';

/**
 * Cancela una venta pagada del turno actual y la devuelve.
 *
 * `p_autorizado_por` es el empleado de GERENCIA que metió su PIN en la caja
 * (ModalAutorizacion ya lo verificó del lado del cliente; aquí se re-verifica
 * que de verdad sea gerencia, que es la capa que no se puede saltar). La
 * devolución en efectivo/tarjeta es física, en el mostrador; el sistema solo
 * deja de contar la venta.
 */
create or replace function public.fn_cancelar_orden(
  p_orden_id uuid,
  p_motivo text,
  p_autorizado_por uuid
) returns ordenes
language plpgsql security definer set search_path to 'public' as $$
declare
  v ordenes;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cancelar una venta.';
  end if;
  if not exists (
    select 1 from empleados e join roles r on r.id = e.rol_id
    where e.id = p_autorizado_por and e.activo and r.slug in ('administrador', 'gerente')
  ) then
    raise exception 'La cancelación la autoriza gerencia con su PIN.';
  end if;

  select * into v from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if v.estado = 'cancelada' then
    raise exception 'Esa venta ya estaba cancelada.';
  end if;
  if not v.pagado then
    raise exception 'Esa venta no está pagada; no hay nada que devolver.';
  end if;
  -- Solo del turno actual: su corte tiene que seguir abierto.
  if not exists (select 1 from caja_cortes c where c.id = v.corte_id and c.estado = 'abierta') then
    raise exception 'Solo se cancela una venta del turno actual: su corte ya se cerró.';
  end if;

  -- El pago deja de contar en el corte; el inventario se restaura solo al
  -- quedar la orden en pagado = false.
  update pagos set estado = 'cancelado' where orden_id = p_orden_id and estado = 'aprobado';
  update ordenes
    set pagado = false,
        estado = 'cancelada',
        cancelada_en = now(),
        cancelada_motivo = nullif(btrim(p_motivo), ''),
        cancelada_por = p_autorizado_por,
        updated_at = now()
    where id = p_orden_id
    returning * into v;

  return v;
end$$;

revoke all on function public.fn_cancelar_orden(uuid, text, uuid) from public, anon;
grant execute on function public.fn_cancelar_orden(uuid, text, uuid) to authenticated;

/**
 * El historial de ventas de un turno, para el «Historial de tickets» de la
 * caja: lo pagado y lo cancelado del corte, con sus renglones, de lo más
 * reciente a lo más viejo. Los encargos no entran (tienen su propia pantalla).
 */
create or replace function public.fn_ventas_del_turno(p_corte_id uuid)
returns table (
  id uuid,
  folio integer,
  created_at timestamptz,
  total numeric,
  metodo_pago metodo_pago,
  canal canal_orden,
  pagado boolean,
  estado estado_orden,
  cancelada_motivo text,
  items jsonb
)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.folio, o.created_at, o.total, o.metodo_pago, o.canal,
         o.pagado, o.estado, o.cancelada_motivo,
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
    and (o.pagado or o.estado = 'cancelada')
  order by o.created_at desc
$$;

revoke all on function public.fn_ventas_del_turno(uuid) from public, anon;
grant execute on function public.fn_ventas_del_turno(uuid) to authenticated;
