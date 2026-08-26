# Hojaldras Lily — memoria del proyecto

Este archivo es para quien retome el trabajo (yo incluido, en otra sesión):
qué está vivo, cómo se opera y **qué trampas ya nos costaron caro**. Los
detalles temáticos viven en `docs/` (42 documentos); esto es el mapa.

**Este repo es la réplica del sistema de Shakeaholic para Hojaldras Lily**
(ver `docs/replicar-el-sistema.md`). El motor es idéntico; cambió la
identidad (`packages/brand`), los textos visibles, el proyecto Supabase y
el dominio. Las trampas documentadas abajo se aprendieron con la tienda
original abierta: siguen aplicando tal cual.

**Estado: pre-apertura.** La base `fzkdgqqvfkogmxdgqsxj` ya tiene el
esquema completo replicado; falta capturar el catálogo real en Costos,
configurar Cloudflare Pages/dominios, la terminal Clip de Lily y el
hardware del local (ver `docs/dia-de-instalacion.md`).

---

## 1. Qué es esto

Panadería de hojaldras en Mérida (Col. Miguel Alemán). Monorepo pnpm,
9 apps sobre un solo Supabase (`fzkdgqqvfkogmxdgqsxj`), desplegadas a
Cloudflare Pages por GitHub Actions al hacer push a `main`.

| App | Dominio | Quién la usa |
|---|---|---|
| `web` | `hojaldraslily.com` | El público (menú vivo, QR de Rewards) |
| `kiosko` | `kiosko.hojaldraslily.com` | Cliente y cajero en la barra |
| `pos` | `caja.hojaldraslily.com` | Caja (abrir turno, cobros manuales) |
| `cocina-bebidas` | `barra.hojaldraslily.com` | Estación de barra |
| `cocina-alimentos` | `cocina.hojaldraslily.com` | Estación de cocina |
| `cliente-display` | `pantalla.hojaldraslily.com` | TV de folios |
| `admin` | `admin.hojaldraslily.com` | Gerencia |
| `cliente-pwa` | `rewards.hojaldraslily.com` | Celular del cliente (y la app de TestFlight) |
| `costos` | `costos.hojaldraslily.com` | Costeo e inventario (HTML plano) |

Los dominios de la tabla son el plan para Lily; los proyectos de
Cloudflare Pages (`lily-*` en el workflow) se crean solos en el primer
deploy con los secretos configurados. `api.hojaldraslily.com` (dominio
propio de Supabase) es un add-on que aún no se contrata: el mapa
`DOMINIO_PROPIO` en `packages/supabase/src/client.ts` está vacío a
propósito hasta entonces.

---

## 2. Las cinco cosas que hay que entender

### 2.1 Costeos es la fuente de la verdad del catálogo

`apps/costos` (un solo `index.html`, sin build) guarda TODO en una fila de
`app_data.data` (JSON). Al guardar, un trigger corre `fn_sync_app_data()`,
que crea/actualiza productos, insumos y recetas.

Consecuencias que hay que respetar:

- **Renombrar un producto desde Admin no sirve** para lo que viene de
  Costeos: el siguiente guardado lo revierte. Los scoops y suplementos se
  renombran EN COSTEOS.
- El renombre se ancla en la **Clave** (`codigo`). Sin Clave, el nombre
  nuevo no empata con nada: nace un producto vacío y el viejo se apaga —
  el producto se parte en dos y pierde sus extras. Por eso Costeos asigna
  Clave sola al guardar, y el ancla exige que la Clave sea única *dentro
  de su especie* (el scoop y el bote de una misma fila la comparten).
- **Guardar y publicar ya no son lo mismo.** Guardar sincroniza el catálogo
  (se sigue costeando con datos reales); **"Mostrar en el kiosko"** enseña
  el diff — altas, bajas, renombres, precios, combos — y al confirmar toca
  el timbre de las pantallas. Ojo: las pantallas leen `productos` **en
  vivo**, así que publicar sincroniza *cuándo* lo ven, no congela lo que
  ven; un reinicio del kiosko también trae lo no publicado.
- **El precio es la intención de venta**: `precioScoop` > 0 lo vende por
  scoop, `precioBote` > 0 vende el bote. El sufijo `- B` / `- R` en el
  sabor es legado que sigue funcionando, pero ya no hace falta.

### 2.2 El dinero se calcula en el servidor, siempre

`fn_crear_orden` recalcula precios y total desde `productos.precio`;
`fn_cobrar_orden` valida el monto contra ese total y es idempotente. El
cliente no manda precios. Nunca abras un camino que permita aprobar un
pago por INSERT directo.

### 2.3 Clip: la verdad se pregunta, no se escucha

El webhook `PINPAD_INTENT_STATUS_CHANGED` **no viene firmado**: es un
timbre, no una fuente. El estado real siempre se consulta autenticado.

Rutas reales de la API (descubiertas probando en producción, **no están en
la documentación de Clip**):

```
POST   https://api.payclip.io/f2f/pinpad/v1/payment
GET    .../payment?pinpadRequestId={id}     ← camelCase, como query
DELETE .../payment/{id}                     ← el id va en la ruta
```

`GET /payment/{id}` **no existe** y `?pinpad_request_id=` (snake_case) da
`ERROR_BODY_STRUCTURE`. Ese detalle causó los dos bugs de las primeras
ventas reales: cobros que se quedaban "esperando confirmación" y
cancelaciones que no llegaban a la terminal.

El campo `reference` **solo acepta alfanuméricos y guiones** — se normaliza
con NFD + quitar acentos + no-alfanumérico → guion.

Red de seguridad: webhook + sondeo del kiosko + barrido cada 2 minutos
(`clip-barrer-pendientes`). Un cobro no se pierde.

### 2.4 La impresión vive fuera de la nube

`agente-impresion/` es un programa Node que corre **en la PC de la tienda**
y habla TSPL con dos etiquetadoras de red. Sin esa ventana abierta, las
pantallas muestran comandas pero **no sale papel**.

- Reclama trabajos con `fn_imprimir_reclamar_trabajos` y late con
  `fn_imprimir_latido`, que ahora **reporta su versión** — visible en
  Admin → En vivo junto a cada impresora. Si dice ámbar, falta actualizar.
- La etiqueta lleva familia + nombre (`Kombucha - Limonada Durazno`) pero
  **Shakes va sin familia** (`#1 Chocokiller`), y **el tamaño del vaso no
  se imprime**: vive solo en pantalla.
- Si el agente "acepta datos y no imprime", el problema es físico
  (papel/tapa/sensor): el autotest con FEED al encender lo confirma.

### 2.5 La identidad es una sola, y vive en `packages/brand`

`packages/brand/tokens.css` es la **fuente de la verdad**: los colores y
las tres tipografías. Las 8 apps de Vite lo importan en su `index.css`, así
que heredan la marca sin hacer nada.

- **Bagel Fat One** (display) · **DM Sans** (cuerpo) · **DM Mono** (cifras
  y etiquetas chicas).
- Verde `#2C4A3E`, verde profundo `#1A2E26`, tinta `#14241D`, crema
  `#E8E6CC`, y los acentos de sabor (plátano `#F0C649`, fresa `#E04E5C`,
  menta `#88C0A0`…) **uno por superficie**, nunca varios.

**La regla de tamaños, tomada del kiosko**: la display se usa de **18 px
para arriba** (títulos y cifras grandes); abajo de eso va DM Sans, y los
números y etiquetas en versalitas van en DM Mono. Bagel Fat One solo
existe en **un peso**: pedirle `font-weight: 700` hace que el navegador la
engorde sola y se ve emborronada.

**Las dos excepciones que hay que vigilar**, porque no pasan por el
empaquetador y se desvían solas:

- `apps/costos/index.html` — HTML plano. Copia los valores a mano en su
  bloque `:root`. Ya se desvió una vez (usaba Fredoka + Inter y una paleta
  verde-olivo); si se toca `tokens.css`, hay que copiarlo aquí.
- `apps/web` — carga las fuentes con su propio `<link>`.

### 2.6 La PC de la tienda se mantiene sola

- `scripts/instalar-todo.bat` — una vez por PC. Va **partido en dos
  mitades a propósito**: la que instala corre elevada, la que deja el
  arranque y el escritorio corre como el usuario de la caja. Al elevarse,
  Windows puede cambiar de usuario y `%APPDATA%` apunta a otro perfil —
  ahí se guardaba el arranque automático, en un perfil que nadie abre. Por
  eso una PC quedó configurada "[OK]" y no abría nada al prender.
- `scripts/instalar-inicio.ps1` — la mitad de usuario. Crea accesos
  directos `.lnk` con icono (minimizados), resuelve Escritorio e Inicio
  **desde el registro** (con OneDrive, las rutas de siempre no existen) y
  además registra `HKCU\...\Run` como segunda red.
- `scripts/abrir-hojaldraslily.bat` — el del día a día. **El orden importa**:
  espera internet → arranca el agente → abre pantallas → *y hasta el final*
  busca actualización. Antes la actualización iba primero, y su ventana de
  permiso dejaba la tienda cerrada si nadie estaba ahí para aceptarla.
- `scripts/pantallas.ps1` — acomoda cada app en su monitor. **No hay
  coordenadas escritas a mano**: le pregunta a Windows dónde están los
  monitores y reparte por tamaño (el grande es del cliente, los dos chicos
  son las estaciones, izquierda = bebidas). Después **empuja** cada ventana
  con `SetWindowPos`, porque Chrome recuerda en el perfil la última
  posición e ignora `--window-position`. Escape: `C:\Hojaldras Lily\pantallas.txt`
  con `kiosko=1` / `bebidas=2` / `cocina=3` manda sobre el automático.
  Cada arranque deja su bitácora en `C:\Hojaldras Lily\ultimo-arranque.log`.
- `scripts/abrir-caja-y-admin.bat` — POS y Admin, que ya no van en el
  arranque (el turno se abre desde el kiosko).
- Los `.bat`/`.ps1` deben ser **ASCII puro**:
  `node scripts/verificar-scripts-ascii.mjs` lo verifica.

---

## 3. Operación diaria (lo que le dices al negocio)

| Situación | Qué hacer |
|---|---|
| Abrir la tienda | Nada: la PC arranca todo sola |
| Abrir/cerrar caja o cambiar turno | **5 toques a Milo** en el kiosko → PIN |
| Cambiar precios o productos | Costeos → **Guardar**, y cuando esté listo → **"Mostrar en el kiosko"** (enseña qué va a cambiar antes de confirmar) |
| Ver la tienda a distancia | Admin → **En vivo** |
| Algo se siente raro | Admin → **Diagnóstico** |
| Actualizar el agente de impresión | Solo, al abrir el día siguiente |

---

## 4. Trampas que ya nos costaron (no repetir)

**Postgres**

- `create or replace view` **borra las reloptions**: hay que volver a
  declarar `with (security_invoker = true)` o la vista queda insegura en
  silencio.
- Cambiar la firma de una función **no la reemplaza: la duplica**. Hubo
  tres `fn_crear_orden` viejas conviviendo que no cobraban sobreprecios.
  Al cambiar parámetros, `drop function` de la firma anterior.
- `UPDATE ... FROM LATERAL` no puede referenciar la tabla destino; usar CTE.
- Un `update ... from` que empata **por nombre** le pega a TODAS las filas
  con ese nombre. En `fn_sync_app_data` eso ponía `activo = precio > 0` en
  el duplicado también, o sea **resucitaba** el que alguien acababa de
  apagar: apagarlo a mano no servía de nada. Se arregló limitando el
  update a una sola fila por nombre (`p.id = (select … limit 1)`).
- **Primero se arregla quien crea el conflicto, después se pone el
  candado.** Poner el índice único por nombre antes de arreglar ese update
  hacía fallar el guardado entero de Costeos — y dejar a la tienda sin
  poder guardar precios es peor que el duplicado que se quería evitar.
  Igual con `on conflict`: si el índice al que apunta no existe, Postgres
  rechaza la sentencia completa. Los dos van juntos o ninguno.
- Para parchear una función grande sin reescribirla: leer
  `pg_get_functiondef`, **verificar que el ancla aparece exactamente N
  veces**, reemplazar y `execute`. Si el ancla no cuadra, abortar — así el
  parche falla ruidosamente en vez de corromper la función.

**Indicadores**

- Un indicador que **no puede volver a verde** deja de leerse. "Comandas
  que fallaron: 21" contaba historia de julio irreimprimible. Las métricas
  de salud llevan ventana de tiempo (24 h / 7 días).
- Cuenta solo lo accionable: "ventas sin comanda" bajó de 16 a 3 al excluir
  las categorías que a propósito no van a pantalla.

**Frontend**

- El kiosko **no se recarga a media venta**: la señal de recarga espera a
  que la pantalla esté en el menú y sin carrito.
- Un error que aparece y se va solo en un segundo es peor que ningún
  error: si algo se recupera con un reintento, reintenta en silencio
  (fue el rojo del login de Rewards).
- En el kiosko, las imágenes van como fondo CSS y el menú contextual está
  apagado: si no, mantener el dedo sobre Milo abre "buscar imagen".

**Este entorno**

- Si `git push` falla con *"could not read Username"*: el proxy inyecta la
  credencial pero git no sabe qué usuario mandar. Ya hay un
  `credential.helper` configurado; si se pierde, se arregla con un helper
  que responda `username=x-access-token` y `password=$GITHUB_TOKEN`.
- El proxy bloquea `*.pages.dev` y algunos dominios externos. Para
  verificar producción: consultar la base, o hacer la petición desde
  Supabase (pg_net / Edge Function).
- Al subir por la API de GitHub, **verifica el árbol contra el local**
  (`git diff HEAD origin/rama`): una subida parcial pasa desapercibida.

---

### 2.7 La app del cliente se compila en la nube

`.github/workflows/testflight-ios.yml` la sube a TestFlight desde un
runner de macOS: **no hace falta una Mac**. Cuatro secrets (llave de App
Store Connect + Team ID) y ningún certificado — `xcodebuild
-allowProvisioningUpdates` los crea solo. Por eso puede correr en la nube:
no hay un `.p12` que alguien tenga que exportar de su llavero.

El proyecto nativo **no se versiona**: se regenera en cada corrida desde
`capacitor.config.ts` + `scripts/app-nativa-preparar.sh`. Ese script pone
los tres ajustes que Capacitor no pone solo, y el primero es el que más
duele si falta: sin el **URL Type** `com.hojaldraslily.rewards`, el login de
Google termina bien y el teléfono no sabe a qué app devolver el resultado
— sin ningún mensaje de error.

Para retomar solo Rewards en otra sesión, el mapa está en
`docs/rewards-donde-vamos.md`; el detalle, en `docs/rewards-app-nativa.md`,
`docs/monedero-y-sellos.md` y `docs/metas-y-perfil.md`.

---

## 5. Seguridad

- Las llaves van en **Supabase Edge Function Secrets**, nunca en el repo ni
  en el chat. El `service_role` jamás dentro de SQL (quedaría legible).
- La llave publicable y el JWT anon **son públicos por diseño** (viven en
  el frontend). La seguridad real está en RLS y en las funciones.
- El personal entra con PIN → `staff-login` (Edge) → sesión real de
  Supabase Auth. `fn_es_jefe()` distingue gerencia; **no basta con
  `authenticated`**, porque un cliente de lealtad también lo es.
- Repo público: nada de costos, márgenes ni proveedores en git. Los
  respaldos `respaldo-costosshake-*.json` están en `.gitignore`.

---

## 6. Cómo trabajar aquí

```bash
pnpm --filter @shake/<app> build   # compila y verifica tipos
pnpm -r test                       # pruebas de packages
cd agente-impresion && npx vitest run
node scripts/verificar-scripts-ascii.mjs
```

Rama de trabajo `claude/hojaldraslily-pos-ecosystem-z9imgr`, y se mezcla a
`main` (eso dispara el despliegue). Las migraciones se aplican con el MCP
de Supabase **y** se guardan en `supabase/migrations/` como registro.

Antes de decir "quedó": compruébalo contra producción. Casi todo se puede
verificar con una consulta — quién cobró, si la comanda salió, si el
agente late, si el renombre partió un producto en dos.
