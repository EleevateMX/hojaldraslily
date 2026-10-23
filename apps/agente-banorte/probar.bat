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

REM El kit de Banorte trae Pinpad.dll (64 bits) y Pinpad.tpv (32 bits).
REM Preferimos el .dll de 64 bits, que es el que va con el Node normal.
set "DLL_PATH="
if exist "Pinpad.dll" set "DLL_PATH=.\Pinpad.dll"
if not defined DLL_PATH if exist "Pinpad.tpv" set "DLL_PATH=.\Pinpad.tpv"
if not defined DLL_PATH (
  echo.
  echo Falta el DLL de Banorte en esta carpeta.
  echo Copia aqui Pinpad.dll ^(64 bits^) o Pinpad.tpv ^(32 bits^) y vuelve a intentar.
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
REM DLL_PATH ya quedo fijado arriba segun el archivo que haya (.dll o .tpv).

echo.
echo Usando DLL: %DLL_PATH%
node index.mjs llave
echo.
echo (Si salio APROBADA, la pinpad conecto y cargo la llave.)
echo (Si dice "No se pudo cargar el DLL", falta el Visual C++ Redistributable:
echo  https://aka.ms/vs/17/release/vc_redist.x64.exe )
pause
