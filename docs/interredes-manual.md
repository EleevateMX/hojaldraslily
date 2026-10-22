# Interredes Remotas (Banorte): lo que dice el manual y qué falta

*(20/10/26. La casa entregó el **Manual de Integración Interredes Remoto
V1.8.1** de Banorte/Payworks, de septiembre de 2026, con sus nueve anexos.
Esto es lo que dice, contrastado con lo que el sistema ya tiene. Corrige a
`docs/terminal-banorte.md` y a `docs/banorte-que-pedir.md`, que se
escribieron sin el manual y acertaron en el qué pero no en el cómo.)*

**Respuesta corta: sí sirve, y es mejor de lo que se creía.** La pinpad
actual (PAX A920Pro) se cobra por una **API REST con JSON**, no por un
puerto COM. Eso significa que el cobro con Banorte va **igual que con
Clip**: una Edge Function con los secretos del lado del servidor, nada
instalado en la PC de la tienda, y funciona aunque la PC esté apagada.
Lo que falta son **cuatro datos** que hay que pedir (§4) y un día y medio de
trabajo contra el ambiente de pruebas (§5).

---

## 0. Comprobado el 20/10: la API contesta desde Supabase

**El 22/10 quedó claro de qué es la credencial que dio Banorte, y por qué
no abre la API.** El usuario motor y su contraseña (más la «llave») son del
camino **DLL/directo**, no del login de la API. Corroborado contra el manual:
el DLL (Anexo III/IV, `PINPAD.TPV`) habla **directo a la pinpad** —`PPSetCommPort`
o `PPSetIPAddressPort` al puerto 1818— y se autentica con `PPSetUser` /
`PPSetPassword` (el usuario motor) y `PPSetGroup`; **no toca
`posbridgetpv` ni el `/login`**. Por eso TPV Solutions dice, con razón, que
«con eso funciona por DLL». Pero el DLL es una librería de **Windows** que
corre en la PC de la tienda: para una caja en la nube habría que montar un
puente local (modelo del agente de Clip), atando el cobro a que la PC esté
encendida. El camino de la API (Anexo IX), que es el que tenemos, necesita
un login **aparte** que TPV Solutions emite tras dar de alta el comercio en
**TPVAdmin**; ese alta es lo que falta. Dos caminos, dos credenciales: la
que tenemos es la del DLL; la que falta es la de la API.

Se le preguntó a la API desde el mismo sitio desde el que cobraría la caja
—una Edge Function— con un usuario inventado, y contestó:

```
POST /api/v1/pinpad/login  {username:"prueba", password:"prueba"}
→ 500  {"title":"Internal Server Error","detail":"El cliente prueba no existe.", …}
```

Eso es la respuesta buena: la API está viva, leyó el JSON y fue a buscar al
usuario. Con las credenciales de verdad la misma llamada devuelve el token.
**La sonda quedó desplegada** (`supabase/functions/interredes-probar`): el
día que lleguen las credenciales se ponen en los secrets del proyecto
(`INTERREDES_API_USER`, `INTERREDES_API_PASSWORD`, **nunca en el chat ni en
el repo**), se llama la función y `con_intermedio.token: true` es «entramos».
Hasta entonces usa las falsas y lo dice (`credenciales: "falsas"`).

Dos cosas que salieron de probar y que no están en el manual:

- **El servidor manda su certificado dos veces y no manda el intermedio de
  Sectigo.** Un navegador en Windows lo acepta porque va a buscar el
  intermedio solo; curl, pg_net y Deno no, así que un `fetch()` a secas desde
  la Edge Function rebota con `invalid peer certificate: UnknownIssuer` antes
  de mandar un byte. `supabase/functions/_shared/interredes.ts` confía
  explícitamente en ese intermedio («Sectigo Public Server Authentication CA
  DV R36», verificado con `openssl verify` contra la raíz R46 que ya está en
  todos los almacenes): se verifica la misma cadena que un navegador, con el
  eslabón que el servidor olvidó. La sonda hace los dos intentos y enseña
  los dos resultados a propósito. Hay que **pedirle a TPV Solutions que
  arregle su cadena** (punto 6 del mensaje de §4); cuando lo hagan, el pin
  sobra y no estorba.
- **Los errores vienen como `application/problem+json`** (RFC 7807):
  `{type, title, status, detail, instance, description}`, y un usuario que no
  existe es un **500**, no un 401. El texto útil va en `detail`. Hay que
  leerlo así en `interredes-cobrar`: un 500 de esta API no es «se cayó».

Y una más, que es nuestra: la URL `http://` (sin s) del mismo host **no
contesta** (se queda esperando hasta el timeout). No hay camino sin TLS,
que es lo correcto.

---

## 1. Lo que el manual dice, y lo que cambia

### Hay DOS formas de integrarse, no una

| | Para qué pinpad | Cómo habla la caja | Dónde viviría |
|---|---|---|---|
| **DLL `PINPAD.TPV`** (Anexos III, IV, V, VIII) | Las de antes, por serial (COM), Ethernet o WiFi al puerto 1818 del aparato | Llamadas a un DLL de Windows (`PPSetCommand`, `PPSendTxn`, `PPGetPaywResult`…) o a librerías Android/iOS/Java | En la PC de la tienda, con un puente porque Node no llama DLL |
| **Interredes Remotas API** (Anexo IX) | **PAX A920Pro**, por WiFi | **HTTPS + JSON** a `https://posbridgetpv.tpvsolutions.com.mx/`, con un token JWT de 2 h | **En una Edge Function**, como Clip |

`docs/terminal-banorte.md` describió el primer camino porque era el único
del que había rastro público. **El que aplica a Lily es el segundo**, siempre
que la pinpad sea la A920Pro (es la que el manual llama «el modelo de este
manual»). Es lo primero que hay que confirmar mirando el aparato.

### Cómo cobra la API (Anexo IX)

```
POST /api/v1/pinpad/login            {username, password}            → {status, token}   (token vive 2 h)
POST /api/v1/pinpad/transaction/key  {controlNumber, mode, password, serialPinpad, timeout, user}
POST /api/v1/pinpad/transaction/sale {
  controlNumber: "0007",            ← nuestro folio, único por afiliación (≤ 30 alfanum.)
  customerRef1: "", customerRef3: "",
  customerRef5: "PaxInterredAPI",   ← SIEMPRE ese valor, lo exige el manual
  deferment: "", paymentNumber: "", planType: "",   ← solo meses sin intereses
  group: "761015",                  ← identificador de grupo/caja (obligatorio para el cierre)
  mode: "PRD" | "AUT" | "DEC" | "RND",   ← producción, o simulación aprobada/declinada/al azar
  password: "…", user: "…",         ← las credenciales de PAYWORKS, en cada transacción
  serialPinpad: "123456789",        ← número de serie de la pinpad (en PAX: "0" + últimos 8)
  timeout: "90",
  transactionAmount: "4301"         ← en pesos; CON punto decimal para centavos ("100.01")
}
```

Y aparte: `refund` (devolución, con `paywReference` + `authCode` de la venta),
`void` (cancelación del día, mismos datos), `void2` (cancela una venta con
validación en curso), `transaction` (verificación por `controlNumber` o
`paywReference`), `settlement` (cierre de lote por `group`), más
preautorización, reautorización y cashback, que aquí no se usan.

La respuesta es lo que en el DLL se lee con `PPGet*` (Anexo V): `paywResult`
**A** aprobada / **D** declinada / **R** rechazada / **T** sin respuesta,
`paywCode` (motivo del rechazo), `text`, `affiliation`, `controlNumber`,
`authCode`, `paywReference` (**la referencia que hay que guardar** para
cancelar o devolver), `cardType` (crédito/débito), `cardBrand`,
`issuingBank`, `pan` enmascarado, `entryMode` (CHIP, CONTACTLESSCHIP,
BANDA…), `pinRequested` (1 = con PIN, 2 = QPS, 0 = con firma), y los tags
EMV `appId` (AID), `appLabel`, `appPrefName`, `tvr`. **Los nombres exactos
de las claves JSON de la respuesta no vienen escritos en el anexo** (las
peticiones sí, en capturas de pantalla): se confirman con la primera llamada
en modo `AUT`, que no cobra nada.

### Lo que esto cambia respecto al análisis anterior

- **No hay puerto COM, no hay DLL, no hay driver.** La pinpad se conecta al
  WiFi del local (Anexo II: botón verde → Configurar → WIFI → red → WPA →
  contraseña → DHCP sí; a partir de la versión PIPA35J pide la clave
  `26813`), y de ahí habla con la API y con Banorte por su cuenta.
- **El cobro no depende de la PC de la tienda.** Va en una Edge Function con
  los secretos en Supabase, igual que `clip-crear-cobro`. Se puede cobrar
  desde la caja en la PC, en la tableta o donde sea.
- **La respuesta es síncrona.** La API espera hasta `timeout` segundos (90
  por omisión) y contesta aprobada o no, con el código de autorización. No
  hay webhook que escuchar ni cola que barrer; lo que sí hay es la
  **verificación** (`/transaction`) para cuando el internet se cae a media
  operación y no llegó respuesta: se pregunta por nuestro `controlNumber`
  antes de reintentar, que es la lección de Clip (§2.3 de CLAUDE.md).
- **Hay modo de pruebas sin cargo real**: `mode = AUT` siempre aprueba, `DEC`
  siempre declina, `RND` al azar. Se desarrolla y se certifica contra eso, y
  **al pasar a producción se cambia a `PRD`**; una venta mandada en `AUT`
  por error «no existe forma de reprocesarla» (lo dice el manual, y es el
  tipo de error que no se ve hasta el corte).
- **Certificación obligatoria antes de cobrar de verdad.** Se piden dos
  documentos a `L.soporte_payworks_Interredes@banorte.com` (una *Solicitud
  de certificación* en Word y una *Matriz de pruebas* en Excel), se corren
  las transacciones de la matriz, el laboratorio las revisa y emite una
  **Carta de Certificación**. Cobrar en producción antes de eso deja al
  comercio sin respaldo del banco ante contracargos ni abonos.

---

## 2. Lo que ya tenemos (y encaja sin tocar pantallas)

| Qué | Dónde | Estado |
|---|---|---|
| La interfaz `PaymentProvider` (`createPayment`, `getPaymentStatus`, `cancelPayment`, `refundPayment`) | `packages/payments/src/types.ts` | Lista; Banorte es otra implementación |
| El patrón «Edge Function con secretos + el navegador nunca ve credenciales» | `supabase/functions/clip-*`, `clipProvider.ts` | Se calca |
| El botón **Terminal** en el cobro, con los tres botones iguales | `apps/pos/src/pages/Cobro.tsx` | No cambia |
| El dinero lo calcula el servidor y el cobro es idempotente | `fn_crear_orden` / `fn_cobrar_orden` | No cambia: Banorte cobra un monto ya decidido |
| Registro del pago con su referencia externa, para el corte | `pagos` (`proveedor`, `proveedor_payment_id`, `raw`) | Se usa igual; `paywReference` va ahí |
| El ticket se arma desde un solo dato y sale en térmica o navegador | `@lily/ui` (`armarTicket`, `ticketHTML`) | Hay que **agregarle el voucher** (§3) |
| Los datos del negocio editables en Admin (nombre, dirección, teléfono) | `parametros.ticket` | Sirven tal cual para el voucher |
| La caja con sesión real y sin internet | `fn_venta_sin_internet` | Sin internet no hay Banorte, igual que no hay Clip |

**La casa tiene además usuario y contraseña de Interredes.** Hay que saber de
cuál de los **dos** juegos de credenciales se trata, porque el manual pide
los dos:

1. **Las de Payworks** (usuario tipo `C8608575` + contraseña), que manda
   `notificaciones@banorte.com` en dos correos separados al dar de alta la
   afiliación. Van **dentro de cada transacción** (`user`, `password`) y
   también abren la consola de comercios
   (`multicobros.banorte.com/internet/CIBV2/`), donde se ven las
   transacciones de 90 días. El manual pide **cambiar la contraseña** al
   recibirla y **crear un usuario de solo ejecución** para la integración —
   es el que iría en los secretos, no el de administrador.
2. **Las del API de TPV Solutions** (`username`, `password` del
   `/pinpad/login`), «los accesos que compartió el proveedor». Son otras.

Si lo que Kenny tiene abre la consola de multicobros, son las primeras.

---

## 3. Lo que ya está escrito (20/10, tarde) y lo que sigue faltando

*(La casa decidió ese mismo día que la terminal es Banorte y solo Banorte:
el cron de Clip se apagó y su código se queda de referencia hasta que esto
esté certificado.)*

**Ya está, desplegado y con el camino del dinero sin tocar:**

1. **`supabase/functions/interredes-cobrar`**, sobre `_shared/interredes.ts`
   (login con token en memoria, `sale`, `void`, verificación). La caja le
   manda la orden; la función lee el total **del servidor**, escribe el
   intento en `terminal_intentos` (idempotencia y rastro), manda la venta a
   la pinpad con `mode` del secreto `PAYWORKS_MODE`, y si se aprueba
   registra la venta por **`fn_cobrar_orden` / `fn_cobrar_orden_mixto` /
   `fn_encargo_entregar_con_venta`** — el mismo camino que efectivo. La
   respuesta cruda queda en `pagos.proveedor_payload`. Si la red no contesta,
   **verifica por `controlNumber`** antes de rendirse; si la tarjeta se
   aprobó y la venta no entró, **anula en la misma llamada**. Solo con sesión
   del personal (`fn_es_staff`), probado: la llave publicable sola recibe 403.
2. **`interredes-cancelar`**: la cancelación del día (`void` con
   `paywReference` + `authCode`), solo gerencia. Marca el pago y la orden
   cancelados. Todavía **sin botón** en pantalla.
3. **`@lily/payments` → `obtenerTerminal()` / `BanorteTerminal`**, una
   interfaz propia (síncrona: una pregunta, una respuesta) en vez de
   `PaymentProvider`, que era la forma de Clip con sondeo y webhook. La caja
   (`Cobro.tsx`) cobra «Terminal» y «Mixto» por ahí, enseña «Cobra en la
   terminal $X» mientras espera, y **cae al cobro manual** si la función
   contesta `no_configurado`.
4. **El voucher en el ticket** (Anexo VII): `TicketData.tarjeta`, pintado
   igual por `armarTicket` (térmica) y `ticketHTML` (navegador), con prueba
   de que coinciden y de que **solo salen los últimos 4** de la tarjeta.
   Con NIP imprime «AUTORIZADO CON FIRMA ELECTRÓNICA»; con firma, la raya;
   QPS, nada.

**Lo que sigue faltando, y todo es de la casa o del proveedor:**

1. **Los siete secretos** en Supabase (`supabase/functions/README.md` dice
   cuál es cada uno y quién lo da). El 20/10 estaban puestos los dos de la
   API, pero el usuario capturado no existía en TPV Solutions.
2. **La primera venta en modo `AUT`**, que aprueba sin cobrar: ahí se
   confirman los **nombres de las claves JSON de la respuesta** (el anexo no
   los trae; `leerResultado` los busca sin importar mayúsculas ni nivel, y
   si alguno no aparece se ajusta ahí y en ningún otro lado) y los campos
   exactos de `void` y `/transaction`.
3. **El botón de cancelar del día** en la caja (con PIN de gerencia), sobre
   `interredes-cancelar`, que ya existe.
4. **La devolución** (`refund`, para otro día) — sin botón ni función
   todavía; hoy es un trámite con el banco.
5. **La certificación**, como la explicó Banorte el 22/10: **cuatro
   operaciones con su voucher** —carga de llaves, verificación, venta con
   chip y venta contactless— y se hace **en producción** (`PRD`), con
   tarjeta de verdad y montos chicos, cuando terminemos nuestras pruebas.
   Las cuatro ya existen: `interredes-llave` (carga de llaves, gerencia),
   la verificación dentro de `interredes-cobrar`, y las dos ventas son la
   caja con «Terminal». Falta un botón de **verificación suelta** para
   enseñársela al laboratorio, y llenar la matriz con afiliación, número de
   control, referencia, fecha y hora de cada una.
6. **El cierre de lote** (`settlement` por `group`), si Banorte lo exige
   desde la caja y no lo hace solo la pinpad. Se sabrá en la certificación.

**La pinpad que instaló TPV Solutions** (22/10/26, reporte de servicio
folio 015117, ODT 2869608): es una **Verifone V660p (Android)**, no la PAX
A920Pro del manual, con la aplicación de Interredes **PIPA36A1** (la misma
familia que el manual llama PIPA35J), aplicativo «Retail», serie
**713537969** (así, sin guiones, va en `PINPAD_SERIAL`: ya son 9 dígitos),
afiliación **7156971**. La pantalla dice «Llave no inyectada, cargar
llave» y muestra un «Folio: 1330616» que no es la serie ni la afiliación:
probablemente es su alta en el TPVAdmin, y es candidato a ser el `group`
— hay que confirmarlo con TPV Solutions, no suponerlo. La carga de llaves
es justo `interredes-llave`, pero necesita antes el `login` de la API.

**Los dos usuarios, con los nombres que usa Banorte** (22/10): el **usuario
motor** es el que manda las transacciones —es `PAYWORKS_USER` /
`PAYWORKS_PASSWORD`, el que va dentro de cada venta—; el **usuario
multicuentas** (multicobros) es el de la consola de reportes y no entra en
ninguna venta. Y aparte están los de la **API de TPV Solutions**, que ni
Banorte ni Payworks ven: esos abren el `login`.

---

## 4. Los cuatro datos que faltan (y a quién pedírselos)

| # | Dato | Quién lo tiene |
|---|---|---|
| 1 | **¿La pinpad es una PAX A920Pro?** (modelo, y si ya está conectada al WiFi del local). Si es otro modelo, el camino es el DLL y hay que volver a `docs/terminal-banorte.md` | Kenny, mirando el aparato |
| 2 | **El número de serie de la pinpad** (`serialPinpad`): en PAX se manda «0» + los últimos 8 dígitos; y confirmar que ese serie esté **vinculado a la afiliación** en Payworks (si no, el error es «no se encontró una terminal válida para el dispositivo con número de serie X» y se pide por correo a soporte con afiliación + serie) | Kenny (serie) · soporte Payworks (vínculo) |
| 3 | **Las credenciales del API de TPV Solutions** (`username`/`password` del `/pinpad/login`) y el **`group`** que les corresponde | El ejecutivo de Banorte / el proveedor |
| 4 | **Las credenciales de Payworks de solo ejecución** y el **número de afiliación**; confirmar si el acceso que ya tienen es este | Kenny (el correo de `notificaciones@banorte.com`) |

Y una pregunta que no es un dato: ¿la afiliación ya está en **producción**
(`PRD`) o todavía en pruebas? Se sabe por el correo de alta.

### El mensaje para el ejecutivo de Banorte (o para `L.soporte_payworks_Interredes@banorte.com`)

> Buen día. Somos Hojaldras Lily (Mérida). Ya tenemos la afiliación y la
> pinpad, y vamos a integrar nuestro punto de venta con **Interredes Remotas
> por la API** (Anexo IX del manual V1.8.1). Para empezar necesitamos:
>
> 1. Las credenciales de acceso a la **API de TPV Solutions**
>    (`posbridgetpv.tpvsolutions.com.mx`, el `username` y `password` del
>    `/pinpad/login`) y el **`group`** asignado a nuestra caja.
> 2. Confirmar que el número de serie de nuestra pinpad **[serie]** está
>    vinculado a la afiliación **[afiliación]**, y cómo debe enviarse en
>    `serialPinpad` para ese modelo.
> 3. Confirmar si la afiliación opera ya en producción o en pruebas, y en qué
>    momento se cambia.
> 4. Los dos documentos de certificación (**Solicitud de certificación** y
>    **Matriz de pruebas**), para agendar la certificación cuando terminemos
>    las pruebas en modo AUT.
> 5. Un ejemplo del **JSON de respuesta** de `/transaction/sale` (el anexo
>    trae las peticiones pero no la respuesta).
> 6. Que el servidor `posbridgetpv.tpvsolutions.com.mx` **envíe la cadena de
>    certificados completa**: hoy manda el certificado del dominio dos veces
>    y no el intermedio de Sectigo («Sectigo Public Server Authentication CA
>    DV R36»). Los navegadores lo toleran, pero cualquier cliente de servidor
>    (curl, Node, Deno) rechaza la conexión.
>
> Nuestra integración está en Node/TypeScript y no instala nada en la
> computadora de la tienda: habla con la API por HTTPS.

---

## 5. Cuánto trabajo es

Con los cuatro datos en mano:

| Parte | Tamaño |
|---|---|
| Edge Functions (`cobrar`, `cancelar`, `devolver`, `verificar`) con login, token y reintento por verificación | Medio día |
| `banorteProvider.ts` + elección de proveedor por sucursal | Chico |
| El voucher en `TicketData`, térmica y navegador, con prueba | Medio día |
| Botón de cancelación del día en la caja | Chico |
| Pruebas en `AUT` y llenar la matriz de certificación | Medio día, con la casa |

**Un día y medio**, y después la certificación, que la tarda el laboratorio.
Ninguna pantalla cambia salvo el ticket (que gana el voucher) y el botón de
cancelar.

## 6. Mientras tanto

Clip sigue escrito y probado. Lo sensato sigue siendo **abrir con lo que ya
funciona** si Banorte tarda, y mover la terminal cuando lleguen los datos de
§4: con `PaymentProvider` el cambio no toca la caja.
