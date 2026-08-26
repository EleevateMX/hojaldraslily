# Auditoría del error de costeo de empaques (costosshake)

Esta auditoría se hizo leyendo el código real de `apps/costos/index.html`
línea por línea, y consultando los datos reales en producción
(`app_data` en el proyecto `fzkdgqqvfkogmxdgqsxj`) — no se asume nada, cada
afirmación de este documento está verificada contra el sistema en vivo.

**No se modificó ningún dato ni código todavía.** Esto es solo el
diagnóstico, tal como se pidió: "antes de modificar código, revisa,
documenta, localiza."

## 0. Hallazgo previo, importante: qué es realmente "costosshake"

Antes de explicar el bug, hay que entender la arquitectura real, porque
cambia por completo qué tan grande es el problema y qué tan grande debe ser
la corrección.

`apps/costos/index.html` **no es una aplicación React/TypeScript como el
resto del monorepo.** Es un único archivo HTML de 1,322 líneas con JS
embebido (sin build, sin componentes, sin tipos compartidos). Todo su
estado de negocio — proteínas, ingredientes de shakes, ingredientes de
alimentos, **empaque**, recetas de shakes, recetas de alimentos, bebidas,
snacks, parámetros — vive como **un solo documento JSON** en una tabla:

```sql
app_data (id text primary key, data jsonb, updated_at, updated_by)
-- una sola fila real: id = 'hojaldraslily'
```

Cada vez que alguien edita cualquier campo, a los 500ms se dispara
`dbWrite()`, que hace `UPDATE app_data SET data = <TODO EL DOCUMENTO> WHERE
id = 'hojaldraslily'` — **sobrescribe el documento completo**, no una fila.
No hay tablas normalizadas, no hay RLS de negocio, no hay triggers, no hay
`recetas`/`producto_empaques` para este dominio, y no hay ninguna garantía
de que dos personas editando al mismo tiempo no se pisen (el último
`dbWrite()` gana, sin fusión).

Esto es completamente independiente de las tablas reales que usan
POS/Kiosko/Cocina (`productos`, `recetas`, `insumos`, `inventario_stock`).
La sincronización entre ambos mundos ocurre por un puente ETL
(`supabase/seed/etl-app-data.sql` + `supabase/seed/sync-app-data.sql`) que
hay que correr a mano.

**Por qué esto importa para el resto del encargo:** varias de las
funcionalidades pedidas (envío prorrateado con vista previa y confirmación,
guardado atómico, historial que nunca se pierde, ledger con
`correlation_id`, permisos por acción) **no se pueden construir de forma
segura dentro de un solo documento JSON con guardado de "todo o nada" cada
500ms.** Un "guardado atómico" real necesita una tabla con transacciones de
Postgres, no un `UPDATE` de un blob completo. Esto se retoma en la §6
(recomendación) — no se decidió unilateralmente, se deja como punto que el
usuario debe confirmar antes de construir las fases 3+.

## 1. Causa raíz del error

**Ubicación exacta:** `apps/costos/index.html` líneas 445-452.

```js
function comboShake(){return state.empaque.filter(e=>e.shake).reduce((a,e)=>a+(+e.costo||0),0);}
function comboFood(){return state.empaque.filter(e=>e.food).reduce((a,e)=>a+(+e.costo||0),0);}
function calcShake(r){let ins=0,prot=0;
  ...
  return finishCalc(ins,r,comboShake(),prot);}   // ← comboShake() no recibe "r"
function calcFood(r){let ins=0;...
  return finishCalc(ins,r,comboFood(),0);}        // ← comboFood() no recibe "r"
```

`comboShake()` suma el `costo` de **todos** los empaques del catálogo que
tengan el checkbox `shake = true` marcado, sin importar nada de la receta
`r` que se está costeando. `comboFood()` hace lo mismo con `food = true`.
`calcShake(r)`/`calcFood(r)` llaman a estas funciones **sin pasarles
ningún dato de la receta** — literalmente no hay forma de que el resultado
varíe entre un shake y otro, ni entre un shake de 16oz y uno de 20oz.

El checkbox vive en el catálogo general de Empaque (línea 347, 798-799):

```js
const emp=(nombre,costo,shake,food,ex={})=>Object.assign({...,shake,food,...},ex);
```

`shake`/`food` son banderas **globales por empaque**, no una relación por
receta. Marcar "Vaso 20oz → shake" no dice "el shake Chocolover usa este
vaso" — dice "súmale este vaso a *todos* los shakes que existan."

## 2. Tablas/estructuras afectadas

| Estructura | Afectada | Cómo |
|---|---|---|
| `app_data.data.empaque[].shake` / `.food` | ✅ Sí — es la causa raíz | Booleanos globales que deberían ser una relación por receta |
| `app_data.data.shakeRecipes[]` / `foodRecipes[]` | ✅ Sí — el efecto | No tienen ningún campo de empaques propio; dependen 100% del global |
| `productos` / `recetas` / `insumos` (esquema real de POS) | ❌ **No afectadas** — verificado en vivo | Ver §3 |
| `vw_costeo_producto` (vista real de costeo) | ❌ No afectada, y de hecho ya está bien diseñada | Ver §3 |
| Inventario real (`inventario_stock`), ventas reales, corte de caja | ❌ No afectados | El bug nunca llegó a tocar una venta real |

### Verificación de que el esquema real NO está contaminado

Se consultó `recetas` en vivo para los 17 shakes reales ya sincronizados a
`productos`:

```sql
select p.nombre, count(*) filter (where i.tipo='empaque') as n_lineas_empaque
from productos p join recetas r on r.producto_id=p.id join insumos i on i.id=r.insumo_id
where p.categoria_id in (select id from categorias where nombre ilike '%shake%')
group by p.nombre;
-- resultado: n_lineas_empaque = 0 para los 17 shakes, sin excepción
```

Se leyeron también `supabase/seed/etl-app-data.sql` (migración inicial,
aplicada 2026-07-02) y `supabase/seed/sync-app-data.sql` (sincronización
continua) completos, línea por línea: **ninguno de los dos inserta líneas
de empaque en `recetas`.** Ambos solo migran `ings[]` (ingredientes reales
con cantidad) y la proteína. El `README.md` de `supabase/seed/` afirma
("+ empaques `shake:true` como líneas") que sí lo hacen — **esa línea del
README es incorrecta/desactualizada**, no refleja el SQL real. Se corrige
en esta ronda (ver §7).

**Conclusión importante:** el bug **nunca llegó a afectar una venta real,
un descuento de inventario real, ni el costo mostrado en Admin/POS.**
Vive enteramente dentro de la calculadora de costosshake. Esto no lo hace
poco grave — el negocio toma decisiones de precio con esos números — pero
sí acota exactamente dónde hay que corregir.

### La vista real ya está bien diseñada — no hay que rediseñarla

```sql
-- vw_costeo_producto (ya en producción)
costo_empaque := sum(r.cantidad * i.costo_unitario) filter (where i.tipo = 'empaque')
costo_receta  := sum(r.cantidad * i.costo_unitario) filter (where i.tipo <> 'empaque')
```

Esto es **exactamente** el comportamiento correcto que pide el encargo: el
costo de empaque de un producto es la suma de *sus propias* líneas de
receta con insumos tipo `empaque` — no un global. El día que la sincronización
inserte líneas de receta reales para los empaques específicos de cada
producto, esta vista mostrará el número correcto sin ningún cambio
adicional. El problema no está en el esquema relacional — está en que
costosshake (el origen de los datos) nunca generó esas líneas por receta,
porque su propio modelo de datos (los checkboxes globales) no las tiene.

## 3. Recetas y productos afectados (datos reales, verificados hoy)

Estado real de `app_data` al momento de esta auditoría (`updated_at
2026-07-19`, `updated_by admin` — datos activos, no de ejemplo):

**27 empaques**, **17 shakes**, **7 alimentos** capturados.

Empaques marcados `shake = true` (9 de 27):

| Empaque | Costo |
|---|---|
| Vaso 20oz | $3.54 |
| Vaso Papel 16oz | $2.60 |
| Vaso 16oz | $2.40 |
| Tapa Boquilla | $1.71 |
| Tapa Domo | $1.03 |
| Fajilla | $0.99 |
| Tapa Vaso Papel | $0.95 |
| Popotes | $0.77 |
| Portavasos | $0.00 |
| **Suma (`comboShake()`)** | **$13.99** |

Empaques marcados `food = true`: **ninguno** (los 27 tienen `food:false`).
`comboFood()` = **$0.00** para los 7 alimentos.

**Efecto real hoy:**
- **Los 17 shakes** (Chocolover, Mr. Nutty, Dubai Pistachio Chocolate,
  Churro Crush, Blue Lagoon, Matcha Coco Cream, Golden Maca, Matcha Glow,
  Strawberry Vibes, Berry Açai Dream, Blueberry Bloom, Island Colada, Mocha
  Rush, Matcha Latte, Dirty Chai Latte, Horchata Latte, Choco Killer,
  Vanilla Bliss) están costeados con **$13.99 de empaque cada uno**, sin
  importar que unos usen vaso de 16oz y otros de 20oz, con o sin tapa
  domo/boquilla, con o sin popote. Un shake que en realidad solo debería
  llevar 1 vaso de 16oz + 1 tapa domo + 1 fajilla (~$4.42 real) está
  cargando **$13.99**, más de 3× su empaque real.
- **Los 7 alimentos** (Mediterranean Chicken, Turkey Fit, Honey Roast Deli,
  Smoky Chipotle Chicken, Fresh & Crunch Tuna, César Crunch, Mediterranean
  Tuna) están costeados con **$0.00 de empaque**, aunque en la realidad
  llevan charola/bolsa/papel/servilleta — su costo total está **subestimado**.
- Ninguno de los 17 shakes tiene todavía un `precio` de venta capturado en
  costosshake (`precio: ""` en los 17), así que margen/food-cost% no se
  ven todavía en pantalla para ellos, pero el **costo total** (`total` en
  `finishCalc`, que sí incluye el empaque inflado) se sigue calculando y
  es la base de `precio_sugerido` — es decir, si alguien usa "precio
  sugerido" para fijar el precio de venta de un shake nuevo, **ese sugerido
  ya viene inflado por los $13.99**.

## 4. Corrección propuesta

**No se corrige con un parche visual.** La corrección real tiene dos capas,
alineadas con lo que pide el encargo:

### 4.1 Dentro de costosshake (`apps/costos/index.html`)

1. Cada receta (`shakeRecipes[i]` / `foodRecipes[i]`) gana un arreglo propio
   `empaques: [[nombreEmpaque, cantidad], ...]` — mismo patrón que ya usan
   los ingredientes (`ings: [[nombre, cantidad], ...]`), no una estructura
   nueva que aprender.
2. `comboShake()`/`comboFood()` se eliminan. `calcShake(r)`/`calcFood(r)`
   suman el costo de `r.empaques` igual que ya suman `r.ings` — por receta,
   no global.
3. La pestaña "Empaque" pierde las columnas/checkboxes `shake`/`food` —
   el catálogo de empaque vuelve a ser solo catálogo (nombre, marca,
   proveedor, presentación, costo, stock), igual que ya son Proteínas o
   Ingredientes.
4. Cada tarjeta de receta (Costeo Shakes / Costeo Alimentos) gana una
   sección "Empaques" debajo de "Ingredientes", con el mismo patrón de
   fila que ya tiene ingredientes (selector + cantidad + costo unitario +
   subtotal + eliminar).

Esto es una corrección **quirúrgica**: no toca `ings[]`, no toca
proteínas, no toca bebidas/snacks, no toca el cálculo de merma/IVA/margen
— solo reemplaza de dónde sale el número `empaque` que entra a
`finishCalc()`.

### 4.2 Puente hacia el esquema real (`supabase/seed/`)

Agregar al ETL (`sync-app-data.sql`, y documentar en `etl-app-data.sql`
como referencia histórica) un paso que, por cada `shakeRecipes[i].empaques`/
`foodRecipes[i].empaques`, inserte una línea en `recetas` apuntando al
`insumo` tipo `empaque` correspondiente — mismo patrón que ya existe para
`ings[]`. `vw_costeo_producto` no necesita ningún cambio (§2).

## 5. Estrategia para corregir información histórica sin borrar datos

**No hay ventas históricas que corregir** — se verificó que el bug nunca
llegó a `recetas`/`inventario_movimientos`/`pagos`, así que no existe
ningún costo histórico de venta real contaminado por este error. Lo único
"histórico" que existe es el propio documento `app_data` (que no es un
historial transaccional, es el estado actual del catálogo).

Aun así, se sigue el mismo principio de no-destrucción de todo este
proyecto:

1. **No se borran los checkboxes `shake`/`food` de los empaques al migrar**
   — se leen una última vez para generar el reporte de qué productos
   tenían qué empaques marcados (`docs/reporte-impacto-empaques.md`,
   pendiente, ver checklist) y decidir la asignación correcta por receta
   de forma asistida, no automática silenciosa.
2. **No se reasignan automáticamente** los 9 empaques `shake:true` a cada
   shake — eso repetiría el mismo error con otro nombre. Cada shake debe
   quedar con **solo** su vaso/tapa/popote real, capturado a mano o de
   forma asistida con confirmación explícita (ver `docs/checklist-produccion.md`
   §24 del encargo original).
3. **El campo `costo` de cada empaque, su `kardex`, y el documento
   `app_data` completo permanecen intactos** — la migración solo agrega el
   arreglo `empaques: []` (vacío) a cada receta y dos flags/columnas nuevas
   se dejan de usar, nunca se eliminan del JSON existente (evita romper
   `migrate()` si alguien abre una versión vieja cacheada).
4. Antes de aplicar la corrección, se debe capturar un respaldo del
   documento actual (`state.backup()` ya existe en la UI — botón
   "⬇ Respaldar" — y además se puede exportar por SQL: `select data from
   app_data where id='hojaldraslily'`).

## 6. Recomendación sobre alcance (requiere confirmación antes de Fase 3+)

Esta auditoría separa el trabajo en dos niveles de riesgo muy distintos:

- **Fases 1-2 del encargo** (columnas de interfaz, eliminar checkboxes
  globales, empaques por receta dentro del JSON existente) son seguras de
  hacer **dentro del archivo único actual** — son cambios acotados,
  reversibles, y no requieren rediseñar la arquitectura.
- **Fases 3-4** (envío prorrateado con guardado atómico y vista previa
  obligatoria, historial de costos que nunca se sobrescribe, ledger con
  `correlation_id`, permisos granulares por acción, combos con
  disponibilidad en tiempo real) **piden garantías que un documento JSON
  con `UPDATE ... SET data = documento_completo` cada 500ms no puede dar
  de forma honesta.** Construirlas "encima" del blob actual sería
  simular atomicidad sin tenerla — exactamente el tipo de parche que se
  pidió evitar.

**No se tomó esta decisión unilateralmente.** Se deja como pregunta abierta
para antes de empezar la Fase 3: ¿se autoriza migrar el dominio de
compras/entradas/prorrateo de costosshake a tablas relacionales reales
(`entradas_compra`, `entrada_lineas`, `producto_empaques`) con RPCs
`SECURITY DEFINER` — el mismo patrón ya usado en todo el resto del
sistema — dejando el resto de costosshake (proteínas, ingredientes,
bebidas, snacks) tal como está por ahora? Es la única forma de cumplir
honestamente los criterios de aceptación #11-19 del encargo original.

## 7. Migraciones necesarias (resumen, se ejecutan en las fases siguientes)

Ninguna se aplicó todavía — quedan listadas para la Fase 2:

1. **Sin migración de base de datos para 4.1** — el arreglo `empaques[]`
   por receta vive dentro del JSON de `app_data`, no requiere `ALTER
   TABLE`.
2. **`supabase/seed/sync-app-data.sql`**: agregar el `INSERT INTO recetas`
   para `empaques[]` de cada shake/alimento (nuevo bloque, mismo archivo).
3. **`supabase/seed/README.md`**: corregir la fila de la tabla de mapeo que
   describe incorrectamente el comportamiento actual del ETL.
4. (Solo si se autoriza la Fase 3+ con tablas reales, ver §6): migraciones
   nuevas para `entradas_compra`, `entrada_lineas`, `producto_empaques`,
   funciones `fn_confirmar_entrada`/`fn_prorratear_envio`, con el mismo
   patrón de `SECURITY DEFINER` + validación de estado + idempotencia ya
   usado en `fn_cobrar_orden`/`fn_confirmar_venta`.

## 8. Qué sigue

Con esta auditoría aceptada, el siguiente paso es la **Fase 1** (columnas
de interfaz: Presentación, Marca en inventarios, Costo/Pza en Snacks,
Clave en vez de Código) — cambios de bajo riesgo, reversibles, sin tocar
la lógica de costeo. La Fase 2 (eliminar checkboxes globales + empaques
por receta) es el siguiente paso después, ya con el resultado de esta
auditoría como base. Fase 3+ espera confirmación de la pregunta en §6.

## 9. Fase 1 y Fase 2 — completadas

**Estado: implementado y probado.** Detalle operativo de cómo usar el
sistema ya corregido en `docs/empaques-por-receta.md`. Resumen de lo que
se hizo:

- **Fase 1** (`apps/costos/index.html`): columna Presentación en Empaque
  (persistida en el documento, no solo en pantalla); Entradas muestra
  marca/proveedor/importe y carga la presentación del catálogo
  automáticamente; Inventario Bodega/Kiosco muestra "Marca — Producto"
  para ingredientes de shakes/alimentos y bebidas/snacks (mismo patrón que
  ya tenían las proteínas — campos `marca`/`nombre` siguen separados en el
  dato, la unión es solo de vista); Snacks/Treats usa "Costo/Pza" y
  "Precio/Pza" (Bebidas conserva "Costo/Beb"/"Precio/Beb"); Inventario,
  kardex y exportaciones CSV usan "Clave" en vez de "Código" (la columna
  física `codigo` no se renombró, solo la etiqueta visible, tal como se
  pidió).
- **Fase 2**: eliminados los checkboxes globales `shake`/`food` del
  catálogo de Empaque — el catálogo ya solo guarda información del
  artículo. `comboShake()`/`comboFood()` (la causa raíz) se eliminaron.
  Cada receta de shake/alimento tiene ahora su propia sección "Empaques"
  (mismo patrón de fila que "Ingredientes": seleccionar, cantidad, costo
  unitario vigente, subtotal, eliminar) y `calcShake()`/`calcFood()` solo
  suman los empaques de **esa** receta (`recipeEmpaqueCost()`), probado
  explícitamente con dos recetas usando empaques distintos y con una
  tercera sin empaques (ver evidencia abajo). Se agregó un aviso de
  migración asistida en cada tarjeta de Costeo Shakes/Alimentos con
  cuántos productos siguen sin empaques asignados y qué solían sumarles
  los checkboxes anteriores — sin reasignar nada automáticamente. El
  puente ETL (`supabase/seed/sync-app-data.sql`) ahora sincroniza el
  arreglo `empaques[]` de cada receta hacia `recetas` reales (antes no
  sincronizaba empaques en absoluto, pese a que el README lo describía —
  corregido también).

### Evidencia de prueba

No fue posible una prueba de extremo a extremo en navegador en este
entorno (sin acceso de red saliente hacia el sitio desplegado ni hacia
Chrome for Testing) — verificado explícitamente, no asumido. En su lugar
se probó lo que sí se pudo probar con rigor:

- **Sintaxis**: `node --check` sobre el JS extraído del HTML, limpio.
- **Lógica del costeo, con Node ejecutando el JS real del archivo**
  (no una reimplementación aparte): 12 aserciones, todas correctas —
  incluida la prueba directa de que dos recetas con empaques distintos
  terminan con costos de empaque distintos y no comparten un total global;
  que una receta sin empaques asignados da $0 aunque otras ya tengan
  empaques; y que `migrate()` sobre datos con los checkboxes viejos
  (`shake:true`) ya no revive ese costo.
- **SQL del ETL actualizado**: corrida completa en modo simulacro
  (`begin; ... rollback;`) contra el proyecto real — sin errores,
  confirmado que no persistió ningún cambio.
- **Pendiente, honestamente**: una prueba manual en el navegador real
  (clic por clic) de las pantallas modificadas, y correr
  `sync-app-data.sql` de verdad una vez que se capturen empaques reales
  por receta — ninguna de las dos requiere código adicional, son pasos
  operativos que le tocan al usuario o a una sesión con acceso de red al
  sitio desplegado.

## 10. Corrección crítica encontrada al preparar la Fase 3

Antes de construir Fase 3 se releyó el mecanismo real de sincronización
para diseñar dónde enganchar el prorrateo de envío, y apareció un hallazgo
que **invalidaba parcialmente lo reportado como "completado" en la Fase 2**:
el arreglo de empaques se aplicó correctamente a
`supabase/seed/sync-app-data.sql`, pero ese archivo es un **script manual**
(se corre a mano, `psql` o `pnpm etl:aplicar`). La sincronización que
**sí corre sola**, en cada guardado de costosshake, vive en
`supabase/migrations/auto_sync_app_data_trigger.sql` (función
`fn_sync_app_data()`, enganchada al trigger `app_data_sync` sobre
`app_data`) — y esa copia **nunca se actualizó**. Sin este arreglo, un
operador podía seguir el manual de `docs/empaques-por-receta.md`, asignar
empaques a cada receta, guardar, y los empaques **seguirían sin llegar a
`recetas`** por la vía automática — solo llegarían si alguien corría el
script manual aparte, algo que no estaba documentado como necesario después
de guardar.

**Corregido** en
`supabase/migrations/costeo_fix_auto_sync_empaques.sql`: se reemplazó
`fn_sync_app_data()` (mismo patrón `create or replace function`, aditivo)
con la lógica de siempre más los dos bloques de empaques, idénticos a los
ya probados en el script manual. **Verificado en vivo** con una prueba de
transacción con `rollback` real contra producción: se agregó
temporalmente un empaque a la receta de "Choco Killer" dentro de
`app_data.data` (disparando el trigger real, sin ningún atajo), se
confirmó que apareció la línea nueva en `recetas` (`producto_id` de Choco
Killer + `insumo_id` del empaque, `tipo='empaque'`), y se revirtió todo
con `rollback` — cero residuo. A partir de esta migración, asignar
empaques en costosshake y simplemente guardar (sin correr nada a mano) sí
llega a `recetas` reales.

## 11. Fase 3 — completada: entradas de compra con prorrateo de envío

**Decisión tomada** (respuesta a la pregunta abierta de §6): se migró el
dominio de entradas de mercancía a tablas relacionales reales, con RPCs
`SECURITY DEFINER` como único camino de escritura — mismo patrón que
pagos/impresoras/empleados. El resto de costosshake (catálogos,
ingredientes, recetas) sigue en el documento JSON por ahora; solo el
dominio que necesitaba garantías atómicas y un historial que no se pueda
perder se movió.

Detalle completo del diseño, la fórmula de prorrateo y cómo se prueba en
`docs/prorrateo-envio.md`. Resumen:

- Tablas nuevas `entradas_compra`/`entrada_lineas`
  (`supabase/migrations/costeo_entradas_compra_prorrateo_envio.sql`), sin
  acceso directo para `anon`/`authenticated` — todo pasa por
  `fn_entrada_previsualizar` (pura, sin escritura), `fn_entrada_confirmar`
  (todo o nada, recalcula el prorrateo server-side, nunca confía en lo que
  mande el cliente), `fn_entrada_cancelar` (nunca borra, revierte con un
  movimiento de ajuste) y `fn_entrada_historial`.
- La pantalla "Entradas" de costosshake ahora tiene un paso obligatorio de
  **vista previa** (con el desglose por producto: cantidad, costo unitario
  de factura, envío prorrateado, costo unitario final, importe) antes de
  poder confirmar — no se puede saltar.
- Al confirmar, se actualiza `insumos.costo_compra` (el costo real más
  reciente, que ya alimenta `insumos.costo_unitario` — columna generada —
  y por lo tanto `vw_costeo_producto`/recetas) y se siembra una fila en
  `lotes` con el costo de esa compra específica, dejando la estructura
  lista para un futuro costo promedio ponderado (no calculado todavía, tal
  como se pidió: "utilizar inicialmente el último costo real unitario").
- El documento JSON de costosshake se sigue actualizando también (mismo
  stock/costo/kardex de siempre) para que Inventario/Kardex/Compras no
  cambien de comportamiento — pero ahora reflejan el costo **final**
  (factura + envío prorrateado), no solo el precio de factura.
- Probado en vivo contra producción, todo con datos de prueba
  eliminados/revertidos al terminar: fórmula de prorrateo (incluido el
  caso de $0 de subtotal y el ajuste de redondeo en la última línea para
  que la suma sea exacta al centavo), rechazo de clave incorrecta sin
  escribir nada, escritura atómica completa (línea, movimiento, lote,
  stock, insumo) verificada campo por campo, **dos confirmaciones
  concurrentes reales sobre el mismo insumo** (despacho paralelo genuino)
  sin pérdida de actualización (`stock_actual` quedó exactamente en la
  suma de ambas), y cancelación con reversa correcta.
- **Pendiente, honestamente**: prueba manual en navegador de las tres
  pantallas nuevas (captura → vista previa → confirmación) — mismo motivo
  que en Fase 1-2, sin acceso de red al sitio desplegado en este entorno.
  Cancelar una entrada capturada por error solo tiene RPC (`fn_entrada_cancelar`),
  todavía no un botón en la interfaz — ver `docs/prorrateo-envio.md`.
- **Fase 4 (combos) sigue sin empezar en este punto del documento** — ver
  §12, completada después.

## 12. Fase 4 — completada: Combos

Detalle completo del diseño en `docs/combos-promociones.md`. Resumen:

- Un combo es un `producto` normal (`es_combo = true`, mismo patrón que
  `es_reventa`) compuesto de otros productos vía `combo_items` — se
  vende, descuenta inventario, cuesta e imprime exactamente igual que
  cualquier producto, sin tocar `fn_crear_orden`/`fn_cobrar_orden`/
  `fn_descontar_inventario_por_orden`.
- Su receta se materializa sola (suma de las recetas de sus componentes)
  y se **recalcula automáticamente** cada vez que cambia la receta de
  cualquier producto que sea su componente — así nunca hereda un costo
  incorrecto, que era la preocupación explícita de este mismo encargo.
- Disponibilidad en tiempo real de un solo sentido: un componente que se
  desactiva apaga el combo automáticamente; reactivar el componente no
  reactiva el combo solo.
- Limitación v1 documentada: un combo solo puede combinar productos de la
  misma estación (Alimentos o Bebidas, no ambas) — evita tocar el
  subsistema de impresión/KDS ya endurecido en la ronda de seguridad
  anterior; ver el porqué en `docs/combos-promociones.md`.
- Admin → Combos (pantalla nueva) para crear combos y gestionar sus
  componentes.
- Probado contra producción con datos revertidos: materialización de
  receta, rechazo de auto-referencia/anidado/mezcla de estación,
  recálculo en cascada, desactivación en cascada de un solo sentido, y
  dos hallazgos de seguridad de `get_advisors` corregidos antes de cerrar
  (vista con semántica SECURITY DEFINER, funciones internas con EXECUTE
  público de más). `pnpm audit:production` en verde.
- Pendiente honesto: prueba manual en navegador (mismo motivo que las
  fases anteriores — sin acceso de red en este entorno).
