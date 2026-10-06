# La cotización del equipo, renglón por renglón, contra Amazon México

Esto compara una cotización local de equipo para punto de venta —la del
armado que se usó en el otro negocio— contra lo mismo en Amazon México, para
poder decidir con números en vez de con impresiones.

> **Lo que no va en este archivo:** el nombre, el domicilio y el teléfono del
> proveedor que cotizó, ni el folio de la cotización. Este repo es público y
> esos datos son de un tercero. Lo que sí va es el equipo y los precios, que
> son públicos.

Fecha de los precios de Amazon: **6 de octubre de 2026**. Amazon mueve
precios todos los días y varios de estos son de vendedor externo, así que
esta tabla es una foto, no una lista de precios.

---

## 1. Renglón por renglón

| Equipo | Cant | Cotización c/u | Amazon c/u | Diferencia |
|---|---|---|---|---|
| Monitor touch ViewSonic TD2223, 22", infrarrojo 10 puntos | 1 | $5,890 | **$5,468** | −$422 |
| Monitor touch 3nStar TCM008(VH), 15", capacitivo | 2 | $5,090 | $5,695 | +$605 |
| Mini PC ASUS NUC 13 Pro barebone, i5-1340P | 1 | $8,190 | $8,060 *(Slim)* | −$130 |
| Memoria XPG Hunter SODIMM DDR4 8 GB 3200 | 2 | $1,290 | **$1,113** | −$177 |
| SSD WD Green SN3000 500 GB M.2 NVMe Gen4 | 1 | $1,790 | $1,897 | +$107 |
| Miniprinter 3nStar RPT006S, térmica 80 mm | 1 | $1,990 | $2,040 | +$50 |
| Etiquetadora 3nStar LDT124, térmica directa 4" | 2 | $2,270 | *no está* — LDT114: $2,392 | +$122 |
| Hub USB Manhattan 164900, 4 puertos | 1 | $390 | $390 | igual |
| Adaptador Manhattan USB-C → HDMI | 1 | $310 | $415 | +$105 |
| Rollo papel térmico 80 × 70 mm, 10 pzas | 2 | $290 | $279–$315 | ≈ igual |

**Subtotal de equipo:** cotización **$36,440** · Amazon **≈$37,270**.

La cotización suma además **$1,290 de servicios** (armado del mini PC $550,
instalación de Windows y Office $490, logística de abastecimiento $250), y
cierra en **$37,730**.

## 2. La conclusión, que no es la que parecía

**Sobre equipo, la cotización está bien puesta: sale ~$830 más barata que
Amazon.** No hay sobreprecio. Pieza por pieza, cinco renglones están por
debajo de Amazon y cinco por arriba, y se compensan.

Lo que mueve de verdad la decisión es el **IVA**. La cotización dice
*"en caso de requerir factura es más IVA"*:

| | Sin factura | Con factura |
|---|---|---|
| Cotización | **$37,730** | $43,767 |
| Amazon (equipo solo, IVA incluido) | — | **≈$37,270** |

- **Si no necesitan factura**, la cotización gana: mismo precio y además
  llega armado, con Windows instalado y con alguien a quien reclamarle.
- **Si necesitan factura**, Amazon sale unos **$6,500 más barato**, porque
  sus precios ya traen IVA y dan factura.

Los $1,290 de servicios no son relleno: armar el NUC (meter RAM y SSD) e
instalar Windows es trabajo real que, comprando en Amazon, lo hace alguien
de todos modos.

---

## 3. Tres cosas que esa lista NO cubre para Lily

La cotización es para el armado del otro negocio: **kiosko + barra +
cocina**, tres pantallas. Lily tiene **cinco puestos**: caja, kiosko,
producción, horno y empaque.

### 3.1 Faltan monitores

En la lista hay tres (el de 22" y dos de 15"). Para Lily:

| Puesto | ¿Lo cubre la cotización? |
|---|---|
| Caja | Sí, con el de 22" touch |
| Producción | Sí, con un 15" |
| Horno | Sí, con el otro 15" |
| Empaque | **No** |
| Kiosko | **No** |

Faltan **dos**. No es un error de quien cotizó: cotizó el otro negocio.

`scripts/pantallas.ps1` aguanta que falten —si hay menos monitores que
estaciones, las últimas comparten el de más a la derecha— así que se puede
arrancar con tres y crecer. Pero hay que saberlo de antemano.

### 3.2 Las etiquetadoras tienen que ir por RED, no por USB

La cotización describe las LDT124 como **USB**. Si se conectan así, **el
agente de impresión no arranca**: hay un candado explícito en
`agente-impresion/src/config.ts` que exige que una impresora con
`lenguaje: "tspl"` tenga su `interface` en forma `tcp://IP:PUERTO`, y si no,
lanza y no levanta.

Está puesto a propósito, y el comentario del código dice por qué:

> *Una etiquetadora solo se alcanza por socket: si aquí hubiera un
> "printer:NombreDeWindows" el agente fallaría al primer trabajo real, en
> plena venta. Mejor que no arranque.*

**No hay que comprar otra cosa**: la LDT124 y la LDT114 traen **USB y
Ethernet** las dos. Lo que hay que hacer es cablearlas a la red y dejarles
**IP fija** (reserva de DHCP o configurada en la impresora), y escribir esa
IP en `printers.config.json`. Si una impresora cambia de IP, deja de
imprimir.

Y la LDT124 no aparece en Amazon México; la que sí está es la **LDT114**,
también de 4", también USB + LAN, a $2,392. Las dos son térmica directa
203 dpi, que es lo que pide `docs/etiquetas-comanda-tspl.md`.

### 3.3 La miniprinter es la del TICKET, y esa sí va por USB

La **RPT006S** es la impresora de recibos de 80 mm: es la del ticket del
cliente, la que hace falta para el arranque corto
(`docs/hardware-caja.md`). Trae USB, Ethernet y Serial — y aquí se quiere
**USB**, porque el ticket no pasa por el agente: lo manda Chrome a la
impresora **predeterminada de Windows**.

O sea que en esa lista hay **tres impresoras y dos oficios distintos**:
una de tickets (USB, ESC/POS, Chrome) y dos de comandas (red, TSPL, agente).
No son intercambiables.

---

## 4. Y el mini PC está sobrado, menos en un caso

El NUC 13 Pro con i5-1340P + 16 GB + 500 GB sale en **$12,183** (equipo,
memoria y disco). Lo que esa PC va a hacer es tener abiertas cuatro o cinco
pestañas de Chrome y correr un programa de Node que manda texto a dos
impresoras. Eso lo hace un **mini PC N100**, que en Amazon anda entre
**$3,500 y $3,700** con 16 GB y 512 GB ya puestos, Windows incluido y sin
que nadie tenga que armarlo.

**El único argumento a favor del NUC es el video**: trae 2× HDMI + 2× USB-C
con video, o sea cuatro salidas, y por eso la cotización incluye el
adaptador USB-C → HDMI. Un N100 típico trae dos. Entonces:

| Escenario | Qué conviene |
|---|---|
| **Arranque corto: solo caja y tickets** (una pantalla) | N100. Ahorro de ~$8,700 y no se nota |
| Una sola PC moviendo kiosko + 3 estaciones | El NUC, o dos N100 (sale más barato y una avería solo tumba la mitad) |

Lo segundo es la contrapartida que ya está escrita en `docs/hardware.md`:
una sola PC es un solo punto de falla. Dos N100 cuestan menos que un NUC
armado **y** parten el riesgo.

---

## 5. Si se arranca solo con caja y tickets

De los diez renglones de la cotización, el arranque corto necesita **tres**:

| | Qué | Amazon |
|---|---|---|
| 1 | Mini PC N100 16 GB / 512 GB *(en vez del NUC)* | ~$3,500 |
| 2 | Monitor touch — el de 22" o uno de 15" | $5,468 / $5,695 |
| 3 | Miniprinter 3nStar RPT006S 80 mm | $2,040 |
| 4 | Papel térmico 80 × 70, 10 rollos | $299 |

**≈$11,300**, y lo demás se compra cuando entren las estaciones. Nada de
esto se desperdicia después: la PC de la caja sigue siendo la de la caja.
Ver `docs/hardware-caja.md`.

La cotización ya recortada a eso —con los cables, el no-break y los dos
totales según qué PC se elija— está en `docs/hardware-cotizacion-caja.md`.
Es la lista que se le puede pasar al proveedor tal cual.
