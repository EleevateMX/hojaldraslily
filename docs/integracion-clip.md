# Integración Clip

> **Actualización de esta ronda:** además del flujo manual de POS descrito
> abajo (sin cambios, sigue funcionando igual), ahora existe una segunda
> integración: el **kiosko**, en modo de pago `clip`, a través de una
> abstracción `PaymentProvider` y Edge Functions dedicadas. Ver
> "Integración del kiosko (nueva)" más abajo — es la ruta que hay que
> completar para activar Clip en el kiosko. El flujo de POS/Stand 2
> descrito en el resto de este documento es independiente y no requiere
> ningún cambio.

Arquitectura objetivo: el POS corre en tablet/laptop/mini-PC; el **Clip
Stand 2 es solo la terminal de cobro**. El POS nunca asume que corre
dentro del Stand. El diseño funciona en tres niveles progresivos — los
tres terminan igual: `pagos.estado = 'aprobado'` → la base dispara
cocina + inventario.

## Realidad del hardware (investigado 2026-07, developer.clip.mx)

Clip ofrece dos rutas de integración y **el hardware importa**:

- **API de Checkout (redirigido)**: genera un cobro/link/QR que el cliente
  paga; se confirma por **webhook**. Sirve para e-commerce y cobro por QR,
  pero **no empuja el monto a la pantalla del Stand 2**.
- **Integración por API a terminal física**: Clip la ofrece oficialmente
  para su **Clip Pin Pad** (terminal de mostrador diseñada para conectarse
  a un POS externo por API y cobrar sin teclear el monto). El **Clip Stand
  2** es una terminal Android autónoma con su propia app; **no expone hoy
  un API local** para que un POS externo le dispare el cobro.

**Conclusión para Hojaldras Lily (hardware actual = Stand 2):** se opera con
la **ruta manual** (nivel 1). La confirmación automática requiere la API
de Checkout (nivel 2/3, opcional, necesita cuenta + token de developer).
El "cobro automático empujando el monto a la terminal" requeriría un
**Clip Pin Pad**, no el Stand 2. Decisión del negocio: **arrancamos en
manual**; el sistema queda listo para subir de nivel sin reescribir.

**Estado en el POS**: el flujo manual ya está implementado en
`apps/pos` (método "Clip (Stand 2)" pide la referencia del voucher y
registra el pago aprobado). Ver `Venta.tsx`.

## Nivel 1 — Ruta manual (disponible HOY)

1. Cajero crea la orden y elige método **clip**.
2. Teclea el monto en el Stand y cobra normal.
3. En el POS confirma con la referencia del voucher:
   ```ts
   cobrarOrden(sb, ordenId, 'clip', monto, { referencia: 'folio-voucher' })
   ```
4. El pago nace `aprobado` → triggers hacen el resto.

Riesgo: captura manual (monto/referencia). Mitigación: el corte cruza
`total_clip` contra el reporte del portal de Clip.

## Nivel 2 — Ruta con API (payment intent)

Cuando se contrate acceso a la API de terminales de Clip:

1. POS crea el pago **pendiente**:
   `registrarPago(sb, { orden_id, metodo: 'clip', monto, estado: 'pendiente' })`
2. Una **edge function** `clip-crear-cobro` (server-side, con
   `CLIP_API_KEY`) pide a Clip iniciar el cobro en la terminal
   (`CLIP_TERMINAL_SERIAL`) y guarda `clip_payment_id` en el pago.
3. El Stand muestra el monto; el cliente paga.
4. Confirmación por webhook (nivel 3) o por polling del estado del pago.

La API key **jamás** va al frontend: vive como secret de la edge function.

## Nivel 3 — Webhook

Edge function `clip-webhook` (en `supabase/functions/`):

1. Clip hace POST con el resultado del cobro.
2. La función valida la firma con `CLIP_WEBHOOK_SECRET` (rechaza si no
   coincide).
3. Busca el pago por `clip_payment_id` y lo pasa a `aprobado` (o
   `rechazado`), guardando el payload crudo en `clip_payload`.
4. `trg_pago_aprobado` marca la orden pagada → cocina + inventario.

Idempotente: si el webhook llega dos veces, el pago ya está `aprobado` y
el trigger no re-dispara (la orden ya tiene `pagado = true`).

## Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `CLIP_API_KEY` | Secret de edge function | crear cobros (nivel 2) |
| `CLIP_WEBHOOK_SECRET` | Secret de edge function | validar firma del webhook (nivel 3) |
| `CLIP_TERMINAL_SERIAL` | Config por caja | a qué Stand mandar el cobro |

## Campos de `pagos` para Clip (ya creados)

| Campo | Tipo | Uso |
|---|---|---|
| `metodo` | enum (`clip`, …) | método de pago |
| `estado` | enum `pendiente/aprobado/rechazado/cancelado` | ciclo de vida (legado) |
| `estado_transaccion` | enum `estado_transaccion_pago` | ciclo de vida real, ver `docs/maquina-estados.md` |
| `referencia` | text | folio de voucher en ruta manual |
| `clip_payment_id` | text (indexado) | id del cobro en Clip (API/webhook) |
| `clip_terminal_id` | text | terminal que cobró |
| `clip_payload` | jsonb | respuesta/webhook crudo para auditoría |
| `proveedor` | text | qué proveedor procesó el pago (`clip`) |
| `proveedor_payment_id` | text | id del cobro en el proveedor (ruta nueva, kiosko) |
| `proveedor_error` | text | último error crudo del proveedor, si lo hubo |

---

## Integración del kiosko (nueva)

A diferencia de POS (donde el cajero teclea la referencia del voucher a
mano), el kiosko necesita cobrar sin intervención humana — por eso existe
una abstracción `PaymentProvider` (`packages/payments/`) que el kiosko
consume, sin saber nada de Clip directamente:

```ts
interface PaymentProvider {
  createPayment(params): Promise<CrearPagoResultado>
  getPaymentStatus(proveedorPaymentId): Promise<EstadoPagoResultado>
  cancelPayment(proveedorPaymentId): Promise<void>
  refundPayment(proveedorPaymentId, monto?): Promise<void>
  verifyWebhook(rawBody, headers): Promise<WebhookEvento | null>
  normalizePaymentStatus(estadoProveedor): EstadoTransaccionPago
}
```

`obtenerPaymentProvider(modo, sb)` (`packages/payments/src/index.ts`) es la
única puerta de entrada — el kiosko nunca instancia `ClipPaymentProvider`
directo. Con `modo='demo'` regresa `MockPaymentProvider` (bloqueado en
build de producción por su cuenta, ver `docs/flujo-pagos.md`); con
cualquier otro modo que necesite proveedor real, regresa
`ClipPaymentProvider`.

### Regla de credenciales — dónde SÍ y dónde NUNCA

| Dónde | ¿Credenciales de Clip? |
|---|---|
| Supabase Edge Functions (`supabase/functions/clip-*`) | ✅ Único lugar permitido — `Deno.env.get('CLIP_API_KEY')` / `CLIP_WEBHOOK_SECRET`, seteados con `supabase secrets set` |
| `packages/payments/src/clipProvider.ts` (corre en el navegador) | ❌ Nunca — solo invoca `sb.functions.invoke('clip-crear-cobro', ...)` |
| Vite / React / bundle del kiosko | ❌ Nunca |
| localStorage / logs del navegador | ❌ Nunca |
| Metadata de Supabase accesible por `anon` | ❌ Nunca |

`ClipPaymentProvider` (`clipProvider.ts`) es deliberadamente "tonto": arma
el request, llama la Edge Function correspondiente, y propaga la respuesta
tal cual. Nunca decide por su cuenta que un pago se aprobó.

### Edge Functions (escritas, NO desplegadas — ver checklist de activación)

| Función | Qué hace hoy (sin credenciales) | Qué debe hacer con Clip real |
|---|---|---|
| `clip-crear-cobro` | Responde `{ok:false, error:{codigo:'not_configured'}}`. Si hay credenciales pero falta la llamada real, responde `not_implemented` (HTTP 501) — nunca inventa una aprobación | Recalcular el monto desde `ordenes.total` (NUNCA confiar en el monto que manda el navegador), crear el cobro real en Clip con `idempotency_key`, guardar `proveedor_payment_id`, dejar el pago en `pending`/`processing` |
| `clip-estado-cobro` | Responde `estado:'unknown'` | Consultar el estado real de un `proveedor_payment_id` en Clip (usado por `getPaymentStatus` y por la reconciliación) |
| `clip-webhook` | Sin credenciales, no hay nada que validar | Validar la firma HMAC con `CLIP_WEBHOOK_SECRET` (comparación de tiempo constante), buscar el pago por `proveedor_payment_id`, actualizar `estado_transaccion`, y si es `authorized`, llamar `fn_confirmar_venta()` — **este es el único lugar que debe confirmar una venta de Clip real**, nunca la respuesta HTTP que ve el navegador |
| `clip-cancelar-cobro` | Responde `not_configured`/`not_implemented` | Cancelar un cobro antes de que se complete |
| `clip-reembolsar` | Responde `not_configured`/`not_implemented` | Reembolsar (total o parcial) un pago ya `authorized`; debe actualizar `estado_transaccion` a `refunded_partial`/`refunded_full` a través de la máquina de estados, nunca tocando la orden directo |

Ninguna de las cinco funciones fue desplegada a Supabase en esta ronda
(están escritas en `supabase/functions/clip-*` pero no corridas
`deploy_edge_function`) — deliberado: no tiene sentido desplegar código que
sin credenciales solo puede responder "no configurado", y desplegar es una
acción con efecto en el proyecto real que debe hacerse junto con configurar
los secrets, no antes.

### Pasos exactos para activar Clip en el kiosko el día que lleguen las credenciales

1. Conseguir de Clip: `CLIP_API_KEY` (o el nombre real que use su API),
   `CLIP_WEBHOOK_SECRET` (o cómo sea que Clip firme sus webhooks — puede no
   llamarse así, ajustar según su documentación real), y la URL/formato
   exacto de su API de checkout o payment intents (no asumida aquí a
   propósito — ver la nota "Realidad del hardware" arriba: para el Stand 2
   la única ruta con webhook documentada es la API de Checkout, no una API
   de terminal).
2. `supabase secrets set CLIP_API_KEY=... CLIP_WEBHOOK_SECRET=...` en el
   proyecto `fzkdgqqvfkogmxdgqsxj`.
3. Reemplazar los bloques `// TODO: llamar a la API real de Clip` en
   `clip-crear-cobro`, `clip-estado-cobro`, `clip-cancelar-cobro`,
   `clip-reembolsar` con las llamadas reales, y la validación de firma real
   en `clip-webhook`.
4. Ajustar `ClipPaymentProvider.normalizePaymentStatus()` (hoy es un mapeo
   genérico de nombres comunes — `pending`/`authorized`/`declined`/etc. —
   documentado en el propio archivo como "se ajusta en cuanto se tenga la
   documentación real") a los valores exactos que devuelve la API de Clip.
5. `supabase functions deploy clip-crear-cobro clip-estado-cobro
   clip-webhook clip-cancelar-cobro clip-reembolsar`.
6. Registrar la URL del webhook desplegado
   (`https://fzkdgqqvfkogmxdgqsxj.supabase.co/functions/v1/clip-webhook`)
   en el panel de developer de Clip.
7. Cambiar `configuracion_kiosko.modo_pago` a `'clip'` para la sucursal de
   prueba desde Admin → Sistema.
8. Probar de punta a punta: cobro aprobado, cobro rechazado, cerrar el
   navegador a medias (debe caer en `payment_unknown`, no crear un segundo
   cobro), y confirmar que `docs/reconciliacion-pagos.md` lo resuelve solo
   en el siguiente minuto de cron.
9. Solo después de ver eso pasar limpio en la sucursal de prueba, activar
   `clip` en el resto.
