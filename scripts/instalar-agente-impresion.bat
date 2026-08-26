@echo off
REM ============================================================================
REM  Hojaldras Lily - instalar el agente de impresion  (doble clic)
REM ============================================================================
REM  Windows bloquea por defecto la ejecucion de archivos .ps1 descargados
REM  ("la ejecucion de scripts esta deshabilitada en este sistema"). Los .bat
REM  no tienen esa restriccion, asi que este archivo hace de puerta: baja el
REM  instalador y lo corre saltandose la politica SOLO para ese proceso.
REM
REM  No cambia la configuracion del equipo. Al terminar, Windows sigue
REM  bloqueando los .ps1 igual que antes.
REM
REM  USO: clic derecho -> "Ejecutar como administrador".
REM       Pide la llave publica de Supabase y ya.
REM ============================================================================

setlocal
title Hojaldras Lily - instalar agente de impresion
color 0A

echo.
echo   HOJALDRAS LILY - agente de impresion
echo   =================================
echo.

REM Sin permisos de administrador no se puede instalar Node ni escribir en
REM C:\Hojaldras Lily. Se avisa aqui y no a la mitad, con medio trabajo hecho.
net session >nul 2>&1
if errorlevel 1 (
  echo   [X] Esto necesita permisos de administrador.
  echo.
  echo       Cierra esta ventana, haz clic DERECHO sobre este archivo
  echo       y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

set "LLAVE=%~1"
if "%LLAVE%"=="" (
  echo   Pega la llave publica de Supabase y presiona Enter.
  echo   ^(Supabase - Project Settings - API Keys^)
  echo.
  set /p LLAVE=  Llave:
)
if "%LLAVE%"=="" (
  echo.
  echo   [X] Sin llave no se puede continuar.
  pause
  exit /b 1
)

set "PS1=%TEMP%\shake-instalar-agente.ps1"
set "URL=https://raw.githubusercontent.com/EleevateMX/ventashake/main/scripts/instalar-agente-impresion.ps1"

echo.
echo   Bajando el instalador...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%PS1%'; Unblock-File '%PS1%'"

if not exist "%PS1%" (
  echo   [X] No se pudo bajar. Revisa que este equipo tenga internet.
  pause
  exit /b 1
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -AnonKey "%LLAVE%" %~2 %~3

echo.
echo   ----------------------------------------------------------------
echo   Ventana abierta a proposito: arriba esta el detalle de cada paso.
pause
endlocal
