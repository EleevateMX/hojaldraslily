# Flujo inventario

Dos almacenes sembrados por sucursal: **Bodega** y **Kiosko**.

| Operación | Cómo | Movimiento |
|---|---|---|
| Entrada de compra | `registrarMovimiento({ tipo: 'compra', cantidad: +n, almacen: Bodega, costoUnitario })` | `compra` |
| Transferencia Bodega → Kiosko | `transferir({ origenId, destinoId, items })` | `traspaso` −origen / +destino |
| Venta | automática (trigger al pagar la orden, descuenta del `almacen_id` de la orden) | `venta` |
| Merma | fila en `mermas` + `registrarMovimiento({ tipo: 'merma', cantidad: −n })` | `merma` |
| Ajuste manual | `registrarMovimiento({ tipo: 'ajuste', cantidad: ±n, nota })` | `ajuste` |
| Existencias | `vw_stock_almacen` (incluye flag `bajo_minimo`) | — |

## Reglas

- `inventario_movimientos` es el kardex: **nunca se edita ni borra**; los
  errores se corrigen con un movimiento `ajuste` compensatorio.
- El stock puede quedar negativo (venta sin captura de inventario previa):
  se permite a propósito para no bloquear ventas; el reporte lo evidencia
  y se corrige con ajuste.
- Las cantidades van en la **unidad del insumo** (g, ml, scoop, pza) — la
  misma unidad de las recetas.

## Pendiente

- UI de compras/transferencias/mermas (fase 7, en `apps/admin` o
  `apps/costos`).
- Concurrencia: el descuento de venta lo hace el trigger en la
  transacción del UPDATE (seguro); `registrarMovimiento` del cliente hace
  read-modify-write — si dos dispositivos capturan a la vez puede perderse
  un delta. Fase 9: mover a RPC con `update ... set stock = stock + n`.
