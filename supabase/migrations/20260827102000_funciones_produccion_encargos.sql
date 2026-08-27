-- Las operaciones de produccion y encargos, todas del lado del servidor.
--
-- Van como funciones y no como INSERT sueltos desde la app por lo de siempre:
-- el precio y el estado los pone el servidor. Un encargo es dinero apartado;
-- si el navegador pudiera mandar el precio, apartar seria la puerta para
-- cobrarse lo que uno quiera (CLAUDE.md, 2.2).

-- ------------------------------------------------------------------ mandar --
create or replace function public.fn_produccion_mandar_a_hacer(
  p_items jsonb,          -- [{"producto_id": "...", "cantidad": 30}, ...]
  p_nota  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_quien text; v_item jsonb; v_n int := 0;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar a producir.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada que mandar a hacer.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into ordenes_produccion (nota, creada_por)
  values (nullif(trim(coalesce(p_nota, '')), ''), v_quien)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Un renglon en cero o negativo se ignora en vez de reventar la orden
    -- entera: se capturan varios a la vez y uno vacio no debe tirar el resto.
    if coalesce((v_item->>'cantidad')::int, 0) > 0 then
      insert into orden_produccion_items (orden_id, producto_id, cantidad_pedida)
      values (v_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::int);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Todos los renglones venían en cero.';
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------- avanzar --
-- Marca cuanto se lleva hecho de un renglon. El trigger de la migracion
-- anterior es el que sube la diferencia al inventario.
create or replace function public.fn_produccion_avanzar(
  p_item_id  uuid,
  p_hechas   int
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quien text; v_orden uuid; v_pendientes int; v_disp bigint; v_prod uuid;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede marcar producción.';
  end if;
  if p_hechas is null or p_hechas < 0 then
    raise exception 'La cantidad no puede ser negativa.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  update orden_produccion_items
     set cantidad_hecha = p_hechas,
         terminado_por  = coalesce(v_quien, terminado_por),
         terminado_en   = case when p_hechas > 0 then now() else null end
   where id = p_item_id
   returning orden_id, producto_id into v_orden, v_prod;

  if v_orden is null then
    raise exception 'Ese renglón de producción no existe.';
  end if;

  -- La orden se cierra sola cuando ya no queda nada por hacer: nadie tiene
  -- que acordarse de marcarla terminada, que es el paso que siempre se olvida.
  select count(*) into v_pendientes
    from orden_produccion_items
   where orden_id = v_orden and cantidad_hecha < cantidad_pedida;

  update ordenes_produccion
     set estado = case when v_pendientes = 0 then 'terminada' else 'en_proceso' end,
         updated_at = now()
   where id = v_orden and estado not in ('cancelada');

  select disponibles into v_disp from fn_existencias_del_dia(null) where producto_id = v_prod;
  return coalesce(v_disp, 0);
end;
$$;

-- ----------------------------------------------------------------- apartar --
create or replace function public.fn_encargo_crear(
  p_cliente       text,
  p_items         jsonb,   -- [{"producto_id": "...", "cantidad": 20}, ...]
  p_telefono      text default null,
  p_fecha_entrega date default null,
  p_hora_entrega  text default null,
  p_nota          text default null,
  p_anticipo      numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_quien text; v_item jsonb; v_n int := 0; v_precio numeric;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede levantar encargos.';
  end if;
  if length(trim(coalesce(p_cliente, ''))) < 2 then
    raise exception 'Falta el nombre de quien encarga.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El encargo no lleva nada.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into encargos (cliente, telefono, fecha_entrega, hora_entrega, nota, anticipo, creado_por)
  values (trim(p_cliente), nullif(trim(coalesce(p_telefono, '')), ''),
          p_fecha_entrega, nullif(trim(coalesce(p_hora_entrega, '')), ''),
          nullif(trim(coalesce(p_nota, '')), ''), greatest(coalesce(p_anticipo, 0), 0), v_quien)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'cantidad')::int, 0) > 0 then
      -- El precio sale del CATALOGO, no del navegador, y se congela aqui:
      -- lo que se aparto el lunes se respeta el sabado.
      select precio into v_precio from productos
       where id = (v_item->>'producto_id')::uuid and activo;
      if v_precio is null then
        raise exception 'Ese producto ya no está a la venta.';
      end if;
      insert into encargo_items (encargo_id, producto_id, cantidad, precio_unitario)
      values (v_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::int, v_precio);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Todos los renglones venían en cero.';
  end if;
  return v_id;
end;
$$;

-- ------------------------------------------------------------------ cobrar --
-- Cobrar un encargo es lo UNICO que lo descuenta del inventario.
--
-- No arma la venta a mano: la pasa por fn_crear_orden + fn_cobrar_orden, el
-- mismo camino que cualquier venta de mostrador. Se intento primero
-- insertando en `ordenes` directo y estaba mal: esa orden nacia sin
-- `corte_id`, o sea que el cobro no aparecia en el corte de caja y el dinero
-- del dia no cuadraba. Ademas por aqui se ganan las comandas por estacion y
-- el movimiento de inventario, gratis.
--
-- Efecto: el total se recalcula con el precio de HOY (fn_crear_orden siempre
-- recalcula). El `precio_unitario` congelado del encargo se conserva como lo
-- que se le cotizo al cliente, y la pantalla avisa si ya no coinciden.
create or replace function public.fn_encargo_cobrar(
  p_encargo_id uuid,
  p_metodo     text default 'efectivo'
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text; v_orden uuid; v_total numeric; v_items jsonb;
  v_corte uuid; v_suc uuid; v_alm uuid; v_cliente text; v_fila ordenes%rowtype;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cobrar.';
  end if;

  select estado, cliente into v_estado, v_cliente
    from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  -- Idempotente como fn_cobrar_orden: dos toques al boton no cobran dos
  -- veces ni descuentan dos veces el inventario.
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no está apartado (está %).', v_estado;
  end if;

  select jsonb_agg(jsonb_build_object('producto_id', ei.producto_id, 'cantidad', ei.cantidad))
    into v_items
    from encargo_items ei where ei.encargo_id = p_encargo_id;

  -- La caja abierta, para que el cobro caiga en el corte del turno.
  select cc.id, c.sucursal_id into v_corte, v_suc
    from caja_cortes cc
    join cajas c on c.id = cc.caja_id
   where cc.estado = 'abierta'
   order by cc.abierto_en desc limit 1;

  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- fn_crear_orden regresa la FILA de la orden, no el id: hay que sacarle el
  -- id y el total de ahi.
  select (fn_crear_orden(v_suc, v_alm, 'pos'::canal_orden, v_items,
                         v_corte, null, null, 0, false, v_cliente)).*
    into v_fila;
  v_orden := v_fila.id;
  v_total := v_fila.total;

  perform fn_cobrar_orden(v_orden, p_metodo::metodo_pago, v_total, null, null,
                          gen_random_uuid());

  update encargos
     set estado = 'pagado', orden_id = v_orden, updated_at = now()
   where id = p_encargo_id;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------- cancelar --
create or replace function public.fn_encargo_cancelar(p_encargo_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_estado text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cancelar encargos.';
  end if;
  select estado into v_estado from encargos where id = p_encargo_id;
  if v_estado is null then raise exception 'Ese encargo no existe.'; end if;
  if v_estado = 'pagado' then
    raise exception 'Ese encargo ya se cobró: no se cancela, se devuelve.';
  end if;
  update encargos
     set estado = 'cancelado',
         nota = trim(coalesce(nota, '') || ' · Cancelado: ' || coalesce(p_motivo, 'sin motivo')),
         updated_at = now()
   where id = p_encargo_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'fn_produccion_mandar_a_hacer(jsonb, text)',
    'fn_produccion_avanzar(uuid, int)',
    'fn_encargo_crear(text, jsonb, text, date, text, text, numeric)',
    'fn_encargo_cobrar(uuid, text)',
    'fn_encargo_cancelar(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
