param([string]$ControlFile='C:/Users/user/Downloads/MediQ_리눅스터미널_증적_20261020/control.json')
$ErrorActionPreference='Stop'
$terminalOutput=Split-Path -Parent $ControlFile
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$host.UI.RawUI.WindowTitle='MediQ LIVE Linux SSH Evidence'
try{$b=$host.UI.RawUI.BufferSize;$b.Width=148;$b.Height=3000;$host.UI.RawUI.BufferSize=$b;$w=$host.UI.RawUI.WindowSize;$w.Width=148;$w.Height=48;$host.UI.RawUI.WindowSize=$w}catch{}
$last=''
while($true){
 if(Test-Path -LiteralPath $ControlFile){
  $job=Get-Content -LiteralPath $ControlFile -Raw | ConvertFrom-Json
  if($job.stop){break}
  if($job.panel -and $job.panel -ne $last){
   if($job.panel -notmatch '^\d{2}-[a-z-]+$'){throw 'INVALID_PANEL'}
   $last=$job.panel;Clear-Host
   if($last -match '^2[1234]-'){Write-Host 'Actual local Windows model host. Selected settings and runtime records.' -ForegroundColor Cyan}
   else{Write-Host 'Actual remote Linux output over pinned SSH. Query-stage data minimization.' -ForegroundColor Cyan}
   Write-Host ''
   $keyDir=Join-Path $env:USERPROFILE '.ssh/highpass-capstone-cloud'
   $transcriptPath=Join-Path $terminalOutput "transcripts/$last.txt"
   & python (Join-Path $PSScriptRoot 'query-linux-terminal.py') $last $transcriptPath
   $exit=$LASTEXITCODE
   if($exit -eq 0){Write-Host ([IO.File]::ReadAllText($transcriptPath))}
   Write-Host "`nEvidence command exit code: $exit" -ForegroundColor Cyan
   [IO.File]::WriteAllText((Join-Path $terminalOutput 'completed.json'),(@{panel=$last;exit=$exit;completedAt=(Get-Date).ToString('o')}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  }
 }
 Start-Sleep -Milliseconds 400
}
