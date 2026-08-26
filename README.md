# Hojaldras Lily · Punto de venta

Demostración visual del sistema de punto de venta para Hojaldras Lily
(Mérida, Yucatán), construida con los colores, tipografías y componentes
del **Manual de Identidad v1.0**.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `index.html` | Demo interactiva completa: la propuesta, la vitrina (inventario) y el kiosko con cobro. Se abre directo en el navegador, sin instalar nada. |
| `identidad/tokens.css` | Los tokens de marca del manual (sección 08). Toda app del sistema debe importar este archivo y leer los tokens, nunca el hex directo. |
| `docs/replicar-el-sistema.md` | El paso a paso y las decisiones de diseño para construir el sistema completo. |

## La demo, en tres pestañas

1. **La idea** — el argumento de venta: el precio se captura una vez, el
   cambio lo calcula la caja, y si un producto se acaba su botón se apaga solo.
2. **La vitrina** — el inventario explicado sin decirle inventario: la
   pantalla es un espejo de la vitrina de cristal. Se toca dos veces al día
   (conteo de la mañana y corte de la tarde); el resto del día se descuenta
   sola con cada venta.
3. **El kiosko** — la venta en tres toques: escoja, revise, cobre. Con
   cobro en efectivo (cambio calculado en grande) o tarjeta, y ticket de
   80 mm según la sección 11 del manual.

Las dos pestañas están conectadas en vivo: una venta en el kiosko baja la
cuenta de la vitrina, que es exactamente lo que hace el sistema real.

## Reglas que la demo ilustra y el sistema real cumple

- El dinero se calcula en el servidor; el navegador nunca manda precios.
- Una orden no se puede cobrar dos veces (cobro idempotente).
- Un solo catálogo: el costeo es la fuente de la verdad.
- Los avisos de existencia hablan con palabras, no solo con colores.
