# Guía de hardware — Hojaldras Lily

El software son páginas web que corren en un navegador y hablan con Supabase.
Por eso el hardware es sencillo: pantallas, una PC, red estable y las dos
etiquetadoras. Precios aproximados en MXN (referencia 2026, varían mucho).

> **Antes de comprar impresoras, lee la sección 3.** Es lo único de esta lista
> donde comprar el modelo equivocado no da error: simplemente no imprime.

> **Si la tienda va a arrancar con solo caja y tickets**, no compres esta
> lista: la corta está en **`docs/hardware-caja.md`** (son cuatro cosas, y
> nada de lo que entra ahí se desperdicia después).

---

## 1. El montaje que ya está armado en los scripts

`scripts/pantallas.ps1` y `scripts/abrir-hojaldraslily.bat` asumen esto, y es
lo más barato que funciona bien:

**Una sola PC con cuatro monitores** y las dos etiquetadoras en la red.

| Monitor | Qué muestra | Quién lo ve |
|---|---|---|
| El **grande** | `kiosko` | El cliente, en la barra |
| Chico 1 | `produccion` | Quien arma los moldes |
| Chico 2 | `horno` | Quien hornea |
| Chico 3 | `empaque` | Quien empaca y entrega |

El reparto **no está escrito a mano**: el script le pregunta a Windows dónde
están los monitores y reparte por tamaño. Los chicos van **de izquierda a
derecha en el orden del camino del pan**. Si hay menos monitores que
estaciones, las últimas comparten el de más a la derecha, así que una PC con
dos monitores sigue abriendo todo. Si se equivoca, se manda con
`C:\Hojaldras Lily\pantallas.txt` (`kiosko=1`, `produccion=2`, `horno=3`,
`empaque=4`).

La **caja** (`pos`) y **Admin** no van en el arranque: se abren cuando se
necesitan con `abrir-caja-y-admin.bat`, en esa misma PC o en cualquier otra.
El turno se abre desde el kiosko (5 toques a la hojaldra).

*Contrapartida honesta:* es un solo punto de falla. Si esa PC se apaga se
caen las cuatro pantallas **y** las dos impresoras. Los pedidos no se pierden
—quedan en la cola de la base y se reimprimen al volver— pero las estaciones
se quedan a ciegas mientras tanto. Por eso el no-break no es opcional.

Si se prefiere separar, ver `docs/dia-de-instalacion.md`, opción B: una PC
por estación. Más caro, pero una avería solo tumba una estación.

---

## 2. La PC

| | Mínimo | Recomendado |
|---|---|---|
| Equipo | Cualquier PC/laptop con Windows | **Mini-PC tipo NUC**, Intel N100, 8 GB RAM |
| Aprox. | lo que ya haya | $3,000–5,000 |

Requisitos reales:

- **Tres o cuatro salidas de video** (o dos + una tarjeta/adaptador). Un
  mini-PC N100 típico trae dos HDMI + un USB-C con video: alcanza para tres,
  y con menos monitores que estaciones el script las junta.
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

Y al revés también: **la etiquetadora TSPL no puede imprimir el ticket del
cliente.** Son dos papeles distintos y dos impresoras distintas; la tabla que
las compara está en `docs/hardware-caja.md`, §4.

Lo que se necesita, una por estación:

| | Detalle |
|---|---|
| Tipo | Etiquetadora térmica directa, **lenguaje TSPL** |
| Resolución | **203 dpi** (8 puntos por mm) |
| Conexión | **Ethernet**, con IP fija, puerto **9100** |
| Etiqueta | rollo de **80 mm** de ancho × **25 mm** de avance, **gap de 4 mm** |
| Aprox. | $2,500–4,500 c/u |

El reparto de cada comanda lo decide el servidor por la estación del
producto, no la PC.

Consumible: rollos de etiqueta térmica de 80 × 25 mm con separación (gap).
No sirve el papel continuo de recibos.

**Y además, una tercera impresora: la de tickets.** Es la térmica de recibos
de 80 mm por USB que usa cualquier restaurante, va en la caja, y es la que
entrega el comprobante al cliente. El detalle de qué comprar y cómo
configurarla está en `docs/hardware-caja.md`, §1.3 — incluido el ajuste que
no se puede olvidar: **tiene que quedar como predeterminada en Windows**, o
el ticket se imprime en otra parte sin dar error.

---

## 4. Las pantallas

| Puesto | Mínimo | Recomendado | Aprox. |
|---|---|---|---|
| **Caja** (cajero) | Monitor 19–22" + mouse | **Monitor táctil 15.6–21.5"** | $3,500–6,500 |
| **Kiosko** (cliente) | Monitor 21.5" + mouse | **Monitor táctil 21.5"** en pedestal | $3,500–6,500 |
| **Producción** | Monitor 19–24" | + táctil o mouse inalámbrico | $2,000–3,500 |
| **Horno** | Monitor 19–24" | + táctil o mouse inalámbrico | $2,000–3,500 |
| **Empaque** | Monitor 19–24" | + táctil o mouse inalámbrico | $2,000–3,500 |
| **Folios** (opcional) | Smart TV + Fire Stick | TV dedicada | $4,000–5,500 |

- El kiosko **conviene que sea táctil**: es el cliente quien lo usa. Hay un
  script (`scripts/tactil.ps1`) para dejarlo bien configurado.
- La caja también: el catálogo es de tarjetas grandes y el cobro tiene
  teclado de pantalla. Con mouse funciona, pero en hora pico se nota.
- Las tres estaciones necesitan **alguna forma de marcar lo suyo**: pantalla
  táctil, o un mouse inalámbrico junto a cada mesa. Un mouse basta.
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
| Monitor táctil para la caja | $4,500 |
| 3 monitores 22" (producción, horno, empaque) | $7,500 |
| Impresora térmica de tickets 80 mm USB | $2,800 |
| 2 etiquetadoras TSPL de red 203 dpi | $7,000 |
| 3 mouse inalámbricos | $900 |
| Router + respaldo 4G | $2,500 |
| No-break | $1,800 |
| Rollos (etiqueta 80 × 25 y papel de 80 mm) | $1,200 |
| **Total** | **~$38,700** |
| Pantalla de folios (se puede dejar para después) | +$4,500 |
| Terminal de cobro | por definir |

**Arranque corto, solo caja y tickets (~$7,000–12,000):** la PC que haya, un
monitor táctil y la impresora de tickets. Es la etapa con la que se abre
hoy — la lista completa y lo que implica están en `docs/hardware-caja.md`.

**Arranque intermedio (~$20,000):** lo del arranque corto más el monitor del
kiosko, dos monitores para las estaciones y **una** etiquetadora. Se opera,
aunque dos estaciones compartan pantalla (el script lo contempla: con menos
monitores que estaciones avisa y las junta). Se crece después.

---

## Notas

- Cada pantalla es **Chrome apuntando a la URL de su app**, en modo kiosco y
  en autoarranque. No se instala nada más: las actualizaciones del software
  llegan solas al recargar.
- Lo único que se instala de verdad es el **agente de impresión**, y solo en
  la PC que ve a las etiquetadoras: es quien habla con ese hardware. Nada
  externo puede imprimir por él. **El ticket del cliente no pasa por ahí**:
  lo manda Chrome a la impresora predeterminada de Windows, así que funciona
  sin agente.
- Para el arranque corto (solo caja y tickets), `docs/hardware-caja.md`.
  Para el montaje paso a paso, `docs/dia-de-instalacion.md`. Para las
  etiquetadoras, `docs/etiquetas-comanda-tspl.md` y
  `docs/instalacion-agente-impresion.md`.
