"""Scoped TLS preparation, probes and HBA enforcement; never restarts DB."""
import importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
PROGRAM=r'''
import json,pathlib,subprocess,os,hashlib,time
BASE=pathlib.Path('/opt/highpass/db-tls-20261019');F=BASE/'control';DB='hp-capstone-control-postgres-1';APP='hp-capstone-control-control-1'
def run(args,data=None):
 p=subprocess.run(args,input=data,text=True,capture_output=True,timeout=25)
 if p.returncode:raise RuntimeError('COMMAND_FAILED')
 return p.stdout.strip()
def sql(q):return run(['docker','exec',DB,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','hipass','-c',q])
def snapshot():
 return json.loads(sql("SELECT json_build_object('dbStarted',pg_postmaster_start_time(),'connections',(SELECT json_agg(t) FROM (SELECT a.usename,a.backend_type,s.ssl,s.version,count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s ON s.pid=a.pid WHERE a.client_addr IS NOT NULL GROUP BY 1,2,3,4) t),'replication',(SELECT json_agg(t) FROM (SELECT pid,application_name,state,sync_state FROM pg_stat_replication) t),'nonTlsTcp',(SELECT count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s ON s.pid=a.pid WHERE a.client_addr IS NOT NULL AND NOT s.ssl),'hbaErrors',(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL))"))
if phase=='prepare':
 ca=pathlib.Path('/opt/highpass/dr-source/root-ca.crt').read_bytes();assert b'BEGIN CERTIFICATE' in ca and b'PRIVATE' not in ca
 (F/'ca.crt').write_bytes(ca);(F/'ca.crt').chmod(0o644);BASE.chmod(0o711);F.chmod(0o711)
 config=json.loads((F/'after.json').read_text());app=config['services']['control'];app['environment'].update(HIPASS_POSTGRES_TLS_REQUIRED='1',HIPASS_POSTGRES_TLS_CA_FILE='/run/db-tls/ca.crt',HIPASS_POSTGRES_TLS_SERVERNAME='highpass-v3-postgres.invalid')
 app['volumes']=[v for v in app['volumes'] if v.get('target')!='/run/db-tls/ca.crt']+[{'type':'bind','source':str(F/'ca.crt'),'target':'/run/db-tls/ca.crt','read_only':True}]
 (F/'after.json').write_text(json.dumps(config));(F/'after.json').chmod(0o600)
 before=snapshot();(BASE/'db-before.json').write_text(json.dumps(before));print(json.dumps({'prepared':True,'before':before}))
elif phase in ('probe','verify'):
 # Use existing runtime credentials inside the container; never emit them.
 js=r"""const fs=require('fs'),{Client}=require('pg'),tls=require('tls');let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',async()=>{try{
 const ca=JSON.parse(raw).ca,env=process.env;
 const configs=[{label:'main',host:env.POSTGRES_HOST,database:env.POSTGRES_DB,user:env.POSTGRES_USER,password:fs.readFileSync(env.POSTGRES_PASSWORD_FILE,'utf8').trim()}];
 if(env.HIPASS_PACS_TRANSFER_DATABASE_URL_FILE)configs.push({label:'pacs',connectionString:fs.readFileSync(env.HIPASS_PACS_TRANSFER_DATABASE_URL_FILE,'utf8').trim()});
 if(env.HIPASS_CAPSTONE_PATIENT_GRANTS==='1')configs.push({label:'patient',host:env.POSTGRES_HOST,database:env.POSTGRES_DB,user:'hipass_patient_authority',password:fs.readFileSync(env.HIPASS_PATIENT_AUTHORITY_PASSWORD_FILE||'/run/secrets/patient-authority-password','utf8').trim()});
 const out=[];
 for(const x of configs){if(x.connectionString&&[...new URL(x.connectionString).searchParams.keys()].some(k=>/^ssl/i.test(k)))throw Error('URL_TLS_OVERRIDE');const c=new Client({...x,ssl:{ca,rejectUnauthorized:true,minVersion:'TLSv1.2',checkServerIdentity:(_,cert)=>tls.checkServerIdentity('highpass-v3-postgres.invalid',cert)},connectionTimeoutMillis:5000,query_timeout:5000});try{await c.connect();const v=(await c.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];out.push({label:x.label,...v});}finally{await c.end();}}
 for(const [label,ssl] of [['wrong-host',{ca,rejectUnauthorized:true,checkServerIdentity:(_,cert)=>tls.checkServerIdentity('wrong.invalid',cert)}],['untrusted-ca',{rejectUnauthorized:true}]]){const c=new Client({...configs[0],ssl,connectionTimeoutMillis:5000});try{await c.connect();out.push({label,denied:false});}catch(e){out.push({label,denied:true,code:e.code});}finally{await c.end();}}
 console.log(JSON.stringify(out));}catch(e){console.log(JSON.stringify({errorCode:e.code||'PROBE_FAILED'}));process.exitCode=1;}});"""
 probes=json.loads(run(['docker','exec','-i',APP,'/nodejs/bin/node','-e',js],json.dumps({'ca':(F/'ca.crt').read_text()})))
 assert all(p.get('ssl') is True or p.get('denied') is True for p in probes)
 result={'probes':probes,'snapshot':snapshot()}
 if phase=='verify':
  before=json.loads((BASE/'db-before.json').read_text());after=result['snapshot'];assert after['dbStarted']==before['dbStarted'];assert after['replication']==before['replication'];assert after['nonTlsTcp']==0
  # No credential transmitted in the plaintext negative probe.
  denied=subprocess.run(['docker','exec','-e','PGSSLMODE=disable',DB,'psql','-X','-w','-h','127.0.0.1','-U','hipass_app','-d','hipass','-c','SELECT 1'],text=True,capture_output=True,timeout=8)
  assert denied.returncode!=0 and 'pg_hba.conf rejects connection' in denied.stderr
  result.update(dbRestarted=False,replicationSessionUnchanged=True,plaintextDenied=True)
 print(json.dumps(result))
elif phase=='enforce':
 assert snapshot()['nonTlsTcp']==0,'PLAINTEXT_CLIENT_REMAINS'
 mount=json.loads(run(['docker','inspect',DB]))[0]['Mounts'];data=pathlib.Path(next(m['Source'] for m in mount if m['Destination']=='/var/lib/postgresql/data'))
 hba=data/'pg_hba.conf';old=hba.read_bytes();assert b'HIGHPASS_ALL_TCP_TLS_20261019' not in old
 block=b'# HIGHPASS_ALL_TCP_TLS_20261019\nhostnossl all all all reject\nhostnossl replication all all reject\n'
 backup=BASE/'hba.before';assert not backup.exists();backup.write_bytes(old);backup.chmod(0o600)
 new=block+old;st=hba.stat();tmp=data/'pg_hba.tls-20261019.pending'
 assert not tmp.exists();tmp.write_bytes(new);os.chown(tmp,st.st_uid,st.st_gid);tmp.chmod(st.st_mode&0o777)
 assert hba.read_bytes()==old;tmp.replace(hba)
 try:
  assert sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')=='0'
  assert sql('SELECT pg_reload_conf()')=='t'
 except Exception:
  if hba.read_bytes()==new:hba.write_bytes(old);sql('SELECT pg_reload_conf()')
  raise
 run(['logger','-t','highpass-db-tls','Non-TLS TCP rejected after verified Control TLS migration; DB not restarted'])
 print(json.dumps({'hbaReloaded':True,'beforeHash':hashlib.sha256(old).hexdigest(),'afterHash':hashlib.sha256(new).hexdigest()}))
'''
phase=sys.argv[1];assert phase in ('prepare','probe','enforce','verify')
c=r.connect('CLOUD',None)
try:result=r.remote(c,'CLOUD',None,'phase='+repr(phase)+'\n'+PROGRAM,55)
finally:c.close()
out=ROOT/'artifacts/azure/db-tls-20261019';out.mkdir(parents=True,exist_ok=True)
(out/('tls-'+phase+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result))
