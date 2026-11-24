#!/usr/bin/env bash
# Respaldo diario de la base, con rotación. En local esto es de Nuvora.
#
# Deja un .sql.gz comprimido en RESPALDOS (un disco DISTINTO al de la base) y
# conserva 7 diarios + 4 semanales. Prográmalo en cron:
#   15 3 * * *  /opt/hojaldraslily/deploy/local/scripts/respaldo.sh >> /var/log/lily-respaldo.log 2>&1
#
# Un respaldo que nunca se restauró no es un respaldo: prueba restaurar.sh en
# un equipo aparte de vez en cuando.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
[ -f "$KIT/.env.servidor" ] && { set -a; . "$KIT/.env.servidor"; set +a; }
: "${DATABASE_URL:?Define DATABASE_URL en .env.servidor}"

RESPALDOS="${RESPALDOS:-/respaldos/hojaldraslily}"
mkdir -p "$RESPALDOS/diarios" "$RESPALDOS/semanales"

sello="$(date +%Y%m%d-%H%M)"
destino="$RESPALDOS/diarios/lily-$sello.sql.gz"

echo "==> pg_dump → $destino"
pg_dump "$DATABASE_URL" --no-owner --clean --if-exists | gzip -9 > "$destino"

# El respaldo de los domingos se guarda como semanal.
if [ "$(date +%u)" = "7" ]; then
	cp "$destino" "$RESPALDOS/semanales/lily-$sello.sql.gz"
fi

# Rotación: 7 diarios, 4 semanales.
ls -1t "$RESPALDOS/diarios"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$RESPALDOS/semanales"/*.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -f

echo "Respaldo listo. Diarios:"
ls -1t "$RESPALDOS/diarios"/*.sql.gz 2>/dev/null | head
