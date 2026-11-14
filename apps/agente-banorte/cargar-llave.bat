@echo off
REM Carga la LLAVE de PRODUCCION en la pinpad, leyendo el .env tal cual
REM (PAYWORKS_MODE=PRD, PAYWORKS_USER=TERMINAL). NO cobra.
REM
REM Usa ESTE archivo cuando el cobro diga "Error de llaves". A diferencia de
REM probar.bat, no fuerza el modo AUT: carga la llave en el MISMO modo con el
REM que la caja cobra (PRD), que es justo lo que se necesita.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js. Instala la version LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, un momento...
  call npm install
)

echo.
echo === Cargando la llave de PRODUCCION en la pinpad (lee el .env) ===
echo La pinpad debe estar encendida y en el mismo WiFi que esta PC.
echo.
node index.mjs llave
echo.
echo Si arriba dice "usuario: TERMINAL . modo: PRD" y termino en APROBADA (A):
echo la llave quedo cargada. Reinicia el agente de cobros (cierra y abre su
echo ventana) y cobra una prueba de 1 peso en la caja.
echo.
echo Si NO aprobo: revisa el .env (PAYWORKS_USER=TERMINAL, PAYWORKS_MODE=PRD y
echo la contrasena), o pide a Banorte una llave nueva para la afiliacion.
pause
