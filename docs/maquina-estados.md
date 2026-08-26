# Máquina de estados: orden, pago y venta

Este documento formaliza lo que el código ya hace, para que nadie
(incluido un futuro yo) confunda "la orden dice `pagado=true`" con "la
venta está confirmada". Son tres cosas separadas a propósito:

- **Orden** (`ordenes.estado_pago_orden`) — dónde va el pedido.
- **Pago** (`pagos.estado_transaccion`) — qué pasó con el dinero.
- **Venta** (`venta_confirmaciones`) — que el sistema YA aplicó los efectos
  reales de una venta pagada (inventario, mancuernas, comandas) exactamente
  una vez.

`ordenes.pagado` (booleano legado) sigue existiendo por compatibilidad con
los triggers que ya estaban en producción (`fn_descontar_inventario_por_orden`,
`fn_crear_pedidos_cocina`, `fn_acumular_mancuernas`), pero **nunca es la
fuente de verdad** — es un espejo que `fn_confirmar_venta()` actualiza como
efecto secundario, después de decidir con la máquina de estados real que la
venta debe confirmarse.

## Estados de la orden (`estado_pago_orden`)

```
draft → pending_payment → payment_processing → paid → refunded_partial → refunded_full
  ↓            ↓                  ↓               ↑
cancelled   awaiting_       payment_unknown ──────┘
            counter_payment      ↓
                 ↓            cancelled / expired
            expired / cancelled
```

Transiciones permitidas (todo lo demás lo rechaza el trigger
`fn_validar_transicion_estado_pago_orden`, `BEFORE UPDATE OF estado_pago_orden`):

| De | A |
|---|---|
| `draft` | `pending_payment`, `awaiting_counter_payment`, `cancelled` |
| `pending_payment` | `payment_processing`, `paid`, `cancelled`, `expired`, `payment_unknown` |
| `awaiting_counter_payment` | `payment_processing`, `paid`, `cancelled`, `expired` |
| `payment_processing` | `paid`, `cancelled`, `payment_unknown`, `expired` |
| `payment_unknown` | `paid`, `cancelled`, `expired` |
| `paid` | `refunded_partial`, `refunded_full` |
| `refunded_partial` | `refunded_full` |

Caso especial `expired →`: solo permitido si la sesión tiene
`set_config('app.transition_context', 'reconciliation', true)` — es decir,
**solo** `fn_reconciliar_pagos()`/la reapertura administrativa pueden mover
una orden expirada, nunca un cliente ni un cajero por accidente.

Explícitamente bloqueado por diseño (y probado, ver `docs/pruebas-seguridad.md`
y las pruebas de concurrencia de la ronda anterior):
- `draft → paid` sin pasar por un pago autorizado real.
- `declined → paid` — de hecho `declined` ni siquiera es un estado de
  *orden*, es un estado de *pago*; una orden con el pago declinado se queda
  en su estado anterior (`pending_payment`/`payment_processing`) hasta que
  se reintente con un pago nuevo o expire.
- `cancelled → paid` — `cancelled` no aparece como origen de ninguna fila
  de la tabla de arriba.
- `refunded_full → payment_processing` — `refunded_full` no aparece como
  origen de ninguna fila.
- `expired → authorized`/`paid` sin el contexto de reconciliación.
- Más de una confirmación de venta para la misma orden — no es un chequeo
  de esta tabla, es estructural (ver §3).

## Estados de la transacción de pago (`pagos.estado_transaccion`)

| De | A |
|---|---|
| `created` | `pending`, `processing`, `authorized`, `declined`, `cancelled` |
| `pending` | `processing`, `authorized`, `declined`, `cancelled`, `expired`, `unknown` |
| `processing` | `authorized`, `declined`, `cancelled`, `unknown`, `expired` |
| `unknown` | `authorized`, `declined`, `expired` |
| `authorized` | `refunded_partial`, `refunded_full` |
| `refunded_partial` | `refunded_full` |

Mismo caso especial de `expired →` solo bajo `app.transition_context =
'reconciliation'`, y hacia `authorized`/`declined`/`unknown` únicamente —
reconciliación nunca reabre un pago expirado directo a `refunded_*`.

## Cómo se confirma una venta (§3 del encargo original)

`fn_confirmar_venta(p_orden_id, p_pago_id)` es el ÚNICO lugar del sistema
que:
1. Verifica que exista un pago con `estado_transaccion = 'authorized'`
   para esa orden (nunca confía en que "algo" diga que ya se pagó).
2. Inserta en `venta_confirmaciones` con
   `INSERT ... ON CONFLICT (orden_id) DO NOTHING RETURNING orden_id`.
   `orden_id` es `PRIMARY KEY` de esa tabla — es una garantía **estructural**
   de Postgres, no solo una condición de aplicación: si dos llamadas
   concurrentes (dos webhooks duplicados, un webhook y una reconciliación al
   mismo tiempo) intentan confirmar la misma orden, la segunda simplemente
   no inserta nada y la función detecta "ya confirmada, no repetir efectos".
3. Solo si el `INSERT` realmente insertó una fila nueva, actualiza
   `ordenes.estado_pago_orden = 'paid'` y `ordenes.pagado = true` — lo que
   dispara los triggers legado de inventario/cocina/mancuernas exactamente
   una vez.

Quién la llama: `fn_cobrar_orden()` (ruta normal — cajero cobra, o el
webhook de Clip confirma) y `fn_reconciliar_pagos()` (ruta de recuperación,
cuando el pago quedó `authorized` pero por alguna falla nunca se llegó a
llamar `fn_confirmar_venta`).

## Diagrama del flujo completo

```
Kiosko crea orden ──► pending_payment / awaiting_counter_payment
        │
        ├─ modo pagar_en_caja ──► awaiting_counter_payment (sin pago, sin efectos)
        │        │
        │        └─ Cajero cobra en POS ──► fn_cobrar_orden ──► pago 'authorized'
        │                                          │
        ├─ modo clip ──► ClipPaymentProvider.createPayment                 │
        │        │                                                        │
        │        ├─ ok:false (sin credenciales) ──► "Pago no disponible" ──┤ (ofrece pagar en caja)
        │        │                                                        │
        │        └─ ok:true ──► pago 'pending'/'processing' ──► webhook ──┤
        │                              │                                  │
        │                       timeout/red caída ──► payment_unknown ────┤ (reconciliación)
        │                                                                 ▼
        └─ modo demo (no-prod) ──► MockPaymentProvider ──► fn_confirmar_venta
                                                                          │
                                                                          ▼
                                                          estado_pago_orden = 'paid'
                                                          pagado = true (espejo legado)
                                                          venta_confirmaciones (1 fila, PK)
                                                                          │
                                                    ┌─────────────────────┼─────────────────────┐
                                                    ▼                     ▼                     ▼
                                        fn_descontar_inventario   fn_crear_pedidos_cocina   fn_acumular_mancuernas
                                        (nunca si es_demo)        (nunca si es_demo)        (nunca si es_demo)
```

## Ver también

- `docs/flujo-pagos.md` — qué ve el usuario en cada paso.
- `docs/modo-pagar-en-caja.md` — detalle del modo sin proveedor externo.
- `docs/reconciliacion-pagos.md` — cómo se recuperan los estados `unknown`/`expired`.
- `docs/integracion-clip.md` — el proveedor real, cuando haya credenciales.
