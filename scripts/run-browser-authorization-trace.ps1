param(
  [int]$Port = 9222,
  [string]$BrowserUrl = "https://localhost:3443/hipass/",
  [int]$ReadyTimeoutSeconds = 30,
  [switch]$Capstone,
  [switch]$NegativeBoundary,
  [switch]$LivePolicy,
  [switch]$MobileQr,
  [switch]$MobileQrExpiry,
  [switch]$VerticalFlow,
  [ValidateSet('', 'CT', 'MR')][string]$PhantomModality = ''
)

$ErrorActionPreference = "Stop"
if ($PhantomModality -and (-not $Capstone -or $LivePolicy)) { throw 'PhantomModality requires Capstone without legacy LivePolicy' }
if ($MobileQr -and (-not $Capstone -or $LivePolicy -or ($PhantomModality -and -not $VerticalFlow) -or $NegativeBoundary)) { throw 'MobileQr requires Capstone; PhantomModality is allowed only for VerticalFlow' }
if ($MobileQrExpiry -and -not $MobileQr) { throw 'MobileQrExpiry requires MobileQr' }
if ($VerticalFlow -and (-not $MobileQr -or $MobileQrExpiry)) { throw 'VerticalFlow requires MobileQr without MobileQrExpiry' }

function Find-Chrome {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  throw "Chrome or Edge executable was not found."
}

function Wait-Cdp {
  param([int]$Port, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
      if ($version.webSocketDebuggerUrl) {
        return $version
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)
  throw "Chrome CDP did not become ready on 127.0.0.1:$Port within $TimeoutSeconds seconds."
}

$chrome = Find-Chrome
$profile = Join-Path $env:TEMP ("hipass-cdp-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$process = $null
$previousNegativeBoundary = $env:HIPASS_BROWSER_NEGATIVE_BOUNDARY
$previousLivePolicy = $env:HIPASS_BROWSER_LIVE_POLICY
$previousPhantomModality = $env:HIPASS_BROWSER_PHANTOM_MODALITY
$previousMobileQr = $env:HIPASS_BROWSER_MOBILE_QR
$previousMobileQrExpiry = $env:HIPASS_BROWSER_MOBILE_QR_EXPIRY
$previousVerticalFlow = $env:HIPASS_BROWSER_VERTICAL_FLOW

try {
  $arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$Port",
    "--remote-allow-origins=*",
    "--user-data-dir=$profile",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  )
  $process = Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $version = Wait-Cdp -Port $Port -TimeoutSeconds $ReadyTimeoutSeconds
  Write-Host "Chrome CDP ready: $($version.Browser)"

  $env:HIPASS_CHROME_DEBUG_PORT = [string]$Port
  $env:HIPASS_BROWSER_URL = $BrowserUrl
  $env:HIPASS_BROWSER_NEGATIVE_BOUNDARY = if ($NegativeBoundary) { '1' } else { '0' }
  if ($LivePolicy -and -not $Capstone) { throw 'LivePolicy requires the synthetic Capstone profile' }
  $env:HIPASS_BROWSER_LIVE_POLICY = if ($LivePolicy) { '1' } else { '0' }
  $env:HIPASS_BROWSER_PHANTOM_MODALITY = $PhantomModality
  $env:HIPASS_BROWSER_MOBILE_QR = if ($MobileQr) { '1' } else { '0' }
  $env:HIPASS_BROWSER_MOBILE_QR_EXPIRY = if ($MobileQrExpiry) { '1' } else { '0' }
  $env:HIPASS_BROWSER_VERTICAL_FLOW = if ($VerticalFlow) { '1' } else { '0' }
  if ($Capstone) {
    $env:HIPASS_CAPSTONE_BROWSER = '1'
    $env:HIPASS_BROWSER_REQUIRE_DPOP = '1'
    & 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-check.py
  } else {
    node scripts/browser-authorization-trace.js
  }
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  $env:HIPASS_BROWSER_NEGATIVE_BOUNDARY = $previousNegativeBoundary
  $env:HIPASS_BROWSER_LIVE_POLICY = $previousLivePolicy
  $env:HIPASS_BROWSER_PHANTOM_MODALITY = $previousPhantomModality
  $env:HIPASS_BROWSER_MOBILE_QR = $previousMobileQr
  $env:HIPASS_BROWSER_MOBILE_QR_EXPIRY = $previousMobileQrExpiry
  $env:HIPASS_BROWSER_VERTICAL_FLOW = $previousVerticalFlow
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  $resolvedProfile = [System.IO.Path]::GetFullPath($profile)
  $resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
  if (-not $resolvedProfile.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -or
      [System.IO.Path]::GetFileName($resolvedProfile) -notmatch '^hipass-cdp-[a-f0-9]{32}$') {
    throw 'Refusing to remove an unvalidated browser profile path'
  }
  Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction SilentlyContinue
}
