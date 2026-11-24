# Kit de despliegue local — Hojaldras Lily

Corre todo el sistema en un **servidor local en la tienda**, con **Tailscale**
como canal de Nuvora para actualizar y para que la dueña entre a Admin desde su
teléfono. El *porqué* y los tradeoffs están en **`docs/instalacion-local.md`**;
esto es el *cómo*, con los archivos para ejecutarlo.

> Lo que se puede validar desde el repo está probado (compilado de apps, sintaxis
> de los scripts y del compose). Lo que necesita el stack completo de Supabase
> (migraciones, Edge Functions, Realtime, pg_cron) se confirma en un **piloto**
> de 1–2 días en un mini-PC de prueba — está marcado abajo.

## Topología (una sola, para que el teléfono funcione sin líos)

Todos los aparatos —las PC de la tienda y el teléfono de la dueña— van en el
**tailnet** y usan **un solo origen HTTPS**:
`https://lily-tienda.TU-TAILNET.ts.net`. Tailscale pone el certificado real, así
el service worker/PWA funciona en todos lados y **Admin abre igual desde el
teléfono, desde cualquier parte**, pero solo para quien está en el tailnet.

```
Tailscale Serve (HTTPS, cert real del tailnet)
        │
        ▼
   Caddy (:80)  ──/pos/ /admin/ …──►  apps estáticas (deploy/local/web)
        │
        └──/auth /rest /realtime /storage /functions──►  Supabase self-hosted (Kong :8000)
```

## Piezas

| Archivo | Qué es |
|---|---|
| `compose.yml` | El servidor web (Caddy). |
| `Caddyfile` | Sirve las apps por ruta y hace de puente a la API de Supabase. |
| `.env.apps.example` | Variables con las que se **compilan** las apps (URL + anon key locales). |
| `.env.servidor.example` | Variables del servidor (Postgres, JWT, secretos externos). |
| `scripts/00-bootstrap.sh` | Baja el bundle oficial de Supabase self-hosted (fijado). |
| `scripts/10-construir-apps.sh` | Compila las 9 apps contra el Supabase local → `web/`. |
| `scripts/20-aplicar-migraciones.sh` | Aplica las 237 migraciones. |
| `scripts/30-desplegar-funciones.sh` | Pone las Edge Functions en el stack. |
| `scripts/40-tailscale-servir.sh` | Expone el servidor por HTTPS en el tailnet. |
| `scripts/actualizar.sh` | **El flujo de Nuvora**: actualizar todo por Tailscale. |
| `scripts/instalar-servidor.sh` | Instalador de un comando del servidor (Linux/WSL). |
| `scripts/respaldo.sh` / `restaurar.sh` | Respaldo diario con rotación / restauración. |
| `windows/instalar-local.bat` | **Instalador para una sola PC Windows** (doble clic). |
| `windows/preparar-windows.ps1` | WSL2 + Docker + Tailscale + servidor, en Windows. |
| `windows/repuntar-agentes.ps1` | Apunta los agentes (impresión, caja, Banorte) a local. |

## Instalar en UNA sola PC Windows (lo elegido para Hojaldras Lily)

Todo en el mismo equipo: Supabase por Docker Desktop/WSL2, las apps, Tailscale, y
los agentes nativos (incluido Banorte).

1. **Doble clic a `windows\instalar-local.bat`** (pide admin una vez). Asegura
   WSL2 + Ubuntu, Docker Desktop, Tailscale y Git; clona el repo; corre el
   instalador del servidor dentro de WSL; y une el equipo al tailnet
   exponiéndolo por HTTPS. Puede pedir **reiniciar** (por WSL/Docker) y
   volver a correrlo — es idempotente.
   - La primera vez se detiene para que edites `supabase-stack/.env` (tu
     `JWT_SECRET`, `ANON_KEY`/`SERVICE_ROLE_KEY`, la URL del tailnet) y
     `.env.apps` (la misma URL `ts.net` y la anon key local). Luego se vuelve
     a correr y termina solo.
2. **Cobro con tarjeta (Banorte):** corre `windows\repuntar-agentes.ps1` y pega
   la anon key local. Apunta impresión, caja y **Banorte** al Supabase local
   (`http://localhost:8000`, directo a Kong — no pasan por Tailscale). El token
   de la terminal se da de alta en **Admin local → Impresoras / Terminal**.
   El cobro queda local: caja → cola → agente DLL → pinpad; solo la
   autorización del banco en la pinpad usa internet.
3. **Admin desde el teléfono:** instala Tailscale en el celular, únelo al
   tailnet, y abre `https://<equipo>.<tailnet>.ts.net/admin/`.

> Lo que sigue sin automatizar (pide una PC de verdad para probarse): el primer
> arranque de Docker Desktop con integración WSL, los reinicios de WSL, y traer
> los **datos de configuración** de la nube (pg_dump selectivo: catálogo,
> empleados, impresoras, parámetros con el logo).

## Instalar paso a paso (Linux / depuración)

```bash
# En el mini-PC (Linux, Docker). El repo va en /opt/hojaldraslily.
cd /opt/hojaldraslily/deploy/local
cp .env.apps.example .env.apps
cp .env.servidor.example .env.servidor && chmod 600 .env.servidor

# 1) Stack de Supabase (bundle oficial)
scripts/00-bootstrap.sh
#    edita supabase-stack/.env  (POSTGRES_PASSWORD, JWT_SECRET propio, ANON_KEY,
#    SERVICE_ROLE_KEY, API_EXTERNAL_URL/SITE_URL con tu nombre del tailnet)
( cd supabase-stack && docker compose pull && docker compose up -d )

# 2) Extensiones que la instalación no trae sola (CLAUDE.md §4)
#    psql "$DATABASE_URL" -c 'create extension if not exists pg_net;'
#    psql "$DATABASE_URL" -c 'create extension if not exists pg_cron;'

# 3) Migraciones (las 237)
export DATABASE_URL='postgres://postgres:LA-PASS@localhost:5432/postgres'
scripts/20-aplicar-migraciones.sh

# 4) Datos de configuración (desde un pg_dump de la nube: catálogo, empleados,
#    impresoras, parámetros con el logo). Ver docs/instalacion-local.md §6/§10.

# 5) Edge Functions (+ sus secretos en supabase-stack/.env)
STACK_DIR="$PWD/supabase-stack" scripts/30-desplegar-funciones.sh

# 6) Pon la URL y la anon key LOCALES en .env.apps, y compila las apps
scripts/10-construir-apps.sh

# 7) Levanta el web y exponlo por el tailnet
docker compose up -d
scripts/40-tailscale-servir.sh
```

Después: la caja abre en `…ts.net/pos/`, Admin en `…ts.net/admin/`, y la dueña
lo instala en su teléfono (Chrome → «Instalar app») estando en el tailnet.

## Actualizar (Nuvora, en remoto)

```bash
tailscale ssh lily-tienda
cd /opt/hojaldraslily && deploy/local/scripts/actualizar.sh
```

Baja lo nuevo de `main`, recompila las apps, aplica migraciones nuevas,
redespliega funciones y recarga Caddy. Las pantallas toman la versión al
recargar; el agente de caja se auto-actualiza.

## Respaldos (programar en cron)

```cron
15 3 * * *  /opt/hojaldraslily/deploy/local/scripts/respaldo.sh >> /var/log/lily-respaldo.log 2>&1
```

Y prueba `restaurar.sh` en una base de ensayo de vez en cuando: un respaldo que
nunca se restauró no es un respaldo.

## Lo que el piloto tiene que confirmar

- Edge Functions (staff-login, interredes-*, contadigital-*) corriendo en el
  stack auto-hospedado.
- Realtime y el login por PIN (Auth) igual que en la nube.
- pg_net + pg_cron habilitados y el cron corriendo.
- Una venta de punta a punta (crear, cobrar, comanda, ticket, corte).
- El ciclo de `actualizar.sh` completo por Tailscale.

## Lo que NO se mueve (sigue con internet)

Facturación (ContaDigital) y cobro con tarjeta (Banorte) son servicios de
terceros: necesitan internet. El núcleo del POS (vender, inventario, cortes,
impresión) funciona en la LAN aunque se caiga internet (modo sin-internet,
`docs/sin-internet.md`).
