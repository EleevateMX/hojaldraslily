# Combos (Fase 4)

Cómo funcionan los combos, por qué se diseñaron así, y su relación con
"Promociones" (que ya existía de una ronda anterior y es algo distinto).
Migración: `supabase/migrations/costeo_combos_productos.sql`.

## Combos vs. Promociones — no son lo mismo

- **Promociones** (`promociones`/`promocion_aplicaciones`, ya en
  producción desde antes de esta ronda): descuentos/cupones ligados a un
  cliente (lealtad) — % de descuento, monto fijo o producto gratis,
  aplicados sobre una compra ya armada.
- **Combos** (esta ronda): un producto nuevo que agrupa varios productos
  ya existentes con un precio propio — se selecciona en POS/Kiosko como
  una sola línea, no depende de identificar a un cliente.

Se pueden combinar (aplicar una promoción sobre una orden que incluye un
combo) sin ningún cambio adicional, porque un combo es un `producto`
normal para todo lo demás del sistema.

## Diseño: un combo ES un producto

Un combo es una fila de `productos` con `es_combo = true` (mismo patrón
que ya usa `es_reventa` para bebidas/snacks de reventa), compuesta de N
productos ya existentes vía la tabla nueva `combo_items` (`combo_id`,
`producto_id`, `cantidad`).

**Por qué esta forma y no una entidad separada:** así el combo se vende,
descuenta inventario, se cuesta y se imprime **exactamente igual** que
cualquier otro producto — cero cambios en `fn_crear_orden`,
`fn_cobrar_orden`, `fn_descontar_inventario_por_orden` ni en el ledger de
`inventario_movimientos`. Se investigó el código real de estas funciones
antes de diseñar esto (no se asumió): `fn_descontar_inventario_por_orden`
decrementa inventario uniendo `orden_items.producto_id` directo contra
`recetas`, sin ningún caso especial por tipo de producto — el mismo
mecanismo que ya usan los productos de reventa (que también reciben una
línea de receta generada automáticamente).

## La receta del combo se materializa sola

Al agregar/quitar/cambiar un componente en `combo_items`, un trigger
(`fn_combo_recalcular`) borra y vuelve a insertar las líneas de `recetas`
del combo, sumando las recetas de sus componentes multiplicadas por la
cantidad de cada uno. Así `vw_costeo_producto` (costo, margen, food
cost%, precio sugerido) funciona para combos sin ningún cambio.

**Nunca hereda un costo incorrecto** (la preocupación explícita del
encargo original): un segundo trigger (`trg_recetas_actualiza_combos`)
recalcula automáticamente todos los combos que usan un producto en
cuanto cambia la receta de ESE producto — por ejemplo, cuando
costosshake vuelve a sincronizar después de corregir un costo. No hace
falta ningún paso manual para mantenerlo al día.

## Disponibilidad en tiempo real

Si un producto componente se desactiva (`productos.activo = false`,
por ejemplo porque se agotó o se dio de baja), cualquier combo que lo use
se desactiva automáticamente — deja de aparecer en POS/Kiosko, que ya
filtran su catálogo por `activo = true`. Es de un solo sentido: **nunca
reactiva un combo solo** cuando el componente vuelve a activarse — eso
requiere que alguien lo revise en Admin → Combos y lo reactive a
propósito (evita que un combo se reactive solo sin que nadie lo haya
revisado).

La pantalla Admin → Combos muestra un aviso "⚠ tiene un componente
inactivo" en cualquier combo cuyos componentes no estén todos activos —
incluso en el momento de crearlo (si se arma con un componente que ya
estaba inactivo, el trigger reactivo no aplica porque no hubo ninguna
transición, así que el aviso visual es lo que avisa en ese caso).

## Limitación v1, decidida a propósito: una sola estación por combo

Un combo solo puede combinar productos de la **misma estación/cocina**
(todos Alimentos o todos Bebidas) — se valida al agregar un componente
y se rechaza si no coincide con los demás o con la categoría del combo.

**Por qué:** el ruteo a cocina (`fn_crear_pedidos_cocina`) y la
generación de comandas (`fn_encolar_comanda_para_pedido`) están hechos
para que **un `orden_item` vaya a una sola estación**, determinada por la
categoría del producto — se investigó el código real antes de decidir
esto, no se asumió. Un combo cruzado (ej. shake + snack) necesitaría que
esas dos funciones se extendieran para repartir un mismo `orden_item`
entre dos pantallas de cocina y dos comandas — eso significa tocar el
subsistema de impresión/KDS que se endureció y probó a fondo en rondas
anteriores (P1-P8 de la ronda de seguridad). Se decidió no tocar ese
subsistema en esta ronda y en cambio **validar y rechazar** combos que
mezclen estaciones, en vez de simular un soporte que no funcionaría bien
en cocina real (el shake nunca le llegaría a Barra si el combo completo
se le asigna a Cocina, o viceversa). Queda como trabajo futuro si se
necesitan combos cruzados de verdad.

No hay combos anidados (un combo no puede incluir otro combo) en esta
versión.

## Permisos

`combo_items` usa el mismo modelo de acceso directo abierto que
`productos`/`recetas` (deuda A3 ya conocida y documentada en
`docs/pruebas-seguridad.md` §4 — no se introduce una exposición nueva,
se mantiene consistencia con las tablas vecinas de este mismo dominio).
La corrección (recálculo de receta, validación de estación, apagado en
cascada) corre en triggers `SECURITY DEFINER` que se ejecutan sin
importar quién haga la escritura, así que la integridad no depende de
que el cliente use un flujo particular.

## Qué se probó (contra producción, con datos de prueba revertidos)

- Materialización correcta de la receta de un combo (suma de recetas de
  2 shakes reales, verificada línea por línea).
- Rechazo de auto-referencia, de combo anidado y de mezcla de estación.
- Recálculo en cascada: cambiar la receta de un componente (ya guardado
  como combo) actualiza la receta del combo automáticamente.
- Desactivación en cascada: desactivar un componente apaga el combo;
  reactivar el componente **no** reactiva el combo solo (verificado
  ambos sentidos con aserciones que fallan si el comportamiento no es
  exactamente ese).
- `vw_combos` funcionando correctamente como el rol `anon` después de
  corregir dos hallazgos de `get_advisors`: la vista se creaba con
  semántica `SECURITY DEFINER` de Postgres (se corrigió con
  `security_invoker = true`, también aplicado a `vw_costeo_producto`), y
  las funciones internas de trigger tenían `EXECUTE` público de más (se
  revocó — nadie debe llamarlas directo, solo el motor de triggers).
- `pnpm audit:production` (lint + typecheck + tests + build) en verde,
  incluida la pantalla nueva Admin → Combos.
- **Pendiente, honestamente**: prueba manual en navegador de la pantalla
  Admin → Combos y de que un combo se vende/imprime/descuenta inventario
  correctamente desde POS/Kiosko en vivo — no se pudo hacer en este
  entorno por falta de acceso de red al sitio desplegado, mismo motivo
  que en las fases anteriores de esta misma ronda.
