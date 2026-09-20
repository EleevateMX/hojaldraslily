# Banorte: qué se necesita para habilitarlo

Hoja práctica. El análisis completo —qué ofrece Banorte, por qué el camino de
e-commerce no sirve y de dónde salió cada dato— está en
`docs/terminal-banorte.md`. Esto es solo **qué hacer**.

---

## Lo primero, y decide todo lo demás

**¿La afiliación incluye INTERREDES?**

- **Sí** → se puede integrar. Sigue el resto de esta hoja.
- **No, es terminal suelta** → **no hay nada que programar.** La terminal es
  una caja aparte: la cajera teclea el monto a mano, y el sistema nunca se
  entera de si se cobró. El corte de caja se cuadra a mano contra el reporte
  de la terminal.

No se escribe una línea de código hasta tener esta respuesta por escrito.

---

## 1. Lo que hay que contratar con el banco

- [ ] **Cuenta de cheques Banorte** a nombre del negocio
- [ ] **Contrato de afiliación** como comercio
- [ ] **Servicio Interredes** (es aparte de la terminal)
- [ ] Alta en el SAT y domicilio del negocio
- [ ] Internet en la tienda (ya hay)

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
> 1. ¿Nuestra afiliación incluye **Interredes**, o solo la terminal
>    independiente?
> 2. ¿Nos pueden enviar el **manual de integración de Interredes** (el
>    técnico, con los mensajes y los códigos de respuesta)?
> 3. ¿Qué **modelo de pinpad** nos entregan y cómo se conecta: USB, serial o
>    Ethernet?
> 4. El componente que se instala en la PC, ¿es un **DLL/ActiveX de Windows**,
>    o se puede hablar con la terminal por **socket TCP**? Nuestro sistema
>    está hecho en Node.js.
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
