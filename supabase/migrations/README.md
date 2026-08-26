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
