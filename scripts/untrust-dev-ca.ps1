param(
  [string]$Thumbprint = "AFF560623D6D541B5B72826C44202F622CB65A38"
)

$ErrorActionPreference = "Stop"
$normalized = $Thumbprint.Replace(" ", "").ToUpperInvariant()
$certs = Get-ChildItem Cert:\CurrentUser\Root | Where-Object Thumbprint -eq $normalized

foreach ($cert in $certs) {
  if ($cert.Subject -notlike "*hipass-dev-root-ca*") {
    throw "Refusing to remove unexpected certificate subject: $($cert.Subject)"
  }
  Remove-Item -LiteralPath "Cert:\CurrentUser\Root\$($cert.Thumbprint)" -Force
}

$remaining = Get-ChildItem Cert:\CurrentUser\Root | Where-Object Thumbprint -eq $normalized
Write-Host "Removed: $([bool](-not $remaining))"
