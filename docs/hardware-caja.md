# Hardware para arrancar con SOLO caja y tickets

Esto es el arranque corto: cobrar en la caja y entregar ticket impreso, sin
las pantallas de producción, horno y empaque todavía. La guía completa del
montaje final está en `docs/hardware.md`; esta es la lista de lo que hace
falta **esta semana**.

La pregunta de fondo era si se puede arrancar así, y la respuesta es sí, por
una razón concreta: **el ticket del cliente no pasa por el agente de
impresión.** La caja genera el ticket como una página y lo manda a la
impresora **predeterminada de Windows**, igual que cualquier programa. No
depende de las etiquetadoras, ni del agente, ni de las estaciones. El agente
y las etiquetadoras son para las **comandas**, que es otra cosa (ver §4).

---

## 1. Lo esencial — cuatro cosas

| | Qué | Aprox. MXN |
|---|---|---|
| 1 | Una PC con Windows (la que haya sirve) | $0–5,000 |
| 2 | **Monitor táctil 15.6"–22"** para el cajero | $3,500–6,500 |
| 3 | **Impresora térmica de tickets de 80 mm, USB** | $2,000–3,500 |
| 4 | Internet con cable y un **no-break** | $1,200–2,500 |

**Total realista: $7,000–12,000**, y si ya hay una computadora en el local,
lo único que de verdad hay que comprar es la impresora y el monitor.

### 1. La PC

Cualquier PC o laptop con **Windows y Google Chrome**. Para esta etapa no
necesita tres salidas de video, ni Node.js, ni el agente de impresión: nada
de eso entra todavía. Una laptop de oficina alcanza.

Lo único que hay que hacer en ella:

- Instalar la impresora de tickets y **dejarla como predeterminada**.
- Abrir la caja con el acceso directo **"Caja y Admin"**
  (`scripts/abrir-caja-y-admin.bat`), que ya lleva la bandera que imprime
  sin preguntar.

### 2. El monitor del cajero

**Táctil, y es la recomendación fuerte de esta etapa.** La caja está hecha
para dedo: las tarjetas de producto son grandes, los tamaños se eligen de un
toque y el teclado numérico del cobro es de pantalla. Con mouse funciona,
pero a la hora pico se nota.

- Tamaño: de 15.6" alcanza; 21.5" se agradece con el catálogo completo.
- Si es de pedestal, mejor: deja ver el total al cliente girándolo.
- Hay un script para dejarlo bien calibrado: `scripts/tactil.ps1`.

### 3. La impresora de tickets

Esta es **la que sí hay que comprar con cuidado**, pero es la fácil: es la
térmica de recibos de 80 mm que usa cualquier restaurante.

| | Detalle |
|---|---|
| Tipo | Térmica directa de **recibos**, 80 mm de papel |
| Lenguaje | **ESC/POS** (el estándar; no importa la marca) |
| Conexión | **USB** — se instala como impresora normal de Windows |
| Resolución | 203 dpi |
| Corte | **Cortador automático**, muy recomendable |
| Papel | Rollo térmico de **80 mm**, el de siempre |

Marcas que cumplen de sobra: Epson TM-T20/T88, Bixolon, 3nstar, Xprinter.

Lo que importa de verdad no es la marca, son **dos ajustes en el driver** de
Windows, y sin ellos el ticket sale mal:

1. **Tamaño de papel: 80 × continuo** (no "Carta", no "A4").
2. **Márgenes en cero.** El ticket ya trae su propio margen de 4 mm.

Y la regla de oro de esta etapa: **la impresora de tickets tiene que quedar
como predeterminada**. La caja imprime en silencio, a propósito, para que el
cajero no tenga que darle "Imprimir" con el cliente enfrente. Si la
predeterminada es otra —un "Microsoft Print to PDF", la láser de la
oficina—, el ticket se va ahí **sin ningún error**: la venta queda bien
cobrada y el papel nunca sale.

> Se prueba una vez y queda: cobra una venta de $1 en efectivo y mira si sale
> el papel. Si sale, ya está; no hay nada más que configurar.

### 4. Internet y energía

- **Cable de red a la PC.** Todo el sistema habla con Supabase: sin internet
  no hay cobro mientras dure la caída. En esta etapa no hay nada que hable
  por IP con una impresora, así que el WiFi ya no es un problema de
  impresión — pero sigue siendo un problema de ventas.
- **No-break de 600–1000 VA** para la PC y el router. Un apagón a media
  venta corta el cobro.
- Muy recomendable: **respaldo 4G con cambio automático**. Es lo que separa
  "se cayó el internet" de "no podemos cobrar".

---

## 2. Lo que NO hace falta todavía

Esto es la mitad del valor de arrancar corto: son cuatro compras que se
pueden dejar para después sin cambiar nada de lo que se compre hoy.

| | Por qué puede esperar |
|---|---|
| **Las dos etiquetadoras TSPL** | Son para las comandas de producción, horno y empaque. No imprimen el ticket del cliente (§4) |
| **Los monitores de las estaciones** | Son las pantallas de producción, horno y empaque |
| **El agente de impresión** | Solo existe para hablarles a las etiquetadoras |
| **El monitor grande del kiosko** | El autoservicio del cliente es otra etapa |
| **Node.js en la PC** | Lo pide el agente, nada más |

Nada de esto se desperdicia después: cuando entren las estaciones, la misma
PC puede seguir siendo la de la caja y se le agregan monitores, o se pone una
PC aparte. La caja no se vuelve a instalar.

---

## 3. La terminal de tarjetas

En esta etapa **funciona cualquier terminal que ya tengan**, incluida la que
usan hoy. El cobro con tarjeta se hace en la terminal, se confirma en la
pantalla de la caja y, si se quiere, se anota el folio del voucher. Eso ya
queda bien en el corte.

También queda bien el **pago mixto** —"$200 en efectivo y el resto con
tarjeta"—, que es con el que se peleaban a mano: se teclea solo el efectivo y
el sistema calcula el resto, y el ticket imprime las dos partes con su
importe.

Lo que **no** está resuelto todavía es que la caja le mande el monto sola a
la terminal, para que el cajero no lo teclee dos veces. Eso necesita una
terminal con API y una decisión de proveedor que está pendiente
(`docs/terminal-banorte.md`, `docs/banorte-que-pedir.md`). No bloquea nada de
este arranque.

---

## 4. El ticket y la comanda son dos papeles distintos

Vale la pena dejarlo claro porque es el error de compra más fácil de cometer:

| | **Ticket** | **Comanda** |
|---|---|---|
| Para quién | El cliente | La cocina: producción, horno, empaque |
| Qué dice | Folio, lo que se llevó, total, pago | Un renglón del pedido, con su sabor y tamaño |
| Papel | Rollo de recibo, 80 mm continuo | Etiqueta de 80 × 25 mm con separación |
| Impresora | Térmica de recibos, **USB**, ESC/POS | **Etiquetadora**, red, **TSPL** |
| Quién la manda | Chrome, desde la caja | El agente de impresión, desde la PC |
| ¿Hace falta hoy? | **Sí** | No |

**Una no puede hacer el trabajo de la otra**, y el modo en que fallan es
distinto: si se le manda un ticket a la etiquetadora TSPL, **se traga los
datos y no imprime nada, sin dar error** (está documentado en
`docs/etiquetas-comanda-tspl.md`). Por eso van en dos renglones del
presupuesto y no en uno.

---

## 5. Lo que hay que saber antes de cobrar el primer día

Dos advertencias honestas, porque arrancar con media tienda tiene un costo y
conviene saber cuál es:

**El dinero queda bien desde el día uno.** Ventas, corte de caja, arqueo,
pago mixto, descuento con PIN de gerencia, encargos cobrados: todo eso pasa
por el mismo camino y cuadra. Esa parte no depende de las estaciones.

**El inventario de hojaldras, no.** Las existencias de cuadros suben cuando
alguien marca en la pantalla del **Horno** lo que sacó. Si se cobra sin usar
esa pantalla, se descuenta lo que se vende y nunca se suma lo que se horneó:
el contador de Admin → Producción se va a números negativos. **No rompe el
cobro ni el corte** —son cuentas separadas—, pero a esa pantalla no hay que
creerle hasta que el horno se empiece a marcar. Lo mismo con el inventario de
insumos, que se descuenta por receta y todavía no tiene costos ni recetas
capturadas.

En corto: **el día uno sirve para cobrar y entregar ticket. El inventario se
sigue contando a mano hasta que entren las estaciones.**
