#!/usr/bin/env bash
# =============================================================================
#  Los ajustes nativos que Capacitor NO pone solo
# =============================================================================
#  `cap add ios` genera un proyecto de Xcode limpio cada vez. Tres ajustes
#  hay que aplicarle encima, y si se hacen a mano en Xcode se pierden en
#  cuanto el proyecto se regenera - sin dar ningun error, que es lo peor.
#
#  Por eso viven aqui: el proyecto nativo no se versiona, se reconstruye.
#  Esto se corre despues de `cap sync` y deja el proyecto listo para firmar.
#
#  Uso:  bash scripts/app-nativa-preparar.sh ios
#        bash scripts/app-nativa-preparar.sh android
# =============================================================================
set -euo pipefail

PLATAFORMA="${1:-}"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../apps/cliente-pwa" && pwd)"
ESQUEMA="com.hojaldraslily.rewards"
NOMBRE="Hojaldras Lily"

case "$PLATAFORMA" in
  ios)
    PLIST="$APP/ios/App/App/Info.plist"
    [ -f "$PLIST" ] || { echo "No existe $PLIST. Corre antes: npx cap add ios"; exit 1; }
    PB=/usr/libexec/PlistBuddy

    # 1. El esquema de URL con el que Google devuelve el login.
    #
    #    Sin esto el cliente entra con Google, Google termina bien, y el
    #    telefono no sabe a que app devolver el resultado: se queda en el
    #    navegador y parece que fallo. Es el error mas dificil de
    #    diagnosticar porque no da ningun mensaje.
    if ! $PB -c "Print :CFBundleURLTypes" "$PLIST" 2>/dev/null | grep -q "$ESQUEMA"; then
      $PB -c "Print :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 \
        || $PB -c "Add :CFBundleURLTypes array" "$PLIST"
      $PB -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
      $PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string $ESQUEMA" "$PLIST"
      $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
      $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $ESQUEMA" "$PLIST"
      echo "  [OK] esquema $ESQUEMA registrado"
    else
      echo "  [OK] el esquema ya estaba"
    fi

    # 2. El nombre bajo el icono. Por omision seria "App".
    $PB -c "Set :CFBundleDisplayName $NOMBRE" "$PLIST" 2>/dev/null \
      || $PB -c "Add :CFBundleDisplayName string $NOMBRE" "$PLIST"
    echo "  [OK] nombre visible: $NOMBRE"

    # 3. Declarar que no usa cifrado no exento.
    #
    #    Sin esta linea, App Store Connect pregunta por cumplimiento de
    #    exportacion en CADA subida y deja la compilacion detenida hasta
    #    que alguien entre a contestar a mano. Con HTTPS normal la
    #    respuesta es siempre esta, asi que declararla aqui evita que cada
    #    build a TestFlight se quede esperando.
    $PB -c "Set :ITSAppUsesNonExemptEncryption false" "$PLIST" 2>/dev/null \
      || $PB -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"
    echo "  [OK] cumplimiento de exportacion declarado"
    ;;

  android)
    MANIFIESTO="$APP/android/app/src/main/AndroidManifest.xml"
    [ -f "$MANIFIESTO" ] || { echo "No existe $MANIFIESTO. Corre antes: npx cap add android"; exit 1; }

    if grep -q "$ESQUEMA" "$MANIFIESTO"; then
      echo "  [OK] el esquema ya estaba"
    else
      # Se inserta el intent-filter justo antes de cerrar la actividad
      # principal. python3 y no sed: sed multilinea se comporta distinto
      # en macOS y en Linux, y este script corre en los dos.
      python3 - "$MANIFIESTO" "$ESQUEMA" <<'PY'
import sys
ruta, esquema = sys.argv[1], sys.argv[2]
xml = open(ruta, encoding='utf-8').read()
filtro = f'''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="{esquema}" />
            </intent-filter>
'''
i = xml.index('</activity>')
open(ruta, 'w', encoding='utf-8').write(xml[:i] + filtro + '        ' + xml[i:])
PY
      echo "  [OK] esquema $ESQUEMA registrado"
    fi
    ;;

  *)
    echo "Uso: bash scripts/app-nativa-preparar.sh [ios|android]"
    exit 1
    ;;
esac
