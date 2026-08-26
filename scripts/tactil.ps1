# ============================================================================
#  Hojaldras Lily - diagnostico e intervencion del tactil multi-pantalla
# ============================================================================
#  El problema que resuelve: con dos paneles tactiles IDENTICOS (mismo EDID y
#  mismo VID/PID de digitalizador), Windows no puede guardar a cual pantalla
#  corresponde cada tactil, y la calibracion de "Configuracion de Tablet PC"
#  se colapsa en un solo monitor.
#
#  La tecnica es calibrar de uno en uno: si solo hay un digitalizador
#  ambiguo activo, Windows no tiene con que confundirse. En vez de
#  desconectar el cable USB detras del monitor, aqui se desactiva por
#  software - es equivalente y se revierte con un comando.
#
#  USO (PowerShell COMO ADMINISTRADOR):
#     .\tactil.ps1                 Analiza y no cambia nada
#     .\tactil.ps1 -Apagar 2       Desactiva el digitalizador #2 de la lista
#     .\tactil.ps1 -Encender 2     Lo vuelve a activar
#     .\tactil.ps1 -Restaurar      Reactiva TODOS (deshacer)
#
#  Nada de esto es permanente: -Restaurar deja el equipo como estaba.
# ============================================================================

param(
  [int]    $Apagar,
  [int]    $Encender,
  [switch] $Restaurar
)

$ErrorActionPreference = 'Continue'

# Get-PnpDevice y Get-CimInstance solo existen en Windows: son la puerta al
# hardware y al registro. Corrido en otro sistema, el script no fallaba - solo
# vomitaba errores rojos y decia "(ninguno)", que se lee como "no tienes
# tactiles" en vez de "esto no se puede correr aqui". Se corta antes.
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) {
  Write-Host "Este script solo funciona en Windows." -ForegroundColor Yellow
  Write-Host "Los tactiles y los monitores solo los ve la maquina que los tiene conectados:"
  Write-Host "correlo en la PC de la sucursal, no en otro equipo."
  exit 1
}
if (-not (Get-Command Get-PnpDevice -EA SilentlyContinue)) {
  Write-Host "Falta Get-PnpDevice: se necesita Windows 8 o superior." -ForegroundColor Yellow
  exit 1
}

function EsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltinRole]::Administrator)
}

# Los digitalizadores, siempre en el mismo orden, para que los numeros que
# imprime el analisis sigan siendo validos al pasar -Apagar / -Encender.
function Digitalizadores {
  Get-PnpDevice -Class HIDClass -EA SilentlyContinue |
    Where-Object { $_.FriendlyName -match 'tacti|touch|digitizer' } |
    Sort-Object InstanceId
}

# --------------------------------------------------------------------------
# Acciones
# --------------------------------------------------------------------------
if ($Restaurar -or $PSBoundParameters.ContainsKey('Apagar') -or $PSBoundParameters.ContainsKey('Encender')) {
  if (-not (EsAdmin)) {
    Write-Host "Esto necesita PowerShell abierto COMO ADMINISTRADOR." -ForegroundColor Red
    Write-Host "Cierra esta ventana, busca PowerShell, clic derecho -> Ejecutar como administrador."
    exit 1
  }

  $lista = @(Digitalizadores)

  if ($Restaurar) {
    foreach ($d in $lista) {
      Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -EA SilentlyContinue
      "Reactivado: $($d.InstanceId)"
    }
    "`nTodos los tactiles quedaron activos."
    exit 0
  }

  $n = if ($PSBoundParameters.ContainsKey('Apagar')) { $Apagar } else { $Encender }
  if ($n -lt 1 -or $n -gt $lista.Count) {
    Write-Host "No existe el digitalizador #$n. Corre .\tactil.ps1 sin parametros para ver la lista." -ForegroundColor Red
    exit 1
  }
  $d = $lista[$n - 1]

  if ($PSBoundParameters.ContainsKey('Apagar')) {
    Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false
    "Desactivado #$n : $($d.InstanceId)"
    "`nAhora abre:  control /name Microsoft.TabletPCSettings"
    "  Pantalla -> Configurar... -> Entrada tactil"
    "y asocia la pantalla que SI quedo activa."
    "Cuando termines:  .\tactil.ps1 -Encender $n"
  } else {
    Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false
    "Reactivado #$n : $($d.InstanceId)"
  }
  exit 0
}

# --------------------------------------------------------------------------
# Analisis (solo lectura)
# --------------------------------------------------------------------------
"=== DIGITALIZADORES TACTILES ==="
$i = 0
foreach ($d in Digitalizadores) {
  $i++
  $padre = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_Parent' -EA SilentlyContinue).Data
  "#{0}  [{1}]  {2}" -f $i, $d.Status, $d.FriendlyName
  "     id    : $($d.InstanceId)"
  "     padre : $padre"
}
if ($i -eq 0) { "(ninguno)" }

"`n=== MONITORES ==="
Get-CimInstance -Namespace root\wmi WmiMonitorID -EA SilentlyContinue | ForEach-Object {
  $nom = ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
  $fab = ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join ''
  "{0,-12} fabricante {1,-6} -> {2}" -f $nom, $fab, $_.InstanceName
}

# Dos monitores con el MISMO identificador es exactamente lo que impide que
# Windows recuerde la asociacion. Se detecta y se dice, en vez de que el
# usuario lo deduzca.
$ids = @(Get-CimInstance -Namespace root\wmi WmiMonitorID -EA SilentlyContinue |
         ForEach-Object { ($_.InstanceName -split '\\')[1] })
$repetidos = $ids | Group-Object | Where-Object { $_.Count -gt 1 }
if ($repetidos) {
  "`n*** OJO: hay monitores que se identifican IGUAL ante Windows:"
  foreach ($r in $repetidos) { "    {0}  (x{1})" -f $r.Name, $r.Count }
  "    Por eso la calibracion no se queda guardada."
}

"`n=== MAPEO TACTIL GUARDADO EN EL REGISTRO ==="
# No se inventa la ruta: se buscan las que Windows usa para esto y se
# reporta lo que realmente exista en ESTE equipo.
$rutas = @(
  'HKCU:\Software\Microsoft\Wisp\Pen\Digimon',
  'HKLM:\SOFTWARE\Microsoft\Wisp\Pen\Digimon',
  'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Configuration'
)
foreach ($r in $rutas) {
  if (Test-Path $r) {
    "--- $r"
    Get-ChildItem $r -Recurse -EA SilentlyContinue | Select-Object -First 20 | ForEach-Object {
      "    $($_.Name)"
    }
  } else {
    "--- $r  (no existe)"
  }
}

"`n=== QUE SIGUE ==="
"1. Corre como administrador:  .\tactil.ps1 -Apagar 2"
"2. Calibra la pantalla que quedo activa."
"3. Vuelve con:                .\tactil.ps1 -Encender 2"
"4. Calibra la otra."
"Para deshacer todo:           .\tactil.ps1 -Restaurar"
