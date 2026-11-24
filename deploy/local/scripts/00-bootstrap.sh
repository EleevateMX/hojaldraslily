#!/usr/bin/env bash
# Prepara el stack de Supabase self-hosted (bundle OFICIAL, fijado a una
# versión). No reinventamos el compose de Supabase: se baja el suyo y nosotros
# ponemos encima la capa web (Caddy) y los scripts.
#
# Deja el stack en $STACK_DIR (por omisión deploy/local/supabase-stack). Luego:
#   1) edita $STACK_DIR/.env  (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
#      SERVICE_ROLE_KEY, SITE_URL, API_EXTERNAL_URL…)  — ver README
#   2) ( cd $STACK_DIR && docker compose up -d )
#   3) habilita extensiones:  pg_net y pg_cron
#   4) scripts/20-aplicar-migraciones.sh
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
STACK_DIR="${STACK_DIR:-$KIT/supabase-stack}"
# Fija la versión del bundle oficial (un tag o commit del repo supabase/supabase).
SUPABASE_REF="${SUPABASE_REF:-v1.24.09}"

command -v docker >/dev/null || { echo "Falta Docker." >&2; exit 1; }
docker compose version >/dev/null || { echo "Falta 'docker compose'." >&2; exit 1; }

if [ -d "$STACK_DIR/docker" ]; then
	echo "Ya existe $STACK_DIR (no lo toco)."
else
	echo "==> Bajando el bundle oficial de Supabase ($SUPABASE_REF)…"
	tmp="$(mktemp -d)"
	git clone --depth 1 --branch "$SUPABASE_REF" --filter=blob:none --sparse \
		https://github.com/supabase/supabase "$tmp/supabase"
	( cd "$tmp/supabase" && git sparse-checkout set docker )
	mkdir -p "$STACK_DIR"
	cp -r "$tmp/supabase/docker/." "$STACK_DIR/"
	rm -rf "$tmp"
	[ -f "$STACK_DIR/.env" ] || cp "$STACK_DIR/.env.example" "$STACK_DIR/.env"
	echo "    Stack en: $STACK_DIR"
fi

cat <<EOF

Siguiente:
  1) Edita $STACK_DIR/.env  (ver README: POSTGRES_PASSWORD, JWT_SECRET propio,
     ANON_KEY y SERVICE_ROLE_KEY generadas de ese JWT_SECRET, API_EXTERNAL_URL
     y SITE_URL con tu nombre del tailnet).
  2) ( cd "$STACK_DIR" && docker compose pull && docker compose up -d )
  3) Habilita pg_net y pg_cron en la base (ver README).
  4) STACK_DIR="$STACK_DIR" DATABASE_URL=… $AQUI/20-aplicar-migraciones.sh
EOF
