[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$RefreshNativeCache,
  [int]$BackendPort = 0
)

$ErrorActionPreference = 'Stop'
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendRoot = (Resolve-Path (Join-Path $mobileRoot '..\..')).Path
$workspaceRoot = (Resolve-Path (Join-Path $mobileRoot '..\..\..')).Path
$androidRoot = Join-Path $mobileRoot 'android'
$shortProject = Join-Path $workspaceRoot 'm'
$shortNativeRoot = Join-Path $workspaceRoot 'n'
$node22Root = Join-Path $workspaceRoot '_tools\node22'
$autolinkingCli = Join-Path $frontendRoot 'node_modules\expo-modules-autolinking\bin\expo-modules-autolinking.js'
$jdk17 = Join-Path $env:USERPROFILE '.gradle\jdks\eclipse_adoptium-17-amd64-windows.2'

if (-not (Test-Path -LiteralPath $androidRoot)) {
  throw 'Android native project is missing. Run Expo prebuild before this script.'
}
if (-not (Test-Path -LiteralPath (Join-Path $jdk17 'bin\java.exe'))) {
  throw "JDK 17 was not found at $jdk17"
}
if (-not (Test-Path -LiteralPath $autolinkingCli)) {
  throw 'Expo autolinking CLI is missing. Install workspace dependencies first.'
}

if (-not (Test-Path -LiteralPath $shortProject)) {
  New-Item -ItemType Junction -Path $shortProject -Target $mobileRoot | Out-Null
}

$nativePackages = @(
  @{ Key = 'g'; Source = Join-Path $mobileRoot 'node_modules\react-native-gesture-handler' },
  @{ Key = 'r'; Source = Join-Path $mobileRoot 'node_modules\react-native-reanimated' },
  @{ Key = 'w'; Source = Join-Path $mobileRoot 'node_modules\react-native-worklets' },
  @{ Key = 'a'; Source = Join-Path $frontendRoot 'node_modules\react-native-safe-area-context' },
  @{ Key = 's'; Source = Join-Path $frontendRoot 'node_modules\react-native-screens' },
  @{ Key = 'i'; Source = Join-Path $frontendRoot 'node_modules\@react-native-community\netinfo' },
  @{ Key = 'v'; Source = Join-Path $mobileRoot 'node_modules\expo-router\node_modules\@react-native-masked-view\masked-view' }
)

$createdNativeCache = $false
if ($RefreshNativeCache -and (Test-Path -LiteralPath $shortNativeRoot)) {
  Remove-Item -LiteralPath $shortNativeRoot -Recurse -Force
}
if (-not (Test-Path -LiteralPath $shortNativeRoot)) {
  New-Item -ItemType Directory -Path $shortNativeRoot | Out-Null
  foreach ($package in $nativePackages) {
    if (-not (Test-Path -LiteralPath $package.Source)) {
      throw "Native package is missing: $($package.Source)"
    }
    $destination = Join-Path $shortNativeRoot $package.Key
    New-Item -ItemType Directory -Path $destination | Out-Null
    & robocopy.exe $package.Source $destination /E `
      /XD (Join-Path $package.Source 'android\build') `
          (Join-Path $package.Source 'android\.cxx') `
          (Join-Path $package.Source 'android\.gradle') `
      /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
      throw "Failed to create native cache for $($package.Source)"
    }
  }
  $createdNativeCache = $true
}

$mapping = subst | Select-String -Pattern '^V:\\:' | ForEach-Object { $_.Line }
if ($mapping -and $mapping -notmatch [regex]::Escape($workspaceRoot)) {
  throw "Drive V: is already used by another path: $mapping"
}
if (-not $mapping) {
  subst V: $workspaceRoot
}

$env:JAVA_HOME = $jdk17
$env:Path = "$node22Root;$($env:JAVA_HOME)\bin;$env:Path"
$env:NODE_PATH = "$(Join-Path $frontendRoot 'node_modules');$(Join-Path $mobileRoot 'node_modules')"
$env:VISTAY_MOBILE_REAL_ROOT = $mobileRoot
$env:VISTAY_RN_AUTOLINK_SEARCH_PATH = $shortNativeRoot
$env:VISTAY_EXPO_AUTOLINKING_CLI = $autolinkingCli

$gradleRoot = 'V:\m\android'
Push-Location $gradleRoot
try {
  if ($createdNativeCache) {
    $codegenTasks = @(
      ':react-native-community_netinfo:generateCodegenArtifactsFromSchema',
      ':react-native-gesture-handler:generateCodegenArtifactsFromSchema',
      ':react-native-reanimated:generateCodegenArtifactsFromSchema',
      ':react-native-safe-area-context:generateCodegenArtifactsFromSchema',
      ':react-native-screens:generateCodegenArtifactsFromSchema',
      ':react-native-worklets:generateCodegenArtifactsFromSchema'
    )
    & .\gradlew.bat $codegenTasks --rerun-tasks --console=plain --max-workers=4
    if ($LASTEXITCODE -ne 0) { throw 'Native codegen failed.' }
  }

  & .\gradlew.bat app:assembleDebug `
    -PreactNativeArchitectures=arm64-v8a `
    --console=plain --max-workers=4 --build-cache
  if ($LASTEXITCODE -ne 0) { throw 'Debug APK build failed.' }
} finally {
  Pop-Location
}

$apk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
Write-Host "APK ready: $apk"

if ($Install) {
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
  adb reverse tcp:80 "tcp:$BackendPort" | Out-Null
  adb reverse tcp:8081 tcp:8081 | Out-Null
  Write-Host "USB reverse ready: backend 80 -> $BackendPort, Metro 8081 -> 8081"
  adb install --no-streaming -r -d $apk
  if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
}
