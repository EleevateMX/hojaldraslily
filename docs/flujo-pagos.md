# Flujo de pagos del kiosko

Vista de "qué ve/hace cada quién" para los tres modos de pago. Para la
máquina de estados formal detrás de esto, ver `docs/maquina-estados.md`.

## Regla de oro

**Ninguna orden del kiosko puede convertirse en venta pagada sin pasar por
`fn_confirmar_venta()`, y esa función exige un pago con
`estado_transaccion = 'authorized'` real.** No existe, ni puede existir en
producción, un modo `autoapprove`/`auto_approve` — el enum
`modo_pago_kiosko` solo tiene tres valores: `clip`, `pagar_en_caja`, `demo`
(ver `pagos_maquina_estados_p1_esquema.sql`), y agregar un cuarto valor
requeriría una migración explícita y visible en el historial de git, nunca
un flag oculto.

## Modo `pagar_en_caja` (el default seguro)

Ver `docs/modo-pagar-en-caja.md` para el detalle completo. En resumen: el
kiosko crea la orden ya en `awaiting_counter_payment` (sin pago, sin
efectos), muestra folio + código + QR, y solo el cajero cobrándola desde
POS → `/pendientes` la convierte en venta.

## Modo `clip`

1. Cliente arma su pedido, elige "Terminal".
2. Kiosko crea la orden normal (`fn_crear_orden`, nace en
   `pending_payment`).
3. `ClipPaymentProvider.createPayment()` (paquete `@shake/payments`) llama
   a la Edge Function `clip-crear-cobro`.
4. **Mientras `CLIP_API_KEY`/`CLIP_WEBHOOK_SECRET` no estén configuradas**
   (hoy): la función responde `{ ok:false, error:{codigo:'not_configured'} }`
   sin tocar nada más. El kiosko muestra "Pago temporalmente no disponible"
   y ofrece "Pagar en caja" como salida — nunca intenta aprobar nada por su
   cuenta. Este es el comportamiento real y actual del sistema.
5. **Cuando haya credenciales** (ver `docs/integracion-clip.md` para el
   paso a paso): la Edge Function crea el cobro real en Clip, guarda
   `pagos.proveedor_payment_id`, deja el pago en `pending`/`processing`. El
   kiosko muestra una pantalla de espera — **nunca confirma la venta con la
   respuesta HTTP que ve el navegador.** La confirmación real llega por
   `clip-webhook`, que valida la firma con `CLIP_WEBHOOK_SECRET` y llama
   `fn_confirmar_venta()` del lado servidor.
6. Si la conexión se cae, el navegador se cierra, o Clip tarda más de lo
   esperado: el pago queda `pending`/`processing` y, tras un umbral, la
   orden pasa a `payment_unknown` — ver `docs/reconciliacion-pagos.md`.
   Nunca se crea un segundo cobro automáticamente.

## Modo `demo`

Solo alcanzable si:
- La fila de `configuracion_kiosko` para esa sucursal dice `modo_pago =
  'demo'` **Y**
- `sucursales.es_produccion = false` para esa sucursal (si no, la propia
  base rechaza el `UPDATE` vía `fn_actualizar_configuracion_kiosko` —
  `raise exception`) **Y**
- El build del kiosko no es de producción (`import.meta.env.PROD`) — si lo
  es, `resolverModoKiosko()` ignora el valor de la base y usa
  `pagar_en_caja` de todos modos.

Con las tres condiciones, la pantalla de pago muestra el banner amarillo
"⚠ Modo demostración — ninguna venta es real" en todo momento, usa
`MockPaymentProvider` (que además se niega a instanciarse en un build de
producción, segunda capa independiente del chequeo de arriba), y la orden
se crea con `es_demo = true`. Esa columna hace que los triggers de
inventario, pedidos de cocina y mancuernas se salten por completo esa
orden (`and not NEW.es_demo` agregado a cada uno) — cero efectos en datos
reales, salvo que si se configura una impresora de prueba dedicada, esa sí
puede imprimir (para poder probar el flujo de punta a punta sin ensuciar
producción).

## Qué pasa si el pago es rechazado

`declined` es un estado de **pago**, no de **orden** — la orden se queda en
`pending_payment`/`payment_processing` (nunca pasa a `paid`). El kiosko
puede ofrecer reintentar (nuevo pago, nueva `idempotencyKey`) o cambiar a
"pagar en caja". No hay transición `declined → paid` posible sin una
transacción de pago nueva y autorizada (bloqueado por el trigger, ver
`docs/maquina-estados.md`).
