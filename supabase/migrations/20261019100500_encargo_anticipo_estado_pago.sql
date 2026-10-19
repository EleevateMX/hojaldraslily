-- Corrige fn_encargo_anticipo: la orden nace en 'pending_payment'.
--
-- La migracion anterior insertaba la orden del anticipo sin decir
-- `estado_pago_orden`, asi que tomaba el 'draft' por omision de la columna --
-- y `fn_cobrar_orden` rechaza cobrar una orden en 'draft'. Resultado: el
-- anticipo reventaba al cobrarse.
--
-- Lo encontro la prueba de punta a punta contra la base, no la lectura del
-- codigo: el estado por omision de una columna no se ve en la funcion que la
-- inserta. Es la misma leccion del `check` de los estados de produccion (§4).
--
-- Se pone el mismo valor que usa `fn_crear_orden` ('pending_payment') en vez
-- de inventar un camino distinto para el anticipo.

create or replace function public.fn_encargo_anticipo(
  p_encargo_id uuid,
  p_monto numeric,
  p_metodo metodo_pago default 'efectivo'
) returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text; v_cliente text; v_folio bigint; v_ya numeric;
  v_total numeric; v_corte uuid; v_suc uuid; v_alm uuid; v_orden uuid;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede recibir un anticipo.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.';
  end if;

  select estado, cliente, folio, anticipo
    into v_estado, v_cliente, v_folio, v_ya
    from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no esta apartado (esta %).', v_estado;
  end if;

  -- El total lo calcula el servidor desde `productos.precio`, igual que
  -- `fn_crear_orden`. El cliente nunca manda importes, y asi el anticipo
  -- queda acotado por lo que de verdad se debe: no se puede "anticipar"
  -- mas de lo que vale el encargo.
  select coalesce(sum(ei.cantidad * pr.precio), 0)
    into v_total
    from encargo_items ei
    join productos pr on pr.id = ei.producto_id
   where ei.encargo_id = p_encargo_id;

  if v_ya + p_monto > v_total + 0.01 then
    raise exception
      'El anticipo pasa del total del encargo: ya habia % y se quieren abonar % de %.',
      v_ya, p_monto, v_total;
  end if;

  select cc.id, c.sucursal_id into v_corte, v_suc
    from caja_cortes cc
    join cajas c on c.id = cc.caja_id
   where cc.estado = 'abierta'
   order by cc.abierto_en desc limit 1;

  -- Sin caja abierta no hay anticipo. Permitirlo seria volver al defecto que
  -- esta migracion arregla: dinero en el cajon que ningun corte espera.
  if v_corte is null then
    raise exception 'No hay una caja abierta. El anticipo tiene que caer en un corte.';
  end if;

  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- `estado_pago_orden` se pone igual que en `fn_crear_orden`
  -- ('pending_payment'). Con el 'draft' que trae la columna por omision,
  -- `fn_cobrar_orden` rechaza la orden y el anticipo no se puede cobrar: lo
  -- encontro la prueba de punta a punta, no la lectura del codigo.
  insert into ordenes (sucursal_id, almacen_id, canal, corte_id, total,
                       descuento, nombre_cliente, estado_pago_orden)
       values (v_suc, v_alm, 'pos'::canal_orden, v_corte, p_monto,
               0, 'Anticipo encargo #' || v_folio || ' - ' || v_cliente,
               'pending_payment')
    returning id into v_orden;

  perform fn_cobrar_orden(v_orden, p_metodo, p_monto, null, null,
                          gen_random_uuid());

  update encargos
     set anticipo = v_ya + p_monto, updated_at = now()
   where id = p_encargo_id;

  return v_ya + p_monto;
end;
$function$;
