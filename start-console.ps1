$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$preferredPort = 4173
$fallbackPorts = @(4174, 4175, 4176, 4177, 4178)

function Get-ConsoleUrl([int]$port) {
  return "http://localhost:$port"
}

function Get-HealthUrl([int]$port) {
  return "$(Get-ConsoleUrl $port)/api/health"
}

function Get-ConsoleHealth([int]$port) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri (Get-HealthUrl $port) -TimeoutSec 2
    if ($response.StatusCode -ne 200) {
      return $null
    }
    return $response.Content | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-FreshConsole([int]$port) {
  $health = Get-ConsoleHealth $port
  if ($null -eq $health) {
    return $false
  }
  return (
    $health.ok -eq $true -and
    $health.service -eq "investment-console" -and
    $health.capabilities.nextActionReport -eq $true -and
    $health.capabilities.stepTracker -eq $true -and
    $health.capabilities.maturitySchedule -eq $true -and
    $health.capabilities.reviewTodo -eq $true -and
    $health.capabilities.signalHistoryExport -eq $true -and
    $health.capabilities.signalIntegrityAudit -eq $true -and
    $health.capabilities.stateBackup -eq $true -and
    $health.capabilities.credibilityReport -eq $true -and
    $null -ne $health.executionPendingSignals
  )
}

function Get-ListeningProcessIds([int]$port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return @($connections | Where-Object { $_.OwningProcess } | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-PortFree([int]$port) {
  return (Get-ListeningProcessIds $port).Count -eq 0
}

function Stop-StaleInvestmentConsole([int]$port) {
  $health = Get-ConsoleHealth $port
  if ($null -eq $health -or $health.service -ne "investment-console") {
    return
  }

  foreach ($processId in (Get-ListeningProcessIds $port)) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
}

function Select-ConsolePort {
  $health = Get-ConsoleHealth $preferredPort
  if ($null -eq $health -and (Test-PortFree $preferredPort)) {
    return $preferredPort
  }

  if (Test-FreshConsole $preferredPort) {
    return $preferredPort
  }

  if ($null -ne $health -and $health.service -eq "investment-console") {
    Write-Host "Old investment console service detected on 4173. Restarting it."
    Stop-StaleInvestmentConsole $preferredPort
    if ((Test-FreshConsole $preferredPort) -or (Test-PortFree $preferredPort)) {
      return $preferredPort
    }
    Write-Host "4173 is still busy, so the fresh console will use a backup port."
  } elseif ($null -ne $health) {
    Write-Host "Port 4173 is used by another local service. Using a backup port."
  }

  foreach ($port in $fallbackPorts) {
    if ((Test-FreshConsole $port) -or (Test-PortFree $port)) {
      return $port
    }
  }

  throw "No free port found for the investment console."
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found. Cannot start the investment console."
  Write-Host "Please install Node.js or ask Codex to check the local environment."
  exit 1
}

$selectedPort = Select-ConsolePort
$url = Get-ConsoleUrl $selectedPort

if (-not (Test-FreshConsole $selectedPort)) {
  $previousPort = $env:PORT
  $env:PORT = [string]$selectedPort
  try {
    Start-Process -FilePath "node.exe" -ArgumentList @("server.js") -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  } finally {
    $env:PORT = $previousPort
  }
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if (Test-FreshConsole $selectedPort) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-Host "The investment console service did not start correctly."
  Write-Host "Please send this window's error message to Codex."
  exit 1
}

Start-Process $url
Write-Host "Investment console is running: $url"
