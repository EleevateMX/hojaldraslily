# =============================================================================
#  HOJALDRAS LILY - dejarlo en el arranque de Windows y en el escritorio
# =============================================================================
#  Esto corre SIN permisos de administrador, y no es un descuido: es el
#  motivo por el que existe como archivo aparte.
#
#  El instalador se eleva para poder escribir en C:\ e instalar Node. Pero
#  al elevarse, Windows puede cambiar de usuario, y entonces %APPDATA%
#  apunta al perfil del administrador. El acceso directo del arranque se
#  guardaba ahi: en un perfil que nadie usa. Por eso la PC arrancaba en
#  frio y no abria nada, mientras el instalador decia "[OK] listo".
#
#  Aqui ademas no se usa %APPDATA% ni %USERPROFILE%\Desktop a secas, sino
#  las carpetas que Windows tiene registradas: si el escritorio esta
#  sincronizado con OneDrive, la ruta de siempre no existe.
# =============================================================================

$ErrorActionPreference = 'Continue'
$BASE = 'C:\Hojaldras Lily'
$LANZADOR = Join-Path $BASE 'abrir-hojaldraslily.bat'
$CAJA = Join-Path $BASE 'abrir-caja-y-admin.bat'
$ICONO = Join-Path $BASE 'hojaldraslily.ico'

function Carpeta([string]$nombre, [string]$respaldo) {
  try {
    $r = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop
    $v = $r.$nombre
    if ($v) {
      $v = [Environment]::ExpandEnvironmentVariables($v)
      if (Test-Path $v) { return $v }
    }
  } catch { }
  return $respaldo
}

$INICIO = Carpeta 'Startup' (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
$ESCRITORIO = Carpeta 'Desktop' (Join-Path $env:USERPROFILE 'Desktop')

Write-Host ""
Write-Host ("   Usuario:     " + $env:USERNAME)
Write-Host ("   Arranque:    " + $INICIO)
Write-Host ("   Escritorio:  " + $ESCRITORIO)
Write-Host ""

if (-not (Test-Path $LANZADOR)) {
  Write-Host '   [X] Falta C:\Hojaldras Lily\abrir-hojaldraslily.bat. Corre instalar-todo.bat.'
  exit 1
}

function Crea-Acceso([string]$destino, [string]$apunta, [string]$descripcion) {
  try {
    $w = New-Object -ComObject WScript.Shell
    $a = $w.CreateShortcut($destino)
    $a.TargetPath = $apunta
    $a.WorkingDirectory = $BASE
    $a.Description = $descripcion
    # Minimizado: al prender la PC nadie quiere ver una consola negra en la
    # pantalla que mira el cliente.
    $a.WindowStyle = 7
    if (Test-Path $ICONO) { $a.IconLocation = $ICONO }
    $a.Save()
    Write-Host ("   [OK] " + [IO.Path]::GetFileName($destino))
    return $true
  } catch {
    Write-Host ("   [!] No se pudo crear " + [IO.Path]::GetFileName($destino) + ": " + $_.Exception.Message)
    return $false
  }
}

# Instalaciones viejas copiaban el .bat crudo al arranque. Si se queda, la
# PC abriria dos veces: una por el .bat y otra por el acceso directo.
foreach ($viejo in @('Hojaldras Lily.bat', 'abrir-hojaldraslily.bat')) {
  $ruta = Join-Path $INICIO $viejo
  if (Test-Path $ruta) {
    Remove-Item $ruta -Force -ErrorAction SilentlyContinue
    Write-Host ("   [i] Quitado del arranque el " + $viejo + " viejo.")
  }
}
foreach ($viejo in @('Abrir Hojaldras Lily.bat', 'Abrir Caja y Admin.bat')) {
  $ruta = Join-Path $ESCRITORIO $viejo
  if (Test-Path $ruta) { Remove-Item $ruta -Force -ErrorAction SilentlyContinue }
}

$okArranque = Crea-Acceso (Join-Path $INICIO 'Hojaldras Lily.lnk') $LANZADOR 'Abrir las pantallas de Hojaldras Lily'
[void](Crea-Acceso (Join-Path $ESCRITORIO 'Hojaldras Lily.lnk') $LANZADOR 'Abrir las pantallas de Hojaldras Lily')
if (Test-Path $CAJA) {
  [void](Crea-Acceso (Join-Path $ESCRITORIO 'Caja y Admin.lnk') $CAJA 'Abrir la caja y el panel de administracion')
}

# Segunda red por si el acceso directo del arranque falla o alguien limpia
# esa carpeta con un "optimizador". Cuesta una linea de registro y evita
# que la tienda amanezca cerrada.
try {
  New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
    -Name 'Hojaldras Lily' -Value ('"' + $LANZADOR + '"') -PropertyType String -Force | Out-Null
  Write-Host '   [OK] Registrado tambien en el arranque de Windows (registro).'
} catch {
  if (-not $okArranque) {
    Write-Host '   [!] No quedo en el arranque por ningun camino. Hay que hacerlo a mano:'
    Write-Host '       tecla Windows + R, escribir  shell:startup  y copiar ahi'
    Write-Host '       el acceso directo de C:\Hojaldras Lily\abrir-hojaldraslily.bat'
  }
}

Write-Host ""
exit 0
