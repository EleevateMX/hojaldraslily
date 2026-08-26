# Diagnóstico del repo POS (`puntodeventa`) — Fase 5

Fecha: 2026-07-02. Código auditado desde Google Drive (subido a la rama
`legacy-import` como `puntodeventa/`). 126 archivos, integridad verificada
(sin homoglifos ni corrupción; todo el no-ASCII es dibujo de cajas, flechas
y acentos españoles legítimos).

## 1. Estructura y stack

Monorepo **Turborepo + npm workspaces** (no pnpm). Stack: **React 18 + Vite
5 + TypeScript + TailwindCSS + Zustand + react-router**. Kiosko preparado
para Electron.

```
apps/
  kiosko/           autoservicio: Catalogo, Carrito, Pago, Confirmacion, LoginLealtad, AuthCallback (+ carritoStore, sync.ts)
  pos/              caja: Cobro (494 líneas), CorteCaja (+ posStore) — pagos mixtos, wallet, gift card, promos
  admin/            Menu (525 líneas): CRUD productos/categorías
  cocina-alimentos/ PantallaComandas (575 líneas): KDS + realtime + BroadcastChannel
  cocina-bebidas/   PantallaComandas (reusa el mismo componente)
  cliente-display/  AdReel, OrderingView, PaidView
packages/
  supabase/  cliente + 8 módulos de queries + types/database.ts (31 tablas)
  ui/        Button, Card, Badge, Spinner
  brand/     assets (logo, milo)
  config/    tsconfig + eslint compartidos
supabase/
  setup.sql                          esquema single-branch (1021 líneas)
  migrations/001_initial_schema.sql
  migrations/002_multi_branch_full_schema.sql   ~21 tablas, multisucursal
```

**Calidad**: código limpio y bien organizado. **Acierto grande**: todo el
acceso a datos está centralizado en `@pos/supabase` (las apps solo importan
funciones: `crearOrden`, `getOrdenesPorCocina`, `guardarCorte`…). Es la
misma arquitectura que adoptamos → **las UIs se reutilizan tal cual**.

**Estado real**: es un **demo avanzado, no productivo**. Varias rutas usan
datos hardcodeados (`DEMO_GC` gift cards, `DEMO_ORDENES` en el KDS) y un
`isSupabaseConfigured` que cae a modo demo si no hay `.env`.

## 2. Qué se reutiliza vs qué se reescribe

| Parte | Veredicto |
|---|---|
| UIs de las 6 apps (componentes, páginas, stores, Tailwind) | **Reutilizar** — son buenas y cubren el flujo pedido |
| `packages/ui`, `packages/brand`, `packages/config` | **Reutilizar** |
| `packages/supabase` (capa de queries) | **Reescribir** contra el esquema desplegado (es el adaptador; ahí está todo el desajuste) |
| `supabase/setup.sql` y `migrations/*` del demo | **NO aplicar** — describen otro esquema; nuestra fuente de verdad es el Supabase de costos |
| Módulos de lealtad/wallet/gift/promos/delivery | **Aplazar** (Fase 2 del propio demo; fuera del objetivo actual) |

## 3. El desajuste central (por qué NO se puede solo "conectar")

El demo fue construido contra **su propio esquema** (`setup.sql` /
`migrations`), que difiere del que ya desplegamos (fuente de verdad =
Supabase de costos). Diferencias confirmadas tabla por tabla:

| Concepto | Demo espera | Desplegado (real) | Acción |
|---|---|---|---|
| Catálogo | `productos`, `categorias→cocinas` | idénticos y compatibles ✓ | `menu.ts`/`productos.ts` funcionan casi sin cambio |
| Item→cocina | `orden_items.cocina_id` (uuid) | `orden_items.cocina_slug` (text) + ruteo por `categorias.cocina_id` | repuntar KDS |
| Cobro | 1 paso: `ordenes.pagado=true` al crear + `orden_pagos` | 2 pasos: orden pendiente → `pagos.estado='aprobado'` dispara trigger (inventario+cocina) | reescribir `crearOrden`+`cobrar` |
| Descuento | `ordenes.descuento` | no existe | agregar aditivo si se requiere |
| Pagos | tabla `orden_pagos` | tabla `pagos` (Clip-ready, con estado) | mapear |
| Cortes | `cortes_caja` | `caja_cortes` (+ `vw_corte_resumen`) | mapear |
| KDS | lee `ordenes`+`orden_items` por `cocina_id` | `pedidos_cocina` + `cocina_items` por estación, con realtime | repuntar a nuestro modelo |
| Método de pago | `efectivo/tarjeta_credito/tarjeta_debito/qr/wallet` | `clip/efectivo/tarjeta/cortesia/otro` | reconciliar enum |
| Clientes | `clientes` con `puntos/wallet_saldo/nivel` | `clientes` sin esos campos | aplazar lealtad |
| Reportes | `vw_ventas_diarias`, `vw_productos_mas_vendidos` | `vw_corte_resumen`, `vw_stock_almacen`, `vw_costeo_producto` | crear vistas aditivas o repuntar |
| No existen en real | `usuarios, turnos, asistencias, bitacora, productos_sucursal, gift_cards, puntos_movimientos, wallet_movimientos, promociones, plataformas_delivery, ordenes_delivery` | — | aplazar / crear aditivo cuando toque |

## 4. Decisión de arquitectura

**Conservar las UIs del demo y reescribir SOLO `@pos/supabase` para que
apunte al esquema desplegado (el de costos).** Justificación:

1. Nuestro esquema ya implementa el modelo **correcto** que pediste: cobro
   en dos pasos donde marcar pagado **descuenta inventario por receta**,
   **genera pedidos a cocina por estación** y deja todo **listo para
   Clip** — el demo no hace nada de eso (su cobro es un flag y no toca
   inventario ni recetas).
2. Migrar el esquema del demo rompería `app_data`, la lógica de costeo v3
   ya validada y las tablas legacy. Prohibido.
3. El desajuste vive en una sola capa (`@pos/supabase`), así que el costo
   de reescritura está acotado y no toca las UIs.

En vez de mantener dos paquetes `@pos/supabase` (demo) y `@shake/supabase`
(nuestro), las apps migradas importarán de **`@shake/supabase`**, que ya
tiene `crearOrden`, `cobrarOrden`, `listarPedidosCocina`,
`suscribirPedidosCocina`, `abrirCaja`, `cerrarCaja`, `resumenCorte`. Se le
agregarán las funciones que falten (menú admin, clientes, reportes de
ventas) conforme se migre cada app.

## 5. Reconciliaciones concretas (para fase 5–7)

1. **Cobro** (`Cobro.tsx`): reemplazar el `crearOrden` de un paso por
   `crearOrden(pendiente)` + `cobrarOrden(orden, metodo, monto)`. El
   descuento de inventario y el envío a cocina los hace el trigger.
2. **Métodos de pago**: mapear los del demo a nuestro enum —
   `tarjeta_credito`/`tarjeta_debito`→`tarjeta`, `qr`→`otro`, `wallet`
   →`otro` (o aplazar wallet). **Agregar `clip`** como método visible en
   el POS. Confirmar con negocio antes de tocar el enum.
3. **KDS** (`PantallaComandas.tsx`): repuntar `getOrdenesPorCocina` +
   `suscribirseAOrdenes` a `listarPedidosCocina('alimentos'|'bebidas')` +
   `suscribirPedidosCocina` (ya existen y usan realtime habilitado).
   Alinear estados: demo `nueva/en_preparacion/lista` → nuestros
   `pendiente/en_preparacion/listo/entregado`.
4. **Corte** (`CorteCaja.tsx`): `getResumenTurno`/`guardarCorte` →
   `abrirCaja`/`cerrarCaja`/`resumenCorte` sobre `caja_cortes` +
   `vw_corte_resumen`.
5. **Lealtad/promos**: detrás de un feature-flag apagado en fase 5–7. Las
   tablas se crearán aditivas en una fase posterior si el negocio las pide.
6. **Reportes de ventas**: crear `vw_ventas_diarias` y
   `vw_productos_mas_vendidos` como vistas aditivas sobre `ventas`/`ordenes`
   (barato) y repuntar el admin.

## 6. Riesgos

- **npm vs pnpm**: el demo usa npm workspaces + Turborepo; nuestro monorepo
  usa pnpm. Al integrar las apps hay que unificar (recomendado: pnpm, ya
  configurado) y renombrar scopes `@pos/*` → `@shake/*`.
- **Enum `metodo_pago`**: agregar valores a un enum en Postgres es aditivo
  y seguro, pero quitar/renombrar no. Cualquier cambio, aditivo.
- **`orden_items.cocina_id` vs `cocina_slug`**: no reintroducir `cocina_id`;
  el ruteo por `categorias.cocina_id` ya está resuelto en el trigger.
- **Modo demo**: al conectar `.env` real, verificar que ninguna pantalla
  siga leyendo `DEMO_*` hardcodeado.
