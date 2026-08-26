# Prorrateo de envío en entradas de compra (costosshake)

Cómo funciona el reparto del costo de envío entre los productos de una
entrada de mercancía, y por qué este dominio (a diferencia del resto de
costosshake) vive en tablas relacionales reales en vez del documento JSON.
Contexto completo del porqué en `docs/auditoria-costeo-empaques.md` §6 y
§11 — este documento es el manual de cómo se usa y cómo está probado.

## Por qué tablas reales y no el JSON de siempre

`apps/costos/index.html` guarda casi todo en un solo documento JSON
(`app_data.data`) que se sobrescribe completo cada 500ms — sin
transacciones, sin bloqueo entre ediciones simultáneas, sin historial
inmutable. Eso es aceptable para un catálogo que un solo encargado edita a
la vez, pero **no** para una operación financiera que necesita:

1. **Garantía atómica**: o se registra completa la entrada (líneas +
   stock + costo del insumo + ledger), o no se registra nada — nunca a
   medias.
2. **Historial que no se pueda perder ni recalcular distinto** cada vez
   que alguien vuelve a guardar el catálogo.
3. **Seguridad ante dos personas dando entrada al mismo insumo a la vez**
   (dos cajas de mercancía llegando el mismo día, capturadas por
   separado).

Por eso las entradas de compra viven en `entradas_compra`/`entrada_lineas`
(tablas nuevas, aditivas), con el mismo patrón de seguridad que
`pagos`/`impresoras`/`empleados`: sin acceso directo de tabla para
`anon`/`authenticated`, todo pasa por funciones `SECURITY DEFINER`.

## Fórmula de prorrateo — por valor de la mercancía

Es el método estándar de prorrateo de flete en compras: el envío se
reparte proporcional a cuánto vale cada línea, no por cantidad de piezas
ni por peso (que costosshake no captura de forma confiable hoy).

```
subtotal_línea        = cantidad × costo_unitario_capturado
envío_línea            = costo_envío × (subtotal_línea / Σ subtotal)
costo_unitario_final   = costo_unitario_capturado + envío_línea / cantidad
```

**Caso especial — Σ subtotal = 0** (por ejemplo, todas las líneas son
muestras gratis o llegaron sin costo de factura): el envío se reparte en
partes iguales entre las líneas, porque no hay ningún valor con el cual
ponderar.

**Redondeo**: cada línea se redondea a centavos, excepto la **última**
(en el orden en que se capturaron), que recibe el residuo exacto
(`costo_envío − suma de las anteriores ya redondeadas`) — así la suma de
`envío_línea` es siempre exactamente igual a `costo_envío`, nunca queda un
centavo de más o de menos por errores de redondeo acumulado. Probado en
vivo con 3 líneas y Σ subtotal = 0 (10.00 repartido en 3.33 + 3.33 + 3.34).

## Vista previa obligatoria

La pantalla "Entradas" en costosshake tiene tres pasos:

1. **Captura**: los productos, cantidades, costo unitario de factura,
   presentación, caducidad y el nuevo campo **Costo de envío (total
   factura)**.
2. **Vista previa** (`fn_entrada_previsualizar`, no escribe nada): tabla
   con Producto, Cantidad, Costo unitario, Envío prorrateado, Costo
   unitario final, Importe — exactamente lo que se va a guardar. No se
   puede confirmar sin pasar por aquí.
3. **Confirmar** (`fn_entrada_confirmar`, pide la clave de compras): la
   vista previa se recalcula server-side con los mismos números que
   mandó el cliente (cantidad, costo unitario, costo de envío) — **nunca
   se confía en un envío-ya-prorrateado que mande el navegador**, así que
   no hay forma de manipular el resultado interceptando la llamada.

## Qué se actualiza al confirmar (todo en una función = atómico)

- `entrada_lineas`: registro histórico inmutable de esa compra —
  cantidad, costo capturado, envío prorrateado, costo final, y una
  fotografía de `costo_compra`/`contenido` del insumo **antes** de esta
  entrada (para poder revertir con `fn_entrada_cancelar`).
- `inventario_movimientos`: un movimiento tipo `compra` por línea, con el
  costo final y `referencia_id` apuntando a la entrada.
- `inventario_stock`: se suma la cantidad recibida (upsert atómico,
  probado con dos confirmaciones concurrentes reales sobre el mismo
  insumo — ver más abajo).
- `lotes`: una fila nueva por línea con `cantidad_inicial = cantidad_actual
  = cantidad` y el costo final de esa compra — **no se calcula un costo
  promedio ponderado todavía**, solo se deja la estructura lista para
  cuando se quiera construir esa lógica más adelante (tal como se pidió:
  "utilizar inicialmente el último costo real unitario").
- `insumos.costo_compra` (y `contenido`/`presentacion`/`proveedor`/
  `ultima_compra` si vienen capturados): el costo final de esta compra
  pasa a ser el costo vigente del insumo. `insumos.costo_unitario` es una
  columna **generada** (`costo_compra / contenido`), así que las recetas
  (`vw_costeo_producto`) reciben el costo actualizado automáticamente, sin
  ningún paso adicional.
- El documento JSON de costosshake también se actualiza (mismo
  stock/costo/kardex de siempre), con el costo **final** en vez del
  precio de factura solo — para que Inventario/Kardex/Compras sigan
  mostrando lo mismo que el esquema real.

## Cancelar una entrada

`fn_entrada_cancelar(entrada_id, clave)` — **nunca borra nada**: marca la
entrada como `cancelada`, registra un movimiento de ajuste que revierte el
stock, pone la cantidad del lote creado en 0, y restaura
`insumos.costo_compra`/`contenido` a lo que tenían **antes** de esa
entrada — pero solo si nadie ha comprado ese mismo insumo después (si ya
hay una entrada más nueva, se conserva el costo más reciente y solo se
revierte el stock/ledger de la que se cancela, para no pisar información
más actual con una corrección vieja).

El botón "📋 Historial de entradas" (pestaña Compras) lista las entradas
recientes con su estado, y cada entrada `confirmada` tiene un botón
**Cancelar** que pide confirmación y clave y llama a
`fn_entrada_cancelar`. **Importante**: cancelar revierte el stock/costo
en el **esquema real** (tablas), pero **no** revierte el documento JSON
de costosshake (lo que ven Inventario/Kardex/Compras) — hacerlo de forma
segura requeriría poder identificar exactamente qué líneas del JSON
corresponden a esa entrada, y el JSON no guarda esa referencia. Si se
cancela una entrada, hay que corregir a mano el stock/costo en Inventario
si hace falta que coincida. El modal lo advierte explícitamente.

## Qué se probó (contra producción, con datos de prueba revertidos)

- Fórmula de prorrateo, incluido el caso Σ subtotal = 0 y el ajuste de
  redondeo en la última línea.
- Rechazo de clave incorrecta — confirmado que no escribe absolutamente
  nada (ni la cabecera de la entrada) cuando la clave no coincide.
- Escritura atómica completa de una confirmación: línea, movimiento,
  lote, stock e insumo verificados campo por campo, luego revertidos con
  `rollback` (sin dejar residuo).
- **Concurrencia real**: dos llamadas a `fn_entrada_confirmar` para el
  mismo insumo despachadas en paralelo genuino (dos invocaciones en el
  mismo turno, no secuenciales) — el stock final quedó exactamente en la
  suma de ambas cantidades (5 + 7 = 12), sin pérdida de actualización.
- Cancelación: reversa correcta de stock, costo del insumo y lote,
  conservando ambos movimientos (compra + ajuste) en el ledger como
  historial.
- **Pendiente, honestamente**: prueba manual en navegador de las tres
  pantallas (captura → vista previa → confirmación) — no fue posible en
  este entorno por falta de acceso de red al sitio desplegado, igual que
  en Fase 1-2.
