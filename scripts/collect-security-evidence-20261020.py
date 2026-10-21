"""Read-only allowlisted observability evidence. Never selects prompt/secret values."""
import importlib.util,json,pathlib,datetime,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path.home()/'Downloads'/'MediQ_관제증적_20261020'
for part in ('queries','original','annotated','editable'):(OUT/part).mkdir(parents=True,exist_ok=True)
def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('runtime','health-helper-runtime-check.py')
c=r.connect('CLOUD',None)
try:
 data=r.remote(c,'CLOUD',None,r'''
import subprocess,json,hashlib,datetime
def run(a):return subprocess.check_output(a,timeout=15).decode()
def sql(q):return json.loads(run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','hipass','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='5s';"+q+';ROLLBACK;']))
items=json.loads(run(['docker','inspect','hp-capstone-control-control-1','hp-capstone-control-postgres-1','hp-public-web-waf-1']))
app,db,waf=items;env=dict(x.split('=',1) for x in app['Config']['Env'] if '=' in x)
cols=sql("SELECT json_agg(t) FROM (SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name='audit_logs' OR column_name ~* '(cipher|encrypt|wrapped|hash|nonce|salt|password)') ORDER BY table_name,column_name)t")
counts=[]
for x in cols:
 if not any(z in x['column_name'] for z in ['hash','cipher','encrypt','wrapped','password']):continue
 t,col=x['table_name'],x['column_name'];assert all(z.replace('_','').isalnum() for z in (t,col))
 counts.append(sql(f"SELECT json_build_object('table','{t}','column','{col}','rows',count(*),'present',count(\"{col}\"),'minLength',min(length(\"{col}\"::text)),'maxLength',max(length(\"{col}\"::text))) FROM \"{t}\""))
events=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT action,result,reason_code,count(*) events,min(created_at) first_seen,max(created_at) last_seen FROM audit_logs GROUP BY action,result,reason_code ORDER BY count(*) DESC)t")
helpers=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT audit_session_id,action,result,reason_code,created_at FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST' ORDER BY created_at DESC LIMIT 240)t")
# Stable local pseudonyms preserve request correlation without exposing original identifiers.
for x in helpers:x['requestRef']='REQ-'+hashlib.sha256(str(x.pop('audit_session_id')).encode()).hexdigest()[:10]
tls=sql("SELECT json_build_object('ssl',current_setting('ssl'),'dbStarted',pg_postmaster_start_time(),'hbaErrors',(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL),'connections',(SELECT json_agg(t) FROM (SELECT a.backend_type,s.ssl,s.version,count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s ON a.pid=s.pid WHERE a.client_addr IS NOT NULL GROUP BY 1,2,3)t),'nonTlsTcp',(SELECT count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s ON a.pid=s.pid WHERE a.client_addr IS NOT NULL AND NOT s.ssl))")
mount=next(m for m in db['Mounts'] if m['Destination']=='/var/lib/postgresql/data')
storage={'kind':'PostgreSQL container on Azure VM','version':sql("SELECT to_json(current_setting('server_version'))"),'dataDirectory':mount['Destination'],'volumeType':mount['Type'],'filesystem':json.loads(run(['findmnt','-J','-T',mount['Source'],'-o','SOURCE,FSTYPE,TARGET'])),'running':db['State']['Running']}
node="import {probeHelper} from '/app/src/security-helper-monitor.js';console.log(JSON.stringify(await probeHelper()));"
probe=json.loads(run(['docker','exec',app['Id'],'/nodejs/bin/node','--input-type=module','-e',node]))
safeConfig={k:env.get(k) for k in ['HIPASS_HEALTH_HELPER_MODEL','HIPASS_HELPER_SOCKET','HIPASS_POSTGRES_TLS_REQUIRED','HIPASS_POSTGRES_TLS_SERVERNAME']}
shape={'modelName':env.get('OLLAMA_MODEL',env.get('HIPASS_HEALTH_HELPER_MODEL_NAME')),'metadataColumns':[x['column_name'] for x in cols if x['table_name']=='audit_logs']}
# Only inspect static code and an allowlisted health result, never raw application log lines.
static=run(['docker','exec',app['Id'],'/nodejs/bin/node','-e',"const f=require('fs');console.log(f.readFileSync('/app/src/health-helper-rag.js','utf8'))"])
shape['auditCallIncludesMetadata']=any(k in static[static.find('const log ='):static.find('const reject =')] for k in ['sourceIds','corpusVersion','modelName'])
shape['modelTagInCode']='qwen3.5:4b' if 'qwen3.5:4b' in run(['docker','exec',app['Id'],'/nodejs/bin/node','-e',"const f=require('fs');console.log(f.readFileSync('/app/src/security-helper-monitor.js','utf8'))"]) else None
hba=sql("SELECT json_agg(t) FROM (SELECT type,database,auth_method FROM pg_hba_file_rules WHERE type='hostnossl')t")
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'LIVE_READ_ONLY_QUERY','storage':storage,'tls':tls,'hbaTlsDenyRules':hba,'columns':cols,'columnCounts':counts,'auditAggregates':events,'helperEvents':helpers,'helperConnection':probe,'helperConfig':safeConfig,'helperLogCoverage':shape,'waf':{'running':waf['State']['Running'],'image':waf['Image'],'driver':waf['HostConfig']['LogConfig']['Type']},'controlHealth':app['State'].get('Health',{}).get('Status'),'noRawValuesRead':True}))
''',55)
finally:c.close()
(OUT/'queries/runtime.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'saved':str(OUT/'queries/runtime.json'),'health':data['controlHealth'],'helper':data['helperConnection'],'auditGroups':len(data['auditAggregates']),'helperLogs':len(data['helperEvents'])}))
