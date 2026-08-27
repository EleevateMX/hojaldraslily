# =============================================================================
#  HOJALDRAS LILY - abrir las tres pantallas, cada una en su monitor
# =============================================================================
#  Antes esto vivia dentro del .bat con las coordenadas de los monitores
#  escritas a mano (0,0 / 1080,150 / 1848,139). Dos cosas lo rompieron:
#
#   1. El kiosko dejo de ir en el monitor vertical y paso a la Sony. Las
#      coordenadas escritas a mano ya no correspondian a nada, asi que el
#      kiosko aterrizaba en la pantalla de produccion.
#   2. Chrome guarda en el perfil la ultima posicion de la ventana. Si
#      alguien la movio una vez, --window-position se ignora y vuelve al
#      lugar equivocado para siempre.
#
#  Por eso aqui no se adivina nada: se le pregunta a Windows donde estan los
#  monitores, se reparte por TAMANO (el grande es del cliente, los dos
#  chicos son las estaciones) y despues se EMPUJA cada ventana a su sitio
#  con la API de Windows, que Chrome no puede ignorar.
#
#  Si algun dia el reparto automatico se equivoca, se corrige sin tocar
#  codigo: C:\Hojaldras Lily\pantallas.txt con estas tres lineas, donde el
#  numero es la posicion del monitor de izquierda a derecha (1 = el de mas
#  a la izquierda). El log de cada arranque dice que numero le toco a cada
#  monitor.
#
#      kiosko=1
#      produccion=2
#      almacen=3
# =============================================================================

param(
  [switch]$SinSplash,
  [int]$EsperaRedSegundos = 120
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
Add-Type -AssemblyName Microsoft.VisualBasic | Out-Null

$BASE = 'C:\Hojaldras Lily'
if (-not (Test-Path $BASE)) { New-Item -ItemType Directory -Path $BASE -Force | Out-Null }
$LOG = Join-Path $BASE 'ultimo-arranque.log'
"" | Set-Content -Path $LOG -Encoding ASCII

function Apunta([string]$texto) {
  $linea = "{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $texto
  Write-Host "   $texto"
  Add-Content -Path $LOG -Value $linea -Encoding ASCII
}

# -----------------------------------------------------------------------------
#  Mover ventanas: lo unico que Chrome no puede desobedecer
# -----------------------------------------------------------------------------
if (-not ('ShakeVentanas' -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ShakeVentanas {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr tras, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

$SWP_MOSTRAR = 0x0040   # SWP_SHOWWINDOW
$SW_RESTAURAR = 9

# -----------------------------------------------------------------------------
#  1. El navegador
# -----------------------------------------------------------------------------
$NAV = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $NAV) {
  Apunta '[X] No hay Chrome ni Edge en esta PC. Instala Google Chrome.'
  exit 1
}
Apunta ("Navegador: " + [IO.Path]::GetFileName($NAV))

# -----------------------------------------------------------------------------
#  2. Las tres apps
# -----------------------------------------------------------------------------
$APPS = @(
  [pscustomobject]@{ clave = 'produccion'; titulo = 'Produccion'; url = 'https://produccion.hojaldraslily.com'; perfil = 'lily-produccion' }
  [pscustomobject]@{ clave = 'almacen';    titulo = 'Almacen';    url = 'https://almacen.hojaldraslily.com';    perfil = 'lily-almacen'    }
  [pscustomobject]@{ clave = 'kiosko';     titulo = 'Kiosko';     url = 'https://kiosko.hojaldraslily.com';     perfil = 'lily-kiosko'     }
)
# El kiosko va al FINAL a proposito: es la ventana que debe quedar al frente
# cuando termine todo, con el PIN listo para que el cajero entre.

# -----------------------------------------------------------------------------
#  3. Repartir los monitores
# -----------------------------------------------------------------------------
function Reparte-Monitores {
  $pantallas = @([System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.Bounds.X })

  for ($i = 0; $i -lt $pantallas.Count; $i++) {
    $b = $pantallas[$i].Bounds
    Apunta ("Monitor {0}: {1}x{2} en ({3},{4}){5}" -f ($i + 1), $b.Width, $b.Height, $b.X, $b.Y,
            $(if ($pantallas[$i].Primary) { ' [principal]' } else { '' }))
  }

  try {
    $nombres = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {
      if ($_.UserFriendlyName) { -join ($_.UserFriendlyName | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ }) }
    } | Where-Object { $_ })
    if ($nombres) { Apunta ('Monitores conectados: ' + ($nombres -join ', ')) }
  } catch { }

  $mapa = @{}

  # Regla: la pantalla del cliente es la GRANDE. Las estaciones son los dos
  # tactiles chicos, y se reparten como estan puestos fisicamente: produccion
  # a la izquierda, almacen a la derecha.
  if ($pantallas.Count -ge 3) {
    $grande = $pantallas | Sort-Object { - ($_.Bounds.Width * $_.Bounds.Height) } | Select-Object -First 1
    # Las estaciones son los dos tactiles CHICOS, no "los dos siguientes":
    # si algun dia se cuelga un cuarto monitor, esto sigue acertando.
    $chicos = @($pantallas |
      Where-Object { $_.DeviceName -ne $grande.DeviceName } |
      Sort-Object { $_.Bounds.Width * $_.Bounds.Height } |
      Select-Object -First 2 |
      Sort-Object { $_.Bounds.X })
    $mapa['kiosko']  = $grande
    $mapa['produccion'] = $chicos[0]
    $mapa['almacen']  = $chicos[1]
  }
  elseif ($pantallas.Count -eq 2) {
    Apunta '[!] Solo hay 2 monitores: produccion y almacen van a compartir el segundo.'
    $grande = $pantallas | Sort-Object { - ($_.Bounds.Width * $_.Bounds.Height) } | Select-Object -First 1
    $otro   = @($pantallas | Where-Object { $_.DeviceName -ne $grande.DeviceName })[0]
    $mapa['kiosko'] = $grande; $mapa['produccion'] = $otro; $mapa['almacen'] = $otro
  }
  else {
    Apunta '[!] Solo hay 1 monitor: las tres ventanas van encima (alt+tab para cambiar).'
    $mapa['kiosko'] = $pantallas[0]; $mapa['produccion'] = $pantallas[0]; $mapa['almacen'] = $pantallas[0]
  }

  # La salida de emergencia: si el reparto automatico se equivoca, este
  # archivo manda. Vale mas un archivo de texto que una llamada a soporte.
  $cfg = Join-Path $BASE 'pantallas.txt'
  if (Test-Path $cfg) {
    Apunta 'Hay pantallas.txt: se respeta lo que diga ese archivo.'
    foreach ($linea in (Get-Content $cfg)) {
      if ($linea -match '^\s*(kiosko|produccion|almacen)\s*=\s*(\d+)\s*$') {
        $clave = $Matches[1]; $n = [int]$Matches[2]
        if ($n -ge 1 -and $n -le $pantallas.Count) {
          $mapa[$clave] = $pantallas[$n - 1]
          Apunta ("  {0} -> monitor {1}" -f $clave, $n)
        } else {
          Apunta ("  [!] {0}={1} no existe: hay {2} monitores." -f $clave, $n, $pantallas.Count)
        }
      }
    }
  }

  return $mapa
}

# -----------------------------------------------------------------------------
#  4. El splash: que la pantalla del cliente diga Hojaldras Lily mientras carga
# -----------------------------------------------------------------------------
$splash = $null
$splashTexto = $null

function Abre-Splash($limites) {
  if ($SinSplash) { return }
  try {
    $f = New-Object System.Windows.Forms.Form
    $f.FormBorderStyle = 'None'
    $f.StartPosition = 'Manual'
    $f.Bounds = $limites
    # El verde del badge del logo, no el verde de marca: el PNG trae su
    # propio fondo, y si no coinciden se ve un rectangulo pegado encima.
    $f.BackColor = [System.Drawing.Color]::FromArgb(26, 58, 45)
    $f.TopMost = $true

    $logo = Join-Path $BASE 'hojaldraslily-logo.png'
    if (Test-Path $logo) {
      $img = New-Object System.Windows.Forms.PictureBox
      $img.Image = [System.Drawing.Image]::FromFile($logo)
      $img.SizeMode = 'Zoom'
      $img.BackColor = [System.Drawing.Color]::Transparent
      $lado = [int]([Math]::Min($limites.Width, $limites.Height) * 0.62)
      $img.Bounds = New-Object System.Drawing.Rectangle(
        [int](($limites.Width - $lado) / 2), [int](($limites.Height - $lado) / 2 - $limites.Height * 0.05), $lado, $lado)
      $f.Controls.Add($img)
    }

    $t = New-Object System.Windows.Forms.Label
    $t.Text = 'Abriendo...'
    $t.ForeColor = [System.Drawing.Color]::FromArgb(232, 230, 204)
    $t.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Regular)
    $t.TextAlign = 'MiddleCenter'
    $t.Bounds = New-Object System.Drawing.Rectangle(0, [int]($limites.Height * 0.80), $limites.Width, 60)
    $f.Controls.Add($t)

    $f.Show()
    $f.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
    $script:splash = $f
    $script:splashTexto = $t
  } catch {
    Apunta ('[i] Sin splash: ' + $_.Exception.Message)
  }
}

function Di-Splash([string]$texto) {
  if ($null -eq $script:splashTexto) { return }
  try {
    $script:splashTexto.Text = $texto
    $script:splashTexto.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
  } catch { }
}

function Suelta-Splash {
  if ($null -eq $script:splash) { return }
  try {
    $script:splash.TopMost = $false
    [System.Windows.Forms.Application]::DoEvents()
  } catch { }
}

function Cierra-Splash {
  if ($null -eq $script:splash) { return }
  try { $script:splash.Close(); $script:splash.Dispose() } catch { }
  $script:splash = $null
  $script:splashTexto = $null
}

# -----------------------------------------------------------------------------
#  5. Esperar a que haya internet
# -----------------------------------------------------------------------------
#  Al prender la PC, Windows arranca los programas del inicio ANTES de que
#  el wifi este conectado. Chrome abria en "sin conexion" y ahi se quedaba:
#  la pantalla mostraba el dinosaurio hasta que alguien la recargaba a mano.
function Espera-Red([int]$segundos) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  } catch { }
  $fin = (Get-Date).AddSeconds($segundos)
  $intento = 0
  while ((Get-Date) -lt $fin) {
    $intento++
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 6 -Uri 'https://kiosko.hojaldraslily.com/'
      if ($r.StatusCode -eq 200) {
        Apunta ("Internet listo (intento $intento).")
        return $true
      }
    } catch { }
    Di-Splash 'Conectando...'
    Start-Sleep -Seconds 3
  }
  Apunta '[!] No hubo internet en el tiempo de espera. Se abre igual.'
  return $false
}

# -----------------------------------------------------------------------------
#  6. Abrir una app en su monitor
# -----------------------------------------------------------------------------
function Abre-App($app, $pantalla) {
  $b = $pantalla.Bounds
  $perfil = Join-Path $env:LOCALAPPDATA $app.perfil

  $argumentos = @(
    ('--app=' + $app.url),
    ('--user-data-dir=' + $perfil),
    ('--window-position=' + $b.X + ',' + $b.Y),
    ('--window-size=' + $b.Width + ',' + $b.Height),
    '--noerrdialogs',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-features=TranslateUI'
  )

  $p = Start-Process -FilePath $NAV -ArgumentList $argumentos -PassThru
  if (-not $p) { Apunta ('[X] No arranco ' + $app.titulo); return }

  # Esperar a que exista la ventana: mover una ventana que todavia no nacio
  # no hace nada, y ese era justo el fallo silencioso de antes.
  $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 400
    try { $p.Refresh() } catch { break }
    if ($p.HasExited) { break }
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break }
  }

  # Chrome a veces se relanza a si mismo y el proceso que arrancamos muere.
  # En ese caso la ventana existe, pero cuelga de otro PID: se busca por el
  # perfil, que es unico para cada pantalla.
  if ($h -eq [IntPtr]::Zero) {
    try {
      $otro = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction Stop |
              Where-Object { $_.CommandLine -like ('*' + $app.perfil + '*') }
      foreach ($o in $otro) {
        $q = Get-Process -Id $o.ProcessId -ErrorAction SilentlyContinue
        if ($q -and $q.MainWindowHandle -ne [IntPtr]::Zero) { $h = $q.MainWindowHandle; $p = $q; break }
      }
    } catch { }
  }

  if ($h -eq [IntPtr]::Zero) {
    Apunta ('[!] ' + $app.titulo + ': no encontre su ventana para acomodarla.')
    return
  }

  # El empujon: aunque Chrome hubiera recordado otra posicion, aqui se va a
  # donde le toca.
  [void][ShakeVentanas]::ShowWindow($h, $SW_RESTAURAR)
  [void][ShakeVentanas]::SetWindowPos($h, [IntPtr]::Zero, $b.X, $b.Y, $b.Width, $b.Height, $SWP_MOSTRAR)
  Start-Sleep -Milliseconds 500

  # Y ahora pantalla completa, que F11 aplica al monitor donde YA esta la
  # ventana. Por eso se mueve primero y se pone en grande despues.
  try {
    [void][ShakeVentanas]::SetForegroundWindow($h)
    [Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait('{F11}')
    Start-Sleep -Milliseconds 800
  } catch {
    Apunta ('[i] ' + $app.titulo + ': no se pudo poner en pantalla completa sola.')
  }

  # Verificar de verdad: "lo intente" no sirve cuando la pantalla la ve el
  # cliente. Si quedo en el monitor equivocado, se reintenta una vez.
  $r = New-Object ShakeVentanas+RECT
  if ([ShakeVentanas]::GetWindowRect($h, [ref]$r)) {
    $centroX = [int](($r.Left + $r.Right) / 2)
    $centroY = [int](($r.Top + $r.Bottom) / 2)
    $donde = [System.Windows.Forms.Screen]::FromPoint((New-Object System.Drawing.Point($centroX, $centroY)))
    if ($donde.DeviceName -ne $pantalla.DeviceName) {
      Apunta ('[!] ' + $app.titulo + ' quedo en otro monitor. Reintentando...')
      [void][ShakeVentanas]::SetWindowPos($h, [IntPtr]::Zero, $b.X, $b.Y, $b.Width, $b.Height, $SWP_MOSTRAR)
      Start-Sleep -Milliseconds 400
      [System.Windows.Forms.SendKeys]::SendWait('{F11}')
      Start-Sleep -Milliseconds 600
    }
  }

  Apunta ('[OK] ' + $app.titulo + ' -> monitor en (' + $b.X + ',' + $b.Y + ') ' + $b.Width + 'x' + $b.Height)
}

# -----------------------------------------------------------------------------
#  7. Correrlo
# -----------------------------------------------------------------------------
Apunta '--- Abriendo las pantallas de Hojaldras Lily ---'

$mapa = Reparte-Monitores
Abre-Splash $mapa['kiosko'].Bounds

Di-Splash 'Conectando...'
[void](Espera-Red $EsperaRedSegundos)

# Si esto se corre por segunda vez, cerrar lo de la vez anterior. Sin esto
# se van amontonando ventanas y nadie sabe cual esta viva.
try {
  $viejos = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -match 'shake-(kiosko|produccion|alimentos)' }
  if ($viejos) {
    Apunta ('Cerrando ' + @($viejos).Count + ' ventana(s) de un arranque anterior.')
    foreach ($v in $viejos) { Stop-Process -Id $v.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
  }
} catch { }

Suelta-Splash

foreach ($app in $APPS) {
  Di-Splash ('Abriendo ' + $app.titulo + '...')
  Apunta ('Abriendo ' + $app.titulo + '...')
  Abre-App $app $mapa[$app.clave]
}

Di-Splash 'Listo. Buen turno.'
Start-Sleep -Seconds 1
Cierra-Splash

Apunta '--- Listo ---'
Apunta ("Detalle de este arranque: " + $LOG)
