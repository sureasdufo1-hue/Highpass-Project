"""Execute the real Linux evidence command over the existing pinned SSH trust."""
import pathlib,importlib.util,sys,re,json,subprocess,datetime
import psutil
psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS);psutil.Process().ionice(psutil.IOPRIO_NORMAL)
root=pathlib.Path(__file__).resolve().parents[1]
panel=sys.argv[1]
if not re.fullmatch(r'\d{2}-[a-z-]+',panel):raise SystemExit('INVALID_PANEL')
if panel in ['21-local-runtime','22-startup-task','23-recovery-test','24-runtime-events']:
 output='Medi Q | ACTUAL LOCAL WINDOWS MODEL HOST\nUTC '+datetime.datetime.now(datetime.timezone.utc).isoformat()+'\nREAD-ONLY OBSERVATION | '+panel+'\n\n'
 if panel=='21-local-runtime':
  output+='COMMAND: python scripts/helper-runtime-supervisor.py --status\n'
  p=subprocess.run([sys.executable,str(root/'scripts/helper-runtime-supervisor.py'),'--status'],capture_output=True,text=True,encoding='utf8',timeout=35)
  assert p.returncode==0;output+=p.stdout
 elif panel=='22-startup-task':
  command="$t=Get-ScheduledTask -TaskName 'MediQ-HealthHelper-Runtime';$i=Get-ScheduledTaskInfo -TaskName $t.TaskName;[pscustomobject]@{task=$t.TaskName;state=$t.State.ToString();trigger='UserLogon';actualTriggerType=$t.Triggers.CimClass.CimClassName;logonType=$t.Principal.LogonType.ToString();runLevel=$t.Principal.RunLevel.ToString();priority=$t.Settings.Priority;lastResult=$i.LastTaskResult;restartCount=$t.Settings.RestartCount;executionTimeLimit=$t.Settings.ExecutionTimeLimit;multipleInstances=$t.Settings.MultipleInstances.ToString();storedPassword=($t.Principal.LogonType -eq 'Password')}|ConvertTo-Json"
  output+='COMMAND: Get-ScheduledTask / Get-ScheduledTaskInfo (selected non-identity fields only)\n'
  p=subprocess.run(['pwsh','-NoProfile','-Command',command],capture_output=True,text=True,encoding='utf8',timeout=45);assert p.returncode==0;output+=p.stdout
 elif panel=='23-recovery-test':
  output+='COMMAND: pathlib.Path(artifacts/azure/helper-version-20261020/auto-recovery-test.json).read_text()\n'
  data=json.loads((root/'artifacts/azure/helper-version-20261020/auto-recovery-test.json').read_text(encoding='utf8'))
  output+='status='+str(data.get('status'))+'\nstartedAt='+data['startedAt']+'\nfinishedAt='+str(data.get('finishedAt'))+'\npcRebootPerformed='+str(data['pcRebootPerformed'])+'\nscope='+data['scope']+'\n\nrole       before_pid  after_pid\n'
  for role,pid in data['before']['workers'].items():output+=f"{role:10} {pid:<11} {data.get('after',{}).get('workers',{}).get(role)}\n"
  output+='\nconnection='+json.dumps(data.get('after',{}).get('connection'))+'\n\nActual observed phase transitions (last 8):\n'
  for row in data['phases'][-8:]:output+=row['at']+' '+str(row['phase'])+'\n'
 else:
  output+='COMMAND: read last 12 structured helper runtime events (no raw worker output)\n'
  p=root/'tmp/helper-runtime/events.jsonl'
  for line in p.read_text(encoding='utf8').splitlines()[-12:]:
   v=json.loads(line);output+=v['at']+' | '+v['event']+' | '+str(v.get('role',v.get('code','-')))+' | '+str(v.get('pid','-'))+'\n'
 output+='\n[OBSERVATION COMPLETE]\n'
 if len(sys.argv)>2:pathlib.Path(sys.argv[2]).write_text(output,encoding='utf-16')
 else:sys.stdout.reconfigure(encoding='utf8');print(output)
 raise SystemExit(0)
s=importlib.util.spec_from_file_location('r',root/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
try:
 c=r.connect('CLOUD',None)
 try:code,output=r.ops.run(c,'sudo -n timeout 40s python3 /opt/highpass/terminal-evidence-20261020/read-only.py '+panel,seconds=48)
 finally:c.close()
 if code:print('REMOTE_QUERY_FAILED_'+str(code));raise SystemExit(1)
 if len(sys.argv)>2:
  pathlib.Path(sys.argv[2]).write_text(output,encoding='utf-16')
 else:
  sys.stdout.reconfigure(encoding='utf8');print(output,end='',flush=True)
except Exception as error:
 print('SSH_QUERY_ERROR_'+type(error).__name__);raise SystemExit(1)
