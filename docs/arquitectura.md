# Arquitectura

## Principio rector

**Supabase es la única fuente de verdad y el único backend.** Toda regla
que deba ser atómica y a prueba de frontends caídos (descontar inventario,
generar pedidos de cocina, marcar pagado) vive en la base como trigger
`security definer`. Los frontends son clientes delgados que consumen
`@shake/supabase`.

## Monorepo

Este repo (`ventashake`) **es** el ecosistema `shake-pos-ecosistema`
(nombre del package raíz). Se colocó en la raíz del repo y no en una
subcarpeta porque el repo estaba vacío y dedicado: anidar
`ventashake/shake-pos-ecosistema/...` solo agregaría un nivel muerto y
complica pnpm workspaces. Es el único ajuste sobre la estructura pedida.

```
apps/
  costos/            ✅ funcional (fase 4) — catálogo, recetas, costeo, parámetros
  pos/               fase 5–6
  kiosko/            fase 5–6
  admin/             fase 7
  cocina-alimentos/  fase 6
  cocina-bebidas/    fase 6
  cliente-display/   fase 6
packages/
  types/     tipos generados del esquema + alias de dominio + tipos legacy
  supabase/  cliente central (getSupabase) + TODAS las queries; ./admin solo server
  utils/     lógica pura (costeo espejo de la vista, formato dinero)
  ui/        componentes compartidos (se puebla en fase 5+)
supabase/
  migrations/  SQL versionado (solo aditivo)
  seed/        ETL app_data → relacional, con reporte de conciliación
  functions/   edge functions (webhook Clip, fase 8)
docs/
```

- **pnpm workspaces**, paquetes consumidos como fuente TS (sin build step;
  Vite los compila). Node ≥ 20.
- Una app = un deploy independiente (Vercel/Netlify/estático). Todas
  comparten la misma anon key y URL vía `.env`.

## Modelo de datos (entidades pedidas → tablas)

| Entidad | Tabla | Nota |
|---|---|---|
| sucursales / almacenes | `sucursales`, `almacenes` | multisucursal; Bodega + Kiosko sembrados |
| empleados / roles | `empleados`, `roles` | PIN hasheado; `auth_user_id` para fase 9 |
| cajas / cortes | `cajas`, `caja_cortes` | índice único: un corte abierto por caja |
| insumos / categorías | `insumos`, `insumo_categorias` | `costo_unitario` = columna generada |
| productos / categorías | `productos`, `categorias` | categoría → cocina (ruteo KDS) |
| recetas | `recetas` | cantidad en unidad del insumo |
| inventario | `inventario_stock`, `inventario_movimientos`, `transferencias`, `mermas`, `lotes` | |
| órdenes | `ordenes`, `orden_items` | + `corte_id`, `empleado_id`, `cliente_id` |
| pagos | `pagos` | Clip-ready; `ventas` (legacy) se mantiene por compatibilidad |
| cocina | `pedidos_cocina`, `cocina_items` | estados por estación, realtime |
| clientes | `clientes` | |
| parámetros | `parametros` | IVA, food cost meta, merma, mano de obra |
| costeo | `vw_costeo_producto` | v2: + empaque, precio_con_iva, margen_pct |
| reportes | `vw_corte_resumen`, `vw_stock_almacen` | |

## Flujo transaccional central (en la base, no en el frontend)

```
pagos.estado = 'aprobado'
  └─ trg_pago_aprobado  → ordenes.pagado = true
       ├─ trg_descontar_inventario → inventario_movimientos + inventario_stock + ventas
       └─ trg_crear_pedidos_cocina → pedidos_cocina + cocina_items (split por estación)
```

Un frontend que muera a media venta no deja estados intermedios: aprobar
el pago es **una sola escritura** y la base hace el resto.

## Decisiones documentadas

1. **Triggers `security definer`**: sin esto, el flujo de pago fallaba por
   RLS (bug preexistente). Riesgo controlado: solo escriben tablas
   internas con datos derivados de la fila disparadora.
2. **`pagos` además de `ventas`**: `ventas` (1:1 con orden) queda como
   registro contable legacy; `pagos` soporta N pagos por orden, estados
   (pendiente/aprobado/rechazado) y trazabilidad Clip. No se borra nada.
3. **Ruteo a cocina por categoría** (`categorias.cocina_id`) con fallback
   a `orden_items.cocina_slug` y default `bebidas`: compatible con el demo
   POS actual sin exigirle cambios inmediatos.
4. **Proteína del shake como personalización**, no línea de receta: el
   cliente elige proteína al comprar; fijarla en la receta descontaría la
   proteína equivocada. El scoop se descuenta vía item/personalización
   (fase 6 refinará esto con modificadores).
5. **Snacks/bebidas → estación bebidas**: `categorias.cocina_id` es NOT
   NULL; la barra despacha reventa. Ajustable con un UPDATE.
6. **Vista de costeo en la base** y espejo puro en `@shake/utils`: el
   recálculo masivo (cambia un insumo → todos los productos) es gratis en
   la vista; el espejo da preview en vivo al editar recetas.
