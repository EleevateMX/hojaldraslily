# Rappi: qué pedir para que el pedido llegue solo a la caja

Hoja práctica. El análisis —qué hay en Rappi, las tres formas de hacerlo y el
plan con lo que Lily ya tiene— está en `docs/rappi-integracion.md`. Esto es
solo **qué hacer, a quién pedírselo y qué contestar cuando pregunten**.

*(19/10/26. El portal de desarrolladores de Rappi no se alcanza desde este
contenedor; se leyó a través de un espejo externo. Lo que se cita del portal
es textual; lo que se cita de terceros está marcado.)*

---

## El punto de partida: Hojaldras Lily YA está en Rappi

La tienda **ya vende en Rappi** con su tableta y su lista de precios de
plataforma (la que la caja cobra con el interruptor **Rappi**). Eso cambia la
pregunta: no es «cómo me doy de alta», es **«cómo conecto mi sistema a la
cuenta que ya tengo»**.

Y hay una cosa que decide todo, y no la decidimos nosotros:

> **«Since integrating with our API requires direct contact with our team… To
> know the steps to sign up as a Rappi ally, contact your main Rappi point of
> contact.»** — portal de desarrolladores de Rappi, *Getting Started*

O sea: **no hay botón**. Las credenciales las entrega una persona de Rappi
después de aprobar la solicitud. El primer paso es un mensaje al ejecutivo de
cuenta, y es el único paso que no podemos dar nosotros.

---

## 1. Lo que Rappi tiene que entregar

Del portal, lo que uno recibe cuando la solicitud se aprueba:

- [ ] **`client_id`** y **`client_secret`** del **ambiente de desarrollo**
      (`api.dev.rappi.com`). Son las llaves de la integración; con ellas se
      genera un token que vive **una semana** y viaja en el header
      `x-authorization`.
- [ ] El **`store_id`** de la sucursal Miguel Alemán en Rappi (el que usan
      los webhooks y el menú).
- [ ] El **dominio de producción para México** (el portal lo llama *Country
      Domain*; la lista está en el portal y hay que leerla con sesión).
- [ ] Las credenciales de **producción**, que llegan **después** de que su
      equipo revise la integración.
- [ ] El **nombre del contacto técnico** de Rappi para la revisión: quién
      contesta cuando el ambiente de pruebas no hace lo que dice el portal.

Y lo que ya tenemos de nuestro lado, para que no lo pidan dos veces:

- [x] La cuenta de Rappi Partners y la tienda activa
- [x] La lista de precios de Rappi, con lo que **no** va en la plataforma
- [x] Un sistema con canal `rappi`, pantalla de pedidos pendientes y comandas
- [x] Una **URL pública con HTTPS** para recibir el webhook (una Edge Function
      de Supabase; se crea en diez minutos cuando haga falta)

---

## 2. El mensaje para el ejecutivo de Rappi

Se puede copiar tal cual, por WhatsApp o correo:

> Buen día. Somos **Hojaldras Lily**, sucursal Miguel Alemán, Mérida. Ya
> vendemos con ustedes y queremos **conectar nuestro punto de venta a Rappi
> por la API de integraciones para restaurantes** (la del portal
> dev-portal.rappi.com), para que cada pedido nuevo entre solo a nuestra caja
> y se acepte desde ahí, sin capturarlo dos veces. Necesito que me ayuden con
> lo siguiente:
>
> 1. **¿Cuál es el proceso para darnos de alta como aliado con integración
>    directa?** El portal dice que se pide por el contacto comercial. ¿Es
>    contigo, o nos pasas con el equipo de integraciones?
> 2. ¿Nos pueden entregar el **`client_id` y `client_secret` del ambiente de
>    desarrollo**, y el **`store_id`** de nuestra tienda?
> 3. ¿Qué **revisión o certificación** hacen antes de darnos las credenciales
>    de producción, y cuánto suele tardar?
> 4. ¿Tiene algún **costo** la integración directa, mensual o por pedido?
> 5. Para recibir los pedidos, ¿recomiendan el **webhook `NEW_ORDER`** o el
>    **sondeo de `GET /orders`**? ¿Cada cuánto se puede consultar sin que nos
>    bloqueen?
> 6. ¿**Cuánto tiempo** tenemos para aceptar un pedido antes de que se
>    cancele o se desconecte la tienda?
> 7. El **menú**: ¿se sube por la API (`/menu`) con nuestras claves de
>    producto, o se sigue administrando desde el portal de Partners? Si va por
>    API, ¿quién lo aprueba y cuánto tarda cada cambio?
> 8. Los **precios** que manda el pedido, ¿vienen en pesos o en centavos? Y el
>    **`total_order`**, ¿es lo que nos depositan a nosotros?
> 9. En los pedidos **pagados en efectivo** al repartidor, ¿qué nos llega a
>    nosotros y qué cobra Rappi?
> 10. ¿Hay **tienda de pruebas** en el ambiente de desarrollo para generar
>     pedidos falsos y practicar el flujo completo: aceptar, rechazar, listo
>     para recoger?
>
> Nuestro sistema está hecho en Node/TypeScript sobre Supabase y puede recibir
> webhooks con HTTPS. Si hace falta, podemos tener una llamada con su equipo
> técnico.

Las preguntas **1**, **6** y **7** son las que deciden:

- La **1** decide si hay proyecto. Si Rappi no abre integración directa a una
  tienda de nuestro tamaño (a veces la reservan para cadenas o para
  integradores certificados), el camino es un agregador (§4).
- La **6** decide cómo se diseña la pantalla de la caja. Un integrador dice
  que son **4 min 30 s** y que después Rappi **desconecta la tienda** —eso lo
  dice Deliverect de su experiencia, no el portal—; si es así, el reloj en la
  pantalla de pendientes no es un adorno.
- La **7** decide cuánto trabajo es. Si el menú va por API, hay que armarlo
  desde `productos` + `precios_canal` y mantenerlo; si se queda en el portal,
  solo hay que **empatar las claves** (`sku`) de cada producto con las de
  Rappi, una vez.

---

## 3. Lo que ya se sabe del portal (para no preguntarlo)

Leído del portal el 19/10/26. Es lo que hay que programar contra, y conviene
tenerlo a la mano en la llamada con su equipo técnico:

| Qué | Cómo |
|---|---|
| Token | `POST https://{dominio}/restaurants/auth/v1/token/login/integrations` con `{client_id, client_secret}` → `access_token`, válido **1 semana**, en el header `x-authorization: Bearer …` |
| Base | `https://{dominio}/api/v2/restaurants-integrations-public-api/` |
| Pedidos nuevos | `GET /orders` (todos los nuevos) o `GET /orders/status/sent`; o el **webhook `NEW_ORDER`**, que se registra con `POST /webhook` y devuelve un **`secret`** para firmar cada aviso |
| Aceptar | **`PUT`** `/orders/{id}/take/{minutos}` — el tiempo de preparación se puede dejar vacío para usar el del pedido |
| Rechazar | **`PUT`** `/orders/{id}/reject` con `cancel_type` ∈ `ITEM_WRONG_PRICE`, `ITEM_NOT_FOUND`, `ITEM_OUT_OF_STOCK`, `ORDER_MISSING_INFORMATION`, `ORDER_MISSING_ADDRESS_INFORMATION`, `ORDER_TOTAL_INCORRECT` |
| Listo | **`POST`** `/orders/{id}/ready-for-pickup` — avisa al repartidor; **máximo tres llamadas por pedido**, la cuarta se considera mal uso |
| Qué pasó después | `GET /orders/{id}/events` (`taken_visible_order`, `canceled_with_charge`…) |
| Lo que trae el pedido | `order_detail.items[].sku` es **nuestra clave**, no la de Rappi; `price` viene **entero**; `cooking_time` con mínimo y máximo; `payment_method` (`cc`, `cash`, `rappi_pay`…); `totals.total_order` es «lo que recibe el restaurante»; `totals.total_to_pay` es lo que el cliente paga en **efectivo al repartidor**; `place_at` solo en pedidos programados |
| Tienda | `store.external_id` es nuestro identificador de la sucursal |

Dos cosas que **sí** cambian el plan anterior, y están corregidas en
`docs/rappi-integracion.md`:

- **Aceptar y rechazar son `PUT`**, no `POST`. Y rechazar lleva un motivo de
  una lista cerrada: no se rechaza «porque sí», se dice qué producto no hay.
- **El evento de «listo» ya tiene nombre**: `ready-for-pickup`. Es lo que
  Empaque dispararía al marcar el pedido empacado. Con tope de tres: el botón
  no puede estar donde alguien lo toque cinco veces.

Y una que hay que confirmar con la pregunta 8: el `price` del ejemplo del
portal es `28900` para un producto; o son centavos o es otro país. **No se
programa el cobro hasta saberlo** — el precio lo pone nuestro servidor de
todos modos, pero la comparación contra lo que manda Rappi es lo que detecta
un menú desactualizado.

---

## 4. Si Rappi no abre la puerta: Hubster o Deliverect

Son **agregadores**: ya están certificados con Rappi, Uber Eats y DiDi Food;
se contrata con ellos, se conecta la cuenta de Rappi a su panel, y ellos
ponen **una sola tableta** (o una API) para todas las plataformas.

| | Hubster | Deliverect |
|---|---|---|
| Qué es | Gestor de delivery, nacido en México (2018), con alianza con CANIRAC. Su *Order Manager* junta Rappi, Uber Eats, DiDi y pedidos por WhatsApp/redes en una tableta, imprime por estación y marca agotados | Plataforma belga con oficina en México; integración «bidireccional» con Rappi: pedidos **y** menús desde el punto de venta |
| Integración con un POS propio | **No encontré API pública.** Lo que anuncian son integraciones con POS comerciales (Lavu, Poster). Hay que preguntarles si exponen webhook o API para un sistema propio | Sí tienen API para POS, pero **la integración Rappi–Deliverect exige suscripción a los dos**, y cada menú lo aprueba Rappi a mano (~1 semana por tienda, no activan viernes) |
| Precio | **No lo publican.** Ofrecen demo gratuita | **No lo publican** para México |
| Para quién tiene sentido | Una tienda que esté en **dos o tres plataformas** y quiera una sola tableta **hoy**, sin programar nada | Cadenas con varias sucursales y menú que cambia seguido |

**Lo honesto**: para una sola tienda en una sola plataforma, un agregador es
pagar una renta mensual por quitar la tableta de Rappi y poner la suya. Si
además no exponen API, el pedido **sigue sin llegar a nuestra caja**: solo
cambia de tableta. Antes de pagarles hay que hacerles **la misma pregunta
que a Rappi**: «¿tienen webhook o API para que el pedido entre a mi sistema?»

El mensaje para Hubster, si se quiere cotizar en paralelo:

> Buen día. Tenemos una panadería en Mérida que vende en Rappi y un punto de
> venta propio (hecho a la medida, en la nube). Queremos que los pedidos de
> Rappi entren solos a nuestra caja. ¿Su Order Manager tiene **API o webhook
> para mandar los pedidos a un sistema propio**, o solo trabaja con la
> tableta y con POS comerciales? ¿Cuál es el **costo mensual** para una sola
> sucursal y una sola plataforma, y hay **periodo de prueba**?

---

## 5. Los pasos, en orden, y quién hace cada uno

| # | Paso | Quién |
|---|---|---|
| 1 | Mandar el mensaje del §2 al ejecutivo de Rappi (y el del §4 a Hubster, si se quiere comparar) | **El negocio**, hoy mismo |
| 2 | Traer las respuestas **por escrito**, sobre todo la 1, la 6 y la 7 | **El negocio** |
| 3 | Recibir `client_id`, `client_secret`, `store_id` y el dominio de pruebas | Rappi → negocio |
| 4 | Guardarlos como **secretos en Supabase** (`RAPPI_CLIENT_ID`, `RAPPI_CLIENT_SECRET`, `RAPPI_STORE_ID`), nunca en el repo ni en el chat | Nosotros |
| 5 | Construir contra la tienda de pruebas: Edge Function, tabla `rappi_pedidos`, la pantalla de pendientes con reloj, aceptar/rechazar/listo | Nosotros, ~2 días |
| 6 | Empatar las claves de producto con las del menú de Rappi (una vez) | Los dos |
| 7 | Revisión con el equipo de Rappi y credenciales de producción | Rappi |
| 8 | Un pedido real chico de prueba, mirando que caiga en el corte como `otro` y no pida efectivo en el cajón | Los dos |

**Lo que de verdad frena es el paso 3.** Mientras no lleguen las credenciales
de pruebas no hay nada que programar que sirva.

---

## 6. Recomendación

1. **Pedirle a Rappi la integración directa primero.** No cuesta nada
   preguntar, es la única opción sin renta mensual, y el pedido cae en
   **nuestra** base con nuestras reglas (precio de canal, la «X», comandas,
   corte). Casi todo lo que hace falta ya existe en el sistema.
2. **Cotizar Hubster en paralelo**, con la pregunta de la API por delante. Si
   Rappi tarda meses o dice que no, y Hubster sí tiene webhook, es el plan B;
   si no tiene, es solo otra tableta y no resuelve lo que la casa pidió.
3. **Deliverect solo si la tienda va a estar en tres plataformas.** Para una,
   es pagar dos suscripciones por lo que la 1 da gratis.

Mientras tanto, el interruptor **Rappi** de la caja sigue siendo el camino: el
cajero lee la tableta y captura con la lista de precios de la plataforma.

---

## Fuentes

- Portal de desarrolladores de Rappi: [Getting Started](https://dev-portal.rappi.com/en/api-reference/),
  [Authentication Process](https://dev-portal.rappi.com/en/authentication-process/),
  [Orders](https://dev-portal.rappi.com/en/api-reference/orders/),
  [Webhooks](https://dev-portal.rappi.com/en/api-reference/webhooks/)
- Rappi Partners México: [requisitos para dar de alta un restaurante](https://merchants.rappi.com/es-mx/requisitos)
- Terceros: [guía de alta en Rappi (PoloTab, 2026)](https://www.polotab.com/blog/registra-tu-restaurante-en-rappi-guia-paso-a-paso-mexico-2025),
  [Deliverect: Rappi integration overview](https://help.deliverect.com/en/articles/7979380-rappi-integration-overview),
  [Deliverect × Rappi](https://www.deliverect.com/en/integrations/rappi),
  [Hubster en México (Tekios, 2022)](https://tekiosmag.com/2022/08/23/hubster-la-plataforma-de-gestion-de-delivery-quiere-llegar-a-65-mil-restaurantes-en-a-latina/),
  [CANIRAC × Hubster](https://www.culinariamexicana.com.mx/canirac-crea-alianza-con-hubster-para-impulsar-tecnologia-en-delivery/),
  [Lavu + Hubster](https://www.lavu.com.mx/blog/lavu-ofrece-integracion-con-plataformas-de-delivery/),
  [Hubster + Poster POS](https://joinposter.com/en/applications/hubster)
