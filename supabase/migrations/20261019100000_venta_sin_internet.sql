-- =============================================================================
-- Vender sin internet (19/10/26).
--
-- La caja de Lily vive en la nube: sin internet no hay `fn_crear_orden`, no
-- hay `fn_cobrar_orden` y no hay venta. Pero el mostrador sí sigue: el pan
-- está en la vitrina, el cliente está enfrente y el cajón de efectivo abre
-- igual. Lo único que de verdad necesita internet es el REGISTRO.
--
-- Así que sin internet la caja cobra —efectivo, o lo que ya se cobró en la
-- terminal del banco—, guarda la venta en ESE navegador con un folio
-- provisional («S-03»), saca el ticket por el navegador, y en cuanto vuelve
-- la conexión manda cada venta aquí.
--
-- ## Envolver, no tocar
--
-- `fn_venta_sin_internet` NO reemplaza el camino del dinero: lo ENVUELVE.
-- Crea la orden con `fn_crear_orden` y la cobra con `fn_cobrar_orden` (o con
-- `fn_cobrar_orden_mixto`), las de siempre, sin cambiarles una línea. El
-- precio lo sigue poniendo el servidor. Lo que agrega:
--
--   * **Idempotencia por el id que puso el navegador.** Si la respuesta se
--     cortó a medias y el navegador reintenta, la segunda llamada devuelve
--     la orden de la primera. Todo va en UNA transacción: o queda la venta
--     completa (orden + pago + registro) o no queda nada.
--   * **La hora real.** `ordenes.created_at` y el pago se mueven a
--     `vendida_en`. Aquí eso no es cosmético: `fn_existencias_por_molde` y
--     `fn_catalogo_del_dia` deciden el día con
--     `(o.created_at at time zone 'America/Merida')::date`, así que una
--     venta de las 9 de la noche del sábado registrada el domingo a las 7
--     se descontaría del pan del DOMINGO — pan que todavía no existía
--     cuando esa hojaldra salió de la vitrina. Los cinco triggers de la
--     orden (inventario, cocina, mancuernas, sellos, recargas) solo actúan
--     en la transición a pagado (`NEW.pagado = true and OLD.pagado is
--     distinct from true`), así que mover la hora después no los repite.
--     Comprobado leyendo los cinco, no suponiéndolo.
--   * **La diferencia de precio, anotada.** Si el total de la pantalla no
--     coincide con el del servidor, la venta se cobra al del servidor —esa
--     regla no se afloja— y la diferencia queda en `ventas_sin_internet`
--     con `estado = 'revisar'`. El corte enseña la diferencia real en vez
--     de esconderla.
--   * **La comanda no se vuelve a mandar** si la venta ya tiene más de diez
--     minutos. Imprimirle a producción un pedido de hace una hora es peor
--     que no imprimirlo.
--
-- ## Lo que sin internet NO funciona
--
-- Clip (el cobro se pide por internet), Rappi (el pedido entra por la
-- plataforma), identificar al cliente, Admin a distancia y las pantallas de
-- las estaciones. Por eso solo se aceptan `efectivo` y `tarjeta`, y solo el
-- canal `pos`.
--
-- **Y lo que más resuelve no es esto: es un segundo internet.** Un módem 4G
-- que entre solo cuando se cae el principal deja todo funcionando, Clip
-- incluido, sin tocar el sistema. Esto es para cuando también falla ese.
-- =============================================================================

create table if not exists ventas_sin_internet (
  id uuid primary key,                       -- lo pone el navegador de la caja
  orden_id uuid references ordenes(id),
  folio_local text,
  vendida_en timestamptz not null,
  recibida_en timestamptz not null default now(),
  metodo text not null,
  efectivo numeric,
  tarjeta numeric,
  total_pantalla numeric not null,
  total_servidor numeric,
  diferencia numeric,
  estado text not null default 'ok' check (estado in ('ok', 'revisar')),
  comanda_suprimida boolean not null default false,
  empleado_id uuid references empleados(id),
  corte_id uuid references caja_cortes(id),
  payload jsonb not null
);

create index if not exists ventas_sin_internet_vendida_idx on ventas_sin_internet (vendida_en);

-- Nadie la lee ni la escribe directo: se entra por la función, que es
-- `definer`. Admin la mira por `fn_ventas_sin_internet_revisar`.
alter table ventas_sin_internet enable row level security;
revoke all on ventas_sin_internet from anon, authenticated, public;

create or replace function public.fn_venta_sin_internet(p_venta jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '15s'
as $$
declare
  v_id uuid := nullif(p_venta->>'id', '')::uuid;
  v_vendida timestamptz := nullif(p_venta->>'vendida_en', '')::timestamptz;
  v_metodo text := p_venta->>'metodo';
  v_total_pantalla numeric := coalesce((p_venta->>'total_pantalla')::numeric, 0);
  v_efectivo numeric := coalesce((p_venta->>'efectivo')::numeric, 0);
  v_tarjeta numeric := coalesce((p_venta->>'tarjeta')::numeric, 0);
  v_empleado uuid := nullif(p_venta->>'empleado_id', '')::uuid;
  v_corte uuid := nullif(p_venta->>'corte_id', '')::uuid;
  v_previa ventas_sin_internet;
  v_orden ordenes;
  v_pago pagos;
  v_suprimir boolean;
  v_dif numeric;
  v_ref text;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede registrar una venta sin internet.';
  end if;
  if v_id is null then
    raise exception 'La venta no trae id.';
  end if;
  if v_metodo not in ('efectivo', 'tarjeta', 'mixto') then
    raise exception 'Sin internet solo se cobra efectivo o la terminal del banco.';
  end if;
  -- Una hora que viene del reloj de una PC: se acota por los dos lados. El
  -- futuro no existe y una venta de hace una semana ya no es «se cayó el
  -- internet», es un navegador que nadie abrió.
  if v_vendida is null
     or v_vendida > now() + interval '5 minutes'
     or v_vendida < now() - interval '7 days' then
    raise exception 'La hora de la venta no es válida.';
  end if;
  if jsonb_typeof(p_venta->'items') is distinct from 'array'
     or jsonb_array_length(p_venta->'items') = 0 then
    raise exception 'La venta no trae productos.';
  end if;
  if v_empleado is not null and not exists (select 1 from empleados where id = v_empleado) then
    raise exception 'El cajero de la venta no existe.';
  end if;

  -- Ya registrada: se devuelve lo mismo. El candado de la llave primaria
  -- hace que dos envíos simultáneos no creen dos órdenes — el segundo espera
  -- y luego encuentra la fila.
  select * into v_previa from ventas_sin_internet where id = v_id;
  if found then
    select * into v_orden from ordenes where id = v_previa.orden_id;
    return jsonb_build_object(
      'ok', true, 'repetida', true, 'orden_id', v_orden.id,
      'folio', v_orden.folio, 'total', v_orden.total, 'diferencia', v_previa.diferencia);
  end if;

  insert into ventas_sin_internet (
    id, vendida_en, metodo, efectivo, tarjeta, total_pantalla,
    folio_local, empleado_id, corte_id, payload
  ) values (
    v_id, v_vendida, v_metodo, v_efectivo, v_tarjeta, v_total_pantalla,
    p_venta->>'folio_local', v_empleado, v_corte, p_venta
  );

  -- La asignación, NO `select (fn_crear_orden(...)).*`: el `.*` expande la
  -- llamada a una copia POR COLUMNA, y eso ya dejó 219 órdenes huérfanas una
  -- vez (CLAUDE.md §4). La asignación evalúa una sola vez.
  v_orden := fn_crear_orden(
    nullif(p_venta->>'sucursal_id', '')::uuid,
    nullif(p_venta->>'almacen_id', '')::uuid,
    'pos'::canal_orden,
    p_venta->'items',
    v_corte,
    v_empleado,
    null,
    greatest(0, coalesce((p_venta->>'descuento')::numeric, 0)),
    false,
    nullif(p_venta->>'nombre_cliente', ''));

  v_ref := nullif(trim(coalesce(p_venta->>'referencia', '')), '');
  v_ref := coalesce(v_ref || ' · ', '') || 'Sin internet ' || coalesce(p_venta->>'folio_local', '');

  if v_metodo = 'mixto' then
    -- El efectivo es dinero CONTADO: entró al cajón tal cual y así tiene que
    -- llegar al corte. Lo que se ajusta contra el total del servidor es la
    -- parte de la terminal. (Si los dos totales coinciden —lo normal, porque
    -- cambiar un precio también necesita internet— esto no mueve nada.)
    v_efectivo := least(greatest(0, v_efectivo), v_orden.total);
    v_tarjeta := round(v_orden.total - v_efectivo, 2);
    if v_tarjeta <= 0 then
      v_pago := fn_cobrar_orden(v_orden.id, 'efectivo'::metodo_pago, v_orden.total, v_ref, v_empleado, v_id);
    else
      v_pago := fn_cobrar_orden_mixto(
        v_orden.id, v_efectivo, v_tarjeta, 'tarjeta'::metodo_pago, v_ref, v_empleado, v_id);
    end if;
  else
    v_pago := fn_cobrar_orden(
      v_orden.id, v_metodo::metodo_pago, v_orden.total, v_ref, v_empleado, v_id);
  end if;

  -- La hora real. Después del cobro: los triggers ya corrieron y no vuelven
  -- a dispararse por un UPDATE que no toca `pagado`.
  update ordenes set created_at = v_vendida where id = v_orden.id;
  update pagos set created_at = v_vendida where id = v_pago.id;

  -- Una comanda de hace una hora no sirve a nadie.
  v_suprimir := coalesce((p_venta->>'comanda_impresa')::boolean, false)
                or v_vendida < now() - interval '10 minutes';
  if v_suprimir then
    update trabajos_impresion
       set estado = 'cancelled',
           error_ultimo = 'Venta sin internet: la comanda ya no llega a tiempo'
     where orden_id = v_orden.id and estado in ('pending', 'retry');
    update cocina_items set estado = 'entregado'
     where pedido_id in (select id from pedidos_cocina where orden_id = v_orden.id);
    update pedidos_cocina set estado = 'entregado' where orden_id = v_orden.id;
  end if;

  v_dif := round(v_total_pantalla - v_orden.total, 2);
  update ventas_sin_internet
     set orden_id = v_orden.id,
         total_servidor = v_orden.total,
         efectivo = case when v_metodo = 'mixto' then v_efectivo else null end,
         tarjeta = case when v_metodo = 'mixto' then v_tarjeta else null end,
         diferencia = v_dif,
         estado = case when abs(v_dif) > 0.01 then 'revisar' else 'ok' end,
         comanda_suprimida = v_suprimir
   where id = v_id;

  return jsonb_build_object(
    'ok', true, 'repetida', false, 'orden_id', v_orden.id,
    'folio', v_orden.folio, 'total', v_orden.total, 'diferencia', v_dif);
end;
$$;

-- Solo la caja, que entra con PIN y sesión real. **No** `anon`: aquí el POS
-- sí sostiene su sesión, así que no hace falta abrirle la puerta al rol
-- público como tuvo que hacer el otro sistema con su kiosko.
revoke all on function public.fn_venta_sin_internet(jsonb) from public, anon;
grant execute on function public.fn_venta_sin_internet(jsonb) to authenticated;

/**
 * Las ventas sin internet que hay que mirar.
 *
 * Existe por la lección de los indicadores: una diferencia de precio que se
 * guarda y nadie puede ver es exactamente un número que no sirve. Sale en
 * Admin → Diagnóstico, con ventana de 7 días para que pueda volver a verde.
 */
create or replace function public.fn_ventas_sin_internet_revisar(p_dias integer default 7)
returns table (
  id uuid, folio_local text, folio integer, vendida_en timestamptz,
  recibida_en timestamptz, metodo text, total_pantalla numeric,
  total_servidor numeric, diferencia numeric, estado text,
  comanda_suprimida boolean, cajero text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.id, v.folio_local, o.folio, v.vendida_en, v.recibida_en, v.metodo,
         v.total_pantalla, v.total_servidor, v.diferencia, v.estado,
         v.comanda_suprimida, e.nombre
  from ventas_sin_internet v
  left join ordenes o on o.id = v.orden_id
  left join empleados e on e.id = v.empleado_id
  where fn_es_staff()
    and v.recibida_en > now() - make_interval(days => greatest(1, coalesce(p_dias, 7)))
  order by v.estado desc, v.vendida_en desc;
$$;

revoke all on function public.fn_ventas_sin_internet_revisar(integer) from public, anon;
grant execute on function public.fn_ventas_sin_internet_revisar(integer) to authenticated;
