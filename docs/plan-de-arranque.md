# Plan de arranque — de la prueba a vender

Orden real de las cosas que faltan, con quién hace cada una. Las fases están
ordenadas por dependencia: cada una desbloquea la siguiente. Se puede vender
al terminar la Fase 2 — el resto suma comodidad, no es requisito.

Leyenda: **[Tú]** requiere tus cuentas o el hardware · **[Yo]** lo hago contra
la base o el código.

---

## Fase 0 — Cerrar la prueba de hoy

| # | Qué | Quién |
|---|---|---|
| 0.1 | Cobrar el pedido pendiente en **POS → Pendientes** (PIN `4321`) | Tú |
| 0.2 | Confirmar que el alimento salta a la pantalla de Alimentos y la bebida a la de Bebidas | Tú |
| 0.3 | Avanzar estados en el KDS: Pendiente → Preparando → Listo | Tú |
| 0.4 | Aplicar un descuento en el POS: debe pedir PIN de gerente | Tú |
| 0.5 | Verificar contra la base que bajó inventario y quedó en el corte | Yo |
| 0.6 | Cambiar los PIN temporales en **Admin → Empleados** | Tú |

> El PIN `4321` es temporal y se creó para poder probar el candado de
> descuentos. Cámbialo el primer día.

---

## Fase 1 — Capturar precios (esto es lo que bloquea vender)

Sin precio de venta, el producto **no aparece** en el menú. No es una falla
del sistema: es un dato que falta en costosshake.

Estado al momento de escribir esto:

| Categoría | Vendibles hoy | Falta |
|---|---|---|
| **Shakes** | **0** | precio de venta de los 17 |
| Alimentos | 6 | — |
| Bebidas | 17 | — |
| Snacks | 8 | — |
| Suplementos | 0 | `precioBote` (proteínas "- R") |
| Scoops | 1 | `precioScoop` en la pestaña Proteínas |
| Extras | 0 | precio de venta en **Admin → Extras** |

| # | Qué | Quién |
|---|---|---|
| 1.1 | Capturar precio de venta de los **17 shakes** en costosshake | Tú |
| 1.2 | Capturar `precioScoop` y `precioBote` | Tú |
| 1.3 | Ponerle precio a los extras en Admin → Extras | Tú |
| 1.4 | Renombrar los productos que comparten nombre (dos "Pink Lemonade", dos "Natural") — el sistema colapsa en uno los que se llaman igual | Tú |
| 1.5 | Verificar que todo aparezca correctamente en kiosko y POS | Yo |

**Al terminar esta fase ya se puede vender.** Todo lo demás es mejora.

---

## Fase 2 — Impresoras de comanda

Hoy hay **0 registradas**. Sin ellas el sistema funciona: las comandas se ven
en las pantallas de cocina y los trabajos quedan en cola hasta que exista una
impresora. Verificado: un cobro pasa completo con cero impresoras.

| # | Qué | Quién |
|---|---|---|
| 2.1 | Conseguir y conectar las dos térmicas (USB o red) | Tú |
| 2.2 | Si son USB en Windows: instalarlas y anotar el **nombre exacto** que les pone Windows | Tú |
| 2.3 | Registrar **dos** impresoras en Admin → Impresoras (una por estación) y copiar los **dos tokens** | Tú |
| 2.4 | Instalar el agente en la PC de cocina (`docs/instalacion-agente-impresion.md`) | Tú |
| 2.5 | `npm run diagnose -- --imprimir` — no seguir si algo sale con ✘ | Tú |
| 2.6 | Verificar en la base que el agente autenticó y vació su cola | Yo |

Detalle completo en `docs/dia-de-instalacion.md` §3.

---

## Fase 3 — Dominio propio (`hojaldraslily.com`)

Va **antes** que Google: Google valida los orígenes carácter por carácter, y
configurarlo con las URLs provisionales obliga a rehacerlo después.

| # | Qué | Quién |
|---|---|---|
| 3.1 | Crear los CNAME en el panel del dominio (`docs/despliegue-godaddy.md` §4) | Tú |
| 3.2 | Agregar el dominio personalizado en cada proyecto de Cloudflare Pages | Tú |
| 3.3 | Esperar a que marque **Active** y sirva por HTTPS (minutos a ~1 h) | — |
| 3.4 | Confirmar que `rewards.hojaldraslily.com` abre la app | Tú |

Subdominio sugerido para lealtad: **`rewards.hojaldraslily.com`**, dejando la
raíz libre para la página del negocio.

---

## Fase 4 — Login con Google (lealtad)

**No hay nada que comprar.** Los proveedores sociales están incluidos en
Supabase hasta en el plan gratuito, y esta organización ya está en **Pro**.
Lo único que falta son las credenciales de Google Cloud, que también son
gratis. Guía completa: `docs/configurar-google-auth.md`.

| # | Qué | Quién |
|---|---|---|
| 4.1 | Google Cloud → pantalla de consentimiento OAuth → **publicar la app** | Tú |
| 4.2 | Crear credencial de **Aplicación web**; origen autorizado `https://rewards.hojaldraslily.com`; URI de redirección `https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/callback` | Tú |
| 4.3 | Pegar Client ID y Secret en Supabase → Authentication → Providers → Google | Tú |
| 4.4 | Agregar `https://rewards.hojaldraslily.com` en Authentication → URL Configuration → Redirect URLs | Tú |
| 4.5 | Probar el login con una cuenta cualquiera | Tú |
| 4.6 | Verificar contra la base que quedó ligado a su ficha y que acumula | Yo |

> La app de Rewards **solo** tiene entrada por Google. Hasta que esto esté
> encendido, no anuncies el sitio: el cliente puede abrirlo pero no entrar.
> En caja la lealtad funciona igual (teléfono o QR).

---

## Fase 5 — Cobro automático en el kiosko (Clip)

Lo último, y el único con una limitación de hardware que conviene tener clara:
el **Clip Stand 2 no expone un API local**, así que el kiosko no puede
empujarle el monto. La ruta documentada para ese equipo es la **API de
Checkout** (el cliente paga con su celular vía QR/liga). Empujar el monto a
una terminal física requeriría un **Clip Pin Pad**.

| # | Qué | Quién |
|---|---|---|
| 5.1 | Pasarme la documentación de Clip: crear cobro, consultar estado, y **webhooks** (firma) | Tú |
| 5.2 | Crear credenciales de **Pruebas** en el panel de Clip | Tú |
| 5.3 | Guardarlas en Supabase → Edge Functions → Secrets como `CLIP_API_KEY` y `CLIP_WEBHOOK_SECRET` | Tú |
| 5.4 | Implementar las llamadas reales y la validación de firma | Yo |
| 5.5 | Desplegar las 5 Edge Functions | Yo |
| 5.6 | Registrar `https://fzkdgqqvfkogmxdgqsxj.supabase.co/functions/v1/clip-webhook` en el panel de Clip | Tú |
| 5.7 | Probar aprobado / rechazado / cancelado con credenciales de prueba | Los dos |
| 5.8 | Cambiar los secrets a las credenciales productivas y el kiosko a modo `clip` | Yo |

La autenticación (`Basic base64(api_key:clave_secreta)`) ya está implementada
y verificada contra el ejemplo publicado por Clip.

---

## Mientras tanto, ya funciona

Sin Google, sin Clip y sin impresoras el sistema **ya vende**: el kiosko arma
el pedido, caja lo cobra (efectivo, tarjeta o Clip manual con la referencia
del voucher), las comandas salen en las pantallas de cocina, baja el
inventario, se acumulan mancuernas y se canjean cupones identificando al
cliente por teléfono o QR.

Lo único que realmente falta para vender es la **Fase 1**.
