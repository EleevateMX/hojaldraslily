# Modo "pagar en caja"

El modo por defecto y más seguro del kiosko — no depende de ningún
proveedor externo, y es el que se sembró automáticamente para todas las
sucursales existentes al aplicar `pagos_maquina_estados_p1_esquema.sql`
(`configuracion_kiosko.modo_pago = 'pagar_en_caja'`).

## Qué pasa cuando el cliente elige "Pagar en caja"

1. El kiosko llama `fn_crear_orden_kiosko_caja(sucursal_id, almacen_id,
   items, cliente_id?, descuento?)`.
2. La orden nace **directo** en `estado_pago_orden = 'awaiting_counter_payment'`,
   con un `codigo_corto` generado por `fn_generar_codigo_corto()` (código
   corto tipo "A7K2", pensado para decírselo al cajero sin QR si hace
   falta).
3. **Nada más ocurre.** No se registra ningún pago, no se descuenta
   inventario, no se otorgan mancuernas, no se genera ninguna comanda, no
   se manda nada a Cocina/Barra. Los triggers que hacen todo eso solo
   disparan cuando `ordenes.pagado` pasa a `true`, y eso no sucede aquí.
4. El kiosko navega a `/pagar-en-caja` (`apps/kiosko/src/pages/PagarEnCaja.tsx`),
   que muestra folio + código corto + QR + "Pasa a caja a pagar", y se
   suscribe por Realtime a esa orden — si el cajero la cobra mientras el
   cliente sigue ahí parado, la pantalla cambia sola a "¡Ya se cobró!".
   Si nadie la cobra en 45s, vuelve sola al catálogo (no dejar a alguien
   plantado frente al kiosko sin instrucciones).

## Cómo la localiza y cobra el cajero

`apps/pos/src/pages/PedidosPendientes.tsx` (ruta `/pendientes` en POS,
botón "Pedidos de kiosko" desde Caja):

1. Lista todas las órdenes en `awaiting_counter_payment` (con búsqueda por
   folio o código corto) vía `listarOrdenesPendientesCajaConItems`, con
   Realtime para que aparezcan nuevas sin refrescar.
2. El cajero la selecciona, elige método de pago, confirma.
3. Llama `cobrarOrden(sb, ordenId, metodo, total, { autorizadoPor:
   empleado.id, idempotencyKey })` — la MISMA función que usa el resto del
   sistema, no una ruta especial. Dentro:
   - Valida que `estado_pago_orden` siga siendo cobrable (rechaza si ya
     está `paid`, `cancelled` o `expired`).
   - Registra el pago con `estado_transaccion = 'authorized'`.
   - Llama `fn_confirmar_venta()`, que aplica los efectos reales UNA vez
     (ver `docs/maquina-estados.md` §3).
4. Ahí, y solo ahí, se disparan: descuento de inventario, generación de
   pedidos de cocina/barra, encolado de comandas, acumulación de
   mancuernas.

## Por qué cobrar dos veces la misma orden es imposible

Tres capas independientes, no una sola:

1. **`fn_cobrar_orden` valida el estado antes de hacer nada** — si la
   orden ya está `paid`, la rechaza (no crea un segundo pago).
2. **`venta_confirmaciones.orden_id` es `PRIMARY KEY`** — aunque dos
   llamadas lograran pasar el paso 1 al mismo tiempo (condición de
   carrera), solo una puede insertar esa fila; la otra hace `ON CONFLICT
   DO NOTHING` y no vuelve a aplicar ningún efecto.
3. **`idempotencyKey`** — un doble clic del cajero con la misma clave
   reutiliza el resultado del primer intento en vez de generar uno nuevo.

Probado en vivo (rollback intencional) simulando dos cobros simultáneos del
mismo folio — ver la ronda de pruebas de concurrencia de
`docs/pruebas-seguridad.md`.

## Expiración

Ver `docs/reconciliacion-pagos.md` §"Expiración de órdenes kiosko" —
`configuracion_kiosko.expira_minutos` por sucursal, `fn_expirar_ordenes_kiosko()`
corriendo cada minuto por cron, nunca borra nada.
