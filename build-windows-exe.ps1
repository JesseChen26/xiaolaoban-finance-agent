$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js before building the desktop app."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Install Node.js with npm before building the desktop app."
}

$env:ELECTRON_MIRROR = if ($env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR
} else {
  "https://npmmirror.com/mirrors/electron/"
}

$env:ELECTRON_BUILDER_BINARIES_MIRROR = if ($env:ELECTRON_BUILDER_BINARIES_MIRROR) {
  $env:ELECTRON_BUILDER_BINARIES_MIRROR
} else {
  "https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  npm.cmd install
}

npm.cmd run dist:win

Write-Host ""
Write-Host "Windows exe build finished. Check the dist folder."
