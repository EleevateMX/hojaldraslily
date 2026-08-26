# Diagnóstico técnico — Fase 1

Fecha: 2026-07-01

## Alcance de la auditoría

El diagnóstico se hizo sobre **la base de datos Supabase real** (proyecto
"Hojaldras Lily", ) más el código legacy de costos.

✅ **Código de costos auditado**: subido a la rama `legacy-import` como
`costosshake-main/` (README + `index.html` de 1,221 líneas; `index_2.html`
es copia idéntica). Es una SPA monolítica vanilla JS que guarda todo el
estado como JSON en `app_data`. Hallazgos que corrigieron el diseño:

1. **La merma legacy NO aplica al empaque**: `total = ins×(1+merma) +
   empaque + mano` (`finishCalc`, línea 424). La vista se corrigió a v3.
2. **Mano de obra global** (`params.mano`), no por producto → la vista v3
   usa la del producto si > 0 y si no la global.
3. **Empaque "combo"**: los empaques con flag `shake`/`food` se suman a
   todos los shakes/alimentos (no van en `ings`). El ETL los inyecta como
   líneas de receta.
4. **Proteínas identificadas como `MARCA - SABOR`** (`protKey`) y costo
   por scoop = costo/scoops → coincide con `insumos.costo_unitario`.
5. La merma por producto acepta `8` (=8 %) o `0.08` → el ETL normaliza.
6. `precio_sugerido` legacy = `(total/foodCost)×(1+IVA)` redondeado a
   múltiplos de $5 (`round5`) → idéntico a la vista.

⚠️ **Pendiente**: el repo `puntodeventa` aún no se ha podido subir (límites
del uploader web de GitHub); el diagnóstico de sus 6 apps sigue basado en
la descripción funcional.

## Estado real encontrado en Supabase

### Legacy (repo costosshake)

- `app_data` (1 fila, ~12 KB de JSON): **aquí viven los datos reales** —
  `params` (IVA 16%, food cost 30%, merma 2%), 69 proteínas, 42
  ingredientes de shake, 32 de alimentos, 26 bebidas, 16 snacks, 7
  empaques, 16 recetas de shake, 7 de alimentos.
- `app_users` (2 filas): login propio con hash, RLS abierta a `anon`.
- Realtime habilitado solo para `app_data`.

### Núcleo relacional (migración `core_unificado`, 2026-07-01)

Ya existía un esquema relacional bien diseñado pero **con todas las tablas
de catálogo vacías** (los datos siguen en el JSON): `sucursales` (1:
Shakeaholic Mérida), `almacenes` (Bodega + Kiosko ✔), `cocinas`
(alimentos + bebidas ✔), `categorias`, `productos`, `insumos` (con
`costo_unitario` como columna generada), `recetas`, `inventario_stock`,
`inventario_movimientos`, `lotes`, `transferencias`, `mermas`, `ordenes`,
`orden_items`, `ventas`, `parametros`, vista `vw_costeo_producto` v1 y
trigger `trg_descontar_inventario` (orden pagada → descuenta stock).

### Problemas detectados (antes de la migración de hoy)

1. **RLS rota para operar**: `insumos`, `recetas`, `parametros`,
   `inventario_*`, `ventas` tenían RLS activa **sin policies** → ilegibles
   e inescribibles con anon key. Peor: el trigger de inventario corría con
   permisos del invocador, así que **marcar una orden como pagada fallaría
   en producción** (el insert a `ventas`/`inventario_movimientos` violaba
   RLS). Corregido con `security definer` + policies.
2. **Faltaban entidades operativas**: empleados, roles, cajas, cortes,
   pagos, pedidos de cocina, clientes, categorías de insumos.
3. **`ordenes.pagado` era el único registro de pago** (sin tabla `pagos`,
   sin referencia Clip estructurada, solo `clip_recibo` texto).
4. **Cocina por `orden_items.cocina_slug`** (texto suelto) sin estados por
   estación ni realtime habilitado en `ordenes`.
5. **Seguridad**: `app_users` (hashes) legible por `anon`; `app_data`
   escribible por `anon`; claves de traspaso/compras en texto ("1234").
   No se cambió (el legacy depende de ello) — va en fase 9. Ver
   `pendientes.md`.

### Calidad de datos del JSON (ver reporte-conciliacion.md)

- 5 nombres duplicados (Gatorade ×3, etc.) + 4 snacks sin nombre.
- **106 de 145 líneas de receta sin cantidad** (20 recetas afectadas).
- 38 ingredientes sin costo; **las 16 recetas de shake sin precio de venta**.
- 0 insumos huérfanos: toda receta referencia ingredientes existentes ✔.

## Stack y reutilización

| Parte | Veredicto |
|---|---|
| Esquema relacional `core_unificado` | **Reutilizar** — bien normalizado; se extendió aditivamente |
| Datos del JSON legacy | **Migrar** vía ETL (supabase/seed) con reporte de conciliación |
| App costos (index.html monolítico) | **Reescribir** como app Vite+React+TS (`apps/costos`) — la lógica de costeo se preservó en `vw_costeo_producto` y `@shake/utils` |
| Apps del demo POS | **Migrar por partes** (fases 5–6): la UI puede reutilizarse; el acceso a datos se reemplaza por `@shake/supabase` |
| Login `app_users` | Mantener temporalmente; reemplazar por Supabase Auth + PIN de empleados en fase 9 |

## Riesgos técnicos

1. **Doble fuente de verdad durante la transición** (JSON vs tablas): el
   legacy sigue escribiendo `app_data`. Mitigación: ventana de corte —
   correr el ETL, congelar edición en el legacy y editar solo en
   `apps/costos`.
2. **RLS abierta con anon key**: cualquiera con la anon key puede escribir
   catálogo. Aceptado temporalmente (postura ya existente); hardening en
   fase 9 con Supabase Auth y policies por rol.
3. **Inventario en unidades de receta**: el stock se descuenta en la
   unidad del insumo (g/ml/scoop/pza). Las compras deben capturarse en esa
   misma unidad o convertirse al registrarlas.
4. **Recetas sin cantidades**: hasta capturarlas, el descuento de
   inventario y el food cost de esos productos estará subestimado. El ETL
   los marca `PENDIENTE-CANTIDAD`.
5. **Clip sin API pública confirmada**: el diseño no depende de ella (ver
   `integracion-clip.md`); la ruta manual funciona desde el día 1.
