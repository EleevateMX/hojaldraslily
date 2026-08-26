# ============================================================================
#  Escaneo del equipo - Hojaldras Lily POS  (Windows)
# ============================================================================
#  Recolecta lo necesario para saber que hardware tiene esta maquina y que le
#  falta para operar: impresoras, lectores USB, red y Node.js.
#
#  Es de SOLO LECTURA: no instala, no configura y no cambia nada. Al terminar
#  deja un archivo de texto en el Escritorio para copiar y pegar.
#
#  Como correrlo: clic derecho en el archivo -> "Ejecutar con PowerShell".
#  Si Windows bloquea el script, abre PowerShell y pega:
#      Set-ExecutionPolicy -Scope Process Bypass -Force; .\escanear-equipo.ps1
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'
$salida = @()
function Seccion($t) { $script:salida += ""; $script:salida += "=== $t ==="; }
function Linea($t)   { $script:salida += $t; }

Seccion "EQUIPO"
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
Linea "Nombre      : $($env:COMPUTERNAME)"
Linea "Sistema     : $($os.Caption) $($os.OSArchitecture) build $($os.BuildNumber)"
Linea "Equipo      : $($cs.Manufacturer) $($cs.Model)"
Linea "RAM         : $([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB"

Seccion "RED"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' } |
  ForEach-Object { Linea "IP          : $($_.IPAddress)/$($_.PrefixLength)  ($($_.InterfaceAlias))" }
Get-NetRoute -DestinationPrefix '0.0.0.0/0' |
  ForEach-Object { Linea "Gateway     : $($_.NextHop)" }

# Sin salida a internet no hay sistema: todo habla con Supabase.
$sb = Test-NetConnection -ComputerName 'zyjtnaystsporbuzcmqk.supabase.co' -Port 443 -WarningAction SilentlyContinue
Linea "Supabase    : $(if ($sb.TcpTestSucceeded) { 'ALCANZABLE' } else { 'NO ALCANZABLE - revisar internet/firewall' })"

Seccion "IMPRESORAS INSTALADAS EN WINDOWS"
$imp = Get-Printer
if ($imp) {
  foreach ($p in $imp) {
    Linea "- $($p.Name)"
    Linea "    driver=$($p.DriverName)  puerto=$($p.PortName)  tipo=$($p.Type)  compartida=$($p.Shared)"
  }
} else { Linea "(ninguna)" }

Seccion "PUERTOS DE IMPRESORA"
Get-PrinterPort | ForEach-Object {
  $ip = if ($_.PrinterHostAddress) { "  host=$($_.PrinterHostAddress):$($_.PortNumber)" } else { "" }
  Linea "- $($_.Name)$ip"
}

Seccion "DISPOSITIVOS USB CONECTADOS"
# Aqui aparecen la impresora termica, el lector de QR y el cajon de dinero.
Get-PnpDevice -PresentOnly |
  Where-Object { $_.InstanceId -like 'USB*' -and $_.Status -eq 'OK' } |
  Sort-Object Class, FriendlyName |
  ForEach-Object { Linea "- [$($_.Class)] $($_.FriendlyName)" }

Seccion "PUERTOS SERIE / COM"
$serie = Get-CimInstance Win32_SerialPort
if ($serie) { $serie | ForEach-Object { Linea "- $($_.DeviceID)  $($_.Name)" } }
else        { Linea "(ninguno)" }

Seccion "NODE.JS (lo necesita el agente de impresion)"
# Se pregunta por el comando antes de invocarlo: si no esta instalado, llamarlo
# a secas ensucia la salida con un error rojo que no aporta nada.
$node = if (Get-Command node -ErrorAction SilentlyContinue) { & node --version } else { $null }
Linea "node        : $(if ($node) { $node } else { 'NO INSTALADO - descargar Node.js 20+ de nodejs.org' })"
$npm  = if (Get-Command npm  -ErrorAction SilentlyContinue) { & npm --version }  else { $null }
Linea "npm         : $(if ($npm) { $npm } else { 'NO INSTALADO' })"

Seccion "NAVEGADOR"
foreach ($ruta in @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)) { if (Test-Path $ruta) { Linea "- $ruta" } }

Seccion "IMPRESORAS DE RED EN LA LAN (puerto 9100)"
# Las termicas de red escuchan en el 9100. Se barre solo TU subred local.
$mi = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress
if ($mi) {
  $base = $mi -replace '\.\d+$', ''
  Linea "Barriendo $base.1-254 en el puerto 9100 (tarda ~30 s)..."
  $encontradas = @()
  1..254 | ForEach-Object {
    $ip = "$base.$_"
    $t = New-Object System.Net.Sockets.TcpClient
    # Wait() devuelve true en cuanto la tarea TERMINA - incluso si termino
    # rechazada. Hay que confirmar ademas que la conexion quedo abierta, si no
    # se reportan como impresoras todos los equipos que rechazan el puerto.
    if ($t.ConnectAsync($ip, 9100).Wait(200) -and $t.Connected) { $encontradas += $ip }
    $t.Close()
  }
  if ($encontradas) { $encontradas | ForEach-Object { Linea "- $_ :9100" } }
  else { Linea "(ninguna - si tu impresora es USB esto es normal)" }
}

$texto = $salida -join "`r`n"
$destino = Join-Path ([Environment]::GetFolderPath('Desktop')) 'hojaldraslily-escaneo.txt'
$texto | Out-File -FilePath $destino -Encoding utf8
Write-Host $texto
Write-Host ""
Write-Host "-----------------------------------------------------------"
Write-Host "Guardado en: $destino"
Write-Host "Copia TODO ese archivo y pegamelo en el chat."
Write-Host "-----------------------------------------------------------"
