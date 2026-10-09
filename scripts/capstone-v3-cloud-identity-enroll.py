"""Pinned capstone nonowner DB logins. Root-only remote secrets; no service activation."""
import importlib.util
import json
import os
import pathlib
import re
import shlex
import subprocess
import uuid
from datetime import datetime, timezone

import paramiko
import argparse

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ops = load('bootstrap', 'capstone-v3-cloud-bootstrap.py')
credentials = load('credentials', 'capstone-v3-credential-material.py')

# Executed as root through pinned SSH. Payload has secrets; never command argv.
# Each subprocess captures/discards raw errors. No patient rows are queried.
REMOTE = r'''
import json,os,pathlib,re,subprocess,sys
p=json.load(sys.stdin)
roles=('hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader')
target='highpass_v3_capstone';pg='hp-capstone-control-postgres-1'
if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{32}',p['operation']) or tuple(p['material'])!=roles:raise SystemExit(2)
directory=pathlib.Path('/opt/highpass/v3-identity-secrets-'+p['operation'])
for role in roles:
 row=p['material'][role]
 if not re.fullmatch('[a-f0-9]{64}',row['password']) or not re.fullmatch(r'SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]{22}==[$][A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=',row['verifier']):raise SystemExit(2)
def run(args,input=None):
 r=subprocess.run(args,input=input,capture_output=True,timeout=30)
 if r.returncode:raise RuntimeError('REMOTE_OPERATION_FAILED')
 if len(r.stdout)>32768:raise RuntimeError('OUTPUT_LIMIT')
 return r.stdout.decode().strip()
def sql(body):
 return run(['docker','exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d',target],body.encode())
result={'status':'NOT VERIFIED','credentialsIssued':False,'profileInstalled':False,'serviceActivated':False,'clinicalReadiness':'NOT VERIFIED'}
try:
 # Refuse optional SQL statement auditors rather than risk verifier logging.
 auditor=sql("BEGIN READ ONLY;SELECT count(*) FROM pg_extension WHERE extname='pgaudit';SELECT current_setting('shared_preload_libraries');ROLLBACK;")
 if auditor.splitlines()[0]!='0' or 'pgaudit' in auditor:raise RuntimeError('SQL_AUDITOR_NOT_VERIFIED')
 os.umask(0o077);directory.mkdir(mode=0o700)
 file=directory/'roles.json'
 with file.open('x',encoding='utf8') as stream:
  json.dump({'scope':'CAPSTONE_SYNTHETIC_ONLY','operation':p['operation'],'database':target,
   'roles':{role:{'username':role,'password':p['material'][role]['password']} for role in roles}},stream)
  stream.flush();os.fsync(stream.fileno())
 if file.stat().st_mode&0o777!=0o600 or directory.stat().st_mode&0o777!=0o700:raise RuntimeError('SECRET_PERMISSIONS_INVALID')
 names=','.join("'"+role+"'" for role in roles)
 guard="DO $$ BEGIN PERFORM pg_advisory_xact_lock(194716031); IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ("+names+")) THEN RAISE EXCEPTION 'ROLE_COLLISION'; END IF; IF (SELECT count(*) FROM highpass_v3.deployment_migrations WHERE bundle_sha256='"+p['bundleSha256']+"')<>25 THEN RAISE EXCEPTION 'LEDGER_MISMATCH'; END IF; END $$;"
 creation=''.join("CREATE ROLE "+role+" LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 8 PASSWORD '"+p['material'][role]['verifier']+"';" for role in roles)
 grants=p['sql']
 if not grants.startswith('BEGIN;') or not grants.endswith('COMMIT;'):raise RuntimeError('GRANT_TRANSACTION_INVALID')
 logging="SET log_statement='none';SET log_min_error_statement='panic';SET log_min_messages='panic';SET log_duration=off;SET log_min_duration_statement=-1;SET log_min_duration_sample=-1;SET log_statement_sample_rate=0;"
 sql(logging+'BEGIN;SET LOCAL statement_timeout=3000;SET LOCAL lock_timeout=1000;'+guard+creation+grants[len('BEGIN;'):-len('COMMIT;')]+'COMMIT;')
 result.update(credentialsIssued=True,profileInstalled=True,secretRemotePath=str(file),secretProtection='ROOT_ONLY_0700_DIRECTORY_0600_FILE')
 # Real SCRAM login to container-local TCP. Credentials only via protected pgpass.
 auth=[]
 for role in roles:
  temp='/tmp/hp-v3-auth-'+p['operation']+'-'+role
  bad=temp+'-invalid'
  try:
   pgpass='127.0.0.1:5432:'+target+':'+role+':'+p['material'][role]['password']+'\n'
   run(['docker','exec','-i',pg,'sh','-c','umask 077; set -C; cat > '+temp],pgpass.encode())
   badpass='127.0.0.1:5432:'+target+':'+role+':'+'0'*64+'\n'
   run(['docker','exec','-i',pg,'sh','-c','umask 077; set -C; cat > '+bad],badpass.encode())
   negative=subprocess.run(['docker','exec','-e','PGPASSFILE='+bad,pg,'psql','-X','-qAt','-w','-h','127.0.0.1','-U',role,'-d',target,'-c','SELECT 1'],capture_output=True,timeout=10)
   if negative.returncode!=2 or b'password authentication failed' not in negative.stderr:raise RuntimeError('PASSWORD_AUTHENTICATION_NOT_ENFORCED')
   query="BEGIN READ ONLY;SELECT current_user||'|'||current_database()||'|'||current_setting('transaction_read_only');ROLLBACK;"
   value=run(['docker','exec','-e','PGPASSFILE='+temp,pg,'psql','-X','-qAt','-w','-h','127.0.0.1','-U',role,'-d',target,'-c',query])
   if value!=role+'|'+target+'|on':raise RuntimeError('AUTHENTICATION_NOT_VERIFIED')
   if role=='hp_v3_app':
    predicate="pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_schema_owner','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_preauth_publisher_policy','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_preauth_reader_policy','MEMBER') AND NOT has_table_privilege(current_user,'highpass_v3.deployment_migrations','SELECT') AND NOT has_table_privilege(current_user,'highpass_v3.exchange_sessions','SELECT') AND NOT has_table_privilege(current_user,'highpass_v3.preauth_security_events','SELECT,INSERT') AND has_table_privilege(current_user,'highpass_v3.patient_mappings','SELECT') AND has_column_privilege(current_user,'highpass_v3.identity_network_audit','event_id','INSERT') AND NOT has_table_privilege(current_user,'highpass_v3.identity_audit_outbox','UPDATE,DELETE,TRUNCATE')"
   else:
    writer=role=='hp_v3_identity_preauth_writer'
    policy='hp_v3_preauth_publisher_policy' if writer else 'hp_v3_preauth_reader_policy'
    other='hp_v3_preauth_reader_policy' if writer else 'hp_v3_preauth_publisher_policy'
    predicate="pg_has_role(current_user,'"+policy+"','MEMBER') AND NOT pg_has_role(current_user,'"+other+"','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_schema_owner','MEMBER') AND NOT has_table_privilege(current_user,'highpass_v3.patient_refs','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,'highpass_v3.preauth_security_events','UPDATE,DELETE,TRUNCATE') AND has_column_privilege(current_user,'highpass_v3.preauth_security_events','event_id','"+('INSERT' if writer else 'SELECT')+"') AND NOT has_any_column_privilege(current_user,'highpass_v3.preauth_security_events','"+('SELECT' if writer else 'INSERT')+"')"
   safety=" AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))"
   check=run(['docker','exec','-e','PGPASSFILE='+temp,pg,'psql','-X','-qAt','-w','-h','127.0.0.1','-U',role,'-d',target,'-c','BEGIN READ ONLY;SELECT '+predicate+safety+';ROLLBACK;'])
   if check!='t':raise RuntimeError('ACTUAL_ROLE_PRIVILEGES_NOT_VERIFIED')
   auth.append({'role':role,'result':'PASS','invalidPassword':'DENY','privilegeSeparation':'PASS','transport':'CONTAINER_LOCAL_TCP_SCRAM_ONLY'})
  finally:
   for candidate in (temp,bad):
    run(['docker','exec',pg,'sh','-c','test -f '+candidate+' && test "$(stat -c %a '+candidate+')" = 600 && rm -- '+candidate+' && test ! -e '+candidate])
 result.update(status='PASS',authentication=auth,temporaryPassfilesRemoved=True)
except Exception as error:
 result.update(reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__,secretsRetainedForRecovery=directory.exists())
print(json.dumps(result))
'''

# Share the exact bounded authentication/cleanup code, never replay provisioning.
_auth_start = REMOTE.index(' # Real SCRAM login')
_auth_end = REMOTE.index('\nexcept Exception as error:', _auth_start)
AUTH_REMOTE = r'''
import json,os,pathlib,re,subprocess,sys
request=json.load(sys.stdin);operation=request['operation']
if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{32}',operation):raise SystemExit(2)
directory=pathlib.Path('/opt/highpass/v3-identity-secrets-'+operation);file=directory/'roles.json'
if file.is_symlink() or directory.is_symlink() or file.stat().st_uid!=0 or directory.stat().st_uid!=0 or file.stat().st_mode&0o777!=0o600 or directory.stat().st_mode&0o777!=0o700:raise SystemExit(2)
saved=json.loads(file.read_text());roles=('hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader')
if saved['operation']!=operation or saved['database']!='highpass_v3_capstone' or saved['scope']!='CAPSTONE_SYNTHETIC_ONLY' or tuple(saved['roles'])!=roles:raise SystemExit(2)
p={'operation':operation,'material':saved['roles']};target='highpass_v3_capstone';pg='hp-capstone-control-postgres-1'
def run(args,input=None):
 r=subprocess.run(args,input=input,capture_output=True,timeout=15)
 if r.returncode:raise RuntimeError('REMOTE_OPERATION_FAILED')
 if len(r.stdout)>32768:raise RuntimeError('OUTPUT_LIMIT')
 return r.stdout.decode().strip()
result={'status':'NOT VERIFIED','credentialsIssued':True,'serviceActivated':False,'clinicalReadiness':'NOT VERIFIED'}
try:
''' + REMOTE[_auth_start:_auth_end] + r'''
except Exception as error:
 result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
print(json.dumps(result))
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-existing')
    args = parser.parse_args()
    if args.verify_existing and not re.fullmatch('[a-f0-9]{32}', args.verify_existing):
        raise SystemExit('OPERATION_INVALID')
    operation = uuid.uuid4().hex
    directory = ROOT / 'artifacts/azure' / ('v3-identity-enroll-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + operation[:8])
    directory.mkdir(parents=True, exist_ok=False)
    result = {'status': 'NOT VERIFIED', 'review': 'DRAFT / UNASSIGNED', 'operation': operation,
              'scope': 'CAPSTONE_SYNTHETIC_NONOWNER_DB_LOGINS_ONLY', 'serviceActivated': False, 'secretsStoredInRepository': False}
    client = paramiko.SSHClient()
    payload = None
    try:
        generated = subprocess.run(['node', 'scripts/build-capstone-identity-grants-sql.js'], cwd=ROOT,
                                   capture_output=True, check=True, timeout=10)
        plan = json.loads(generated.stdout)
        if set(plan) != {'sql', 'roles', 'bundleSha256'} or tuple(plan['roles']) != credentials.ROLES or not re.fullmatch('[a-f0-9]{64}', plan['bundleSha256']):
            raise RuntimeError('LOCAL_PROFILE_INVALID')
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        health = "test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_BASELINE_MISMATCH')
        # Fresh absence before generating any secret. SQL itself rechecks under lock.
        names = ','.join("'" + role + "'" for role in credentials.ROLES)
        if args.verify_existing:
            payload = {'operation': args.verify_existing}
            result['verifiedCredentialOperation'] = args.verify_existing
            program = AUTH_REMOTE
        else:
            absent = ops.sql(client, 'BEGIN READ ONLY;SELECT count(*) FROM pg_roles WHERE rolname IN (' + names + ');ROLLBACK;', ops.TARGET)
            if absent != '0':
                raise RuntimeError('RUNTIME_ROLE_COLLISION')
            payload = {'operation': operation, 'material': credentials.new_material(), **plan}
            program = REMOTE
        value = ops.command(client, 'sudo -n timeout 35s python3 -c ' + shlex.quote(program), json.dumps(payload).encode())
        remote = json.loads(value)
        result.update(remote)
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result['existingLegacyServiceHealthy'] = 'PASS'
    except Exception as error:
        result.update(status='NOT VERIFIED', reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
    finally:
        payload = None
        client.close()
        (directory / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(directory / 'result.json')}))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
