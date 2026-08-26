# ============================================================================
#  Hojaldras Lily - instalar el agente de impresion en la PC de la sucursal
# ============================================================================
#  Deja las etiquetadoras imprimiendo solas. Baja el agente, lo instala,
#  saca los tokens de las impresoras que ya estan dadas de alta en Admin,
#  arma printers.config.json, prueba que las impresoras respondan y -si
#  todo salio- lo deja corriendo.
#
#  USO (PowerShell COMO ADMINISTRADOR, en la PC de la sucursal):
#
#      powershell -NoProfile -ExecutionPolicy Bypass `
#        -File .\instalar-agente-impresion.ps1 -AnonKey "sb_publishable_..."
#
#  El `-ExecutionPolicy Bypass` no es adorno: Windows bloquea por defecto los
#  .ps1 bajados de internet y contesta "la ejecucion de scripts esta
#  deshabilitada en este sistema". Se salta solo para ese proceso; la
#  configuracion del equipo no se toca. Mas facil todavia:
#  `instalar-agente-impresion.bat`, clic derecho -> ejecutar como
#  administrador (los .bat no tienen esa restriccion).
#
#  La llave sale de Supabase -> Project Settings -> API Keys. Sirven las dos:
#  la nueva (`sb_publishable_...`) y la vieja (`eyJ...`).
#  Es la misma que ya usan las apps y es publica por diseno; aun asi, no la
#  dejes escrita en un chat ni la subas al repositorio.
#
#  Otros parametros (casi nunca hacen falta):
#      -Destino  C:\Hojaldras Lily\agente-impresion   donde instalar
#      -Rama     main                              rama del repo a bajar
#      -SoloProbar                                 no instala nada: solo
#                                                  revisa si las impresoras
#                                                  responden
#
#  Se puede correr las veces que haga falta: reinstala encima sin romper
#  nada. Cada corrida genera tokens nuevos y reescribe la configuracion.
# ============================================================================

param(
  [string] $AnonKey,
  [string] $Destino = 'C:\Hojaldras Lily\agente-impresion',
  [string] $Rama    = 'main',
  [switch] $SoloProbar
)

$ErrorActionPreference = 'Stop'

$SupabaseUrl = 'https://zyjtnaystsporbuzcmqk.supabase.co'
$RepoZip     = "https://codeload.github.com/EleevateMX/ventashake/zip/refs/heads/$Rama"

# Escribir archivos SIN BOM.
#
# `Set-Content -Encoding UTF8` en Windows PowerShell 5.1 -el que trae la PC de
# la sucursal- antepone un BOM. Node lo lee como un caracter mas: `JSON.parse`
# revienta en el primer byte, y en el .env la primera variable se llamaria
# "<BOM>SUPABASE_URL" y saldria un "falta SUPABASE_URL" imposible de
# entender. Esto se comporta igual en 5.1 y en 7.
function Escribir($ruta, $texto) {
  [System.IO.File]::WriteAllText($ruta, $texto, (New-Object System.Text.UTF8Encoding $false))
}

# JSON de un arreglo que sigue siendo arreglo aunque traiga un solo elemento.
#
# `ConvertTo-Json` de 5.1 desenvuelve los arreglos de un elemento y escribe un
# objeto suelto; el parametro que lo evita (-AsArray) solo existe en 7. Con una
# sola impresora configurada, el agente recibiria un objeto donde espera una
# lista y se negaria a arrancar. Se arma a mano y funciona en las dos.
function JsonArreglo($items) {
  $partes = $items | ForEach-Object { ConvertTo-Json -InputObject $_ -Depth 5 }
  return "[" + [Environment]::NewLine + ($partes -join ("," + [Environment]::NewLine)) +
         [Environment]::NewLine + "]" + [Environment]::NewLine
}

function Paso  ($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Bien  ($m) { Write-Host "   OK  $m" -ForegroundColor Green }
function Aviso ($m) { Write-Host "   !   $m" -ForegroundColor Yellow }
function Malo  ($m) { Write-Host "   X   $m" -ForegroundColor Red }

# Get-PnpDevice y compania no hacen falta aqui, pero Node, el registro de
# servicios y las rutas de Windows si: correrlo en otro sistema no falla,
# simplemente no sirve de nada, y eso confunde mas que un error.
if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) {
  Malo 'Este instalador es para la PC Windows de la sucursal.'
  Write-Host '    Las impresoras solo las ve el equipo que las tiene en su red.'
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Responden las impresoras?
# ---------------------------------------------------------------------------
# Se pregunta ANTES de instalar nada. Si la red no esta, instalar el agente
# no arregla nada y encima deja la duda de si el problema es el software.
function Probar-Impresora($ip, $puerto) {
  $cliente = New-Object System.Net.Sockets.TcpClient
  try {
    $tarea = $cliente.ConnectAsync($ip, $puerto)
    if ($tarea.Wait(4000) -and $cliente.Connected) { return $true }
    return $false
  } catch {
    return $false
  } finally {
    $cliente.Dispose()
  }
}

# ---------------------------------------------------------------------------
# 2. Las impresoras que ya estan dadas de alta en Admin
# ---------------------------------------------------------------------------
# Supabase tiene dos formatos de llave publica y NO se mandan igual:
#
#   - La vieja (`eyJ...`) es un JWT y viaja en `apikey` y en `Authorization`.
#   - La nueva (`sb_publishable_...`) es un token opaco. Metida en
#     `Authorization: Bearer`, el servidor intenta leerla como JWT y responde
#     401 "invalid JWT" - un error que apunta a la llave estando la llave
#     bien, que es de los peores ratos que se pueden hacer pasar a alguien.
#
# Se manda siempre `apikey`, y `Authorization` solo cuando de verdad es JWT.
function Cabeceras($anonKey) {
  $h = @{ apikey = $anonKey }
  if ($anonKey.StartsWith('eyJ')) { $h['Authorization'] = "Bearer $anonKey" }
  return $h
}

function Obtener-Impresoras($anonKey) {
  $r = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_admin_impresoras" `
    -Headers (Cabeceras $anonKey) -ContentType 'application/json' -Body '{}'
  return @($r)
}

# El token no se puede leer: no viaja nunca en la lista. "Obtenerlo" es
# generar uno nuevo, y el anterior deja de servir - por eso este instalador
# reescribe siempre la configuracion completa en vez de conservar la vieja.
function Obtener-Token($anonKey, $id) {
  return Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_rotar_token_impresora" `
    -Headers (Cabeceras $anonKey) -ContentType 'application/json' `
    -Body (@{ p_id = $id } | ConvertTo-Json)
}

Write-Host ''
Write-Host '  HOJALDRAS LILY - agente de impresion' -ForegroundColor White
Write-Host '  ---------------------------------'

if (-not $AnonKey) {
  Malo 'Falta -AnonKey.'
  Write-Host '    Supabase -> Project Settings -> API Keys (sb_publishable_... o eyJ...).'
  Write-Host '    Ejemplo:  .\instalar-agente-impresion.ps1 -AnonKey "eyJhbGci..."'
  exit 1
}

Paso 'Consultando las impresoras dadas de alta'
try {
  $impresoras = Obtener-Impresoras $AnonKey | Where-Object { $_.activa }
} catch {
  Malo "No se pudo hablar con Supabase: $($_.Exception.Message)"
  Write-Host '    Revisa la anon key y que este equipo tenga internet.'
  exit 1
}
if ($impresoras.Count -eq 0) {
  Malo 'No hay impresoras activas dadas de alta.'
  Write-Host '    Admin -> Impresoras -> Nueva impresora.'
  exit 1
}
Bien "$($impresoras.Count) impresoras: $(($impresoras | ForEach-Object { $_.nombre }) -join ', ')"

Paso 'Probando que respondan'
$vivas = @()
foreach ($imp in $impresoras) {
  if ($imp.tipo_conexion -ne 'red') {
    Aviso "$($imp.nombre): es USB, no se puede probar por red (se configura igual)"
    $vivas += $imp
    continue
  }
  $puerto = if ($imp.puerto) { [int]$imp.puerto } else { 9100 }
  if (Probar-Impresora $imp.ip $puerto) {
    Bien "$($imp.nombre) - $($imp.ip):$puerto responde"
    $vivas += $imp
  } else {
    Malo "$($imp.nombre) - $($imp.ip):$puerto NO responde"
    Write-Host '        Revisa: encendida, cable de red, la IP correcta, y la tapa bien cerrada.'
  }
}

if ($SoloProbar) {
  Write-Host ''
  Write-Host '  (-SoloProbar: no se instalo nada)' -ForegroundColor DarkGray
  exit 0
}

if ($vivas.Count -eq 0) {
  Malo 'Ninguna impresora responde. No tiene caso instalar el agente todavia.'
  Write-Host '    Arregla la red primero y vuelve a correr esto.'
  exit 1
}

# ---------------------------------------------------------------------------
# 3. Node
# ---------------------------------------------------------------------------
Paso 'Revisando Node.js'
$node = Get-Command node -EA SilentlyContinue
$versionOk = $false
if ($node) {
  $v = (& node --version) -replace '^v', ''
  $versionOk = [int]($v.Split('.')[0]) -ge 20
  if ($versionOk) { Bien "Node $v" } else { Aviso "Node $v es viejo, hace falta 20 o mas" }
}
if (-not $versionOk) {
  if (Get-Command winget -EA SilentlyContinue) {
    Aviso 'Instalando Node.js 22 con winget (tarda un par de minutos)...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Get-Command node -EA SilentlyContinue)) {
      Malo 'Node quedo instalado pero esta ventana no lo ve.'
      Write-Host '    Cierra PowerShell, abrelo de nuevo como administrador y repite el comando.'
      exit 1
    }
    Bien "Node $((& node --version))"
  } else {
    Malo 'No hay Node 20+ ni winget para instalarlo.'
    Write-Host '    Bajalo de https://nodejs.org (version LTS) y vuelve a correr esto.'
    exit 1
  }
}

# ---------------------------------------------------------------------------
# 3.5 Detener el agente anterior, si esta corriendo
# ---------------------------------------------------------------------------
# Si no se detiene, el proceso viejo sigue vivo con el codigo viejo: la
# instalacion "funciona" pero las etiquetas salen como antes. Solo se tocan
# los procesos que corren DESDE la carpeta del agente, no cualquier node.
Paso 'Buscando un agente anterior corriendo'
$viejos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -EA SilentlyContinue |
          Where-Object { $_.CommandLine -like "*$Destino*" }
$ventanas = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -EA SilentlyContinue |
            Where-Object { $_.CommandLine -like '*arrancar-agente*' }
if ($viejos -or $ventanas) {
  # @($null) mete un elemento nulo al concatenar; sin el filtro,
  # Stop-Process -Id $null truena aunque lleve -EA SilentlyContinue.
  foreach ($p in (@($viejos) + @($ventanas) | Where-Object { $_ })) {
    Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue
  }
  Start-Sleep -Seconds 2
  Bien 'detenido - al final se arranca solo con la version nueva'
} else {
  Bien 'no habia ninguno'
}

# ---------------------------------------------------------------------------
# 4. Bajar el agente
# ---------------------------------------------------------------------------
Paso "Bajando el agente ($Rama)"
$temporal = Join-Path $env:TEMP "shake-agente-$(Get-Random)"
New-Item -ItemType Directory -Path $temporal -Force | Out-Null
$zip = Join-Path $temporal 'repo.zip'
try {
  Invoke-WebRequest -Uri $RepoZip -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $temporal -Force
} catch {
  Malo "No se pudo bajar: $($_.Exception.Message)"
  exit 1
}
$origen = Get-ChildItem -Path $temporal -Directory |
          ForEach-Object { Join-Path $_.FullName 'agente-impresion' } |
          Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $origen) {
  Malo 'El zip no traia la carpeta agente-impresion.'
  exit 1
}

# El codigo se reemplaza entero, pero la configuracion NO se toca aqui: se
# reescribe mas abajo con tokens frescos. Si esto se llevara la carpeta
# completa, una reinstalacion borraria los logs sin avisar.
New-Item -ItemType Directory -Path $Destino -Force | Out-Null
Copy-Item -Path (Join-Path $origen '*') -Destination $Destino -Recurse -Force `
  -Exclude 'node_modules', 'logs', 'printers.config.json', '.env'
Remove-Item $temporal -Recurse -Force -EA SilentlyContinue
Bien $Destino

# ---------------------------------------------------------------------------
# 5. Dependencias
# ---------------------------------------------------------------------------
Paso 'Instalando dependencias (esto tarda)'
Push-Location $Destino
try {
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install devolvio $LASTEXITCODE" }
  Bien 'listo'
} catch {
  Pop-Location
  Malo "Fallo npm install: $($_.Exception.Message)"
  exit 1
}

# ---------------------------------------------------------------------------
# 6. Configuracion
# ---------------------------------------------------------------------------
Paso 'Generando la configuracion'

$env_txt = @"
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$AnonKey
AGENTE_ID=$($env:COMPUTERNAME)
POLL_INTERVALO_SEGUNDOS=10
LATIDO_INTERVALO_SEGUNDOS=30
STATUS_HTTP_PUERTO=7777
"@
Escribir (Join-Path $Destino '.env') $env_txt

$config = @()
foreach ($imp in $vivas) {
  $token = Obtener-Token $AnonKey $imp.id
  $esRed = $imp.tipo_conexion -eq 'red'
  $config += [ordered]@{
    id          = ($imp.nombre.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
    descripcion = $imp.nombre
    token       = "$token"
    interface   = if ($esRed) { "tcp://$($imp.ip):$(if ($imp.puerto) { $imp.puerto } else { 9100 })" }
                  else { "printer:$($imp.nombre_dispositivo)" }
    # Las etiquetadoras de red de esta sucursal son TSPL. Mandarles ESC/POS
    # no da error: se tragan los datos y no imprimen, y la comanda se pierde
    # con la cola en verde. Por eso se escribe explicito.
    lenguaje    = if ($esRed) { 'tspl' } else { 'escpos' }
    anchoPapel  = if ($imp.ancho_papel) { "$($imp.ancho_papel)" } else { '80mm' }
    copias      = if ($imp.copias) { [int]$imp.copias } else { 1 }
    corteAutomatico = [bool]$imp.corte_automatico
    buzzer          = [bool]$imp.buzzer
  }
  Bien "$($imp.nombre) configurada"
}
Escribir (Join-Path $Destino 'printers.config.json') (JsonArreglo $config)

# ---------------------------------------------------------------------------
# 7. Etiqueta de prueba
# ---------------------------------------------------------------------------
Paso 'Imprimiendo una etiqueta de prueba en cada impresora'
foreach ($c in $config) {
  & npm run test-print --silent -- $c.id
  if ($LASTEXITCODE -eq 0) { Bien "$($c.descripcion): salio la etiqueta" }
  else { Malo "$($c.descripcion): no imprimio (ver el mensaje de arriba)" }
}
Pop-Location

# ---------------------------------------------------------------------------
# 8. Dejarlo corriendo
# ---------------------------------------------------------------------------
Paso 'Acceso directo para arrancarlo'
$bat = Join-Path $Destino 'arrancar-agente.bat'
$bat_txt = @"
@echo off
title Hojaldras Lily - agente de impresion
cd /d "$Destino"
npm start
pause
"@
[System.IO.File]::WriteAllText($bat, $bat_txt, [System.Text.Encoding]::ASCII)

$escritorio = [Environment]::GetFolderPath('Desktop')
Copy-Item $bat (Join-Path $escritorio 'Agente de impresion.bat') -Force -EA SilentlyContinue
Bien 'Agente de impresion.bat en el escritorio'

# Que arranque solo despues de un corte de luz: el local abre y las comandas
# tienen que salir sin que nadie se acuerde de esto.
$inicio = [Environment]::GetFolderPath('Startup')
Copy-Item $bat (Join-Path $inicio 'Agente de impresion.bat') -Force -EA SilentlyContinue
Bien 'y arranca solo al prender la PC'

# Arrancarlo aqui mismo: instalar y que quede corriendo es UN solo boton.
# Sale en su propia ventana para que en el local se vea que esta vivo.
Paso 'Arrancando el agente'
Start-Process -FilePath $bat
Bien 'corriendo en su propia ventana'

Write-Host ''
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Instalado en: $Destino"
Write-Host ''
Write-Host '  El agente ya quedo corriendo en su propia ventana.'
Write-Host '  Dejala abierta todo el horario del local - si se cierra, no salen comandas.'
Write-Host ''
Write-Host '  En Admin -> Impresoras las dos deben verse "En linea" en menos de un minuto.'
Write-Host ''
