[CmdletBinding()]
param(
  [int]$BackendPort = 0
)

$ErrorActionPreference = 'Stop'
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw 'adb is not available on PATH.'
}

$devices = @(adb devices | Select-String -Pattern "`tdevice$")
$deviceConnected = $devices.Count -gt 0

if ($BackendPort -eq 0) {
  $publishedPort = $null
  if (Get-NetTCPConnection -State Listen -LocalPort 80 -ErrorAction SilentlyContinue) {
    $BackendPort = 80
  } elseif (Get-NetTCPConnection -State Listen -LocalPort 18080 -ErrorAction SilentlyContinue) {
    $BackendPort = 18080
  } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    $publishedPort = docker port vistay-nginx-1 8080/tcp 2>$null |
      Select-Object -First 1 |
      ForEach-Object { if ($_ -match ':(\d+)$') { [int]$Matches[1] } }
  }
  if ($BackendPort -ne 0) {
    # A listening edge port was detected without waiting for the Docker CLI.
  } elseif ($publishedPort) {
    $BackendPort = $publishedPort
  } else {
    $BackendPort = 80
  }
}

if ($deviceConnected) {
  adb reverse tcp:80 "tcp:$BackendPort" | Out-Null
  adb reverse tcp:8081 tcp:8081 | Out-Null
  Write-Host "USB reverse ready: backend 80 -> $BackendPort, Metro 8081 -> 8081"
} else {
  Write-Warning 'No Android device is connected. Metro will start and ports will be mapped automatically after USB reconnects.'
}
Write-Host 'USB reconnect watcher enabled; lost reverse mappings will be restored automatically.'
Write-Host 'Starting Expo Metro. Keep this terminal open while testing.'

$reverseJob = Start-Job -ArgumentList $BackendPort -ScriptBlock {
  param([int]$PublishedBackendPort)
  while ($true) {
    try {
      $device = adb devices 2>$null | Select-String -Pattern "`tdevice$" | Select-Object -First 1
      if ($device) {
        $mappingText = @(adb reverse --list 2>$null) -join "`n"
        if ($mappingText -notmatch "tcp:80\s+tcp:$PublishedBackendPort") {
          adb reverse tcp:80 "tcp:$PublishedBackendPort" 2>$null | Out-Null
        }
        if ($mappingText -notmatch 'tcp:8081\s+tcp:8081') {
          adb reverse tcp:8081 tcp:8081 2>$null | Out-Null
        }
      }
    } catch {
      # ADB briefly fails while Android assigns a new USB transport. Retry below.
    }
    Start-Sleep -Seconds 2
  }
}

try {
  Set-Location $mobileRoot
  npx expo start --dev-client --localhost --port 8081
} finally {
  Stop-Job -Job $reverseJob -ErrorAction SilentlyContinue
  Remove-Job -Job $reverseJob -Force -ErrorAction SilentlyContinue
}
