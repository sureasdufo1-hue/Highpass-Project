"""Guarded schema32 additive deployment. No Session/Consent rows or listeners."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
from datetime import datetime, timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cloud_ops',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
FILE='032_highpass_v3_exchange_network_audit.sql'
EXPECTED_SHA='1b38d397d0db7dc97a279bcc13f9d3e3ab6842a23bd15da921006f4840ace36f'
BASELINE="""BEGIN READ ONLY;SELECT json_build_object(
 'database',current_database(),
 'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND c.relkind='r'),
 'schema32',to_regclass('highpass_v3.exchange_network_audit') IS NOT NULL,
 'sessions',(SELECT count(*) FROM highpass_v3.exchange_sessions),
 'sessionAudits',(SELECT count(*) FROM highpass_v3.exchange_audit_outbox),
 'sessionLedger',(SELECT count(*) FROM highpass_v3.exchange_write_results),
 'refs',(SELECT count(*) FROM highpass_v3.patient_refs),
 'mappings',(SELECT count(*) FROM highpass_v3.patient_mappings),
 'sourceScopes',(SELECT scopes FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'),
 'ledger',(SELECT json_agg(json_build_object('sequence',sequence,'file',file_name,'sha256',sha256,'bundle',bundle_sha256) ORDER BY sequence) FROM highpass_v3.deployment_migrations));ROLLBACK;"""

def build_sql(bundle,mode):
    if mode not in ('REHEARSAL','ACTIVATE'):raise RuntimeError('MODE_INVALID')
    raw=(ROOT/'db/migrations'/FILE).read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=EXPECTED_SHA:raise RuntimeError('SCHEMA32_CHECKSUM_NOT_REVIEWED')
    extension=hashlib.sha256(json.dumps(['HPV3-ADDITIVE-MIGRATION-V1',bundle['bundleSha256'],FILE,digest],separators=(',',':')).encode()).hexdigest()
    expected=','.join("(%d,'%s','%s','%s')"%(i+1,e['file'],e['sha256'],bundle['bundleSha256']) for i,e in enumerate(bundle['migrations']))
    end='ROLLBACK;' if mode=='REHEARSAL' else 'COMMIT;'
    sql=f"""BEGIN;SET LOCAL statement_timeout='3000ms';SET LOCAL lock_timeout='1000ms';
 DO $$ BEGIN
 IF current_database()<>'highpass_v3_capstone' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION 'SESSION_NETWORK_OPERATOR_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716031);
 IF to_regclass('highpass_v3.exchange_network_audit') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conname='exchange_audit_network_tuple')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hp_v3_schema_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hp_v3_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR pg_has_role('hp_v3_app','hp_v3_schema_owner','MEMBER')
 OR NOT pg_has_role('hp_v3_app','hp_v3_clinical_policy','MEMBER')
 OR pg_has_role('hp_v3_app','hp_v3_expiry_policy','MEMBER')
 OR NOT has_table_privilege('hp_v3_app','highpass_v3.exchange_audit_outbox','INSERT')
 OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'
  AND scopes=ARRAY['mapping:read','mapping:write','exchange:create','exchange:read'] AND status='ACTIVE')
 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
  WHERE c.oid='highpass_v3.exchange_audit_outbox'::regclass AND r.rolname='hp_v3_schema_owner' AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'SESSION_NETWORK_BASELINE_REQUIRED'; END IF;
 IF (SELECT count(*) FROM highpass_v3.deployment_migrations)<>25
 OR EXISTS(SELECT sequence,file_name,sha256,bundle_sha256 FROM highpass_v3.deployment_migrations EXCEPT SELECT * FROM (VALUES {expected}) v)
 THEN RAISE EXCEPTION 'SESSION_NETWORK_LEDGER_MISMATCH'; END IF;
 END $$;
 SET LOCAL ROLE hp_v3_schema_owner;
 {raw.decode('utf8')}
 RESET ROLE;
 -- INSERT-only runtime profile. No SELECT, mutation or new membership.
 GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
 ON highpass_v3.exchange_network_audit TO hp_v3_app;
 INSERT INTO highpass_v3.deployment_migrations(sequence,file_name,sha256,bundle_sha256,scope)
 VALUES(26,'{FILE}','{digest}','{extension}','CAPSTONE_SYNTHETIC_ONLY');
 SELECT json_build_object(
 'forcedRls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='highpass_v3.exchange_network_audit'::regclass),
 'nologinOwner',(SELECT r.rolname='hp_v3_schema_owner' AND NOT r.rolcanlogin FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='highpass_v3.exchange_network_audit'::regclass),
 'columnInsert',has_column_privilege('hp_v3_app','highpass_v3.exchange_network_audit','source_ip','INSERT'),
 'noRecordedAtInsert',NOT has_column_privilege('hp_v3_app','highpass_v3.exchange_network_audit','recorded_at','INSERT'),
 'noAuditRead',NOT has_table_privilege('hp_v3_app','highpass_v3.exchange_network_audit','SELECT'),
 'noMutation',NOT has_table_privilege('hp_v3_app','highpass_v3.exchange_network_audit','UPDATE,DELETE,TRUNCATE,TRIGGER'),
 'noUnverifiedBackfill',(SELECT count(*)=0 FROM highpass_v3.exchange_network_audit),
 'ledger26',(SELECT count(*)=26 FROM highpass_v3.deployment_migrations));
 {end}"""
    return sql,digest,extension

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    directory=ROOT/'artifacts/azure'/('v3-session-network-cloud-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));directory.mkdir(parents=True,exist_ok=False)
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','mode':'ACTIVATE' if args.apply else 'REHEARSAL','applied':False,'sessionCreated':False,'serviceActivated':False}
    client=paramiko.SSHClient();phase='LOCAL_CHECKSUM'
    try:
        generated=subprocess.run(['node','scripts/build-capstone-v3-bootstrap-sql.js'],cwd=ROOT,capture_output=True,check=True,timeout=10)
        bundle=json.loads(generated.stdout)
        if len(bundle['migrations'])!=25 or not re.fullmatch('[a-f0-9]{64}',bundle['bundleSha256']):raise RuntimeError('FROZEN_BUNDLE_REQUIRED')
        sql,digest,extension=build_sql(bundle,result['mode']);result.update(schemaSha256=digest,extensionSha256=extension,parentBundleSha256=bundle['bundleSha256'],sqlSha256=hashlib.sha256(sql.encode()).hexdigest())
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,allow_agent=False,timeout=10,auth_timeout=10,banner_timeout=10,channel_timeout=15)
        phase='READ_ONLY_BASELINE'
        health="test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_BASELINE_REQUIRED')
        before=json.loads(ops.sql(client,BASELINE,ops.TARGET))
        expected=[dict(sequence=i+1,file=e['file'],sha256=e['sha256'],bundle=bundle['bundleSha256']) for i,e in enumerate(bundle['migrations'])]
        if before['schema32'] or before['ledger']!=expected:raise RuntimeError('ALREADY_APPLIED_OR_LEDGER_DRIFT_RECONCILE_INSTEAD')
        phase='ATOMIC_SQL_DISPATCH'
        if args.apply:result['applied']='OUTCOME UNKNOWN UNTIL RECONCILED'
        checks=json.loads(ops.sql(client,sql,ops.TARGET))
        if args.apply:result['applied']=True
        if len(checks)!=8 or any(v is not True for v in checks.values()):raise RuntimeError('SCHEMA_CHECK_FAILED')
        phase='POSTCHECK'
        after=json.loads(ops.sql(client,BASELINE,ops.TARGET))
        expected_after=dict(before)
        if args.apply:expected_after.update(schema32=True,tables=before['tables']+1,ledger=expected+[dict(sequence=26,file=FILE,sha256=digest,bundle=extension)])
        if after!=expected_after:raise RuntimeError('POSTCHECK_OR_ROLLBACK_MISMATCH')
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        result.update(status='PASS',checks=checks,originalLedger25Preserved=True,businessRowCountsPreserved=True,existingLegacyHealthy='PASS',rollbackBaselinePreserved=not args.apply)
    except Exception as error:
        result.update(status='NOT VERIFIED',phase=phase,reason=str(error) if isinstance(error,RuntimeError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__)
    finally:client.close()
    path=directory/'result.json';path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    sha=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,timeout=5).stdout.strip()
    manifest={'repositorySha':sha,'containsSecrets':False,'containsPersonalData':False,'evidence':[{'evidenceId':'session-network-cloud-'+result['mode'].lower(),'sourcePath':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'repositorySha':sha,'reviewStatus':'DRAFT','reviewer':'UNASSIGNED','containsSecrets':False,'containsPersonalData':False}]}
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    print(json.dumps({**result,'evidence':str(path)},indent=2),flush=True)
    return 0 if result['status']=='PASS' else 1

if __name__=='__main__':raise SystemExit(main())
