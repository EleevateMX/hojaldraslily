@echo off
REM ============================================================================
REM  HOJALDRAS LILY - dejar la PC lista, de un solo clic
REM ============================================================================
REM  Se corre UNA VEZ por computadora. Deja:
REM
REM    * el agente de impresion instalado y corriendo,
REM    * "Hojaldras Lily" en el arranque de Windows, con su icono,
REM    * "Hojaldras Lily" y "Caja y Admin" en el escritorio,
REM    * y todo abierto ahora mismo.
REM
REM  POR QUE ESTA PARTIDO EN DOS MITADES
REM
REM  Instalar Node y escribir en C:\ necesita permisos de administrador.
REM  Pero al elevarse, Windows puede cambiar de usuario, y entonces
REM  %APPDATA% apunta al perfil del administrador. La version anterior
REM  guardaba ahi el arranque automatico: en un perfil que nadie abre. La
REM  PC se prendia en frio y no pasaba nada, mientras el instalador ya
REM  habia dicho "[OK] al prender la PC se abre solo".
REM
REM  Ahora la mitad que necesita permisos corre elevada y aparte, y la
REM  mitad que toca el escritorio y el arranque corre como el usuario que
REM  de verdad usa la caja.
REM ============================================================================

setlocal EnableDelayedExpansion
title Hojaldras Lily - dejar la PC lista
color 0A

set "BASE=C:\Hojaldras Lily"
set "CRUDO=https://raw.githubusercontent.com/EleevateMX/ventashake/main"

REM  Al llamarse a si mismo elevado, el primer argumento es la bandera y el
REM  segundo la llave.
if /i "%~1"=="/elevado" (
  set "LLAVE=%~2"
  goto :parte_admin
)
set "LLAVE=%~1"

echo.
echo   HOJALDRAS LILY - dejando esta PC lista
echo   ==================================
echo.

REM ---------------------------------------------------------------------------
REM 1. La llave, ANTES de elevar
REM ---------------------------------------------------------------------------
REM  Se pregunta aqui y no en la ventana elevada porque esa se abre y se
REM  cierra sola: si algo falla, nadie alcanza a leer lo que decia.
if "%LLAVE%"=="" if exist "%BASE%\agente-impresion\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%BASE%\agente-impresion\.env") do (
    if /i "%%a"=="SUPABASE_ANON_KEY" set "LLAVE=%%b"
  )
  if not "!LLAVE!"=="" echo   [OK] Llave tomada de la instalacion anterior.
)

if "%LLAVE%"=="" (
  echo   Pega la llave publica de Supabase y presiona Enter.
  echo   ^(Te la paso por WhatsApp; empieza con sb_publishable_^)
  echo.
  set /p LLAVE=  Llave:
)

if "%LLAVE%"=="" (
  echo.
  echo   [X] Sin llave no se puede continuar.
  pause
  exit /b 1
)

REM ---------------------------------------------------------------------------
REM 2. La mitad que necesita permisos
REM ---------------------------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Windows va a pedir permiso para instalar. Acepta.
  echo.
  powershell -NoProfile -Command "Start-Process '%~f0' -ArgumentList '/elevado','%LLAVE%' -Verb RunAs -Wait"
  if errorlevel 1 (
    echo.
    echo   [X] No se pudo obtener el permiso. Haz clic DERECHO sobre este
    echo       archivo y elige "Ejecutar como administrador".
    pause
    exit /b 1
  )
) else (
  REM  Ya se abrio como administrador: no hay una mitad de usuario aparte,
  REM  asi que se hace todo aqui mismo.
  call :hacer_admin
)

goto :parte_usuario

REM ===========================================================================
:parte_admin
call :hacer_admin
exit /b 0

REM ===========================================================================
:hacer_admin
echo.
echo   [1/3] Instalando el agente de impresion...
echo.

REM El agente viejo debe soltar la impresora antes de reemplazar archivos.
taskkill /f /fi "WINDOWTITLE eq Hojaldras Lily - agente de impresion*" >nul 2>&1

set "TMPPS=%TEMP%\shake-instalar-agente.ps1"
> "%TMPPS%" echo [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
>>"%TMPPS%" echo $i = Join-Path $env:TEMP 'shake-instalador.ps1'
>>"%TMPPS%" echo Invoke-WebRequest -UseBasicParsing '%CRUDO%/scripts/instalar-agente-impresion.ps1' -OutFile $i
>>"%TMPPS%" echo Unblock-File $i
>>"%TMPPS%" echo ^& $i -AnonKey '%LLAVE%'

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%"
set "RESULTADO=%ERRORLEVEL%"
del "%TMPPS%" >nul 2>&1

if not "%RESULTADO%"=="0" (
  echo.
  echo   [!] El instalador del agente termino con problemas. Arriba esta el
  echo       detalle. Se continua: las pantallas van a funcionar aunque el
  echo       papel no salga.
  echo.
)

echo.
echo   [2/3] Bajando el lanzador y sus archivos...

if not exist "%BASE%" mkdir "%BASE%" >nul 2>&1
call :bajar "scripts/abrir-hojaldraslily.bat" "%BASE%\abrir-hojaldraslily.bat"
call :bajar "scripts/abrir-caja-y-admin.bat" "%BASE%\abrir-caja-y-admin.bat"
call :bajar "scripts/pantallas.ps1"          "%BASE%\pantallas.ps1"
call :bajar "scripts/instalar-inicio.ps1"    "%BASE%\instalar-inicio.ps1"
call :bajar "scripts/hojaldraslily.ico"        "%BASE%\hojaldraslily.ico"
call :bajar "scripts/hojaldraslily-logo.png"   "%BASE%\hojaldraslily-logo.png"

if not exist "%BASE%\abrir-hojaldraslily.bat" (
  echo   [X] No se pudo bajar el lanzador. Revisa el internet de esta PC.
  pause
  exit /b 1
)
goto :eof

REM ===========================================================================
:bajar
REM  %~1 = ruta dentro del repo, %~2 = donde guardarlo
powershell -NoProfile -Command ^
  "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 40 '%CRUDO%/%~1' -OutFile '%~2'}catch{}" >nul 2>&1
if exist "%~2" (echo   [OK] %~nx2) else (echo   [!] No se pudo bajar %~nx2)
goto :eof

REM ===========================================================================
:parte_usuario
REM ---------------------------------------------------------------------------
REM 3. Arranque y escritorio - como el usuario que usa la caja
REM ---------------------------------------------------------------------------
echo.
echo   [3/3] Dejandolo en el arranque de Windows y en el escritorio...

if not exist "%BASE%\instalar-inicio.ps1" (
  echo   [X] Falta instalar-inicio.ps1. Revisa el internet y vuelve a correr esto.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\instalar-inicio.ps1"

REM ---------------------------------------------------------------------------
REM 4. Arrancar
REM ---------------------------------------------------------------------------
echo.
echo   Abriendo todo...
start "" "%BASE%\abrir-hojaldraslily.bat"

echo.
echo   ================================================================
echo   LISTO. Esta PC ya no necesita mantenimiento.
echo.
echo   * Al prender la maquina se abre todo solo, con su icono.
echo   * El agente se actualiza solo, DESPUES de abrir la tienda.
echo   * Precios y productos: boton "Actualizar pantallas" en
echo     Admin - En vivo. No hay que tocar esta computadora.
echo   * Si algo abre en el monitor equivocado:
echo     C:\Hojaldras Lily\ultimo-arranque.log dice que vio Windows.
echo   ================================================================
echo.
pause
endlocal
exit /b 0
