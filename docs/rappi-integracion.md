# Rappi: que el pedido llegue solo a la caja

*(19/10/26. Lo que se investigó, lo que Lily ya tiene, y el plan. Nada de
esto está construido todavía: lo primero no depende de código, depende de
Rappi.)*

## La pregunta de la casa

«Cuando llegue un pedido nuevo de Rappi a la tableta, que pase solo a la
caja». Hoy el flujo es a mano: suena la tableta de Rappi, alguien lee el
pedido, y el cajero lo captura en la caja con el interruptor **Rappi** (que
ya cobra la lista de precios de la plataforma). Funciona, pero se captura dos
veces y en la prisa se equivoca.

## Lo que hay en Rappi

Rappi tiene una **API de integración para restaurantes** y un portal de
desarrolladores ([dev-portal.rappi.com](https://dev-portal.rappi.com/)).
Lo que se pudo confirmar por fuentes públicas (el portal mismo no se alcanza
desde este contenedor; se leyó por espejos de terceros, así que **hay que
corroborar en el portal antes de programar**):

| Qué | Cómo |
|---|---|
| Acceso | **No es autoservicio.** Lo aprueba un contacto comercial de Rappi; entregan `client_id` / `client_secret` de desarrollo y, tras una **certificación** de su equipo de integraciones, los de producción |
| Autenticación | OAuth2 *client credentials*: `POST token/login/integrations` → token bearer (se renueva al menos cada semana), que viaja en el header `x-authorization` |
| Base | `/api/v2/restaurants-integrations-public-api/` |
| Pedidos nuevos | Dos caminos: **webhook** `NEW_ORDER` (Rappi llama a una URL nuestra; se crea con `POST /webhook`, que devuelve un `secret` para firmar los avisos, y se ajusta con `…/add-stores` y `…/change-url`) o **sondeo** `GET /orders` / `GET /orders/status/sent` (un tercero menciona un mínimo de **45 s entre llamadas**; confirmarlo) |
| Aceptar / rechazar | **`PUT`** `/orders/{orderId}/take/{cookingTime}` y **`PUT`** `/orders/{orderId}/reject` con un `cancel_type` de lista cerrada (`ITEM_OUT_OF_STOCK`, `ITEM_WRONG_PRICE`, `ORDER_TOTAL_INCORRECT`…) |
| Listo para recoger | **`POST`** `/orders/{orderId}/ready-for-pickup` — avisa al repartidor; **tope de tres llamadas por pedido** |
| Eventos del pedido | `/orders/{orderId}/events` |
| Menú | `/menu` (subir) y `/menu/approved/{storeId}`; **cada menú lo aprueba Rappi** |
| Tiendas | alta asíncrona; el resultado llega por el webhook `STORE_PROVISIONING_STATUS` |
| Calidad | esperan ≥ 98 % de éxito en las llamadas |

Dos datos operativos que vienen de la experiencia de un integrador
(Deliverect) y que **importan más que los endpoints**:

- Un pedido hay que **aceptarlo en 4 min 30 s**; si no, Rappi **desconecta
  la tienda** hasta nuevo aviso.
- Activar una tienda tarda ~1 semana y **no se activan los viernes**.

Fuentes: [portal de Rappi](https://dev-portal.rappi.com/),
[webhooks](https://dev-portal.rappi.com/en/api-reference/webhooks/),
[orders](https://dev-portal.rappi.com/en/api-reference/orders/),
[perfil de API Evangelist](https://github.com/api-evangelist/rappi),
[listado en Jentic](https://jentic.com/apis/rappi.com/rappi),
[Deliverect: Rappi integration overview](https://help.deliverect.com/en/articles/7979380-rappi-integration-overview),
[Deliverect × Rappi](https://www.deliverect.com/en/integrations/rappi),
[Lavu + Hubster en México](https://www.businesswire.com/news/home/20220822005111/es).

## Las tres formas de hacerlo

### A. Integración directa (lo que conviene, si Rappi abre la puerta)

Nosotros programamos contra la API. Sin intermediario, sin renta mensual,
y el pedido cae en **nuestra** base con nuestras reglas (precio de canal,
«X» de lo que no va en Rappi, comandas, corte).

Lo que se le pide a Rappi: al ejecutivo de cuenta de Hojaldras Lily,
«queremos integración directa con la API de restaurantes; necesitamos
credenciales de desarrollo y el proceso de certificación». Es una
conversación comercial, no técnica, y es el **primer paso y el único que no
podemos dar nosotros**.

### B. Un agregador (Deliverect, Hubster/Otter)

Ellos ya están certificados con Rappi (y Uber Eats, DiDi). Se contrata, se
conecta Rappi a su panel, y ellos exponen una API o una tableta única. Más
rápido de arrancar, pero es **una renta mensual** y el pedido pasa por un
tercero. Tiene sentido si la casa va a estar en tres plataformas; para solo
Rappi es pagar de más.

### C. Seguir a mano, pero mejor (lo que hay hoy)

El interruptor **Rappi** de la caja ya cobra la lista de la plataforma y
respeta la «X». Lo que se puede mejorar sin Rappi: nada que quite la doble
captura.

## El plan para A, con lo que Lily ya tiene

Casi todo existe. El canal `rappi` ya es un valor de `canal_orden`,
`precios_canal` guarda la lista de la plataforma y qué no se vende ahí, la
caja ya tiene una pantalla de **pedidos pendientes** (la de «pagar en caja»
del kiosko, `PedidosPendientes.tsx`) que hace exactamente lo que un pedido
de Rappi necesita: aparecer, aceptarse y pasar a comandas.

1. **Edge Function `rappi-pedidos`** con los secretos en Supabase
   (`RAPPI_CLIENT_ID`, `RAPPI_CLIENT_SECRET`, `RAPPI_STORE_ID`), nunca en el
   repo. Recibe el webhook `NEW_ORDER` **y además** sondea `GET /orders`
   cada minuto por cron — el webhook es un timbre, no una fuente, igual que
   con Clip (§2.3): si se pierde uno, el sondeo lo encuentra. Guarda el
   pedido crudo en una tabla `rappi_pedidos` (id de Rappi, payload, estado,
   `orden_id`) con índice único por id: un pedido que llega dos veces es
   uno.
2. **Convertirlo en orden**: una función `fn_rappi_a_orden` que empata cada
   renglón con `productos` (por la clave con la que se subió el menú) y
   llama a `fn_crear_orden` con `canal = 'rappi'` — **el precio lo pone el
   servidor con `fn_precio_linea`**, no el payload de Rappi; si no coinciden,
   se anota, no se inventa. El pago lo recibe Rappi, así que la orden se
   cobra con método `otro` y referencia `RAPPI-<id>`, para que el corte lo
   sume aparte y no pida ese dinero en el cajón.
3. **La caja lo ve**: la pantalla de pendientes se vuelve «Pedidos de
   Rappi» con un reloj de **4:30** que cuenta hacia atrás, y dos botones:
   **Aceptar** (→ `take/{cookingTime}`, y recién ahí se cobra la orden y
   salen las comandas) y **Rechazar** (→ `reject`, con motivo). Que un
   pedido sin aceptar desconecte la tienda es lo que ese reloj evita.
4. **Listo**: cuando Empaque marca el pedido empacado, se llama
   `ready-for-pickup`. Rappi lo limita a **tres llamadas por pedido** y
   considera mal uso la cuarta, así que va **una vez** desde la función que
   marca `empacado_at`, no desde un botón que se pueda tocar de más.
5. **Menú**: `fn_menu_para_rappi` arma el menú desde `productos` +
   `precios_canal` (sin lo marcado con «X») y se sube con `/menu`; se
   vuelve a subir cuando Costeos publica. Rappi lo aprueba a mano.

Lo que NO se hace: aprobar pagos por INSERT, abrir funciones a `anon` (la
Edge Function entra con `service_role`, que se salta los GRANT), ni confiar
en el precio que manda Rappi.

## Qué sigue

*(La hoja de qué pedir, con el mensaje listo para el ejecutivo y la
comparación con Hubster y Deliverect, está en `docs/rappi-que-pedir.md`.)*

1. **La casa** le pide a su ejecutivo de Rappi la integración directa y las
   credenciales de desarrollo. Sin eso no hay paso 2.
2. Con las credenciales, se confirman en el portal los nombres exactos (el
   evento de «listo», el formato del payload de `NEW_ORDER`, cómo se nombran
   los productos en el menú) y se construye lo de arriba: son dos días de
   trabajo con la tienda de pruebas de Rappi.
3. Certificación con su equipo, y a producción.

Mientras tanto, el interruptor **Rappi** de la caja sigue siendo el camino.
