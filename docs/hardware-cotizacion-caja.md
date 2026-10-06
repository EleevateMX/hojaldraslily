# Cotización recortada: solo lo esencial para empezar a cobrar

Esto es la cotización del equipo **reducida a lo que hace falta para abrir la
caja y entregar tickets**, sin las estaciones de producción, horno y empaque.
Es la lista que se le puede pasar al proveedor tal cual.

El porqué de que se pueda arrancar así está en `docs/hardware-caja.md`: el
ticket del cliente **no pasa por el agente de impresión**, va de Chrome a la
impresora predeterminada de Windows. La comparación completa de los diez
renglones originales está en `docs/hardware-cotizacion-vs-amazon.md`.

Precios de Amazon al **6 de octubre de 2026**. Los de la cotización son los
que cotizó el proveedor.

---

## 1. Primero, la buena noticia: los cables casi no hacen falta

Era la duda, y la respuesta es que el monitor los trae:

| Cable | ¿Hay que comprarlo? |
|---|---|
| Corriente del monitor | **No** — viene en la caja del TD2223 |
| **HDMI** (PC → monitor) | **No** — viene en la caja del TD2223 |
| **USB B→A del touch** | **No** — viene en la caja del TD2223 |
| Corriente y USB de la impresora | **Casi seguro no** — confirmarlo al pedirla |
| **Cable de red** (PC → router) | **Sí.** Es el único que falta |

El ViewSonic TD2223 incluye cable de corriente, cable HDMI y el cable USB 2.0
tipo B a tipo A que es el que lleva el **touch** (sin ese cable el monitor se
ve pero no responde al dedo — es el error más común al instalar un touch).

De la 3nStar RPT006S no pude confirmar el contenido de la caja. Las térmicas
de recibos normalmente traen fuente y cable USB; **hay que preguntarlo al
pedirla**, y si no los trae, es un cable USB A–B de 2 m (~$149) y la fuente
que corresponda.

**Y falta una cosa que la cotización no traía: el no-break.** No es un extra.
Un apagón a media captura tira la venta, y en esta etapa la PC de la caja es
la única PC que hay.

---

## 2. Versión A — como la cotizó el proveedor

El mismo mini PC de la cotización (barebone, con su memoria y disco por
separado y el servicio de armado).

| Concepto | Cant | c/u | Total |
|---|---|---|---|
| Monitor touch ViewSonic TD2223, 22", 10 puntos | 1 | $5,890 | $5,890 |
| Mini PC ASUS NUC 13 Pro barebone, i5-1340P | 1 | $8,190 | $8,190 |
| Memoria XPG Hunter SODIMM DDR4 8 GB 3200 | 2 | $1,290 | $2,580 |
| SSD WD Green SN3000 500 GB M.2 NVMe | 1 | $1,790 | $1,790 |
| Miniprinter 3nStar RPT006S, térmica 80 mm, USB | 1 | $1,990 | $1,990 |
| Rollo papel térmico 80 × 70 mm, 10 pzas | 2 | $290 | $580 |
| Servicio: armado y configuración del mini PC | 1 | $550 | $550 |
| Servicio: instalación de Windows | 1 | $490 | $490 |
| Servicio: logística de abastecimiento | 1 | $250 | $250 |
| | | | **$22,310** |

Más lo que la cotización no incluía:

| Concepto | Cant | c/u | Total |
|---|---|---|---|
| No-break 700 VA con regulador | 1 | $1,599 | $1,599 |
| Cable de red Cat 6, 3 m | 1 | $119 | $119 |

**Total A: ≈$24,030.** Ojo: los $22,310 del proveedor son **más IVA si se
pide factura** ($25,880), con lo que el total llegaría a **≈$27,600**.

## 3. Versión B — con un mini PC ya armado *(la recomendada)*

Lo único que cambia es la PC: en vez del NUC barebone con memoria, disco y
servicio de armado, un mini PC **N100** que llega armado, con Windows y con
los 16 GB y los 512 GB ya puestos.

| Concepto | Cant | c/u | Total |
|---|---|---|---|
| Monitor touch ViewSonic TD2223, 22", 10 puntos | 1 | $5,468 | $5,468 |
| Mini PC Intel N100, 16 GB / 512 GB, Windows 11 | 1 | $3,500 | $3,500 |
| Miniprinter 3nStar RPT006S, térmica 80 mm, USB | 1 | $2,040 | $2,040 |
| Rollo papel térmico 80 × 70 mm, 10 rollos | 2 | $299 | $598 |
| No-break 700 VA con regulador | 1 | $1,599 | $1,599 |
| Cable de red Cat 6, 3 m | 1 | $119 | $119 |
| | | | **$13,324** |

**Total B: $13,324, con IVA y factura incluidos.** Unos **$10,700 menos** que
la versión A con factura, y sin servicio de armado porque no hay nada que
armar.

### Por qué la PC chica alcanza, y cuándo no

Lo que esa computadora va a hacer es tener **una** pestaña de Chrome abierta
con la caja. Un i5-1340P de 12 núcleos para eso está sobrado por mucho.

El único argumento real a favor del NUC es el **video**: trae cuatro salidas
(2 HDMI + 2 USB-C), y un N100 trae dos. Eso importa el día que **una sola PC**
mueva el kiosko y las tres estaciones. Pero incluso para eso, **dos N100
cuestan menos que un NUC armado** y tienen una ventaja: una avería tumba la
mitad de las pantallas, no todas. Así que la PC chica no es una decisión que
haya que deshacer después.

---

## 4. Qué se quedó fuera, y por qué

De los diez renglones de la cotización original salieron cuatro:

| Lo que se quitó | Para qué era |
|---|---|
| 2 monitores touch 3nStar 15" | Las pantallas de **producción** y **horno** |
| 2 etiquetadoras 3nStar LDT124 | Las **comandas** de las estaciones |
| Hub USB Manhattan 164900, 4 puertos | Repartir USB entre varias pantallas |
| Adaptador Manhattan USB-C → HDMI | La cuarta salida de video del NUC |

Con un solo monitor no hacen falta ni el hub ni el adaptador. Y las
etiquetadoras no pueden imprimir el ticket del cliente: son otro oficio y
otro lenguaje (ver `docs/hardware-caja.md`, §4).

**Dos cosas que hay que recordar cuando llegue el momento de comprarlas:**

1. Las etiquetadoras van **por cable de red con IP fija**, no por USB. Si se
   conectan por USB, el agente de impresión **no arranca** — hay un candado
   explícito en su configuración.
2. Faltan **dos** monitores más, no uno: Lily tiene cinco puestos (caja,
   kiosko, producción, horno, empaque) y la cotización original traía tres
   pantallas, porque es el armado del otro negocio.

---

## 5. Lo que hay que hacer en esa PC, una vez

Nada de esto cuesta dinero, pero sin esto el ticket no sale:

1. Instalar la impresora de tickets y **dejarla como predeterminada de
   Windows**. Si queda otra, el ticket se imprime ahí en silencio, sin error.
2. En el driver de la impresora: **papel 80 × continuo** (no Carta) y
   **márgenes en cero**.
3. Abrir la caja con el acceso directo **"Caja y Admin"**, que ya lleva la
   bandera `--kiosk-printing` para que el ticket salga sin preguntar.
4. Probarlo cobrando una venta de $1 en efectivo. Si sale el papel, ya está.
