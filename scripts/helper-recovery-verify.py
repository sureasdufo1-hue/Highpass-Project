"""Observe real application-generated metadata; no fabricated audit rows or auth tokens."""
import pathlib,importlib.util,json,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);c=r.connect('CLOUD',None)
try:
 out=r.remote(c,'CLOUD',None,r'''
import subprocess,json,time,socket,datetime
def run(a):return subprocess.run(a,text=True,capture_output=True,timeout=15)
def sql(q):
 p=run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='5s';"+q+';ROLLBACK;'])
 assert p.returncode==0
 return json.loads(p.stdout)
out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
out['connection']=json.loads(run(['docker','exec','hp-capstone-control-control-1','/nodejs/bin/node','--input-type=module','-e',"import {probeHelper} from '/app/src/security-helper-monitor.js'; console.log(JSON.stringify(await probeHelper()));"]).stdout)
out['requests']=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT left(md5(audit_session_id),10) AS request_alias,reason_code,result,created_at,helper_metadata FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST' AND helper_metadata IS NOT NULL ORDER BY created_at DESC LIMIT 8)t")
out['metadataCount']=sql("SELECT count(*) FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST' AND helper_metadata IS NOT NULL")
out['db']=sql("SELECT row_to_json(t) FROM (SELECT pg_postmaster_start_time() AS started,(SELECT count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s ON s.pid=a.pid WHERE a.client_addr IS NOT NULL AND NOT s.ssl) AS non_tls_tcp,(SELECT json_agg(r) FROM (SELECT state,sync_state FROM pg_stat_replication)r) AS replication)t")
out['peers']=[]
for i,line in enumerate(run(['wg','show','hp-capstone','latest-handshakes']).stdout.splitlines(),1):
 stamp=int(line.split()[1]);out['peers'].append({'alias':'peer-'+str(i),'lastHandshakeAgeSeconds':int(time.time())-stamp if stamp else None})
out['privateTcpReachability']={}
for label,host,port in [('A-gateway-9443','10.90.88.2',9443),('B-portal-9443','10.90.88.3',9443)]:
 try:
  with socket.create_connection((host,port),timeout=3):out['privateTcpReachability'][label]='REACHABLE'
 except OSError:out['privateTcpReachability'][label]='UNAVAILABLE'
print(json.dumps(out))
''',50)
finally:c.close()
folder=ROOT/'artifacts/azure/helper-recovery-20261020';folder.mkdir(parents=True,exist_ok=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S')
(folder/f'verification-{stamp}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
(folder/'latest-verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(out,ensure_ascii=True))
