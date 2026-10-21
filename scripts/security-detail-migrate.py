"""Bounded additive nullable audit metadata column; no row updates or DB restart."""
import pathlib,json,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.connect('CLOUD',None)
try:
 result=r.remote(c,'CLOUD',None,r'''
import subprocess,json,pathlib
def sql(q):return subprocess.check_output(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','hipass','-c',q],timeout=10).decode().strip()
before=json.loads(sql("SELECT json_build_object('started',pg_postmaster_start_time(),'auditCount',(SELECT count(*) FROM audit_logs),'replication',(SELECT json_agg(t) FROM (SELECT pid,application_name,state FROM pg_stat_replication)t))"))
sql("BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='5s';ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS helper_metadata jsonb;COMMIT;")
ready=sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='helper_metadata' AND data_type='jsonb'")
assert ready=='1'
pathlib.Path('/opt/highpass/security-detail-20261020/db-before.json').write_text(json.dumps(before))
subprocess.run(['logger','-t','highpass-security-detail','Nullable helper audit metadata column added; no historical rows rewritten'],check=True,timeout=5)
print(json.dumps({'status':'PASS','nullableColumnAdded':True,'rowsRewritten':False,'databaseRestarted':False,'before':before}))
''',25)
finally:c.close()
(ROOT/'artifacts/azure/security-detail-20261020/migration.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
