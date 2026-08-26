# Etiquetas de comanda — etiquetadoras TSPL

Cómo salen las etiquetas de las 3nstar / TSC de barra y cocina cuando entra
un pedido, y cómo probarlo sin gastar consumible.

> Para la cola de impresión por dentro (reclamar / confirmar / reintentar) ver
> `docs/impresion-comandas.md`. Para instalar el agente en la NUC,
> `docs/instalacion-agente-impresion.md`.

---

## 0. Lo primero, porque es lo que rompe todo

Estas impresoras **no son de recibos**. Hablan **TSPL**, no ESC/POS.

Si se les manda ESC/POS —que es lo que habla `node-thermal-printer`, el
camino con el que nació este agente— **se tragan los datos y no imprimen
nada, sin dar error de ningún tipo**. El trabajo queda marcado como impreso
en la cola, en Admin todo se ve verde, y la comanda nunca llega a barra. No
hay síntoma que investigar.

Por eso el lenguaje es un campo explícito por impresora y no se adivina:

```json
"lenguaje": "tspl"
```

Si falta, el agente asume `escpos` (lo que había antes de existir este
campo). Para las dos etiquetadoras de la sucursal **tiene que decir `tspl`**.
El agente además se niega a arrancar si una impresora TSPL tiene un
`interface` que no sea `tcp://IP:PUERTO`: mejor que no levante a que falle
en plena venta.

---

## 1. Las dos impresoras

| Estación | IP | Puerto | Cocina en la base |
|---|---|---|---|
| **Barra — Bebidas** | `192.168.1.95` | 9100 | Bebidas |
| **Cocina — Alimentos** | `192.168.1.96` | 9100 | Alimentos |

Ya están dadas de alta en Admin → Impresoras y ligadas a su estación, que es
lo que hace que cada comanda caiga en la impresora correcta: el reparto lo
decide el servidor por `categorias.cocina_id`, nunca el cliente.

Etiqueta: **80 mm** en el eje del cabezal × **25 mm** de avance, gap 4 mm.
203 dpi (8 dots por milímetro). Socket TCP plano, sin autenticación,
codificación code page 850.

---

## 2. Qué sale impreso

```
+-----------------------+
| BEBIDAS #156490945    |
| 2 de 5                |
|                       |
| JAVIER                |
|                       |
| SHAKE OREO            |
|                       |
| [20 OZ]               |   <- blanco sobre negro
|                       |
| SPEC                  |
|                       |
| +WHEY CHOCOLATE       |
| +DESLACTOSADA         |
| +GALLETA              |
| +S/CREMA              |
|                       |
| 10/08 18:58           |
|                       |
| Eres un hojaldraslily   |
+-----------------------+
```

**Una etiqueta por unidad, no por línea de pedido.** Si alguien pide dos
shakes iguales salen dos etiquetas, porque cada una se pega a un vaso. El
`n de N` abarca el trabajo completo, así que quien prepara sabe si le falta
alguna.

Los campos vacíos no se imprimen y la etiqueta se acorta sola.

### El nombre

Es lo más grande de la etiqueta, porque es con lo que se reparte en barra.
Sale el nombre del cliente identificado; **si nadie se identificó, sale el
folio** (`#1042`). Nunca queda vacío.

> Otra razón para identificar al cliente en caja: además de sumarle
> mancuernas, su nombre acaba en la etiqueta.

### Las frases del pie

Rotan entre: *Buen dia!*, *Eres un hojaldraslily*, *Que lo disfrutes!*,
*Hecho para ti*, *Gracias por venir*, *Hoy toca consentirse*.

La elección **no es al azar**: sale de un hash del ticket y el número de
etiqueta. Una reimpresión sale idéntica a la original — si cambiara la
frase, en barra creerían que les llegó una comanda distinta.

### Abreviaturas de extras

No es una tabla de casos sueltos, es la regla que hay detrás: cocina lee el
prefijo (`S/` quitar, `C/` agregar, `-` menos) y luego el ingrediente.

| Caja escribe | Sale impreso |
|---|---|
| `sin azucar` | `+S/AZUCAR` |
| `sin crema` | `+S/CREMA` |
| `extra galleta` · `con extra galleta` · `mas galleta` | `+GALLETA` |
| `poco hielo` · `menos hielo` | `+-HIELO` |
| `con canela` | `+C/CANELA` |

Lo que no encaje en ninguna forma sale tal cual con un `+` delante. **Nunca
se pierde texto.**

---

## 3. De dónde salen los datos

La base encola un trabajo por pedido de cocina con este payload:

```json
{
  "folio": 1042, "estacion": "Bebidas", "cliente": "Ana",
  "creado_en": "...",
  "items": [{ "cantidad": 2, "nombre": "Shake Oreo", "personalizacion": "Leche deslactosada" }]
}
```

La personalización de texto libre (hoy: el tipo de leche) el agente la reparte
entre los campos de la etiqueta por lo que dice cada fragmento (separando por
`,` `;` `·` `|` y saltos de línea):

| Se reconoce | Va a |
|---|---|
| `20 OZ`, `16 oz` | `tamano` |
| empieza con `Leche…` | `leche` |
| empieza con `Proteina…` | `proteina` |
| empieza con `sin` / `con` / `extra` / `mas` / `poco` / `menos` | `extras` |
| lo demás | `notas` |

Es una lectura, no una adivinanza: lo que no reconoce cae en `notas`, que
también se imprime.

**El agente prefiere los campos ya separados si vienen.** El payload admite
`tamano`, `proteina`, `leche`, `extras[]` y `notas` por producto; el día que
la base los emita así, el agente los usa y deja de repartir texto — sin tocar
una línea del agente.

### Los extras van dentro de su producto

Cuando caja cobra un extra como producto aparte (la proteína suelta, las
galletas de $5), la orden guarda **de cuál shake es** — `orden_items.padre_item_id`,
que el kiosko manda como `padre_linea`. La comanda los agrupa bajo el `SPEC`
de ese shake en vez de sacarlos en su propia etiqueta.

Importa con dos shakes en el mismo pedido: uno con galletas y otro sin. Sin
ese vínculo no había forma de saber cuál las lleva.

Un extra cuyo padre acabó en **otra estación** sigue saliendo por su cuenta:
una etiqueta de más es preferible a que el dato desaparezca.

### Los nombres se compactan

El catálogo usa nombres largos porque tienen que distinguirse en el menú.
En una línea de 21 caracteres, la categoría ya se sabe:

| En el catálogo | En la etiqueta |
|---|---|
| `Proteína OPTIMUM - Chocolate` | `+OPTIMUM CHOCOLATE` |
| `2x Proteína OPTIMUM - Chocolate` | `+2X OPTIMUM CHOCOLATE` |
| `Leche de almendras` | `+ALMENDRAS` |

Se quita la categoría, el guión y los paréntesis. **Nunca la marca ni el
sabor**, que es lo que distingue un bote de otro. Las notas que escribe una
persona van tal cual: ahí cada palabra la puso alguien a propósito.

### El tamaño

No existe como campo propio todavía. Si el nombre del producto lo trae
(`Shake Oreo 20 OZ`), se saca de ahí y se pinta en el recuadro invertido, sin
repetirlo en el nombre. El campo ya viaja de punta a punta: el día que el
catálogo tenga tallas, se llena solo.

---

## 4. Instalarlo en la PC de la sucursal

Baja el agente, instala Node si falta, saca los tokens de las impresoras que
ya están en Admin, arma `printers.config.json`, imprime una etiqueta de
prueba en cada una y lo deja arrancando solo con Windows.

### La forma fácil: el `.bat`

Windows **bloquea por defecto los archivos `.ps1` descargados** — sale
*"la ejecución de scripts está deshabilitada en este sistema"*. Los `.bat` no
tienen esa restricción, así que hay uno que hace de puerta:

1. Bajar
   [`scripts/instalar-agente-impresion.bat`](https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-impresion.bat)
   (clic derecho → *Guardar como*).
2. Clic derecho sobre él → **Ejecutar como administrador**.
3. Pega la llave pública de Supabase cuando la pida.

No cambia la configuración del equipo: se salta la política solo para ese
proceso. Al terminar, Windows sigue bloqueando los `.ps1` igual que antes.

### Desde PowerShell, si prefieres

Como administrador. La clave es `-ExecutionPolicy Bypass`, y `Unblock-File`
para quitarle al archivo la marca de "bajado de internet":

```powershell
$f = "$env:TEMP\instalar.ps1"
irm https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-impresion.ps1 -OutFile $f
Unblock-File $f
powershell -NoProfile -ExecutionPolicy Bypass -File $f -AnonKey "PEGA_AQUI_LA_LLAVE"
```

> Ojo con `powershell -File` en vez de `& $f`: el instalador termina con
> `exit` cuando algo sale mal, y en la misma ventana eso la cerraría con el
> error dentro. En un proceso aparte, el mensaje se queda a la vista.

La llave sale de **Supabase → Project Settings → API Keys**. Sirven los dos
formatos, el nuevo (`sb_publishable_...`) y el viejo (`eyJ...`).

### Solo probar la red, sin instalar nada

Antes de bajar nada conviene saber si las impresoras contestan. Agrega
`-SoloProbar` al final del comando de PowerShell, o pásaselo al `.bat`:

```
instalar-agente-impresion.bat "LA_LLAVE" -SoloProbar
```

El instalador comprueba la red **antes** de instalar de todas formas: si las
impresoras no responden, se detiene y lo dice, en vez de dejar un agente
instalado que no sirve.

> **Cada corrida genera tokens nuevos.** El token no se puede volver a leer
> —es lo único que prueba la identidad de una impresora ante la cola— así que
> "obtenerlo" es en realidad crear uno. Si ya había un agente andando con el
> anterior, deja de imprimir hasta que se reinstale. No pasa nada por correr
> el instalador dos veces; sí pasa por dejar dos agentes con tokens distintos.

### A mano, si prefieres

**Admin → Impresoras → "Conectar agente"** en la impresora que sea. Muestra el
bloque completo de `printers.config.json` —con la IP y el `lenguaje` ya
puestos— listo para copiar. Ese botón queda pegado al borde derecho de la
tabla, así que se ve aunque la ventana esté angosta.

---

## 5. Probarlo

Todo esto corre en la NUC, dentro de `agente-impresion`.

**Ver el diseño sin gastar etiqueta** (no toca la red ni necesita Supabase):

```
npm run test-print -- bebidas --vista-previa
```

**Ver el TSPL crudo que se va a mandar:**

```
npm run test-print -- bebidas --tspl
```

**Imprimir de verdad una etiqueta de prueba:**

```
npm run test-print -- bebidas
npm run test-print -- alimentos
```

**Las pruebas automáticas del generador** (43 casos: la geometría exacta del
diseño validado, los cortes de línea, las abreviaturas, el reparto de la
personalización):

```
npm test
```

La prueba de geometría compara **coordenada por coordenada** contra el
diseño que ya se validó en la impresora física. Si alguien cambia un
espaciado sin querer, salta ahí y no en el mostrador.

**La prueba de verdad, de punta a punta:** levanta el agente
(`npm start`), levanta una venta en el kiosko-cajero y cóbrala. La comanda
tiene que salir sola en la estación que corresponda, sin que nadie toque
nada.

---

## 6. Si algo no imprime

| Síntoma | Causa | Solución |
|---|---|---|
| No sale nada y no hay error en ningún lado | Se mandó ESC/POS en vez de TSPL | `"lenguaje": "tspl"` en `printers.config.json` |
| El agente no arranca y se queja del `interface` | Una impresora TSPL con interface que no es `tcp://IP:PUERTO` | Corregirlo — es la protección funcionando |
| LED parpadeando, nada imprime | `Carriage Open` — tapa o cabezal sin cerrar | Cerrar hasta que enganchen los dos clips |
| Etiquetas descuadradas entre sí | Sensor en `Continuous` pero el rollo tiene gap | Panel web → Media → sensor a `Gap` → Calibration |
| Texto cortado por el lado | Más de 21 caracteres en fuente `1` | No debería pasar: el generador parte solo. Si pasa, es un bug — reportarlo con el texto exacto |
| Sale girado | Falta el `90` en el `TEXT` | No debería pasar: hay una prueba que lo verifica |
| El trabajo queda en `failed` | La impresora no respondió | Ver `error_ultimo` en Admin → Cola de impresión |

**Estado de una impresora:** `http://192.168.1.95/` o `http://192.168.1.96/`
→ menú *Status*.

> En ese panel, **no tocar `Factory Default`**: borra la configuración de red
> y habría que reasignar la IP.

---

## 7. El TSPL, para quien lo necesite generar desde otro lado

Si algún día otro sistema tiene que hablar con estas impresoras directo, esta
es la referencia. El agente ya hace todo esto — esto es para no tener que
leer el código.

```
SIZE 80 mm,25 mm
GAP 4 mm,0 mm
DIRECTION 0
REFERENCE 0,0
DENSITY 8
SPEED 4
CLS
TEXT 576,16,"1",90,1,1,"BEBIDAS #156490945"
TEXT 562,16,"1",90,1,1,"2 de 5"
TEXT 528,16,"3",90,1,1,"JAVIER"
TEXT 490,16,"2",90,1,1,"SHAKE OREO"
TEXT 460,16,"2",90,1,1," 20 OZ "
REVERSE 438,14,24,88
TEXT 410,16,"1",90,1,1,"SPEC"
TEXT 384,16,"1",90,1,1,"+WHEY CHOCOLATE"
TEXT 367,16,"1",90,1,1,"+DESLACTOSADA"
TEXT 350,16,"1",90,1,1,"+GALLETA"
TEXT 333,16,"1",90,1,1,"+S/CREMA"
TEXT 292,16,"1",90,1,1,"10/08 18:58"
TEXT 254,16,"2",90,1,1,"Eres un"
TEXT 231,16,"2",90,1,1,"hojaldraslily"
PRINT 1,1
```

Reglas para generarlo:

- **Sintaxis**: `TEXT x,y,"fuente",90,1,1,"texto"`. El `90` es la rotación y
  es imprescindible.
- **Eje X** = a lo largo del sticker. Empieza en **576** (72 mm) y **va
  bajando**. El glifo ocupa de `x - alto` hasta `x`: se ancla en `x` y luego
  se resta.
- **Eje Y** = fijo en **16** para todas las líneas (margen de 2 mm).
- **Alturas a restar**: fuente `1` → 12, `2` → 20, `3` → 24. Más el
  espaciado que se quiera entre líneas.
- **Ancho por línea**: 168 dots útiles → **21** caracteres en fuente `1`,
  **14** en `2`, **10** en `3`. Lo que pase de ahí hay que partirlo.
- **Recuadro invertido**: primero el `TEXT`, después
  `REVERSE x-alto-2, y-2, alto+4, (nº_caracteres × ancho_fuente)+4`.
  Ancho por carácter: `1` → 8, `2` → 12, `3` → 16.
- **Texto**: mayúsculas, sin acentos, y las comillas dobles cambiadas por
  simples — TSPL delimita con `"`.

Los espaciados verticales del ejemplo (2, 22, 14, 10, 30, 14, 5, 29, 26, 3)
no son decorativos: son el diseño validado contra la impresora, y están
fijados en `agente-impresion/src/tspl.test.ts`.
