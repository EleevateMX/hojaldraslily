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

## 3. Lo que falta de nuestro lado

1. **`supabase/functions/interredes-cobrar`** (y `-cancelar`, `-devolver`,
   `-verificar`): login a la API con el token en memoria (2 h), `sale` con
   `mode` leído de un secreto (`AUT` en pruebas, `PRD` en producción),
   `controlNumber` = folio de la orden + intento, y el resultado guardado
   **crudo** en `pagos.raw` antes de interpretarlo. Si no hay respuesta
   (`T`, timeout o red), **verificar por `controlNumber`** antes de dar por
   fallado. Secretos: `INTERREDES_API_USER`, `INTERREDES_API_PASSWORD`,
   `PAYWORKS_USER`, `PAYWORKS_PASSWORD`, `PINPAD_SERIAL`, `PAYWORKS_GROUP`,
   `PAYWORKS_MODE`. **Nunca en el repo ni en el chat.**
2. **`banorteProvider.ts`** en `packages/payments`, implementando
   `PaymentProvider` contra esas funciones, y el `if` en
   `obtenerPaymentProvider()` que hoy tiene a Clip escrito duro (que elija
   por un parámetro de la sucursal, no por código).
3. **El voucher en el ticket.** El Anexo VII obliga a imprimir, para una
   venta con tarjeta: «Banorte», número de afiliación, nombre, dirección y
   teléfono del comercio, fecha y hora, tipo de operación, **número de
   control**, **Terminal ID**, importe, **últimos 4 dígitos**, **código de
   autorización** (o motivo del rechazo), **referencia**, marca de la
   tarjeta, crédito/débito, banco emisor, y la validación: la línea de firma,
   o **«AUTORIZADO CON FIRMA ELECTRÓNICA»** si hubo PIN, o nada si fue QPS.
   Con chip se agregan **AID, TVR, TSI, Application Preferred Name** (o
   Application Label). Contactless menor a $1,000 **no imprime voucher** al
   cliente. Todo eso ya viene en la respuesta; es un bloque nuevo de
   `TicketData` (`tarjeta?: {...}`) que `armarTicket` y `ticketHTML` pintan
   igual, con su prueba de que los dos coinciden.
4. **La cancelación del día desde la caja** (`void` con `paywReference` +
   `authCode`), que hoy no existe como gesto porque con Clip no hacía falta.
   Un cobro aprobado y una venta que no se concreta es el caso que más
   pasa; sin este botón, el reembolso es un trámite con el banco.
5. **La matriz de certificación**: correr contra `AUT` las transacciones que
   el laboratorio pida (venta, cancelación, devolución, verificación, cierre)
   y llenar el Excel con afiliación, número de control, referencia, fecha y
   hora de cada una. Eso es un día de la casa con nosotros al lado.

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
