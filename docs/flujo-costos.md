# Flujo costos

`apps/costos` reemplaza al index.html legacy leyendo/escribiendo **las
mismas tablas que usa el POS**.

## Operación

1. **Insumos**: alta/edición en `insumos`. `costo_unitario` es columna
   generada (`costo_compra / contenido`) — nunca se captura a mano.
2. **Productos**: alta con categoría, precio e IVA incluido sí/no.
3. **Receta**: líneas insumo + cantidad (en la unidad del insumo). El
   editor muestra el costo en vivo (`@shake/utils` espeja la vista).
4. **Costeo**: `vw_costeo_producto` (v3, fórmula validada contra el
   `finishCalc` del tablero legacy) calcula por producto:
   - `costo_receta` (insumos sin empaque) y `costo_empaque`
   - `costo_con_merma` = costo_receta × (1 + merma) — merma del producto
     o default global; **la merma NO aplica al empaque** (igual que legacy)
   - `costo_total` = costo_con_merma + costo_empaque + mano_obra
     (mano de obra del producto si > 0, si no la global de parámetros)
   - `precio_sin_iva` / `precio_con_iva`
   - `food_cost_pct` = costo_total / precio_sin_iva (rojo si > meta)
   - `margen` (utilidad $) y `margen_pct`
   - `precio_sugerido` = costo_total / food_cost_meta × (1+IVA),
     redondeado a múltiplos de $5
5. **Recalculo en cascada**: al cambiar `costo_compra` de un insumo, la
   vista refleja el nuevo costeo de todos los productos que lo usan.
   Sin jobs, sin duplicación.

## Parámetros globales

`parametros` (id 'default'): `iva`, `food_cost_meta`, `merma_default`,
`mano_obra`. Editables en la pestaña Parámetros.

## Compatibilidad con la lógica legacy

Fórmulas portadas 1:1 del tablero original: IVA, food cost objetivo,
merma, mano de obra, empaque (via insumos tipo `empaque` en receta),
precio sugerido, precio final, margen y utilidad. Verificar contra 2–3
productos conocidos después del ETL (checklist en pendientes.md).
