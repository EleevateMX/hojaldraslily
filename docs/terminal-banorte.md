# Cobrar con terminal Banorte

Investigación de qué ofrece Banorte y cuál de sus caminos sirve para una
panadería que cobra en el mostrador. **Todavía no hay código**: al final se
explica por qué, y qué hay que preguntarle al ejecutivo del banco antes de
escribir la primera línea.

> **De dónde salió esto.** El portal de desarrolladores de Banorte
> (`developers.banorte.com`), `banorte.com` y varias páginas técnicas están
> **bloqueados por el proxy** de este entorno (CLAUDE.md §4). Lo de abajo sale
> de resúmenes de búsqueda y de **integraciones reales publicadas por
> terceros**. Está marcado qué es oficial y qué no: los nombres de campo
> concretos vienen de código de la comunidad, **no de un manual firmado por el
> banco**, y hay que confirmarlos con el ejecutivo antes de programar contra
> ellos.

---

## Banorte tiene tres cosas distintas, y solo una sirve aquí

| Producto | Qué es | ¿Sirve para la panadería? |
|---|---|---|
| **Portal de desarrolladores** (`developers.banorte.com`) | Catálogo de APIs con sandbox gratis. Registro abierto, no hace falta ser cliente | **No para cobrar.** Es el catálogo corporativo de APIs (datos abiertos, servicios de empresa). Cobrar con tarjeta no se contrata por ahí |
| **Comercio Electrónico / Payworks 2.0** | Pasarela de e-commerce. Recibe el número de tarjeta y cobra | **No.** Es para cobrar en una página web, sin la tarjeta presente. Ver la advertencia de abajo |
| **Interredes** | Conecta **tu sistema** con la pinpad física y con el banco, sobre el mismo motor Payworks 2.0 | **Sí. Es este.** |

**Interredes es el camino.** Es el producto de Banorte para que un punto de
venta le mande el monto a la terminal, la terminal cobre, y el sistema reciba
la respuesta — que es exactamente lo que hoy hace el kiosko con Clip.

---

## La advertencia grande: no usar el camino de e-commerce

Payworks 2.0 en su modo de comercio electrónico recibe, en la misma petición,
**el número de tarjeta, la fecha de vencimiento y el CVV**. Los ejemplos
públicos muestran una petición con estos campos:

```
POST https://eps.banorte.com/recibo
  Name, Password, ClientId      ← credenciales del comercio
  Mode                          ← P = producción; Y/N/R = pruebas
  TransType                     ← tipo de operación
  Number, Expires, Cvv2Val      ← LA TARJETA DEL CLIENTE
  Total, OrderId, ChargeDesc1
```

y la respuesta se lee de `CcErrCode` (**`1` = aprobada**; si no, el motivo
viene en `Text`).

Dos razones para no tomar ese camino en la tienda:

1. **El número de tarjeta pasaría por nuestro servidor.** Eso mete al sistema
   entero en el alcance más pesado de PCI-DSS (SAQ D), con auditoría anual.
   Para una panadería es desproporcionado, y ninguna de las decisiones de
   seguridad de este repo aguanta esa carga (§5). Con la terminal, la tarjeta
   **nunca toca nuestro código**: el cliente la mete en la pinpad y nosotros
   solo mandamos el monto y recibimos un sí o un no. Es la misma línea que ya
   se respeta con Clip.
2. **El campo `Mode`.** `P` es producción y `Y` aprueba **todo** sin cobrar
   nada. Una variable de entorno mal puesta y la caja lleva un día entero
   dando por pagadas ventas que nunca se cobraron. Es justo el tipo de cosa
   que este repo evita a propósito (el proveedor de prueba se bloquea solo en
   build de producción, ver `mockProvider.ts`).

El e-commerce solo tendría sentido el día que quieran cobrar encargos por
internet **antes** de que el cliente llegue. Ese día, lo correcto es 3D Secure
con la captura de la tarjeta alojada en el banco, no en nuestra página.

---

## Lo que cambia todo: la pinpad es un puerto COM de Windows

Esto es lo más importante de toda la investigación.

La integración de la pinpad de Banorte, según las guías de quienes ya la
hicieron, funciona así:

- Se instala **primero el driver** y *después* se conecta el aparato.
- La terminal aparece en el **Administrador de dispositivos de Windows**, con
  su nombre y su **puerto COM** asignado.
- El punto de venta habla con ese puerto.

**Un navegador no puede hacer eso.** Es exactamente la misma frontera que ya
existe con las etiquetadoras (§2.4): las pantallas ven las comandas, pero el
papel sale porque hay un programa Node corriendo en la PC de la tienda.

Entonces el cobro con Banorte **no va en una Edge Function**. Va en
`agente-impresion/`, que ya está instalado, ya arranca solo con la PC, ya se
actualiza solo y ya late contra la base para que Admin → En vivo sepa si está
vivo. Ese programa pasaría a hacer dos cosas en vez de una.

Eso también quiere decir que **el cobro con Banorte solo funciona en la caja
de la tienda**. Nada de cobrar desde el teléfono ni desde otra sucursal: si la
PC está apagada, no hay terminal. Con Clip no es así — ahí el cobro se pide
por internet y la terminal lo recibe sola.

---

## Dónde encajaría en el sistema

La buena noticia: **el hueco ya está hecho y no hay que tocar ninguna
pantalla.**

`packages/payments/src/types.ts` define `PaymentProvider`, con
`createPayment`, `getPaymentStatus`, `cancelPayment`, `refundPayment` y
`verifyWebhook`. El kiosko y la caja nunca hablan con Clip: piden un proveedor
a `obtenerPaymentProvider()` y usan la interfaz.

Agregar Banorte es, en orden:

1. **`banorteProvider.ts`** que implemente esa misma interfaz.
2. Que `obtenerPaymentProvider()` lo elija — hoy tiene a Clip escrito duro,
   así que ahí hay un `if` que poner.
3. En `agente-impresion/`, un módulo que abra el puerto COM y hable con la
   pinpad, con su propia cola igual que la de impresión.
4. Una función en la base para que la caja le **pida** un cobro al agente y
   éste lo reclame, calcada de `fn_imprimir_reclamar_trabajos`.

Lo que **no** cambia, y no debe cambiar:

- El monto lo sigue calculando el servidor. `fn_cobrar_orden` valida el
  importe contra el total que calculó la base (§2.2). Banorte no aprueba
  precios, solo cobra un monto que ya se decidió.
- **La verdad se pregunta, no se escucha** (§2.3). Si Banorte manda avisos,
  son un timbre. El estado real se consulta.
- El cobro sigue cayendo en el corte por el camino normal
  (`fn_crear_orden` + `fn_cobrar_orden`), o el día no cuadra.

---

## Lo que hay que preguntarle al ejecutivo de Banorte

Sin estas respuestas no se puede escribir código que sirva. Conviene pedirlas
por escrito y de una vez:

**Del contrato**

1. ¿La afiliación incluye **Interredes**, o solo la terminal suelta? Son dos
   contratos distintos, y con la terminal suelta **no hay integración
   posible**: la cajera teclea el monto a mano y el sistema nunca se entera.
2. ¿Qué requisitos piden? (Lo publicado: cuenta de cheques Banorte, contrato
   de afiliación, internet en el negocio y estar dado de alta en el SAT.)
3. ¿Cuál es la tasa de descuento para este giro y volumen, y cuándo cae el
   dinero? (Lo publicado dice **al día hábil siguiente**.)

**De lo técnico**

4. **El manual de integración de Interredes**, oficial y por escrito. Todo lo
   de este documento sale de terceros y hay que reemplazarlo por el del banco.
5. ¿Qué **modelo de pinpad** dan, y se conecta por USB, serial o Ethernet? (Se
   menciona la Verifone P400 con contactless.)
6. ¿El componente que se instala es un **DLL/ActiveX de Windows**, o se puede
   hablar con la terminal por socket? Esto decide si se puede hacer desde
   Node, que es en lo que está escrito el agente.
7. ¿Hay **ambiente de pruebas** con tarjetas de prueba, y cómo se distingue de
   producción? (En Payworks es el campo `Mode` — confirmar cómo funciona en
   Interredes.)
8. ¿Cómo se **cancela** una operación y cómo se hace una **devolución**?
9. ¿Qué pasa si **se cae el internet a media transacción**? ¿Hay forma de
   preguntar por el estado de una operación con nuestro folio, o queda a
   ciegas? (Esto ya costó caro con Clip: sin poder consultar el estado, los
   cobros se quedan «esperando confirmación» — §2.3.)
10. ¿La respuesta trae **folio de autorización y los 4 últimos dígitos**, para
    imprimirlos en el ticket?

---

## Recomendación

**Que la decisión no la tome el código.** Antes de programar nada hay que
saber si la afiliación trae Interredes. Si no lo trae, no hay nada que
programar: la terminal es una caja aparte y la cajera teclea el monto.

Sobre cuál conviene, con lo que se sabe hoy:

- **Banorte con Interredes** sirve, y probablemente la tasa de descuento sea
  mejor que la de Clip por ser banco. El costo está en el otro lado: se
  programa contra una pinpad por puerto COM, solo funciona en la PC de la
  tienda, y el trabajo vive en el agente local.
- **Inbursa** no publica documentación de integración. Su TPV se administra
  desde el portal «Punto Electrónico» y no aparece ningún camino para que un
  sistema le mande el monto. Mientras no muestren lo contrario, hay que
  tratarla como **terminal suelta**: sirve para cobrar, no para integrar.
- **Clip** ya está escrito y probado en este repo, cobra por internet (así que
  funciona aunque la PC esté apagada) y la tarjeta nunca toca nuestro código.
  Lo que falta son los tres secretos (§ arriba, «Lo que falta para abrir»).

Lo más sensato es **abrir con lo que ya funciona** y mover la terminal después
con calma, cuando el banco entregue el manual. Cambiar de proveedor no
requiere tocar ninguna pantalla — para eso existe `PaymentProvider`.

---

## Por qué todavía no hay código

Se podría escribir un `banorteProvider.ts` hoy mismo. No se hizo a propósito:

- Los nombres de campo que existen públicamente (`CcErrCode`, `Mode`,
  `TransType`) son del camino de **e-commerce**, que es justo el que **no**
  hay que usar. De Interredes no hay documentación pública.
- Un proveedor escrito contra una API que nadie pudo leer ni probar **se ve
  terminado y no lo está**. Eso es peor que no tenerlo: el día que llegue el
  manual habría que reescribirlo, y mientras tanto alguien podría creer que el
  cobro con Banorte ya está resuelto.

En cuanto lleguen el manual y las credenciales de prueba, el trabajo es acotado
y está descrito arriba.

## Fuentes

- [Banorte Developer Portal — Productos API](https://developers.banorte.com/es/apis) · [Primeros pasos](https://developers.banorte.com/es/primeros-pasos) *(bloqueados por el proxy; solo resumen de búsqueda)*
- [Banorte — Terminales punto de venta (TPV)](https://www.banorte.com/Empresas/Servicios/Soluciones-de-cobro-para-tu-negocio/Productos/Terminales-punto-de-venta--TPV-.html)
- [Banorte — Interredes](https://www.banorte.com/wps/portal/empresas/Home/gobierno/recaudacion/tarjeta-de-credito-y-debito/interredes/) · [Guía Interredes (PDF)](https://www.banorte.com/cms/banorte/pdf/guia-interredes.pdf)
- [Banorte — Comercio Electrónico](https://www.banorte.com/wps/portal/empresas/Home/empresas-corporativos/servicios-especializados/soluciones-de-pago-para-tu-negocio/productos/comercio-electronico/)
- [arturoleon/Banorte-Payworks-PHP](https://github.com/arturoleon/Banorte-Payworks-PHP) — de aquí salen el endpoint y los nombres de campo. **Comunidad, no oficial**
- [sixplus1/banorte-magento2](https://github.com/sixplus1/banorte-magento2) — módulo Payworks 2.0 + 3D Secure; de aquí sale la lista de credenciales
- [Integración de PinPad Banorte — cwinsystems](http://cwinsystems.com/dispro/HTML/integracion-de-pinpad-banorte.htm) — driver, puerto COM, carga remota
- [Inbursa — Terminales físicas](https://www.inbursa.com/sites/gfi/tpv/terminales-fisicas)
- [Clip Developers](https://developer.clip.mx/) — el proveedor ya implementado
