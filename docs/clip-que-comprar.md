# Qué terminal Clip comprar para que cobre sola

La pregunta concreta: **cuál de las terminales de Clip sirve para que el
sistema le mande el monto** y la cajera no lo teclee dos veces. Sin Stand 2,
que es lo que pidió la casa.

Precios de la tienda de Clip al **6 de octubre de 2026**.

---

## 1. La respuesta corta

**Clip Ultra, $399.** Si quieren pantalla más grande y pantalla para el
cliente, **Clip Total 3, $499**. Las dos sirven igual de bien para lo que
hace falta.

| | Clip Ultra | Clip Total 3 |
|---|---|---|
| Precio | **$399** | **$499** *(de $4,499)* |
| ¿Sirve con el sistema? | **Sí** | **Sí** |
| Teclas | **Teclado físico retroiluminado** | Táctil |
| Pantalla | 6" táctil | 6.7" + **2.4" para el cliente** |
| Impresora | Térmica integrada | Térmica integrada |
| Internet | WiFi 5 GHz + **4G con SIM incluida** | WiFi + **SIM incluida** |
| Batería | ~14 h | 6,080 mAh, ~15 h |
| Comisión | 2.99 % + $1 + IVA | 2.99 % + $1 + IVA |

**Por qué el Ultra de primero:** el cliente teclea su NIP en **teclas de
verdad**, no en un cristal. En un mostrador con prisa, con gente mayor y con
las manos ocupadas, eso se nota todos los días. Y es la más barata.

**Cuándo conviene la Total 3:** su segunda pantalla de 2.4" mira al cliente
y le muestra el monto. Si no van a poner el kiosko enfrente, eso sirve. Si
el kiosko ya va a estar ahí, es un gasto que no cambia nada.

---

## 1b. Cuánto se lleva Clip

**2.99 % + $1 por transacción aprobada, más IVA sobre esa comisión.** La
cuenta es:

```
comisión = (venta × 2.99 % + $1) × 1.16
```

**Es la misma en todas sus terminales.** Plus 2, Total 3, Ultra: la comisión
no cambia por el aparato. Lo que cambia entre ellas es el hardware, no la
tasa — así que **comprar la más cara no baja la comisión**.

### Lo que importa aquí: el $1 fijo

Ese peso fijo pega distinto según el tamaño de la venta, y en una panadería
la mayoría de los tickets son chicos:

| Venta | Se queda Clip | **% real** |
|---|---|---|
| $80 *(Pan de Muerto chica)* | $3.93 | **4.92 %** |
| $120 *(hojaldra mediana)* | $5.32 | **4.43 %** |
| $150 | $6.36 | **4.24 %** |
| $230 *(Pan de Muerto grande)* | $9.14 | **3.97 %** |
| $300 | $11.57 | **3.86 %** |
| $500 | $18.50 | **3.70 %** |
| $570 *(Rosca grande)* | $20.93 | **3.67 %** |
| $1,000 *(encargo)* | $35.84 | **3.58 %** |

La tasa anunciada es 2.99 %, pero **lo que de verdad se paga en el mostrador
anda entre 3.6 % y 4.9 %**, y es peor mientras más chica la venta. No es letra
chica escondida: es el peso fijo más el IVA, que nadie suma al leer el
anuncio.

La lectura práctica: **donde la tarjeta sale barata es en los encargos y las
roscas grandes.** En una hojaldra suelta de $80, casi 5 %.

### Un mes de ejemplo

Con $120,000 de venta al mes, la mitad con tarjeta y ticket promedio de $180:

| | |
|---|---|
| Venta con tarjeta | $60,000 |
| Transacciones | ~333 |
| **Comisión del mes** | **≈$2,465** |
| Tasa efectiva | **4.11 %** |

Los números son de ejemplo: hay que rehacerlo con las ventas reales cuando
las haya. Pero sirve para la conversación con el banco — **ese es el número
que hay que pedirle a Banorte** para poder comparar.

### Cuándo cae el dinero

- **Máximo 24 horas**, cualquier día, incluidos fines de semana y festivos.
- Con **Clip Cuenta** (su cuenta digital) cae en minutos, los 365 días.

### Meses sin intereses

Suman un sobrecargo del banco **encima** de la comisión, y crece con el plazo.
Con tickets de $80 a $570 no tiene sentido ofrecerlos: conviene dejarlos
apagados.

---

## 2. Las cuatro que sirven, y las que no

Clip tiene dos APIs distintas y **solo una empuja el monto a la terminal**:

| API | Qué hace | ¿Nos sirve? |
|---|---|---|
| **Checkout** | Genera un link o un QR que el cliente paga | No. No manda el monto a la terminal |
| **PinPad** | El sistema manda el monto, la terminal cobra | **Sí. Es la que usa el repo** |

La API de PinPad es compatible **solo** con estos cuatro lectores:

- **Clip Total 3** ✅
- **Clip Ultra** ✅
- **Clip Pin Pad** ✅ — pero ver abajo
- **Clip Stand 2** ✅ — descartada por la casa

**Cualquier otra terminal de Clip no sirve** para esto, por barata que sea.
Cobra, pero el monto se teclea a mano y el sistema nunca se entera.

### Sobre el Clip Pin Pad

Es la que *parece* la respuesta obvia —fija, de mostrador, por Ethernet,
hecha a propósito para colgarse de un punto de venta y de kioscos de
autoservicio— y técnicamente lo es. Dos razones para no empezar por ahí:

1. **No tiene precio público.** Se vende por Clip para Empresas, apuntada a
   negocios de alto volumen: supermercados, cadenas de restaurantes,
   autoservicios. Hay que hablar con un ejecutivo.
2. **Para una caja no cambia nada.** El trabajo del sistema es el mismo con
   las cuatro.

Vale la pena preguntarla **el día que haya varias cajas o kioscos de
autoservicio**: ahí su conexión por cable y su formato fijo sí ganan.

---

## 3. Dos cosas que hay que saber antes de prometer una fecha

**No hay ambiente de pruebas.** La API de PinPad **solo opera en
producción**. No existe el modo sandbox con tarjetas falsas: para probar hay
que cobrar de verdad con una tarjeta de verdad y después devolver. Hay que
planearlo — unas cuantas ventas de $5 y sus devoluciones — y no descubrirlo
el día de la instalación.

Es lo contrario de lo que suele pasar y es importante: **no se puede validar
la integración sin la terminal en la mano y la cuenta activa.**

**La terminal necesita internet propio y bueno.** Clip pide **WiFi estable de
10 Mb/s o más**. Las dos traen además SIM con internet incluido, lo que es una
red de respaldo real: si se cae el WiFi de la tienda, la terminal sigue
cobrando por 4G. Eso es una ventaja grande sobre una terminal de banco
conectada por cable a la PC.

---

## 4. Lo que hay que tener listo, además del aparato

- [ ] **Cuenta de Clip activa** y el **KYC terminado** (verificación de
      identidad). Sin eso la API no responde.
- [ ] La **APK de Clip PinPad instalada** en la terminal. Es la que la pone a
      escuchar; no viene puesta por omisión.
- [ ] Las **credenciales de API**, que se generan desde la cuenta.
- [ ] El **número de serie** de la terminal comprada.

Esos tres últimos son los secretos que van en Supabase —**nunca en el repo ni
en el chat**—:

| Secreto | Qué es |
|---|---|
| `CLIP_API_KEY` | La llave de la cuenta |
| `CLIP_WEBHOOK_SECRET` | Para el timbre de confirmación |
| `CLIP_TERMINAL_SERIAL` | A qué terminal mandarle el cobro |

---

## 5. Qué falta de nuestro lado

**Nada.** El código de Clip ya está escrito, probado y desplegado: las Edge
Functions, el barrido de pendientes cada 2 minutos, el sondeo del kiosko y el
`PaymentProvider`. Lo que falta son los tres secretos de arriba.

El día que llegue la terminal: se pone la APK, se generan las credenciales, se
cargan los tres secretos, y se prueba cobrando $5 de verdad. Ver
`docs/integracion-clip.md` para el detalle técnico y `CLAUDE.md` §2.3 para las
trampas de la API de Clip que ya costaron caro una vez.

---

## 6. Mientras tanto, se puede cobrar igual

El sistema **ya tiene el método manual**: se cobra en la terminal como hoy, se
teclea el folio del voucher en la caja y el pago cae en el corte. No es lo
ideal —hay captura a mano— pero no frena la apertura, y el corte cruza el
total contra el reporte del portal de Clip.

O sea: **la terminal integrada mejora el día a día, no habilita la venta.**
Se puede abrir sin ella.

---

## Fuentes

- [Clip — API de PinPad, introducción](https://developer.clip.mx/reference/introducci%C3%B3n-a-la-api-de-pinpad) — de aquí salen los cuatro lectores compatibles, el requisito de la APK, el KYC, los 10 Mb/s y que solo opera en producción
- [Clip — cuánto cobra de comisión](https://blog.clip.mx/articulo/cuanto-cobra-de-comision-clip) · [comisión por transacción](https://blog.clip.mx/articulo/comision-de-clip-por-transaccion) · [calculadora](https://www.clip.mx/como-funciona-clip/calculadora-clip) — el 2.99 % + $1 + IVA y los ejemplos con los que se verificó la fórmula
- [Clip — cuándo depositan el dinero](https://blog.clip.mx/articulo/cuando-depositan-el-dinero-en-clip) · [en 24 horas](https://blog.clip.mx/articulo/no-importa-el-dia-recibe-tu-dinero-en-24-horas)
- [Clip — Pin Pad para empresas](https://www.clip.mx/clip-para-empresas/pin-pad)
- [Clip Ultra, tienda oficial](https://shop.clip.mx/products/clip-ultra) · [Clip Total 3, tienda oficial](https://shop.clip.mx/products/clip-total)
- [Clip — SDK Terminal](https://developer.clip.mx/reference/introducci%C3%B3n-al-sdk-terminal) — el otro camino, para apps Android que corren *dentro* de la terminal; no es el nuestro

**Nota de método:** `developer.clip.mx` y `shop.clip.mx` están bloqueados por
el proxy de este entorno, así que los datos de arriba salen de resultados de
búsqueda, no de abrir las páginas. Los precios cambian; hay que confirmarlos
al comprar.
