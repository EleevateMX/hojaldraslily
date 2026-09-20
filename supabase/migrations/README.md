# Migraciones

Historial en el proyecto Supabase **Hojaldras Lily** (`fzkdgqqvfkogmxdgqsxj`).

Esta carpeta contiene el **historial canónico completo** (132 migraciones)
replicado del proyecto original el 2026-08-26, con la marca
adaptada (ver `scripts/adaptar-sql-lily.sh` y
`scripts/instrucciones-replicacion-migraciones.md`). El orden exacto vive
en `orden-canonico.txt`; los archivos van nombrados `VERSION_NOMBRE.sql`.

Las dos primeras (`hojaldraslily_inicial`, `core_unificado`) son las
fundacionales que en el proyecto original nunca vivieron en repo: aquí sí
están versionadas.

Reglas (heredadas del original, siguen aplicando):

- **Solo migraciones aditivas.** Nada de `DROP TABLE` / `DROP COLUMN` sobre
  objetos con datos. `app_data` y `app_users` son intocables.
- Toda migración nueva se versiona en esta carpeta y se aplica con el MCP
  de Supabase o `supabase db push`.
- Después de cada migración, regenerar `packages/types/src/database.ts`.
- `create or replace view` borra `security_invoker`: volver a declararlo.
- Cambiar la firma de una función no la reemplaza: la duplica. Borrar la
  vieja explícitamente.

## Migraciones propias de Lily (posteriores a la réplica)

Van después de las 132 canónicas y **no** existen en el proyecto original;
por eso no aparecen en `orden-canonico.txt`. Se aplican en orden de nombre:

| Versión | Qué hace |
|---|---|
| `20260826070000` | El cron de Clip usa la llave de Lily, no la del original |
| `20260826071000` | Extras propios del giro de hojaldras |
| `20260826072000` | Las 4 vistas que venían sin `security_invoker` |
| `20260826073000` | `search_path` fijo en las dos funciones que faltaban |
| `20260826074000` | Las categorías de panadería |
| `20260826180000` | El menú real (del día, por encargo, temporada) |
| `20260826210000` | `fn_menus_del_dia`: el interruptor de cada menú |
| `20260826213000` | El catálogo solo lo escribe el personal (ver abajo) |
| `20260826214000` | Fuera las categorías heredadas del motor original |
| `20260826220000` | Costeos con sesión propia (cierra la puerta de atrás a los precios) |
| `20260826221000` | Una imagen de referencia por sabor |
| `20260826222000` | Producción del día: paquetes horneados, mermados y disponibles |

### Lo que cerró `20260826213000`

Con la llave publicable —que es **pública por diseño**, va en el bundle de
las 9 apps— se podía **escribir** el catálogo: las políticas eran
`for update using (true)` para el rol `public` (que incluye `anon`) y `anon`
tenía además el GRANT. Comprobado en esta base: una pieza de $790 quedó en
$1 y se restauró.

Eso no es una fuga de datos, es peor: rompe la garantía de "el dinero se
calcula en el servidor" (CLAUDE.md, 2.2). `fn_crear_orden` sí recalcula el
total desde `productos.precio`, pero si ese precio ya viene alterado, el
servidor cobra $1 y todo cuadra.

Escribir el catálogo ahora exige **ser personal** (`fn_rol_staff()`), no
basta con `authenticated`: un cliente de Rewards también lo es. Leer no
cambió — el menú sigue siendo público.

**Falta cerrar** (anotado, no hecho): `pedidos_cocina`, `cocina_items` y
`caja_cortes` siguen abiertas a `anon` porque el kiosko y las pantallas de
estación corren **sin sesión**. Se cierran haciendo que esas pantallas
abran sesión real (ya existe `staff-login`), no quitándoles el permiso:
eso dejaría la tienda sin poder marcar comandas ni abrir caja.


### La puerta de atrás que cerró `20260826220000`

`20260826213000` cerró la escritura directa del catálogo, pero **no bastaba**:
`app_data` seguía con INSERT/UPDATE para `anon`, y su trigger `app_data_sync`
corre como DEFINER y reescribe productos, insumos y recetas. O sea que con la
llave pública todavía se podían mover los precios — dando el rodeo por
Costeos en vez de tocar `productos`.

Había además un problema de confidencialidad: `app_data` guarda el costeo
(costos, márgenes, proveedores) y estaba con `select` para `anon`.

Costeos no puede usar sesión de Supabase Auth (es un HTML plano con su propio
usuario y contraseña), así que ahora al entrar recibe un **token** de 12 horas
y todo pasa por `fn_costos_cargar` / `fn_costos_guardar`. `app_data` quedó
cerrada a `anon`.

Efecto colateral aceptado: Realtime ya no entrega los cambios de `app_data`
(aplica RLS igual que una consulta), así que Costeos dejó de avisar
"actualizado desde otro dispositivo". Recargar trae lo último.

## Producción y encargos (27 de agosto)

| Versión | Qué hace |
|---|---|
| `20260827100000` | Órdenes de producción y encargos (tablas, trigger al inventario, permisos) |
| `20260827101000` | Existencias con `apartados` y `libres` |
| `20260827102000` | Mandar a producir, avanzar, apartar, cobrar y cancelar |
| `20260827103000` | El cobro del encargo usa la fila que devuelve `fn_crear_orden` |

**Las dos reglas que hay que respetar si se toca esto:**

1. **Lo hecho entra solo al inventario**, y va en un TRIGGER
   (`fn_produccion_desde_orden`) sobre `orden_produccion_items`, no dentro de
   la RPC. Así la regla se cumple venga de donde venga el UPDATE. Apunta solo
   la DIFERENCIA: marcar «van 12» y luego «van 20» tiene que sumar 20, no 32.

2. **Apartar no descuenta.** Un encargo cuenta como `apartado` mientras su
   estado lo sea; al pagarse deja de contar ahí y su venta cae en `vendidos`.
   Así no se cuenta dos veces.

`fn_encargo_cobrar` pasa por `fn_crear_orden` + `fn_cobrar_orden` a propósito.
La primera versión insertaba en `ordenes` directo y **estaba mal**: esa orden
nacía sin `corte_id`, o sea que el cobro no aparecía en el corte de caja y el
dinero del día no cuadraba. Por el camino normal se ganan además las comandas
por estación y el movimiento de inventario.

## El modelo de cuadros (28 de agosto)

| Versión | Qué hace |
|---|---|
| `20260827110000` | `rappi` como canal de venta |
| `20260827111000` | Lista de precios por canal |
| `20260827112000` | `fn_crear_orden` cobra el precio del canal (parche con ancla) |
| `20260827113000` | Tiempo de horneado y hora estimada de salida |
| `20260827120000` | Sabor y cuadros por producto; producción en cuadros |
| `20260827121000` | Existencias por sabor y paquetes que alcanzan |
| `20260827122000` | Producción por moldes |

**La regla que cambió todo:** el pan sale en **moldes de 48 cuadros** y de ahí
se cortan los paquetes conforme se venden. Los tamaños **no son inventarios
separados**: de 192 cuadros salen 15 paquetes de 12 *o* 7 de 24 *o* 3 de 48 —
el mismo pan contado distinto. Contarlo por paquete obligaba a decidir en el
horno algo que se decide en el mostrador.

**Sobre el parche de `fn_crear_orden`:** el guardaclase del método de
CLAUDE.md **abortó dos veces** antes de aplicar. La primera versión buscaba el
texto literal de la llamada y solo encontraba una de las dos (la otra está
partida en varias líneas), así que habría dejado la función cobrando el precio
del canal en el total y el de mostrador en los renglones. Se resolvió con un
patrón que tolera saltos de línea. Es exactamente para lo que sirve verificar
que el ancla aparece N veces antes de ejecutar.

## La lista de precios y el inventario de verdad (17 de septiembre)

Hasta aquí el catálogo y el inventario eran una base verosímil: los precios de
las hojaldras estaban bien, todo lo demás estaba inventado o vacío. El negocio
pasó dos hojas —su lista de precios y su inventario— y esto es lo que cambió.

| Versión | Qué hace |
|---|---|
| `20260917100000` | `precios_canal.disponible`: la **"X"** de la hoja de precios |
| `20260917100100` | `fn_crear_orden` rechaza lo que no va en el canal (parche con ancla) |
| `20260917101000` | Bocadillos, Panes, Galletas, Anís y Temporada, con precios reales |
| `20260917102000` | Tiempos de horneado reales (50 de base, Fiesta 75, pan de leche 35) |
| `20260917103000` | `tipo_insumo` gana `limpieza` (va sola: enum recién agregado) |
| `20260917104000` | Los 99 insumos de la casa, con su presentación, en seis grupos |
| `20260917105000` | Conteo físico y entrada de mercancía |
| `20260917105100` | Merma, mínimos, lista de compra y auditoría |

### La "X" significaba lo contrario de lo que el sistema entendía

`precios_canal` guarda **solo las excepciones**: sin fila, manda el precio de
mostrador. Eso funciona para un producto que cuesta lo mismo en los dos lados,
pero la hoja de la casa marca con **X** siete tamaños de hojaldra, la trenza,
el tuti de nutella y todo lo de anís: **no se venden en la plataforma**.

Sin fila, el sistema los habría listado en Rappi **al precio de mostrador** —
el precio sin la comisión— y cada venta habría perdido dinero en silencio. Se
arregló con una marca explícita (`disponible = false`) y no borrando el
precio, porque *"no lo vendo aquí"* es una decisión, no un dato faltante.

La regla está escrita **tres veces** y las tres tienen que coincidir:
`fn_producto_va_en_canal` (rechaza la orden), `seVendeEnCanal` (esconde el
producto en la caja) y el filtro del carrito al cambiar de canal. Si cambia
una, cambian las tres.

### Los precios de Rappi estaban calculados, no capturados

Lo que había sembrado era el precio de mostrador **más ~19 %**. La lista real
no sigue ningún porcentaje: la Fiesta de 12 sube de $225 a $290 (+29 %) y la
de 24 de $440 a $490 (+11 %). Nueve de dieciocho hojaldras salían a un precio
que el negocio nunca puso.

### El inventario que solo suma se despega de la realidad

El motor original (revisado contra la base del otro negocio, de solo lectura)
tiene 1,631 insumos **sin un solo grupo**, 27,783 movimientos, **cero mermas**
y ninguna forma de decir *"conté y hay ocho sacos"*. Solo se puede sumar lo
que entra y confiar en que las recetas resten bien; después de 27,783
movimientos nadie ha podido preguntar *"¿cuánto debería haber contra cuánto
hay?"*, porque la pregunta no tiene dónde escribirse.

Lo que se agregó aquí y allá no existe: **conteo físico** (se escribe lo
contado, el servidor calcula el ajuste y lo apunta), **cuándo se contó**
(`contado_at` — un número sin fecha no se puede creer, y la fecha se mueve
aunque no haya diferencia), **lista de compra** por mínimos, y **merma con
motivo**. Sin apuntar la merma, lo que se tiró aparece en el siguiente conteo
como un faltante sin explicación, y un faltante que nadie puede explicar es lo
que hace que se deje de creer en el inventario.

**Se cuenta en la presentación, no en gramos**: sacos, cubetas, cartones de 30
huevos. Quien cuenta el almacén cuenta sacos, y un sistema que le pide gramos
es un sistema que nadie va a llenar. `contenido` guarda cuánto trae cada uno,
que es lo que hace falta para costear.

**Primero el renombre, después el alta.** Nueve insumos del sembrado eran los
mismos de la hoja con otro nombre (`Harina de trigo` → `Harina Trigo`). Dar de
alta los de la hoja sin renombrar primero habría dejado **dos harinas**: las
recetas colgadas del ejemplar viejo y el conteo hecho sobre el nuevo. Ojo con
el caso especial: cuando solo cambian las mayúsculas, el viejo y el nuevo son
la misma fila y el candado anti-duplicado impide el renombre — hay que
tratarlo aparte (pasó con `Pasta de guayaba`).

## Las siete funciones de inventario estaban protegidas por una sola capa (20 de septiembre)

| Versión | Qué hace |
|---|---|
| `20260920100000` | `revoke ... from public, anon` en las siete de inventario |

Las siete se habían **otorgado** a `authenticated` y nunca **revocado** de
`PUBLIC`. Un `grant` no quita nada: suma. Postgres le da EXECUTE a `PUBLIC`
por omisión en cada función nueva, así que quedaban ejecutables con la llave
publicable — protegidas solo por el `fn_es_staff()` de adentro.

No lo explotó nadie (el `if` hacía su trabajo), pero **una sola capa no es una
capa, es un punto de falla**: el día que alguien edite la función y se le
olvide el `if`, el GRANT es lo único que queda.

Ojo al buscarlo en `pg_proc.proacl`: PUBLIC aparece como una entrada con el
beneficiario **vacío** (`=X/postgres`), y un `like '%=X%'` también empata con
`authenticated=X`. Lo que sí sirve es `aclexplode(proacl)` y buscar
`grantee = 0`.

## El camino C → P → H → E (20 de septiembre)

El negocio pasó su diagrama: **C**aja → **P**roducción → **H**orno →
**E**mpaque, cada una una pantalla táctil en su mesa. Y una corrección de
fondo: los moldes **no son todos de 48**, hay de 48 y de 24.

| Versión | Qué hace |
|---|---|
| `20260920110000` | `cuadros_por_molde` por renglón (48 o 24), no un parámetro global |
| `20260920111000` | Las etapas: `moldes_armados`, `moldes_en_horno`, y el `check` que las ordena |
| `20260920112000` | `fn_produccion_armar`, `fn_horno_meter`, `fn_horno_sacar` |
| `20260920113000` | `fn_horno_en_vivo`: lo que el horno le contesta a la caja |
| `20260920114000` | `fn_produccion_mandar_a_hacer` recibe el molde de cada renglón |
| `20260920115000` | `'en_horno'` en el `check` de estados (ver abajo) |
| `20260920120000` | `encargos.empacado_at`: Empaque marca lo que ya está listo |

### El tamaño del molde va por renglón

`parametros.cuadros_por_molde` servía cuando todo era de 48. Con dos tamaños,
un solo número para toda la casa obliga a mentir en uno de los dos renglones
de la misma hornada — y un inventario que arranca con una mentira no se
endereza después. Ahora vive en `orden_produccion_items.cuadros_por_molde`
con `check (cuadros_por_molde in (24, 48))`; el parámetro global quedó como el
valor por omisión de quien no dice nada, para que una pantalla vieja siga
mandando a hacer en vez de reventar.

### El inventario sube en H, no en P

Antes producción marcaba «hecho» y eso entraba directo al inventario.
Funcionaba porque producción y horno eran la misma persona. Con el horno en su
propia mesa deja de serlo, y **un molde armado es masa, no es pan**: si se
contara al armarlo, la caja podría vender una hojaldra que sigue cruda.

Las cuatro cuentas viven en el mismo renglón y un solo `check`
(`opi_etapas_coherentes`) impide los estados imposibles: no se arma más de lo
pedido, no sale del horno lo que no entró, y no hay más en el horno que lo
armado menos lo que ya salió.

Va en un `check` de tabla y no repartido en los `if` de las tres funciones a
propósito. Así el viejo `fn_produccion_avanzar` —que saltaba el horno— **choca
contra la regla** en vez de colar pan que nunca se horneó. Comprobado contra
la base: con el renglón sin armar, `fn_produccion_avanzar` falla.

### El escalón que faltaba en el `check` de estados

`20260920115000` va **después** de las funciones a propósito, porque así pasó:
`fn_produccion_refrescar_estado` ya ponía `'en_horno'` y el `check` viejo lo
rechazaba. El error salió al probar la cadena completa contra la base, no
leyendo el código — un `check` no aparece en ningún `select`. Se deja en su
lugar real del historial: el estado final da el destino, no el camino.

### Empacar no cobra

`encargos.empacado_at` es lo que le permite a la mesa de empaque contestar
«¿cuánto falta?» y evitar que dos personas empaquen el mismo encargo. **No
descuenta ni cobra nada**: lo único que mueve inventario y corte sigue siendo
`fn_encargo_cobrar`. Apartar no es vender, y empacar tampoco.

Es una **fecha** y no una bandera por la misma razón que
`inventario_stock.contado_at`: un «sí» no dice cuándo, y un dato sin fecha no
se puede creer.
