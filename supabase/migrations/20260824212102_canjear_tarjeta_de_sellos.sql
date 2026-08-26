-- Canjear la tarjeta llena: el producto premiado se pone a $0 en la orden.
--
-- Igual de estricto que el monedero: bloquea la fila del cliente, exige que
-- el producto esté en el catálogo de premios, descuenta los sellos y baja el
-- total. Y una orden no puede canjear dos veces la misma tarjeta.
create or replace function public.fn_canjear_sellos(
  p_orden_id uuid,
  p_tipo text,
  p_producto_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_orden ordenes;
  v_cliente clientes;
  v_req integer;
  v_tiene integer;
  v_item orden_items;
  v_precio numeric(10,2);
begin
  if p_tipo not in ('bebida', 'alimento') then
    raise exception 'Tipo de tarjeta desconocido: %', p_tipo;
  end if;

  select * into v_orden from ordenes where id = p_orden_id;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.pagado then raise exception 'Esa orden ya está pagada'; end if;
  if v_orden.cliente_id is null then
    raise exception 'Primero identifica al cliente (código o teléfono)';
  end if;

  if not exists (select 1 from premios_sellos ps
                 where ps.tipo = p_tipo and ps.producto_id = p_producto_id and ps.activo) then
    raise exception 'Ese producto no está en la lista de premios de la tarjeta de %', p_tipo;
  end if;

  select * into v_cliente from clientes where id = v_orden.cliente_id for update;

  if not (coalesce(fn_es_staff(), false) or v_cliente.auth_user_id = auth.uid()) then
    raise exception 'No puedes usar la tarjeta de otra persona';
  end if;

  select requeridos into v_req from config_sellos where tipo = p_tipo;
  v_tiene := case when p_tipo = 'bebida' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end;

  if v_tiene < v_req then
    raise exception 'Le faltan % sellos de % para el premio', v_req - v_tiene, p_tipo;
  end if;

  if exists (select 1 from sellos_movimientos
             where orden_id = p_orden_id and tipo = p_tipo and sellos < 0) then
    raise exception 'Esta orden ya canjeó la tarjeta de %', p_tipo;
  end if;

  -- El premio tiene que estar YA en la orden: así el cajero ve lo mismo que
  -- el cliente se lleva, y el inventario descuenta el producto real.
  select * into v_item from orden_items
  where orden_id = p_orden_id and producto_id = p_producto_id
    and padre_item_id is null and precio_unitario > 0
  order by precio_unitario desc limit 1;

  if not found then
    raise exception 'Agrega primero el producto a la orden y luego canjea la tarjeta';
  end if;

  v_precio := v_item.precio_unitario;

  -- El renglón se queda (para la comanda y el inventario) pero deja de
  -- cobrarse.
  update orden_items set precio_unitario = 0 where id = v_item.id;
  update ordenes
  set descuento = coalesce(descuento, 0) + v_precio,
      total = greatest(0, total - v_precio)
  where id = p_orden_id
  returning * into v_orden;

  if p_tipo = 'bebida' then
    update clientes set sellos_bebida = sellos_bebida - v_req where id = v_cliente.id;
  else
    update clientes set sellos_alimento = sellos_alimento - v_req where id = v_cliente.id;
  end if;

  insert into sellos_movimientos (cliente_id, tipo, sellos, orden_id, descripcion)
  values (v_cliente.id, p_tipo, -v_req, p_orden_id,
          'Premio en folio ' || v_orden.folio || ': ' ||
          coalesce((select nombre from productos where id = p_producto_id), 'producto'));

  return jsonb_build_object(
    'premio', (select nombre from productos where id = p_producto_id),
    'valor', v_precio,
    'sellos_usados', v_req,
    'total_a_pagar', v_orden.total,
    'sellos_restantes', case when p_tipo = 'bebida'
      then (select sellos_bebida from clientes where id = v_cliente.id)
      else (select sellos_alimento from clientes where id = v_cliente.id) end
  );
end;
$fn$;

revoke all on function public.fn_canjear_sellos(uuid, text, uuid) from public;
grant execute on function public.fn_canjear_sellos(uuid, text, uuid) to authenticated, service_role;

-- Catálogo inicial de premios: los shakes de la carta y los alimentos.
-- Se ajusta desde Admin; esto es solo un punto de partida sensato.
insert into premios_sellos (tipo, producto_id)
select 'bebida', p.id
from productos p join categorias c on c.id = p.categoria_id
where c.nombre = 'Shakes' and p.activo and p.precio between 89 and 129
  and not exists (select 1 from premios_sellos ps where ps.producto_id = p.id and ps.tipo='bebida')
limit 30;

insert into premios_sellos (tipo, producto_id)
select 'alimento', p.id
from productos p join categorias c on c.id = p.categoria_id
where c.nombre = 'Alimentos' and p.activo and p.precio <= 159
  and not exists (select 1 from premios_sellos ps where ps.producto_id = p.id and ps.tipo='alimento')
limit 30;