param(
  [string]$CertificatePath = "tmp/certs/mtls/ca.crt"
)

$ErrorActionPreference = "Stop"
$resolved = Resolve-Path -LiteralPath $CertificatePath
$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($resolved)

Write-Host "HiPass development CA trust import"
Write-Host "Scope: CurrentUser Root"
Write-Host "TEST ONLY: Do not use this CA for production."
Write-Host "Subject: $($cert.Subject)"
Write-Host "Issuer: $($cert.Issuer)"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "NotBefore: $($cert.NotBefore.ToString('o'))"
Write-Host "NotAfter: $($cert.NotAfter.ToString('o'))"

if ($cert.Subject -notlike "*hipass-dev-root-ca*") {
  throw "Refusing to trust unexpected CA subject: $($cert.Subject)"
}

$store = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "CurrentUser")
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
  $existing = $store.Certificates | Where-Object Thumbprint -eq $cert.Thumbprint
  if (-not $existing) {
    $store.Add($cert)
  }
} finally {
  $store.Close()
}

$verified = Get-ChildItem Cert:\CurrentUser\Root | Where-Object Thumbprint -eq $cert.Thumbprint
if (-not $verified) {
  throw "CA import did not verify in CurrentUser Root store."
}

Write-Host "Trusted: true"
Write-Host "Restart Chrome before browser validation."
