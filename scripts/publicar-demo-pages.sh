#!/usr/bin/env bash
# ============================================================================
# Compila las apps y las deja listas para GitHub Pages, en demo/app/<app>/
# ============================================================================
# Sirve para ENSENAR el sistema funcionando desde cualquier navegador, sin
# instalar nada. No sustituye al despliegue de verdad: la tienda va a
# Cloudflare Pages con sus dominios propios (ver .github/workflows).
#
# Cada app se compila con su `base` para que funcione bajo un subdirectorio; el
# router ya lee `import.meta.env.BASE_URL`, asi que no hay que tocar codigo.
#
# Las apps hablan con el Supabase real de Hojaldras Lily con la llave
# publicable, que es publica por diseno (vive dentro del frontend). Lo que
# protege la operacion es RLS y el PIN del personal, no esta llave.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BASE_PUBLICA="${BASE_PUBLICA:-/hojaldraslily/app}"
DESTINO="$RAIZ/demo/app"

APPS=(kiosko pos admin produccion cocina-alimentos cocina-bebidas cliente-display web cliente-pwa)

cd "$RAIZ"
rm -rf "$DESTINO"
mkdir -p "$DESTINO"

for app in "${APPS[@]}"; do
  echo "==> $app"
  # cada app necesita su .env; el .env.example ya trae la URL y la llave
  [ -f "apps/$app/.env" ] || cp "apps/$app/.env.example" "apps/$app/.env" 2>/dev/null || true
  pnpm --filter "@shake/$app" exec vite build --base "$BASE_PUBLICA/$app/"
  cp -r "apps/$app/dist" "$DESTINO/$app"
  # GitHub Pages no reescribe rutas: el 404 sirve de vuelta el index para que
  # una recarga en /pedido/4E68C1 no truene.
  cp "$DESTINO/$app/index.html" "$DESTINO/$app/404.html"
done

# Costeos es HTML plano, sin empaquetador: se copia tal cual.
echo "==> costos"
mkdir -p "$DESTINO/costos"
cp "apps/costos/index.html" "$DESTINO/costos/index.html"
cp "apps/costos/index.html" "$DESTINO/costos/404.html"

echo
echo "Listo. Las apps quedaron en demo/app/ para publicarse en Pages."
