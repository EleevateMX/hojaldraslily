# Publicar en `.mx` — guía de ejecución

Qué tocar, en qué orden, y qué comprobar antes de pasar al siguiente paso.
Los valores de aquí están **verificados en vivo el 21/08/2026** contra 1.1.1.1
y 8.8.8.8 — no copiados de un panel.

El dominio está en **GoDaddy** (nameservers `ns43`/`ns44.domaincontrol.com`) y
las apps en **Cloudflare Pages**.

---

## La regla que ordena todo

**Primero los subdominios, después la raíz.**

Los subdominios se conectan con CNAMEs sueltos en GoDaddy: propagan en
minutos, no tocan el correo y **se deshacen borrando un renglón**. La raíz
exige mover los nameservers, y eso sí es irreversible en la práctica y se
lleva por delante el correo si algo se recrea mal.

Así que la tienda queda funcionando en `.mx` el mismo día, y el paso
delicado se hace después, con calma y sin prisa de nadie.

---

## Paso 1 — Los 8 subdominios (hoy, ~30 min)

Para **cada** app, dos movimientos.

### 1.a En Cloudflare

**Workers & Pages** → abre el proyecto → pestaña **Custom domains** →
**Set up a custom domain** → escribe el subdominio completo → **Continue**.

Cloudflare te muestra un CNAME. **No cierres esa pantalla**: el valor va al
paso siguiente.

### 1.b En GoDaddy

**Mis productos → DNS** de `hojaldraslily.com` → **Agregar registro**:

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre | solo el subdominio (`kiosko`, no el dominio completo) |
| Valor | lo que te dio Cloudflare (termina en `.pages.dev`) |
| TTL | 1 hora |

### La lista

| # | Subdominio | Proyecto en Pages | Prioridad |
|---|---|---|---|
| 1 | `kiosko` | `shake-kiosko` | **la caja — primero** |
| 2 | `admin` | `shake-admin` | **gerencia — segundo** |
| 3 | `barra` | `shake-cocina-bebidas` | alta |
| 4 | `cocina` | `shake-cocina-alimentos` | alta |
| 5 | `rewards` | `shake-cliente-pwa` | media (lo ve el cliente) |
| 6 | `pantalla` | `shake-cliente-display` | baja |
| 7 | `caja` | `shake-pos` | baja (hoy no se usa) |
| 8 | `costos` | `shake-costeo` | baja |

Los ocho estaban **libres** al 21/08: ninguno apunta a nada, así que no
pisas nada al crearlos.

### Comprobar antes de seguir

Abre `https://kiosko.hojaldraslily.com`. Si carga el menú, ese subdominio quedó.
Repite con los demás. Si uno tarda, dale 15 minutos antes de preocuparte.

---

## Paso 2 — Lo que hay que actualizar DESPUÉS (si no, se rompe el login)

Esto es lo que casi siempre se olvida. Con los subdominios vivos pero sin
esto, **entrar con Google al programa de lealtad falla**.

### 2.a Supabase → Authentication → URL Configuration

- **Site URL**: `https://rewards.hojaldraslily.com`
- **Redirect URLs**: agrega (sin quitar las de `.pages.dev` todavía —
  quítalas cuando ya no las use nadie):

```
https://rewards.hojaldraslily.com/**
https://kiosko.hojaldraslily.com/**
https://hojaldraslily.com/**
```

### 2.b Google Cloud → APIs y servicios → Credenciales → tu ID de OAuth

- **Orígenes autorizados de JavaScript**:
  `https://rewards.hojaldraslily.com` y `https://kiosko.hojaldraslily.com`
- **URI de redirección autorizados**: los que ya tengas, más los `.mx`

### 2.c Variables en Cloudflare Pages

En cada proyecto, **Settings → Environment variables**, para producción:

| Variable | Valor |
|---|---|
| `VITE_URL_REWARDS` | `https://rewards.hojaldraslily.com` |

Después de cambiarla hay que **volver a desplegar** (Deployments → el último →
*Retry deployment*): las variables `VITE_` se hornean al compilar, no se leen
en vivo.

> Si se te olvida, no pasa nada grave: el código reescribe el dominio viejo
> a `.mx` por su cuenta (`apps/web/src/App.tsx`, `QrRewards.tsx`,
> `Recibo.tsx`). Es una red, no una excusa para no ponerla.

---

## Paso 3 — La página pública y la raíz (después, con calma)

La raíz `hojaldraslily.com` **no se puede apuntar con un CNAME** — es una
limitación del DNS, no de GoDaddy. Hay que mover los nameservers a
Cloudflare.

### 3.a Crear el proyecto de la página

`apps/web` ya está lista: hero con Milo, botón "Únete a Rewards", el QR del
programa y el menú **en vivo desde la misma base que usa la caja** — lo que
se captura en costeo aparece ahí solo, sin publicar nada a mano.

En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** →
repositorio `EleevateMX/ventashake`:

| Campo | Valor |
|---|---|
| Nombre del proyecto | `shake-web` |
| Build command | `pnpm install && pnpm --filter @shake/web build` |
| Build output directory | `apps/web/dist` |
| Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_URL_REWARDS` |

Compruébalo en `shake-web.pages.dev` **antes** de tocar nameservers.

### 3.b Mover los nameservers

1. En Cloudflare: **Add a site** → `hojaldraslily.com` → plan Free.
2. Cloudflare importa los registros. **Acepta, y después compara uno por uno
   contra la tabla de `docs/dominio-hojaldraslily-mx.md` §0.** El importador se
   salta `SRV` con frecuencia, y ahí viven Teams y el correo.
3. Solo cuando la lista esté completa: GoDaddy → **Nameservers** → *Custom* →
   los dos que te dio Cloudflare.
4. Tarda **de 1 a 24 horas**. Hazlo un lunes por la mañana, nunca un viernes
   ni el día que abres.

### 3.c Conectar la raíz

En `shake-web` → **Custom domains** → agrega **dos**: `hojaldraslily.com` y
`www.hojaldraslily.com`.

---

## La comprobación que no se salta nadie

Después de mover los nameservers, **antes de irte a dormir**:

1. **Correo**: manda un mail *a* una dirección `@hojaldraslily.com` y otro
   *desde* ella. Si los dos llegan, el correo sobrevivió. Si no, vuelve a
   poner los nameservers de GoDaddy y revisa la tabla.
2. **La tienda**: abre `kiosko.hojaldraslily.com` y levanta un pedido de prueba.
   Si la base responde, `api.hojaldraslily.com` sobrevivió.
3. **El login del cliente**: entra a `rewards.hojaldraslily.com` con Google.

Los tres tocan cosas distintas: correo, base de datos y autenticación. Si los
tres pasan, la migración quedó.

---

## Lo que NO hay que tocar

- **El código.** Ya apunta a `.mx` en todos lados.
- **`api.hojaldraslily.com`.** Ya está activo desde el 17/08 y es por donde
  hablan todas las pantallas con la base. Al migrar nameservers hay que
  **recrear su CNAME y su `_acme-challenge`** — están en la tabla del §0.
  Perderlo no degrada nada: apaga la tienda.
