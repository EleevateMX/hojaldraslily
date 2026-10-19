# La base para replicar: venta, inventario, caja e impresiones

Este documento es **el contrato de las cuatro funciones principales** del
sistema. Sirve para dos cosas:

1. **Levantar otra tienda** sin volver a descubrir lo que ya costó caro.
2. **Saber en qué va Hojaldras Lily** contra el motor que ya opera en
   producción (Shakeaholic), sin adornos.

No reemplaza a `CLAUDE.md` —ahí está el mapa del repo y las trampas— ni a
`docs/replicar-el-sistema.md`, que cuenta cómo se clonó este repo. Esto es
más angosto y más profundo: **qué función hace qué, qué invariante protege, y
qué pasa si se rompe.**

Fecha de corte: **19/10/2026**, contra la base `fzkdgqqvfkogmxdgqsxj`.

---

## 0. La idea en una página

Cuatro reglas sostienen todo lo demás. Si se replican estas cuatro y nada
más, el sistema nuevo ya es defendible:

| # | Regla | Dónde vive |
|---|---|---|
| 1 | **El dinero se calcula en el servidor.** El cliente nunca manda precios ni totales. | `fn_crear_orden` + `fn_cobrar_orden` |
| 2 | **Lo que cambia una existencia es un MOVIMIENTO, nunca un total.** Ninguna pantalla manda «ahora hay 40». | `inventario_movimientos`, `produccion` |
| 3 | **Lo que sale por papel es un TRABAJO con confirmación.** Si no salió, se ve. | `trabajos_impresion` + token por impresora |
| 4 | **Envolver, no tocar.** Un caso nuevo llama a las funciones del dinero; no las modifica. | `fn_venta_sin_internet`, `fn_encargo_entregar_con_venta` |

Y una quinta que no es de arquitectura sino de método, y que este mes dio más
resultado que las otras cuatro juntas:

> **Lo que está mal se encuentra LISTANDO, no leyendo.** Un `select` sobre
> `pg_proc` que cruza permisos contra candados encontró en una tarde cinco
> huecos que meses de leer código no habían visto. La consulta está en §6.

---

## 1. Venta

### Las funciones, y qué garantiza cada una

| Función | Qué hace | El invariante |
|---|---|---|
| `fn_crear_orden(sucursal, almacen, canal, items, corte, empleado, cliente, descuento, es_demo, nombre)` | Crea la orden y sus renglones | **Recalcula cada precio desde `productos.precio`** con `fn_precio_linea`. El cliente manda qué y cuántos; nunca a cuánto |
| `fn_precio_linea(producto, padre, canal)` | El precio de UN renglón | Aplica el canal y el sobreprecio del producto padre. **Una sola**: dos firmas conviviendo es cómo se cobra el precio equivocado |
| `fn_producto_va_en_canal(producto, canal)` | ¿Se vende aquí? | La «X» de la lista de Rappi es `disponible = false`, **no** la ausencia de precio |
| `fn_cobrar_orden(orden, metodo, monto, ref, autoriza, idempotency_key)` | Aprueba el pago | **Valida el monto contra el total del servidor** y es idempotente por la clave |
| `fn_cobrar_orden_mixto(orden, efectivo, tarjeta, ...)` | Pago partido | **Un solo pago aprobado** con su desglose en `pago_partes` |
| `fn_venta_sin_internet(venta jsonb)` | Registra lo cobrado a oscuras | Envuelve a las dos de arriba. Idempotente por el id del navegador |
| `fn_encargo_entregar_con_venta(...)` | Encargo + «y algo más» | Una sola llamada: o queda todo o no queda nada |

### Las tres cosas que hay que copiar tal cual

**1. El precio nunca viaja del cliente al servidor.** Parece obvio y tiene un
piso más abajo que casi nadie ve: `fn_crear_orden` recalcula, sí, **pero
recalcula desde `productos.precio`**. Si la tabla `productos` se puede
escribir con la llave publicable, la garantía no vale nada — alguien pone el
precio en $1 y el servidor cobra $1 «correctamente». Escribir el catálogo
tiene que exigir sesión de personal, y hay que cerrar también **la puerta de
atrás** (aquí era `app_data`, la tabla de Costeos, cuyo trigger reescribe el
catálogo).

**2. `idempotency_key` en todo lo que cobra.** Un doble toque del cajero, un
reintento por timeout, una respuesta que se cortó: los tres son el mismo
evento y tienen que producir un solo pago. El candado real es un índice
único (`uq_pagos_un_aprobado_por_orden`); la clave es lo que lo hace
cómodo de usar.

**3. `(f(...)).*` llama a la función UNA VEZ POR COLUMNA.** En plpgsql,
`select (fn_crear_orden(...)).* into v_fila` sobre una función que devuelve
un registro de 22 columnas crea **22 órdenes**. Aquí dejó 219 filas
huérfanas desde agosto sin descuadrar el corte ni verse en ninguna pantalla.
La forma correcta es la asignación: `v_fila := fn_crear_orden(...)`. Lo
encontró **contar filas antes y después** en una prueba de punta a punta.

### Vender sin internet

Está contado completo en `docs/sin-internet.md`. El resumen para replicar:

- Se detecta preguntándole **al servidor**, no a `navigator.onLine`: la PC
  puede tener red y no tener salida, que es justo el caso que se cae.
- La venta se escribe en `localStorage` **antes** de imprimir y antes de
  cambiar de pantalla; si no se pudo guardar, no se da por cobrada.
- Al volver, `fn_venta_sin_internet` envuelve el camino del dinero de
  siempre y **mueve `created_at` a la hora real** — que en una panadería no
  es cosmético, porque el pan se cuenta por día.
- **No se reintenta solo** si la falla ocurrió *después* de tocar el
  servidor: no se sabe si la orden alcanzó a nacer.
- **No se cierra la caja** con ventas sin registrar.

> **Lo que más resuelve no es esto: es un segundo internet** (4G con
> failover). Esto es para cuando también falla ese.

### Lo que NO conviene llevarse

- **Dos apps que cobran** (kiosko en modo cajero *y* POS). Dos puertas a la
  misma venta se separan solas. Empieza con **una sola app de caja**.
- **Productos gemelos**: el mismo artículo dado de alta dos veces con la
  misma clave. Un artículo, un producto.
- **Precios calculados** («mostrador + 19 %»). La lista real no sigue ningún
  porcentaje. Que un número se vea razonable no prueba que sea el del
  negocio.

---

## 2. Inventario

### Hay DOS inventarios y no son lo mismo

Esto es lo más específico de una panadería y lo que más tiempo ahorra
entender antes de escribir una línea:

| | Qué es | Se cuenta en | Tabla |
|---|---|---|---|
| **Insumos** | Harina, manteca, queso, bolsas, cajas | **Su presentación** (sacos, cubetas, cartones de 30) | `inventario_movimientos` / `inventario_stock` |
| **Producto terminado** | Lo que se vende | La unidad real del negocio | `produccion` |

Quien cuenta el almacén cuenta **sacos**, no gramos. Un sistema que le pide
gramos es un sistema que nadie llena.

En Lily el producto terminado son **cuadros de hojaldra en moldes de 48 o de
24**, y de ahí se cortan los paquetes conforme se venden. En otra tienda será
otra cosa — pero la forma se repite: **se produce en una unidad y se vende en
otra**, y la conversión se hace al vender, no al producir.

### Las funciones

| Función | Qué hace |
|---|---|
| `fn_inventario_contar(lineas, almacen)` | Conteo físico. Se escribe **lo que HAY**, no la diferencia |
| `fn_inventario_entrada(lineas, origen, almacen)` | «Llegó mercancía» |
| `fn_inventario_merma(insumo, cantidad, motivo, almacen)` | Lo que se tiró, **con motivo** |
| `fn_inventario_minimo(insumo, minimo, almacen)` | El mínimo del que sale la lista de compra |
| `fn_inventario_lista_de_compra(almacen)` | Qué bajó de su mínimo |
| `fn_inventario_huecos(dias)` | Lo que no descuenta: nombra lo chueco sin arreglarlo solo |
| `fn_descontar_inventario_por_orden()` | **Trigger**: al cobrar, descuenta por receta |

### Las cuatro reglas

**1. Solo movimientos. Nunca un total.** Este es *el* error caro del motor
original: Costeos era una hoja que guardaba un documento JSON y mandaba **la
diferencia** contra el último número que recordaba. De ahí salieron entradas
contadas dos veces, cientos de insumos fantasma y una pestaña vieja que
deshacía ventas. En Lily se cortó **antes de que disparara**. Costeos puede
seguir siendo donde se calcula el costo; **no puede ser dueño de la
existencia**.

**2. El descuento va en un TRIGGER, no en la RPC.** Así la regla se cumple
venga de donde venga el UPDATE. Lo mismo para lo que entra al inventario al
salir del horno.

**3. Que pueda quedar en negativo es a propósito.** Un negativo se ve. Un
cero que esconde un descuadre, no.

**4. Contar y encontrar que estaba bien también es información.**
`contado_at` se mueve **aunque no haya diferencia**, y la merma va con
motivo. Un faltante que nadie puede explicar es lo que hace que se deje de
creer en el inventario — y un inventario en el que no se cree ya no se
llena.

### La trampa del renombre

**Primero el renombre, después el alta.** Si el sembrado trae `Harina de
trigo` y la hoja del negocio dice `Harina Trigo`, dar de alta la de la hoja
sin renombrar primero deja **dos harinas**: las recetas colgadas de la vieja
y el conteo hecho sobre la nueva. O sea un inventario que se cuenta y nunca
se descuenta. Caso especial: cuando solo cambian las mayúsculas, el viejo y
el nuevo son la misma fila y el candado anti-duplicado impide el renombre.

Y: **sin renglón en `inventario_stock`, un insumo es invisible.** Existe en
el catálogo y no aparece en ninguna pantalla de almacén.

---

## 3. Caja

### Las funciones

| Qué | Cómo está hecho hoy |
|---|---|
| Abrir el turno | `fn_abrir_caja(caja, conteo, fondo)` — **exige sesión** |
| Cerrar el turno | `fn_cerrar_caja(corte, conteo, notas, efectivo)` — **exige sesión** |
| Sumar el cajón | `fn_suma_conteo(jsonb)`, en el **servidor** |
| El corte | `vw_corte_resumen`, **calculado en vivo**, nunca guardado |
| El desglose del mixto | `vw_pagos_por_metodo`: da las **partes** si las hay, y el pago entero si no |

> **Hasta hoy esas dos eran un `insert` y un `update` directos a la tabla**,
> así que cualquiera con la llave publicable podía abrir un turno, cerrarlo o
> escribir el `efectivo_contado` que se le antojara — **falsear el corte**.
> Ya son funciones con sesión. Queda abierto el permiso de TABLA sobre
> `caja_cortes`, que se cierra cuando el kiosko sostenga su sesión (§7).

**5. El cajón se cuenta por denominación, y el total lo saca el servidor.**
«Faltan $340» no le sirve a nadie; «falta un billete de $200 y tres de $50»
es una frase con la que alguien se acuerda de algo. El desglose viaja y
`fn_suma_conteo` lo suma: si el total viajara desde la pantalla, el desglose
y el número podrían no coincidir y habría dos verdades.

**6. El billete de $20 y la moneda de $20 NO son la misma casilla.** Un
conteo indexado solo por denominación hace que las dos filas escriban el
mismo contador: al teclear las monedas se borran los billetes. Es la única
denominación que choca en México hoy, y le pasó a las dos tiendas. El conteo
va `{"billetes": {...}, "monedas": {...}}`, en `@lily/utils`, con pruebas, y
lo comparten la caja y el kiosko.

### Lo que hay que respetar

**1. El corte se calcula, no se guarda.** Lo único que se guarda son las
aclaraciones. Un corte guardado es un número que deja de coincidir con la
realidad en cuanto algo se corrige después.

**2. El corte se arma por `corte_id`, no por fechas.** Eso es lo que permite
que una venta registrada al día siguiente —la de sin internet— caiga en el
turno al que de verdad pertenece.

**3. El desglose del mixto TIENE que llegar al corte.** El efectivo esperado
sale de sumar los pagos en efectivo, y contra ese número se cuenta el cajón.
Si el mixto guardara un solo pago sin partes, el corte pediría efectivo que
no está.

**4. Un solo pago aprobado por orden.** El índice único es lo que hace
imposible el doble cobro y **no se afloja** para que quepa un caso nuevo. El
motor original resolvió el mixto con dos pagos —uno aprobado y otro pendiente
que alguien aprobaba después— y terminó con un `delete` de «efectivos
fantasma» en su propio código. No se trajo ese camino.

---

## 4. Impresiones

### La forma

La base tiene **una cola** (`trabajos_impresion`) y **cada impresora tiene su
token**. El agente que corre en la PC de la tienda reclama sus trabajos, los
imprime y **confirma**; late cada 30 s reportando su versión, y Admin la
compara contra la esperada.

Eso es todo el diseño, y es lo que hay que copiar sin pensarlo: **un ticket
que no salió se ve en Admin**, en vez de irse callado a un PDF.

| Función | Quién la llama | Con qué se identifica |
|---|---|---|
| `fn_imprimir_reclamar_trabajos(token, agente, limite)` | El agente | **Su token** |
| `fn_imprimir_confirmar(token, trabajo)` | El agente | Su token |
| `fn_imprimir_fallar(token, trabajo, error)` | El agente | Su token |
| `fn_imprimir_latido(token, version)` | El agente | Su token |
| `fn_imprimir_ticket_caja(orden, ticket jsonb)` | La caja, al cobrar | Sesión |
| `fn_imprimir_prueba_staff(impresora)` | Admin → Probar | Sesión |
| `fn_imprimir_reimprimir(trabajo, ...)` | Admin | Sesión |
| `fn_instalador_impresoras(codigo, agente)` | El instalador | **Código de instalación** |
| `fn_instalador_token(codigo, impresora, agente)` | El instalador | Código de instalación |
| `fn_codigo_instalacion_crear()` | Admin | Sesión de **gerencia** |

### Dos agentes, dos programas

| | Qué imprime | Lenguaje | Configuración |
|---|---|---|---|
| `agente-impresion/` | Comandas por estación | **TSPL** (etiquetadoras) | `printers.config.json` |
| `apps/agente-caja/` | El ticket del cliente | **ESC/POS** (térmica) | `.env` |

Corren a la vez en la misma PC **a propósito**: si uno se cae, el otro sigue
imprimiendo. Una etiquetadora atorada no puede dejar al mostrador sin
tickets, ni al revés.

**`impresoras.rol`** (`comandas` | `tickets`) dice cuál es cuál. No se
adivina por «no tiene estación»: el día que alguien dé de alta una
etiquetadora sin estación, el ticket del cliente saldría en la de producción
— y mandarle TSPL a una ESC/POS **no da error**, se traga los datos y no
imprime.

### Las líneas del papel las arma el MISMO módulo que la pantalla

`@lily/ui/papel` arma las 48 columnas, y lo usan la vista previa **y** el
agente. Son **dos renderizadores y UN dato** (`TicketData`), con una prueba
que compara sus totales.

Si cada uno tuviera su formateador, la vista previa dejaría de coincidir con
el papel a la primera modificación, y nadie se enteraría hasta que un cliente
reclame.

Consecuencia práctica al replicar: ese agente **importa un paquete del
monorepo**, así que no se puede instalar con un `npm install` en la PC de la
tienda. Se empaqueta (`apps/agente-caja/empaquetar.mjs`, esbuild, 16 kB con
el módulo adentro) y el paquete va versionado, con una prueba que lo
mantiene al día volviendo a empaquetar y comparando.

### Instalar

- **Un `.bat` que se quita solo la marca de internet** y corre el `.ps1` con
  `-ExecutionPolicy Bypass`. Nunca un `.ps1` suelto: Windows lo bloquea y
  contesta algo que no se parece al problema.
- **La llave sale del `.env` de la PC**; el **código de instalación** lo
  teclea quien instala.
- **Imprime una prueba directa por TCP antes de nada.**
- **No dice LISTO hasta que el servidor ve el latido.** Un instalador que
  felicita y se va deja PCs «configuradas» que nunca se reportaron, y eso no
  se descubre hasta la primera comanda perdida.
- **Actualizar NO es instalar.** El arranque de cada mañana corre el mismo
  script con `-SoloActualizar`: cambia el código de los agentes y no toca
  configuración ni tokens. Sin esa separación, la actualización diaria
  pediría un código que a las 7 de la mañana no hay quién teclee.

### Lo que NO conviene llevarse

- **Servicio de Windows (`node-windows`).** En el motor original quedó dos
  veces «corriendo» sin reportarse nunca. La ventana que se relanza sola
  funciona.
- **Dejar abiertas a `anon` las funciones que entregan el token**, aunque sea
  «porque el instalador corre sin sesión». Es exactamente lo que el código de
  instalación viene a resolver.
- **Mandar la cabecera de papel (`SIZE`, `GAP`) delante de cada etiqueta
  dentro de un mismo envío.** Es la sospecha principal de las tres etiquetas
  en blanco por comanda que el motor original nunca resolvió. Aquí cada
  etiqueta va en **su propia conexión** con su propia cabecera, que es la
  forma segura; si aparecieran etiquetas en blanco, lo primero a probar es
  mandar la cabecera **una sola vez** por comanda.

---

## 5. El orden para levantar la tienda nueva

Lo mínimo para abrir primero, y lo demás cuando ya haya ventas:

1. **Dinero y caja**: crear, cobrar, el corte y la pasarela.
2. **El catálogo en TABLAS** (no en un documento JSON).
3. **El ticket de caja con su agente.**
4. **Inventario por movimientos**, con conteo y merma con motivo.
5. **Las comandas en pantalla y el agente de etiquetas.**
6. Lo demás.

Y dos decisiones que conviene tomar el día uno, porque después cuestan:

- **Zona horaria.** `hoyEnMerida()` existe porque la fecha del negocio no es
  la de UTC. Cámbiala si la tienda nueva está en otro lado.
- **Una sola app de caja.**

---

## 6. La consulta que encuentra los huecos

Esta es la herramienta más reutilizable de todo el documento. Lista las
funciones que **cualquiera con la llave publicable puede llamar** y que
**no nombran ningún candado** adentro:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')
  and pg_get_function_result(p.oid) <> 'trigger'
  and pg_get_functiondef(p.oid) !~
      'fn_es_staff|fn_es_jefe|fn_rol_staff|fn_empleado_actual|p_token|p_pin|p_clave|p_codigo'
order by p.proname;
```

**Córrela cada vez que se agreguen funciones.** En una tarde encontró cinco
huecos que meses de leer código no habían visto, entre ellos dos de escalada
de privilegios.

Tres cosas que hay que saber para leer el resultado:

1. **Un `grant` suma, no quita.** Postgres le da EXECUTE a `PUBLIC` por
   omisión en cada función nueva, así que `grant execute ... to
   authenticated` deja la puerta de PUBLIC abierta igual. Hay que
   `revoke all ... from public` **y** `from anon`, y luego otorgar. En
   `pg_proc.proacl` PUBLIC se ve como una entrada con el beneficiario
   **vacío** (`=X/postgres`); ojo al buscarla, porque un `like '%=X%'`
   también empata con `authenticated=X`.
2. **`service_role` se salta los GRANT.** Lo que solo llaman las Edge
   Functions se puede cerrar a todo el mundo y sigue andando.
3. **Aquí no se puede barrer en masa.** El kiosko y las estaciones escriben
   **sin sesión a propósito**, así que quitarle `anon` a `fn_crear_orden`
   deja a la tienda sin poder vender. **Antes de cerrar una, hay que ver
   quién la llama** — y buscar en TODO el repo, incluidos los `.ps1` y las
   Edge Functions. Esa búsqueda incompleta ya rompió el instalador una vez.

---

## 7. En qué va Lily, sin adornos

### Listo y probado contra producción

| Área | Qué |
|---|---|
| Venta | Precio en el servidor, monto validado, idempotencia, canales (mostrador/Rappi) con la «X» respetada |
| Venta | Pago mixto con un solo pago aprobado y su desglose |
| Venta | Encargos: apartar, anticipo, empacar, cobrar, «y algo más» |
| Venta | **Vender sin internet** y registrar al volver |
| Inventario | Insumos por movimientos, conteo físico, merma con motivo, mínimos, lista de compra |
| Inventario | Producción por moldes de 48 y 24, separados; el camino C→P→H→E |
| Caja | Turno, corte en vivo, el mixto llegando al corte |
| Caja | **Conteo por denominación** al abrir y al cerrar, con el total calculado en el servidor y el $20 separado por especie |
| Impresiones | Cola con token, latido con versión, prueba desde Admin, reimpresión auditada |
| Impresiones | **El ticket encolado a la térmica**, con el mismo módulo que la pantalla |
| Impresiones | Código de instalación, instalador que espera el latido, los dos agentes |

### Lo que falta, por orden de lo que duele

**1. Las funciones del cobro siguen abiertas a `anon`.** `fn_crear_orden`,
`fn_cobrar_orden` y `fn_crear_orden_kiosko_caja` las llaman el kiosko y las
estaciones, que escriben **sin sesión**. No se cierran quitándoles el
permiso —eso deja a la tienda sin vender— sino **haciendo que esas pantallas
abran sesión real**, que ya existe (`staff-login`). Es el trabajo pendiente
más grande y el motor original tampoco lo hizo.

**2. Queda una lista larga de funciones sin candado** reachable por `anon`
(§6 las lista). Las peores ya se cerraron hoy —alta de personal y
vinculación de cuentas, que eran escalada de privilegios directa—, pero
quedan las de catálogo, extras, observaciones y clientes. Ninguna es
escalada; varias permiten ensuciar el catálogo.

**3. `caja_cortes` sigue escribible por `anon` a nivel de TABLA.** Abrir y
cerrar ya son funciones con sesión, pero mientras el permiso de tabla siga
abierto el camino viejo también existe — y con él, falsear el corte. Es una
de las tres tablas que el kiosko y las estaciones escriben sin sesión (las
otras son `pedidos_cocina` y `cocina_items`). Se cierra junto con el punto 1.

**4. Caja: el corte no se imprime solo.** Debería salir en la térmica al
cerrar, no por el diálogo del navegador de quien esté mirando Admin.

**5. Los datos del negocio del ticket están en el código** (`NEGOCIO_DEFAULT`).
Funcionan para una tienda; para replicar hace falta una pantalla en Admin.
La frase del horario sigue sin existir porque la casa nunca la dio.

**6. `traerTodo()` para paginar.** PostgREST corta en 1 000 filas **y no
avisa**. Hoy ninguna tabla de Lily llega, pero el día que llegue el síntoma
será «faltan movimientos» sin ningún error.

**7. Cosas de la casa, no del código**: costos, recetas y proveedores en
Costeos; los mínimos del inventario; los secretos de la terminal; los PIN de
demostración de la vitrina, que hay que cambiar antes de abrir.

### Lo que Lily hace MEJOR que el motor original

Vale anotarlo para que no se «replique» al revés:

- **Costeos no es dueño de la existencia.** Allá sí, y de ahí salieron casi
  todos los bugs caros de inventario.
- **Una sola `fn_precio_linea`**, no dos firmas conviviendo.
- **El código de instalación** en vez de las funciones del token abiertas.
- **El alta de personal exige gerencia.**
- **Reimprimir exige sesión**, y quién reimprimió sale de la sesión, no del
  cliente.
- **El conteo del cajón separa el billete del $20 de la moneda del $20**, con
  pruebas, y lo comparten la caja y el kiosko. Allá la forma plana dejó diez
  cortes imposibles de recuperar.
- **El agente de tickets comparte el formateador con la pantalla**, en vez de
  tener el suyo.
- **Sin lealtad.** Se quitaron Rewards, cupones, promos y metas: venían de
  una heladería con mancuernas y sellos, y esto es una panadería. Una
  pantalla que nadie va a usar es código que hay que mantener, migrar y
  revisar cada vez que se toca la base.
