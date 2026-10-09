param(
  [ValidateSet('A','B','Both')][string]$Hospital = 'Both'
)
# Run interactively in a LOCAL PowerShell terminal. Never pass a password.
# Dedicated development SSH identities stay outside this repository.
$ErrorActionPreference = 'Stop'
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
$keygen = (Get-Command ssh-keygen.exe -ErrorAction Stop).Source
$roles = @(
  @{role='A'; ip='192.168.111.129'; mac='00:0c:29:25:f6:b4'},
  @{role='B'; ip='192.168.111.149'; mac='00:0c:29:a3:9e:1b'}
)
$identityDir = Join-Path $env:USERPROFILE '.ssh'
if (-not (Test-Path -LiteralPath $identityDir)) {
  [void](New-Item -ItemType Directory -Path $identityDir)
}
$taskPrincipal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
function Get-TrustedHostFingerprint([string]$Address) {
  $knownOutput = @(& $keygen -F $Address 2>$null)
  $knownRecord = $knownOutput | Where-Object { $_ -match '^\S+ ssh-ed25519 (?<key>[A-Za-z0-9+/]+={0,2})' } | Select-Object -First 1
  if (-not $knownRecord -or $knownRecord -notmatch '^\S+ ssh-ed25519 (?<key>[A-Za-z0-9+/]+={0,2})') {
    throw 'A has no trusted ED25519 host key; check it at the VM console before enrollment.'
  }
  $keyBytes = [Convert]::FromBase64String($Matches.key)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { return 'SHA256:' + [Convert]::ToBase64String($hasher.ComputeHash($keyBytes)).TrimEnd('=') }
  finally { $hasher.Dispose(); [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
}
# Derive A's baseline even for -Hospital B; the duplicate-key check must never
# silently compare B's fingerprint with null when A is excluded from this run.
$trustedFingerprintA = Get-TrustedHostFingerprint '192.168.111.129'
foreach ($item in $roles) {
  if ($Hospital -ne 'Both' -and $Hospital -ne $item.role) { continue }
  Write-Host "Hospital $($item.role): server@$($item.ip)"
  if ($item.role -eq 'A') {
    # A has a trusted known_hosts entry; derive its fingerprint from that public key.
    # Strict OpenSSH check proves the endpoint matches the cached key before login.
    $previousErrorAction = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $trustCheck = @(& $ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 "server@$($item.ip)" exit 2>&1) -join "`n"
    } finally { $ErrorActionPreference = $previousErrorAction }
    if ($trustCheck -notmatch 'Permission denied' -or $trustCheck -match 'Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|Connection timed out|Connection refused') {
      throw 'A known-host verification or network check failed. No credential enrollment performed.'
    }
    $fingerprint = $trustedFingerprintA
    Write-Host 'A host key matched the existing strict OpenSSH known-host record.'
  } else {
    Write-Host 'At the B VM console run: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
    $fingerprint = Read-Host 'Enter the NEW SHA256 fingerprint shown at the B VM console (PUBLIC information only)'
    if ($fingerprint -eq $trustedFingerprintA) {
      throw 'B still shares A host key. Rotate B host keys locally before SSH enrollment.'
    }
  }
  if ($fingerprint -notmatch '^SHA256:[A-Za-z0-9+/]{43}$') {
    throw 'Invalid public fingerprint. No SSH credentials were sent.'
  }
  # Check the observed public host key with no authentication and a finite deadline.
  # Plink handles the Windows ssh-keyscan hybrid-KEX incompatibility here.
  $plink = 'C:\Program Files\PuTTY\plink.exe'
  if (-not (Test-Path -LiteralPath $plink)) { throw 'Reviewed PuTTY installation required for host verification.' }
  $probe = [System.Diagnostics.Process]::new()
  $probe.StartInfo.FileName = $plink
  $probe.StartInfo.Arguments = "-ssh -batch -v -noagent -P 22 -l server $($item.ip) exit"
  $probe.StartInfo.UseShellExecute = $false
  $probe.StartInfo.CreateNoWindow = $true
  $probe.StartInfo.RedirectStandardOutput = $true
  $probe.StartInfo.RedirectStandardError = $true
  try {
    [void]$probe.Start()
    $stdout = $probe.StandardOutput.ReadToEndAsync()
    $stderr = $probe.StandardError.ReadToEndAsync()
    if (-not $probe.WaitForExit(10000)) {
      $probe.Kill()
      throw 'Host verification timeout. No enrollment performed.'
    }
    $observed = $stderr.Result + $stdout.Result
    if ($observed -notmatch ('ssh-ed25519 255 ' + [regex]::Escape($fingerprint) + '(?:\s|$)')) {
      throw 'Host fingerprint mismatch. No enrollment performed.'
    }
  } finally { $probe.Dispose() }
  $keyPath = Join-Path $identityDir "highpass_capstone_hospital_$($item.role.ToLower())_ed25519"
  if (-not (Test-Path -LiteralPath $keyPath)) {
    Write-Host 'Creating a dedicated local development key; existing identities are not replaced.'
    # Native ssh-keygen asks for a passphrase locally. No passphrase in arguments/logs.
    & $keygen -t ed25519 -f $keyPath -C "highpass-capstone-hospital-$($item.role)"
    if ($LASTEXITCODE -ne 0) { throw 'Key generation failed.' }
  }
  if (-not (Test-Path -LiteralPath "$keyPath.pub")) { throw 'Public key missing; existing private key preserved.' }
  & icacls.exe $keyPath /inheritance:r /grant:r "${taskPrincipal}:(F)" '*S-1-5-18:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Private-key ACL protection failed.' }
  $publicKey = (Get-Content -Raw -LiteralPath "$keyPath.pub").Trim()
  if ($publicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9_-]+)?$') {
    throw 'Invalid public key. Enrollment refused.'
  }
  # Only literal, validated public data is embedded; passwords are handled by native SSH.
  $remote = @'
set -eu
test "$(cat /sys/class/net/ens33/address)" = '__MAC__' || { echo WRONG_HOSPITAL_GUEST; exit 1; }
test "$(id -un)" = server || exit 1
umask 077
test ! -L "$HOME/.ssh" || exit 1
mkdir -p "$HOME/.ssh"
test ! -L "$HOME/.ssh/authorized_keys" || exit 1
touch "$HOME/.ssh/authorized_keys"
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF '__PUBLIC_KEY__' "$HOME/.ssh/authorized_keys" || printf '\n%s\n' '__PUBLIC_KEY__' >> "$HOME/.ssh/authorized_keys"
echo PUBLIC_KEY_ENROLLMENT_DONE
'@
  $remote = $remote.Replace('__MAC__', $item.mac).Replace('__PUBLIC_KEY__', $publicKey)
  Write-Host 'Confirm only the console-verified ED25519 fingerprint at the SSH trust prompt.'
  Write-Host 'Enter the VM account password ONLY at the native SSH password prompt.'
  $enrollArgs = @(
    '-o','HostKeyAlgorithms=ssh-ed25519',
    '-o','StrictHostKeyChecking=ask',
    '-o','ConnectTimeout=5',
    '-o','ServerAliveInterval=5',
    '-o','ServerAliveCountMax=2',
    '-o','IdentitiesOnly=yes',
    '-i',$keyPath,
    "server@$($item.ip)",
    'timeout 15s sh -s'
  )
  $remote | & $ssh @enrollArgs
  if ($LASTEXITCODE -ne 0) { throw 'Enrollment failed. Existing keys/configuration preserved.' }
  Write-Host 'Enrollment command completed; checking public-key-only login.'
  $verifyArgs = @(
    '-o','StrictHostKeyChecking=yes',
    '-o','ConnectTimeout=5',
    '-o','IdentitiesOnly=yes',
    '-o','PreferredAuthentications=publickey',
    '-o','PasswordAuthentication=no',
    '-o','KbdInteractiveAuthentication=no',
    '-o','ServerAliveInterval=5',
    '-o','ServerAliveCountMax=2',
    '-i',$keyPath,
    "server@$($item.ip)",
    'printf PUBLIC_KEY_AUTHENTICATED'
  )
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $verificationOutput = @(& $ssh @verifyArgs) -join "`n"
  } finally { $ErrorActionPreference = $previousErrorAction }
  if ($LASTEXITCODE -ne 0 -or $verificationOutput -notmatch 'PUBLIC_KEY_AUTHENTICATED') {
    throw 'Public-key login was not verified; password fallback was disabled for this check.'
  }
  Write-Host "Hospital $($item.role) public-key authentication PASS; application and Docker remain NOT VERIFIED."
}
Write-Host 'For encrypted keys, load them into a LOCAL ssh-agent before unattended checks.'
Write-Host 'B host-key rotation and Docker checks are separate gates. Review: DRAFT / UNASSIGNED.'
