$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# build.ps1 - Build TutorMate into a Windows installer (.exe)
# Bundles the local llama.cpp runtime and GGUF model files required by the app.
#
# Usage:
#   .\build.ps1
#
# Output:
#   dist\TutorMate Web Setup *.exe
#   dist\*.nsis.7z

Step "Checking prerequisites..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js not found. Install from https://nodejs.org" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm not found." }
Info "Node.js $(node -v)   npm $(npm -v)"

Step "Checking bundled runtime assets..."
$llamaServerPath = Join-Path $ScriptDir "bin\llama-server.exe"
if (-not (Test-Path $llamaServerPath)) {
    Fail "Missing required runtime asset: bin\llama-server.exe"
}
Info "bin\llama-server.exe found"

$ggufModels = Get-ChildItem (Join-Path $ScriptDir "models") -Filter *.gguf -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "mmproj*" }
if (-not $ggufModels) {
    Fail "No runnable GGUF model was found in models\"
}
Info "Found $($ggufModels.Count) runnable GGUF model(s)"

Step "Installing project dependencies..."
& npm install --prefer-offline --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }

$ebBin = Join-Path $ScriptDir "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path $ebBin)) {
    Step "Installing electron-builder..."
    & npm install --save-dev electron-builder --loglevel=error
    if ($LASTEXITCODE -ne 0) { Fail "electron-builder install failed" }
} else {
    Info "electron-builder found in node_modules"
}

$icoPath = Join-Path $ScriptDir "build\icon.ico"
if (-not (Test-Path $icoPath)) {
    Step "Generating placeholder icons (build/icon.png + build/icon.ico)..."
    & node build-icon.js
    if ($LASTEXITCODE -ne 0) { Fail "Icon generation failed" }
} else {
    Info "build\icon.ico found"
}

Step "Checking package.json..."
& node build-pkg.js
if ($LASTEXITCODE -ne 0) { Fail "package.json patch failed" }

Step "Preparing installer resources..."
& node scripts\prepare-installer-resources.mjs
if ($LASTEXITCODE -ne 0) { Fail "installer resource preparation failed" }

Step "Building Windows installer..."
Info "Output -> .\dist\"
Info "(First run downloads Electron binaries and may take a few minutes)"
Info "(Each build uses a fresh temp output folder to avoid locked win-unpacked files)"

$env:ELECTRON_BUILDER_CACHE = "$env:LOCALAPPDATA\electron-builder\Cache"

& node scripts\run-electron-builder.mjs --win --publish never
if ($LASTEXITCODE -ne 0) { Fail "electron-builder wrapper failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "==> Build complete!" -ForegroundColor Green
Write-Host ""

if (Test-Path "dist") {
    Get-ChildItem dist -File | Where-Object { $_.Extension -in ".exe", ".msi", ".zip", ".7z", ".yml" } |
        Format-Table @{L = "File"; E = { $_.Name } }, @{L = "Size"; E = { "$([math]::Round($_.Length / 1MB, 1)) MB" } } -AutoSize
}
