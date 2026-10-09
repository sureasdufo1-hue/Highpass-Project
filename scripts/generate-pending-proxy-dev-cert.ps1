param([ValidateRange(31,90)][int]$ValidityDays=31)
$ErrorActionPreference='Stop'
$taskWorkspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskRoot=[IO.Path]::GetFullPath((Join-Path $taskWorkspace 'tmp/certs/pending-edge'))
$taskAllowed=[IO.Path]::GetFullPath((Join-Path $taskWorkspace 'tmp/certs'))+[IO.Path]::DirectorySeparatorChar
if (-not $taskRoot.StartsWith($taskAllowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid development certificate destination' }
$taskOpenSsl='C:/Program Files/Git/usr/bin/openssl.exe'
if (-not (Test-Path -LiteralPath $taskOpenSsl -PathType Leaf)) { throw 'Trusted local OpenSSL unavailable; no download attempted' }
function Invoke-PendingDevOpenSsl([string[]]$TaskArguments) {
 $taskQuoted=@($TaskArguments | ForEach-Object {
  if ($_ -match '["\r\n]') { throw 'Invalid OpenSSL argument' }
  '"'+$_+'"'
 }) -join ' '
 $taskProcess=Start-Process -FilePath $taskOpenSsl -ArgumentList $taskQuoted -WindowStyle Hidden -PassThru
 try {
  # Capture handle before waiting so Windows PowerShell retains the exit status.
  $taskHandle=$taskProcess.Handle
  if (-not $taskProcess.WaitForExit(30000)) {
   $taskProcess.Kill()
   $null=$taskProcess.WaitForExit(2000)
   throw 'Development certificate subprocess timed out; partial outputs preserved'
  }
  if ($taskProcess.ExitCode -ne 0) { throw 'Development certificate subprocess failed; partial outputs preserved' }
 } finally { $taskProcess.Dispose() }
}
$taskKey=Join-Path $taskRoot 'pending-proxy-dev.key'
$taskCsr=Join-Path $taskRoot 'pending-proxy-dev.csr'
$taskCert=Join-Path $taskRoot 'pending-proxy-dev.crt'
$taskSerial=Join-Path $taskRoot 'pending-proxy-dev-ca.srl'
foreach ($taskOutput in @($taskKey,$taskCsr,$taskCert,$taskSerial)) {
 if (Test-Path -LiteralPath $taskOutput) { throw 'Development certificate output already exists; refusing overwrite' }
}
$taskCa=Join-Path $taskWorkspace 'tmp/certs/mtls/ca.crt'
$taskCaKey=Join-Path $taskWorkspace 'tmp/certs/mtls/ca.key'
foreach ($taskInput in @($taskCa,$taskCaKey)) { if (-not (Test-Path -LiteralPath $taskInput -PathType Leaf)) { throw 'Existing project development CA unavailable' } }
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
Invoke-PendingDevOpenSsl @('req','-newkey','rsa:2048','-nodes','-subj','/CN=highpass-pending-edge-dev-proxy','-keyout',$taskKey,'-out',$taskCsr)
Invoke-PendingDevOpenSsl @('x509','-req','-days',"$ValidityDays",'-in',$taskCsr,'-CA',$taskCa,'-CAkey',$taskCaKey,'-CAserial',$taskSerial,'-CAcreateserial','-out',$taskCert,'-extfile',(Join-Path $taskWorkspace 'config/pending-edge-dev-client.ext'))
Invoke-PendingDevOpenSsl @('verify','-purpose','sslclient','-CAfile',$taskCa,$taskCert)
Write-Output 'Development-only pending proxy certificate issued; private key remains under ignored tmp/. Existing CA/serial/runtime certificates unchanged.'
