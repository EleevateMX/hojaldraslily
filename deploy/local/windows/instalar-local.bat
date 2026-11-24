@echo off
REM ============================================================================
REM  Instalador LOCAL de Hojaldras Lily para UNA sola PC Windows.
REM  Deja corriendo: Supabase (Docker) + las apps + Tailscale, en este equipo.
REM  Pide permiso de administrador una vez y corre preparar-windows.ps1.
REM  ASCII puro a proposito (PowerShell 5.1 tuerce los acentos; ver repo).
REM ============================================================================
setlocal

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permiso de administrador...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)

echo.
echo === Instalador local de Hojaldras Lily ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-windows.ps1"

echo.
echo Terminado. Lee los mensajes de arriba por si falta un reinicio o un dato.
pause
