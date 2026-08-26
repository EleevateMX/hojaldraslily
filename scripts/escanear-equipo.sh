#!/usr/bin/env bash
# ============================================================================
#  Escaneo del equipo — Hojaldras Lily POS  (Linux / macOS)
# ============================================================================
#  Equivalente de escanear-equipo.ps1 para equipos que no son Windows.
#  Es de SOLO LECTURA: no instala, no configura y no cambia nada.
#
#  Cómo correrlo:
#      bash escanear-equipo.sh | tee ~/hojaldraslily-escaneo.txt
#  y pégame el resultado.
# ============================================================================

sec() { printf '\n=== %s ===\n' "$1"; }
hay() { command -v "$1" >/dev/null 2>&1; }

sec "EQUIPO"
echo "Nombre      : $(hostname)"
if [ "$(uname)" = "Darwin" ]; then
  echo "Sistema     : macOS $(sw_vers -productVersion) ($(uname -m))"
else
  echo "Sistema     : $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") ($(uname -m))"
fi

sec "RED"
if hay ip; then
  ip -4 -o addr show scope global | awk '{print "IP          : " $4 "  (" $2 ")"}'
  ip route | awk '/^default/ {print "Gateway     : " $3}'
else
  ifconfig 2>/dev/null | awk '/inet /  && $2 != "127.0.0.1" {print "IP          : " $2}'
  netstat -rn 2>/dev/null | awk '/^default/ {print "Gateway     : " $2; exit}'
fi

# Sin salida a internet no hay sistema: todo habla con Supabase.
if hay curl; then
  if curl -s -o /dev/null --max-time 8 https://zyjtnaystsporbuzcmqk.supabase.co/rest/v1/; then
    echo "Supabase    : ALCANZABLE"
  else
    echo "Supabase    : NO ALCANZABLE — revisar internet/firewall"
  fi
fi

sec "IMPRESORAS (CUPS)"
if hay lpstat; then lpstat -p -d 2>/dev/null || echo "(ninguna)"; else echo "(CUPS no instalado)"; fi

sec "PUERTOS DE IMPRESORA"
ls -l /dev/usb/lp* /dev/lp* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || echo "(ninguno)"

sec "DISPOSITIVOS USB CONECTADOS"
# Aquí aparecen la impresora térmica, el lector de QR y el cajón de dinero.
if hay lsusb; then lsusb
elif [ "$(uname)" = "Darwin" ]; then system_profiler SPUSBDataType 2>/dev/null | grep -E '^\s{6}\S.*:$' | sed 's/:$//;s/^ */- /'
else echo "(lsusb no instalado: sudo apt install usbutils)"; fi

sec "NODE.JS (lo necesita el agente de impresión)"
if hay node; then echo "node        : $(node --version)"; else echo "node        : NO INSTALADO — se necesita Node.js 20+"; fi
if hay npm;  then echo "npm         : $(npm --version)";  else echo "npm         : NO INSTALADO"; fi

sec "IMPRESORAS DE RED EN LA LAN (puerto 9100)"
# Las térmicas de red escuchan en el 9100. Se barre solo TU subred local.
mi=$(hay ip && ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)
[ -z "$mi" ] && mi=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')
if [ -n "$mi" ]; then
  base="${mi%.*}"
  echo "Barriendo $base.1-254 en el puerto 9100 (tarda ~30 s)..."
  encontradas=""
  for i in $(seq 1 254); do
    ( timeout 0.3 bash -c "echo > /dev/tcp/$base.$i/9100" 2>/dev/null && echo "- $base.$i:9100" ) &
  done | sort -V
  wait
  echo "(si no salió ninguna y tu impresora es USB, es normal)"
fi

echo
echo "-----------------------------------------------------------"
echo "Copia TODO lo de arriba y pégamelo en el chat."
echo "-----------------------------------------------------------"
