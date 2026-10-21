"""Sanitized incident inventory using pinned SSH; no credentials in output."""
import pathlib,importlib.util,json,subprocess,datetime,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
c=r.connect('CLOUD',None)
try:
 out['cloud']=r.remote(c,'CLOUD',None,r'''
import subprocess,json,pathlib,time,stat,socket
def run(a):return subprocess.run(a,capture_output=True,text=True,timeout=12)
def j(a):return json.loads(run(a).stdout)
out={}
raw=run(['wg','show','hp-capstone','dump']).stdout.splitlines();out['peers']=[]
for line in raw[1:]:
 p=line.split();out['peers'].append({'peerAlias':'peer-'+str(len(out['peers'])+1),'allowedIps':p[3],'lastHandshakeAgeSeconds':int(time.time())-int(p[4]) if int(p[4]) else None,'rxBytes':int(p[5]),'txBytes':int(p[6])})
out['units']=run(['systemctl','list-units','--all','--no-pager','--plain','--no-legend','*helper*','*ollama*','*wg-quick*']).stdout
out['helperSocket']={}
p=pathlib.Path('/home/highpassadmin/.highpass-helper/ollama.sock')
if p.exists():
 st=p.stat();out['helperSocket']={'exists':True,'socket':stat.S_ISSOCK(st.st_mode),'mode':oct(st.st_mode&0o777),'uid':st.st_uid,'gid':st.st_gid}
else:out['helperSocket']={'exists':False}
app=j(['docker','inspect','hp-capstone-control-control-1'])[0]
out['app']={'healthy':app['State'].get('Health',{}).get('Status'),'mounts':[{'source':x['Source'],'destination':x['Destination'],'rw':x['RW']} for x in app['Mounts'] if 'helper' in x['Destination']], 'helperEnv':[x for x in app['Config']['Env'] if x.startswith(('HIPASS_HEALTH_HELPER_MODEL=','HIPASS_HELPER_SOCKET=','HIPASS_OLLAMA_MODEL='))]}
out['sshUnixListenerLines']=[x for x in run(['ss','-xlpn']).stdout.splitlines() if 'ollama.sock' in x]
out['dbStarted']=run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c','SELECT pg_postmaster_start_time()']).stdout.strip()
print(json.dumps(out))
''',45)
finally:c.close()
for port in [11434,11436]:
 try:
  path='/api/tags' if port==11434 else '/health'
  with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}',timeout=4) as res:data=json.load(res)
  out[str(port)]={'http':200,'models':[{'name':x.get('name'),'digest':x.get('digest')} for x in data.get('models',[])]} if port==11434 else data
 except Exception as e:out[str(port)]={'error':type(e).__name__}
folder=ROOT/'artifacts/azure/helper-recovery-20261020';folder.mkdir(parents=True,exist_ok=True)
(folder/'diagnosis.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps(out,ensure_ascii=True))
