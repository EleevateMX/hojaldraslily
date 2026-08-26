# Rewards: del QR a la tarjeta de lealtad — paso a paso

Objetivo: el cliente escanea un QR, Google le pregunta *"Hojaldras Lily quiere
acceder a tu cuenta"*, acepta, y queda con su tarjeta de lealtad abierta en el
celular.

Son cuatro bloques, en este orden. El orden importa: hacerlo al revés obliga a
rehacer la configuración de Google.

| # | Bloque | Quién | Tiempo |
|---|---|---|---|
| 1 | Dominio en GoDaddy → Cloudflare | Tú | 15 min + espera |
| 2 | Credenciales en Google Cloud | Tú | 15 min |
| 3 | Encender Google en Supabase | Tú | 5 min |
| 4 | Probar | Los dos | 5 min |

> **Nada de esto cuesta.** Los proveedores sociales están incluidos en
> Supabase hasta en el plan gratuito, y las credenciales de Google Cloud son
> gratis. El dominio ya lo pagas.

---

## 1. El dominio: `rewards.hojaldraslily.com`

Se usa un subdominio y no la raíz, para dejar `hojaldraslily.com` libre para la
página del negocio.

### 1.1 En Cloudflare Pages

1. Entra al proyecto **shake-cliente-pwa**.
2. **Custom domains → Set up a custom domain**.
3. Escribe `rewards.hojaldraslily.com` y continúa.
4. Cloudflare te muestra el registro CNAME que hay que crear. **Déjalo
   abierto**: el valor exacto que te dé es el que va en GoDaddy.

### 1.2 En GoDaddy

1. **Mis productos → DNS** del dominio `hojaldraslily.com`.
2. **Agregar registro**:

   | Campo | Valor |
   |---|---|
   | Tipo | `CNAME` |
   | Nombre | `rewards` |
   | Valor | `shake-cliente-pwa.pages.dev` (o el que te dio Cloudflare) |
   | TTL | 1 hora |

3. Guardar.

### 1.3 Esperar

De minutos a ~1 hora. Cuando en Cloudflare el dominio pase a **Active** y
`https://rewards.hojaldraslily.com` abra la app con candado de seguridad, sigue.

**No avances antes.** Google valida las URLs contra el sitio real.

---

## 2. Credenciales en Google Cloud

Aquí es donde se configura el texto que ve el cliente al entrar.

### 2.1 Proyecto

1. <https://console.cloud.google.com/> con la cuenta de Google del negocio.
2. Arriba a la izquierda, crear proyecto → nombre **Hojaldras Lily**.

### 2.2 Pantalla de consentimiento — lo que ve el cliente

**APIs y servicios → Pantalla de consentimiento de OAuth**

| Campo | Qué poner | Dónde se ve |
|---|---|---|
| Tipo de usuario | **Externo** | — |
| Nombre de la aplicación | **Hojaldras Lily** | **Es el texto que lee el cliente**: "Hojaldras Lily quiere acceder a tu cuenta de Google" |
| Logotipo | El logo de Hojaldras Lily | Junto al nombre, en la misma pantalla |
| Correo de asistencia | El del negocio | Debajo del nombre |
| Dominio de la aplicación | `hojaldraslily.com` | En los enlaces de la pantalla |

**Alcances (scopes):** deja solo los básicos — `email`, `profile`, `openid`.
Con eso basta para identificar al cliente, y **no disparan verificación de
Google**. Si agregas alcances sensibles, Google te pide un proceso de
verificación que tarda semanas.

**Publicar la aplicación.** Botón *Publicar aplicación* al final. Si la dejas
en modo *Prueba*, solo podrán entrar los correos que agregues a mano y el
resto verá "Acceso bloqueado".

### 2.3 El ID de cliente

**APIs y servicios → Credenciales → Crear credenciales → ID de cliente de
OAuth**

- Tipo de aplicación: **Aplicación web**
- Nombre: `Hojaldras Lily Web`

**Orígenes de JavaScript autorizados** (el dominio, sin ruta ni barra final):

```
https://rewards.hojaldraslily.com
https://shake-cliente-pwa.pages.dev
https://shake-kiosko.pages.dev
```

**URI de redirección autorizados** — **solo esta**, copiada tal cual:

```
https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/callback
```

> Es la causa número uno de fallas. No pongas aquí las URLs de tus apps: quien
> recibe la respuesta de Google es Supabase, y Supabase después regresa al
> cliente a tu app. Sin barra al final, con `https`.

Al guardar, Google muestra el **ID de cliente** y el **Secreto**. Cópialos.

---

## 3. Encender Google en Supabase

1. <https://supabase.com/dashboard> → proyecto **Hojaldras Lily**.
2. **Authentication → Sign In / Providers → Google**: activar y pegar el
   **Client ID** y el **Client Secret**. Guardar.
3. **Authentication → URL Configuration → Redirect URLs**, agregar:

   ```
   https://rewards.hojaldraslily.com
   https://shake-cliente-pwa.pages.dev
   https://shake-kiosko.pages.dev/auth/callback
   ```

   Sin esto Google autentica bien pero el cliente se queda en una pantalla en
   blanco de Supabase en vez de volver a la app.

No hay que desplegar nada después: las apps consultan el estado del proveedor
cada vez que cargan, así que el botón se activa solo.

---

## 4. Probar

1. **El QR**: en el kiosko, botón *Únete a Rewards* (o después de una compra).
   Escanéalo con la cámara del celular.
2. Abre `rewards.hojaldraslily.com`. Toca **Continuar con Google**.
3. Debe aparecer **"Hojaldras Lily quiere acceder a tu cuenta"** con tu logo.
4. Acepta → regresas a la app con tu tarjeta: mancuernas, progreso al
   siguiente cupón, y tu código `SHK-XXXXXX` en QR.

Comprobación rápida sin abrir nada, dice si el proveedor quedó encendido:

```bash
curl -s https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/settings \
  -H "apikey: <ANON_KEY>" | grep -o '"google":[a-z]*'
```

Debe responder `"google":true`.

---

## Qué pasa del lado del sistema (ya está hecho)

- Al entrar con Google, el cliente **queda ligado a su ficha de lealtad** y sus
  compras acumulan solas.
- Si ya lo habían dado de alta en caja **con ese mismo correo**, se reclama esa
  ficha: conserva sus mancuernas y cupones en vez de empezar de cero. Probado
  con una ficha de 80 mancuernas — las conservó íntegras.
- Un cliente no puede ver ni tocar la ficha de otro.
- Una cuenta de Google = una sola ficha (índice único).

Detalle técnico y pruebas en `docs/flujo-lealtad.md`.

---

## Si algo falla

| Mensaje | Causa | Arreglo |
|---|---|---|
| `Unsupported provider: provider is not enabled` | El interruptor sigue apagado en Supabase | §3.2 |
| `redirect_uri_mismatch` | La URI de redirección no coincide carácter por carácter | §2.3 — sin barra final, con `https` |
| Entra pero queda en pantalla blanca de Supabase | Falta la URL en **Redirect URLs** | §3.3 |
| `Acceso bloqueado: no completó la verificación` | La pantalla de consentimiento quedó en *Prueba* | §2.2 — publicar |
| El QR abre pero el botón dice "no disponible" | Google todavía apagado | §3 completo |
| El dominio no abre | DNS sin propagar, o el CNAME quedó mal | §1.3 — esperar y revisar el valor |
