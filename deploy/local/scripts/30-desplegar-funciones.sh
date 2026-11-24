#!/usr/bin/env bash
# Pone las Edge Functions en el stack self-hosted y reinicia su contenedor.
#
# En Supabase auto-hospedado, las funciones se SIRVEN desde una carpeta montada
# (volumes/functions/<nombre>/index.ts) por el contenedor `functions`
# (edge-runtime, Deno). "Desplegar" = copiar nuestras funciones ahí y reiniciar.
#
# Copia solo las que importan (las desplegadas en la nube, ver
# supabase/functions/README.md): staff-login, interredes-*, contadigital-*,
# más _shared. Las de Clip se quedan fuera (referencia, sin cron).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
: "${STACK_DIR:?Define STACK_DIR (la carpeta del bundle oficial de Supabase, la que tiene docker-compose.yml y volumes/)}"

ORIGEN="$RAIZ/supabase/functions"
DESTINO="$STACK_DIR/volumes/functions"
mkdir -p "$DESTINO"

FUNCIONES=(_shared staff-login \
	interredes-probar interredes-cobrar interredes-cancelar interredes-llave \
	contadigital-clientes contadigital-facturar contadigital-nominativa)

for fn in "${FUNCIONES[@]}"; do
	if [ -d "$ORIGEN/$fn" ]; then
		echo "==> $fn"
		rm -rf "${DESTINO:?}/$fn"
		cp -r "$ORIGEN/$fn" "$DESTINO/$fn"
	else
		echo "   (omito $fn: no está en $ORIGEN)"
	fi
done

echo "==> Reiniciando el contenedor de funciones…"
( cd "$STACK_DIR" && docker compose restart functions )
echo "Funciones al día. Recuerda cargar sus SECRETOS en el .env del stack."
