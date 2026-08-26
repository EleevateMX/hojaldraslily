@echo off
REM ============================================================================
REM  HOJALDRAS LILY - abrir el dia
REM ============================================================================
REM  Se prende la PC y esto corre solo. Tambien sirve con doble clic.
REM
REM  EL ORDEN IMPORTA, y cambio despues de un arranque en frio que no abrio
REM  nada. Antes lo primero era buscar actualizacion del agente; si habia
REM  una, Windows sacaba su ventana de permiso y ahi se quedaba todo: sin
REM  nadie que aceptara a las 7 de la manana, el local amanecia con las
REM  pantallas apagadas. Ahora es al reves:
REM
REM    1. Esperar a que haya internet   (al prender, el wifi tarda)
REM    2. Arrancar el agente de impresion   -> las impresoras en linea
REM    3. Abrir las tres pantallas          -> la tienda ya puede vender
REM    4. Recien entonces, buscar actualizacion del agente
REM
REM  Asi, lo peor que puede pasar con una actualizacion pendiente es que se
REM  quede para el dia siguiente. Nunca que la tienda no abra.
REM
REM  Los cambios de PRECIOS y PRODUCTOS no necesitan nada de esto: para eso
REM  esta el boton "Actualizar pantallas" en Admin - En vivo.
REM ============================================================================

setlocal EnableDelayedExpansion
title Hojaldras Lily
color 0A

set "BASE=C:\Hojaldras Lily"
set "AGENTE=%BASE%\agente-impresion\arrancar-agente.bat"
set "PANTALLAS=%BASE%\pantallas.ps1"
set "CRUDO=https://raw.githubusercontent.com/EleevateMX/ventashake/main"

echo.
echo   HOJALDRAS LILY
echo   ===========
echo.

if not exist "%BASE%" mkdir "%BASE%" >nul 2>&1

REM ---------------------------------------------------------------------------
REM 1. Esperar internet
REM ---------------------------------------------------------------------------
REM  Windows lanza los programas del inicio antes de que la red este lista.
REM  Sin esta espera, Chrome abre en "sin conexion" y se queda ahi hasta que
REM  alguien recarga a mano.
echo   Esperando internet...
set "HAYRED="
for /l %%i in (1,1,10) do (
  if not defined HAYRED (
    powershell -NoProfile -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'https://kiosko.hojaldraslily.com/';if($r.StatusCode -eq 200){exit 0}}catch{};exit 1" >nul 2>&1
    if not errorlevel 1 set "HAYRED=1"
    if not defined HAYRED ping -n 4 127.0.0.1 >nul
  )
)
if defined HAYRED (
  echo   [OK] Internet listo.
) else (
  echo   [!] Sin internet. Se abre igual, pero las pantallas van a
  echo       aparecer vacias hasta que vuelva la conexion.
)

REM ---------------------------------------------------------------------------
REM 2. Agente de impresion - PRIMERO, para que las impresoras esten en linea
REM ---------------------------------------------------------------------------
REM  Se comprueba si ya hay uno corriendo ANTES de abrir otro: dos agentes
REM  peleandose la misma impresora sacan comandas repetidas.
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "Hojaldras Lily - agente de impresion" >nul
if not errorlevel 1 (
  echo   [OK] El agente de impresion ya estaba corriendo.
) else (
  if exist "%AGENTE%" (
    echo   Arrancando el agente de impresion...
    start "" "%AGENTE%"
    echo   [OK] Agente arrancado ^(deja su ventana abierta todo el dia^).
  ) else (
    echo   [!] El agente de impresion no esta instalado en esta PC.
    echo       Las pantallas abren igual, pero NO saldra papel.
    echo       Para instalarlo: instalar-todo.bat
  )
)

REM ---------------------------------------------------------------------------
REM 3. Las pantallas
REM ---------------------------------------------------------------------------
REM  El acomodo por monitor vive en pantallas.ps1, no aqui: un .bat no puede
REM  preguntarle a Windows donde estan los monitores ni empujar una ventana
REM  al monitor correcto. Se refresca desde GitHub si hay internet, para que
REM  un ajuste de pantallas no obligue a reinstalar nada en la tienda.
if defined HAYRED (
  powershell -NoProfile -Command ^
    "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 '%CRUDO%/scripts/pantallas.ps1' -OutFile '%PANTALLAS%.nuevo'; if((Get-Item '%PANTALLAS%.nuevo').Length -gt 1000){Move-Item -Force '%PANTALLAS%.nuevo' '%PANTALLAS%'}else{Remove-Item -Force '%PANTALLAS%.nuevo'}}catch{}" >nul 2>&1
  if not exist "%BASE%\hojaldraslily-logo.png" powershell -NoProfile -Command ^
    "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 '%CRUDO%/scripts/hojaldraslily-logo.png' -OutFile '%BASE%\hojaldraslily-logo.png'}catch{}" >nul 2>&1
)

echo.
if exist "%PANTALLAS%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PANTALLAS%"
) else (
  echo   [!] No encontre pantallas.ps1 y no hay internet para bajarlo.
  echo       Abriendo de la forma simple ^(sin acomodar por monitor^).
  call :simple
)

REM ---------------------------------------------------------------------------
REM 4. Actualizacion del agente - hasta el final, cuando ya se puede vender
REM ---------------------------------------------------------------------------
call :actualizar

echo.
echo   ----------------------------------------------------------------
echo   LISTO. Buen turno.
echo.
echo   * Cambios de precios o productos: NO hace falta reabrir nada.
echo     Admin - En vivo - boton "Actualizar pantallas".
echo   * Caja y Admin: icono "Caja y Admin" en el escritorio.
echo   * Si algo abrio en el monitor equivocado, el detalle esta en
echo     %BASE%\ultimo-arranque.log
echo   ----------------------------------------------------------------
timeout /t 10 /nobreak >nul
endlocal
exit /b 0

REM ===========================================================================
:simple
REM  Plan B: sin pantallas.ps1 no se puede acomodar por monitor, pero abrir
REM  amontonado es mejor que no abrir. Cada ventana con su propio perfil,
REM  porque si no Chrome reutiliza la instancia y las tres caen encima.
set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" (
  echo   [X] No hay Chrome ni Edge en esta PC.
  goto :eof
)
set "F=--noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble"
start "" "%NAV%" --app=https://barra.hojaldraslily.com  %F% --user-data-dir="%LOCALAPPDATA%\shake-bebidas"
timeout /t 3 /nobreak >nul
start "" "%NAV%" --app=https://cocina.hojaldraslily.com %F% --user-data-dir="%LOCALAPPDATA%\shake-alimentos"
timeout /t 3 /nobreak >nul
start "" "%NAV%" --app=https://kiosko.hojaldraslily.com %F% --user-data-dir="%LOCALAPPDATA%\shake-kiosko"
goto :eof

REM ===========================================================================
:actualizar
if not defined HAYRED goto :eof
if not exist "%BASE%\agente-impresion\package.json" goto :eof

set "VLOCAL="
set "VNUEVA="
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command ^
  "try{(Get-Content '%BASE%\agente-impresion\package.json' -Raw | ConvertFrom-Json).version}catch{''}"`) do set "VLOCAL=%%v"
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command ^
  "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;((Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 '%CRUDO%/agente-impresion/package.json').Content | ConvertFrom-Json).version}catch{''}"`) do set "VNUEVA=%%v"

if "%VNUEVA%"=="" goto :eof
if "%VLOCAL%"=="%VNUEVA%" (
  echo.
  echo   [OK] El agente de impresion esta al dia ^(%VLOCAL%^).
  goto :eof
)

REM La llave sale del .env que ya quedo en esta PC: nadie tiene que teclearla.
set "LLAVE="
if not exist "%BASE%\agente-impresion\.env" goto :sinllave
for /f "usebackq tokens=1,* delims==" %%a in ("%BASE%\agente-impresion\.env") do (
  if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
)
:sinllave
if "%LLAVE%"=="" (
  echo.
  echo   [!] Hay agente nuevo ^(%VNUEVA%^) pero no encontre la llave.
  echo       Corre instalar-todo.bat cuando puedas.
  goto :eof
)

echo.
echo   Hay una version nueva del agente de impresion: %VLOCAL% -^> %VNUEVA%
echo   Windows va a pedir permiso una vez. Si no hay nadie, no pasa nada:
echo   la tienda ya esta abierta y se actualiza manana.
echo.

taskkill /f /fi "WINDOWTITLE eq Hojaldras Lily - agente de impresion*" >nul 2>&1

REM Se escribe un .ps1 temporal en vez de armar un comando gigante con
REM comillas escapadas: eso ultimo se rompe en cuanto alguien lo edita.
set "TMPPS=%TEMP%\shake-actualizar.ps1"
> "%TMPPS%" echo [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
>>"%TMPPS%" echo $i = Join-Path $env:TEMP 'shake-instalador.ps1'
>>"%TMPPS%" echo Invoke-WebRequest -UseBasicParsing '%CRUDO%/scripts/instalar-agente-impresion.ps1' -OutFile $i
>>"%TMPPS%" echo Unblock-File $i
>>"%TMPPS%" echo ^& $i -AnonKey '%LLAVE%'

powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%TMPPS%'"
del "%TMPPS%" >nul 2>&1

REM El agente quedo apagado por el taskkill de arriba: hay que revivirlo o
REM la tienda se queda sin papel hasta el proximo arranque.
if exist "%AGENTE%" start "" "%AGENTE%"
echo   [OK] Agente actualizado y corriendo.
goto :eof
