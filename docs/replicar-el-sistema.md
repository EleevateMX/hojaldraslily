# Replicar este sistema en otro negocio

Todo lo que hace falta para levantar el mismo punto de venta en otro
local, sin volver a aprender lo que aquí ya se aprendió a golpes.

Está escrito en dos capas: primero el **brief para arrancar** (lo que se
pega tal cual y empieza a construir), y después **por qué está armado
así** — que es la parte que no se puede improvisar, porque cada decisión
de abajo salió de algo que se rompió en producción con gente esperando.

---

## 1. Qué es, en una página

Un punto de venta completo para un negocio de mostrador: 9 aplicaciones
web sobre **una sola base de datos**, desplegadas solas cuando se hace
push, más un programa chico que corre en la computadora del local para
imprimir.

| App | Quién la usa | Qué hace |
|---|---|---|
| `web` | El público | Página del negocio, menú vivo |
| `kiosko` | Cliente y cajero en la barra | Pedir y cobrar |
| `pos` | Caja | Turno, cobros manuales |
| `cocina-*` | Estaciones de preparación | Las comandas en pantalla |
| `cliente-display` | TV del local | Folios listos |
| `admin` | Gerencia | Catálogo, ventas, diagnóstico |
| `cliente-pwa` | Celular del cliente | Lealtad, monedero |
| `costos` | Quien cuesta el menú | Costeo e inventario |

**Lo que lo distingue de un POS de caja:** el catálogo no se captura dos
veces. Se cuesta una vez en la herramienta de costeo — con insumos,
mermas y márgenes reales — y de ahí sale solo el producto que se vende.
El precio nunca se teclea en dos lugares.

### La pila

- **Base de datos y autenticación**: Supabase (Postgres). Toda la lógica
  de dinero vive en funciones de Postgres, no en el navegador.
- **Frontend**: React + Vite + Tailwind, un monorepo con pnpm.
- **Despliegue**: GitHub Actions → Cloudflare Pages. Push a `main` y en
  tres minutos está arriba.
- **Impresión**: un programa Node en la PC del local que habla TSPL con
  etiquetadoras de red.
- **Cobro con tarjeta**: terminal física por API.

### Lo que cuesta operarlo

Supabase y Cloudflare Pages arrancan en plan gratuito y aguantan un local
de este tamaño. Los gastos reales son el dominio, las etiquetadoras, la
mini-PC y las comisiones de la terminal. Sin licencias por caja ni renta
mensual de software.

---

## 2. El brief para arrancar

Esto se pega en Claude Code, en un repositorio vacío. Los `«corchetes»`
son lo que cambia por negocio.

> Quiero un punto de venta completo para **«tipo de negocio, ej: una
> cafetería de especialidad»** en **«ciudad»**. Monorepo con pnpm, React +
> Vite + Tailwind, Supabase como base de datos y autenticación, despliegue
> a Cloudflare Pages por GitHub Actions.
>
> **Las aplicaciones**: una página pública, un kiosko para pedir en la
> barra, un POS para la caja, una o más pantallas de estación para las
> comandas, una pantalla de folios listos, un panel de administración, una
> app de lealtad para el celular del cliente, y una herramienta de costeo.
>
> **Reglas que no se negocian, y quiero que las apliques desde el primer
> commit:**
>
> 1. **El dinero se calcula en el servidor.** Crear una orden recalcula
>    precios y total desde la base; cobrar valida el monto contra ese
>    total y es idempotente. El navegador nunca manda precios. Nunca abras
>    un camino que permita aprobar un pago con un INSERT directo.
> 2. **Un solo catálogo.** El costeo es la fuente de la verdad: de ahí
>    salen los productos que se venden. Nada de capturar el menú dos veces.
> 3. **Guardar y publicar son cosas distintas.** Guardar sincroniza; una
>    acción aparte enseña el diff — altas, bajas, renombres, precios — y
>    solo al confirmar las pantallas del local se enteran.
> 4. **Todo movimiento de saldo deja rastro.** Nada de sumar puntos con un
>    `update` suelto: cada movimiento se registra con cuánto, de dónde,
>    en qué folio, quién y cuánto quedó después.
> 5. **RLS en todas las tablas**, y el personal entra con PIN canjeado por
>    una sesión real de autenticación — no con un booleano en el navegador.
>
> **Empieza por**: el esquema de la base con sus políticas, las funciones
> de crear y cobrar orden con sus pruebas, y el kiosko. Lo demás encima de
> eso.
>
> Escribe todo en español, comentarios incluidos, y documenta cada decisión
> no obvia en `docs/`.

---

## 3. Por qué está armado así

Estas son las decisiones que costaron algo aprender. Copiar la estructura
sin copiar esto es copiar la mitad.

### El dinero se calcula en el servidor, siempre

El cliente manda **qué** quiere, nunca **cuánto cuesta**. La función que
crea la orden recalcula todo desde la tabla de productos, y la que cobra
valida el monto contra ese total y es idempotente por clave.

Suena obvio hasta que alguien agrega un descuento en el frontend "para
salir del paso". A partir de ahí ya no se puede confiar en ningún total.

### Guardar no puede ser publicar

Si guardar en la herramienta de costeo empuja el cambio a la barra al
instante, quien costea no puede equivocarse nunca a media captura: un
nombre a medio escribir o un precio en borrador ya está frente al cliente.

Guardar sincroniza; publicar toca el timbre de las pantallas y **antes
enseña exactamente qué va a cambiar**. Con el diff calculado contra la
foto de la última publicación, no contra "hace un rato": si alguien guardó
el lunes y publica el jueves, tiene que ver los tres días juntos.

### La impresión vive fuera de la nube

Las etiquetadoras están en una red local; ningún servidor las alcanza. Un
programa chico en la PC del local reclama trabajos de una cola y late cada
pocos segundos reportando su versión.

La consecuencia de diseño importante: **la cola es de la base, no del
programa**. Si la PC se apaga a media tarde, los trabajos siguen ahí y
salen cuando vuelve. Y como late, el panel puede decir "esta impresora
lleva 40 minutos sin dar señales" en vez de que alguien lo descubra
porque no salió papel.

### Los indicadores llevan ventana de tiempo

Un indicador que **no puede volver a verde deja de leerse**. Aquí pasó:
"comandas que fallaron: 21" contaba historia de un mes anterior,
irreimprimible, y consiguió que nadie mirara ese número nunca más.

Todo lo que sea salud lleva ventana (24 h, 7 días) y cuenta **solo lo
accionable**. Un contador que miente es peor que no tener contador.

### Separar lo que se debe de lo que se regala

Si el negocio va a tener monedero prepagado, el saldo comprado y los
puntos de promoción **no se suman en un solo número**. El comprado es
dinero que ya entró a la caja y se debe en producto: es un pasivo, y hay
que poder responder "¿cuánto dinero de clientes tenemos en la calle?" sin
que se mezcle con la promoción.

Al canjear se gastan primero los de promoción, justo porque son los que
pueden caducar.

---

## 4. Lo que cambia por negocio

Checklist de personalización. Lo demás se queda igual.

**Identidad** — un solo archivo de tokens (colores y tres tipografías) que
todas las apps importan. Cambiarlo cambia las nueve. Cuidado con las apps
que carguen fuentes por su cuenta: se desvían solas y nadie lo nota.

**El catálogo y sus estaciones** — qué categorías hay y a qué pantalla va
cada una. Una cafetería puede tener una sola estación; aquí son dos.

**Las reglas de lealtad** — cuántos puntos por peso, cuántas compras para
el premio, qué productos cuentan. Todo son filas de configuración, no
código.

**El cobro con tarjeta** — la integración con la terminal es lo más
específico de cada país y proveedor. Presupuesta esto aparte.

**Los idiomas del hardware** — las etiquetadoras hablan TSPL o ZPL según
el modelo; las de tickets, ESC/POS. Verifica el modelo antes de comprar.

---

## 5. Las trampas que ya costaron caro

Estas no son teoría. Cada una se descubrió con el local abierto.

**Postgres**

- `create or replace view` borra las opciones de la vista. Hay que volver
  a declarar `security_invoker` o la vista queda insegura en silencio.
- Cambiar la firma de una función **no la reemplaza: la duplica**. Aquí
  hubo tres versiones de la función de crear orden conviviendo, y las
  viejas no cobraban los sobreprecios.
- Un `update ... from` que empata por nombre le pega a **todas** las filas
  con ese nombre. Eso resucitaba productos duplicados que alguien acababa
  de apagar: apagarlos a mano no servía de nada.
- **Primero se arregla quien crea el conflicto, después se pone el
  candado.** Poner un índice único antes de arreglar la función que lo
  viola hace fallar el guardado entero — y dejar al negocio sin poder
  guardar precios es peor que el problema que se quería evitar.

**Frontend**

- La pantalla del cliente **no se recarga a media venta**. La señal de
  recarga espera a que no haya un carrito abierto.
- Un error que aparece y se va solo en un segundo es peor que ningún
  error. Si algo se recupera con un reintento, reintenta en silencio.
- Emoji como iconos: se ven distintos en cada teléfono, en algunos Android
  viejos salen como un cuadro, y no se pueden teñir. Es el detalle que más
  delata que algo es una página web y no una app.

**La computadora del local**

- Un instalador que se eleva **entero** guarda el arranque automático en
  el perfil del administrador — un perfil que nadie abre. La PC se prende
  y no abre nada, mientras el instalador ya dijo "listo". Hay que partirlo:
  lo que instala corre elevado, lo que toca el escritorio corre como el
  usuario que usa la caja.
- El orden del arranque importa: esperar internet → levantar la impresión →
  abrir pantallas → **y hasta el final** buscar actualizaciones. Al revés,
  una actualización pendiente saca una ventana de permiso y el local
  amanece cerrado.
- No escribas coordenadas de monitores a mano. Pregúntale a Windows dónde
  están y reparte por tamaño; después **empuja** cada ventana a su sitio,
  porque el navegador recuerda la última posición e ignora lo que le pidas
  al abrirlo.
- Los `.bat` y `.ps1` deben ser **ASCII puro**. Una raya larga en UTF-8 se
  convierte en tres caracteres al leerse como ANSI, y uno de ellos
  PowerShell lo toma por comilla: el archivo parsea y hace algo distinto,
  sin dar error.

**Operación**

- El programa de lealtad depende de que la venta **se ligue al cliente**.
  Si nadie pide el código en caja, la app se ve preciosa y la tarjeta se
  queda en cero. Aquí, con cientos de ventas hechas, ningún cliente
  registrado tenía compras ligadas. No es un problema de software.

---

## 6. Orden sugerido de construcción

1. **Esquema y políticas** de la base. Todo lo demás cuelga de aquí.
2. **Crear y cobrar orden**, con pruebas de concurrencia e idempotencia.
   Que dos cajas no puedan cobrar dos veces la misma orden.
3. **Kiosko**, que es donde ocurre la venta.
4. **Pantallas de estación** y la cola de impresión.
5. **Costeo** y su sincronización con el catálogo.
6. **Admin**: ventas, catálogo y un panel de diagnóstico desde temprano —
   se agradece cuando algo falla y nadie sabe dónde mirar.
7. **Lealtad**, al final. Es lo que más ilusión hace y lo que menos
   importa si lo anterior no está sólido.

Entre el 3 y el 4 ya se puede vender. Todo lo demás se puede construir con
el negocio abierto.

---

## 7. Antes de abrir

- Una venta real de punta a punta: pedir, cobrar, que salga el papel, que
  aparezca en el corte.
- Apagar la PC a media venta y prenderla: los trabajos pendientes tienen
  que salir solos.
- Cobrar dos veces la misma orden a propósito: la segunda tiene que
  rebotar.
- Cerrar el turno contando el efectivo por denominación, no de cabeza. Si
  el corte no cuadra, hay que poder distinguir si falta dinero o si
  alguien sumó mal — y lo segundo pasa mucho más seguido.
