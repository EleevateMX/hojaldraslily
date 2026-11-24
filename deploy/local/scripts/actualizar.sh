#!/usr/bin/env bash
# ACTUALIZAR el programa — el flujo de Nuvora por Tailscale.
#
#   tailscale ssh lily-tienda
#   cd /opt/hojaldraslily && deploy/local/scripts/actualizar.sh
#
# Hace el ciclo completo: baja lo nuevo del repo, recompila las apps contra el
# Supabase local, aplica migraciones nuevas, redespliega funciones y deja todo
# servido. No toca datos (solo estructura, vía migraciones).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
RAIZ="$(cd "$KIT/../.." && pwd)"
RAMA="${RAMA:-main}"

# Carga el .env del servidor (DATABASE_URL, STACK_DIR, SUPABASE_KONG…).
if [ -f "$KIT/.env.servidor" ]; then
	set -a; . "$KIT/.env.servidor"; set +a
fi

cd "$RAIZ"
echo "==> 1/5  Trayendo lo nuevo del repo (origin/$RAMA)…"
git fetch --quiet origin "$RAMA"
git checkout --quiet "$RAMA"
git merge --quiet --ff-only "origin/$RAMA"

echo "==> 2/5  Compilando las apps contra el Supabase local…"
"$AQUI/10-construir-apps.sh"

echo "==> 3/5  Aplicando migraciones nuevas…"
"$AQUI/20-aplicar-migraciones.sh"

echo "==> 4/5  Redesplegando Edge Functions…"
"$AQUI/30-desplegar-funciones.sh"

echo "==> 5/5  Recargando Caddy (toma el web nuevo)…"
( cd "$KIT" && docker compose up -d && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker compose restart caddy )

echo
echo "Actualización completa. Las pantallas toman la versión nueva al recargar"
echo "(el service worker ya maneja eso), y el agente de caja se auto-actualiza."
