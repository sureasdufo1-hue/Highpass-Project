"""Controlled outage of the three exact MediQ workers, never unrelated processes."""
import pathlib,importlib.util,json,time,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('supervisor',ROOT/'scripts/helper-runtime-supervisor.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
m.psutil.Process().nice(m.psutil.NORMAL_PRIORITY_CLASS);m.psutil.Process().ionice(m.psutil.IOPRIO_NORMAL)
ready_deadline=time.monotonic()+75
while True:
 before=json.loads((m.STATE/'status.json').read_text(encoding='utf8'))
 fresh=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(before['observedAt'])).total_seconds()<45
 supervisor_alive=m.psutil.pid_exists(before['supervisorPid'])
 daemon=supervisor_alive and '--once' not in m.psutil.Process(before['supervisorPid']).cmdline()
 if before.get('phase')=='READY' and fresh and daemon:break
 if time.monotonic()>ready_deadline:raise RuntimeError('RECOVERY_TEST_PREFLIGHT_NOT_READY')
 time.sleep(.5)
assert before['phase']=='READY' and m.get(11436,'/health').get('busy') is False
workers={role:m.psutil.Process(pid) for role,pid in before['workers'].items()}
assert all(m.matches(role,p) for role,p in workers.items())
out={'startedAt':m.utc(),'scope':'EXACT_MEDIQ_WORKERS_ONLY','before':before,'pcRebootPerformed':False,'phases':[]}
m.emit('OPERATOR_RECOVERY_TEST_STOP',roles=['relay','ssh','ollama'])
for role in ['relay','ssh','ollama']:
 p=workers[role];assert m.matches(role,p);p.terminate();p.wait(timeout=12)
deadline=time.monotonic()+240;last=None
while time.monotonic()<deadline:
 try:
  value=json.loads((m.STATE/'status.json').read_text(encoding='utf8'))
  if value.get('phase')!=last:out['phases'].append({'at':m.utc(),'phase':value.get('phase')});last=value.get('phase')
  changed=all(value.get('workers',{}).get(role)!=before['workers'][role] and value.get('workers',{}).get(role) for role in workers)
  if changed and value.get('phase')=='READY' and all(m.matches(role,m.psutil.Process(pid)) for role,pid in value['workers'].items()):
   out.update(status='PASS',after=value,finishedAt=m.utc());break
 except (ValueError,OSError,m.psutil.Error):pass
 time.sleep(2)
else:out.update(status='FAIL',finishedAt=m.utc())
p=ROOT/'artifacts/azure/helper-version-20261020/auto-recovery-test.json';p.write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out),flush=True)
if out['status']!='PASS':raise SystemExit(1)
