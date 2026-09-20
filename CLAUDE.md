# Hojaldras Lily — memoria del proyecto

Este archivo es para quien retome el trabajo (yo incluido, en otra sesión):
qué está vivo, cómo se opera y **qué trampas ya nos costaron caro**. Los
detalles temáticos viven en `docs/` (53 documentos); esto es el mapa.

**Este repo es el sistema de Hojaldras Lily**, replicado de un motor que
ya opera en producción en otro negocio (ver `docs/replicar-el-sistema.md`).
Cambió la identidad (`packages/brand`), los textos visibles, el proyecto
Supabase y el dominio. Las trampas documentadas abajo se aprendieron con
la tienda original abierta: siguen aplicando tal cual.

**Estado: pre-apertura, con el motor ya probado.** La base
`fzkdgqqvfkogmxdgqsxj` tiene las 132 migraciones del historial canónico
aplicadas en orden, más cinco de adaptación al giro. Ya corrió una venta
de punta a punta contra ella (total calculado en el servidor, monto falso
rechazado, doble cobro rebotado, comandas por estación y corte cuadrando);
el catálogo semilla de hojaldras está sembrado y las Edge Functions
desplegadas.

Lo que falta para abrir, todo fuera del código:

1. **Decidir la terminal, y sus secretos.** Clip ya está escrito y probado;
   solo faltan sus tres secretos en Supabase (`CLIP_API_KEY`,
   `CLIP_WEBHOOK_SECRET`, `CLIP_TERMINAL_SERIAL`). Si al final es **Banorte**,
   el camino es otro y hay que preguntarle cosas al banco primero: el análisis
   está en `docs/terminal-banorte.md` y la hoja de qué pedir —con el correo
   listo para el ejecutivo— en `docs/banorte-que-pedir.md`. Cambiar de proveedor **no toca ninguna
   pantalla** — para eso existe `PaymentProvider` en `packages/payments`.
2. **Cloudflare Pages y dominios** — los proyectos `lily-*` se crean solos
   en el primer push a `main` con los secretos del workflow puestos.
3. **Costos, recetas y proveedores en Costeos.** La **lista de precios** ya
   es la de la casa (mostrador y Rappi, con la "X" de lo que no va en la
   plataforma), y el **inventario** ya son los 99 insumos reales con su
   presentación. Lo que sigue faltando es lo que la hoja no traía: **cuánto
   cuesta** cada insumo, **qué lleva** cada pan y **a quién** se le compra.
   Sin eso, Costeos no puede costear y el inventario no se descuenta solo al
   vender — hay que contarlo a mano.
   Falta también **ponerle mínimo** a las cosas: la lista de compra sale de
   comparar contra el mínimo, y todo arranca en cero.
   Y el **menú de temporada** (pan de muerto, rosca de reyes) está sembrado en
   ceros y apagado, tal como venía en la hoja: cuando llegue la temporada se
   captura el precio y se prende.
4. **PIN del personal y hardware del local** (ver `docs/hardware.md` y
   `docs/dia-de-instalacion.md`).

**Cómo va todo, con números contra la base:** `docs/estado-del-pos.md`. Ahí
está también la comparación tabla por tabla contra Shakeaholic — qué no se
trajo y por qué. **Las tres que faltaban ya están**: pago mixto, prueba de
impresión desde Admin y cerrar sesión de verdad en Costeos (§2.8).

**La vitrina para enseñar el sistema** vive en
<https://eleevatemx.github.io/hojaldraslily/>: las 9 apps compiladas contra
la base real, para mostrarlas desde cualquier navegador sin instalar nada.
La arma sola `.github/workflows/pages-demos.yml` con
`scripts/publicar-demo-pages.sh` en cada push; los artefactos no se
versionan (`demo/app/` está en `.gitignore`).

**Ojo con eso antes de abrir**: esa portada trae los PIN a la vista a
propósito, porque su razón de ser es enseñar el sistema. Son PIN de
demostración (gerencia y caja) y hay que **cambiarlos** —y bajar la
vitrina, o al menos el Admin y la caja— el día que la tienda tenga ventas
de verdad. El despliegue serio es el de Cloudflare Pages con dominios
propios, que es otro workflow.

Nota de mantenimiento: `packages/types/src/database.ts` sigue vigente. Las
cinco migraciones de adaptación no cambian estructura (solo datos,
reloptions y `search_path`), así que no hubo que regenerarlo.

---

## 1. Qué es esto

Panadería de hojaldras en Mérida (Col. Miguel Alemán). Monorepo pnpm,
9 apps sobre un solo Supabase (`fzkdgqqvfkogmxdgqsxj`), desplegadas a
Cloudflare Pages por GitHub Actions al hacer push a `main`.

| App | Dominio | Quién la usa |
|---|---|---|
| `web` | `hojaldraslily.com` | El público (menú vivo, encargos) |
| `kiosko` | `kiosko.hojaldraslily.com` | Cliente y cajero en la barra |
| `pos` | `caja.hojaldraslily.com` | **C** — la caja: turno, cobros y encargos |
| `produccion` | `produccion.hojaldraslily.com` | **P** — los panaderos (arman los moldes) |
| `horno` | `horno.hojaldraslily.com` | **H** — quien hornea (mete, vigila y saca) |
| `empaque` | `empaque.hojaldraslily.com` | **E** — quien empaca y entrega los encargos |
| `cliente-display` | `pantalla.hojaldraslily.com` | TV de folios |
| `admin` | `admin.hojaldraslily.com` | Gerencia |
| `costos` | `costos.hojaldraslily.com` | Costeo e inventario (HTML plano) |

Los dominios de la tabla son el plan para Lily; los proyectos de
Cloudflare Pages (`lily-*` en el workflow) se crean solos en el primer
deploy con los secretos configurados. `api.hojaldraslily.com` (dominio
propio de Supabase) es un add-on que aún no se contrata: el mapa
`DOMINIO_PROPIO` en `packages/supabase/src/client.ts` está vacío a
propósito hasta entonces.

---

## 2. Las cinco cosas que hay que entender

### 2.0 Hay DOS inventarios, y no son lo mismo

- **Insumos** (Admin → Inventario): harina, manteca, queso, bolsas, etiquetas
  y cajas — los **99 renglones de la hoja del negocio**, en seis grupos. Se
  **cuenta en la presentación** (sacos, cubetas, cartones de 30 huevos), no en
  gramos: quien cuenta el almacén cuenta sacos, y un sistema que le pide
  gramos es un sistema que nadie llena. Tiene conteo físico, merma con motivo,
  mínimos y lista de compra.
- **Cuadros por sabor** (Admin → **Producción**): la unidad real. El pan sale
  en **moldes de 48 o de 24 cuadros** y de ahí se cortan los paquetes conforme
  se venden — cuatro de 12, dos de 24, uno de 48, o mezclado. Por eso venden
  pan del día: **no se comprometen a un tamaño hasta que alguien lo pide**.

**El tamaño del molde va por RENGLÓN, no en un parámetro global.** Vive en
`orden_produccion_items.cuadros_por_molde` (con `check in (24, 48)`), porque
en una misma hornada caben tres moldes de 48 de guayaba y dos de 24 de queso:
un solo número para toda la casa obliga a mentir en uno de los dos renglones,
y un inventario que arranca con una mentira no se endereza después.
`parametros.cuadros_por_molde` sigue existiendo, pero ya solo es **el valor
por omisión** de quien no dice nada.

**Los tamaños NO son inventarios separados.** De 192 cuadros de guayaba salen
15 paquetes de 12 *o* 7 de 24 *o* 3 de 48: es el mismo pan contado distinto, y
vender uno baja los otros. Contarlo por paquete (como estaba al principio)
obligaba a decidir en el horno algo que se decide en el mostrador.

- Se **hornea** por sabor, en moldes → `fn_produccion_mandar_a_hacer`, que
  ahora recibe el `molde` de cada renglón.
- Se **vende** por paquete, y cada uno descuenta sus `productos.cuadros`.
- `fn_existencias_por_sabor` contesta "¿cuánta guayaba queda?" (el horno);
  `fn_paquetes_del_dia`, "¿cuántas chicas puedo vender?" (la caja).

La pregunta de media mañana ("¿cuántos paquetes de guayaba chica quedan?")
**no se contesta con kilos**: por eso existe la segunda. La primera no se
tocó; se complementan.

**Y hay TRES números, no uno**, porque apartar no es vender:

| | Qué es |
|---|---|
| `disponibles` | Lo que físicamente hay: horneado − merma − vendido |
| `apartados` | Comprometido en encargos que **todavía no se pagan** |
| `libres` | `disponibles − apartados`: lo que se puede vender hoy |

**Apartar no descuenta.** Un encargo separa la mercancía en Almacén, pero
sigue en el inventario hasta que se cobra: si el cliente no llega, nunca se
fue. Cobrar es lo único que descuenta, y pasa por `fn_crear_orden` +
`fn_cobrar_orden` —el mismo camino que una venta de mostrador— para que caiga
en el corte de caja. Insertar la orden a mano dejaba el cobro **fuera del
corte** y el día no cuadraba.

**Lo que SALE DEL HORNO entra solo al inventario.** Al subir `cantidad_hecha`
un **trigger** (`fn_produccion_desde_orden`) sube la diferencia. Va en trigger
y no en la RPC a propósito: así la regla se cumple venga de donde venga el
UPDATE. Apunta solo el delta, para que marcar "van 12" y luego "van 20" sume
20 y no 32.

Ojo: Producción solo muestra los menús **abiertos** (respeta el interruptor
de Menús del día). Un menú cerrado esconde sus existencias.

### 2.0b El camino del pan: C → P → H → E

*(Lo que se le explica al negocio está en `docs/camino-del-pan.md`.)*

Cuatro pantallas táctiles, una por mesa, y el pan pasa por las cuatro en ese
orden. Cada una responde por un gesto y **ninguna puede hacer el del vecino**:

| | Pantalla | Qué marca | Columna |
|---|---|---|---|
| **C** | `pos` (caja) | Manda a hacer, y ve lo que pasa en el horno | `moldes` |
| **P** | `produccion` | Cuántos moldes lleva **armados** | `moldes_armados` |
| **H** | `horno` | Cuántos **metió** y cuántos **sacó** | `moldes_en_horno`, `cantidad_hecha` |
| **E** | `empaque` | Qué queda **empacado** y lo entrega | `encargos.empacado_at` |

**El inventario sube en H, no en P.** Un molde armado es masa, no es pan: si
se contara al armarlo, la caja podría vender una hojaldra que sigue cruda.
Antes P marcaba "hecho" y eso entraba directo — funcionaba porque P y H eran
la misma persona; con el horno aparte deja de serlo.

Las cuatro cuentas viven en el mismo renglón y un solo `check`
(`opi_etapas_coherentes`) impide los estados imposibles:

```
moldes_armados <= moldes            -- no se arma más de lo pedido
cantidad_hecha <= moldes_armados    -- no sale del horno lo que no entró
moldes_en_horno <= moldes_armados - cantidad_hecha
```

Va en un `check` de tabla y no repartido en los `if` de tres funciones a
propósito: **la regla se cumple venga de donde venga el UPDATE**, y el viejo
`fn_produccion_avanzar` —que saltaba el horno— ahora choca contra él en vez
de colar pan que nunca se horneó.

**La información del horno sube a la caja** (`fn_horno_en_vivo`): el chip de
la cabecera del POS y la franja de "En el horno" contestan *"¿a qué hora
salen?"* sin que nadie deje de cobrar para ir a preguntar. Contesta **tres**
listas, no una — `adentro`, `esperando` y `sin_armar` — porque "no hay nada
en el horno" significa cosas muy distintas si es porque ya salió todo o
porque producción no ha armado nada.

**Y los encargos son lo primero.** `empaque` (antes `almacen`) ya no es solo
una lista de lo apartado: arriba de todo va **qué hay que empacar sumado por
producto**, porque quien empaca va al mostrador a cortar paquetes y lo que
necesita es *"ocho Fiesta de 24"*, no ocho tarjetas de clientes para sumar a
mano. La cola va por **hora de entrega** (`hora_entrega` es texto libre, así
que `minutosDeHora` lo lee con tolerancia y lo ilegible se va al final), y lo
ya empacado baja a una repisa compacta.

**Empacar no cobra ni descuenta**, igual que apartar. Lo único que mueve el
inventario y el corte sigue siendo `fn_encargo_cobrar`. `empacado_at` es una
fecha y no un "sí" por la misma razón que `contado_at`: un dato sin fecha no
se puede creer.

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

*(Clip es el proveedor implementado hoy. La tienda todavía no decide si se
queda con él o se va a Banorte; la comparación está en
`docs/terminal-banorte.md`. Lo de abajo aplica a Clip, pero la lección del
timbre aplica a cualquiera.)*

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
- La etiqueta lleva familia + nombre (`Bebidas - Cafe de olla`) pero
  **Hojaldras va sin familia** (`#1 Guayaba Mini`), y **el tamaño del vaso
  no se imprime**: vive solo en pantalla.
- Si el agente "acepta datos y no imprime", el problema es físico
  (papel/tapa/sensor): el autotest con FEED al encender lo confirma.
- **Si la terminal termina siendo Banorte, el cobro vive aquí también.** Su
  pinpad se instala como un **puerto COM de Windows**, y un navegador no puede
  abrir un puerto COM: es la misma frontera que el papel. No iría en una Edge
  Function sino en este programa, con su cola, como la de impresión. Ojo con
  la consecuencia: así el cobro **solo funciona con la PC de la tienda
  encendida**, cosa que con Clip no pasa porque el cobro se pide por internet.
  Ver `docs/terminal-banorte.md`.

### 2.5 La identidad es una sola, y vive en `packages/brand`

`packages/brand/tokens.css` es la **fuente de la verdad**: los colores y
las tres tipografías. Las 8 apps de Vite lo importan en su `index.css`, así
que heredan la marca sin hacer nada.

- **Jost** (display/titulares) · **Karla** (cuerpo e interfaz) · **DM
  Mono** (cifras y etiquetas chicas) · **Yellowtail** solo en el logotipo.
- Carmín `#D81B4A`, carmín profundo `#A8123A`, morado hojaldra `#4A3A52`
  (**todo** el texto), crema `#FDF6E3`, y los acentos (rosa salmón
  `#F49CAC`, dorado `#D9944B`…) **uno por superficie**, nunca varios. Los
  valores salieron de su propia web y de sus menús impresos. Los nombres
  de los tokens (`--sa-*`) se conservaron del motor original a propósito:
  las apps los leen tal cual y solo cambiaron los valores.
- **Sobre carmín pleno va `logo-negativo.png`**, no `logo.png`: el
  logotipo en carmín se perdía contra su propio fondo. Pasa en la cabecera
  del kiosko, en la barra lateral de Admin y en las pantallas del POS.

**La regla de tamaños, tomada del kiosko**: la display se usa de **18 px
para arriba** (títulos y cifras grandes); abajo de eso va Karla, y los
números y etiquetas en versalitas van en DM Mono. Yellowtail es exclusiva
del logotipo: nunca en texto corrido ni en la interfaz.

**El `manifest.webmanifest` y los iconos de las apps instalables NO son una
cuarta excepción**, y a propósito: los genera `@lily/pwa` leyendo
`tokens.css`, y los iconos salen de `scripts/generar-iconos-pwa.mjs`. Se hizo
así porque ya se habían desviado — los dos manifests escritos a mano traían
el verde oscuro del motor original (`#14241D`, `#1A2E26`). Ver
`docs/apps-instalables.md`.

**Las tres excepciones que hay que vigilar**, porque no pasan por el
empaquetador y se desvían solas:

- `apps/costos/index.html` — HTML plano. Copia los valores a mano en su
  bloque `:root`. Ya se desvió una vez (usaba Fredoka + Inter y una paleta
  verde-olivo); si se toca `tokens.css`, hay que copiarlo aquí.
- `apps/web` — carga las fuentes con su propio `<link>`.
- `demo/index.html` — la portada de la vitrina, también HTML plano con su
  propio `:root`. Se quedó en el coral viejo un rato después de que la
  marca ya era carmín.

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
  monitores y reparte por tamaño. El grande es del cliente (kiosko); los
  chicos son las estaciones y van **de izquierda a derecha en el orden del
  camino del pan**: producción, horno, empaque. Si hay menos monitores que
  estaciones, las últimas comparten el de más a la derecha — así una PC con
  dos monitores sigue abriendo todo. Después **empuja** cada ventana con
  `SetWindowPos`, porque Chrome recuerda en el perfil la última posición e
  ignora `--window-position`. Escape: `C:\Hojaldras Lily\pantallas.txt` con
  `kiosko=1` / `produccion=2` / `horno=3` / `empaque=4` manda sobre el
  automático. Cada arranque deja su bitácora en
  `C:\Hojaldras Lily\ultimo-arranque.log`.
- `scripts/abrir-caja-y-admin.bat` — POS y Admin, que ya no van en el
  arranque (el turno se abre desde el kiosko).
- Los `.bat`/`.ps1` deben ser **ASCII puro**:
  `node scripts/verificar-scripts-ascii.mjs` lo verifica.

---

## 3. Operación diaria (lo que le dices al negocio)

| Situación | Qué hacer |
|---|---|
| Abrir la tienda | Nada: la PC arranca todo sola |
| Abrir/cerrar caja o cambiar turno | **5 toques a la hojaldra** en el kiosko → PIN |
| Cambiar precios o productos | Costeos → **Guardar**, y cuando esté listo → **"Mostrar en el kiosko"** (enseña qué va a cambiar antes de confirmar) |
| Abrir o cerrar un menú completo (hoy no hay "Por encargo") | Admin → **Menús del día** → el interruptor |
| Mandar a hacer una hornada | Admin → **Producción**, o Caja → **Encargos** (solo gerencia). Se pide en **moldes**, eligiendo **48 o 24**, no en paquetes |
| Apuntar los moldes que ya se armaron | Pantalla de **Producción**: +1, +2 o **Ya está**. Esto **todavía no** entra al inventario |
| Meter y sacar del horno | Pantalla del **Horno**. Lo que se **saca** es lo que sube al inventario |
| Saber qué se está horneando, desde la caja | Sale solo en la cabecera de la **Caja** y en la franja de "En el horno" |
| Saber qué hay que empacar | Pantalla de **Empaque**: arriba, sumado por producto |
| Apartar un encargo | Caja → **Encargos**, o Admin → **Almacén** |
| Marcar un encargo empacado | Pantalla de **Empaque** → **Ya está empacado** (no cobra: solo avisa que está listo) |
| Cobrar un encargo | Caja → **Encargos**, o la pantalla de **Empaque** al entregarlo (es lo único que lo descuenta) |
| Cobrar una parte en efectivo y otra con tarjeta | En el cobro, **"Una parte y otra parte"**. Se teclea solo el efectivo; el resto se calcula |
| Probar si una impresora responde | Admin → **Impresoras** → **Probar**. Si sale papel, todo sirve; si no sale y el trabajo se marcó impreso, es papel/tapa/sensor |
| Salir de Costeos en una computadora prestada | El botón **Salir**: ahora vence la sesión en el servidor, no solo en ese navegador |
| Vender por Rappi | En la caja, el interruptor **Mostrador / Rappi**: cobra la lista de precios de la plataforma |
| Saber cuántos paquetes quedan | Admin → **Producción** (baja solo con cada cobro) |
| Contar el almacén | Admin → **Inventario** → **Contar**. Se escribe lo que HAY, no la diferencia |
| Apuntar lo que llegó del proveedor | Admin → **Inventario** → **Llegó mercancía** |
| Saber qué hay que comprar | Admin → **Inventario** → **Qué hay que comprar** (sale lo que bajó de su mínimo) |
| Apuntar lo que se tiró | Admin → **Inventario** → el `⋯` del renglón |
| Ver lo apartado, para quién y si ya está empacado | Admin → **Almacén**, o la caja en **Encargos** |
| Ver la tienda a distancia | Admin → **En vivo** |
| Algo se siente raro | Admin → **Diagnóstico** |
| Actualizar el agente de impresión | Solo, al abrir el día siguiente |
| Tener Admin en el teléfono | Abrirlo en Chrome → menú → **Instalar aplicación** (en iPhone: Compartir → Añadir a pantalla de inicio) |

---

## 4. Trampas que ya nos costaron (no repetir)

**Llaves que llevan el proyecto adentro**

- El JWT anon **trae el proyecto codificado en base64** (campo `ref`). Cuando
  se replicó el sistema, el buscar-y-reemplazar cambió las URL pero **no pudo
  entrar al JWT**: quedaron la URL de Lily con la llave del otro negocio, y
  Supabase contestaba `Invalid API key`. Pasó en tres lugares distintos y en
  momentos distintos: el cron de Clip, `apps/costos/index.html`, y los
  workflows de Cloudflare y TestFlight. Al rotar una llave, **decodifica el
  `ref`** — que "se vea diferente" no prueba nada.

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
- **Agregarle un escalón a una cadena de estados es DOS cambios, no uno.**
  `fn_produccion_refrescar_estado` empezó a poner `'en_horno'` y el
  `ordenes_produccion_estado_check` lo rechazó: el estado nuevo hay que
  meterlo también en el `check`. Salió al probar la cadena completa contra la
  base, no leyendo el código — un `check` no aparece en ningún `select`.
- **Una regla que cruza tres funciones va en un `check` de tabla**, no
  repartida en los `if` de cada una. Las etapas del horno
  (`opi_etapas_coherentes`) valen igual para `fn_produccion_armar`,
  `fn_horno_meter`, `fn_horno_sacar` y para el viejo `fn_produccion_avanzar`
  que ya nadie llama: con la regla en la tabla, esa función vieja **choca**
  en vez de colar pan que nunca se horneó. Es la misma razón por la que lo
  que entra al inventario va en un trigger.
- **El estado final no es la migración.** Si falta un archivo de migración, no
  se deduce mirando cómo quedó la base: eso da el destino, no el camino. Dos
  de tres reconstruidas así salieron mal —les faltaba el relleno de datos
  previo a un `set not null`, y un `revoke from public`— y las dos habrían
  reventado o abierto un hueco al reconstruir. El SQL que corrió de verdad
  está guardado en `supabase_migrations.schema_migrations.statements`:
  **sacarlo de ahí**.

**Precios y canales**

- **La ausencia de precio significaba lo contrario de lo que el negocio
  quiso decir.** `precios_canal` guarda solo las EXCEPCIONES, así que un
  producto sin fila se vende al precio de mostrador en todos los canales. Pero
  la lista de la casa marca con **"X"** lo que NO va en Rappi: siete tamaños
  de hojaldra, la trenza, todo lo de anís. Sin fila, el sistema los habría
  listado en la plataforma al precio **sin comisión**, y cada venta habría
  perdido dinero en silencio. Se marca con `disponible = false` y no borrando
  el precio: *"no lo vendo aquí"* es una decisión, no un dato faltante. La
  regla vive en **tres lugares** que tienen que coincidir —
  `fn_producto_va_en_canal`, `seVendeEnCanal` y el filtro del carrito al
  cambiar de canal — y la fila marcada guarda precio 0, así que quien la lea
  sin mirar `disponible` ofrecerá el producto **en cero**.
- **Un precio calculado no es un precio.** Los de Rappi estaban sembrados como
  mostrador +19 %. La lista real no sigue ningún porcentaje: la Fiesta de 12
  sube 29 % y la de 24 sólo 11 %. Nueve de dieciocho hojaldras salían a un
  precio que el negocio nunca puso. Que un número se vea razonable no prueba
  que sea el suyo.
- La caja no solo **cobra** el precio del canal: tiene que **mostrarlo**.
  `fn_cobrar_orden` valida el importe contra el total que calculó el
  servidor, así que una pantalla en $160 contra un servidor en $190 rechaza
  el cobro. `precioEnCanal()` (TypeScript) y `fn_precio_linea()` (SQL) son la
  misma regla escrita dos veces: si cambia una, cambia la otra.
- El canal vuelve a **Mostrador** al cobrar. Dejarlo en Rappi le cobraría el
  precio de plataforma al siguiente cliente del mostrador.

**Inventario**

- **Primero el renombre, después el alta.** Nueve insumos del sembrado eran
  los mismos de la hoja con otro nombre (`Harina de trigo` → `Harina Trigo`).
  Dar de alta los de la hoja sin renombrar primero deja **dos harinas**: las
  recetas colgadas del ejemplar viejo y el conteo hecho sobre el nuevo, o sea
  un inventario que se cuenta y nunca se descuenta. Caso especial: cuando solo
  cambian las mayúsculas, el viejo y el nuevo **son la misma fila** y el
  candado anti-duplicado impide el renombre — hay que tratarlo aparte.
- **Un inventario que solo suma se despega de la realidad.** El motor original
  lleva 27,783 movimientos, 1,631 insumos sin un solo grupo y **cero mermas**:
  nunca hubo por dónde preguntar "¿cuánto debería haber contra cuánto hay?".
  Por eso aquí hay conteo físico, y por eso `contado_at` se mueve **aunque no
  haya diferencia**: contar y encontrar que estaba bien también es
  información, y un número sin fecha no se puede creer.
- **Sin renglón en `inventario_stock`, un insumo es invisible.** Existe en el
  catálogo y no aparece en ninguna pantalla de almacén. Al dar de alta
  insumos hay que crearle su existencia en cero.
- La merma se apunta **con motivo** o reaparece en el siguiente conteo como un
  faltante sin explicación — y un faltante que nadie puede explicar es lo que
  hace que se deje de creer en el inventario.

**Indicadores**

- Un indicador que **no puede volver a verde** deja de leerse. "Comandas
  que fallaron: 21" contaba historia de julio irreimprimible. Las métricas
  de salud llevan ventana de tiempo (24 h / 7 días).
- Cuenta solo lo accionable: "ventas sin comanda" bajó de 16 a 3 al excluir
  las categorías que a propósito no van a pantalla.

**Frontend**

- El kiosko **no se recarga a media venta**: la señal de recarga espera a
  que la pantalla esté en el menú y sin carrito. **Lo mismo vale para
  estrenar una versión nueva de la app**: activar un service worker recarga
  la pestaña, así que el kiosko y la caja le pasan su propia condición de
  «ahora sí se puede» a `registrarPwa` — la misma función que ya usan para la
  señal, no una segunda escrita aparte.
- Un service worker llama a `clients.claim()` al activarse, y eso dispara
  `controllerchange` **también en la primera instalación**, cuando no hay
  ninguna versión vieja que reemplazar. Sin distinguir los dos casos, la
  primera visita a cada app se recarga sola, siempre. Solo hay que recargar
  si fuimos nosotros los que pedimos el cambio.
- Y al revés: `updatefound` **puede no llegarle a esta pestaña** si la
  actualización la instaló otra del mismo origen — en la PC de la tienda eso
  es lo normal, con la Caja y el Admin abiertos a la vez. Un vigía que solo
  pregunta «¿ya es seguro?» sin volver a **mirar** si hay una versión
  esperando deja esa pestaña en la versión vieja para siempre, esperando un
  evento que ya pasó.
- Un error que aparece y se va solo en un segundo es peor que ningún
  error: si algo se recupera con un reintento, reintenta en silencio
  (fue el rojo del login de Rewards).
- En el kiosko, las imágenes van como fondo CSS y el menú contextual está
  apagado: si no, mantener el dedo sobre la hojaldra abre "buscar imagen".
- **Lo que importa `vite.config.ts` lo carga Node, no Vite.** Vite empaqueta
  la config pero deja fuera lo que vive en `node_modules`, y pnpm mete ahí
  los paquetes del monorepo como enlaces — así que Node termina abriendo el
  archivo él mismo y se niega: `ERR_UNKNOWN_FILE_EXTENSION ".ts"`. Por eso
  `packages/pwa/src/plugin.mjs` es **JavaScript y tiene que seguir siéndolo**.
  Ojo con cómo se descubrió: en local pasaba y en CI no, porque en local
  había un `dist/` viejo. Reproducir el paso de CI tal cual es lo que lo
  encontró.
- **Cuando los matices se acaban, se distingue por FORMA.** Con siete apps
  instaladas en la PC, el dorado de Producción y el terracota del Horno se
  ven **iguales** a 48 px, que es el tamaño al que de verdad se usa un icono.
  No se arregla partiendo el matiz más fino: el Horno va **relleno** (color a
  sangre, hojaldra sobre un disco de crema) y los demás con aro. Eso se
  distingue aunque el color falle, y también lo distingue quien no ve bien
  los colores. Se comprueba **mirando una hoja de contactos a 48 y 32 px**,
  no suponiendo.
- Y el color no es lo único que se repite: el `short_name` del manifest es lo
  que se lee **debajo** del icono. Producción decía "Horno" —de cuando
  producir y hornear eran la misma mesa— y al nacer la app del Horno quedaron
  dos iconos distintos con la misma etiqueta. Lo encontró
  `scripts/verificar-instalables.mjs`, que ahora imprime el nombre de cada
  una justamente para eso.
- **`hora_entrega` es texto libre**, capturado a mano en la caja: llega
  «10:00», «6 pm», «6» y «por la tarde». `minutosDeHora` lee lo que puede y
  devuelve `null` con lo demás, que se va al final de la cola. No le inventa
  doce horas a un «6» pelón: adivinarle a un dato es peor que dejarlo al
  final.

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

### 2.7 Aquí no hay lealtad, y es a propósito

Se quitaron Rewards (`apps/cliente-pwa` y su workflow de TestFlight), las
pantallas de Clientes, Metas, Promos y Extras de Admin, y del kiosko la
entrada con Google, el QR de lealtad y los canjes.

Venían del motor original —una heladería con mancuernas, sellos y toppings—
y **esto es una panadería**: se vende pan, no se acumulan puntos. Estaban
escondidas del menú «por si acaso», y una pantalla que nadie va a usar es
código que hay que mantener, migrar y revisar cada vez que se toca la base.

Lo que se fue con ellas, por si mañana se extraña:

- **Cupones**: se EMITEN a un cliente de lealtad (cumpleaños, premio de
  sellos). Sin clientes de lealtad no hay a quién emitírselos.
- **Promos del ticket**: se segmentaban por cliente (`fn_promos_cliente`).
  Mismo problema.
- Lo que **sí** quedó en la caja es el **descuento manual con PIN de
  gerencia**, que es una herramienta de caja de toda la vida.
- Y quedó el **recibo digital** que abre el QR de confirmación, que no era
  de lealtad aunque viviera en su archivo: ahora está en
  `packages/supabase/src/queries/recibo.ts`.

**Las tablas de la base NO se borraron.** La regla del repo es que las
migraciones son aditivas (`supabase/migrations/README.md`), y tirar tablas
con datos no se deshace. Están ahí, sin nadie que las lea.

**Y el ticket impreso llevaba el nombre del otro negocio.** `packages/ui`
imprimía un bloque `SHAKE AHOLIC REWARDS` con mancuernas y saldo al pie de
cada ticket. Nunca se vio porque el campo venía vacío, pero el día que
alguien identificara a un cliente habría salido en papel, en el mostrador.

### 2.8 Las tres que sí se trajeron del otro sistema

**Pago mixto** — «le doy $200 en efectivo y el resto con tarjeta». Pasa todos
los días y hasta hoy había que mentir: cobrar todo de un lado dejaba el corte
pidiendo efectivo que no estaba en el cajón, o al revés.

Queda **un solo pago aprobado** con su desglose en `pago_partes`, no dos
pagos. El índice `uq_pagos_un_aprobado_por_orden` es lo que hace imposible el
doble cobro y no se afloja para caber aquí. *(El motor original sí lo hizo con
dos pagos —uno aprobado y otro pendiente que alguien aprobaba después— y su
propio código trae un `delete` de los que quedaban colgados, con un comentario
sobre «efectivos fantasma». No se trajo ese camino.)*

Y el desglose **tiene que llegar al corte**: `vw_corte_resumen` saca el
efectivo esperado sumando los pagos de método `efectivo`, y contra ese número
se cuenta el cajón. Ahora lee `vw_pagos_por_metodo`, que da las partes si las
hay y el pago entero si no.

**Prueba de impresión desde Admin** (`fn_imprimir_prueba_staff`) — ya existía
`fn_imprimir_prueba`, pero pide el **token del agente**, que solo está en la
PC de la tienda: para saber si una impresora responde había que ir al local.
Ahora hay un botón **Probar** en Admin → Impresoras.

**El agente no se tocó**: usa el mismo payload `prueba: true` que ya sabe
dibujar. El otro sistema inventó un `diagnostico: true` y le quedó un
`raise exception` avisando que el agente de la tienda era viejo y no sabía
imprimirlo — reusar el payload que ya existe se salta esa conversación.

**Cerrar sesión en Costeos** (`fn_costos_salir`) — el botón «Salir» existía y
**solo borraba el localStorage**: el token seguía vivo en el servidor sus 12
horas completas. Quien «salía» en una computadora prestada dejaba ahí una
sesión que podía cargar costos, márgenes y proveedores. Borrar la llave de tu
bolsillo no cierra la puerta.

Ahora vence el token. **No lo borra**: queda el rastro de que ese usuario tuvo
una sesión.

### Qué sigue diciendo «shake», y por qué no se toca

Los paquetes se llaman `@lily/*` y el tipo del cliente es `ClienteLily`. Lo
que queda con ese nombre es **forma de datos**, no texto que alguien lea:

- `packages/types/src/dominio.ts` (`shakeIngs`, `shakeRecipes`) y las mismas
  claves en `apps/costos/index.html`: es el JSON que vive dentro de
  `app_data.data`. Renombrarlas exige migrar el JSON guardado **y**
  `fn_sync_app_data` a la vez, o Costeos deja de guardar.
- El enum `tipo_insumo` de la base tiene el valor `'shake'`, y
  `fn_extra_bebida_guardar` espera `'shakes' | 'clasico'`. En pantalla se leen
  como «Todas las hojaldras» y «Solo la clásica».
- `packages/types/src/database.ts` se **genera** desde la base: cambiarlo a
  mano se pierde en la siguiente regeneración.

Los comentarios que dicen «esto era el de los shakes» se quedan a propósito:
explican por qué una pantalla tiene la forma que tiene.

---

## 5. Seguridad

- Las llaves van en **Supabase Edge Function Secrets**, nunca en el repo ni
  en el chat. El `service_role` jamás dentro de SQL (quedaría legible).
- La llave publicable y el JWT anon **son públicos por diseño** (viven en
  el frontend). La seguridad real está en RLS y en las funciones.
  Y por eso hay que revisar RLS de verdad: el motor original venía con
  `for update using (true)` para el rol `public` **y** el GRANT de `anon`
  en 17 tablas. Con las dos cosas juntas, cualquiera con la llave podía
  `update productos set precio = 1`. Comprobado y arreglado aquí
  (`20260826213000`): **escribir el catálogo exige `fn_rol_staff()`**.
  Ojo con la lección: "el dinero se calcula en el servidor" era cierto
  —`fn_crear_orden` sí recalcula— pero recalcula **desde
  `productos.precio`**, así que alterar la tabla bastaba para que el
  servidor cobrara $1 y todo cuadrara. La garantía valía un piso más abajo
  de donde se creía.
  **Sigue abierto**: `pedidos_cocina`, `cocina_items` y `caja_cortes`, que
  el kiosko y las estaciones escriben **sin sesión**. Se cierran haciendo
  que esas pantallas abran sesión real (ya existe `staff-login`), no
  quitándoles el permiso: eso deja la tienda sin marcar comandas ni abrir
  caja.
  Y ojo con la **puerta de atrás**: cerrar `productos` no bastaba, porque
  `app_data` seguía abierta a `anon` y su trigger (DEFINER) reescribe el
  catálogo — se podían mover los precios dando el rodeo por Costeos. Cerrado
  en `20260826220000`: Costeos entra con usuario y contraseña, recibe un
  **token** de 12 h, y cargar y guardar pasan por `fn_costos_cargar` /
  `fn_costos_guardar`. `app_data` ya no la toca `anon` — que además guardaba
  **costos, márgenes y proveedores** a la vista de cualquiera con la llave.
  Efecto colateral aceptado: Realtime ya no avisa "actualizado desde otro
  dispositivo" en Costeos (Realtime aplica RLS igual que una consulta).
  **La lección que se repite**: cerrar la puerta principal no sirve si el
  dato entra por otro lado. Pregunta siempre *quién más escribe esta tabla*.
- **Un `grant` no quita nada: suma.** Postgres le da EXECUTE a `PUBLIC` por
  omisión en cada función nueva, así que `grant execute ... to authenticated`
  deja la puerta de PUBLIC abierta igual. Se ve en `pg_proc.proacl` como una
  entrada con el beneficiario **vacío** (`=X/postgres`); ojo al buscarla,
  porque un `like '%=X%'` también empata con `authenticated=X`. Hay que
  `revoke all ... from public` **y** `from anon`, y luego otorgar. Pasó con
  las siete funciones de inventario: protegidas solo por el `fn_es_staff()`
  de adentro. No lo explotó nadie, pero una sola capa no es una capa — es un
  punto de falla, y el día que alguien edite la función y se le olvide el
  `if`, el GRANT es lo único que queda. Arreglado en `20260920100000`.
- El personal entra con PIN → `staff-login` (Edge) → sesión real de
  Supabase Auth. `fn_es_jefe()` distingue gerencia; **no basta con
  `authenticated`**, porque un cliente de lealtad también lo es.
- Repo público: nada de costos, márgenes ni proveedores en git. Los
  respaldos `respaldo-costosshake-*.json` están en `.gitignore`.

---

## 6. Cómo trabajar aquí

```bash
pnpm --filter @lily/<app> build   # compila y verifica tipos
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
