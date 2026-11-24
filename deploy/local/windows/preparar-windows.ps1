# ============================================================================
#  Prepara UNA PC Windows como servidor local de Hojaldras Lily.
#  - Asegura WSL2 + Ubuntu, Docker Desktop, Tailscale y Git (via winget).
#  - Clona/actualiza el repo.
#  - Corre el instalador del servidor DENTRO de WSL (reusa los scripts bash).
#  - Une el equipo al tailnet y lo expone por HTTPS (Tailscale Serve).
#  ASCII puro a proposito (ver scripts/verificar-scripts-ascii.mjs).
# ============================================================================
$ErrorActionPreference = "Stop"

$RepoUrl  = $env:LILY_REPO_URL;  if (-not $RepoUrl)  { $RepoUrl  = "https://github.com/EleevateMX/hojaldraslily.git" }
$Rama     = $env:LILY_RAMA;      if (-not $Rama)     { $Rama     = "main" }
$RepoDir  = "C:\HojaldrasLily\repo"

function Tiene($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function InstalarConWinget($id, $nombre) {
  if (-not (Tiene "winget")) { Write-Host "  winget no esta; instala $nombre a mano."; return }
  Write-Host "  Instalando $nombre ($id)..."
  winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent 2>$null
}

# --- 1. WSL2 + Ubuntu ---
Write-Host "== 1/6  WSL2 + Ubuntu =="
$wsl = (wsl -l -q) 2>$null
if (-not $wsl -or ($wsl -notmatch "Ubuntu")) {
  Write-Host "  Instalando WSL2 + Ubuntu (puede pedir REINICIAR)..."
  wsl --install -d Ubuntu
  Write-Host "  Si pidio reiniciar: reinicia, abre Ubuntu una vez (crea tu usuario) y vuelve a correr este instalador."
}

# --- 2. Docker Desktop ---
Write-Host "== 2/6  Docker Desktop =="
if (-not (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe")) {
  InstalarConWinget "Docker.DockerDesktop" "Docker Desktop"
  Write-Host "  Abre Docker Desktop una vez, activa la integracion con WSL2 (Ubuntu), y vuelve a correr."
} else {
  Write-Host "  Docker Desktop ya esta."
}

# --- 3. Tailscale ---
Write-Host "== 3/6  Tailscale =="
if (-not (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe")) {
  InstalarConWinget "tailscale.tailscale" "Tailscale"
}

# --- 4. Git + repo ---
Write-Host "== 4/6  Repo =="
if (-not (Tiene "git")) { InstalarConWinget "Git.Git" "Git" }
if (-not (Test-Path $RepoDir)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $RepoDir) | Out-Null
  git clone --branch $Rama $RepoUrl $RepoDir
} else {
  Push-Location $RepoDir; git fetch origin $Rama; git checkout $Rama; git pull --ff-only; Pop-Location
}

# --- 5. Instalar el servidor dentro de WSL ---
Write-Host "== 5/6  Servidor (dentro de WSL) =="
$RepoWsl = "/mnt/c/HojaldrasLily/repo"
Write-Host "  Corriendo el instalador del servidor en WSL..."
Write-Host "  (Si se detiene pidiendo editar .env, editalos y vuelve a correr este instalador.)"
wsl -d Ubuntu -- bash -lc "command -v pnpm >/dev/null || (corepack enable 2>/dev/null; npm i -g pnpm); cd $RepoWsl && bash deploy/local/scripts/instalar-servidor.sh"

# --- 6. Tailscale: unir y exponer ---
Write-Host "== 6/6  Tailscale =="
$ts = "$env:ProgramFiles\Tailscale\tailscale.exe"
if (Test-Path $ts) {
  Write-Host "  Uniendo al tailnet (se abre el navegador para autorizar)..."
  & $ts up
  Write-Host "  Exponiendo el servidor por HTTPS en el tailnet..."
  & $ts serve --bg --https=443 http://127.0.0.1:80
  & $ts serve status
  Write-Host ""
  Write-Host "  Admin desde el telefono (con Tailscale en el celular, en el tailnet):"
  Write-Host "    https://<nombre-de-este-equipo>.<tailnet>.ts.net/admin/"
  Write-Host "  Esa MISMA URL va en VITE_SUPABASE_URL (.env.apps) para que apps y API"
  Write-Host "  vivan en un solo origen."
}

Write-Host ""
Write-Host "Listo el servidor. Siguiente: repuntar-agentes.ps1 (apunta impresion, caja"
Write-Host "y Banorte al Supabase local) y traer los datos de configuracion (ver README)."
