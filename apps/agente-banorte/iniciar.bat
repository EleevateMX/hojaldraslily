@echo off
REM Agente de Banorte por DLL. Doble clic para dejarlo escuchando en la red local.
REM Antes, una vez: copiar PINPAD.TPV a esta carpeta, copiar .env.example a .env
REM y llenar los datos. Para probar sin servidor: "node index.mjs llave".
cd /d "%~dp0"
if not exist node_modules ( call npm install )
node index.mjs serve
pause
