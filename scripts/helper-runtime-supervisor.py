"""Per-user, loopback-only helper recovery. No passwords, prompts or tokens logged."""
import pathlib,os,sys,time,json,datetime,subprocess,urllib.request,importlib.util,socket,ctypes,threading
import psutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'tmp/helper-runtime'
MODEL='qwen3.5:4b';SOCKET='/home/highpassadmin/.highpass-helper/ollama.sock'
OLLAMA=pathlib.Path(os.environ['LOCALAPPDATA'])/'Programs/Ollama/ollama.exe'
NODE=pathlib.Path(os.environ['ProgramFiles'])/'nodejs/node.exe'
SSH=pathlib.Path(os.environ['WINDIR'])/'System32/OpenSSH/ssh.exe'
KEY=pathlib.Path.home()/'.ssh/highpass-capstone-cloud'
RELAY=ROOT/'scripts/health-helper-local-relay.js'
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(port,path,timeout=4,body=None):
 data=None if body is None else json.dumps(body).encode()
 req=urllib.request.Request(f'http://127.0.0.1:{port}{path}',data=data,headers={'content-type':'application/json'})
 # Fixed local endpoints must never inherit a system/HTTP proxy.
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=timeout) as res:
  raw=res.read(65537)
  if len(raw)>65536:raise RuntimeError('RESPONSE_TOO_LARGE')
  return json.loads(raw)
def emit(event,**safe):
 STATE.mkdir(parents=True,exist_ok=True)
 p=STATE/'events.jsonl'
 if p.exists() and p.stat().st_size>1024*1024:p.replace(STATE/'events.previous.jsonl')
 with p.open('a',encoding='utf8') as f:f.write(json.dumps({'at':utc(),'event':event,**safe})+'\n')
def save(value):
 STATE.mkdir(parents=True,exist_ok=True);p=STATE/'status.tmp'
 p.write_text(json.dumps({'observedAt':utc(),'supervisorPid':os.getpid(),'startupMode':'DIAGNOSTIC_ONCE' if '--once' in sys.argv else 'USER_LOGON','privilege':'USER_LIMITED',**value},indent=2),encoding='utf8');p.replace(STATE/'status.json')
def matches(role,p):
 try:
  args=p.cmdline();exe=pathlib.Path(p.exe())
  if role=='ollama':return exe==OLLAMA and args[1:]==['serve']
  if role=='relay':return exe==NODE and len(args)==2 and pathlib.Path(args[1])==RELAY
  return exe==SSH and '-R' in args and SOCKET+':127.0.0.1:11436' in args and str(KEY/'id_ed25519').replace('\\','/') in [a.replace('\\','/') for a in args]
 except (psutil.Error,OSError):return False
def find(role):
 names={'ollama':'ollama.exe','relay':'node.exe','ssh':'ssh.exe'}
 for p in psutil.process_iter(['name']):
  if (p.info['name'] or '').lower()==names[role] and matches(role,p):return p
 return None
def start(role):
 args={'ollama':[str(OLLAMA),'serve'],'relay':[str(NODE),str(RELAY)],'ssh':[str(SSH),'-N','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(KEY/'known_hosts'),'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-i',str(KEY/'id_ed25519'),'-R',SOCKET+':127.0.0.1:11436','highpassadmin@138.91.2.60']}[role]
 env={**os.environ,'OLLAMA_HOST':'127.0.0.1:11434','OLLAMA_NO_CLOUD':'1','OLLAMA_DEBUG_LOG_REQUESTS':'false'}
 p=subprocess.Popen(args,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
 def drain():
  # Drain native worker output without retaining config, prompts or raw errors.
  for raw in iter(p.stdout.readline,b''):
   line=raw.decode('utf8',errors='replace').lower()
   if 'listening on' in line:emit('MODEL_LISTENING',role=role)
   elif 'discovering available gpu' in line:emit('MODEL_GPU_DISCOVERY',role=role)
   elif 'bind:' in line:emit('WORKER_BIND_FAILED',role=role)
   elif 'host key verification failed' in line:emit('SSH_HOST_KEY_REJECTED')
   elif 'remote port forwarding failed' in line:emit('SSH_FORWARD_FAILED')
   elif 'level=error' in line:emit('WORKER_ERROR_RAW_WITHHELD',role=role)
 threading.Thread(target=drain,daemon=True).start()
 worker=psutil.Process(p.pid)
 worker.nice(psutil.NORMAL_PRIORITY_CLASS);worker.ionice(psutil.IOPRIO_NORMAL)
 emit('WORKER_STARTED',role=role,pid=p.pid);return worker
def port_open(port):
 try:
  with socket.create_connection(('127.0.0.1',port),timeout=1):return True
 except OSError:return False
runtime=None
def cloud(program):
 global runtime
 if runtime is None:
  s=importlib.util.spec_from_file_location('helper_ops_runtime',ROOT/'scripts/health-helper-runtime-check.py');runtime=importlib.util.module_from_spec(s);s.loader.exec_module(runtime)
 c=runtime.connect('CLOUD',None)
 try:return runtime.remote(c,'CLOUD',None,program,20)
 finally:c.close()
def prepare_socket():
 return cloud(r'''
import subprocess,pathlib,stat,json,os,pwd
p=pathlib.Path('/home/highpassadmin/.highpass-helper/ollama.sock');assert p.parent.resolve()==p.parent and not p.is_symlink()
live=str(p) in subprocess.check_output(['ss','-xlpn'],text=True,timeout=5)
removed=False
if p.exists():
 st=p.stat();assert stat.S_ISSOCK(st.st_mode)
 if not live:
  assert p.stat().st_ino==st.st_ino;p.unlink();removed=True
 else:os.chown(p,pwd.getpwnam('highpassadmin').pw_uid,65532);os.chmod(p,0o660)
print(json.dumps({'listener':live,'staleRemoved':removed}))
''')
def probe():
 return cloud("import subprocess,json;p=subprocess.run(['docker','exec','hp-capstone-control-control-1','/nodejs/bin/node','--input-type=module','-e',\"import {probeHelper} from '/app/src/security-helper-monitor.js';console.log(JSON.stringify(await probeHelper()));\"],capture_output=True,text=True,timeout=8);assert p.returncode==0;print(p.stdout)")
def cycle(last_warm):
 workers={role:find(role) for role in ['ollama','relay','ssh']}
 status={'phase':'CHECKING','workers':{k:v.pid if v else None for k,v in workers.items()}};save(status)
 if not workers['ollama']:
  if port_open(11434):raise RuntimeError('MODEL_PORT_OWNER_MISMATCH')
  workers['ollama']=start('ollama');last_warm=0
 try:tags=get(11434,'/api/tags')
 except Exception:
  if time.time()-workers['ollama'].create_time()>90:
   workers['ollama'].terminate();workers['ollama'].wait(timeout=8);emit('MODEL_UNRESPONSIVE_RESTART')
  save({**status,'phase':'MODEL_STARTING'});return last_warm
 if not any(x.get('name')==MODEL for x in tags.get('models',[])):raise RuntimeError('MODEL_NOT_INSTALLED')
 if time.monotonic()-last_warm>600:
  save({**status,'phase':'MODEL_WARMING'})
  loaded=get(11434,'/api/generate',180,{'model':MODEL,'prompt':'','stream':False,'keep_alive':'30m','options':{'num_ctx':2048}})
  if loaded.get('done') is not True:raise RuntimeError('MODEL_WARM_FAILED')
  last_warm=time.monotonic();emit('MODEL_WARMED',model=MODEL)
 if workers['relay']:
  try:health=get(11436,'/health')
  except Exception:health={}
  if health.get('protocolVersion')!=2:
   if health.get('busy'):raise RuntimeError('RELAY_BUSY_UPGRADE_WAIT')
   workers['relay'].terminate();workers['relay'].wait(timeout=8);workers['relay']=None
 if not workers['relay']:
  if port_open(11436):raise RuntimeError('RELAY_PORT_OWNER_MISMATCH')
  workers['relay']=start('relay')
 prepared=prepare_socket()
 if workers['ssh'] and not prepared['listener']:
  workers['ssh'].terminate();workers['ssh'].wait(timeout=8);workers['ssh']=None
  emit('FORWARD_PROCESS_RESTARTED')
 if not workers['ssh']:
  if prepared['listener']:raise RuntimeError('FORWARD_ALREADY_ACTIVE_UNOWNED')
  if prepared['staleRemoved']:emit('STALE_SOCKET_RECREATED')
  workers['ssh']=start('ssh')
 # Restore only the original group/mode, not a wider socket permission.
 prepare_socket()
 connection=probe()
 state='READY' if connection.get('transport')=='REACHABLE' and connection.get('relay')=='READY' and connection.get('model')=='AVAILABLE' else 'CONNECTING'
 loaded=get(11434,'/api/ps').get('models',[])
 digest=next((x.get('digest') for x in loaded if x.get('name')==MODEL),None)
 save({'phase':state,'workers':{k:v.pid if v else None for k,v in workers.items()},'connection':connection,'model':MODEL,'loadedDigest':digest,'lastWarmAtMonotonic':round(last_warm)})
 return last_warm
def main():
 STATE.mkdir(parents=True,exist_ok=True)
 if '--status' in sys.argv:print((STATE/'status.json').read_text(encoding='utf8'));return
 # Normal priority is not elevated privilege; Task Scheduler's default low I/O
 # priority can starve model loading and network setup on a busy demo workstation.
 psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS)
 psutil.Process().ionice(psutil.IOPRIO_NORMAL)
 kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.CreateMutexW.restype=ctypes.c_void_p
 kernel.CreateMutexW.argtypes=[ctypes.c_void_p,ctypes.c_bool,ctypes.c_wchar_p]
 kernel.CloseHandle.argtypes=[ctypes.c_void_p]
 ctypes.set_last_error(0)
 lock=kernel.CreateMutexW(None,False,'Local\\MediQHealthHelperRuntime')
 if ctypes.get_last_error()==183:
  emit('DUPLICATE_SUPERVISOR_SKIPPED');kernel.CloseHandle(ctypes.c_void_p(lock));return
 emit('SUPERVISOR_STARTED');last_warm=0
 try:
  while True:
   try:last_warm=cycle(last_warm)
   except Exception as error:
    # Only bounded error class/code, never SSH stderr, credentials or model text.
    code=str(error) if isinstance(error,RuntimeError) and str(error).replace('_','').isalnum() else type(error).__name__
    save({'phase':'RETRYING','safeError':code});emit('RECOVERY_RETRY',code=code)
   if '--once' in sys.argv:break
   time.sleep(15)
 finally:kernel.CloseHandle(ctypes.c_void_p(lock))
if __name__=='__main__':main()
