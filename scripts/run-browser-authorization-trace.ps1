param(
  [int]$Port = 9222,
  [string]$BrowserUrl = "https://localhost:3443/hipass/",
  [int]$ReadyTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

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
  node scripts/browser-authorization-trace.js
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}
