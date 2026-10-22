@echo off
REM Prueba de la terminal Banorte por DLL: carga de llave. NO cobra.
REM Doble clic. Esta PC debe estar en el MISMO WiFi que la pinpad.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js. Instala la version LTS desde https://nodejs.org
  echo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "PINPAD.TPV" (
  echo.
  echo Falta el archivo PINPAD.TPV en esta carpeta.
  echo Copia aqui el DLL que dio Banorte / TPV Solutions y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, un momento...
  call npm install
)

echo.
echo === Prueba de la terminal Banorte ===
echo Carga de llave: NO cobra. Confirma que la pinpad conecta y responde.
echo.

set "PINPAD_IP="
set /p PINPAD_IP=IP de la pinpad (la que dio success en el nc):
set "PAYWORKS_USER=Terminal"
set /p PAYWORKS_USER=Usuario de Payworks [Terminal]:
set "PAYWORKS_PASSWORD="
set /p PAYWORKS_PASSWORD=Contrasena de Payworks:
set "PAYWORKS_GROUP="
set /p PAYWORKS_GROUP=Group (opcional para la llave, deja vacio si no lo tienes):

set "PINPAD_PORT=1818"
set "PAYWORKS_MODE=AUT"
set "DLL_PATH=.\PINPAD.TPV"

echo.
node index.mjs llave
echo.
echo (Si salio APROBADA, la pinpad conecto y cargo la llave.)
pause
