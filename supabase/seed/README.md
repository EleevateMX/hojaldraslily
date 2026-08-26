# ETL: app_data (JSON legacy) → tablas relacionales

Migra los datos reales de costos que hoy viven en `app_data.data`
(proteínas, ingredientes, bebidas, snacks, empaque, recetas) a las tablas
`insumos`, `productos` y `recetas`. **Nunca borra ni modifica `app_data`.**

## Uso

```bash
# 1. Variables (raíz del repo): SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
cp .env.example .env   # y llena la service key

# 2. Simulación — no escribe nada, genera reporte en ./reportes/
pnpm etl:dry

# 3. Revisar reportes/conciliacion.md (duplicados y datos incompletos)

# 4. Aplicar de verdad (idempotente: re-ejecutar no duplica)
pnpm etl:aplicar
```

## Sincronización continua (`sync-app-data.sql`)

Mientras el cliente siga capturando costos/inventario en el tablero legacy
costosshake (JSON `app_data`), esos cambios **no llegan solos** a las tablas
relacionales que usan POS/kiosko/cocina. Para reflejarlos, correr
`supabase/seed/sync-app-data.sql` (UPSERT idempotente: inserta nuevos y
**actualiza existentes** — costos, precios, marca, código de barras — y
reconstruye recetas de los productos del JSON). No borra insumos/productos
(preserva inventario y órdenes) ni toca `app_data`.

Aplicado por primera vez el 2026-07-02 tras las ediciones del cliente.

## Reglas del mapeo

| JSON legacy | Destino | Notas |
|---|---|---|
| `proteins[]` | `insumos` tipo `proteina` | nombre = `MARCA - SABOR` (formato protKey del legacy), unidad `scoop`, contenido = scoops |
| `shakeIngs[]` | `insumos` tipo `shake` | unidad/contenido/costo directos |
| `foodIngs[]` | `insumos` tipo `alimento` | |
| `empaque[]` | `insumos` tipo `empaque` | contenido 1, costo unitario directo, presentación de compra |
| `bebidas[]`, `snacks[]` | `insumos` tipo `reventa` **+** `productos` (`es_reventa`) con receta 1:1 | costo unitario = costoCaja / equivPiezas |
| `shakeRecipes[]` | `productos` (categoría Shakes) + `recetas` | + `empaques[]` de la receta como líneas (por producto, no un combo global — ver `docs/auditoria-costeo-empaques.md`); proteína fija (si la hay) con sus scoops; si viene vacía se elige al vender |
| `foodRecipes[]` | `productos` (categoría Alimentos) + `recetas` | + `empaques[]` de la receta como líneas (por producto) |

> **Corrección histórica (esta ronda):** antes, esta tabla decía que los
> empaques se migraban desde los checkboxes globales `shake:true`/
> `food:true` del catálogo de Empaque. Eso nunca fue cierto — el SQL real
> nunca leyó esos checkboxes, así que ningún shake/alimento real llegó a
> tener líneas de empaque en `recetas` por esa vía (verificado en vivo,
> `n_lineas_empaque = 0` para los 17 shakes antes de esta corrección). Los
> checkboxes globales ya no existen en costosshake — cada receta tiene su
> propio arreglo `empaques[]`, que es lo que este ETL sincroniza ahora.

## Decisiones importantes

- **Idempotencia**: se busca por (nombre, tipo) antes de insertar; si
  existe, se actualiza costo/contenido en vez de duplicar.
- **Duplicados en el JSON** (ej. "Gatorade" ×3): se migra solo la primera
  aparición y el resto se lista en el reporte para conciliación manual.
- **Cantidades vacías en recetas** (106 de 145 líneas): se insertan con
  `cantidad = 0` y nota `PENDIENTE-CANTIDAD`. El costeo de esos productos
  saldrá incompleto hasta capturar cantidades reales — el reporte los
  enumera. No se inventan cantidades.
- **Sin precio de venta** (todas las shakeRecipes): el producto se crea
  con `precio = 0` y queda inactivo hasta asignarle precio (un producto
  con precio 0 no debe venderse). Listado en el reporte.
