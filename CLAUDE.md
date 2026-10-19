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
`fzkdgqqvfkogmxdgqsxj` tiene **211 migraciones aplicadas en orden, y 211
archivos en `supabase/migrations/`** — el número tiene que cuadrar, y es lo
primero que hay que comprobar al retomar. Ya corrió una venta
de punta a punta contra ella (total calculado en el servidor, monto falso
rechazado, doble cobro rebotado, comandas por estación y corte cuadrando);
el catálogo semilla de hojaldras está sembrado y las Edge Functions
desplegadas.

**Y está EN CERO desde el 19/10** (`20261019190000`): la casa pidió arrancar
limpio. Se borró la historia de las pruebas —órdenes, pagos, cortes,
encargos, producción, movimientos, cola de impresión— y los folios volvieron
a 1. Se quedó la configuración: catálogo, 99 insumos con su renglón de
existencia en cero, empleados, impresoras con su token, cajas, parámetros y
Costeos. **Lo que se capture a partir de ahora es de verdad**: no volver a
correr esa migración.

**Todas las horas van en 12 h y en Mérida (UTC−6), fijas**, no al gusto del
aparato: `horaEnMerida` / `fechaHoraEnMerida` en `@lily/utils` para las
pantallas, y `timeZone: 'America/Merida'` + `hour12: true` en los
formateadores del papel y del recibo. La PC de la tienda ya está en Mérida,
pero Admin se abre desde el teléfono en cualquier parte.

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
4. **PIN del personal y hardware del local** (ver `docs/hardware.md` y
   `docs/dia-de-instalacion.md`).

**El contrato de las cuatro funciones principales** —venta, inventario, caja
e impresiones— está en **`docs/base-de-replicacion.md`**: qué función hace
qué, qué invariante protege, qué pasa si se rompe, qué conviene llevarse a
otra tienda y qué no. Ahí está también la lista honesta de lo que a Lily le
falta para estar a la par, y la consulta de §6 que encuentra los huecos de
permisos listando en vez de leyendo.

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
| `pos` | `caja.hojaldraslily.com` | **C** — la caja: **aquí se vende**. Turno, cobros, encargos |
| `kiosko` | `kiosko.hojaldraslily.com` | Autoservicio del cliente — **para después** (ver abajo) |
| `produccion` | `produccion.hojaldraslily.com` | **P** — los panaderos (arman los moldes) |
| `horno` | `horno.hojaldraslily.com` | **H** — quien hornea (mete, vigila y saca) |
| `empaque` | `empaque.hojaldraslily.com` | **E** — quien empaca y entrega los encargos |
| `cliente-display` | `pantalla.hojaldraslily.com` | TV de folios |
| `admin` | `admin.hojaldraslily.com` | Gerencia |
| `costos` | `costos.hojaldraslily.com` | Costeo e inventario (HTML plano) |

Y **dos programas** que corren en la PC de la tienda, no en la nube:
`agente-impresion/` (comandas, TSPL) y `apps/agente-caja/` (tickets, ESC/POS).

Los dominios de la tabla son el plan para Lily; los proyectos de
Cloudflare Pages (`lily-*` en el workflow) se crean solos en el primer
deploy con los secretos configurados. `api.hojaldraslily.com` (dominio
propio de Supabase) es un add-on que aún no se contrata: el mapa
`DOMINIO_PROPIO` en `packages/supabase/src/client.ts` está vacío a
propósito hasta entonces.

---

## 2. Las cinco cosas que hay que entender

### 2.-1 Se vende desde la CAJA; el kiosko queda para después

La casa lo decidió el 19/10: el cajero arma el ticket y cobra en `pos`
(`caja.hojaldraslily.com`), que entra con PIN y tiene sesión real. El kiosko
de autoservicio no se usa por ahora.

Eso cambió dos cosas que no son de pantalla:

- **El cobro exige sesión.** `fn_crear_orden`, `fn_cobrar_orden` y unas
  cuarenta funciones más estaban abiertas a `anon` *porque el kiosko cobraba
  sin sesión*. Ya no hay nadie que cobre sin sesión, así que se cerraron
  (`20261019150000`), y con ellas las políticas `using (true)` de
  `caja_cortes`, `ordenes`, `pagos`, `pedidos_cocina` y `cocina_items`. Lo que
  sigue abierto a `anon` es exactamente lo que no tiene sesión y no toca
  dinero: entrar (`fn_login_cajero`), el recibo del QR, Costeos por token,
  el instalador por código y los agentes por token. **Cuando el kiosko
  vuelva, tiene que entrar con sesión como las demás pantallas** — no se
  reabre nada.
- **La caja es la pantalla principal de la PC.** `pantallas.ps1` le da el
  monitor grande a `caja` (con `--kiosk-printing`) y el kiosko ya no se abre
  al arrancar. Para abrir/cerrar turno se usa la propia caja, no los cinco
  toques del kiosko.

Y **Admin se usa desde el teléfono**: en pantallas angostas la barra lateral
se vuelve una cabecera con la sección actual y un botón que abre la lista
completa. Antes era una tira con scroll que enseñaba tres secciones de
catorce. Se mira con `apps/admin/mirar/tamanos.html#impresoras`, que pone un
teléfono y una tableta lado a lado con viewports de verdad (Chromium sin
cabeza no baja de 500 px de ventana; un iframe sí).

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

**Y no todo sale de un molde.** `orden_produccion_items.unidad` dice cómo se
cuenta el renglón: `'molde'` son las hojaldras y `'pieza'` es todo lo demás
—las roscas, la Trenza Suiza, las Patas, los Tutis, las galletas, lo de anís,
el Pan de Muerto, la Hojaldra de Corazón, los bocadillos—, que se hornea al
pedido. En un renglón de pieza `cuadros_por_molde` va en **null**, no en un 48
de relleno: un 48 inventado se suma como cuadros que no existen. Y **lo que va
en piezas no entra al inventario de cuadros** — el trigger lo salta a
propósito, porque esos panes se venden sin existencia (`paquetes_posibles =
null`) y no hay de dónde descontarlos. Lo horneado queda apuntado en
`cantidad_hecha`, que es lo que miran la mesa y el horno.

Antes de esto, la pantalla de Producción **solo sabía pedir hojaldras**: la
columna traía `not null` con `check in (24, 48)`, así que media panadería no
tenía por dónde mandarse a hacer. Era literal el reclamo de la casa — «en
producción falta que hagan todos los panes».

**El tamaño del molde va por RENGLÓN, no en un parámetro global.** Vive en
`orden_produccion_items.cuadros_por_molde` (con `check in (24, 48)`), porque
en una misma hornada caben tres moldes de 48 de guayaba y dos de 24 de queso:
un solo número para toda la casa obliga a mentir en uno de los dos renglones,
y un inventario que arranca con una mentira no se endereza después.
`parametros.cuadros_por_molde` sigue existiendo, pero ya solo es **el valor
por omisión** de quien no dice nada.

**Los TAMAÑOS no son inventarios separados; los MOLDES sí.** De 192 cuadros de
guayaba salen 15 paquetes de 12 *o* 7 de 24 *o* 3 de 48: es el mismo pan
contado distinto, y vender uno baja los otros. Contarlo por paquete (como
estaba al principio) obligaba a decidir en el horno algo que se decide en el
mostrador.

Pero **un molde de 48 y uno de 24 son dos bolsas distintas**, y el inventario
no convierte una en la otra. Era el reclamo de la casa: diez moldes de 24 se
leían como «5 de 48», porque sólo se guardaban cuadros y se dividían entre un
molde global. Ahora `produccion.cuadros_por_molde` dice de cuál salió cada
movimiento, y hay dos cuentas por sabor (`libres_48` y `libres_24`) que se
pintan siempre por separado.

**Qué molde paga cada paquete** — tres reglas, dictadas por la casa, y el
orden importa:

1. Un paquete de **48** sale SOLO de un molde de 48. No se pega una hojaldra
   grande con dos de 24. Va primero porque es el único sin alternativa.
2. Los de **6 y 12** salen de los de 48, que es el molde que se corta; de los
   de 24 cuando los de 48 se acaban.
3. Un paquete de **24** sale de un molde de 24 completo si lo hay, y si no, de
   medio molde de 48. Va al final: al revés, un encargo de diez Chicas se
   comería los moldes de 48 y dejaría parados los de 24 que se hornearon justo
   para él.

- Se **hornea** por sabor, en moldes → `fn_produccion_mandar_a_hacer`, que
  recibe el `molde` de cada renglón; a mano, `fn_horneada_de_molde`, donde el
  molde es **obligatorio**.
- Se **vende** por paquete, y cada uno descuenta sus `productos.cuadros`.
- `fn_existencias_por_molde` contesta "¿cuánta guayaba queda, y en qué
  moldes?" (el horno); `fn_catalogo_del_dia`, "¿qué puedo vender hoy y cuánto
  alcanza?" (la caja).

La pregunta de media mañana ("¿cuántos paquetes de guayaba chica quedan?")
**no se contesta con kilos**: por eso existe la segunda.

**Y en `fn_catalogo_del_dia`, `paquetes_posibles = null` NO es cero.** Es «se
hornea al pedido»: las roscas, las trenzas, la Hojaldra de Corazón, los panes
y los bocadillos no llevan existencia de cuadros. Leer ese null como «quedan
0» escondía del mostrador justo lo que siempre se puede ofrecer — y es lo que
impedía meterlos en un encargo, que es para lo único que existen.

**El NOMBRE decide cómo se agrupa en la caja.** `partirNombreDeVenta` corta
por el **primer** `·`: lo de antes es la tarjeta y lo de después es la
variante. Por eso el Pan de Muerto se llama `Pan de Muerto Tradicional ·
Chica` y no `Pan de Muerto · Tradicional · Chica` — con tres partes, los ocho
caían en UNA tarjeta y los mosaicos decían «Tradicional, Tradicional, Queso de
Bola, Queso de Bola…», cuatro parejas de etiquetas idénticas que solo se
distinguían por el precio. Con dos partes quedan cuatro tarjetas de dos
tamaños, que es como está el cartel. Misma razón por la que `Rosca de Queso
Philadelphia` y `… · Grande` comparten prefijo: es el mismo pan en dos
tamaños y tiene que ser UNA tarjeta.

**Hay productos que se cuentan en PIEZAS, no en cuadros.** `productos.piezas`
dice de cuántas es el renglón: 5 el paquete de pastelitos, 1 la pieza suelta,
2 el Pan de Leche. `null` = no se cuenta por piezas. La etiqueta sale de
`medidaDeVenta()` en `@lily/utils`, una sola vez para las cuatro pantallas que
la preguntan.

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

**La caja es el puesto de mando.** `PanelDeProduccion` es UN botón en la
cabecera del POS y UN cajón que se abre encima, con las tres cosas que están
pasando atrás y lo que se decide con ellas:

| | Contesta |
|---|---|
| **En el horno** | «¿a qué hora salen?» — con su reloj y su foto |
| **Producción** | qué está armado esperando turno y qué siguen armando |
| **Encargos de hoy** | quién pasa, a qué hora, y **si su caja ya está lista** |
| **Lo que queda** | en moldes y cuartos, por sabor |
| **Mandar a hacer** | solo gerencia |

El botón dice **una sola cosa**, la más urgente, en el orden en que duele: el
pan que se pasó de su hora, luego un encargo de hoy sin empacar, luego lo que
está en el horno. Si dijera las tres cifras siempre, nadie leería ninguna.

Va encima de la caja y no es una ruta aparte a propósito: navegar a otra
página con un ticket a medias es la forma más fácil de perder una venta.

**Una sola fuente por pregunta.** `fn_horno_en_vivo` contesta **tres** listas
—`adentro`, `esperando` y `sin_armar`— porque «no hay nada en el horno»
significa cosas muy distintas si es porque ya salió todo o porque producción
no ha armado nada. Y hubo una franja de «En el horno» en la caja que leía
`listarOrdenesConTiempo`: **otra consulta para la misma pregunta**. Una
contaba piezas y la otra moldes, así que tarde o temprano iban a decir cosas
distintas del mismo horno. Se quitó.

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

### 2.1 Costeos manda el CATÁLOGO — ya no la existencia

`apps/costos` (un solo `index.html`, sin build) guarda TODO en una fila de
`app_data.data` (JSON). Al guardar, un trigger corre `fn_sync_app_data()`,
que crea/actualiza productos, insumos y recetas.

**Pero la EXISTENCIA ya no pasa por ahí** (19/10/26). El trigger también
llamaba a `fn_sync_stock_costos`, que mandaba *la diferencia* contra el
último número que Costeos recordaba (`costos_stock_sync.ultimo_valor`) en vez
de registrar un movimiento. Es el modelo del que salieron casi todos los bugs
caros de inventario del motor original —entradas contadas dos veces, cientos
de insumos fantasma, una pestaña vieja que deshacía ventas— y que su propia
guía marca como «no lo tomes así».

Aquí se cortó **antes de que disparara**: la tabla ya tenía 50 renglones
sembrados y 0 movimientos generados. Ahora la existencia solo cambia por
`inventario_movimientos` (Admin → Inventario: contar, merma, «llegó
mercancía»), que es un dueño y no dos. De la pantalla de Costeos se quitó el
botón «Aplicar conteo a existencias» por la misma razón: dejarlo habría sido
peor que quitarlo — se toca, no pasa nada, y nadie se entera.

Consecuencias que hay que respetar:

- **Renombrar un producto desde Admin no sirve** para lo que viene de
  Costeos: el siguiente guardado lo revierte. Los scoops y suplementos se
  renombran EN COSTEOS.
- **Apagar un producto desde Admin tampoco servía**, por lo mismo
  (`activo = precio > 0`). Ahora hay una segunda bandera,
  `productos.pausado`, que ese guardado **sí** respeta: es
  «guardar para después». Existe por el Menú de Temporada, que lleva el Pan de
  Muerto y la Rosca de Reyes juntos: con un solo interruptor por menú, cambiar
  de temporada obligaba a ponerle cero a ocho precios —o sea borrarlos— y
  volver a teclear los otros ocho. Vive en Admin → **Menús del día**, dentro
  de cada menú.
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

**Pero el TICKET del cliente no pasa por ahí.** `imprimirTicket` escribe el
HTML en un marco oculto y llama `window.print()`: va de Chrome a la impresora
**predeterminada de Windows**, sin agente, sin cola y sin etiquetadoras. Es lo
que permite arrancar la tienda con **solo caja y tickets** mientras las
estaciones siguen pendientes (`docs/hardware-caja.md`).

**Y ya existe el camino para quitarle eso.** `apps/agente-caja/` es el segundo
programa de la PC: reclama de la misma cola los trabajos de tipo `ticket`, los
imprime por ESC/POS en el puerto 9100 y los confirma — así un ticket que no
salió **se ve en Admin**, en vez de irse callado a un PDF. Está portado del
agente de Shakeaholic, que ya lleva meses imprimiendo, y probado con seis
pruebas que miran los bytes (la página de códigos, el avance antes del corte,
latin1 en los acentos y que un payload roto reviente ruidosamente).

**Ya está encendido.** La caja encola con `fn_imprimir_ticket_caja`, que
devuelve el id del trabajo o **null** si esta sucursal todavía no tiene
térmica dada de alta; ese null es la respuesta importante, porque la caja lo
lee como «imprime tú por el navegador, como hasta hoy». Así no hay cola que
crezca sin impresora que la vacíe. Es idempotente por orden: el doble toque
no saca dos tickets.

**A qué impresora va, lo dice `impresoras.rol`** (`comandas` | `tickets`), no
se adivina por «no tiene estación»: el día que alguien diera de alta una
etiquetadora sin estación, el ticket del cliente saldría en la de producción.
Solo puede haber **una térmica de tickets activa por sucursal** (índice
único); dos serían dos tickets del mismo cobro, o uno al azar.

Y son **dos programas con dos archivos de configuración distintos**: las
etiquetadoras leen `printers.config.json` y el de caja lee un `.env`. Admin
entrega el bloque correcto según el rol — darle el JSON al de caja es la
forma de que alguien configure el archivo equivocado y el síntoma sea «pongo
el token y no imprime».

**El agente de tickets se EMPAQUETA para la tienda.** Importa
`@lily/ui/papel` —a propósito, ver abajo— y eso es un paquete del monorepo:
un `npm install` en la PC de la tienda no lo encuentra y el agente no
arranca. `apps/agente-caja/empaquetar.mjs` lo mete adentro con esbuild y deja
`dist/` con un solo `.mjs` (16 kB) y un `package.json` con las dos
dependencias que sí viven en npm. **`dist/` va versionado** —excepción
explícita en `.gitignore`— porque el instalador baja un zip del repo y ahí no
hay empaquetador; lo mantiene al día una prueba que vuelve a empaquetar y
compara.

**Las líneas del papel las arma `@lily/ui`, no el agente** — el mismo módulo
que pinta el ticket en pantalla. Por eso el agente vive en `apps/` y no junto
al de etiquetas: si cada uno tuviera su propio formateador, la vista previa
dejaría de coincidir con el papel a la primera modificación y nadie se
enteraría hasta que un cliente reclame. Son **dos renderizadores y UN dato**
(`TicketData`), con una prueba que compara sus totales.

Dos consecuencias que hay que respetar:

- La caja se abre con **`--kiosk-printing`** (está en
  `scripts/abrir-caja-y-admin.bat`). Sin esa bandera, cada cobro saca el
  diálogo de Chrome y el cajero tiene que darle "Imprimir" con el cliente
  enfrente; con prisa se cierra sin imprimir.
- Con la bandera puesta, **la predeterminada decide dónde sale el ticket, y
  si es la equivocada no hay ningún error**: la venta queda bien cobrada y el
  papel se va a un PDF o a la láser de la oficina. Es el mismo modo de fallo
  silencioso que la etiquetadora que no es TSPL.

- **Instalar la PC exige un código de gerencia.** `fn_instalador_impresoras`
  y `fn_instalador_token` son las únicas dos puertas abiertas a `anon`, y lo
  que las protege no es el rol sino el código: Admin → Impresoras →
  **«Conectar la PC de la tienda»**. Vive 30 minutos, se recorta a 20 más al
  estrenarlo y generar uno nuevo revoca el anterior. Antes esto se resolvía
  dejando `fn_rotar_token_impresora` abierta a cualquiera con la llave
  publicable — que es pública por diseño.

  **«Un solo uso» quiere decir UNA INSTALACIÓN, no una llamada**: instalar
  son varias (listar, y un token por impresora). Lo que se acota es la
  ventana, y el tope de 40 llamadas.

  Y **actualizar NO es instalar**: el arranque de cada mañana corre el mismo
  `.ps1` con **`-SoloActualizar`**, que cambia el código de los dos agentes
  y no toca configuración ni tokens. Sin esa separación la actualización
  diaria pediría un código que a las 7 de la mañana no hay quién teclee — y
  antes, además, rotaba el token de todas las impresoras para nada.
- **El instalador no dice LISTO hasta que el servidor ve el latido.** Un
  instalador que felicita y se va deja PCs «configuradas» que nunca se
  reportaron, y eso no se descubre hasta la primera comanda perdida.
- Reclama trabajos con `fn_imprimir_reclamar_trabajos` y late con
  `fn_imprimir_latido`, que ahora **reporta su versión** — visible en
  Admin → En vivo junto a cada impresora. Si dice ámbar, falta actualizar.
- La prueba de Admin reusa el payload `prueba: true` que los **dos** agentes
  saben dibujar; lo único que cambia es el `tipo_documento`, para que en la
  cola se vea qué era.
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
| Abrir/cerrar caja o cambiar turno | En la **caja**: entrar con PIN → «Abrir caja» contando el cajón; «Corte de caja» para cerrar. Al cerrar, el corte **sale solo en la térmica** si hay una dada de alta |
| Cambiar el teléfono, la dirección, el **horario** o los avisos del ticket | Admin → **Sistema** → «Lo que dice el ticket». El horario tiene su casilla y sale como «Horario: …» delante de los avisos; quien cobró **no** sale (la casa no lo quiere). El siguiente ticket ya sale así; no se toca la PC |
| Saber qué hay que tener listo antes de las 12 | Pantalla de **Producción** («Encargado para hoy», por hora) y **Empaque** («Hay que empacar», con el desglose por hora debajo): «10 Jamón y Queso Chica · 5 Fiesta Mini para las 12:00 p.m.» |
| Apartar con hora | La hora se escoge en un **selector** (se ve en 12 h con a.m./p.m.), ya no se teclea «6 pm» |
| Revisar un corte de otro día, o saber cuántos billetes había | Admin → **Cortes de caja**. Se toca el renglón y abajo sale el desglose del cajón al abrir y al cerrar, las ventas por método y las notas |
| Volver a sacar el papel de un corte | Admin → **Cortes de caja** → **Reimprimir en la térmica** (sale en el mostrador) o **Imprimir / guardar PDF** (desde donde sea, para mandarlo por WhatsApp) |
| Instalar o actualizar la PC de la tienda | Admin → **Descargas**. Arriba dice si cada agente está al día; abajo están los `.bat`. El único permiso que pide es el de administrador, una vez |
| Cambiar precios o productos | Costeos → **Guardar**, y cuando esté listo → **"Mostrar en el kiosko"** (enseña qué va a cambiar antes de confirmar) |
| Guardar una pieza para después (cambio de temporada) | Admin → **Menús del día** → **Ver las piezas** → **Guardar para después**. No le quita el precio ni la receta: en enero se guarda el Pan de Muerto y se saca la Rosca de Reyes |
| Abrir o cerrar un menú completo | Admin → **Menús del día** → el interruptor. Hoy está apagado **Café** (lo pidió la casa). El **Menú de Temporada** está abierto con el Pan de Muerto —mostrador y Rappi—; la Rosca de Reyes vive en esa misma sección, apagada y en cero hasta enero |
| Vender piezas sueltas de pastelitos o bolitas | Se toca el bocadillo y abajo salen **+1, +2, +3, +4 piezas**. Hasta 4: con 5 ya se toca el paquete, que cuesta lo mismo |
| Ver un encargo que ya se recogió | Caja → **Encargos** → pestaña **Historial** |
| Mandar a hacer una hornada | Admin → **Producción**, o Caja → **Encargos** (solo gerencia). Las hojaldras se piden en **moldes**, y **cada renglón elige 48 o 24**; lo que se hornea al pedido —roscas, trenzas, panes, galletas, anís, bocadillos— se pide en **piezas**. Abajo se le puede poner **la hora** a la que tiene que estar lista |
| Apuntar los moldes que ya se armaron | Pantalla de **Producción**: +1, +2 o **Ya está**. Esto **todavía no** entra al inventario |
| Meter y sacar del horno | Pantalla del **Horno**. Lo que se **saca** es lo que sube al inventario |
| Saber qué pasa atrás, desde la caja | El botón **Producción** de la cabecera: horno con su reloj, qué arman los panaderos, encargos de hoy y lo que queda |
| Saber qué hay que empacar | Pantalla de **Empaque**: arriba, sumado por producto |
| Apartar un encargo | Caja → **Encargos**, o Admin → **Almacén**. La cantidad **se teclea**: para 13 pastelitos se escribe 13, no se toca «+» trece veces |
| Marcar un encargo empacado | Pantalla de **Empaque** → **Ya está empacado** (no cobra: solo avisa que está listo) |
| Cobrar un encargo | Caja → **Encargos**. Si además se llevan otra cosa, **"Y algo más"**: el encargo pasa al ticket de la caja y se cobra todo junto, en un solo papel y con el anticipo ya descontado |
| Cobrar una parte en efectivo y otra con tarjeta | En el cobro, **"Una parte y otra parte"**. Se teclea solo el efectivo; el resto se calcula |
| Probar si una impresora responde | Admin → **Impresoras** → **Probar**. Si sale papel, todo sirve; si no sale y el trabajo se marcó impreso, es papel/tapa/sensor |
| Si el ticket del cliente no sale | Si ya hay térmica dada de alta, el trabajo **se ve en Admin → Impresoras**: ahí dice si salió o falló. Si todavía no la hay, el ticket va por el navegador y entonces es **otra** impresora: se revisa que sea la **predeterminada** de Windows (ver `docs/hardware-caja.md`) |
| Dar de alta la térmica del mostrador | Admin → **Impresoras** → «Para qué sirve» = **Tickets del cliente**. Lo que sale al guardar es el `.env` del agente de caja, no el JSON de las etiquetadoras |
| Se fue el internet | **Seguir vendiendo**: efectivo o terminal del banco. El folio sale como «S-01» y las ventas se registran solas al volver. No se puede cerrar la caja hasta que entren (ver `docs/sin-internet.md`) |
| Salir de Costeos en una computadora prestada | El botón **Salir**: ahora vence la sesión en el servidor, no solo en ese navegador |
| Vender por Rappi | En la caja, el interruptor **Mostrador / Rappi**: cobra la lista de precios de la plataforma |
| Saber cuántos paquetes quedan | Admin → **Producción** (baja solo con cada cobro) |
| Abrir o cerrar el turno contando el cajón | Se teclea **cuántas piezas** hay de cada billete y de cada moneda; el total lo saca el sistema. Billetes y monedas van en columnas separadas porque **el $20 existe como los dos** |
| Contar el almacén | Admin → **Inventario** → **Contar**. Se escribe lo que HAY, no la diferencia. **Es el único lugar donde se fijan existencias**: la pestaña Inventario de Costeos sirve para contar e imprimir la hoja, no para fijarlas |
| Apuntar lo que llegó del proveedor | Admin → **Inventario** → **Llegó mercancía** |
| Saber qué hay que comprar | Admin → **Inventario** → **Qué hay que comprar** (sale lo que bajó de su mínimo) |
| Apuntar lo que se tiró | Admin → **Inventario** → el `⋯` del renglón |
| Ver lo apartado, para quién y si ya está empacado | Admin → **Almacén**, o la caja en **Encargos**. Van **partidos por día de entrega**, y lo que se pasó de su día va hasta arriba en carmín |
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
- Y lo mismo con el **repo**: cinco scripts de la PC de la tienda apuntaban a
  `EleevateMX/ventashake`, el del otro negocio. No es cosmético — el arranque
  diario **sobrescribe `pantallas.ps1`** con el que baja de ahí, así que la PC
  de Lily se habría reconfigurado sola con las pantallas de la otra tienda
  (barra y cocina en vez de producción, horno y empaque), y el instalador del
  agente habría bajado el código del otro negocio. Arreglado; la lección es
  que el buscar-y-reemplazar de la replicación cubrió dominios y no cubrió
  **rutas de GitHub**. Ojo también: este repo **todavía no tiene rama
  `main`**, y esas URL apuntan a `/main` — el autoservicio de la PC no
  funciona hasta que `main` exista.

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

  **«Exactamente N veces» es la parte que se salta y la que muerde.** Al
  quitar la `fn_precio_linea` duplicada, el ancla se verificó con «aparece
  al menos una vez»: la MISMA llamada estaba escrita dos veces con formato
  distinto —una repartida en varias líneas y otra en una—, el parche agarró
  solo una, y como el paso siguiente tiraba la función vieja, **el kiosko se
  quedó sin poder crear órdenes**. Lo encontró la prueba de punta a punta,
  no la lectura. Mejor todavía que contar el ancla: comprobar al final la
  propiedad que de verdad importa (ahí, que no quedara ninguna llamada sin
  canal).

  Y las cadenas del reemplazo van **todas** con `E''` si traen `\n`. Una
  mitad sin el prefijo metió los `\n` literales en el cuerpo de la función;
  Postgres la rechazó por sintaxis y la transacción se deshizo entera — que
  es el comportamiento correcto, pero cuesta un viaje.
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
- **`(f(...)).*` llama a la función UNA VEZ POR COLUMNA.** `fn_crear_orden`
  devuelve un `ordenes` —un compuesto, no un conjunto— y
  `select (fn_crear_orden(...)).* into v_fila` expande el `.*` a veintidós
  columnas, cada una con su propia copia de la llamada: **veintidós órdenes
  creadas con sus renglones**, veintiuna huérfanas. `fn_encargo_cobrar` lo
  traía desde agosto y dejó 219 filas de más. No descuadraba el corte —nacen
  con `pagado = false` y el corte suma pagos, no órdenes— ni se veían en
  ninguna pantalla, pero gastaban folios y ensuciaban `orden_items`. La forma
  correcta en plpgsql es la asignación, que evalúa una sola vez:
  `v_fila := fn_crear_orden(...)`. Lo encontró **contar filas antes y
  después** en la prueba de punta a punta, no leer el código.

- **Una tabla temporal con `drop` dentro de una función que corre desde la
  app es una bomba.** `fn_sync_app_data` crea y tira `_prod`/`_stk`, y eso
  **cuelga el MCP de Supabase igual que un `DROP`**: no se puede disparar el
  guardado de Costeos desde aquí para probarlo. En el motor original la misma
  forma dejó la tienda 50 minutos sin cobrar, porque Supabase bloquea
  `DELETE` sin `WHERE` para los roles de la API mientras que con la conexión
  de administrador el mismo código pasa sin chistar. Consecuencia práctica:
  lo que toque ese camino se prueba **en la tienda**, no desde aquí.

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

- **Un encargo del sábado no se come el pan del martes.** Las tres funciones
  de existencias contaban TODO lo apartado contra el día que se les
  preguntaba, con un comentario que lo justificaba: «separar es separar desde
  que se aparta». Suena razonable y es falso aquí, por algo que no estaba en
  el código: **el pan se hornea cada día y se vende del día**. El pan del
  sábado todavía no existe el martes, así que apartarlo contra el martes
  descuenta de una charola que no es la suya y el mostrador deja de ofrecer lo
  que sí puede vender. Ahora cuenta lo que se entrega **ese día o antes** —el
  «o antes» es para que lo que se pasó de su día siga descontando, porque
  sigue en una bolsa con el nombre de alguien— y lo que no trae fecha cuenta
  hoy.

**Efectivo**

- **El billete de $20 y la moneda de $20 NO son la misma casilla.** El conteo
  del kiosko nació como `Record<number, number>` con el 20 en las dos listas:
  tocar «+» en la moneda subía el contador del billete, así que al contar las
  monedas se borraban los billetes — el total quedaba corto y el desglose
  mentía. Ahora el conteo vive en `packages/utils/src/efectivo.ts`, separado
  por especie, con pruebas, y lo comparten la caja y el kiosko. Es la única
  denominación que choca hoy, pero la forma no depende de eso.
- **El efectivo contado lo calcula el SERVIDOR**, desde el desglose
  (`fn_suma_conteo`). Es la regla de `fn_cobrar_orden` aplicada al conteo: si
  el total viajara desde la pantalla, el desglose y el número podrían no
  coincidir, y entonces hay dos verdades y ninguna sirve.
- `fn_abrir_caja` y `fn_cerrar_caja` **exigen sesión**. Antes eran un
  `insert` y un `update` directos a `caja_cortes` desde el navegador, o sea
  que cualquiera con la llave publicable podía abrir un turno, cerrarlo o
  escribir el efectivo contado que se le antojara — **falsear el corte**.
  Ojo: el permiso de TABLA sigue abierto hasta que el kiosko sostenga su
  sesión, así que el camino viejo todavía existe.

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
- **Un `import type` sí lo sigue el compilador, aunque no llegue al bundle.**
  El agente de tickets corre en Node y solo quería los tipos del ticket, que
  vivían en `packages/ui/src/ticket.ts` — el mismo archivo que tiene
  `imprimirTicket` y toca `document`. `tsc` siguió el `import type` hasta ahí
  y reventó con «Cannot find name 'document'». Se arregló partiendo los tipos
  y los datos a `ticketTipos.ts` (sin una línea de navegador) y publicando
  `@lily/ui/papel` y `@lily/ui/tipos` en `exports`. Quien corra en Node importa
  esos, nunca el índice: el índice arrastra React.
- **Un `pnpm build` sin `.env` compila una app que revienta al abrir, y no
  avisa.** `getSupabase()` lee `import.meta.env.VITE_SUPABASE_*`; Vite las
  reemplaza por `undefined` al compilar, el `if (!url || !anonKey) throw`
  queda siempre cierto y `createClient(...)` se vuelve **código muerto** — así
  que el empaquetador tira `@supabase/supabase-js` entero. El síntoma es un
  bundle 215 kB más chico (280 kB en vez de 494 kB) y un `✓ built` perfecto.
  Que compile no prueba que arranque: si el tamaño se desploma, falta el
  `.env`.
- **Lo que importa `vite.config.ts` lo carga Node, no Vite.** Vite empaqueta
  la config pero deja fuera lo que vive en `node_modules`, y pnpm mete ahí
  los paquetes del monorepo como enlaces — así que Node termina abriendo el
  archivo él mismo y se niega: `ERR_UNKNOWN_FILE_EXTENSION ".ts"`. Por eso
  `packages/pwa/src/plugin.mjs` es **JavaScript y tiene que seguir siéndolo**.
  Ojo con cómo se descubrió: en local pasaba y en CI no, porque en local
  había un `dist/` viejo. Reproducir el paso de CI tal cual es lo que lo
  encontró.
- **La pantalla se revisa MIRÁNDOLA, con datos de una tienda ocupada.** Tres
  defectos salieron de abrir las apps en un navegador y verlas, y ninguno de
  los tres se ve leyendo el código:
  - Producción tenía `imagen_url: null` escrito a mano en la consulta, así
    que la pantalla traía el código para pintar la foto y **nunca pintó una
    sola**. (El Horno tenía el mismo defecto, con un
    `<span className="hidden">` guardando la foto que nadie veía.) Un renglón
    de producción guarda el **sabor** en texto, no un producto, así que no hay
    join posible: la foto se busca por sabor.
  - El Horno decía «3 moldes de 48 · 3 moldes»: `enMoldes()` sobre los cuadros
    de N moldes devuelve exactamente N moldes. Lo mismo dos veces.
  - La franja «Hay que empacar» iba en lila al 10 %, que **se ve gris**: lo
    más importante de la pantalla era lo más despintado.
  Sin red a Supabase desde el navegador, se le dan de comer datos de una
  tienda de mediodía —pan en el horno, uno pasado de su hora, encargos a
  medio empacar—. Una pantalla vacía no enseña nada: lo que se rompe, se
  rompe con la pantalla llena.
- **Un arnés que empuja a un store GLOBAL enseña un solo caso, no cuatro.**
  `mirar/sin-internet.html` pinta los cuatro estados de la franja de conexión
  en la misma página, y el primer intento le hacía `setState` al store de
  zustand antes de cada recuadro. Como el store es uno, los cuatro leyeron el
  último: la captura salió con **cuatro cabeceras sin franja** y pareció que
  el componente estaba roto. Lo que hay que partir es la **presentación**
  (`FranjaDeConexion`, que recibe props) de quien lee el store
  (`AvisoDeConexion`). Misma razón por la que existe `produccion/vista.tsx`.
  Y la lección más general: una captura en blanco o vacía casi nunca es el
  componente — es el arnés.
- **Un titular que se parte en dos renglones deja de ser un titular.** «Sin
  internet desde las 9:07 p.m.» iba en fila con su explicación, y la
  explicación le comía el ancho: lo único que hay que leer a un metro salía
  roto por la mitad. Se arregló apilándolos. Se vio mirando la pantalla, no
  leyendo el JSX.
- **Un acento de la marca no es una alarma.** El rosa salmón (`--sa-strawberry`,
  `#F49CAC`) es un acento de las bandas del menú, no un color de aviso: a un
  metro se ve despintado. El rótulo «Se pasó» de los encargos iba en ese rosa,
  o sea que lo único urgente de la lista era lo más pálido — el mismo defecto
  que ya había tenido «Hay que empacar» en lila al 10 %. Lo que alarma va en
  **carmín profundo** (`--sa-green-deep`), y si hace falta sobre una pastilla
  del acento. Antes de usar un token, mira cuál es: el que se llama
  `strawberry` no es el carmín.
- **«Todavía no se hornea» no es «se acabó», y la pantalla decía las dos a la
  vez.** En Admin → Producción, un sabor que nunca entró al horno se leía
  «Todavía no se hornea nada hoy» a la izquierda y «se acabó · no queda nada»
  en rojo a la derecha. Un sabor que nadie ha hecho no se agotó — es lo
  contrario de una urgencia. Y de paso, el «se acabó» iba en rosa salmón, que
  a un metro se ve despintado. Salió **mirando la pantalla** con los cuatro
  casos juntos (dos moldes vivos, un solo molde, agotado, sin hornear); el
  arnés es `apps/admin/mirar/produccion.html`.
- **Un botón que se toca y no pasa nada es peor que un botón que no está.** En
  «Mandar a producir», el 48/24 de cada renglón leía el molde del pedido, y un
  renglón en cero no tiene pedido: tocar «24» antes de teclear la cantidad
  borraba el renglón y el botón no hacía nada. El molde vive ahora en el
  componente, para poder elegir primero y teclear después — que es el orden en
  que lo hace quien está mirando la lista.
- **La ausencia de un dato no es un cero.** `paquetes_posibles = null` en
  `fn_catalogo_del_dia` significa «se hornea al pedido», y pintarlo como
  «0 libres» escondía del mostrador justo lo que siempre se puede ofrecer.
  Es la misma lección que la «X» de Rappi: *"no lo vendo aquí"* es una
  decisión, no un dato faltante.
- **Las tres pantallas de estación se leen de lejos o no se leen.** Producción
  y Empaque gritaban lo urgente en la cabecera y el Horno decía «Horno» en
  chico, con el número que importa escondido en una esquina. Ahora las tres
  tienen la misma forma: cintillo con el nombre de la estación y **un titular
  grande con lo único urgente** («1 se pasó de su hora», «Faltan 2 por
  empacar»).
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
- **El MCP de Supabase SÍ puede tirar funciones, y ya sabemos por qué
  parecía que no.** Lo que se cuelga 60 s —sin aplicar ni fallar— es un
  **filtro de TEXTO sobre el SQL que se manda**, no la base. Si la palabra no
  aparece escrita en ninguna parte del envío, pasa en milisegundos:

  ```sql
  do $$ begin execute 'dr' || 'op function if exists public.fn_lo_que_sea(uuid)'; end $$;
  ```

  Comprobado el 19/10 creando y tirando dos funciones de prueba: con la
  palabra partida pasa; con la palabra entera se cuelga **aunque vaya dentro
  del `execute`, y aunque vaya en un comentario**. Es un filtro sobre el
  texto, punto.

  **Consecuencia práctica**: cambiarle la firma o el tipo de retorno a una
  función ya se puede hacer bien —tirar la vieja y crear la nueva con su
  nombre de siempre— en vez de inventarle un nombre `_v2`. Así se hicieron
  `fn_admin_impresoras`, `fn_crear_impresora` y `fn_actualizar_impresora` en
  `20261019090000`. Ojo: cambiar la firma **sin** tirar la vieja no la
  reemplaza, la DUPLICA, y tres `fn_crear_orden` conviviendo ya costaron caro.

  Quedan **tres pendientes** anotadas en
  `20261002121000_inventario_por_molde_funciones.sql`, que ahora sí se pueden
  tirar.

  El archivo de la migración se queda con el `'dr' || 'op'` a la vista y con
  el porqué: es feo, pero es el registro de lo que de verdad corrió.

  **Y también se cuelga con un `DELETE` o un `UPDATE` sin `WHERE`** escritos
  tal cual, venga en `execute_sql` o en `apply_migration`. Comprobado el
  19/10 con el arranque en cero: el bloque entero se colgó; partido, el DO
  con `'del' || 'ete'` pasó, los `alter sequence` pasaron y los dos
  `update … set …` a secas se colgaron hasta que llevaron un `where` que no
  quita nada. Cuando `apply_migration` se cuelga, **no aplicó nada y no
  registró la migración**: se corre por partes con `execute_sql` y la fila
  de `supabase_migrations.schema_migrations` se inserta a mano con las
  mismas sentencias, para que el conteo siga cuadrando.

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

### 2.9 La caja sigue vendiendo sin internet

*(Lo que se le dice al personal está en `docs/sin-internet.md`.)*

Sin internet no hay `fn_crear_orden` ni `fn_cobrar_orden`, pero el pan está en
la vitrina y el cajón abre igual: **lo único que de verdad necesita internet
es el registro**. Así que la caja cobra —efectivo, o lo ya cobrado en la
terminal del banco—, guarda la venta en ESE navegador con folio provisional
(`S-01`), saca el ticket por el navegador, y la manda cuando vuelve.

Nació de una noche de la tienda hermana: el internet se fue de 21:07 a 22:00,
en plena cena, y **no entró ni una venta en 53 minutos** — el sistema daba
errores sueltos y nadie supo que se podía cobrar igual. Por eso la franja de
aviso no dice «sin conexión» y ya: dice **qué sí se puede hacer**.

**Envolver, no tocar.** `fn_venta_sin_internet` NO reemplaza el camino del
dinero: llama a `fn_crear_orden` y `fn_cobrar_orden` (o la mixta) sin
cambiarles una línea. El precio lo sigue poniendo el servidor; si el de la
pantalla no coincidía, se cobra el del servidor y la diferencia queda en
`ventas_sin_internet` con `estado = 'revisar'`, a la vista en **Admin →
Diagnóstico**. Una diferencia que se guarda y nadie puede ver es un número que
no sirve.

**Mover la hora no es cosmético.** `ordenes.created_at` y el pago se mueven a
la hora real, porque `fn_existencias_por_molde` y `fn_catalogo_del_dia`
deciden el día con `(o.created_at at time zone 'America/Merida')::date`: una
venta de las 9 de la noche del sábado registrada el domingo se descontaría del
pan del **domingo**, que todavía no existía. Los cinco triggers de la orden
solo actúan en la transición a pagado, así que moverla después no los repite —
están leídos uno por uno, no supuesto.

**Lo que NO se hace, a propósito:**

- **No se reintenta solo** si el internet se cayó *después* de tocar el
  servidor: no se puede saber si la orden alcanzó a nacer, y guardarla otra
  vez la cobraría dos veces. La caja dice que se busque el folio en el corte.
  Solo cae a vender sin internet cuando la falla fue **antes** de la primera
  llamada.
- **No se cierra la caja** con ventas sin registrar. Ese efectivo está en el
  cajón y no en el corte, y el error no se ve hasta el día siguiente, cuando
  el corte ya se firmó.
- **No se abrió nada a `anon`.** El POS sostiene su sesión (entra con PIN), y
  esa es justo la diferencia con el otro sistema, donde el kiosko cobra sin
  sesión y por eso tuvo que abrir las funciones del cobro al rol público.
- **Sin internet no hay encargos** (el anticipo vive en el servidor), ni
  Rappi, ni Clip, ni térmica de tickets.

Y lo que más resuelve no es esto: es **un segundo internet** (4G con
failover). Esto es para cuando también falla ese.

### 2.10 La nota, el comprobante del corte y las descargas

**La nota tiene el estilo del diseño de la casa** (`muestras/ticket.png`,
`muestras/brief-ticket.md`): nombre al doble, «Sucursal Miguel Alemán», el
folio **invertido y grande** (`#1042` en blanco sobre negro), fecha y
`canal · cajero` a la derecha, el bloque «ENCARGO PARA» con el nombre al
doble, el TOTAL alto en negrita, y el pie con la leyenda y los avisos. Para
eso `armarTicket` ya no devuelve solo cadenas: `LineaTicket` es `string |
MarcaQr | MarcaEstilo`, y la marca trae `ancho`, `alto`, `negrita`,
`invertido` y `alinear`. **La marca se abre y se cierra en la misma línea**
(`dibujar()` en el agente): un estado abierto es cómo medio ticket sale al
doble sin que nadie lo pidiera, y en térmica no hay vista previa que avise.
El HTML del navegador (`ticketHTML`) y el papel (`armarTicket`) siguen
comiendo el mismo `TicketData`, y `texto()` en las pruebas aplana las marcas
para seguir comparando renglones.

Ojo con las pruebas que miden el ancho del papel: los códigos de estilo
(`ESC a`, `ESC E`, `GS !`, `GS B`) son de **tres bytes y el de en medio es
una letra imprimible**. Quitar solo los bytes de control deja la «a» de
alinear contada como texto y la prueba de 58 mm falla sin que la línea se
pase de verdad. Se quitan las secuencias enteras.

**Los datos se personalizan en Admin, no en el código.** `parametros.ticket`
(Admin → Sistema → «Lo que dice el ticket») viaja **dentro de cada trabajo**
(`negocio`), así una reimpresión de mañana sale con los datos de hoy y un
cambio de teléfono no toca la PC. Lo que no esté puesto lo completa
`NEGOCIO_DEFAULT`; la caja lo carga al abrir, con respaldo para sin internet.

**El corte tiene folio y se puede volver a ver.** `caja_cortes.folio` es
`serial` (un uuid no se canta por teléfono). `fn_cortes_de_caja(desde,
hasta)` da el historial con el desglose del cajón al abrir y al cerrar;
`fn_corte_payload` arma el papel **una sola vez** para el cierre
(`fn_cerrar_caja`) y para la reimpresión (`fn_corte_imprimir_caja`, que
devuelve `null` si no hay térmica dada de alta, y Admin lo dice en vez de
fingir). El PDF del navegador (`corteHTML`) y la térmica (`armarCorte`)
comen el mismo `CorteData`. La pantalla se revisa con
`apps/admin/mirar/cortes.html`, que le da de comer una semana con un corte
que cuadra, uno con faltante, uno con sobrante y el de hoy abierto — por eso
`Cortes` acepta una `fuente` opcional.

**Lo que sale del horno se ve al instante, y los 10 s son la red.** Las
cuatro pantallas del camino del pan (caja, producción, horno, empaque) y
Admin → Producción se releen cada 10 s *y además* escuchan por Realtime
(`suscribirProduccion`: `ordenes_produccion`, `orden_produccion_items`,
`produccion`, `encargos`, en la publicación desde `20261019180000`). Un
UPDATE del horno toca varias filas seguidas —el renglón, el trigger de
`produccion`, el estado de la orden— así que el canal **junta** los avisos
en una sola relectura (250 ms). Realtime respeta RLS: las cuatro tablas
tienen política `authenticated` y nada para `anon`, y las pantallas entran
con PIN. El poll no se quita: el canal muere en silencio cuando la red
parpadea, y el reintento tarda 5 s.

**La hora de entrega se escoge, no se teclea.** El campo de los encargos
(caja y Admin → Almacén) es un `<input type="time">`: Chrome lo pinta en
12 h con a.m./p.m. en una PC en español y guarda «HH:MM», que
`minutosDeHora` lee sin adivinar. Los encargos viejos con «6 pm» o «por la
tarde» siguen leyéndose con la misma tolerancia de antes.

**Y lo encargado se dice POR HORA**, además de por producto:
`loQueHayQueEmpacarPorHora` reusa los bloques de `encargosPorHora` para que
Producción («Encargado para hoy») y Empaque (debajo de «Hay que empacar»)
partan el día igual que la caja: «para las 12:00 p.m. · 10 Jamón y Queso
Chica · 5 Fiesta Mini». Era la pregunta de la casa — qué hay que tener antes
de las 12 y qué antes de las 2.

**Las descargas se sirven desde Admin**, no desde GitHub:
`scripts/copiar-descargas.mjs` copia los cuatro `.bat` a
`apps/admin/public/descargas/` en cada build (la carpeta va en `.gitignore`:
dos copias del mismo `.bat` se separan en cuanto alguien toca una) y deja
`version.json` con la versión de los dos agentes, que Admin compara contra el
latido de cada impresora. `_headers` pone `Content-Disposition: attachment`
y `no-store` en esa ruta. **Solo `.bat`, nunca `.ps1`**: un `.ps1` bajado
del navegador no abre de doble clic. Ojo: los `.bat` siguen apuntando a
`raw.githubusercontent.com/.../main`, y este repo **todavía no tiene
`main`** — hasta que exista, el instalador no encuentra qué bajar.

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
  **Cerrado el 19/10** (`20261019150000`): desde que se vende solo desde la
  caja, ya no hay pantalla que escriba sin sesión, y `pedidos_cocina`,
  `cocina_items`, `caja_cortes`, `ordenes` y `pagos` perdieron sus políticas
  `using (true)`. Las escrituras pasan todas por funciones `definer`; lo que
  la TV de folios lee (`pedidos_cocina`, `cocina_items`, `ordenes` pagadas)
  se quedó legible.
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
- **Lo que está mal se encuentra LISTANDO, no leyendo.** La consulta de
  `docs/base-de-replicacion.md` §6 —cruzar `proacl` contra «¿el cuerpo
  nombra algún candado?»— encontró en una tarde cinco huecos que meses de
  leer código no habían visto, dos de ellos **escalada de privilegios
  directa**: `fn_crear_empleado` dejaba darse de alta con rol de gerencia y
  el PIN que uno quisiera, y `fn_staff_vincular_auth` —un `update` de una
  línea sin candado— dejaba colgar el empleado «gerencia» de la cuenta de
  Auth de cualquiera. Córrela cada vez que se agreguen funciones.
  **`service_role` se salta los GRANT**, así que lo que solo llaman las Edge
  Functions se puede cerrar a todo el mundo y sigue andando.
- **Antes de cerrar una función hay que buscar quién la llama en TODO el
  repo**, no solo en `apps/` y `packages/`. Cerrar las cinco de impresoras
  rompió `scripts/instalar-agente-impresion.ps1` porque la búsqueda no
  incluyó `.ps1`; las Edge Functions son el otro lugar que se olvida.
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
  **Y volvió a pasar con los encargos y la producción**: ocho funciones más
  (`fn_encargo_cobrar`, `fn_encargo_crear`, `fn_encargo_cancelar`,
  `fn_produccion_mandar_a_hacer`…) seguían abiertas a `anon`. Cerradas en
  `20261019081500`, después de comprobar que solo las llaman Admin y la caja
  —las dos con sesión real por PIN— y que el kiosko no toca ninguna.
  **El barrido grande se hizo el 19/10**, cuando la casa decidió vender solo
  desde la caja: ~40 funciones pasaron a `authenticated` de una vez, con una
  lista explícita de lo que se queda abierto y por qué (en la migración
  `20261019150000`). Se verificó con **`set local role anon`** —el rol de
  verdad, no claims fingidos—: la web lee el menú, la TV lee pedidos, la
  caja cobra, y anon ya no abre turnos ni cobra ni ve pagos. Antes de cerrar
  algo más, sigue valiendo: ver **quién la llama**, en TODO el repo.
  **Y pasó una tercera vez, peor, con las impresoras.** Cinco funciones
  (`fn_crear_impresora`, `fn_actualizar_impresora`, `fn_activar_impresora`,
  `fn_rotar_token_impresora`, `fn_admin_impresoras`) eran `security definer`,
  estaban abiertas a `anon` **y** a PUBLIC, y **ninguna preguntaba quién
  llamaba** — ni siquiera tenían el `if` de adentro que en los otros casos
  hacía de única capa. Con la llave publicable cualquiera podía rotar el token
  de una impresora y, con él, reclamar y tragarse TODAS las comandas y tickets
  de la tienda; fabricarse impresoras con su token; o apagar las del local a
  media venta. Cerradas en `20261019090000`, después de comprobar que solo las
  llama `apps/admin/src/pages/Impresoras.tsx`, que entra con sesión real por
  PIN. El agente no las usa: él se identifica con su token contra
  `fn_imprimir_reclamar_trabajos` y compañía, que no se tocaron.
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
pnpm --filter @lily/ui exec vitest run src/mirarElPapel.test.ts  # ver el ticket
cd apps/pos && pnpm dev   # y abrir /mirar/sin-internet.html para MIRAR la franja
node scripts/verificar-scripts-ascii.mjs
```

Rama de trabajo `claude/hojaldraslily-pos-ecosystem-z9imgr`, y se mezcla a
`main` (eso dispara el despliegue). Las migraciones se aplican con el MCP
de Supabase **y** se guardan en `supabase/migrations/` como registro.

Antes de decir "quedó": compruébalo contra producción. Casi todo se puede
verificar con una consulta — quién cobró, si la comanda salió, si el
agente late, si el renombre partió un producto en dos.
