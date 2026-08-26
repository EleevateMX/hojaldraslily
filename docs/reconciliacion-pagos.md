# Reconciliación de pagos y expiración de órdenes

Dos tareas separadas, ambas idempotentes, ambas corriendo por cron cada
minuto (`pagos_maquina_estados_p4_expiracion_reconciliacion.sql`), y ambas
disparables a mano desde Admin → Sistema ("Reconciliar ahora").

## `payment_unknown`: qué significa y cómo se llega ahí

Una orden entra a `payment_unknown` cuando el pago quedó en un estado
ambiguo: se perdió la conexión durante el cobro, Clip no respondió a
tiempo, el cliente cerró el navegador del kiosko, o el resultado nunca se
recibió con claridad. **En ese estado el sistema explícitamente NO hace lo
siguiente:**

- No crea un segundo cobro automáticamente.
- No permite reintentar de inmediato con una orden nueva sin antes intentar
  resolver la ambigüedad de la orden existente.
- No confirma la venta solo porque "probablemente sí se cobró".

En cambio: la orden y el pago quedan visibles en Admin → Sistema
(indicador "Pagos con estado desconocido"), el intento queda registrado
(`pagos.proveedor_payment_id`, `pagos.proveedor_error`), y la reconciliación
automática se encarga de resolverlo apenas el estado real se aclare (ver
abajo). El cliente, mientras tanto, ve una pantalla segura (no "pagado", no
"rechazado" — una pantalla neutral que no promete nada que no se sepa
todavía).

## `fn_reconciliar_pagos()` — dos casos, ambos de solo-avance

Corre bajo `set_config('app.transition_context', 'reconciliation', true)`
— el único contexto que el trigger de la máquina de estados reconoce para
permitir reabrir una orden `expired`.

**Caso 1 — pago autorizado sin venta confirmada.** Busca pagos con
`estado_transaccion = 'authorized'` cuya orden NO esté ya en
`paid`/`refunded_partial`/`refunded_full` y que NO tengan fila en
`venta_confirmaciones`. Para cada uno, llama `fn_confirmar_venta()` (el
mismo camino de siempre — no hay una ruta paralela) y registra el evento en
`ordenes_auditoria`. Esto cubre exactamente "el pago sí se autorizó pero,
por lo que sea, el paso de confirmar la venta nunca se ejecutó" —
ej. el servidor se cayó justo después del webhook.

**Caso 2 — `pagado=true` desincronizado.** Busca órdenes con el booleano
legado `pagado = true` pero `estado_pago_orden` todavía no reflejándolo, y
corrige el estado a `paid`. Es una red de seguridad de consistencia, no
debería activarse nunca en operación normal (solo si algo tocó `pagado`
por fuera del camino esperado).

Ambos casos son **de solo-avance**: nunca revierten un `paid` a otra cosa,
nunca tocan pagos en `pending`/`processing`/`unknown` reales todavía
esperando respuesta genuina del proveedor — solo actúa cuando ya hay
evidencia clara (`authorized` real, o `pagado=true` real) de que la venta
debió confirmarse y no se confirmó.

## `fn_expirar_ordenes_kiosko()` — expiración de órdenes kiosko

Recorre órdenes `canal='kiosko'` en `pending_payment`,
`awaiting_counter_payment`, `payment_processing` o `payment_unknown` cuyo
`expira_en < now()`, con `FOR UPDATE SKIP LOCKED` (seguro si corre el cron
y alguien le da "Reconciliar ahora" en Admin al mismo tiempo — no se pisan,
cada fila la toma solo uno). Por cada una:

- Cambia `estado_pago_orden = 'expired'`.
- Inserta un registro en `ordenes_auditoria` (`evento='expirada'`).
- **Nunca borra la orden** — limpieza lógica únicamente, queda toda la
  evidencia (qué se pidió, cuándo, por qué expiró).
- No hay ningún efecto de inventario/mancuernas/comandas que revertir,
  porque una orden que llega a `expired` nunca los tuvo en primer lugar
  (esos triggers solo corren cuando `pagado` pasa a `true`, y una orden
  expirada nunca llegó ahí).

`expira_en` se calcula en `fn_crear_orden()`/`fn_crear_orden_kiosko_caja()`
a partir de `configuracion_kiosko.expira_minutos` (configurable por
sucursal desde Admin → Sistema, default razonable sembrado por la
migración).

Cobrar una orden `expired` está bloqueado por el trigger de transición
(`expired` no es origen de ninguna transición normal hacia
`payment_processing`/`paid`) salvo que alguien la reabra explícitamente
bajo el contexto de reconciliación — hoy eso solo lo hace
`fn_reconciliar_pagos()` cuando encuentra evidencia real de pago
autorizado; no hay todavía un botón de "reabrir a mano" en Admin (deuda
pendiente, ver `docs/checklist-produccion.md`).

## Panel de administración (Admin → Sistema)

`apps/admin/src/pages/Sistema.tsx`. Muestra, refrescando cada 30s:

- 8 indicadores operativos (pagos pendientes, pagos desconocidos, órdenes
  esperando caja, órdenes expiradas en 24h, impresoras conectadas,
  comandas fallidas, pedidos sin comanda, ventas sin movimiento de
  inventario) vía `fn_salud_sistema()`.
- El modo de pago configurado por sucursal, con botones para cambiarlo
  (bloqueado en base para `demo` si la sucursal es de producción).
- Botón **"Reconciliar ahora"** que corre `fn_reconciliar_pagos()` +
  `fn_expirar_ordenes_kiosko()` de inmediato y muestra una tabla con orden,
  acción tomada y detalle — para no tener que esperar al minuto del cron
  cuando se está depurando algo en vivo.

Lo que el panel **no** muestra todavía (columnas explícitamente pedidas que
quedan pendientes): proveedor por pago, fecha del último intento, error
crudo del proveedor por fila — hoy se ven agregados como conteos, no como
tabla detallada por orden. Documentado como pendiente en
`docs/checklist-produccion.md`.
