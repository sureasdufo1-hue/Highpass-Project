$ErrorActionPreference = 'Stop'

$container = 'highpass-pf0-postgres-gate-' + $PID
$image = 'postgres:16-alpine'
$password = 'synthetic-local-gate-only'
$containerStarted = $false
$startupTimeoutSeconds = 90

function Invoke-PrivacySqlScript([string]$Path) {
  Get-Content -Raw -Encoding UTF8 $Path |
    docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d hipass_pf0
  if ($LASTEXITCODE -ne 0) {
    throw "PF-0 PostgreSQL/RLS gate failed while applying $Path"
  }
}

try {
  $ErrorActionPreference = 'Continue'
  $dockerProbe = docker version --format '{{.Server.Version}}' 2>&1
  $dockerProbeExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($dockerProbeExit -ne 0) {
    Write-Output 'PF-0 PostgreSQL 16 migration/RLS gate: ENVIRONMENT BLOCKED - Docker engine unavailable'
    exit 2
  }
  docker run --detach --rm --name $container -e POSTGRES_PASSWORD=$password -e POSTGRES_DB=hipass_pf0 $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PF-0 PostgreSQL container failed to start' }
  $containerStarted = $true
  $ready = $false
  foreach ($attempt in 1..$startupTimeoutSeconds) {
    $running = docker inspect --format '{{.State.Running}}' $container 2>$null
    if ($LASTEXITCODE -ne 0 -or $running -ne 'true') {
      throw 'PF-0 PostgreSQL container exited during initialization'
    }

    # postgres:16-alpine briefly accepts connections on a temporary bootstrap
    # server and then shuts it down. Wait for the explicit init-complete marker
    # before probing the final server so the gate cannot race that transition.
    $ErrorActionPreference = 'Continue'
    $startupLog = docker logs $container 2>&1 | Out-String
    $logExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($logExit -ne 0) { throw 'Unable to read PF-0 PostgreSQL startup log' }
    if ($startupLog -match 'PostgreSQL init process complete; ready for start up\.') {
      docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d hipass_pf0 -tAc 'SELECT 1' 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "PostgreSQL readiness timeout after $startupTimeoutSeconds seconds" }

  Invoke-PrivacySqlScript 'db/migrations/001_highpass_mobile_core.sql'
  Invoke-PrivacySqlScript 'db/migrations/003_privacy_pf0_contract.sql'
  Invoke-PrivacySqlScript 'test/sql/privacy_pf0_rls_gate.sql'
  Write-Output 'PF-0 PostgreSQL 16 migration/RLS gate: PASS'
} finally {
  if ($containerStarted) {
    $ErrorActionPreference = 'Continue'
    docker rm -f $container 2>$null | Out-Null
  }
}
