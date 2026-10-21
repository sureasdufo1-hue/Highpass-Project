import importlib.util,json,pathlib
p=pathlib.Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('r',p/'health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.connect('CLOUD',None)
try:
 result=r.remote(c,'CLOUD',None,r'''
import subprocess,json
def run(a):return subprocess.check_output(a,timeout=15).decode()
def sql(q):return json.loads(run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='5s';"+q+';ROLLBACK;']))
cs=json.loads(run(['docker','inspect',*run(['docker','ps','-q']).split()]))
ips={v['IPAddress']:i['Name'] for i in cs for v in i['NetworkSettings']['Networks'].values() if v.get('IPAddress')}
rows=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT a.usename,a.datname,a.application_name,a.backend_type,a.state,host(a.client_addr) addr,s.ssl,s.version FROM pg_stat_activity a JOIN pg_stat_ssl s ON s.pid=a.pid) t")
for row in rows:row['clientContainer']=ips.get(row.pop('addr'),'host/remote/local')
containers=[]
for i in cs:
 if 'control-control' in i['Name']:
  env=dict(x.split('=',1) for x in i['Config']['Env'] if '=' in x)
  containers.append({'name':i['Name'],'health':i['State'].get('Health',{}).get('Status'),'started':i['State']['StartedAt'],'image':i['Image'],'command':i['Config']['Cmd'],'mounts':[{'source':m['Source'],'destination':m['Destination']} for m in i['Mounts']], 'safeEnv':{k:v for k,v in env.items() if k in ['POSTGRES_HOST','POSTGRES_DB','POSTGRES_USER','POSTGRES_SSL_MODE','POSTGRES_SSL_CA_FILE','PGSSLMODE']},'labels':{k:v for k,v in i['Config']['Labels'].items() if k.startswith('com.docker.compose.project')}})
print(json.dumps({'connections':rows,'control':containers,'hba':sql("SELECT json_agg(t) FROM (SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules) t"),'ssl':sql("SELECT json_agg(t) FROM (SELECT name,setting FROM pg_settings WHERE name IN ('ssl','ssl_cert_file','ssl_key_file','hba_file')) t")}))
''',45)
finally:c.close()
out=pathlib.Path.home()/'Downloads'/'MediQ_DB_암호화_증적_20261019'/'tls-diagnosis.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result))
