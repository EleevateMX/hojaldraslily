@echo off
REM Agente de Banorte en modo COLA: cobra las tarjetas que la caja (en la nube)
REM encola, y carga la llave de la pinpad al arrancar. Deja su ventana abierta
REM todo el dia. Si el proceso se cae (red, pinpad), se reinicia solo a los 5
REM segundos. Para apagarlo de verdad, cierra esta ventana.
title Hojaldras Lily - agente de Banorte
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias, un momento...
  call npm install
)

:loop
node index.mjs cola
echo.
echo El agente de Banorte se detuvo. Reinicia en 5 segundos...
echo (cierra esta ventana si NO quieres que reinicie)
timeout /t 5 /nobreak >nul
goto loop
