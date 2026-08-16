$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$version = "3.11.9"
$archiveName = "python-$version-embed-amd64.zip"
$url = "https://www.python.org/ftp/python/$version/$archiveName"
$cacheDir = Join-Path $root "build\cache"
$runtimeDir = Join-Path $root "build\python"
$archivePath = Join-Path $cacheDir $archiveName

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

if (-not (Test-Path $archivePath)) {
  Write-Host "Downloading embeddable Python $version..."
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archivePath
}

if (Test-Path $runtimeDir) {
  $resolvedRuntime = (Resolve-Path -LiteralPath $runtimeDir).Path
  $resolvedRoot = (Resolve-Path -LiteralPath $root).Path
  if (-not $resolvedRuntime.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove runtime directory outside workspace: $resolvedRuntime"
  }
  Remove-Item -LiteralPath $runtimeDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir -Force

$pythonExe = Join-Path $runtimeDir "python.exe"
if (-not (Test-Path $pythonExe)) {
  throw "Embedded Python was extracted but python.exe was not found."
}

$pth = Get-ChildItem -LiteralPath $runtimeDir -Filter "python*._pth" | Select-Object -First 1
if ($null -ne $pth) {
  $content = @(Get-Content -LiteralPath $pth.FullName)
  $requiredPaths = @(
    "..\app\scripts",
    "..\..\scripts"
  )

  foreach ($requiredPath in $requiredPaths) {
    if (-not ($content -contains $requiredPath)) {
      $content += $requiredPath
    }
  }

  $content = $content | ForEach-Object {
    if ($_ -eq "#import site") {
      "import site"
    } else {
      $_
    }
  }
  Set-Content -LiteralPath $pth.FullName -Value $content -Encoding ASCII
}

& $pythonExe -X utf8 -c "import json, urllib.request, pathlib; print(json.dumps({'ok': True, 'python': pathlib.Path(__import__('sys').executable).name}))"
if ($LASTEXITCODE -ne 0) {
  throw "Embedded Python smoke test failed."
}

Write-Host "Embedded Python ready: $pythonExe"
