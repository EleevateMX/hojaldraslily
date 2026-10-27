@echo off
REM Trae la ultima version del agente de Banorte desde main (sin tocar el .env
REM ni el Pinpad.dll). Doble clic antes de una prueba para correr el codigo al
REM dia: sin customerRef5 (eso era de la API) y con el group ya opcional.
setlocal
cd /d "%~dp0"

set "BASE=https://raw.githubusercontent.com/EleevateMX/hojaldraslily/main/apps/agente-banorte"

where curl >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro curl. Usa Windows 10 o mas nuevo, o descarga los archivos
  echo index.mjs y pinpad.mjs a mano desde GitHub ^(carpeta apps/agente-banorte^).
  echo.
  pause
  exit /b 1
)

echo Descargando la ultima version del agente...
curl -fsSL "%BASE%/index.mjs"     -o index.mjs     || goto error
curl -fsSL "%BASE%/pinpad.mjs"    -o pinpad.mjs    || goto error
curl -fsSL "%BASE%/package.json"  -o package.json  || goto error
curl -fsSL "%BASE%/.env.example"  -o .env.example  || goto error

if not exist node_modules (
  echo Instalando dependencias, un momento...
  call npm install
)

echo.
echo Listo. El agente quedo al dia.
echo Para probar la terminal ^(NO cobra^): doble clic en probar.bat
echo.
pause
exit /b 0

:error
echo.
echo No se pudo descargar. Revisa el internet y vuelve a intentar.
echo.
pause
exit /b 1
