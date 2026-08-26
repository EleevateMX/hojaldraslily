# Auditoría de producción — Hojaldras Lily POS

Fecha: 2026-07-17. Alcance: monorepo completo (8 apps + paquetes compartidos +
Supabase). Metodología: lectura de código fuente + verificación en vivo
contra la base de datos real (`fzkdgqqvfkogmxdgqsxj`) mediante consultas de
solo lectura — RLS, grants, políticas, funciones y triggers reales, no
supuestos a partir del código. Cada hallazgo indica si fue **verificado en
vivo** o **inferido por lectura de código** (pendiente de reproducir).

Este documento se actualiza por fases. Fase 1 (este documento) es el
diagnóstico. Las correcciones de Fase 2/3 se aplican en migraciones
aditivas separadas y se referencian aquí conforme se completan.

---

## 1. Mapa del repositorio

```
apps/
  kiosko/            autoservicio táctil (React Router, zustand)
  pos/               caja (login PIN, catálogo, cobro, corte)
  admin/             panel de control (dashboard, menú, inventario, promos, ventas, empleados)
  cocina-alimentos/  KDS alimentos
  cocina-bebidas/    KDS bebidas (+ "Entregar ya")
  cliente-display/   pantalla de folios para el cliente
  cliente-pwa/       Hojaldras Lily Rewards (Google Auth, QR, cupones)
  costos/            costosshake real del cliente (estático, alimenta al POS)
packages/
  supabase/  cliente + queries tipadas (capa de acceso a datos de las 8 apps)
  types/     tipos compartidos (Orden, Pago, Producto, etc.)
  ui/        componentes + ticket.ts (impresión de ticket vía diálogo navegador)
  utils/     mxn(), helpers
  brand/     tokens de marca, tailwind preset, Milo
supabase/migrations/   SQL aditivo versionado (11 archivos + 3 RPC sueltos)
.github/workflows/deploy-cloudflare.yml  CI → Cloudflare Pages (8 jobs, matrix)
```

**Despliegue**: push a `main` → GitHub Actions build+deploy de las 8 apps a
Cloudflare Pages en paralelo (`fail-fast: false`). No hay ambiente de
*preview* ni *staging*; todo push a `main` es producción. No hay gate que
bloquee el deploy del frontend si una migración de Supabase requerida aún
no se aplicó (las migraciones se aplican manualmente vía MCP, no en CI).

**Backend**: Supabase (Postgres + PostgREST + Realtime). No hay Edge
Functions desplegadas todavía (`clip-*` son diseño, no código). RLS activo
en casi todas las tablas operativas, con políticas mayoritariamente
`using (true)` — postura heredada del login legacy propio, documentada como
deuda en `docs/pendientes.md` §Seguridad.

## 2. Flujo de datos reconstruido (verificado contra la BD real)

```
Kiosko/POS arma carrito (precio_unitario y total calculados EN EL CLIENTE)
        │
        ▼
crearOrden()  ── INSERT ordenes (total ya calculado) ──┐
        │                                               │  2 llamadas HTTP
        └──────  INSERT orden_items  ──────────────────┘  independientes, SIN transacción
        │
        ▼
cobrarOrden() ── INSERT pagos (estado='aprobado' directo, sin validar monto) ──┐
        │                                                                       │ INSERT/UPDATE con
        │                                                                       │ RLS using(true):
        ▼                                                                       │ cualquiera con la
trg_pago_aprobado (DB)  → UPDATE ordenes SET pagado=true                       │ anon key puede
        │  (guardado por WHERE pagado=false: idempotente en este punto)         │ hacerlo por REST
        ▼                                                                       │ directo, sin pasar
trg_crear_pedidos_cocina + fn_descontar_inventario_por_orden +                  │ por la app
fn_acumular_mancuernas  (los 3 se disparan por el UPDATE de ordenes,           │
guardados por OLD.pagado IS DISTINCT FROM true → no se duplican               │
si el UPDATE se repite) ◄──────────────────────────────────────────────────────┘
        │
        ▼
KDS recibe pedidos_cocina por Realtime. NO hay envío a impresora térmica.
        │
        ▼
Ticket de venta: diálogo de impresión del navegador (@shake/ui ticket.ts). Manual.
```

**Lo que SÍ es atómico y correcto** (verificado): la cadena
`ordenes.pagado=true → inventario → pedidos_cocina → mancuernas` está
protegida por el mismo guard (`OLD.pagado IS DISTINCT FROM true`) en los
tres triggers, así que **una vez que `pagado` pasa a `true` una sola vez**,
el resto de la cadena es idempotente y no se duplica aunque el `UPDATE` se
repita.

**Lo que NO es atómico ni seguro** (verificado, ver hallazgos §3): la
creación de la orden (2 inserts sueltos), el cálculo del total (100% cliente,
sin recomputar en servidor) y, el más grave, **la transición de un pago a
`aprobado` es un INSERT/UPDATE directo permitido por RLS a cualquiera con la
anon key** — no pasa por ningún RPC que valide el monto contra la orden.

## 3. Hallazgos

### CRÍTICO

#### C1 — Cualquiera con la anon key puede marcar una orden como pagada sin pagar
- **Módulo**: Backend / Pagos. **Archivo**: migración
  `20260701220000_pos_operativo_aditivo.sql`, policies `ins_pagos`
  (`for insert with check (true)`) y `upd_pagos` (`for update using (true)`)
  sobre la tabla `pagos`.
- **Verificado en vivo**: `select grantee, privilege_type from
  information_schema.role_table_grants where table_name='pagos' and
  grantee='anon'` devuelve INSERT/UPDATE/SELECT (y DELETE, pero sin policy
  de delete, así que ese en particular queda bloqueado por RLS). Las
  policies de INSERT/UPDATE no tienen `with_check` que valide `estado`,
  `monto` ni relación con la orden real.
- **Riesgo**: la anon key es **pública por diseño** (viaja en el bundle de
  cada app, visible en cualquier DevTools). Con ella, un request directo a
  PostgREST —sin abrir ninguna app— del tipo
  `POST /rest/v1/pagos {"orden_id":"<cualquier orden pendiente>","metodo":"efectivo","monto":0,"estado":"aprobado"}`
  marca la orden como pagada, dispara el descuento de inventario, crea el
  pedido de cocina y otorga mancuernas — **sin que haya ocurrido ningún
  cobro real**. Es el mismo mecanismo que usa hoy `cobrarOrden()` desde dentro
  de la app; el problema es que nada impide llamarlo por fuera con cualquier
  monto.
- **Escenario que lo provoca**: cualquier persona con acceso a la anon key
  (pública) y una herramienta HTTP. No requiere sesión, login ni PIN.
- **Corrección propuesta**: mover la transición a `aprobado` detrás de una
  RPC `SECURITY DEFINER` (`fn_cobrar_orden_efectivo` para el único caso
  legítimo de auto-aprobación —efectivo confirmado por un cajero con sesión
  válida— y dejar todo lo demás en `pendiente` hasta que un flujo server-side
  (webhook Clip validado) lo confirme). Retirar los grants de INSERT/UPDATE
  directos sobre `pagos` para `anon`/`authenticated` en las columnas
  sensibles, o como mínimo bloquear con `with_check` que el `estado` inicial
  nunca sea `'aprobado'` salvo `metodo='efectivo'` y que el `monto` coincida
  con `ordenes.total`.
- **Prueba necesaria**: request REST directo (sin pasar por la app) que
  intente aprobar un pago con monto manipulado; debe ser rechazado tras el
  fix. Implementada y corregida en Fase 2 (ver §5).

#### C2 — El total y el precio unitario de cada línea los decide el navegador
- **Módulo**: Kiosko + POS. **Archivo**:
  `packages/supabase/src/queries/ordenes.ts` (`crearOrden`),
  `apps/pos/src/pages/Cobro.tsx`, `apps/kiosko/src/pages/Pago.tsx`.
- **Verificado por lectura de código**: `crearOrden()` calcula
  `total = subtotal - descuento` en TypeScript y lo inserta tal cual; cada
  `NuevaOrdenItem.precio_unitario` viene del store del cliente (que a su vez
  lo llenó de `listarProductosParaVenta`, pero nada impide que un cliente
  modificado —o un request directo— mande otro valor). No hay ningún check
  en la base de datos que recalcule el total contra `productos.precio` ni
  que valide `orden_items.precio_unitario` contra el catálogo real.
- **Riesgo**: un total manipulado se acepta tal cual; combinado con C1, se
  puede generar una venta "pagada" de $0 con productos reales, que descuenta
  inventario real y aparece en reportes de ventas.
- **Corrección propuesta**: RPC `fn_crear_orden(items, descuento_id?)` que
  recibe solo `producto_id` + `cantidad` + personalización por línea, busca
  `productos.precio` en el servidor, valida el descuento (cupón/promo) contra
  las tablas de lealtad/promociones, y calcula el total en SQL. El cliente
  deja de mandar `precio_unitario` y `total`.
- **Prueba necesaria**: crear orden con `precio_unitario` alterado vía RPC;
  el total resultante debe reflejar el precio real del catálogo, no el enviado.
  Implementada en Fase 2.

#### C3 — `pin_hash` de empleados es legible por cualquiera con la anon key
- **Módulo**: Backend / Empleados. **Archivo**: policy `sel_empleados on
  empleados for select using (true)`.
- **Verificado en vivo**: grant SELECT de `anon` sobre `empleados` existe, y
  la policy no filtra columnas. `GET /rest/v1/empleados?select=*` devuelve
  `pin_hash` a cualquiera con la anon key, aunque la app nunca lo pida (usa
  RPCs que sí lo omiten).
- **Riesgo**: el PIN es de 4-6 dígitos; con el hash expuesto, un ataque de
  fuerza bruta offline contra bcrypt/pgcrypto de un espacio de ~10,000-1,000,000
  combinaciones es trivial en minutos incluso con costo de hash alto. Un
  atacante recupera el PIN de cualquier cajero/gerente/admin y puede operar
  el POS o el CRUD de empleados en su nombre.
- **Corrección propuesta**: revocar `SELECT` de `pin_hash` a nivel columna
  para `anon`/`authenticated` (grant column-level), o mover el listado a una
  vista `empleados_publico` sin esa columna y apuntar cualquier lectura
  directa restante ahí. Las RPCs (`fn_login_cajero`, `fn_empleados_activos`,
  `fn_admin_empleados`) ya no exponen el hash — solo falta cerrar el acceso
  directo a la tabla.
- **Prueba necesaria**: `select pin_hash from empleados` con rol `anon` debe
  fallar tras el fix. Implementada en Fase 2.

#### C4 — El kiosko autoaprueba el pago "terminal" sin ninguna confirmación externa

> ✅ **RESUELTO en la ronda de "cierre pre-Clip"** — ver §8 al final de este
> documento y `docs/flujo-pagos.md`/`docs/maquina-estados.md`. El
> `setTimeout` que se describe abajo ya no existe; `Pago.tsx` fue
> reescrito por completo. Se deja el hallazgo original sin editar, como
> registro histórico de lo que se encontró y por qué se decidió cerrarlo.

- **Módulo**: Kiosko. **Archivo**: `apps/kiosko/src/pages/Pago.tsx`
  (`confirmarPago`, rama `metodo === 'terminal'`).
- **Verificado por lectura de código**: la animación de "Acerque su
  tarjeta… Procesando… ¡Pago aprobado!" es un `setTimeout` fijo de 7.2s; al
  terminar, el código ya llamó `cobrarOrden(sb, orden.id, 'clip',
  totalOrden)` con `estado: 'aprobado'` de forma incondicional. No hay
  ninguna señal real de una terminal física ni de Clip — es 100% simulado y
  se autoaprueba siempre, incluso si nadie tocó ninguna tarjeta.
- **Riesgo**: si esto se despliega tal cual en la sucursal real (sin Clip
  conectado), **cualquier cliente que toque "Confirmar pago → Terminal"
  recibe su pedido gratis** — la orden se marca pagada, se descuenta
  inventario y se imprime confirmación sin que haya habido cobro. Esto es
  además el mismo mecanismo que C1 permite explotar por fuera de la app.
- **Escenario que lo provoca**: uso normal del kiosko, sin necesidad de
  atacar nada — es el comportamiento por defecto documentado como *seam* de
  Clip, pero no está bloqueado ni marcado como no apto para producción.
- **Corrección propuesta**: mientras no haya credenciales reales de Clip
  (nivel 2/3 de `docs/integracion-clip.md`), el pago con terminal debe crear
  el `pago` en estado `pendiente` y **requerir una confirmación explícita
  con intervención humana** (p. ej. el cajero de respaldo aprueba desde POS/
  Admin con referencia del voucher, igual que hoy hace el POS para "Clip").
  No debe existir un camino donde el frontend se autoaprueba un pago sin que
  nadie con autoridad lo confirme. Se documenta como bloqueante para
  producción real hasta que exista integración Clip o un cajero de respaldo
  confirmando cada pago de kiosko.
- **Prueba necesaria**: flujo kiosko → terminal no debe dejar la orden en
  `pagado=true` sin una acción de confirmación aparte. **Nota**: esta
  corrección de UX/flujo de negocio se documenta en Fase 2 junto con C1, pero
  requiere una decisión de negocio (¿quién confirma pagos de kiosko sin Clip
  real?) — ver §6 configuraciones pendientes del usuario.

### ALTO

#### A1 — `crearOrden()` no es atómico: puede dejar órdenes fantasma sin items
- **Módulo**: `packages/supabase/src/queries/ordenes.ts`.
- **Verificado por lectura de código**: `INSERT ordenes` y luego `INSERT
  orden_items` son dos llamadas HTTP separadas sin transacción. Si la
  segunda falla (red, timeout), queda una `orden` en la base sin ningún
  `orden_item`, en estado `pagado=false` para siempre (huérfana). Esto es
  exactamente el patrón que generó el folio 9 fantasma detectado y
  eliminado manualmente en esta sesión.
- **Riesgo**: acumulación de órdenes huérfanas, folios "perdidos" que
  confunden al staff, reportes con ruido.
- **Corrección propuesta**: RPC única que inserta orden + items en la misma
  transacción de Postgres (ver C2, es la misma RPC).
- **Prueba necesaria**: simular fallo de red entre ambos inserts (ya no
  aplica tras fusionarlos en una sola llamada). Implementada en Fase 2.

#### A2 — Doble clic / reintento en cobrar duplica el `pago` (aunque no duplica inventario)
- **Módulo**: POS/Kiosko. **Archivo**: `apps/pos/src/pages/Cobro.tsx` (guard
  `procesando` solo en memoria del componente), `ordenes.ts:cobrarOrden`.
- **Verificado por lectura de código + esquema**: no existe ninguna
  restricción única en `pagos` que impida dos filas `estado='aprobado'`
  para la misma `orden_id`. El guard `procesando` en React evita el doble
  clic dentro de la misma pestaña, pero no protege contra: dos pestañas
  abiertas, un reintento tras timeout de red (la respuesta se perdió pero el
  insert sí llegó), o una llamada directa repetida.
- **Riesgo**: aunque `fn_pago_aprobado`/inventario/mancuernas están
  protegidos por el guard de `ordenes.pagado`, **`vw_corte_resumen` suma
  TODOS los pagos con `estado='aprobado'`** — un pago duplicado infla
  `total_efectivo`/`total_clip`/etc. en el corte de caja, generando una
  "diferencia" falsa cuando el cajero cuenta el efectivo real. Es un bug de
  conciliación financiera, no de inventario.
- **Corrección propuesta**: índice único parcial
  `unique (orden_id) where estado = 'aprobado'` sobre `pagos`, más una
  `idempotency_key` generada por el cliente (UUID por intento de cobro) con
  constraint único, para que un reintento exacto no inserte una segunda fila
  sino que retorne la ya existente.
- **Prueba necesaria**: dos llamadas a `cobrarOrden` para la misma orden
  deben resultar en un solo `pago` aprobado. Implementada en Fase 2.

#### A3 — Reglas RLS `using(true)` en escritura para casi todo el catálogo/operación
- **Módulo**: Backend, transversal. **Archivo**: todas las migraciones con
  bloques `do $$ begin create policy ... using (true) ... end $$`.
- **Verificado en vivo**: confirmado con `pg_policies` para `pagos`,
  `ordenes`, `clientes`, `empleados`; el mismo patrón se repite en
  `productos`, `categorias`, `inventario_stock`, `inventario_movimientos`,
  `recetas`, `insumos`, `transferencias`, `mermas`, `lotes`, `parametros`
  (visto en la migración `pos_operativo_aditivo.sql`, sección RLS).
- **Riesgo**: cualquiera con la anon key puede, por ejemplo, cambiar
  `productos.precio` directamente, insertar movimientos de inventario
  falsos, o modificar `parametros` (incluye `clave_traspaso`/
  `clave_compras`, ya señalado en `pendientes.md`). Ya está documentado como
  deuda conocida en `docs/pendientes.md` §Seguridad — se confirma aquí que
  sigue vigente y se detalla el alcance real verificado.
- **Corrección propuesta**: es un cambio grande (migrar a Supabase Auth +
  rol en JWT) que **no se puede resolver de forma completa sin romper la app
  actual** (todo el login es PIN propio, no Supabase Auth, excepto Rewards
  PWA que sí usa Google Auth). Se prioriza en esta fase cerrar los huecos
  con impacto financiero directo (C1, C3, A2); la migración completa a Auth
  +rol en JWT queda como ítem de la Fase 9 ya documentada, con plan explícito
  en §7 de este documento.
- **Prueba necesaria**: pendiente — requiere diseño de sesiones con Supabase
  Auth antes de poder probarse. No se implementa en esta ronda.

#### A4 — No existe impresión automática de comandas
- **Módulo**: Cocina/Barra. Ya documentado en `pendientes.md`/`hardware.md`.
- **Riesgo**: el pedido solo existe en pantalla; si el KDS se apaga, se
  recarga en mal momento, o el operador no lo ve, no hay respaldo físico.
- **Corrección propuesta**: prioridad principal de esta auditoría — ver
  Fase 3 (cola de impresión + agente local), implementada en esta ronda.

### MEDIO

#### M1 — El pedido de cocina se rutea a "bebidas" por defecto si el producto no tiene categoría/cocina
- **Módulo**: Backend. **Archivo**: `fn_crear_pedidos_cocina()`,
  `coalesce(c.cocina_id, (select id from cocinas where slug =
  coalesce(oi.cocina_slug, 'bebidas')))`.
- **Riesgo**: un producto mal categorizado en costosshake (o recién creado
  sin categoría) termina silenciosamente en Barra sin ninguna alerta,
  aunque debiera ir a Cocina. No hay log ni aviso.
- **Corrección propuesta**: agregar una vista/alerta en Admin que liste
  productos activos sin `categoria_id` o con categoría sin `cocina_id`
  asignada (ver Fase 4, observabilidad). No implementado en esta ronda por
  tiempo; queda documentado.

#### M2 — Kiosko "efectivo" marca la orden como pagada de inmediato, sin que el cliente haya pagado

> ✅ **RESUELTO junto con C4** — ver §8. La opción "efectivo" ya no existe
> como autoaprobación; el equivalente hoy es el modo `pagar_en_caja`, que sí
> crea la orden pendiente y requiere que el POS la cobre (exactamente la
> corrección que este hallazgo pedía).

- **Módulo**: Kiosko. **Archivo**: `apps/kiosko/src/pages/Pago.tsx`, rama
  `efectivo`.
- **Verificado por lectura de código**: el texto dice "Paga en caja · billete
  en mano" (implica pago posterior en caja), pero el código llama
  `cobrarOrden(..., 'efectivo', totalOrden)` con `estado: 'aprobado'` de
  inmediato, antes de que el cliente camine a caja. La orden queda
  "pagada" en el sistema (inventario descontado, mancuernas otorgadas) sin
  que el dinero haya entrado.
- **Riesgo**: inconsistencia de negocio — un cliente puede tomar su folio y
  nunca pagar en caja; el sistema ya la contó como venta.
- **Corrección propuesta**: si el kiosko no cobra en efectivo directamente
  (no tiene ranura de billetes), esta opción debería crear la orden en
  `pendiente` y ser el POS quien la cobre y confirme al escanear el folio —
  no auto-aprobarse. Requiere decisión de negocio (¿el kiosko de verdad
  ofrece "pagar en caja" como opción, o solo debería ofrecer terminal/Clip?).
  Se documenta para decisión del usuario, no se cambia el comportamiento de
  negocio sin confirmación (ver §6).

#### M3 — Suscripciones Realtime sin límite de vida verificado en KDS de larga duración
- **Módulo**: `apps/cocina-alimentos`, `apps/cocina-bebidas`.
- **Verificado por lectura de código**: `useEffect` con `suscribirPedidosCocina`
  limpia el canal en el cleanup (`return () => off()`), lo cual es correcto
  para remounts normales de React. No se verificó comportamiento en jornadas
  de 12+ horas continuas (reconexión de WebSocket tras caída de red,
  acumulación de listeners si Supabase reconecta internamente). Marcado
  como pendiente de prueba de larga duración, no reproducido en esta sesión.
- **Corrección propuesta**: Fase 4 — agregar reconexión explícita con
  backoff y un indicador visual de "desconectado" en KDS.

### BAJO / MEJORA RECOMENDADA

- **B1**: No hay manejo global de errores (`ErrorBoundary`) en ninguna app;
  un error de render deja pantalla en blanco sin explicación en un kiosko
  desatendido. *Mejora recomendada, Fase 4.*
- **B2**: El ticket de venta (`@shake/ui/ticket.ts`) depende del diálogo de
  impresión del navegador; en un kiosko en modo quiosco sin barra de
  navegador esto puede no disparar o requerir confirmación manual. No se
  reprodujo (requiere hardware real). *Documentar en checklist de
  producción.*
- **B3**: No hay pruebas automatizadas (unitarias/integración/e2e) en el
  repo — `pnpm test` no existe en ningún `package.json`. *Alto impacto a
  mediano plazo, pero implementar un framework completo de pruebas está
  fuera del alcance que se puede completar con calidad en esta ronda; se
  deja un primer paquete de pruebas SQL de concurrencia para los flujos
  críticos nuevos (Fase 2/3), documentado en §7.*
- **B4**: `docs/integracion-clip.md` ya documenta niveles 1/2/3 correctamente
  — no se reescribe, solo se referencia y se añade la advertencia de C4.

## 4. Prioridades de esta ronda de trabajo

1. **C1 + C2 + A1 + A2** (mismo cambio: RPC atómica de orden+cobro con
   idempotencia y recálculo server-side) — máximo impacto financiero, un
   solo conjunto de migraciones.
2. **C3** (cerrar `pin_hash`) — cambio pequeño, aislado, alto impacto.
3. **C4 / M2** — requieren decisión de negocio; se documentan y se deja la
   arquitectura lista (pago 'pendiente' + confirmación explícita) pero **no
   se cambia el comportamiento actual del kiosko sin que el usuario decida**
   quién confirma esos pagos mientras no haya Clip real.
4. **A4 — impresión automática** (prioridad principal explícita del
   usuario) — Fase 3 completa.
5. A3, M1, M3, B1-B4 quedan documentados con corrección propuesta pero no
   implementados en esta ronda por alcance/tiempo; no son bloqueantes
   financieros inmediatos como C1-C3.

## 5. Correcciones implementadas

### C1, C2, A1, A2 — `supabase/migrations/produccion_ordenes_atomicas.sql`

- `fn_crear_orden()`: inserta orden + items en una sola transacción de
  Postgres. Recalcula `precio_unitario` de cada línea y el `total` desde
  `productos.precio` — el cliente ya no manda ni precio ni total.
- `fn_cobrar_orden()`: bloquea la fila de la orden (`FOR UPDATE`) para
  serializar cobros concurrentes, valida que `monto` coincida con el total
  real (tolerancia $0.01), y es idempotente en 3 capas: por
  `idempotency_key` explícita, por "ya existe un pago aprobado para esta
  orden" (devuelve el existente, nunca duplica), y por índice único de
  respaldo `uq_pagos_un_aprobado_por_orden` (defensa en profundidad si la
  lógica anterior fallara).
- `packages/supabase/src/queries/ordenes.ts`: `crearOrden()`/`cobrarOrden()`
  ahora llaman estas RPCs en vez de hacer inserts sueltos. **Firmas sin
  cambios** — cero modificaciones en `apps/pos/src/pages/Cobro.tsx` ni
  `apps/kiosko/src/pages/Pago.tsx` más allá de agregar una
  `idempotencyKey` opcional por intento de cobro (defensa extra a nivel
  cliente, redundante con el índice único del lado del servidor).

**Verificado en vivo** (transacciones con `RAISE EXCEPTION` al final, 100%
revertidas, cero datos reales tocados):
- Precio recalculado en servidor coincide con `productos.precio` real.
- Monto manipulado (`999999` contra un total real menor) → rechazado.
- Dos cobros seguidos sin `idempotency_key` (simula doble clic) → un solo
  pago `aprobado`, mismo `id` en ambas respuestas.
- Dos cobros con la misma `idempotency_key` → mismo `id`, no duplica.
- Cadena completa `crear→cobrar→inventario→pedidos_cocina→mancuernas` vía
  las nuevas RPCs: stock decrementado exactamente por la receta,
  `pedidos_cocina` creado, mancuernas otorgadas correctamente — la cadena
  de triggers existente sigue intacta.
- `pnpm --filter @shake/supabase typecheck`, `pnpm --filter @shake/pos
  build`, `pnpm --filter @shake/kiosko build` — los 3 en verde.

### C3, C1 (capa RLS/grants) — `supabase/migrations/produccion_seguridad_pagos_empleados.sql` + `produccion_seguridad_columnas_fix.sql`

- `pagos`: ya no existe policy de `UPDATE` para `anon`/`authenticated`
  (bloqueado por completo); `INSERT` solo permite `estado <> 'aprobado'`.
  Aprobar un pago solo es posible dentro de `fn_cobrar_orden`.
- `ordenes`/`orden_items`: se eliminaron las policies de `INSERT` directo;
  solo `fn_crear_orden` puede crear órdenes.
- `ordenes`: `UPDATE` de `anon`/`authenticated` restringido a la columna
  `estado` únicamente (permite que `cancelarOrden()` siga funcionando).
  `pagado`/`total`/`metodo_pago` solo cambian dentro de las RPCs.
- `empleados`: `SELECT` de `anon`/`authenticated` restringido a las
  columnas sin `pin_hash`.
- **Nota de la primera pasada**: el primer intento de restringir columnas
  usó `REVOKE ... (columna) ... FROM anon` sobre una tabla que YA tenía
  un `GRANT` de tabla completa — en Postgres eso NO revoca nada (el grant
  de tabla completa sigue cubriendo la columna). Se detectó probando en
  vivo como el rol `anon` (no se asumió que el fix funcionaba por estar
  escrito) y se corrigió revocando el privilegio de TABLA completa primero
  y re-otorgando explícitamente solo las columnas seguras
  (`produccion_seguridad_columnas_fix.sql`).

**Verificado en vivo, como rol `anon`, dentro de una transacción 100%
revertida:**
- `INSERT` directo en `ordenes` → bloqueado.
- `INSERT` directo en `orden_items` → bloqueado.
- `INSERT` de un pago con `estado='aprobado'` → bloqueado.
- `INSERT` de un pago con `estado='pendiente'` → permitido (inofensivo).
- `UPDATE ordenes SET pagado=true` directo → bloqueado.
- `UPDATE ordenes SET estado='cancelada'` directo → **permitido**
  (`cancelarOrden()` sigue funcionando).
- `SELECT pin_hash FROM empleados` → bloqueado.
- `fn_login_cajero`, `fn_admin_empleados`, `fn_empleados_activos` como
  `anon` → siguen funcionando (SECURITY DEFINER, no afectadas por los
  revokes de columna).

### C4 / M2 — no se implementó cambio de comportamiento

Documentado en §6; requiere decisión de negocio del usuario antes de tocar
el flujo de autoaprobación del kiosko. La arquitectura ya lo soporta sin
más cambios de esquema (basta con no llamar `cobrarOrden` hasta tener la
confirmación, y dejar el pago en `pendiente`).

### A4 — impresión automática de comandas

Ver Fase 3, documentada por separado en `docs/impresion-comandas.md`.

## 6. Configuraciones/decisiones que debe dar el usuario

- **C4/M2**: mientras no haya credenciales Clip reales, ¿quién confirma un
  pago de kiosko con "terminal" o "efectivo"? Opciones: (a) un cajero de
  respaldo aprueba desde POS/Admin con referencia, (b) el kiosko solo
  ofrece "Clip" y un cajero está siempre disponible para asistir, (c) se
  arriesga el autoaprobado documentado como temporal hasta integrar Clip.
  **No se cambia el comportamiento del kiosko sin esta decisión** — queda
  documentado y la arquitectura de pago desacoplado (ver
  `docs/integracion-clip.md`) ya soporta cualquiera de las 3 opciones.
- Credenciales de impresoras (IP/puerto de cada impresora térmica) — se
  entrega la interfaz de configuración vacía, a llenar por sucursal.
- Credenciales de Clip (API key, webhook secret) — siguen pendientes, no se
  inventan.

## 7a. Criterios de aceptación — evaluación honesta

| # | Criterio | Estado |
|---|---|---|
| 1 | Venta confirmada genera un pedido una sola vez | ✅ Verificado (guard `OLD.pagado IS DISTINCT FROM true` + `fn_cobrar_orden` idempotente) |
| 2 | Inventario se descuenta una sola vez | ✅ Verificado (mismo guard) |
| 3 | Puntos se entregan una sola vez | ✅ Verificado (mismo guard) |
| 4 | Cocina recibe únicamente sus productos | ✅ Verificado (prueba con orden mixta) |
| 5 | Barra recibe únicamente sus productos | ✅ Verificado (prueba con orden mixta) |
| 6 | Cada estación recibe su comanda | ✅ Verificado (1 trabajo de impresión por `pedido_cocina`) |
| 7 | La comanda se imprime automáticamente sin abrir el diálogo del navegador | ✅ Cola + agente ESC/POS construidos y probados a nivel de base; impresión física real en hardware **no verificada** en este entorno (sandbox sin salida de red directa — ver `agente-impresion` commit) |
| 8 | Impresora apagada no pierde la comanda | ✅ Verificado (queda en la cola, se reintenta) |
| 9 | Trabajos fallidos se reintentan | ✅ Verificado (backoff exponencial probado) |
| 10 | Trabajo abandonado se libera automáticamente | ✅ Verificado (claim vencido + cron de respaldo) |
| 11 | Dos agentes no imprimen la misma comanda | ✅ Verificado (`FOR UPDATE SKIP LOCKED`) |
| 12 | Pérdida de conexión no duplica ventas | ✅ Verificado (idempotencia de `fn_cobrar_orden`) |
| 13 | Webhook duplicado no duplica pagos | ⏸ No aplica todavía — no hay webhook de Clip real (pendiente de credenciales); la RPC que lo recibiría (`fn_cobrar_orden`) ya es idempotente por diseño para cuando exista |
| 14 | Recarga del kiosko no crea otra venta | ✅ Verificado a nivel de datos (idempotencia de cobro); el kiosko no reintenta solo hoy — reintento es manual, siempre seguro |
| 15 | Reimpresión queda auditada | ✅ Verificado (`impresion_auditoria`) |
| 16 | POS y KDS estables durante una jornada completa | ⏸ No verificado — requiere una jornada real en producción; el código de suscripción Realtime limpia sus canales al desmontar (revisado por lectura), pero no se sometió a una prueba de varias horas |
| 17 | Todas las apps compilan | ✅ Verificado (`pnpm build`, 8/8 en verde) |
| 18 | Pruebas críticas pasan | ✅ Parcial — pruebas SQL exhaustivas de los flujos nuevos (orden/cobro/impresión) verificadas en vivo con rollback; pruebas unitarias reales para lógica de costeo/dinero (20/20 en verde); **no** hay suite e2e ni de integración automatizada (ver §7 abajo) |
| 19 | Documentación explica cómo instalar en una sucursal nueva | ✅ `docs/instalacion-agente-impresion.md`, `docs/configuracion-impresoras.md`, `docs/checklist-produccion.md` |
| 20 | No hay secretos privados en el frontend | ✅ Verificado — solo anon key (pública por diseño) en las 8 apps; `service_role`/tokens de agente nunca salen del backend o del `.env` local del agente |

## 7b. Entregables de esta ronda

**Código:**
- `supabase/migrations/produccion_ordenes_atomicas.sql` — `fn_crear_orden`/`fn_cobrar_orden`
- `supabase/migrations/produccion_seguridad_pagos_empleados.sql` +
  `produccion_seguridad_columnas_fix.sql` — cierre de RLS/grants
- `supabase/migrations/impresion_comandas.sql` +
  `impresion_reimprimir_empleado_opcional` (aplicada, no versionada aparte
  — cambio de un parámetro) — cola de impresión completa
- `packages/supabase/src/queries/ordenes.ts` (reescrito), `impresion.ts` (nuevo)
- `packages/types/src/database.ts` (regenerado), `dominio.ts` (tipos nuevos)
- `apps/pos/src/pages/Cobro.tsx`, `apps/kiosko/src/pages/Pago.tsx` — idempotencyKey
- `apps/admin/src/pages/Impresoras.tsx` (nuevo) + `App.tsx` (nav)
- `apps/cocina-alimentos/src/App.tsx`, `apps/cocina-bebidas/src/App.tsx` — indicador de impresión
- `agente-impresion/` completo (nuevo) — agente local Node/TS + ESC/POS
- `packages/utils/src/costeo.test.ts`, `dinero.test.ts` (nuevos, 20 pruebas)
- `eslint.config.js` + scripts `lint`/`test`/`test:integration`/`test:e2e`/`audit:production` en el `package.json` raíz
- `.github/workflows/deploy-cloudflare.yml` — gate de lint antes de desplegar

**Documentación:**
- `docs/auditoria-produccion.md` (este documento)
- `docs/impresion-comandas.md`, `docs/instalacion-agente-impresion.md`,
  `docs/configuracion-impresoras.md` (nuevos)
- `docs/recuperacion-fallas.md`, `docs/checklist-produccion.md` (nuevos)
- `docs/pendientes.md`, `docs/hardware.md` (actualizados)

**Pruebas ejecutadas y resultado:**
- Precio/total recalculado en servidor: ✅ coincide con catálogo real
- Monto manipulado: ✅ rechazado
- Doble cobro sin/con idempotency_key: ✅ un solo pago aprobado en ambos casos
- Cadena completa crear→cobrar→inventario→cocina→mancuernas vía las RPCs nuevas: ✅
- `anon` no puede insertar orden/item/pago-aprobado directo, sí puede insertar pago-pendiente y cancelar orden: ✅ los 7 casos como se esperaba
- `anon` no puede leer `pin_hash`, RPCs de empleados siguen funcionando: ✅
- Orden mixta → 2 comandas separadas por estación, cada una con sus items: ✅
- Reclamo atómico (2 agentes, mismo trabajo): ✅ solo uno se lo lleva
- Fallo → retry con backoff → claim abandonado se libera → reimpresión con auditoría: ✅
- Prueba de humo en vivo del agente contra Supabase real (con limpieza posterior, cero residuos): ✅ maneja la falla de red sin caerse; impresión física en hardware real **no probada** (limitación del sandbox, no del código)
- `pnpm audit:production` (lint + typecheck + test + build, 14 paquetes/apps): ✅ verde

**Riesgos pendientes:**
- A3 (RLS `using(true)` en el resto del catálogo) — deuda documentada, requiere Supabase Auth
- C4/M2 (autoaprobación de pago en kiosko sin Clip real) — decisión de negocio pendiente del usuario
- Impresión física en hardware real — no probada en este entorno; probarla es el primer paso al instalar en sucursal (`docs/instalacion-agente-impresion.md` §4)
- Sin suite e2e/integración automatizada — mitigado con pruebas SQL exhaustivas de los flujos críticos nuevos, pero no reemplaza CI automatizado de extremo a extremo

**Configuraciones que debe proporcionar el usuario:**
- IP/puerto (o dispositivo USB) de cada impresora térmica real
- Decisión sobre autoaprobación de pago en kiosko (§6)
- Credenciales de Clip cuando estén disponibles (`docs/integracion-clip.md`)
- Habilitar Google en Supabase Auth (pendiente de otra sesión, ya documentado)

**Pasos exactos para producción:**
1. Revisar y confirmar la decisión de C4/M2 (autoaprobación del kiosko)
2. Registrar cada impresora real en Admin → Impresoras
3. Instalar `agente-impresion` en un equipo por sucursal/estación (`docs/instalacion-agente-impresion.md`)
4. Probar impresión física real con `npm run test-print`, luego con una venta real
5. Recorrer `docs/checklist-produccion.md` completo antes de abrir

## 7. Deuda técnica documentada, no atacada en esta ronda

- A3 (RLS `using(true)` generalizado) — requiere migrar a Supabase Auth +
  rol en JWT; cambio transversal que puede romper el login PIN actual si no
  se diseña con cuidado. Se recomienda como el siguiente proyecto grande
  después de estabilizar impresión y pagos.
- B3 (suite de pruebas) — se agregan pruebas SQL puntuales para los flujos
  nuevos (idempotencia de cobro, cola de impresión), no un framework
  completo de unit/integration/e2e para las 8 apps.
- M1, M3 — paneles de observabilidad y reconexión Realtime con backoff
  explícito quedan para Fase 4 si el tiempo de esta ronda lo permite.

## 8. Actualización — cierre de C4/M2 y preparación de Clip

Ronda posterior a todo lo anterior, con prioridad explícita: "primero
elimina de producción el autoaprobado del kiosco, después prepara la
integración de Clip y ejecuta las pruebas de seguridad y concurrencia."

### C4/M2 — resueltos

`Pago.tsx` fue reescrito por completo. Ya no existe ningún `setTimeout` ni
autoaprobación. El kiosko opera bajo tres modos explícitos
(`configuracion_kiosko.modo_pago`: `clip` / `pagar_en_caja` / `demo` — el
enum `modo_pago_kiosko` no admite ningún otro valor, no existe ni puede
existir un modo `autoapprove`), y una orden solo se confirma como venta
pagada a través de `fn_confirmar_venta()`, que exige un pago con
`estado_transaccion='authorized'` real. Detalle completo:
`docs/flujo-pagos.md`, `docs/maquina-estados.md`, `docs/modo-pagar-en-caja.md`.

### Máquina de estados formal

Se separaron por completo tres conceptos que antes se confundían en
`ordenes.pagado`: estado de la **orden** (`estado_pago_orden`, 10 valores),
estado del **pago** (`estado_transaccion`, 10 valores) y confirmación de
**venta** (`venta_confirmaciones`, con `orden_id PRIMARY KEY` como garantía
estructural contra doble confirmación). Todas las transiciones están
bloqueadas a nivel de base con triggers `BEFORE UPDATE`, no solo validadas
en el frontend. Ver `docs/maquina-estados.md` para la tabla completa de
transiciones permitidas/bloqueadas.

### Preparación de Clip

Se construyó la abstracción `PaymentProvider` (`packages/payments/`) y las
Edge Functions correspondientes (`supabase/functions/clip-*`, cinco en
total) — escritas pero deliberadamente sin desplegar ni con credenciales,
porque no hay documentación oficial confirmada de la API real de Clip para
el Stand 2 (ver `docs/integracion-clip.md`, que ya documentaba esta
limitación de hardware desde la ronda anterior). Ninguna responde una
aprobación simulada: sin credenciales dicen `not_configured`; con
credenciales pero sin la llamada real implementada, dicen
`not_implemented`. Pasos exactos para activar Clip el día que lleguen las
credenciales: `docs/integracion-clip.md` sección final.

### Re-verificación de seguridad — no se dio por hecho lo ya cerrado

Se volvió a probar en vivo, como `anon`, cada ítem de seguridad de la lista
original más los nuevos de esta ronda. Se encontraron y cerraron **tres
brechas reales** que las rondas anteriores no cubrían:

1. `pagos.estado_transaccion` no estaba cubierto por la policy de INSERT
   (solo la columna legada `estado` lo estaba).
2. `clientes.mancuernas`/`cupones`/`mancuernas_movimientos` con
   INSERT/UPDATE directo abierto.
3. **Crítica**: `impresoras.agente_token` — el secreto que identifica a
   cada impresora física — era legible por cualquiera con la anon key,
   invalidando el aislamiento por sucursal del sistema de comandas.

Detalle completo, incluida la tabla de qué función crítica valida qué y
cómo, en `docs/pruebas-seguridad.md`. Deuda A3 reconfirmada y ampliada:
`productos.precio`, `caja_cortes` y ahora también `promociones` (encontrado
esta ronda) siguen con acceso directo porque Admin/POS aún no tienen un rol
de Supabase Auth distinto del kiosko público.

### Impresión — diagnóstico honesto

Se agregó `agente-impresion/src/diagnose.ts` (`npm run diagnose`), que
separa explícitamente qué se probó automatizado (conexión a Supabase,
autenticación, sucursal/estación, cola) de qué solo se prueba con hardware
real conectado (USB/red, impresión física, legibilidad de acentos, corte).
Ver `docs/diagnostico-impresion.md` para el desglose de qué se validó en
esta ronda y qué sigue pendiente de una impresora física real.

### Pendiente para la siguiente ronda

- Rotar los `agente_token` ya expuestos (operativo, no de código).
- Cerrar la deuda A3 (`productos.precio`, `caja_cortes`, `promociones`)
  cuando exista Supabase Auth de personal.
- Conseguir credenciales + documentación real de Clip y seguir los pasos de
  `docs/integracion-clip.md`.
- Botón de "reabrir orden expirada a mano" en Admin (hoy solo la
  reconciliación automática puede reabrir una orden `expired`, cuando
  encuentra evidencia de pago autorizado real).
