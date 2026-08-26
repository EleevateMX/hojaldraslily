# Guía de hardware — Hojaldras Lily

El software son páginas web que corren en un navegador y hablan con Supabase.
Por eso el hardware es sencillo: pantallas, una PC, red estable y las dos
etiquetadoras. Precios aproximados en MXN (referencia 2026, varían mucho).

> **Antes de comprar impresoras, lee la sección 3.** Es lo único de esta lista
> donde comprar el modelo equivocado no da error: simplemente no imprime.

---

## 1. El montaje que ya está armado en los scripts

`scripts/pantallas.ps1` y `scripts/abrir-hojaldraslily.bat` asumen esto, y es
lo más barato que funciona bien:

**Una sola PC con tres monitores** y las dos etiquetadoras en la red.

| Monitor | Qué muestra | Quién lo ve |
|---|---|---|
| El **grande** | `kiosko` | El cliente, en la barra |
| Chico **izquierdo** | `cocina-bebidas` | Barra |
| Chico **derecho** | `cocina-alimentos` | Cocina |

El reparto **no está escrito a mano**: el script le pregunta a Windows dónde
están los monitores y reparte por tamaño. Si se equivoca, se manda con
`C:\Hojaldras Lily\pantallas.txt` (`kiosko=1`, `bebidas=2`, `cocina=3`).

La **caja** (`pos`) y **Admin** no van en el arranque: se abren cuando se
necesitan con `abrir-caja-y-admin.bat`, en esa misma PC o en cualquier otra.
El turno se abre desde el kiosko (5 toques a la hojaldra).

*Contrapartida honesta:* es un solo punto de falla. Si esa PC se apaga se
caen las tres pantallas **y** las dos impresoras. Los pedidos no se pierden
—quedan en la cola de la base y se reimprimen al volver— pero la cocina se
queda a ciegas mientras tanto. Por eso el no-break no es opcional.

Si se prefiere separar, ver `docs/dia-de-instalacion.md`, opción B: una PC
por estación. Más caro, pero una avería solo tumba una estación.

---

## 2. La PC

| | Mínimo | Recomendado |
|---|---|---|
| Equipo | Cualquier PC/laptop con Windows | **Mini-PC tipo NUC**, Intel N100, 8 GB RAM |
| Aprox. | lo que ya haya | $3,000–5,000 |

Requisitos reales:

- **Tres salidas de video** (o dos + una tarjeta/adaptador). Un mini-PC N100
  típico trae dos HDMI + un USB-C con video: alcanza.
- **Node.js 20 o superior** — lo necesita el agente de impresión.
- **Google Chrome**.
- **Cable de red**, no WiFi: tiene que hablar con las dos impresoras por IP.

La instalación es de una sola vez con `scripts/instalar-todo.bat`. Después la
PC arranca todo sola al prender.

---

## 3. Las dos impresoras — LEE ESTO ANTES DE COMPRAR

**No son impresoras de recibos.** Son **etiquetadoras** que hablan **TSPL**
(3nstar, TSC y compatibles).

Si se compran las térmicas de 80 mm de recibos que se usan en cualquier
restaurante —las que hablan ESC/POS— **el agente les manda los datos, ellas
se los tragan y no imprimen nada, sin dar error de ningún tipo**. El trabajo
queda marcado como impreso, en Admin todo se ve verde, y la comanda nunca
llega. No hay síntoma que investigar. Está documentado en
`docs/etiquetas-comanda-tspl.md`.

Lo que se necesita, una por estación:

| | Detalle |
|---|---|
| Tipo | Etiquetadora térmica directa, **lenguaje TSPL** |
| Resolución | **203 dpi** (8 puntos por mm) |
| Conexión | **Ethernet**, con IP fija, puerto **9100** |
| Etiqueta | rollo de **80 mm** de ancho × **25 mm** de avance, **gap de 4 mm** |
| Aprox. | $2,500–4,500 c/u |

Van dos: **barra** (bebidas) y **cocina** (alimentos). El reparto de cada
comanda lo decide el servidor por la estación del producto, no la PC.

Consumible: rollos de etiqueta térmica de 80 × 25 mm con separación (gap).
No sirve el papel continuo de recibos.

**Lo que NO hace falta:** impresora de tickets en la caja. Hoy el
comprobante del cliente sale por el diálogo de impresión del navegador si se
quiere; las comandas son estas dos etiquetadoras.

---

## 4. Las pantallas

| Puesto | Mínimo | Recomendado | Aprox. |
|---|---|---|---|
| **Kiosko** (cliente) | Monitor 21.5" + mouse | **Monitor táctil 21.5"** en pedestal | $3,500–6,500 |
| **Barra** | Monitor 19–24" | + táctil o mouse inalámbrico | $2,000–3,500 |
| **Cocina** | Monitor 19–24" | + táctil o mouse inalámbrico | $2,000–3,500 |
| **Folios** (opcional) | Smart TV + Fire Stick | TV dedicada | $4,000–5,500 |

- El kiosko **conviene que sea táctil**: es el cliente quien lo usa. Hay un
  script (`scripts/tactil.ps1`) para dejarlo bien configurado.
- Barra y cocina necesitan **alguna forma de marcar "listo"**: pantalla
  táctil, o un mouse inalámbrico junto a cada estación. Un mouse basta.
- La **pantalla de folios** (`cliente-display`, la TV que muestra qué está
  listo) es la única de la lista que se puede dejar para después.

---

## 5. Cobro con tarjeta

**Pendiente de definir.** El motor trae la integración con Clip escrita y
probada (`docs/integracion-clip.md`), pero para Lily todavía no está decidido
qué terminal se va a usar.

Mientras tanto el POS cobra con **Efectivo** y **Terminal**: se cobra en la
terminal que sea y se confirma en la pantalla, anotando el folio del voucher
si se quiere. Eso funciona con cualquier terminal, hoy mismo.

Si a futuro se quiere que el POS **le mande el monto solo** a la terminal
(que el cajero no teclee el importe), hace falta una terminal con API —en
Clip, el **Pin Pad**; los modelos de mostrador no exponen ese API—. Avísame
cuál va a ser y armo ese camino.

---

## 6. Red e internet (lo más crítico)

Todo depende de internet: las apps hablan con Supabase. Sin red no hay ventas
mientras dure la caída.

- **Router decente** con **IP fija** para las dos impresoras (por reserva de
  DHCP o configurada en la impresora). Si una impresora cambia de IP, deja de
  imprimir.
- **Cable de red** a la PC y a las dos impresoras. WiFi para lo demás.
- Muy recomendable: **respaldo 4G/LTE con failover automático** (~$1,500–3,500).

## 7. Energía

**No-break (UPS)** de 600–1000 VA (~$1,200–2,500) para la **PC y el router**.
Con el montaje de una sola PC esto es más necesario, no menos: un apagón corta
la venta y deja las tres pantallas y las dos impresoras fuera.

---

## Presupuesto de arranque

| Concepto | Aprox. MXN |
|---|---|
| Mini-PC N100 (3 salidas de video) | $4,500 |
| Monitor táctil 21.5" para el kiosko + pedestal | $6,000 |
| 2 monitores 22" (barra y cocina) | $5,000 |
| 2 etiquetadoras TSPL de red 203 dpi | $7,000 |
| 2 mouse inalámbricos | $600 |
| Router + respaldo 4G | $2,500 |
| No-break | $1,800 |
| Rollos de etiqueta 80 × 25 mm (arranque) | $800 |
| **Total** | **~$28,000** |
| Pantalla de folios (se puede dejar para después) | +$4,500 |
| Terminal de cobro | por definir |

**Versión de arranque mínimo (~$14,000):** la PC, dos monitores baratos
—kiosko y una estación— y **una** etiquetadora. Se opera, aunque barra y
cocina compartan pantalla (el script lo contempla: con 2 monitores avisa y
las junta). Se crece después.

---

## Notas

- Cada pantalla es **Chrome apuntando a la URL de su app**, en modo kiosco y
  en autoarranque. No se instala nada más: las actualizaciones del software
  llegan solas al recargar.
- Lo único que se instala de verdad es el **agente de impresión**, y solo en
  la PC que ve a las impresoras: es quien habla con el hardware. Nada externo
  puede imprimir por él.
- Para el montaje paso a paso, `docs/dia-de-instalacion.md`. Para las
  impresoras, `docs/etiquetas-comanda-tspl.md` y
  `docs/instalacion-agente-impresion.md`.
