# Instalador del AGENTE DE CAJA (tickets ESC/POS) para la PC de la tienda.
#
# Que hace:
#   - Baja el agente ya empaquetado del repo (dist/agente-caja.mjs).
#   - Crea el .env con el token de la impresora y el modo USB (POS-58).
#   - npm install (solo 2 dependencias).
#   - Lo deja arrancando solo al iniciar sesion, y lo abre ahora.
#
# Volver a correrlo ACTUALIZA el agente (vuelve a bajar el .mjs y conserva el
# token). Es la version "instalar o actualizar", como el otro agente.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File instalar-agente-caja.ps1
#   (o con parametros)  -Token "xxx"  -Impresora "POS-58"  -Ancho "58mm"

param(
  [string] $Token = "",
  [string] $Impresora = "POS-58",
  [string] $Ancho = "80mm",
  [int]    $Copias = 2
)

$ErrorActionPreference = "Stop"
$ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6a2RncXF2ZmtvZ214ZGdxc3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MTAxMzgsImV4cCI6MjEwMzI4NjEzOH0.9QiYq8_Ue9egUun6aSNAf3o15AVgg3EzvhHRHHoBhKU"
$BASE = "https://raw.githubusercontent.com/EleevateMX/hojaldraslily/main/apps/agente-caja/dist"

Write-Host ""
Write-Host "=== Agente de caja Hojaldras Lily ==="

# 1) Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Falta Node.js. Instala la version LTS desde https://nodejs.org y vuelve a correr." -ForegroundColor Red
  Read-Host "Enter para salir"; exit 1
}

# 2) Carpeta
$dir = Join-Path $env:LOCALAPPDATA "HojaldrasLily\agente-caja"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 3) Bajar el agente empaquetado
Write-Host "Bajando el agente..."
Invoke-WebRequest -UseBasicParsing "$BASE/agente-caja.mjs" -OutFile (Join-Path $dir "agente-caja.mjs")
Invoke-WebRequest -UseBasicParsing "$BASE/package.json"   -OutFile (Join-Path $dir "package.json")

# 4) Token: parametro, o el que ya estaba (actualizacion), o preguntar
$envFile = Join-Path $dir ".env"
if (-not $Token -and (Test-Path $envFile)) {
  $prev = (Get-Content $envFile | Where-Object { $_ -match '^IMPRESORA_TOKEN=' }) -replace '^IMPRESORA_TOKEN=', ''
  if ($prev) { $Token = $prev.Trim() }
}
if (-not $Token) {
  Write-Host ""
  Write-Host "Da de alta la termica en Admin -> Impresoras (rol: Tickets del cliente)."
  Write-Host "Al guardar, copia el TOKEN que aparece una sola vez."
  $Token = Read-Host "Pega el token de la impresora"
}
if (-not $Token) { Write-Host "Sin token no puede imprimir. Cancelado." -ForegroundColor Red; exit 1 }

# 5) .env
@(
  "SUPABASE_URL=https://fzkdgqqvfkogmxdgqsxj.supabase.co",
  "SUPABASE_ANON_KEY=$ANON",
  "IMPRESORA_TOKEN=$Token",
  "IMPRESORA_WINDOWS=$Impresora",
  "IMPRESORA_ANCHO=$Ancho",
  "TICKET_COPIAS=$Copias",
  "AGENTE_ID=agente-caja-01"
) | Set-Content -Encoding ascii $envFile

# 6) Dependencias (npm.cmd para saltar la politica de PowerShell)
Write-Host "Instalando dependencias..."
Push-Location $dir
cmd /c "npm install --omit=dev" | Out-Null
Pop-Location

# 7) Detener una instancia anterior (actualizacion), para no tener dos agentes
#    peleandose los mismos trabajos.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'agente-caja\.mjs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 8) Lanzador con auto-reinicio y LOG. La salida va a un archivo, no a una
#    ventana: los errores quedan en agente-caja.log y los fallos de impresion
#    ademas se ven en Admin -> Impresoras.
$log = Join-Path $dir "agente-caja.log"
$bat = Join-Path $dir "iniciar-agente-caja.bat"
@(
  "@echo off",
  "cd /d `"$dir`"",
  ":loop",
  "echo ---- %date% %time% arranque ---- >> `"$log`"",
  "node agente-caja.mjs >> `"$log`" 2>&1",
  "timeout /t 5 >nul",
  "goto loop"
) | Set-Content -Encoding ascii $bat

# 9) El .vbs corre el .bat SIN ventana (el 0 = oculto). Esto es lo que hace que
#    el agente quede corriendo invisible, como un servicio, sin dejar consola.
$vbs = Join-Path $dir "iniciar-oculto.vbs"
$runArg = '"""' + $bat + '"""'
@(
  'CreateObject("WScript.Shell").Run ' + $runArg + ', 0, False'
) | Set-Content -Encoding ascii $vbs

# 10) Arranque automatico al iniciar sesion: un acceso directo en Inicio que
#     lanza el .vbs con wscript (sin consola).
$startup = [Environment]::GetFolderPath('Startup')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $startup "Agente Caja Hojaldras Lily.lnk"))
$lnk.TargetPath = "wscript.exe"
$lnk.Arguments = '"' + $vbs + '"'
$lnk.WorkingDirectory = $dir
$lnk.Save()

# 11) Arrancarlo ahora, oculto.
Start-Process "wscript.exe" -ArgumentList ('"' + $vbs + '"')

Write-Host ""
Write-Host "Listo. El agente quedo instalado y CORRIENDO OCULTO (sin ventana) en:" -ForegroundColor Green
Write-Host "  $dir"
Write-Host "Arranca solo al iniciar sesion."
Write-Host "Log (por si hay que revisar): $log"
Write-Host ""
Write-Host "Prueba: Admin -> Impresoras -> Probar, o haz una venta en la caja."
