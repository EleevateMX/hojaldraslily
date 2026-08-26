-- ─────────────────────────────────────────────────────────────────────────
-- El dinero entra y sale del monedero. Aquí es donde no se puede fallar.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) ACREDITAR: cuando una orden con recarga queda PAGADA, se abona.
--
-- Va colgado del pago y no del "botón de recargar" a propósito: si se
-- abonara al pedir, un cobro rechazado dejaría saldo regalado. Así el saldo
-- solo nace de dinero que de verdad entró, por el mismo camino auditado que
-- cualquier venta.
create or replace function public.fn_acreditar_recargas()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer := 0;
  v_saldo integer;
begin
  if not (NEW.pagado = true and OLD.pagado is distinct from true) then
    return NEW;
  end if;
  if NEW.cliente_id is null or NEW.es_demo then
    return NEW;
  end if;

  select coalesce(sum(ps.mancuernas * oi.cantidad), 0)
  into v_total
  from orden_items oi
  join paquetes_saldo ps on ps.producto_id = oi.producto_id
  where oi.orden_id = NEW.id;

  if v_total <= 0 then
    return NEW;
  end if;

  -- Si esta orden ya se acreditó (reintento, doble disparo), no se repite.
  if exists (select 1 from saldo_movimientos where orden_id = NEW.id and tipo = 'compra') then
    return NEW;
  end if;

  update clientes
  set saldo_mancuernas = saldo_mancuernas + v_total
  where id = NEW.cliente_id
  returning saldo_mancuernas into v_saldo;

  insert into saldo_movimientos (cliente_id, mancuernas, tipo, orden_id, descripcion, empleado_id, saldo_despues)
  values (NEW.cliente_id, v_total, 'compra', NEW.id,
          'Recarga en folio ' || NEW.folio, NEW.empleado_id, v_saldo);

  return NEW;
end;
$fn$;

drop trigger if exists trg_acreditar_recargas on ordenes;
create trigger trg_acreditar_recargas
  after update of pagado on ordenes
  for each row execute function fn_acreditar_recargas();


-- 2) CANJEAR: pagar (todo o parte) con mancuernas.
--
-- Reglas que sostienen que esto mueva dinero real:
--   · Bloquea la fila del cliente (FOR UPDATE): dos cajas cobrando al mismo
--     cliente en el mismo segundo no pueden gastar el mismo saldo dos veces.
--   · Un canje por orden (índice único): si la red se cae y el cajero
--     repite, no se descuenta doble.
--   · Nunca deja el total por debajo de cero ni el saldo en negativo.
--   · Gasta PRIMERO las ganadas (que caducan) y luego las compradas.
--   · Solo puede llamarla el personal o el dueño del saldo.
create or replace function public.fn_canjear_mancuernas(
  p_orden_id uuid,
  p_mancuernas integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_orden ordenes;
  v_cliente clientes;
  v_tasa integer := fn_tasa_mancuernas();
  v_max_manc integer;
  v_usar integer;
  v_de_ganadas integer;
  v_de_compradas integer;
  v_pesos numeric(10,2);
  v_empleado uuid := fn_empleado_actual();
begin
  if p_mancuernas is null or p_mancuernas <= 0 then
    raise exception 'Di cuántas mancuernas se van a usar';
  end if;

  select * into v_orden from ordenes where id = p_orden_id;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.pagado then raise exception 'Esa orden ya está pagada'; end if;
  if v_orden.cliente_id is null then
    raise exception 'Primero identifica al cliente (código o teléfono)';
  end if;

  -- Bloqueo: a partir de aquí nadie más toca este saldo hasta terminar.
  select * into v_cliente from clientes where id = v_orden.cliente_id for update;

  if not (coalesce(fn_es_staff(), false) or v_cliente.auth_user_id = auth.uid()) then
    raise exception 'No puedes usar el saldo de otra persona';
  end if;

  if exists (select 1 from saldo_movimientos where orden_id = p_orden_id and tipo = 'canje') then
    raise exception 'Esta orden ya usó mancuernas';
  end if;

  -- Nunca más de lo que cuesta la orden: el monedero no da cambio.
  v_max_manc := floor(v_orden.total * v_tasa)::integer;
  v_usar := least(p_mancuernas, v_max_manc,
                  coalesce(v_cliente.mancuernas, 0) + coalesce(v_cliente.saldo_mancuernas, 0));

  if v_usar <= 0 then
    raise exception 'No hay saldo disponible para esta orden';
  end if;

  v_de_ganadas   := least(v_usar, coalesce(v_cliente.mancuernas, 0));
  v_de_compradas := v_usar - v_de_ganadas;
  v_pesos := round(v_usar::numeric / v_tasa, 2);

  update clientes
  set mancuernas = mancuernas - v_de_ganadas,
      saldo_mancuernas = saldo_mancuernas - v_de_compradas
  where id = v_cliente.id;

  -- El cobro compara el monto contra ordenes.total, así que el descuento
  -- tiene que BAJAR el total: si solo se anotara aparte, la caja seguiría
  -- pidiendo el precio completo.
  update ordenes
  set descuento = coalesce(descuento, 0) + v_pesos,
      total = greatest(0, total - v_pesos)
  where id = p_orden_id
  returning * into v_orden;

  if v_de_ganadas > 0 then
    insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
    values (v_cliente.id, -v_de_ganadas, 'canje', p_orden_id,
            'Canje en folio ' || v_orden.folio);
  end if;

  insert into saldo_movimientos (cliente_id, mancuernas, tipo, orden_id, descripcion, empleado_id, saldo_despues)
  values (v_cliente.id, -v_usar, 'canje', p_orden_id,
          'Canje en folio ' || v_orden.folio ||
          case when v_de_compradas > 0 and v_de_ganadas > 0
               then ' (' || v_de_ganadas || ' ganadas + ' || v_de_compradas || ' compradas)'
               else '' end,
          v_empleado,
          (select saldo_mancuernas from clientes where id = v_cliente.id));

  return jsonb_build_object(
    'usadas', v_usar,
    'de_ganadas', v_de_ganadas,
    'de_compradas', v_de_compradas,
    'descuento_pesos', v_pesos,
    'total_a_pagar', v_orden.total,
    'saldo_restante', (select coalesce(mancuernas,0) + coalesce(saldo_mancuernas,0)
                       from clientes where id = v_cliente.id)
  );
end;
$fn$;


-- 3) DEVOLVER: si la orden se cancela, el saldo vuelve.
--
-- Sin esto, cancelar una venta pagada con mancuernas se quedaría con el
-- dinero del cliente — el error más caro de todos.
create or replace function public.fn_devolver_canje(p_orden_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_mov saldo_movimientos;
  v_saldo integer;
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede devolver un canje';
  end if;

  select * into v_mov from saldo_movimientos
  where orden_id = p_orden_id and tipo = 'canje' limit 1;
  if not found then
    return jsonb_build_object('devuelto', 0, 'nota', 'Esa orden no usó mancuernas');
  end if;

  if exists (select 1 from saldo_movimientos where orden_id = p_orden_id and tipo = 'devolucion') then
    return jsonb_build_object('devuelto', 0, 'nota', 'Ya se había devuelto');
  end if;

  -- Vuelve todo a la bolsa comprada: es la que no caduca, así el cliente
  -- nunca sale perdiendo por una cancelación que no pidió.
  update clientes set saldo_mancuernas = saldo_mancuernas + abs(v_mov.mancuernas)
  where id = v_mov.cliente_id
  returning saldo_mancuernas into v_saldo;

  insert into saldo_movimientos (cliente_id, mancuernas, tipo, orden_id, descripcion, empleado_id, saldo_despues)
  values (v_mov.cliente_id, abs(v_mov.mancuernas), 'devolucion', p_orden_id,
          'Devolución por cancelación', fn_empleado_actual(), v_saldo);

  return jsonb_build_object('devuelto', abs(v_mov.mancuernas), 'saldo_nuevo', v_saldo);
end;
$fn$;

revoke all on function public.fn_canjear_mancuernas(uuid, integer) from public;
revoke all on function public.fn_devolver_canje(uuid) from public;
grant execute on function public.fn_canjear_mancuernas(uuid, integer) to authenticated, service_role;
grant execute on function public.fn_devolver_canje(uuid) to authenticated, service_role;
grant execute on function public.fn_tasa_mancuernas() to anon, authenticated, service_role;