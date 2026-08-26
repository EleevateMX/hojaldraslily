@echo off
REM ============================================================================
REM  HOJALDRAS LILY - abrir Caja (POS) y Admin cuando se necesiten
REM ============================================================================
REM  Estas dos NO se abren al prender la PC a proposito: la pantalla de la
REM  caja ya tiene tres apps encima (kiosko, barra y cocina) y estas dos se
REM  usan a ratos, no todo el dia.
REM
REM    Caja  - cobrar a mano, ver pedidos pendientes, corte desde el POS.
REM    Admin - precios, fotos, empleados, impresoras, "En vivo".
REM
REM  Van en ventana normal (no a pantalla completa) para poder alternar con
REM  Alt+Tab y dejarlas encima de lo demas.
REM
REM  Tambien se pueden abrir desde el celular:
REM    caja.hojaldraslily.com   y   admin.hojaldraslily.com
REM ============================================================================

setlocal
title Hojaldras Lily - Caja y Admin
color 0A

set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%NAV%" (
  echo   [X] No se encontro Chrome ni Edge.
  pause
  exit /b 1
)

REM Cada ventana con su PROPIO perfil: sin eso Chrome reutiliza la instancia
REM abierta, ignora la posicion y las apps terminan amontonadas.
set "COMUNES=--noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble"

echo.
echo   Abriendo CAJA (POS)...
start "" "%NAV%" %COMUNES% --user-data-dir="%LOCALAPPDATA%\shake-pos" --window-position=160,160 --window-size=980,1500 https://caja.hojaldraslily.com
timeout /t 3 /nobreak >nul

echo   Abriendo ADMIN...
start "" "%NAV%" %COMUNES% --user-data-dir="%LOCALAPPDATA%\shake-admin" --window-position=100,100 --window-size=980,1500 https://admin.hojaldraslily.com

echo.
echo   Listo. Alt+Tab para alternar entre ventanas.
timeout /t 4 /nobreak >nul
endlocal
