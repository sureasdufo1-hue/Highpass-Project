"""Read-only DB/storage metadata. Never select credentials, tokens or patient values."""
import importlib.util,json,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path.home()/'Downloads'/'MediQ_DB_암호화_증적_20261019'
OUT.mkdir(exist_ok=True)
def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('runtime','health-helper-runtime-check.py');az=load('identity','capstone-key-identities.py')
data={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'READ_ONLY_QUERY_RESULT_NOT_PORTAL_SCREENSHOT'}
c=r.connect('CLOUD',None)
try:
 data['database']=r.remote(c,'CLOUD',None,r'''
import subprocess,json
def run(args):return subprocess.check_output(args,timeout=15).decode()
def sql(q):return json.loads(run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',"BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; "+q+"; ROLLBACK;"]))
i=json.loads(run(['docker','inspect','hp-capstone-control-postgres-1']))[0]
mounts=[{'type':m['Type'],'source':m['Source'],'destination':m['Destination']} for m in i['Mounts'] if 'postgres' in m['Destination']]
columns=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND column_name ~* '(cipher|encrypt|wrapped|hash|nonce|salt)' ORDER BY table_name,column_name) t")
settings=sql("SELECT json_build_object('version',current_setting('server_version'),'ssl',current_setting('ssl'),'data_directory',current_setting('data_directory'),'extensions',(SELECT json_agg(extname) FROM pg_extension),'connections',(SELECT coalesce(json_agg(t),'[]') FROM (SELECT ssl,version,cipher,count(*) FROM pg_stat_ssl GROUP BY ssl,version,cipher) t))")
counts=[]
for item in columns:
 t=item['table_name'];col=item['column_name']
 if not all(s.replace('_','').isalnum() for s in [t,col]):continue
 q='SELECT json_build_object(\'table\',\''+t+'\',\'column\',\''+col+'\',\'rows\',count(*),\'present\',count("'+col+'"),\'min_length\',min(length("'+col+'"::text)),\'max_length\',max(length("'+col+'"::text))) FROM "'+t+'"'
 counts.append(sql(q))
fs=[]
for m in mounts:
 try:fs.append(json.loads(run(['findmnt','-J','-T',m['source'],'-o','SOURCE,FSTYPE,TARGET'])))
 except Exception:fs.append({'status':'NOT VERIFIED'})
print(json.dumps({'deployment':'PostgreSQL Docker container on Azure VM','image':i['Config']['Image'],'running':i['State']['Running'],'mounts':mounts,'filesystem':fs,'settings':settings,'protectionColumns':columns,'protectionCounts':counts,'valuesSelected':False}))
''',60)
finally:c.close()
for key,args in {
 'disks':['disk','list','-g','rg-highpass-capstone-20261008','--query','[].{name:name,location:location,encryption:encryption,osType:osType}'],
 'vm':['vm','show','-g','rg-highpass-capstone-20261008','-n','vm-highpass-capstone','--query','{name:name,location:location,osDisk:storageProfile.osDisk.name,dataDisks:storageProfile.dataDisks[].name,encryptionAtHost:securityProfile.encryptionAtHost}'],
 'vault':['keyvault','show','-n','kv-hp-demo-4869edd9','--query','{name:name,location:location,rbac:properties.enableRbacAuthorization,publicNetworkAccess:properties.publicNetworkAccess,purgeProtection:properties.enablePurgeProtection}']}.items():
 try:data[key]=az.azure(*args)
 except Exception as e:data[key]={'status':'NOT VERIFIED','errorType':type(e).__name__}
(OUT/'read-only-results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'folder':str(OUT),'data':data},ensure_ascii=False))
