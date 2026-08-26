-- Recibo digital del kiosko + teléfono del cliente en Rewards.
--
-- fn_recibo_publico: lo que abre el QR de la pantalla de confirmación. El
-- uuid de la orden ES la llave (imposible de adivinar); solo órdenes
-- pagadas tienen recibo. Devuelve null si no existe, sin pistas de más.
create or replace function public.fn_recibo_publico(p_orden_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'folio', o.folio,
    'fecha', o.created_at,
    'total', o.total,
    'metodo_pago', o.metodo_pago,
    'nombre_cliente', coalesce(o.nombre_cliente, cl.nombre),
    'es_demo', o.es_demo,
    'mancuernas_ganadas', coalesce((
      select mm.puntos from mancuernas_movimientos mm
      where mm.orden_id = o.id and mm.tipo = 'ganadas' limit 1), 0),
    'items', (
      select jsonb_agg(jsonb_build_object(
          'producto', p.nombre,
          'cantidad', oi.cantidad,
          'precio_unitario', oi.precio_unitario,
          'personalizacion', oi.personalizacion,
          'es_extra', oi.padre_item_id is not null
        ) order by (oi.padre_item_id is not null), oi.precio_unitario desc)
      from orden_items oi
      join productos p on p.id = oi.producto_id
      where oi.orden_id = o.id)
  )
  from ordenes o
  left join clientes cl on cl.id = o.cliente_id
  where o.id = p_orden_id and o.pagado
$$;

-- fn_mi_telefono_guardar: el usuario logueado completa su ficha con su
-- número (10 dígitos). Solo toca SU fila (auth.uid()); si el número ya es
-- de otra ficha, avisa en cristiano en vez de tronar con un error de índice.
create or replace function public.fn_mi_telefono_guardar(p_telefono text)
returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_row clientes;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión.' using errcode = '28000';
  end if;
  if length(v_tel) <> 10 then
    raise exception 'El teléfono debe tener 10 dígitos.';
  end if;
  begin
    update clientes set telefono = v_tel
    where auth_user_id = auth.uid()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Ese teléfono ya está en otra ficha. Pide en caja que unifiquen tu cuenta.';
  end;
  if v_row.id is null then
    raise exception 'No hay ficha para esta cuenta.';
  end if;
  return v_row;
end;
$$;

revoke all on function public.fn_recibo_publico(uuid) from public;
revoke all on function public.fn_mi_telefono_guardar(text) from public;
grant execute on function public.fn_recibo_publico(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_mi_telefono_guardar(text) to authenticated, service_role;