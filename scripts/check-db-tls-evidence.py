"""Read-only aggregate; no account names, addresses or query text returned."""
import importlib.util,json,pathlib,datetime
p=pathlib.Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('runtime',p/'health-helper-runtime-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.connect('CLOUD',None)
try:
 result=r.remote(c,'CLOUD',None,r'''
import subprocess,json
q="""BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce(json_agg(t),'[]') FROM (SELECT CASE WHEN a.client_addr IS NULL THEN 'local socket or internal backend' WHEN a.client_addr <<= '127.0.0.0/8'::inet OR a.client_addr='::1'::inet THEN 'loopback TCP' ELSE 'non-loopback TCP' END AS connection_kind,s.ssl,s.version,s.cipher,count(*) FROM pg_stat_ssl s JOIN pg_stat_activity a ON a.pid=s.pid GROUP BY 1,2,3,4) t; ROLLBACK;"""
out=subprocess.check_output(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',q],timeout=15)
print(out.decode())
''',30)
finally:c.close()
out=pathlib.Path.home()/'Downloads'/'MediQ_DB_암호화_증적_20261019'/'tls-connection-summary.json'
out.write_text(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'connections':result},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result))
