# Plan por fases

| Fase | Alcance | Estado |
|---|---|---|
| 1. Auditoría y arquitectura | Diagnóstico de BD real, riesgos, decisiones | ✅ hecha (docs/) |
| 2. Monorepo limpio | pnpm workspaces, packages compartidos, apps | ✅ hecha |
| 3. Supabase compartido | Migración `pos_operativo_aditivo` aplicada: pagos, cocina, cajas/cortes, empleados, clientes, vistas, RLS operable, realtime | ✅ hecha |
| 4. Costos a tablas relacionales | `apps/costos` funcional + ETL `supabase/seed` (correr dry-run → conciliar → aplicar) | ✅ app lista · ⏳ ETL por ejecutar |
| 5. POS con productos reales | `apps/pos` + `apps/kiosko` conectadas a `@shake/supabase`; catálogo desde `productos`; cobro 2 pasos | ✅ hecha |
| 6. Orden pagada → cocina → inventario | Triggers en la base + KDS (`apps/cocina-*`) y `apps/cliente-display` sobre `pedidos_cocina` con realtime. Verificado e2e | ✅ hecha |
| 7. Cortes y reportes | `vw_corte_resumen` en el corte del POS + `apps/admin` (ventas/inventario) con `vw_ventas_diarias`/`vw_productos_mas_vendidos` | ✅ hecha |
| 8. Preparación Clip | Edge function webhook + botón "cobrar con Clip" (ver integracion-clip.md) | ⏳ |
| 9. Hardening | Supabase Auth, policies por rol, cerrar `app_users`/`app_data` a anon, rotación de claves, backups | ⏳ |

## Siguiente paso inmediato (fase 4, cierre)

1. `pnpm install`
2. `pnpm etl:dry` → revisar `supabase/seed/reportes/conciliacion.md`
3. Conciliar duplicados (Gatorade ×3, etc.) y capturar los 16 precios de
   shakes + cantidades de recetas faltantes en `apps/costos`
4. `pnpm etl:aplicar`
5. Congelar edición en la app legacy de costos (queda solo lectura)

**¿Por qué costos primero y no POS?** Los datos reales viven en el JSON de
costos; el POS no tiene qué vender hasta que existan productos/recetas/
precios relacionales. Migrar costos primero puebla el catálogo que el POS
consumirá tal cual en fase 5, y valida la lógica de costeo contra números
conocidos antes de que el inventario dependa de las recetas.
