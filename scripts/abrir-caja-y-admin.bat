@echo off
REM ============================================================================
REM  HOJALDRAS LILY - abrir Caja (POS) y Admin cuando se necesiten
REM ============================================================================
REM  Estas dos NO se abren al prender la PC a proposito: esa PC ya tiene
REM  encima las pantallas del camino del pan (kiosko, produccion, horno y
REM  empaque) y estas dos se usan a ratos, no todo el dia.
REM
REM  EXCEPCION: si la tienda arranca SOLO con caja y tickets (ver
REM  docs/hardware-caja.md), entonces esta es la unica ventana que hace
REM  falta y si conviene ponerla en el arranque. Para eso basta copiar su
REM  acceso directo a la carpeta de Inicio.
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

REM  --kiosk-printing es lo que hace que el ticket SALGA. Sin esa bandera,
REM  cada cobro abre el dialogo de impresion de Chrome y el cajero tiene que
REM  darle "Imprimir" con el cliente enfrente; con prisa, se cierra sin
REM  imprimir y el ticket se pierde. Con la bandera, el ticket se va directo
REM  a la impresora PREDETERMINADA de Windows y no se ve ninguna ventana.
REM
REM  Consecuencia que hay que respetar: la impresora de tickets tiene que
REM  quedar como predeterminada en esa PC. Si queda otra (un PDF, una laser
REM  de oficina), el ticket se imprime ahi en silencio, sin error.
REM
REM  Va solo en la Caja. Admin no imprime tickets y ahi el dialogo si se
REM  quiere, para poder elegir impresora en una prueba.
set "IMPRIME=--kiosk-printing"

echo.
echo   Abriendo CAJA (POS)...
start "" "%NAV%" %COMUNES% %IMPRIME% --user-data-dir="%LOCALAPPDATA%\shake-pos" --window-position=160,160 --window-size=980,1500 https://caja.hojaldraslily.com
timeout /t 3 /nobreak >nul

echo   Abriendo ADMIN...
start "" "%NAV%" %COMUNES% --user-data-dir="%LOCALAPPDATA%\shake-admin" --window-position=100,100 --window-size=980,1500 https://admin.hojaldraslily.com

echo.
echo   Listo. Alt+Tab para alternar entre ventanas.
timeout /t 4 /nobreak >nul
endlocal
