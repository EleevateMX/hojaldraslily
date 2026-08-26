# Entradas de empaque (relación con `docs/empaques-por-receta.md`)

Cómo se conecta el prorrateo de envío (`docs/prorrateo-envio.md`) con la
corrección del costeo de empaques (`docs/auditoria-costeo-empaques.md`,
`docs/empaques-por-receta.md`). Son dos correcciones separadas que se
complementan — este documento explica cómo encajan.

## Los dos problemas que se corrigieron son distintos

1. **Qué empaques usa cada receta** (Fase 1-2): antes, un checkbox global
   sumaba un empaque a *todos* los shakes o *todos* los alimentos, sin
   importar si ese producto lo usaba de verdad. Corregido asignando
   empaques por receta — ver `docs/empaques-por-receta.md`.
2. **Cuánto cuesta de verdad cada empaque, comprado** (Fase 3): antes, el
   costo de un empaque en el catálogo era solo lo que alguien tecleaba a
   mano en "Costo unit.", sin envío ni ningún otro cargo de la compra.
   Corregido con el prorrateo de envío al dar entrada — ver
   `docs/prorrateo-envio.md`.

Los empaques (vasos, tapas, popotes, bolsas, servilletas) suelen comprarse
en la misma factura que otra mercancía, y el flete de esa factura
normalmente no viene desglosado por artículo — por eso el prorrateo por
valor le pega directo a la corrección del costeo de empaques: un empaque
barato en una factura con mercancía cara se lleva poco envío; una compra
grande de empaques (por ejemplo, 5,000 vasos) que domina el valor de la
factura se lleva la mayor parte del envío.

## Flujo completo, de punta a punta

1. En **Costeo Shakes/Alimentos**, cada receta tiene asignados sus
   empaques reales (sección "Empaques" de la tarjeta) — esto define
   **qué** empaques usa cada producto y en qué cantidad.
2. En **Compras → Dar entrada**, cuando llega mercancía (incluidos
   empaques), se captura la cantidad recibida, el costo de factura por
   pieza, y el costo de envío total de esa factura. La vista previa
   reparte el envío y muestra el costo final por empaque.
3. Al confirmar, `insumos.costo_compra` del empaque queda actualizado con
   ese costo final (factura + envío prorrateado) — es una columna
   generada la que convierte esto en costo por pieza
   (`insumos.costo_unitario`).
4. `vw_costeo_producto` (la vista real que usan Admin/POS) ya suma
   `costo_empaque` desde las líneas de `recetas` con `tipo='empaque'`
   multiplicadas por `insumos.costo_unitario` — así que el costo de
   empaque de cada shake/alimento queda correcto en dos pasos
   independientes: **qué** empaques lleva (paso 1) y **cuánto** cuesta
   cada uno de verdad (pasos 2-3), sin que ninguno de los dos dependa de
   checkboxes globales ni de un número tecleado a mano sin respaldo de
   compra.

## Qué NO cambia con esto

- Asignar empaques a una receta (paso 1) no requiere haber dado ninguna
  entrada todavía — se puede capturar la relación producto↔empaque antes
  de que llegue la primera compra registrada con el nuevo flujo; el costo
  usado mientras tanto es el que ya tenga el catálogo de Empaque
  (`insumos.costo_compra` actual, que puede venir del ETL o de una
  captura manual anterior).
- Dar una entrada de un empaque (pasos 2-3) no crea ni modifica ninguna
  línea de receta — solo actualiza el costo del insumo. La relación
  producto↔empaque se sigue editando exclusivamente desde Costeo
  Shakes/Alimentos.
