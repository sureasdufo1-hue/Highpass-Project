$ErrorActionPreference = 'Stop'

$container = 'highpass-pf0-postgres-gate-' + $PID
$image = 'postgres:16-alpine'
$password = 'synthetic-local-gate-only'
$containerStarted = $false

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
  $containerStarted = $true
  $ready = $false
  foreach ($attempt in 1..30) {
    docker exec $container pg_isready -U postgres -d hipass_pf0 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL readiness timeout' }

  Get-Content -Raw db/migrations/001_highpass_mobile_core.sql | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d hipass_pf0
  Get-Content -Raw db/migrations/003_privacy_pf0_contract.sql | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d hipass_pf0
  Get-Content -Raw test/sql/privacy_pf0_rls_gate.sql | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d hipass_pf0
  if ($LASTEXITCODE -ne 0) { throw 'PF-0 PostgreSQL/RLS gate failed' }
  Write-Output 'PF-0 PostgreSQL 16 migration/RLS gate: PASS'
} finally {
  if ($containerStarted) {
    $ErrorActionPreference = 'Continue'
    docker rm -f $container 2>$null | Out-Null
  }
}
