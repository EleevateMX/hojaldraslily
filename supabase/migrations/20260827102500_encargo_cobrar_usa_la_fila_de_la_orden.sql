-- `fn_crear_orden` devuelve una FILA, no un uuid.
--
-- Registro de una migración que se aplicó a la base y se había quedado sin
-- archivo en el repo (el repo es el registro: CLAUDE.md §6). El contenido está
-- tomado de la definición viva de la función, así que reproduce exactamente lo
-- que la base tiene hoy.
--
-- El error: `fn_crear_orden` está declarada `returns ordenes`, y al capturarla
-- en una variable uuid el cobro del encargo reventaba. Se captura en un
-- `ordenes%rowtype` y de ahí salen el id y el total.
--
-- Y el total se toma de **esa fila**, no se vuelve a calcular: es el número que
-- `fn_cobrar_orden` va a validar. Calcularlo dos veces por caminos distintos
-- es justo como se llega a que la pantalla diga una cosa y el servidor otra.

create or replace function public.fn_encargo_cobrar(
  p_encargo_id uuid,
  p_metodo     text default 'efectivo'
)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no está apartado (está %).', v_estado;
  end if;

  select jsonb_agg(jsonb_build_object('producto_id', ei.producto_id, 'cantidad', ei.cantidad))
    into v_items
    from encargo_items ei where ei.encargo_id = p_encargo_id;

  select cc.id, c.sucursal_id into v_corte, v_suc
    from caja_cortes cc
    join cajas c on c.id = cc.caja_id
   where cc.estado = 'abierta'
   order by cc.abierto_en desc limit 1;

  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- El camino normal de una venta de mostrador, a propósito: así el cobro cae
  -- en el corte de caja. Insertar la orden a mano lo dejaba fuera y el día no
  -- cuadraba (CLAUDE.md §2.0).
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
$function$;
