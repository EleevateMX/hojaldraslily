# hojaldraslily-pos-ecosistema

Ecosistema de punto de venta + costos de **Hojaldras Lily** sobre Supabase
(fuente única de verdad). Monorepo pnpm. Motor replicado de un sistema ya
probado en producción (`docs/replicar-el-sistema.md`), con la identidad
y el catálogo de Hojaldras Lily. Los demos visuales de venta viven en `demo/`.

```
apps/costos            ✅ costeo (insumos, productos, recetas, parámetros)      :5180
apps/pos               ✅ caja: catálogo, cobro 2 pasos, corte                 :5181
apps/produccion        ✅ Pantalla del horno (órdenes de producción)          :5188
apps/almacen           ✅ Visor de apartados (entregar y cobrar encargos)      :5189
apps/cliente-display   ✅ pantalla pública de folios (preparando/listo)        :5184
apps/admin             ✅ menú CRUD + ventas + inventario                      :5185
apps/kiosko            ✅ autoservicio + Clip + lealtad (canal kiosko)         :5186
apps/cliente-pwa       ✅ PWA cliente: login Google, mancuernas, QR, cupones   :5187
packages/{types,supabase,utils,ui}                 código compartido
supabase/{migrations,seed,functions}               SQL versionado, ETL, edge functions
docs/                                              diagnóstico, arquitectura, flujos, plan
```

Todas las apps consumen el mismo Supabase (fuente de verdad) vía
`@shake/supabase`. Empieza por **`docs/diagnostico.md`**,
**`docs/diagnostico-pos.md`** y **`docs/plan-fases.md`**.

## Correr las apps

Cada app necesita su `.env` (copia el `.env.example` de la app y pon la
anon key). Luego:

```bash
pnpm install
pnpm dev:pos       # caja        → http://localhost:5181
pnpm dev:kiosko    # autoservicio → :5186
pnpm dev:admin     # admin        → :5185
pnpm dev:produccion         # :5188
pnpm dev:almacen            # :5189
pnpm dev:display   # cliente-display → :5184
pnpm dev:pwa       # PWA cliente (Rewards) → :5187
pnpm dev:costos    # costeo      → :5180
```

`pnpm build` compila todas; `pnpm typecheck` valida el monorepo completo.

## Publicar / desplegar

Guía completa (hosting, subdominios por pantalla, modo kiosco en las PCs de la
sucursal, Clip, checklist): **`docs/despliegue.md`**.

## Correr en local

Requisitos: Node ≥ 20 y pnpm (`corepack enable`).

```bash
pnpm install

# Variables de la app de costos (anon key: Supabase Dashboard → Settings → API)
cp .env.example apps/costos/.env
#   → llenar VITE_SUPABASE_ANON_KEY

pnpm dev:costos          # http://localhost:5180
```

### Migrar los datos legacy (una vez)

```bash
cp .env.example .env     # → llenar SUPABASE_SERVICE_ROLE_KEY (raíz, NUNCA se commitea)
pnpm etl:dry             # simulación + reporte de conciliación
pnpm etl:aplicar         # migra app_data → insumos/productos/recetas
```

Detalles y advertencias: `supabase/seed/README.md` y
`docs/reporte-conciliacion.md`.

## Reglas de oro

- `app_data` y `app_users` **no se tocan** (legacy intacto).
- Migraciones SQL **solo aditivas**, versionadas en `supabase/migrations/`.
- `service_role` **jamás** en `apps/` — solo scripts/edge functions.
- Toda query a Supabase vive en `packages/supabase` — cero queries sueltas
  en componentes.
- La lógica transaccional (pago → inventario → cocina) vive en la base
  (triggers); los frontends no la duplican.
