# Guía de despliegue — Hojaldras Lily POS

Objetivo: que la sucursal opere sola. Cada "pantalla" es solo un navegador
abierto en una URL; todas hablan con el **mismo Supabase** en tiempo real, así
que no hay servidor propio que mantener. Cuando tengas el dominio, apuntas los
subdominios y listo.

## 1. Mapa de pantallas / dispositivos

| Dónde | App | Subdominio sugerido | Modo |
|---|---|---|---|
| PC touch del cliente (mostrador) | `kiosko` | `kiosko.tudominio.com` | Chrome en **modo kiosco** |
| Caja / cajero | `pos` | `caja.tudominio.com` | navegador normal (o touch) |
| Pantalla cocina — Alimentos | `cocina-alimentos` | `cocina.tudominio.com` | pantalla, autoarranque |
| Pantalla barra — Bebidas/Shakes | `cocina-bebidas` | `barra.tudominio.com` | pantalla, autoarranque |
| Pantalla que ve el cliente (folios) | `cliente-display` | `pantalla.tudominio.com` | pantalla, autoarranque |
| Gerencia (menú, ventas, inventario) | `admin` | `admin.tudominio.com` | cualquier navegador |
| Celular del cliente (Rewards) | `cliente-pwa` | `rewards.tudominio.com` | PWA instalable |
| Tablero de costos | `costos` | `costos.tudominio.com` | uso interno |

Todas comparten las MISMAS variables: `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` (la anon key es pública por diseño; el `service_role`
NUNCA va aquí).

**Tiempo real ya resuelto**: cuando la caja/kiosko cobra, la orden aparece
sola en la pantalla de cocina o barra (según el producto) y en el display —
sin recargar. Eso ya está habilitado en la base (Supabase Realtime).

## 2. Hosting recomendado

Las 8 apps son **sitios estáticos** (Vite → HTML/JS/CSS). No necesitan
servidor. Opciones:

- **Cloudflare Pages** — *recomendado para el negocio*: gratis, permite uso
  comercial, CDN global, HTTPS automático, se conecta a GitHub. Sin el límite
  de "solo uso personal" que tiene el plan gratis de Vercel.
- **Vercel** — el más simple de configurar (detecta Vite solo). Su plan
  gratis (Hobby) es **solo para proyectos no comerciales**; para producción
  comercial usa Vercel Pro (~USD 20/mes). Ideal para pruebas/staging.
- **Netlify** — equivalente; plan gratis con uso comercial permitido.

Cualquiera sirve: son el mismo patrón (repo GitHub → build → CDN). Abajo va
Vercel (rápido de probar) y Cloudflare Pages (para producción).

## 3. Paso previo: subir a GitHub

El código ya vive en el repo `EleevateMX/ventashake`, rama
`claude/hojaldraslily-pos-ecosystem-z9imgr`. Para desplegar:

1. Abre un Pull Request de esa rama hacia `main` y mézclalo (o pídemelo y lo
   abro). Los hosts despliegan desde `main` por convención.
2. Cada push a `main` re-despliega automáticamente todas las apps.

## 4. Deploy en Vercel (una vez por app)

Se crea **un proyecto de Vercel por app**, todos apuntando al mismo repo. Por
ser monorepo pnpm, la config confiable es:

| Ajuste | Valor (ejemplo para POS) |
|---|---|
| Framework Preset | Vite |
| Root Directory | `.` (raíz del repo) |
| Install Command | `pnpm install` |
| Build Command | `pnpm --filter @shake/pos build` |
| Output Directory | `apps/pos/dist` |
| Environment Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Repite cambiando `pos` por `kiosko`, `admin`, `cocina-alimentos`,
`cocina-bebidas`, `cliente-display`, `cliente-pwa`, `costos`. (Las apps no usan
enrutado de cliente, así que no hace falta `vercel.json` ni reglas de rewrite.)

Luego, en cada proyecto → **Domains** → agrega su subdominio.

### 4.1 Vercel paso a paso (desde GitHub)

1. Entra a **vercel.com** → **Log In** → *Continue with GitHub* (autoriza a
   Vercel a ver `EleevateMX/ventashake`).
2. Dashboard → **Add New… → Project** → busca `ventashake` → **Import**.
3. En *Configure Project* (una app, ej. kiosko):
   - **Project Name:** `shake-kiosko`
   - **Framework Preset:** Vite
   - **Root Directory:** `.` (raíz — no lo cambies)
   - Expande **Build and Output Settings** y activa *Override*:
     - **Build Command:** `pnpm --filter @shake/kiosko build`
     - **Output Directory:** `apps/kiosko/dist`
     - **Install Command:** `pnpm install`
   - **Environment Variables** (agrega las dos):
     - `VITE_SUPABASE_URL` = `https://fzkdgqqvfkogmxdgqsxj.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = *(anon key pública del proyecto Supabase —
       Dashboard → Settings → API → anon public)*
   - **Deploy**.
4. Repite **Add New Project** con el MISMO repo por cada app, cambiando solo
   el `--filter @shake/<app>` del Build Command y el `apps/<app>/dist` del
   Output (pos, admin, cocina-alimentos, cocina-bebidas, cliente-display,
   cliente-pwa, costos).
5. Cada proyecto → **Settings → Domains** → agrega su subdominio
   (`kiosko.hojaldraslily.com`, …) → Vercel te da el CNAME → póngalo en GoDaddy
   (ver `docs/despliegue-godaddy.md`).

**⚠️ Rama de producción:** Vercel despliega desde la rama **de producción**
del repo (por defecto `main`). El código está hoy en la rama
`claude/hojaldraslily-pos-ecosystem-z9imgr`. Dos opciones:
- **Recomendado:** fusionar esa rama a `main` (PR) y desplegar desde `main`.
- O en cada proyecto → **Settings → Git → Production Branch** → poner
  `claude/hojaldraslily-pos-ecosystem-z9imgr` y *Redeploy*.

**Nota comercial:** el plan gratis de Vercel (Hobby) es para uso **no
comercial**. Para un negocio en producción usa **Vercel Pro** (~USD 20/mes) o
**Cloudflare Pages** (gratis y permite uso comercial; mismos pasos, §5).

## 5. Deploy en Cloudflare Pages (producción)

Un proyecto de Pages por app (Connect to Git → repo):

| Ajuste | Valor (ejemplo kiosko) |
|---|---|
| Build command | `pnpm install && pnpm --filter @shake/kiosko build` |
| Build output directory | `apps/kiosko/dist` |
| Variables de entorno | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Node version | 20 (variable `NODE_VERSION=20`) |

Custom domains desde el panel de Pages.

> **¿Tu dominio está en GoDaddy?** Sigue la guía específica paso a paso:
> **`docs/despliegue-godaddy.md`** (CNAMEs por subdominio sin tocar tu correo
> ni tu sitio actual).

## 6. Configuración de dominio (DNS)

En tu proveedor de DNS, un CNAME por subdominio hacia el host (Vercel/CF te
da el destino):

```
kiosko    CNAME  <target-del-host>
caja      CNAME  <target-del-host>
cocina    CNAME  <target-del-host>
barra     CNAME  <target-del-host>
pantalla  CNAME  <target-del-host>
admin     CNAME  <target-del-host>
rewards   CNAME  <target-del-host>
```

Tras conectar el dominio, agrega las URLs de `kiosko` y `rewards` (las que usan
sesión/Clip/Google) a **Supabase → Authentication → URL Configuration →
Redirect URLs** para que el login con Google de la PWA funcione en producción.

## 7. Las pantallas en la sucursal (modo kiosco)

Cada pantalla es una PC/mini-PC (o Raspberry Pi) con Chrome apuntando a su URL.
Para que arranque sola y a pantalla completa:

**Windows** — crea un acceso directo con:
```
chrome.exe --kiosk --app=https://kiosko.tudominio.com --incognito
```
- Ponlo en la carpeta *Inicio* (`shell:startup`) para que abra al encender.
- Energía → "Nunca suspender" y desactiva el protector de pantalla.

**Linux / mini-PC** (autoarranque):
```
chromium --kiosk --app=https://cocina.tudominio.com --noerrdialogs --disable-translate
```

- **PC touch del cliente** → `kiosko` (autoservicio; cobra con Clip).
- **Pantalla cocina** → `cocina` ; **barra de licuados** → `barra`.
- **Pantalla de folios** → `pantalla`.
- Una sola PC puede manejar varias pantallas con varios monitores y una
  ventana Chrome por monitor.

## 8. Cobro con Clip (recordatorio operativo)

El kiosko/caja cobra en **modo manual con el Clip Stand 2**: se cobra en la
terminal y se confirma en la app con la referencia del voucher (ver
`integracion-clip.md`). No requiere que las apps corran dentro del Stand.

## 9. Autonomía y red (importante)

- Todo depende de **internet** (las apps hablan con Supabase). Recomendado:
  conexión estable **+ respaldo 4G** (un router con failover). Si se cae la
  red, no hay ventas mientras dure la caída.
- No hay modo offline por ahora. Si se vuelve crítico, es una fase aparte
  (cache local + cola de sincronización).
- Realtime y cobros se reconectan solos al volver la red.

## 10. Checklist de puesta en marcha

- [ ] PR de la rama a `main` y merge
- [ ] Crear proyectos (uno por app) en el host elegido con la config de arriba
- [ ] Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en cada proyecto
- [ ] Conectar subdominios + DNS
- [ ] Habilitar Google en Supabase Auth + Redirect URLs (para la PWA)
- [ ] Configurar cada PC/pantalla en modo kiosco con su URL y autoarranque
- [ ] Cargar precios faltantes y stock inicial (ver `pendientes.md`)
- [ ] Prueba de fuego: una venta real en kiosko → cocina/barra la ven →
      corte de caja cuadra
