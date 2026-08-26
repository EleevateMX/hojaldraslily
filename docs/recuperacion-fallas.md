# Recuperación ante fallas

Qué hace el sistema (y qué debe hacer el staff) cuando algo falla a media
operación. Los escenarios marcados **✅ protegido** ya están cubiertos por
diseño (probado en `docs/auditoria-produccion.md`); los marcados
**⚠ manual** requieren una acción humana porque automatizarlos de forma
segura excede lo que se puede garantizar sin más información (ej. sin
saber si un cliente realmente pagó).

## Pagos y órdenes

| Escenario | Qué pasa | Acción |
|---|---|---|
| Doble clic en "Confirmar pago" | ✅ `fn_cobrar_orden` es idempotente — un solo pago aprobado, el segundo intento devuelve el mismo | Ninguna |
| Recarga de página durante el cobro | ✅ La orden queda en `pendiente` si no llegó a pagarse, o ya `pagado=true` si el cobro sí completó antes de la recarga — nunca queda una venta "a medias" (crear+cobrar corren en transacciones separadas pero cada una es atómica) | Si quedó `pendiente` sin pagar, se puede reintentar el cobro con el mismo `ordenId` |
| Kiosko pierde internet durante el pago | ✅/⚠ Si perdió conexión ANTES de que `fn_cobrar_orden` confirmara, la orden queda `pendiente` (no se cobró nada) — el cliente no se queda con un pedido fantasma pagado. Si perdió conexión justo DESPUÉS de que el servidor ya aprobó pero la respuesta no llegó al kiosko, la orden SÍ quedó pagada del lado servidor — el kiosko debe reintentar con la misma orden en cuanto recupere señal (ver nota abajo) | Revisar en Admin/POS si el folio existe y su estado antes de asumir que no se cobró |
| Total manipulado / monto falso vía REST directo | ✅ `fn_cobrar_orden` rechaza cualquier monto que no coincida con el total real calculado por `fn_crear_orden` | Ninguna |
| Orden fantasma sin items | ✅ Ya no puede pasar — `fn_crear_orden` inserta orden+items en una sola transacción | Si aparece una orden vieja sin items (de antes de este fix), se puede borrar a mano tras confirmar que no tiene pagos/inventario asociado |

**Nota sobre "el servidor aprobó pero la respuesta no llegó":** hoy el
cliente no reintenta automáticamente un cobro — si ve un error de red,
debe volver a intentar manualmente. Gracias a la idempotencia de
`fn_cobrar_orden` (un pago aprobado por orden, sin importar cuántas veces
se llame), reintentar SIEMPRE es seguro: si ya se había cobrado, el
segundo intento no cobra de nuevo ni duplica nada, solo confirma lo que
ya pasó.

## Inventario

| Escenario | Qué pasa | Acción |
|---|---|---|
| Venta duplicada por reintento | ✅ Protegido por el mismo guard que pagos: `ordenes.pagado` solo transiciona una vez, así que el descuento de inventario (`fn_descontar_inventario_por_orden`) tampoco se duplica | Ninguna |
| costosshake guarda mientras hay ventas en curso | ✅ Modelo de deltas (ver `docs/pendientes.md` "Auto-sync") — guardar en costosshake nunca sobrescribe lo ya vendido | Ninguna |
| Producto sin receta | ⚠ La venta se registra igual pero no descuenta ningún insumo (no hay a qué descontar) — no genera alerta automática hoy | Revisar periódicamente productos activos sin receta en `recetas` |
| Stock queda negativo | ⚠ Hoy no hay bloqueo — el POS permite vender aunque el stock quede en negativo | Revisar `vw_stock_almacen` / alertas de Admin; política explícita de "no vender si stock < 0" queda como mejora futura |

## Impresión de comandas

Ver `docs/impresion-comandas.md` para el detalle completo. Resumen:

| Escenario | Qué pasa | Acción |
|---|---|---|
| Impresora apagada/sin papel/desconectada | ✅ El trabajo queda en la cola (`pending`/`retry`), se reintenta solo con backoff hasta 5 veces, luego `failed` | Prender/reabastecer la impresora — el agente retoma solo en el siguiente reintento, o reimprimir manual desde Admin/KDS |
| Agente muere justo después de reclamar un trabajo | ✅ `claim_expires_at` (2 min) lo libera automáticamente — otro reclamo (o el mismo agente al reiniciar) lo vuelve a tomar. Respaldo: cron `fn_imprimir_liberar_vencidos` cada minuto | Ninguna, es automático |
| Dos agentes apuntan al mismo token por error | ✅ `FOR UPDATE SKIP LOCKED` en el reclamo — nunca se imprime la misma comanda dos veces por esto | Corregir la config para que cada impresora tenga un solo agente sirviéndola (aunque no es peligroso si pasa) |
| La comanda nunca se imprimió (falló 5 veces) | ⚠ Queda `failed`, visible en Admin → Impresoras y en la tarjeta del pedido en KDS | Reimprimir manualmente una vez resuelto el problema de hardware |
| Falla de impresión en general | ✅ Nunca cancela la venta, revierte el pago, bloquea el inventario, ni borra el pedido — el KDS sigue mostrando el pedido normal | Reimprimir cuando se pueda |

## Realtime / conexión

| Escenario | Qué pasa | Acción |
|---|---|---|
| KDS pierde la conexión Realtime | ⚠ Hoy no hay indicador visual de "desconectado" en el KDS ni reconexión con backoff explícito (documentado como pendiente, ver `docs/auditoria-produccion.md` hallazgo M3) | Recargar la página manualmente si un pedido no aparece después de varios minutos |
| Agente de impresión pierde Realtime | ✅ El poll periódico de respaldo (cada 10s por defecto) sigue drenando la cola aunque el canal esté caído — nunca depende solo de Realtime | Ninguna |

## Caja / corte

| Escenario | Qué pasa | Acción |
|---|---|---|
| Cajero sin apertura de caja | ✅ El POS bloquea la pantalla de venta y pide abrir caja primero | Abrir caja con el fondo inicial |
| Caja cerrada desde otra sesión mientras se vendía | ⚠ No verificado en esta ronda — comportamiento no probado explícitamente | Evitar operar la misma caja desde dos sesiones a la vez hasta que se agregue esa protección |
| Corte con diferencia de efectivo | ✅ El corte se calcula desde `pagos`/`inventario_movimientos` reales (`vw_corte_resumen`), no desde un total capturado a mano — la diferencia contado vs. esperado sale sola | Investigar la diferencia con el cajero |

## Qué NO está cubierto todavía (documentado, no implementado)

- Modo verdaderamente offline (aceptar ventas sin conexión y sincronizar
  después) — **deliberadamente no implementado**: aceptar pagos sin
  confirmación del servidor sería una falsa sensación de seguridad. Sin
  internet, el sistema debe mostrar "sin conexión" y no permitir cobrar.
- Reconciliación automática de pagos Clip vía webhook (nivel 3 de
  `docs/integracion-clip.md`) — pendiente de credenciales.
- Alertas proactivas (push/email) cuando algo falla — hoy todo se ve
  revisando Admin; no hay notificación activa todavía.
