param([ValidateSet('A')][string]$Hospital = 'A')
# Authentication stays native/local; the bounded runner saves no transcript.
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'workstation-docker-session.js')
exit $LASTEXITCODE
