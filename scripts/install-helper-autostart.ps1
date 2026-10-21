$ErrorActionPreference='Stop'
[Diagnostics.Process]::GetCurrentProcess().PriorityClass='Normal'
$taskName='MediQ-HealthHelper-Runtime'
$projectRoot=Split-Path -Parent $PSScriptRoot
# Use the installed non-Store runtime, avoiding App Execution Alias/virtualized state.
$pythonWindowless='C:/Program Files/Microsoft SDKs/Azure/CLI2/pythonw.exe'
if(-not(Test-Path -LiteralPath $pythonWindowless)){throw 'PYTHONW_NOT_FOUND'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$action=New-ScheduledTaskAction -Execute $pythonWindowless -Argument ('"'+(Join-Path $PSScriptRoot 'helper-runtime-supervisor.py')+'"') -WorkingDirectory $projectRoot
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
$principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -Priority 4
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing){
 if($existing.Actions.Arguments -notlike '*helper-runtime-supervisor.py*'){throw 'EXISTING_TASK_NOT_OWNED'}
 $existing | Export-ScheduledTask | Set-Content -LiteralPath (Join-Path $env:TEMP 'mediq-helper-task-before.xml') -Encoding utf8
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'MediQ per-user Ollama/relay/pinned SSH recovery. No stored password. Runs after user logon.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$task=Get-ScheduledTask -TaskName $taskName
[pscustomobject]@{Task=$task.TaskName;State=$task.State.ToString();Trigger='UserLogon';RunLevel=$task.Principal.RunLevel.ToString();LogonType=$task.Principal.LogonType.ToString();StoredPassword=$false}|ConvertTo-Json
