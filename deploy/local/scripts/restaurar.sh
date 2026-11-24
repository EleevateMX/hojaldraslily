#!/usr/bin/env bash
# Restaura un respaldo (.sql.gz) a una base. ÚSALO CON CUIDADO: sobreescribe.
#
#   deploy/local/scripts/restaurar.sh /respaldos/hojaldraslily/diarios/lily-XXXX.sql.gz
#
# Para la PRUEBA de restauración, apúntalo a una base de ensayo, NO a la de
# producción: define DATABASE_URL_RESTAURAR hacia un Postgres aparte.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
[ -f "$KIT/.env.servidor" ] && { set -a; . "$KIT/.env.servidor"; set +a; }

archivo="${1:?Pasa el archivo .sql.gz a restaurar}"
destino="${DATABASE_URL_RESTAURAR:-${DATABASE_URL:?Define DATABASE_URL o DATABASE_URL_RESTAURAR}}"

[ -f "$archivo" ] || { echo "No existe: $archivo" >&2; exit 1; }

echo "Vas a restaurar:"
echo "   archivo: $archivo"
echo "   base:    ${destino%%@*}@…(oculto)"
read -r -p "¿Seguro? Escribe 'si' para continuar: " ok
[ "$ok" = "si" ] || { echo "Cancelado."; exit 1; }

echo "==> Restaurando…"
gunzip -c "$archivo" | psql "$destino" -v ON_ERROR_STOP=1
echo "Restauración completa."
