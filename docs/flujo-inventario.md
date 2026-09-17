# Flujo inventario

Dos almacenes: **Bodega** (donde vive la materia prima; es el que se cuenta) y
**Kiosko** (la barra). Casi todo pasa en Bodega — por eso es el destino por
omisión de todas las funciones.

## Lo que hay dentro

**99 insumos** de la hoja del negocio, en seis grupos:

| Grupo | Qué trae |
|---|---|
| Materia prima | Harina, manteca, quesos, jamón, latas, granillos… |
| Limpieza | Cloro, detergente, cofias, cubrebocas, fibras |
| Bolsas | Naturales y camiseta, por kilo |
| Etiquetas | Una por sabor (van con prefijo `Etiqueta ` para no chocar con la materia prima: «Nutella» y «Anís» son las dos cosas) |
| Cajas | De 6, 12, 24 y 48, con y sin ventana |
| Domos y empaques | Domos de rosca, trenza, pan de muerto |

## Se cuenta en la presentación, no en gramos

`insumos.unidad` es la unidad **en que se cuenta** (saco, cubeta, cartón,
kilo, pieza) y `presentacion` es el texto de la hoja («Saco 25 kg», «Cartón 30
pzas»). `contenido` guarda cuánto trae cada una, que es lo que hace falta para
bajar a gramos al costear.

Quien cuenta el almacén cuenta sacos. Un sistema que le pide gramos es un
sistema que nadie va a llenar.

## Las operaciones

| Operación | Función | Movimiento |
|---|---|---|
| Ver el inventario | `fn_inventario_resumen(almacen)` | — |
| **Contar** | `fn_inventario_contar(lineas, almacen)` | `ajuste` (solo la diferencia) |
| Llegó mercancía | `fn_inventario_entrada(lineas, 'compra', almacen)` | `compra` |
| Traer de bodega | `fn_inventario_entrada(lineas, 'bodega', destino)` | `traspaso` −origen / +destino |
| Se tiró algo | `fn_inventario_merma(insumo, cantidad, motivo)` | `merma` |
| Poner el mínimo | `fn_inventario_minimo(insumo, minimo)` | — |
| Qué hay que comprar | `fn_inventario_lista_de_compra(almacen)` | — |
| Auditar | `fn_inventario_huecos(dias)` — solo gerencia | — |
| Venta | automática (trigger al pagar la orden) | `venta` |

Todas son `security definer` y revisan por dentro quién las llama
(`fn_es_staff`, `fn_es_jefe`): el GRANT abre la puerta, la función pide la
credencial.

En TypeScript: `resumenDeInventario`, `contarInventario`, `recibirMercancia`,
`registrarMerma`, `fijarMinimo`, `listaDeCompra` (`@shake/supabase`).

## El conteo se manda como «lo que hay», no como la diferencia

Quien cuenta ve ocho sacos y escribe **8**. El servidor sabe que creía que
había 10, calcula el −2 y lo apunta como movimiento `ajuste` con su nota.

Pedirle a alguien que teclee «−2» es pedirle que haga la resta dos veces y se
equivoque una. Y el ajuste queda **apuntado**, no aplicado en silencio: el
conteo es un hecho del almacén, no una corrección del número.

`inventario_stock.contado_at` se mueve **aunque no haya diferencia**. Contar y
encontrar que estaba bien también es información — es lo que hace creíble al
inventario. Un número sin fecha no se puede creer.

## Reglas

- `inventario_movimientos` es el kardex: **nunca se edita ni se borra**. Los
  errores se corrigen con otro movimiento.
- El stock puede quedar **negativo** (una venta antes de capturar la entrada):
  se permite a propósito para no bloquear la caja. Sale en el resumen como
  «se acabó» y se arregla contando.
- Sin renglón en `inventario_stock`, un insumo es **invisible** en las
  pantallas de almacén aunque exista en el catálogo. Al dar de alta insumos
  hay que crearle su existencia en cero.
- La merma **con motivo** o nada: sin el motivo, lo que se tiró reaparece en
  el siguiente conteo como un faltante sin explicación, y un faltante que
  nadie puede explicar es lo que hace que se deje de creer en el inventario.

## Pendiente

- **Costos y recetas.** La hoja del negocio no traía cuánto cuesta cada
  insumo ni qué lleva cada pan. Sin recetas, la venta **no descuenta** materia
  prima: hay que contar. `fn_inventario_huecos` cuenta exactamente cuántas
  piezas se vendieron sin descontar nada.
- **Mínimos.** Todos arrancan en cero, y la lista de compra sale de comparar
  contra el mínimo: mientras nadie los ponga, la lista sale vacía.
- `registrarMovimiento` y `transferir` (los viejos, del motor original) hacen
  read-modify-write desde el navegador: si dos dispositivos capturan a la vez
  puede perderse un delta. Lo nuevo no tiene ese problema — suma en el
  servidor con `on conflict do update`. Conviene migrar `transferir` (lo único
  que todavía escribe la tabla `transferencias` con su firma).
