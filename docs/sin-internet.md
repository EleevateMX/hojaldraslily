# Vender sin internet

La caja de Lily vive en la nube. Sin internet no hay `fn_crear_orden`, no hay
`fn_cobrar_orden` y no hay venta — pero el mostrador sí sigue: el pan está en
la vitrina, el cliente está enfrente y el cajón de efectivo abre igual. Lo
único que de verdad necesita internet es el **registro**.

Esto existe por una noche concreta en la tienda hermana: el internet se fue de
las 21:07 a las 22:00, en plena cena. El sistema daba errores sueltos, nadie
supo que se podía cobrar igual, y **no entró ni una venta en 53 minutos**.

> **Lo que más resuelve no es esto: es un segundo internet.** Un módem 4G con
> failover, que entre solo cuando se cae el principal, deja todo funcionando
> —Clip incluido— sin tocar el sistema. Esto de aquí es para cuando también
> falla ese.

---

## Qué hace la tienda

| Pasa esto | Qué hacer |
|---|---|
| Arriba sale **«Sin internet desde las HH:MM»** | Seguir vendiendo. Se cobra en **efectivo** o en la **terminal del banco** (primero se cobra allá y luego se toca el botón aquí). Clip no funciona sin internet |
| Al cobrar, el folio es **S-01, S-02…** | Es el folio provisional. Es el que se le dice al cliente y el que sale en el ticket |
| Vuelve el internet | Nada. Las ventas se registran solas; arriba sale en dorado «Registrando N ventas…» hasta que termina |
| Se quiere **cerrar la caja** y hay ventas sin registrar | El POS no deja cerrarla todavía, y dice cuántas faltan. Si se cerrara antes, ese efectivo no entraría en el corte |
| Sale **«N ventas sin registrar»** con internet | El servidor las rechazó. Avisarle a gerencia: casi siempre es un corte que se cerró a medias |
| Alguien recargó la página sin internet | Abre igual, con el último menú que alcanzó a cargar |
| Viene alguien por un **encargo** | Ese sí espera: el anticipo vive en el servidor y hay que descontarlo de ahí. Lo demás se puede cobrar aparte |

Sin internet **no** funcionan: Clip, los encargos, Rappi, los pedidos del
kiosko, el panel de producción, Admin a distancia ni la térmica de tickets
(el ticket sale por el navegador, a la impresora predeterminada).

---

## Cómo está armado

```
 caja (navegador) ──► guarda la venta en ESTE navegador (localStorage)
        │
        ├──► window.print()  ──► ticket con folio provisional S-01
        │
        └──► al volver el internet: fn_venta_sin_internet (una por una)
```

- **Detectar** (`apps/pos/src/lib/conexion.ts`): `navigator.onLine` no sirve
  —la PC tenía red, lo que no había era salida—, así que se le pregunta al
  servidor (`/auth/v1/health`) cada 15 s. Dos fallos seguidos = sin internet;
  uno bueno = de vuelta.
- **Seguir mostrando el menú** (`src/lib/respaldo.ts`): el catálogo, los
  precios de canal, el almacén, la caja y el corte guardan su última
  respuesta buena. Sin internet se usa esa, y si una consulta tarda más de
  8 s también — una conexión que agoniza deja la caja mirando un
  «Cargando…» con gente formada.
- **Recargar sin internet**: el service worker de `@lily/pwa` ya pide primero
  la red y solo sirve el casco guardado si no contesta. No guarda nada de
  Supabase, a propósito.
- **La venta** (`src/store/sinInternet.ts`): se escribe en localStorage
  **antes** de imprimir y antes de cambiar de pantalla. El id lo pone el
  navegador; el servidor es idempotente con él.
- **El registro** (`fn_venta_sin_internet`,
  `supabase/migrations/20261019100000_venta_sin_internet.sql`): envuelve a
  `fn_crear_orden` y `fn_cobrar_orden` **sin tocarlas**, en una sola
  transacción. Cobra al precio del servidor; si el de la pantalla no
  coincidía, la diferencia queda en `ventas_sin_internet` con
  `estado = 'revisar'` y se ve en **Admin → Diagnóstico**.

---

## Lo que hay que saber antes de tocarlo

- **La hora real no es cosmética.** `ordenes.created_at` y el pago se mueven a
  la hora en que de verdad se vendió, porque `fn_existencias_por_molde` y
  `fn_catalogo_del_dia` deciden el día con
  `(o.created_at at time zone 'America/Merida')::date`. Una venta de las 9 de
  la noche del sábado registrada el domingo a las 7 se descontaría del pan del
  **domingo** — pan que no existía cuando esa hojaldra salió de la vitrina.
  Los cinco triggers de la orden solo actúan en la transición a pagado, así
  que mover la hora después no los repite (están leídos, uno por uno).
- **Un corte de internet justo a media venta no se puede saber si alcanzó a
  registrarse**, y por eso el POS **no reintenta solo** en ese caso: dice que
  se busque el folio en el corte antes de volver a cobrar. Guardarla otra vez
  la cobraría dos veces. El único caso en que sí cae solo a vender sin
  internet es cuando la falla ocurrió **antes** de tocar el servidor.
- **Cerrar la caja está bloqueado** mientras queden ventas sin registrar
  (`CorteCaja`), con la lista a la vista.
- **El pago mixto sí funciona** sin internet. El efectivo es dinero contado y
  entra al corte tal cual; lo que se ajusta contra el total del servidor es la
  parte de la terminal.
- **Las funciones no se abrieron a `anon`.** El POS sostiene su sesión (entra
  con PIN), así que `fn_venta_sin_internet` es solo para `authenticated`. Es
  la diferencia con el otro sistema, donde el kiosko cobra sin sesión.

Probado contra producción dentro de una transacción que se deshace: cobra
mixto con la hora de hace 42 minutos, mueve la hora de la orden y del pago,
deja **un** pago aprobado con sus dos partes en `pago_partes`, el corte espera
el efectivo contado y no el total, el reintento del mismo id no crea otra
orden ni otro pago, un total de pantalla equivocado se cobra al del servidor y
queda marcado para revisar, la comanda vieja se suprime y la reciente no, y un
cobro con Clip rebota. Las pantallas se revisaron mirándolas, con los cuatro
estados juntos (`apps/pos/mirar/sin-internet.html`).
