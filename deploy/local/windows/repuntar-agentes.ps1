# ============================================================================
#  Repunta los agentes de la PC (impresion, caja/tickets y BANORTE) al Supabase
#  LOCAL. Los agentes corren en este mismo equipo, asi que apuntan directo a
#  Kong (http://localhost:8000); no dependen de Tailscale.
#
#  Cambia SOLO SUPABASE_URL y SUPABASE_ANON_KEY en cada .env; NO toca tokens,
#  IP de la pinpad ni contrasenas (eso se queda y se completa desde Admin local).
#  ASCII puro a proposito.
# ============================================================================
$ErrorActionPreference = "Stop"

$UrlLocal = "http://localhost:8000"
$Anon = Read-Host "Pega la ANON KEY local (la del Supabase self-hosted)"
if (-not $Anon) { Write-Host "Sin anon key no puedo continuar."; exit 1 }

$Base = Read-Host "Carpeta donde estan los agentes (Enter = C:\Hojaldras Lily)"
if (-not $Base) { $Base = "C:\Hojaldras Lily" }

# Nombres posibles de cada agente dentro de la carpeta base.
$Agentes = @("agente-impresion", "agente-caja", "agente-banorte")

function FijarEnv($archivo, $clave, $valor) {
  if (Test-Path $archivo) { $lineas = Get-Content $archivo } else { $lineas = @() }
  $puesto = $false
  $nuevas = foreach ($l in $lineas) {
    if ($l -match "^\s*$clave=") { "$clave=$valor"; $puesto = $true } else { $l }
  }
  if (-not $puesto) { $nuevas += "$clave=$valor" }
  # Sin BOM, para que Node lea el .env limpio.
  [System.IO.File]::WriteAllLines($archivo, $nuevas, (New-Object System.Text.UTF8Encoding($false)))
}

$encontrados = 0
foreach ($a in $Agentes) {
  $dir = Join-Path $Base $a
  if (-not (Test-Path $dir)) { Write-Host "  (omito $a: no esta en $Base)"; continue }
  $env = Join-Path $dir ".env"
  FijarEnv $env "SUPABASE_URL" $UrlLocal
  FijarEnv $env "SUPABASE_ANON_KEY" $Anon
  Write-Host "  OK  $a  ->  $UrlLocal"
  $encontrados++
}

Write-Host ""
if ($encontrados -eq 0) {
  Write-Host "No encontre agentes en $Base. Corre de nuevo con la carpeta correcta."
} else {
  Write-Host "Listos $encontrados agente(s). Reinicia sus ventanas/servicios para que tomen el cambio."
  Write-Host "El TOKEN de cada impresora y de la terminal se genera desde Admin local"
  Write-Host "(Admin -> Impresoras / Terminal de Banorte)."
}
