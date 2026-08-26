-- "Tratamiento": el chequeo médico del sistema, en una sola llamada.
--
-- El tablero de Sistema dice CUÁNTOS problemas hay; esto dice CUÁLES, qué
-- tan graves son y qué hacer con cada uno — incluyendo lo que pasa fuera
-- del punto de venta (Rewards) y la basura de datos que se va acumulando.
--
-- Cada hallazgo trae ejemplos concretos: un número suelto no se puede
-- perseguir, "folio 711 — Monster Lando Norris" sí.
create or replace function public.fn_diagnostico_sistema()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v jsonb := '[]'::jsonb;
  v_n int;
  v_ej text;

  procedure_dummy int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver el diagnóstico';
  end if;

  -- ─────────────────────── DINERO Y COBROS ───────────────────────
  select count(*), string_agg(distinct 'folio ' || o.folio, ', ')
  into v_n, v_ej
  from pagos p join ordenes o on o.id = p.orden_id
  where p.estado_transaccion in ('pending','processing')
    and p.created_at < now() - interval '15 minutes';
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Cobros','severidad','alta','cuantos',v_n,
      'titulo','Cobros atorados sin resolver',
      'detalle','Intentos de pago que llevan más de 15 minutos sin cerrar. ' || coalesce(v_ej,''),
      'que_hacer','Sistema → "Reconciliar ahora". Si no se resuelven, revisa el panel de Clip.'));
  end if;

  select count(*) into v_n from pagos where estado_transaccion = 'unknown';
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Cobros','severidad','alta','cuantos',v_n,
      'titulo','Cobros en estado desconocido',
      'detalle','El sistema no pudo confirmar si se cobraron o no.',
      'que_hacer','Sistema → "Reconciliar ahora", y compara con el panel de Clip.'));
  end if;

  select count(*), string_agg('folio ' || o.folio, ', ' order by o.folio desc)
  into v_n, v_ej
  from ordenes o
  where o.pagado and not o.es_demo and o.created_at >= now() - interval '7 days'
    and not exists (select 1 from inventario_movimientos im where im.referencia_id = o.id);
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Inventario','severidad','media','cuantos',v_n,
      'titulo','Ventas que no descontaron inventario',
      'detalle','Se cobraron pero no bajaron insumos — normalmente porque el producto no tiene receta. ' || coalesce(left(v_ej,120),''),
      'que_hacer','Captura la receta del producto en Costeos; el descuento aplica de la siguiente venta en adelante.'));
  end if;

  -- ─────────────────────── COMANDAS E IMPRESIÓN ───────────────────────
  select count(*) into v_n
  from trabajos_impresion
  where estado in ('pending','retry') and created_at < now() - interval '90 seconds';
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Impresión','severidad','alta','cuantos',v_n,
      'titulo','Comandas esperando salir en papel',
      'detalle','Llevan más de 90 segundos encoladas.',
      'que_hacer','Revisa que la ventana del agente esté abierta en la PC y que la etiquetadora tenga papel y la tapa cerrada.'));
  end if;

  select count(*), string_agg(nombre, ', ') into v_n, v_ej
  from impresoras
  where activa and (ultima_conexion is null or ultima_conexion < now() - interval '5 minutes');
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Impresión','severidad','alta','cuantos',v_n,
      'titulo','Impresoras sin señal',
      'detalle','No dan señales de vida: ' || coalesce(v_ej,''),
      'que_hacer','Abre "Abrir Hojaldras Lily" en la PC de la tienda (levanta el agente).'));
  end if;

  select count(*), string_agg(o.folio::text, ', ' order by o.folio desc)
  into v_n, v_ej
  from ordenes o
  where o.pagado and not o.es_demo and o.created_at >= now() - interval '7 days'
    and not exists (select 1 from pedidos_cocina pc where pc.orden_id = o.id)
    and exists (
      select 1 from orden_items oi
      join productos p on p.id = oi.producto_id
      join categorias c on c.id = p.categoria_id
      where oi.orden_id = o.id and coalesce(c.va_a_pantalla, true));
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Comandas','severidad','media','cuantos',v_n,
      'titulo','Ventas que debían llegar a una estación y no llegaron',
      'detalle','Folios ' || coalesce(left(v_ej,100),'') || '. Suele ser una categoría marcada para ir a pantalla que en realidad no se prepara (latas, snacks).',
      'que_hacer','Menú → "¿A qué pantalla llega cada categoría?" y pon "Ninguna" a lo que solo se entrega.'));
  end if;

  -- ─────────────────────── CATÁLOGO ───────────────────────
  select count(*), string_agg(p.nombre, ', ') into v_n, v_ej
  from productos p
  where p.activo and not p.es_extra and not p.es_combo and not p.es_reventa
    and not exists (select 1 from recetas r where r.producto_id = p.id);
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Catálogo','severidad','media','cuantos',v_n,
      'titulo','Productos que se venden sin receta',
      'detalle','No descuentan insumos al venderse: ' || coalesce(left(v_ej,140),''),
      'que_hacer','Captura sus ingredientes en Costeos.'));
  end if;

  select count(*), string_agg(nombre, ', ') into v_n, v_ej
  from productos where activo and not es_extra and precio <= 0;
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Catálogo','severidad','alta','cuantos',v_n,
      'titulo','Productos a la venta con precio en cero',
      'detalle',coalesce(left(v_ej,140),''),
      'que_hacer','Ponles precio en Costeos, o apágalos en Admin → Menú.'));
  end if;

  -- Claves de Costeos: sin ellas el renombre se bloquea (no rompe, pero
  -- deja al equipo sin poder corregir nombres).
  select count(*) into v_n
  from app_data, jsonb_array_elements(data->'proteins') x
  where coalesce(trim(x->>'codigo'), '') = '';
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Costeos','severidad','baja','cuantos',v_n,
      'titulo','Filas de proteínas sin Clave',
      'detalle','Sin Clave no se pueden renombrar con seguridad desde Costeos.',
      'que_hacer','Se asignan solas al guardar cualquier cambio en Costeos.'));
  end if;

  select count(*) into v_n from (
    select trim(x->>'codigo') c
    from app_data, jsonb_array_elements(data->'proteins') x
    where coalesce(trim(x->>'codigo'),'') <> ''
    group by 1 having count(*) > 1) d;
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Costeos','severidad','media','cuantos',v_n,
      'titulo','Claves repetidas en Costeos',
      'detalle','Dos filas distintas comparten Clave; renombrar cualquiera de ellas queda bloqueado.',
      'que_hacer','Dale una Clave distinta a cada fila en Costeos → Proteínas.'));
  end if;

  -- ─────────────────────── REWARDS ───────────────────────
  select count(*) into v_n
  from clientes c
  where c.auth_user_id is not null
    and c.created_at < now() - interval '1 day'
    and not exists (select 1 from ordenes o where o.cliente_id = c.id);
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Rewards','severidad','baja','cuantos',v_n,
      'titulo','Clientes registrados que nunca compraron',
      'detalle','Se dieron de alta hace más de un día y no tienen ninguna venta ligada.',
      'que_hacer','Normal si apenas escanearon el QR. Si son muchos y seguidos, avisa: puede ser que la caja no esté ligando la venta al cliente.'));
  end if;

  select count(*) into v_n
  from clientes where auth_user_id is not null and coalesce(telefono,'') = '';
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Rewards','severidad','baja','cuantos',v_n,
      'titulo','Clientes de lealtad sin teléfono',
      'detalle','Sin teléfono no se les puede identificar en caja si llegan sin celular.',
      'que_hacer','Nada urgente: la app se los pide sola la próxima vez que entren.'));
  end if;

  select count(*) into v_n
  from cupones where estado = 'activo' and vence_en < now();
  if v_n > 0 then
    v := v || jsonb_build_array(jsonb_build_object(
      'area','Rewards','severidad','media','cuantos',v_n,
      'titulo','Cupones vencidos que siguen marcados como activos',
      'detalle','Podrían intentar canjearse y provocar una discusión en caja.',
      'que_hacer','Avísame para cerrarlos.'));
  end if;

  return jsonb_build_object(
    'revisado_en', to_char(now() at time zone 'America/Merida', 'DD/MM HH24:MI:SS'),
    'hallazgos', v);
end;
$fn$;

revoke all on function public.fn_diagnostico_sistema() from public;
grant execute on function public.fn_diagnostico_sistema() to authenticated, service_role;