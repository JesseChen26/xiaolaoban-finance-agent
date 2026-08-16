$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$python = $venvPython

if (-not (Test-Path $python)) {
  $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($null -eq $pythonCommand) {
    throw "Python was not found. Install Python or recreate the local .venv first."
  }
  $python = $pythonCommand.Source
}

$toolDir = Join-Path $root "build\tools"
$workDir = Join-Path $root "build\pyinstaller"
$specDir = Join-Path $root "build"
$dispatcher = Join-Path $root "scripts\tool_dispatcher.py"

New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $python -c "import PyInstaller" 2>$null
$pyinstallerCheckExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($pyinstallerCheckExitCode -ne 0) {
  & $python -m pip install pyinstaller
  if ($LASTEXITCODE -ne 0) {
    & $python -m pip install pyinstaller -i "https://pypi.org/simple" --trusted-host "pypi.org" --trusted-host "files.pythonhosted.org"
  }
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller could not be installed. Check the Python package network or install PyInstaller manually."
  }
}

& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name investment-python `
  --distpath $toolDir `
  --workpath $workDir `
  --specpath $specDir `
  $dispatcher

$exe = Join-Path $toolDir "investment-python.exe"
if (-not (Test-Path $exe)) {
  throw "Python tool build finished but $exe was not created."
}

Write-Host "Python tool ready: $exe"
