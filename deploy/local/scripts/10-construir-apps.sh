#!/usr/bin/env bash
# Compila las 9 apps apuntando al Supabase LOCAL y las deja en deploy/local/web/
#
# Mismo patrón que scripts/publicar-demo-pages.sh (la vitrina), pero con el
# .env LOCAL y la salida al web root que sirve Caddy. El router ya lee
# import.meta.env.BASE_URL, así que no se toca código.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
KIT="$(cd "$AQUI/.." && pwd)"
RAIZ="$(cd "$KIT/../.." && pwd)"
DESTINO="${WEB_ROOT:-$KIT/web}"
ENV_APPS="${ENV_APPS:-$KIT/.env.apps}"

if [ ! -f "$ENV_APPS" ]; then
	echo "Falta $ENV_APPS — copia .env.apps.example y pon la URL y la anon key LOCALES." >&2
	exit 1
fi

# Las que pasan por Vite (tienen base propio y PWA).
APPS=(kiosko pos admin produccion horno empaque cliente-display web)

cd "$RAIZ"
echo "==> Instalando dependencias (pnpm)…"
pnpm install --frozen-lockfile >/dev/null

rm -rf "$DESTINO"
mkdir -p "$DESTINO"

for app in "${APPS[@]}"; do
	echo "==> Compilando $app (base /$app/)…"
	cp "$ENV_APPS" "apps/$app/.env"
	pnpm --filter "@lily/$app" exec vite build --base "/$app/"
	cp -r "apps/$app/dist" "$DESTINO/$app"
	# SPA: una recarga en /admin/algo devuelve el index.
	cp "$DESTINO/$app/index.html" "$DESTINO/$app/404.html"
done

# Costeos es HTML plano (sin empaquetador). Lleva la URL y la llave DENTRO del
# archivo, así que hay que apuntarlas al Supabase local a mano / con el bundle
# oficial. Se copia tal cual y se avisa.
echo "==> Copiando costos (HTML plano)…"
mkdir -p "$DESTINO/costos"
cp "apps/costos/index.html" "$DESTINO/costos/index.html"
echo "    OJO: edita $DESTINO/costos/index.html y pon la URL y la anon key LOCALES"
echo "    (Costeos trae la llave dentro del archivo; ver CLAUDE.md §2.5/§4)."

echo
echo "Listo. Apps compiladas en: $DESTINO"
echo "Caddy ya las sirve en /pos/ /admin/ /produccion/ /horno/ /empaque/ /kiosko/ /cliente-display/ /web/ /costos/"
