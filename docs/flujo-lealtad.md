# Flujo de lealtad — Hojaldras Lily Rewards

Basado en el fundamento del cliente. Implementado de forma **aditiva** sobre
el mismo Supabase (no toca `app_data`/`app_users`).

## ¿Ocupamos QR? — Configuración decidida

**Identificador real = teléfono. El QR es una comodidad, no un requisito.**
No hace falta tarjeta física ni hardware especial.

- Cada cliente tiene un **código estable** `SHK-XXXXXX` (columna `clientes.codigo`,
  autogenerado en la base). Ese código se muestra como **QR** en la PWA del
  cliente (fase posterior) y/o se puede imprimir en un ticket/sticker.
- En caja, el cajero **teclea el teléfono** o **escanea el QR**. Un lector QR
  USB (o la cámara de la tablet) actúa como teclado y "escribe" el código:
  `identificarCliente(sb, telefonoOCodigo)` resuelve ambos casos (detecta
  el prefijo `SHK-`).
- Cada **cupón** tiene su propio código `CUP-XXXXXXXX` (también QR): en caja
  se escanea/teclea y `canjearCupon()` valida vigencia y lo marca usado.

**Hardware mínimo**: nada nuevo obligatorio. Opcional: un lector QR/código de
barras USB (los hay ~$300–600 MXN) para agilizar; sin él, se teclea el teléfono.

## Modelo de datos (aditivo)

- `clientes` + `codigo` (QR), `fecha_nacimiento`, `sabor_favorito`, `mancuernas` (saldo).
- `mancuernas_movimientos` — ledger: cada ganancia/canje/ajuste/promo.
- `cupones` — `tipo` (mancuernas | cumpleanos), `codigo`, `estado`
  (activo/usado/expirado/cancelado), `beneficio`, `vence_en`, `usado_en`.

## Reglas implementadas (en la base, a prueba de fallos del frontend)

- **Acumulación** (`trg_acumular_mancuernas` al pagar una orden con cliente):
  1 mancuerna por cada $10, **tope 100 por transacción**.
- **Cupón a 100**: al acumular ≥100, se genera cupón (vigencia **1 año**) y se
  descuentan 100 mancuernas. Respeta **máx 5 cupones activos** (sin contar
  cumpleaños). Verificado e2e: $1200 → 100 mancuernas → 1 cupón → saldo 0.
- **Cupón de cumpleaños** (`fn_generar_cupones_cumpleanos()`): shake gratis
  (proteína a elegir, sin galletas), vence el último día del mes,
  condicionado a compra el mes anterior, 1 por año. **Requiere programar** el
  día 1 de cada mes (ver abajo).
- **Canje** (`canjearCupon`): valida activo + vigente + lo liga a la orden.

## Uso desde el POS (ya conectado)

En el cobro del POS hay un panel "Cliente": teclea teléfono o escanea QR →
muestra nombre, mancuernas y cupones activos. Al cobrar, la orden se liga al
cliente y la base acumula las mancuernas automáticamente (el ticket confirma
cuántas ganó).

## Jobs programados (pg_cron) — ✅ activos

Extensión `pg_cron` habilitada. Jobs (ver `cron.job`):

| Job | Programación | Acción |
|---|---|---|
| `cupones-cumpleanos` | día 1, 06:00 UTC | `fn_generar_cupones_cumpleanos()` |
| `cupones-expirar` | diario 05:00 UTC | `fn_expirar_cupones()` (marca vencidos) |
| `lealtad-reactivacion` | lunes 06:00 UTC | `fn_reactivacion()` (+5 mancuernas a inactivos 30 días) |

Reprogramar/pausar: `select cron.schedule('nombre', '<cron>', $$...$$);` /
`select cron.unschedule('nombre');`. Los envíos de notificación
(recordatorio 3 días antes, avisos) requieren un canal (email/push) vía
edge function + `pg_net`; el dato ya está listo, falta el emisor.

## PWA del cliente — ✅ `apps/cliente-pwa`

App instalable (manifest) con **registro/login por Google** (Supabase Auth).
Al entrar, vincula el usuario con su ficha de cliente (`clientes.auth_user_id`)
y muestra: saldo de mancuernas, barra "para tu próximo cupón", su **QR**
(`codigo`, generado local con `qrcode`, sin llamadas externas) y sus cupones
activos (cada uno con su QR de canje). Puerto dev 5187.

### ⚠️ Configuración de Google (una sola vez, la haces tú)

Requiere credenciales que solo tú puedes crear:

1. **Google Cloud Console** → crea un OAuth 2.0 Client ID (tipo Web).
   - Authorized redirect URI: `https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/callback`
2. **Supabase → Authentication → Providers → Google**: pega Client ID y
   Client Secret, habilita.
3. **Supabase → Authentication → URL Configuration**: agrega la URL donde
   sirvas la PWA (dev `http://localhost:5187`, y tu dominio en producción) a
   *Redirect URLs*.

Sin esto, el botón "Continuar con Google" dará error de proveedor no
habilitado; todo lo demás (mancuernas, cupones, POS/kiosko) funciona igual.
- **Promociones personalizadas** (por sabor/frecuencia/horario): motor de
  segmentación + tabla `promociones`. Aditivo.
- **Balizas de proximidad (beacons BLE / Google Nearby)**: **requieren una app
  móvil nativa + hardware de balizas**; fuera del alcance del POS web. Se
  integra cuando exista la app móvil; el backend de ofertas es aditivo.
## Canje de cupón en el cobro — ✅ POS y kiosko

En el cobro del POS y del kiosko se puede aplicar un cupón: de la lista de
cupones activos del cliente identificado, o escaneando/tecleando su código
`CUP-…` (en el POS). El cupón **cubre gratis el ítem elegible más caro** del
ticket (el de cumpleaños solo aplica a un **Shake**), se refleja como
descuento en el total y, al cobrar, se marca **usado** y se liga a la orden
(`canjearCupon`). El inventario se descuenta por receta igual (el descuento
no afecta el consumo de insumos). Verificado e2e.

Regla de valor del cupón: hoy = "un ítem gratis" (el más caro elegible). Si
el negocio prefiere un monto fijo o % por el cupón de 100 mancuernas, se
ajusta agregando `cupones.valor` (aditivo) — decisión pendiente del negocio.

## Cierre de escrituras — ✅ antes de abrir Google

Migración `supabase/migrations/lealtad_cierre_escrituras.sql`.

Hasta ahora las tres tablas de lealtad estaban abiertas a cualquiera que
tuviera la anon key (que es **pública por diseño**: viaja en el JavaScript de
las apps). Mientras nadie usaba lealtad no se explotaba, pero en cuanto se
enciende el login de Google y Rewards queda al alcance del celular de cada
cliente, esto era alcanzable desde la calle:

| Agujero | Qué permitía |
|---|---|
| `upd_clientes` era `USING (true)` sin `WITH CHECK` | `update clientes set mancuernas = 999999` → cupones infinitos |
| `upd_cupones` era `USING (true)` | volver a `activo` un cupón ya usado y canjearlo otra vez |
| `SELECT` abierto en las tres tablas | leer el padrón completo: nombre, teléfono, correo, cumpleaños |
| `fn_reactivacion()` y `fn_generar_cupones_cumpleanos()` ejecutables por `anon` | forzar el reparto de puntos y cupones cuando quisieras |

Se cerró con el mismo patrón que ya usa el resto del sistema — `SECURITY
DEFINER` como única vía de escritura y la tabla sin GRANT — no con validación
en el frontend, que el atacante se salta llamando al REST directo.

**Escrituras, ahora solo por RPC:**

| Función | Qué garantiza el servidor |
|---|---|
| `fn_cliente_registrar` | `mancuernas = 0`, `activo`, rechaza teléfono repetido |
| `fn_cliente_actualizar` | toca **solo** contacto; no saldo, código, `auth_user_id` ni `activo` |
| `fn_cliente_desactivar` | baja lógica, nunca borra |
| `fn_vincular_cliente_auth` | la identidad sale de `auth.uid()` y del correo del token, **no** de un parámetro |
| `fn_canjear_cupon` | un solo `UPDATE` condicional → dos cajas no pueden canjear el mismo cupón |

**Lecturas:** caja (anon + PIN) sigue viendo el padrón para poder identificar
por teléfono. Un cliente logueado desde su celular ve **solo lo suyo**.

### Vincular la cuenta de Google

`fn_vincular_cliente_auth` es idempotente y, si el cliente ya estaba dado de
alta en caja con ese mismo correo, **reclama esa ficha** en vez de crear una
segunda: conserva sus mancuernas y sus cupones. El correo lo toma del token
verificado de Google, así que nadie puede reclamar la ficha de otro. Un índice
único parcial sobre `auth_user_id` garantiza una cuenta = una ficha.

### Verificación

Probado en vivo contra producción con `begin; … rollback;`, poniéndose el rol
`anon` y el rol `authenticated` con un JWT simulado:

- 4/4 escrituras directas de `anon` → `permission denied`.
- 3/3 trabajos de reparto (`fn_reactivacion`, cumpleaños, expirar) → bloqueados
  para `anon`, siguen corriendo desde `cron` (que va como dueño).
- Doble canje del mismo cupón → *"El cupón ya fue usado"*.
- Alta con teléfono repetido → rechazada.
- Cliente que ya existía en caja entra con Google → **misma ficha, sus 80
  mancuernas intactas**; segundo login no duplica.
- Cliente B no ve ni puede editar la ficha de A.
- Orden de $480 cobrada con cliente identificado → **48 mancuernas y 1
  movimiento**, con el trigger ya revocado (revocar `EXECUTE` no lo apaga).
