# Conectar `hojaldraslily.com` — paquete completo

Todo lo necesario para pasar de los `*.pages.dev` provisionales al dominio
propio: qué subdominio va a qué app, cómo se agrega, y —lo que casi siempre se
olvida— **qué hay que actualizar después** para que nada se rompa.

El dominio está en **GoDaddy** y las apps en **Cloudflare Pages**.

---

## 0. Antes de tocar nada: el DNS que YA existe

⚠️ **En este dominio vive el correo del negocio (Microsoft 365).** Mover los
nameservers a Cloudflare (opción B) **borra de hecho todos los registros** que
hoy sirve GoDaddy: los que no recrees en Cloudflare dejan de existir. Si se
pierden los de correo, dejas de recibir mails — y eso se nota tarde, cuando ya
rebotó algo importante.

Inventario **completo: 22 registros**, leído del panel de GoDaddy el
21/08/2026 y confirmado en vivo contra 1.1.1.1 y 8.8.8.8.

> Una advertencia sobre cómo se arma esta tabla: consultar el DNS solo
> encuentra los nombres que uno ya sabe preguntar. La versión anterior se hizo
> así y se le escaparon cuatro registros —entre ellos el DKIM del correo—
> porque nadie sabía que existían. **La lista buena es la del panel**, no la
> que devuelve una consulta.

| Tipo | Nombre | Valor | Para qué |
|---|---|---|---|
| MX | `@` | `hojaldraslily-mx.mail.protection.outlook.com` (prio 0) | **Correo entrante M365** |
| TXT | `@` | `NETORGFT20557962.onmicrosoft.com` | Verificación del dominio en M365 |
| TXT | `@` | `v=spf1 include:spf.em.secureserver.net include:secureserver.net -all` | SPF — sin esto el correo saliente cae en spam |
| TXT | `@` | `google-site-verification=fKhJh1Sebi85rZJl0eEY16PJJTqmH2po6WReBPd_mrQ` | Verificación de Google |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | DMARC |
| CNAME | `sable.cloud._domainkey` | `dkim.cloud.em.secureserver.net` | **DKIM — firma el correo saliente** |
| CNAME | `bounces.cloud.em` | `cbounces.cloud.em.secureserver.net` | Rebotes del correo de marketing |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | Outlook configura solo las cuentas |
| CNAME | `msoid` | `clientconfig.microsoftonline-p.net` | Inicio de sesión de Microsoft |
| CNAME | `lyncdiscover` | `webdir.online.lync.com` | Teams |
| CNAME | `sip` | `sipdir.online.lync.com` | Teams |
| SRV | `_sipfederationtls._tcp` | `100 1 5061 sipfed.online.lync.com` | Teams |
| SRV | `_sip._tls` | `100 1 443 sipdir.online.lync.com` | Teams |
| CNAME | `email` | `email.secureserver.net` | Webmail de GoDaddy |
| CNAME | `_domainconnect` | `_domainconnect.gd.domaincontrol.com` | Conexión automática de GoDaddy |
| CNAME | `api` | `fzkdgqqvfkogmxdgqsxj.supabase.co` | **La base de datos. Si esto se cae, la tienda no vende.** |
| TXT | `_acme-challenge.api` | `epLiJMLG9QefENAesmF_AdkH7s9SuWhUdSV3Uz8odZw` | Certificado de `api` |

Los siete de correo (MX, SPF, DKIM, DMARC, verificación M365, `autodiscover`,
`msoid`) van juntos: **si falta el DKIM, el correo sale pero llega a spam**, y
eso tarda semanas en notarse porque nadie te avisa que tus mensajes se están
perdiendo.

Nameservers actuales (21/08): `ns43.domaincontrol.com` y
`ns44.domaincontrol.com` — GoDaddy, opción A.

Subdominios de las apps: los ocho estaban **libres** al 21/08.

Los registros que **no** hay que recrear son los `A` de la raíz y de `www`
(`13.248.243.5`, `76.223.105.230`): son el reenvío/parking de GoDaddy y los
reemplaza la página web (§5).

> Cloudflare ofrece importar los registros al agregar el dominio. Acepta, pero
> **revisa la lista contra esta tabla** antes de dar el último paso: el
> importador se salta registros con cierta frecuencia, sobre todo los `SRV`.

Después del cambio, manda un correo de prueba a una dirección del dominio y
otro desde ella. Si los dos llegan, el correo sobrevivió.

---

## 1. Decisión previa: ¿nameservers en GoDaddy o en Cloudflare?

Hay dos caminos y conviene elegir antes de empezar, porque cambiar después
implica rehacer registros.

### Opción A — Dejar el DNS en GoDaddy (CNAME por subdominio)

- Cada subdominio se agrega **dos veces**: una en Cloudflare Pages y otra como
  CNAME en GoDaddy. Son 8 subdominios → 16 pasos.
- No hay tiempo de espera grande: cada CNAME propaga en minutos.
- La raíz `hojaldraslily.com` **no se puede apuntar con CNAME** (limitación del
  DNS); necesita el reenvío de GoDaddy o mover los nameservers.

### Opción B — Mover los nameservers a Cloudflare *(recomendado)*

- Se hace **una sola vez**: GoDaddy → Nameservers → *Custom* → los dos que te
  dé Cloudflare.
- A partir de ahí, cada dominio que agregues en Pages **crea su propio
  registro solo**. Ya no vuelves a entrar a GoDaddy.
- La raíz sí se puede apuntar (Cloudflare hace CNAME flattening).
- **Tarda de 1 a 24 horas en propagar.** Hazlo con calma, nunca el día que
  abres la tienda.

Con 8 subdominios por conectar, la B ahorra bastante trabajo.

---

## 2. Mapa de subdominios

> **`api.hojaldraslily.com` — YA ACTIVO (2026-08-17).** Es el Custom Domain de
> Supabase (add-on sobre plan Pro), configurado con CNAME `api` →
> `fzkdgqqvfkogmxdgqsxj.supabase.co` + TXT `_acme-challenge.api` directamente
> en GoDaddy — no depende de la migración de nameservers. Todas las apps web
> lo usan vía la traducción en `packages/supabase/src/client.ts`
> (`DOMINIO_PROPIO`); la URL original sigue viva en paralelo y es la que usa
> el agente de impresión. Es lo que hace que la pantalla de Google diga
> "continuar a api.hojaldraslily.com". Si el add-on se cancela, vaciar ese mapa.

| Subdominio | Proyecto en Cloudflare Pages | Quién lo usa |
|---|---|---|
| `kiosko` | `shake-kiosko` | Pantalla del cliente / cajero |
| `caja` | `shake-pos` | Cajero (PC o iPad) |
| `cocina` | `shake-cocina-alimentos` | Pantalla de cocina |
| `barra` | `shake-cocina-bebidas` | Pantalla de barra |
| `pantalla` | `shake-cliente-display` | TV de folios para el cliente |
| `admin` | `shake-admin` | Gerencia |
| `rewards` | `shake-cliente-pwa` | Celular del cliente (lealtad) |
| `costos` | `shake-costeo` | Costeo e inventario, uso interno |
| **raíz** `hojaldraslily.com` y `www` | `shake-web` | Cualquiera que teclee el dominio |

> La raíz ya tiene a dónde apuntar: `apps/web` es la página pública del
> negocio (menú en vivo, QR de Rewards). Se conecta igual que las demás,
> pero con **dos** dominios personalizados: `hojaldraslily.com` y
> `www.hojaldraslily.com`. Ver §5.

---

## 3. El procedimiento, por subdominio

### 3.1 En Cloudflare Pages

1. **Workers & Pages** → abre el proyecto (ej. `shake-kiosko`).
2. Pestaña **Custom domains** → **Set up a custom domain**.
3. Escribe el subdominio completo: `kiosko.hojaldraslily.com` → **Continue**.
4. - Con **nameservers en Cloudflare**: crea el registro solo. Terminaste.
   - Con **DNS en GoDaddy**: te muestra el CNAME. Cópialo y sigue a 3.2.

### 3.2 En GoDaddy *(solo en la opción A)*

**Mis productos → DNS** de `hojaldraslily.com` → **Agregar registro**:

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre | `kiosko` (solo el subdominio, sin el dominio) |
| Valor | Lo que te dio Cloudflare (ej. `shake-kiosko.pages.dev`) |
| TTL | 1 hora |

### 3.3 Esperar y verificar

En Cloudflare el dominio pasa a **Active** y emite el certificado HTTPS solo.
Cuando `https://kiosko.hojaldraslily.com` abra con candado, ese quedó.

Repetir para los ocho.

---

## 4. Lo que hay que actualizar DESPUÉS

Esta es la parte que se olvida y provoca fallas raras días después.

### 4.1 Google (si ya configuraste el login de lealtad)

Google valida los orígenes carácter por carácter. **Agregar** —sin borrar los
viejos hasta comprobar que todo jala—:

**Google Cloud → Credenciales → tu ID de cliente → Orígenes autorizados:**
```
https://rewards.hojaldraslily.com
https://kiosko.hojaldraslily.com
```

La URI de redirección **no cambia**: sigue apuntando a Supabase.

### 4.2 Supabase

**Authentication → URL Configuration → Redirect URLs**, agregar:
```
https://rewards.hojaldraslily.com
https://kiosko.hojaldraslily.com/auth/callback
```

### 4.3 Variable del kiosko

El QR de Rewards apunta a donde diga `VITE_URL_REWARDS`. En Cloudflare Pages,
proyecto `shake-kiosko` → **Settings → Environment variables**:

```
VITE_URL_REWARDS = https://rewards.hojaldraslily.com
```

**Requiere volver a desplegar** para que el build la tome (Deployments →
*Retry deployment*). Sin esto el QR sigue mandando al `.pages.dev` viejo —
funciona, pero se ve poco profesional impreso en un letrero.

### 4.4 El lanzador de las pantallas

`scripts/pantallas.ps1` y los bloques de PowerShell traen las URLs
`.pages.dev`. Cámbialas por las nuevas en la NUC de la sucursal.

### 4.5 El iPad

Borra el icono de la pantalla de inicio y vuelve a agregarlo desde
`https://caja.hojaldraslily.com`, o seguirá abriendo el dominio viejo.

---

## 5. La raíz del dominio — la página web

`apps/web` es el sitio público: portada, sección de lealtad con el QR de
Rewards, y el menú **leído en vivo de la misma base que usa la caja**. Nadie
tiene que publicar el menú a mano: lo que se captura en costeo aparece ahí
solo, con su foto, su descripción y su precio.

**Crear el proyecto en Cloudflare Pages** (una sola vez):

| Campo | Valor |
|---|---|
| Nombre del proyecto | `shake-web` |
| Repositorio | `EleevateMX/ventashake`, rama `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @shake/web build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(la raíz del repo, se deja vacío)* |

**Variables de entorno** (Settings → Environment variables, en *Production*):

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://fzkdgqqvfkogmxdgqsxj.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la llave `anon` del proyecto |
| `VITE_URL_REWARDS` | `https://rewards.hojaldraslily.com` (o el `.pages.dev` mientras no exista el dominio) |

> `VITE_URL_REWARDS` es a dónde manda el QR de la portada. Si se deja el
> `.pages.dev` y luego se conecta el dominio, hay que cambiarla y volver a
> desplegar — el QR se genera con esa URL adentro.

**Dominios personalizados**: en *Custom domains* agrega los dos,
`hojaldraslily.com` y `www.hojaldraslily.com`. Con los nameservers ya en
Cloudflare (opción B), Cloudflare crea los registros solo — la raíz funciona
por *CNAME flattening*, que es justo lo que GoDaddy no permitía.

---

## 6. Orden recomendado

1. Decidir A o B (§1). Si es B, mover nameservers **hoy** y esperar.
2. Conectar primero **`rewards`** — es el único que el cliente ve y el que
   necesita Google.
3. Configurar Google y Supabase con el dominio ya vivo
   (`docs/rewards-paso-a-paso.md`).
4. Conectar los otros siete cuando quieras: son internos y no urgen.
5. Actualizar el lanzador de la NUC y el icono del iPad.
