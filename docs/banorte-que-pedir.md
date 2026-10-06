# Banorte: qué se necesita para habilitarlo

Hoja práctica. El análisis completo —qué ofrece Banorte, por qué el camino de
e-commerce no sirve y de dónde salió cada dato— está en
`docs/terminal-banorte.md`. Esto es solo **qué hacer**.

---

## Dos cosas deciden todo lo demás

**1. ¿La afiliación incluye INTERREDES?**

- **Sí** → se puede integrar. Sigue el resto de esta hoja.
- **No, es terminal suelta** → **no hay nada que programar.** La terminal es
  una caja aparte: la cajera teclea el monto a mano, y el sistema nunca se
  entera de si se cobró. El corte de caja se cuadra a mano contra el reporte
  de la terminal.

El nombre exacto que hay que pedir es **«Banorte Interredes Web»**. Pedir
«una terminal» a secas trae lo otro.

**2. ¿El negocio ya tiene tres meses de historial?**

Banorte pide, para la afiliación, **estados de cuenta y declaraciones de
impuestos de los últimos tres meses** y buen historial en Buró. Lily está
**pre-apertura**: todavía no los tiene. Esto no es un trámite más, es una
puerta — puede que Interredes no se pueda contratar hasta que la tienda lleve
unos meses vendiendo.

Hay que preguntarlo **antes** de hacer cualquier otra cosa, porque si la
respuesta es «faltan tres meses», la decisión ya está tomada: se abre con
Clip y Banorte se ve después.

No se escribe una línea de código hasta tener estas dos respuestas por
escrito.

---

## 1. Lo que hay que contratar con el banco

Requisitos de contratación, de la propia ficha de Interredes:

- [ ] **Cuenta de cheques Banorte** (persona moral o PFAE)
- [ ] **Acta constitutiva** (si es persona moral)
- [ ] **Identificación del representante legal**
- [ ] **RFC** y comprobante de domicilio del negocio
- [ ] **Estados de cuenta y declaraciones de impuestos de los últimos 3 meses**
- [ ] **Buen historial en Buró de Crédito**
- [ ] **Contrato de afiliación** como comercio
- [ ] **Servicio Interredes Web** (es aparte de la terminal)

Y del lado operativo, cosas que **ya están resueltas** con la compra de la
caja (`docs/hardware-caja.md`):

- [x] Conexión a internet en la tienda
- [x] Sistema de punto de venta — es este
- [x] Impresora para el comprobante — la térmica de 80 mm

Falta una que sí la pone el banco:

- [ ] **API Banorte**: el conector que entrega el propio banco. Sin él no hay
      integración, y es lo que hay que pedir por escrito junto con su manual.

Del contrato salen tres datos que son los que el sistema necesita:
**ID de Afiliación**, **usuario** y **contraseña**. Más un usuario adicional
que se genera en el portal de Banorte para que el punto de venta pueda hablar
con la pinpad.

---

## 2. El correo para el ejecutivo

Se puede copiar tal cual:

> Buen día. Estamos integrando nuestro punto de venta con la terminal y
> necesitamos confirmar lo siguiente:
>
> 0. El negocio **acaba de abrir**, así que todavía no tenemos tres meses de
>    estados de cuenta ni de declaraciones. ¿Se puede contratar **Interredes
>    Web** de todas formas, o hay que esperar? Si hay que esperar, ¿cuánto?
> 1. ¿Nuestra afiliación incluye **Interredes Web**, o solo la terminal
>    independiente?
> 2. ¿Nos pueden enviar el **manual de integración de Interredes** (el
>    técnico, con los mensajes y los códigos de respuesta)?
> 3. ¿Qué **modelo de pinpad** nos entregan y cómo se conecta: USB, serial o
>    Ethernet?
> 4. El **API Banorte** que ustedes entregan, ¿en qué forma viene: un
>    **DLL/ActiveX de Windows**, un ejecutable, o se puede hablar por **socket
>    TCP** o por servicio web? Nuestro sistema está hecho en Node.js y corre
>    sobre Windows.
> 5. ¿Hay **ambiente de pruebas** con tarjetas de prueba? ¿Cómo se distingue
>    de producción, para no cobrar de verdad durante las pruebas?
> 6. ¿Cómo se **cancela** una operación del mismo día y cómo se hace una
>    **devolución**?
> 7. Si **se cae el internet a media transacción**, ¿podemos consultar el
>    estado de esa operación con nuestro propio folio, o queda a ciegas?
> 8. La respuesta de una venta aprobada, ¿trae **folio de autorización** y los
>    **4 últimos dígitos** de la tarjeta? Los necesitamos para el ticket.
> 9. ¿Cuál es la **tasa de descuento** para nuestro giro y volumen, y en
>    cuántos días cae el depósito?
> 10. ¿Hay costo por el servicio de Interredes, aparte de la tasa?

Las preguntas **4** y **7** son las que más pesan en el trabajo:

- La **4** decide si se puede hacer desde el agente que ya existe o hay que
  escribir un puente aparte en otro lenguaje.
- La **7** decide si un cobro se puede perder. Sin poder consultar el estado,
  una caída de internet a media transacción deja al cliente cobrado y al
  sistema sin saberlo. Con Clip esto ya costó caro: los cobros se quedaban
  «esperando confirmación» hasta que se encontró la ruta correcta para
  preguntar.

---

## 3. Lo que se necesita de nuestro lado

- [ ] La **pinpad**, conectada a la PC de la tienda
- [ ] Su **driver de Windows**, instalado **antes** de conectar el aparato
- [ ] Confirmar en el Administrador de dispositivos que aparece con su
      **puerto COM**
- [ ] Las credenciales del punto 1, guardadas como secretos (**nunca en el
      repo ni en el chat**)

**Lo del puerto COM ya está confirmado por dos fuentes**, y es la parte que no
cambia: la pinpad se conecta por **USB**, pero su driver **virtualiza un
puerto serial**, y es por ese puerto por donde el API habla con ella. Por eso
el cobro vive en `agente-impresion/` y no en la nube: un navegador no abre un
puerto COM.

Ojo con el reparto, porque son **dos piezas y se confunden**:

| | Qué hace | Dónde vive |
|---|---|---|
| **La pinpad** | Lee la tarjeta y cifra el PIN | La PC de la tienda, por puerto COM |
| **Interredes** | Lleva la transacción de nuestro sistema al motor Payworks del banco | Por internet |

La segunda podría salir de cualquier lado. **La primera es la que ancla todo a
esa computadora**, y es la razón de la advertencia del §5.

---

## 3b. Los pasos, en orden, y quién hace cada uno

Nada de esto se puede adelantar: cada paso depende del anterior.

| # | Paso | Quién |
|---|---|---|
| 1 | Preguntar si se puede contratar **sin** tres meses de historial | **El negocio**, con su ejecutivo |
| 2 | Si se puede: abrir **cuenta de cheques** y juntar papeles del §1 | **El negocio** |
| 3 | Firmar la **afiliación** pidiendo **Interredes Web** por nombre | **El negocio** |
| 4 | Mandar el correo del §2 y traer las respuestas **por escrito** | **El negocio** |
| 5 | Recibir del banco: **manual de Interredes, API Banorte, pinpad y su driver** | Banco → negocio |
| 6 | Recibir las credenciales: **ID de afiliación, usuario y contraseña**, y las de **pruebas** | Banco → negocio |
| 7 | Instalar driver y pinpad en la PC de la caja, confirmar el puerto COM | Nosotros, en el local |
| 8 | Escribir el proveedor y la cola de cobros, y probar contra el ambiente de pruebas | Nosotros |
| 9 | Pasar a producción y cobrar de verdad una venta chica | Los dos |

**Lo que de verdad frena son los pasos 5 y 6.** Mientras no lleguen el manual
y las credenciales de prueba, no hay nada que programar que sirva — y lo que
se escriba sin eso habría que rehacerlo.

---

## 4. Cuánto trabajo es

Con el manual y las credenciales de prueba en mano:

| Parte | Qué es | Tamaño |
|---|---|---|
| Hablar con la pinpad | Abrir el puerto COM desde `agente-impresion/`, mandar el monto, leer la respuesta | **Lo más grande.** Depende de la pregunta 4 |
| Cola de cobros | Que la caja pida un cobro y el agente lo reclame, calcado de `fn_imprimir_reclamar_trabajos` | Chico |
| `banorteProvider.ts` | Implementar la interfaz `PaymentProvider` que ya existe | Chico |
| Elegir proveedor | Un `if` en `obtenerPaymentProvider()`, que hoy tiene a Clip escrito duro | Muy chico |
| Pruebas | Aprobada, rechazada, cancelada, y el internet caído a media transacción | Mediano |

**Ninguna pantalla cambia.** El kiosko y la caja nunca hablan con el
proveedor: piden uno a `obtenerPaymentProvider()` y usan la interfaz. Por eso
cambiar de terminal no toca la interfaz de nadie.

**Si la respuesta a la pregunta 4 es «solo DLL de Windows»**, el trabajo crece:
Node no llama un DLL directamente y habría que escribir un puente. Conviene
saberlo antes de comprometer fecha.

---

## 5. Lo que hay que decirle al negocio antes de firmar

**El cobro con Banorte solo funcionaría con la PC de la tienda encendida.**
La pinpad cuelga de esa computadora. Si está apagada, o se reinicia, no hay
cobro con tarjeta.

Con Clip no pasa: el cobro se pide por internet y la terminal lo recibe sola,
así que funciona aunque la PC no esté.

A cambio, la tasa de descuento de un banco suele ser mejor que la de Clip. Es
un intercambio real y lo decide el negocio con los dos números enfrente —
**pidan la tasa antes de decidir**.

---

## 6. Mientras tanto

Clip ya está escrito, probado y desplegado. Solo le faltan tres secretos en
Supabase (`CLIP_API_KEY`, `CLIP_WEBHOOK_SECRET`, `CLIP_TERMINAL_SERIAL`).

Lo sensato es **abrir con lo que ya funciona** y mover la terminal después,
con calma, cuando llegue el manual. El día que se cambie, no se toca ninguna
pantalla.
