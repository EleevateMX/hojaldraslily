# Pruebas de concurrencia

Los 9 escenarios pedidos, probados con **concurrencia real** — no simulada
en un solo script secuencial, sino dos (o tres) llamadas SQL disparadas
como invocaciones de herramienta verdaderamente paralelas dentro del mismo
turno, contra el proyecto vivo `fzkdgqqvfkogmxdgqsxj`. Donde el resultado
dependía de quién ganara la fila primero, se forzó el orden de forma
determinista con `SELECT ... FOR UPDATE` + `pg_sleep()` en una de las dos
ramas — así el ganador no depende de la suerte del reloj, y se puede
verificar el comportamiento en ambos sentidos.

Todo se corrió contra datos de prueba aislados y claramente marcados
(`TEST-CONCURRENCIA-*`, IDs fijos `00000000-…-f00N`), creados y
**borrados por completo al final** — verificado con una consulta de cero
resultados tras la limpieza (ver §10). A diferencia de las pruebas de
seguridad de `docs/pruebas-seguridad.md` (que usan rollback dentro de una
sola transacción), estas pruebas necesitan que los datos persistan *entre*
llamadas separadas para que la concurrencia sea real, así que la limpieza
aquí es un `DELETE` explícito al final, no un rollback.

## 1. Dos cobros simultáneos de la misma orden / dos cajeros cobrando el mismo folio

Una orden en `awaiting_counter_payment` ($50). Dos "cajeros" llaman
`fn_cobrar_orden` al mismo tiempo con distinto método de pago y distinta
`idempotency_key` (simulando dos cajas distintas, no un reintento del
mismo cajero). Cajero A toma el candado de la fila explícitamente y espera
4s antes de cobrar; Cajero B intenta cobrar casi de inmediato (1s) —
Postgres obliga a B a esperar a que A termine, porque `fn_cobrar_orden`
hace `select … for update` sobre la orden.

**Resultado:** exactamente 1 fila en `pagos` (método `efectivo`, el de
Cajero A), exactamente 1 fila en `venta_confirmaciones`, orden `paid`.
Cajero B no creó ningún pago — para cuando su llamada obtuvo el candado,
la orden ya no estaba en un estado cobrable y su llamada no hizo nada
(sin error visible al usuario final, porque en producción B nunca
llegaría a intentarlo: el POS ya habría marcado la orden como cobrada por
Realtime).

## 2. Dos webhooks idénticos (doble confirmación del mismo pago)

Se insertó un pago ya `authorized` (simulando que Clip ya lo aprobó) y se
dispararon dos llamadas **simultáneas** a `fn_confirmar_venta(orden_id,
pago_id)` — exactamente lo que haría el webhook si Clip reenvía el mismo
evento dos veces (algo común en la práctica: la mayoría de las pasarelas
reintentan si no reciben 200 a tiempo).

**Resultado:** exactamente 1 fila en `venta_confirmaciones`. La garantía es
estructural — `venta_confirmaciones.orden_id` es `PRIMARY KEY`, así que la
segunda inserción concurrente simplemente no inserta nada
(`ON CONFLICT DO NOTHING`), sin importar el orden de llegada.

## 3. Webhook y reconciliación simultáneos

Mismo pago `authorized` sin venta confirmada. Se disparó
`fn_confirmar_venta` (simulando el webhook) al mismo tiempo que
`fn_reconciliar_pagos()` completa (que también busca e intenta confirmar
exactamente ese tipo de pago huérfano).

**Resultado:** exactamente 1 fila en `venta_confirmaciones`.
`fn_reconciliar_pagos()` no reportó ninguna corrección para esa orden — la
misma garantía de `venta_confirmaciones` como PK hace que no importe cuál
de los dos procesos gane la carrera, ni que estén corriendo por caminos de
código distintos.

## 4. Pago confirmado mientras se cancela la orden

Todavía no existe un botón de "cancelar orden" en el producto (no se pidió
en rondas anteriores), así que se probó la transición directa
`estado_pago_orden → 'cancelled'` — que es exactamente lo que ese botón
haría el día que exista. Se probó **en los dos sentidos**, cada uno con la
misma técnica de candado forzado:

- **Cancelación gana la carrera:** la orden termina `cancelled`, el cobro
  concurrente no crea ningún pago (0 filas en `pagos`).
- **Cobro gana la carrera:** la orden termina `paid`, y el intento de
  cancelación posterior es **rechazado por el trigger de la máquina de
  estados** (`paid` no es un origen válido hacia `cancelled` en la tabla de
  transiciones — ver `docs/maquina-estados.md`), no solo por timing.

**Resultado:** en ambos órdenes de ejecución, la orden termina en un
estado consistente y único — nunca "pagada y cancelada a la vez", nunca
con un pago huérfano de una orden cancelada.

## 5. Dos agentes reclamando el mismo trabajo de impresión

Un trabajo `pending` para una impresora de prueba. Dos llamadas
**simultáneas** a `fn_imprimir_reclamar_trabajos` con el mismo token
(simulando dos instancias del agente corriendo por error, o un reinicio
que se solapa con la instancia vieja).

**Resultado:** Agente A reclamó el trabajo (`claimed_by='AGENTE_A'`).
Agente B recibió **cero filas** — `FOR UPDATE SKIP LOCKED` está
diseñado exactamente para esto: en vez de esperar el candado y reclamar
el mismo trabajo después, simplemente lo salta.

## 6. Dos ventas consumiendo el último inventario

Insumo de prueba con `stock_actual = 1`. Dos órdenes distintas, cada una
por 1 unidad del producto de prueba, cobradas **simultáneamente**.

**Resultado — dos partes:**
- **La aritmética es segura:** `stock_actual` terminó en exactamente `-1`
  (1 − 1 − 1), no en `0` ni en `-2`. Esto prueba que no hubo
  *lost update*: las dos transacciones decrementaron la misma fila de
  forma correcta y serializada (Postgres bloquea la segunda `UPDATE`
  hasta que la primera libera el candado de fila).
- ⚠️ **Hallazgo real, no un bug de concurrencia sino de regla de negocio:**
  **el sistema no impide vender más de lo que hay.** `fn_descontar_inventario_por_orden`
  nunca compara `stock_actual` contra la cantidad requerida antes de
  descontar — ambas órdenes se cobraron con éxito y ambas se marcaron
  `paid`, aunque solo había 1 unidad disponible. Esto no es nuevo de esta
  ronda (ya pasaba con ventas secuenciales, se confirmó por accidente antes
  de este test: 3 ventas secuenciales de un insumo con stock=1 dejaron
  `stock_actual = -2` sin que ninguna fallara) — pero esta prueba de
  concurrencia lo hace imposible de ignorar. **No se corrigió en esta
  ronda** porque es una decisión de producto (¿bloquear la venta cuando no
  hay stock, con el riesgo de rechazar una venta real por una receta mal
  capturada, o dejar vender y que el stock negativo sea la señal de "hay
  que reabastecer"?), no una corrección de seguridad — queda documentado
  como pendiente en `docs/checklist-produccion.md`.

## 7. Dos canjes simultáneos del mismo cupón

Un cupón `activo`. Dos `UPDATE cupones SET estado='usado' WHERE id=... AND
estado='activo'` disparados al mismo tiempo (el patrón exacto que usa
`canjearCupon()` en `packages/supabase/src/queries/lealtad.ts`).

**Resultado:** una de las dos actualizaciones afectó 1 fila (canje
exitoso); la otra afectó **cero filas** — para cuando corrió, la
condición `estado='activo'` ya no aplicaba. El cupón terminó `usado`
exactamente una vez.

## 8. Dos ventas completando 100 mancuernas a la vez

Cliente de prueba con 90 mancuernas y cero cupones activos. Dos órdenes de
$100 cada una (10 mancuernas c/u), cobradas **simultáneamente** — juntas
cruzan el umbral de 100 exactamente igual que si fuera un solo evento.

**Resultado:** saldo final = 10 mancuernas, exactamente 1 cupón nuevo
generado. Matemáticamente idéntico a que las dos ventas hubieran ocurrido
en secuencia (90 + 10 = 100 → genera 1 cupón → 0, + 10 = 10) — sin importar
que en la realidad ocurrieron al mismo tiempo. Igual que en el caso del
inventario, el `UPDATE clientes SET mancuernas = mancuernas + gana ...
RETURNING` es atómico y serializa las dos transacciones sin perder
ninguna actualización, y el bucle que genera cupones lee siempre el saldo
ya serializado — no hay forma de que dos ventas concurrentes generen dos
cupones por el mismo cruce de 100.

## 9. Resumen

| # | Escenario | Resultado |
|---|---|---|
| 1 | Dos cobros / dos cajeros, misma orden | ✅ Un solo pago, una sola venta confirmada |
| 2 | Dos webhooks idénticos | ✅ Una sola confirmación (PK estructural) |
| 3 | Webhook + reconciliación simultáneos | ✅ Una sola confirmación, sin importar quién gane |
| 4 | Pago vs. cancelación concurrentes | ✅ Estado final único y consistente en ambos órdenes |
| 5 | Dos agentes reclamando un trabajo | ✅ Uno lo reclama, el otro recibe cero filas |
| 6 | Dos ventas, última unidad de inventario | ✅ Aritmética correcta — ⚠️ pero permite sobreventa (hallazgo de negocio, no de concurrencia) |
| 7 | Dos canjes del mismo cupón | ✅ Uno se canjea, el otro afecta cero filas |
| 8 | Dos ventas cruzando 100 mancuernas | ✅ Saldo correcto, un solo cupón generado |

## 10. Limpieza

Toda la evidencia de estas pruebas (11 órdenes de prueba, sus pagos,
`venta_confirmaciones`, `pedidos_cocina`, `trabajos_impresion`,
movimientos de inventario y de mancuernas, el cliente/insumo/producto/
impresora de prueba) se borró explícitamente al terminar. Confirmado con
una consulta final que cuenta cero filas en cada tabla afectada. Ninguno
de los `trabajos_impresion` generados durante la prueba llegó a tener un
`printer_id` de una impresora real de producción (todos quedaron
`printer_id = null`, `estado = 'pending'`) — nada se envió a hardware real.
