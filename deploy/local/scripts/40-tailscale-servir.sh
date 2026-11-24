#!/usr/bin/env bash
# Expone el servidor local por HTTPS en el tailnet de Nuvora (Tailscale Serve).
#
# Da un certificado REAL para el nombre MagicDNS del servidor
# (https://lily-tienda.TU-TAILNET.ts.net), accesible SOLO por los aparatos del
# tailnet — las PC de la tienda y el teléfono de la dueña—. No es Funnel: NO se
# expone a internet público.
#
# Requisitos previos (una vez):
#   1) curl -fsSL https://tailscale.com/install.sh | sh
#   2) sudo tailscale up            # une el servidor al tailnet de Nuvora
#   3) En el panel de Tailscale: habilita MagicDNS y HTTPS, y nómbralo lily-tienda.
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
	echo "Tailscale no está instalado. Instala con:" >&2
	echo "  curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up" >&2
	exit 1
fi

# Termina TLS en el tailnet y manda a Caddy (HTTP :80 en el host).
echo "==> tailscale serve :443 → http://127.0.0.1:80"
sudo tailscale serve --bg --https=443 http://127.0.0.1:80

echo
echo "Estado:"
tailscale serve status || true
echo
echo "Abre Admin desde el teléfono (con la app de Tailscale instalada y unido"
echo "al tailnet) en:  https://<nombre-del-servidor>.<tailnet>.ts.net/admin/"
echo "Esa MISMA URL es la que debe ir en VITE_SUPABASE_URL (.env.apps)."
