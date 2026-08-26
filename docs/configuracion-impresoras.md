# Configuración de impresoras (Admin)

Referencia de los campos de Admin → Impresoras y de
`agente-impresion/printers.config.json`. Para la guía de instalación
completa ver `docs/instalacion-agente-impresion.md`; para cómo funciona
la cola por dentro, `docs/impresion-comandas.md`.

> ⚠️ **Las dos impresoras de la sucursal de Mérida son etiquetadoras TSPL,
> no impresoras de recibos.** Necesitan `"lenguaje": "tspl"` en
> `printers.config.json`; sin eso no imprimen y **no dan error**. Ver
> `docs/etiquetas-comanda-tspl.md`.

## Campos por impresora

| Campo (Admin) | Campo (`printers.config.json`) | Notas |
|---|---|---|
| Nombre | `descripcion` | Solo para identificarla en Admin/logs |
| Estación | — (implícito por `cocina_id`) | A qué estación pertenece — determina qué comandas le llegan (alimentos → Cocina, bebidas → Barra). Dejar "Sin asignar" para una impresora de propósito general (ej. caja) |
| Tipo de conexión | `interface` | Red (`tcp://IP:PUERTO`) o USB |
| IP / Puerto | parte de `interface` | Puerto casi siempre `9100` en impresoras ESC/POS de red |
| Dispositivo (USB) | parte de `interface` | Ruta en Linux, nombre compartido en Windows |
| — (no está en Admin) | `lenguaje` | `escpos` (recibos, por omisión) o `tspl` (etiquetadoras 3nstar/TSC). **No se adivina**: el lenguaje equivocado no imprime y no da error |
| Ancho de papel | `anchoPapel` | `58mm` o `80mm` — afecta cuántos caracteres caben por línea. Las TSPL lo ignoran: su medida está en el generador |
| Copias | `copias` | 1–5, cuántas veces se imprime cada comanda |
| Corte automático | `corteAutomatico` | Requiere que la impresora tenga cuchilla motorizada |
| Buzzer | `buzzer` | Solo si la impresora tiene buzzer y lo soporta por ESC/POS |
| Token del agente | `token` | Se genera solo, se muestra UNA vez al crear la impresora en Admin |

**El token y el resto de la config viven en dos lugares distintos a
propósito**: la fila en `impresoras` es la fuente de verdad de a dónde se
rutean las comandas (estación → impresora); `printers.config.json` es
config puramente local del agente (cómo llegar físicamente a esa
impresora desde ESE equipo). Cambiar la IP de una impresora, por ejemplo,
solo se edita en `printers.config.json` del agente — no hace falta tocar
Admin salvo que cambie de estación o se dé de baja.

## Una impresora por estación, o varias

Lo normal es 1 impresora = 1 estación (Cocina, Barra). Si el negocio
crece y una estación necesita más throughput, se pueden registrar **dos
impresoras para la misma `cocina_id`** — hoy `fn_encolar_comanda_para_pedido`
toma la primera activa que encuentre (`limit 1`), así que en ese caso solo
UNA de las dos recibiría comandas automáticamente; la segunda serviría
como respaldo manual (reimprimir eligiendo la impresora alternativa desde
Admin). Si se necesita balanceo real entre dos impresoras de la misma
estación, es una extensión futura (ronda robin o por carga) — no
implementada todavía porque ninguna sucursal lo necesita hoy.

## Caracteres especiales (acentos, eñes)

Las impresoras ESC/POS no usan UTF-8 nativamente — usan una tabla de
caracteres (`characterSet`) que hay que hacer coincidir con el modelo. El
agente arranca con `CharacterSet.PC858_EURO` (cubre la mayoría de clones
ESC/POS vendidos en México) en `agente-impresion/src/comanda.ts`,
función `crearImpresora()`. Si una impresora en particular imprime
símbolos raros en vez de acentos:

1. Corre `npm run test-print -- <id>` y revisa la salida.
2. Prueba otros valores de `CharacterSet` (`node-thermal-printer` trae
   varios: `PC850_MULTILINGUAL`, `PC852_LATIN2`, `SLOVENIA`, etc. — están
   en `node_modules/node-thermal-printer/types.d.ts` o su documentación).
3. Cambia la línea en `comanda.ts` y vuelve a probar.

Esto es **por modelo de impresora**, no por sucursal — una vez encontrado
el valor correcto para un modelo, todas las impresoras de ese mismo
modelo van a funcionar igual.

## 58mm vs 80mm

`width` en el agente se deriva de `anchoPapel` (32 caracteres para 58mm,
42 para 80mm). Si una comanda se ve cortada o con saltos de línea raros
en una impresora de 58mm, es señal de que el ancho configurado no
coincide con el papel real — corrígelo en Admin (afecta al siguiente
trabajo que se encole, no a los ya impresos).

## Ancho de banda / firewall

Las impresoras de red normalmente escuchan en el puerto `9100` (raw
ESC/POS sobre TCP, sin cifrar — normal para este tipo de hardware en una
red local). Si el equipo del agente y la impresora están en VLANs
distintas, hay que permitir ese puerto entre ambas.

## Rotar o revocar el token de una impresora

Si un `printers.config.json` se pierde/filtra: desactiva esa impresora en
Admin (deja de recibir trabajos nuevos) y crea una impresora nueva para
esa estación (token nuevo). No hay hoy un botón de "regenerar token" en
el mismo registro — es la forma más simple de rotar sin tocar SQL a mano;
se puede agregar un botón dedicado si se vuelve una operación frecuente.
