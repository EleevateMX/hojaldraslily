# Banorte: qué se necesita para habilitarlo

Hoja práctica. El análisis completo —qué ofrece Banorte, por qué el camino de
e-commerce no sirve y de dónde salió cada dato— está en
`docs/terminal-banorte.md`. Esto es solo **qué hacer**.

---

## El punto de partida: la terminal YA EXISTE

La tienda **ya tiene su terminal física de Banorte y su afiliación**. Eso
cambia la pregunta: no se trata de contratar de cero, sino de **conectar al
sistema la terminal que ya está ahí**.

Dos consecuencias, y la primera es buena:

- **Los papeles ya no son el problema.** Tener terminal significa que la
  afiliación ya se aprobó: cuenta de cheques, acta, RFC, buró y los estados
  de cuenta ya pasaron. El §1 queda como referencia histórica, no como
  pendiente.
- **Lo que falta es el servicio y el modo.** Una terminal trabaja en uno de
  dos modos, y es la distinción que decide todo:

| | Cómo trabaja | ¿Se integra? |
|---|---|---|
| **Modo independiente** (standalone) | La cajera teclea el monto en la terminal | **No.** El sistema nunca se entera de si se cobró |
| **Modo integrado** | El punto de venta le manda el monto; la terminal cobra y devuelve el resultado | **Sí.** Es lo que queremos |

Casi con seguridad la de ellos está en **modo independiente**, que es como se
entregan por omisión.

**La pregunta de fondo**: ¿esta terminal se puede pasar a modo integrado con
el servicio **Banorte Interredes Web** sobre la afiliación que ya tienen, o
hay que cambiarla por otro aparato?

Banorte describe Interredes como *«interconectar tu servidor con el de
Banorte… integrando las transacciones generadas en **tus** Terminales Punto de
Venta Banorte»*, o sea sobre las terminales que el comercio ya tiene. Pero no
publica si cualquier modelo sirve, y **eso solo lo contesta el ejecutivo**.

**Y hay un detalle que Kenny puede contestar solo, mirando el aparato:**

- Terminal **de cable** (LAN/Ethernet o con cable a la PC) → se puede integrar.
- Terminal **inalámbrica** (WiFi o GPRS/3G, de las que se llevan a la mesa) →
  **probablemente no.** El modo integrado necesita un cable al punto de venta.

No se escribe una línea de código hasta tener esto por escrito.

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

> Buen día. **Ya tenemos terminal Banorte con ustedes.** Queremos conectarla a
> nuestro sistema de punto de venta, para que el sistema le mande el monto y
> la cajera no lo teclee dos veces. Necesito confirmar lo siguiente:
>
> 1. ¿La terminal que ya tenemos **se puede pasar a modo integrado**, o hay que
>    cambiarla por otro equipo? Si hay que cambiarla, ¿cuál y qué costo tiene?
> 2. Para integrarla, ¿qué hay que contratar — **Banorte Interredes Web** —, se
>    agrega a nuestra afiliación actual, y cuánto tarda el trámite?
> 3. ¿Cómo se **conecta la terminal a la computadora** en modo integrado: USB,
>    serial o Ethernet? ¿Hace falta un **driver** y nos lo entregan ustedes?
> 4. El **API Banorte** que ustedes entregan, ¿en qué forma viene: un
>    **DLL/ActiveX de Windows**, un ejecutable, o se puede hablar por **socket
>    TCP** o por servicio web? Nuestro sistema está hecho en Node.js y corre
>    sobre Windows.
> 5. ¿Nos pueden enviar el **manual de integración de Interredes** (el
>    técnico, con los mensajes y los códigos de respuesta)?
> 6. ¿Hay **ambiente de pruebas** con tarjetas de prueba? ¿Cómo se distingue
>    de producción, para no cobrar de verdad durante las pruebas?
> 7. Si **se cae el internet a media transacción**, ¿podemos consultar el
>    estado de esa operación con nuestro propio folio, o queda a ciegas?
> 8. ¿Cómo se **cancela** una operación del mismo día y cómo se hace una
>    **devolución**?
> 9. La respuesta de una venta aprobada, ¿trae **folio de autorización** y los
>    **4 últimos dígitos** de la tarjeta? Los necesitamos para el ticket.
> 10. ¿**Cambia nuestra tasa de descuento** al pasar a Interredes, y hay algún
>     costo mensual por el servicio? ¿Nos pasan el Anexo A de comisiones?

Las preguntas **1**, **4** y **7** son las que deciden:

- La **1** decide si hay proyecto o no. Si la terminal que tienen no se puede
  integrar y no quieren cambiarla, se acabó: se queda tecleando el monto a
  mano.
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
| 1 | Mirar la terminal: ¿de cable o inalámbrica? ¿qué marca y modelo dice? | **El negocio**, hoy mismo |
| 2 | Preguntarle al ejecutivo si **esa** terminal se pasa a modo integrado | **El negocio** |
| 3 | Contratar **Interredes Web** sobre la afiliación que ya tienen | **El negocio** |
| 4 | Mandar el correo del §2 y traer las respuestas **por escrito** | **El negocio** |
| 5 | Recibir del banco: **manual de Interredes, API Banorte, el cable o el equipo nuevo, y el driver** | Banco → negocio |
| 6 | Recibir las credenciales: **ID de afiliación, usuario y contraseña**, y las de **pruebas** | Banco → negocio |
| 7 | Instalar driver y terminal en la PC de la caja, confirmar el puerto COM | Nosotros, en el local |
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
