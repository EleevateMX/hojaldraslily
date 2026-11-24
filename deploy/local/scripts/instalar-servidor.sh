#!/usr/bin/env bash
# Instalador de UN COMANDO del servidor local (Supabase + apps + Caddy).
#
# Corre en Linux o dentro de WSL2 (Ubuntu) en la PC Windows. Es por fases e
# idempotente: si falta configuración, se detiene con instrucciones claras y se
# vuelve a correr. No borra nada.
#
#   deploy/local/scripts/instalar-servidor.sh
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
cd "$KIT"

command -v docker >/dev/null || { echo "Falta Docker (instala Docker Desktop con WSL2, o Docker en Linux)." >&2; exit 1; }
docker compose version >/dev/null || { echo "Falta 'docker compose'." >&2; exit 1; }
command -v pnpm >/dev/null || { echo "Falta pnpm (corepack enable; npm i -g pnpm)." >&2; exit 1; }

# --- Config del servidor ---
if [ ! -f .env.servidor ]; then
	cp .env.servidor.example .env.servidor && chmod 600 .env.servidor
	echo "Cree .env.servidor. EDITALO (POSTGRES_PASSWORD, JWT_SECRET, DATABASE_URL," >&2
	echo "SUPABASE_PUBLIC_URL con tu nombre del tailnet) y vuelve a correr." >&2
	exit 1
fi
set -a; . ./.env.servidor; set +a
: "${DATABASE_URL:?Define DATABASE_URL en .env.servidor}"

if [ ! -f .env.apps ]; then
	cp .env.apps.example .env.apps
	echo "Cree .env.apps. Pon VITE_SUPABASE_URL (tu https://...ts.net) y la anon key" >&2
	echo "LOCAL, y vuelve a correr." >&2
	exit 1
fi

# --- 1. Stack de Supabase (bundle oficial) ---
echo "== 1/6  Stack de Supabase =="
"$AQUI/00-bootstrap.sh"
if ! grep -q '^ANON_KEY=.\+' "$KIT/supabase-stack/.env" 2>/dev/null; then
	echo "Edita $KIT/supabase-stack/.env (JWT_SECRET propio, ANON_KEY y SERVICE_ROLE_KEY" >&2
	echo "generadas de ese JWT_SECRET, API_EXTERNAL_URL/SITE_URL con tu ts.net), pon la" >&2
	echo "MISMA ANON_KEY en .env.apps, y vuelve a correr." >&2
	exit 1
fi
( cd "$KIT/supabase-stack" && docker compose pull && docker compose up -d )

# --- 2. Esperar a Postgres ---
echo "== 2/6  Esperando a Postgres =="
for i in $(seq 1 30); do
	if psql "$DATABASE_URL" -tAc 'select 1' >/dev/null 2>&1; then break; fi
	sleep 2
	[ "$i" = "30" ] && { echo "Postgres no respondio a tiempo." >&2; exit 1; }
done

# --- 3. Extensiones (la instalacion no las trae solas) ---
echo "== 3/6  Extensiones pg_net + pg_cron =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
	'create extension if not exists pg_net; create extension if not exists pg_cron;' \
	|| echo "   (si fallo, habilitalas segun el stack; ver README)"

# --- 4. Migraciones ---
echo "== 4/6  Migraciones =="
"$AQUI/20-aplicar-migraciones.sh"

# --- 5. Edge Functions ---
echo "== 5/6  Edge Functions =="
STACK_DIR="$KIT/supabase-stack" "$AQUI/30-desplegar-funciones.sh" \
	|| echo "   (revisa el contenedor de funciones; ver README)"

# --- 6. Apps + Caddy ---
echo "== 6/6  Compilando apps y levantando Caddy =="
"$AQUI/10-construir-apps.sh"
( cd "$KIT" && docker compose up -d )

cat <<EOF

Servidor arriba en http://localhost/  (caja en /pos/, Admin en /admin/).
Falta:
  - Traer los datos de configuracion de la nube (pg_dump selectivo). Ver README.
  - Exponerlo por el tailnet:  scripts/40-tailscale-servir.sh
  - Repuntar los agentes de Windows a local (incluido Banorte):
    windows/repuntar-agentes.ps1
EOF
