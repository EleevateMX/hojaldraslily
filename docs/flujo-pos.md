# Flujo POS

Todo el flujo ya está soportado por la base y `@shake/supabase`.

## 1. Apertura de caja

```ts
const corte = await abrirCaja(sb, cajaId, fondoInicial, empleadoId)
```
La base garantiza un único corte abierto por caja (índice parcial).

## 2. Venta

1. Catálogo: `listarProductos()` — el precio SIEMPRE sale de `productos.precio`.
2. Carrito en memoria; total = Σ cantidad × precio_unitario.
3. `crearOrden(sb, { canal: 'pos', sucursal_id, almacen_id: KIOSKO, corte_id, empleado_id }, items)`
   → orden `pendiente`, `pagado = false`.

## 3. Cobro

| Método | Acción |
|---|---|
| efectivo / tarjeta / cortesía / otro | `cobrarOrden(sb, ordenId, metodo, monto)` → pago `aprobado` inmediato |
| clip (manual, hoy) | `cobrarOrden(sb, ordenId, 'clip', monto, { referencia: folioVoucher })` |
| clip (API/webhook, fase 8) | `registrarPago(..., estado: 'pendiente')` → el webhook lo aprueba |

Al quedar `aprobado`, **la base** (triggers):
- marca `ordenes.pagado = true` y fija `metodo_pago`;
- descuenta `inventario_stock` del almacén de la orden según `recetas`
  y escribe `inventario_movimientos` tipo `venta`;
- inserta el registro contable en `ventas`;
- crea `pedidos_cocina` + `cocina_items` por estación.

El frontend no repite ninguna de esas escrituras.

## 4. Cierre de caja

```ts
await cerrarCaja(sb, corteId, efectivoContado, empleadoId)
const resumen = await resumenCorte(sb, corteId)
// → total_efectivo/tarjeta/clip/cortesia/otro, efectivo_esperado, diferencia
```

## Reglas

- Orden sin pagar no dispara cocina ni inventario.
- Cancelación después de pagada requiere ajuste manual de inventario
  (movimiento tipo `ajuste`) — pendiente automatizar en fase 7.
- Cortesía registra pago `cortesia` con monto 0 o total, según política
  (decidir en fase 7; hoy el POS manda el monto).
