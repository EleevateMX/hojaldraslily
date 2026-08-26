# Reporte de conciliación de datos legacy

## ✅ ETL aplicado (2026-07-02)

Catálogo poblado desde `app_data` (SQL idempotente, `supabase/seed/etl-app-data.sql`):
**182 insumos, 57 productos, 182 líneas de receta.** `app_data` intacto.

Pendientes de captura en la app de Costos (no bloquean vender lo activo):
- **27 productos inactivos** (sin precio de venta): 16 shakes, 4 alimentos y
  algunas reventas. Se crearon `activo=false`; asignar precio para venderlos.
- **20 productos con líneas de receta sin cantidad** (`PENDIENTE-CANTIDAD`,
  95 líneas): capturar gramajes para que el costeo/descuento sea exacto.
- **105 insumos con costo 0**: capturar costo de compra.
- **0 productos activos con costo cero** → los 30 productos vendibles ya
  costean bien.

---


Auditoría del JSON `app_data` (2026-07-01). **Nada se corrigió en
automático** — estas listas requieren decisión humana antes o después del
ETL (el ETL migra la 1ª aparición y omite el resto).

## Nombres duplicados

| Nombre | Veces | Colección | Acción sugerida |
|---|---|---|---|
| (sin nombre) | 4 | snacks | borrar o nombrar en el legacy antes del ETL |
| Gatorade | 3 | bebidas | ¿son sabores distintos? renombrar (ej. "Gatorade Lima") |
| Barra de Proteína (Kirkland) | 2 | snacks | unificar o diferenciar sabor |
| Birdman (Falcon) Chai | 2 | proteins | unificar (mismo producto capturado 2 veces) |
| Ghost Energy (Welchs Grape) | 2 | bebidas | unificar |

## Datos incompletos (conteos)

| Problema | Cantidad | Efecto |
|---|---|---|
| Líneas de receta sin cantidad | **106 / 145** (20 recetas) | costeo y descuento de inventario subestimados; quedan con nota `PENDIENTE-CANTIDAD` |
| Ingredientes shake sin costo | 25 / 42 | costo receta $0 en esas líneas |
| Ingredientes alimento sin costo | 13 / 32 | ídem |
| Recetas de shake sin precio | **16 / 16** | productos creados **inactivos** hasta asignar precio |
| Recetas de alimento sin precio | 4 / 7 | ídem |

## Positivo

- 0 insumos huérfanos: todas las líneas de receta referencian ingredientes
  que sí existen.
- Parámetros consistentes (IVA 0.16, food cost 0.30, merma 0.02) entre el
  JSON y la tabla `parametros`.

## Proceso de conciliación propuesto

1. Correr `pnpm etl:dry` — regenera estas listas con detalle por ítem en
   `supabase/seed/reportes/`.
2. Decidir duplicados (tabla de arriba).
3. `pnpm etl:aplicar`.
4. Capturar en `apps/costos`: precios de los 16 shakes, cantidades de las
   106 líneas y costos de los 38 ingredientes — la app marca en rojo el
   food cost incompleto.
