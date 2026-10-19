@echo off
REM Agente de tickets de caja - Hojaldras Lily
REM Deja esta ventana ABIERTA todo el horario del local.
REM Si se cierra, los tickets dejan de salir (las comandas no: esas son del
REM otro agente, que corre aparte a proposito).
title Hojaldras Lily - agente de tickets de caja
cd /d "%~dp0"
:loop
call npm start
echo.
echo El agente se detuvo. Reintentando en 5 segundos...
timeout /t 5 /nobreak >nul
goto loop
