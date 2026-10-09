"""Pinned live-DB privilege rehearsal; transaction always ROLLBACK, no enrollment."""
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import shlex
from datetime import datetime,timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
BASELINE="""BEGIN READ ONLY;SELECT json_build_object('sessionSelect',has_table_privilege('hp_v3_app','highpass_v3.exchange_sessions','SELECT'),
'sourceScopes',(SELECT scopes FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'),
'sessions',(SELECT count(*) FROM highpass_v3.exchange_sessions));ROLLBACK;"""

def main():
 directory=ROOT/'artifacts/azure'/('v3-source-exchange-rehearsal-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 directory.mkdir(parents=True,exist_ok=False)
 result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','scope':'SOURCE_SESSION_PROFILE_ROLLBACK_REHEARSAL_ONLY',
         'profileActivated':False,'registryFileChanged':False,'sessionCreated':False,'consentIssued':False}
 client=paramiko.SSHClient()
 try:
  program="import {buildCapstoneSourceExchangeRehearsalSql} from './src/v3-capstone-source-exchange-profile.js';console.log(buildCapstoneSourceExchangeRehearsalSql({targetDatabase:'highpass_v3_capstone'}));"
  generated=subprocess.run(['node','--input-type=module','-e',program],cwd=ROOT,capture_output=True,check=True,timeout=10)
  sql=generated.stdout.decode().strip()
  if not sql.startswith('BEGIN;') or not sql.endswith('ROLLBACK;'):raise RuntimeError('REHEARSAL_TRANSACTION_REQUIRED')
  result['profileSqlSha256']=hashlib.sha256(sql.encode()).hexdigest()
  identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
  client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
  client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                 allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
  health="test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_BASELINE_REQUIRED')
  before=json.loads(ops.sql(client,BASELINE,ops.TARGET))
  if before['sessionSelect'] is not False or before['sourceScopes']!=['mapping:read','mapping:write']:raise RuntimeError('SOURCE_PROFILE_BASELINE_REQUIRED')
  # Retain only SQLSTATE and fixed schema function names, never raw SQL errors.
  remote="""import json,re,subprocess,sys
r=subprocess.run(['docker','exec','-i','hp-capstone-control-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','highpass_v3_capstone'],input=sys.stdin.buffer.read(32768),capture_output=True,timeout=15)
if r.returncode:
 text=r.stderr.decode('utf8','replace');name=re.search(r'permission denied for function ([a-z_]+)',text)
 known=re.search(r'V3_EXCHANGE_[A-Z_]+',text)
 print(json.dumps({'exitCode':r.returncode,'reason':known.group(0) if known else 'SQL_REHEARSAL_FAILED','function':name.group(1) if name and re.fullmatch(r'[a-z_]{1,80}',name.group(1)) else None}))
else:print(json.dumps({'exitCode':0,'rows':[json.loads(line) for line in r.stdout.decode().splitlines()]}))
"""
  response=json.loads(ops.command(client,'sudo -n timeout 20s python3 -c '+shlex.quote(remote),sql.encode()))
  if response['exitCode']!=0:
   result['safeSqlDiagnostic']=response
   raise RuntimeError('SQL_REHEARSAL_NOT_VERIFIED')
  rows=response['rows']
  if len(rows)!=2 or any(value is not True for row in rows for value in row.values()):raise RuntimeError('REHEARSAL_CHECK_NOT_VERIFIED')
  after=json.loads(ops.sql(client,BASELINE,ops.TARGET))
  if before!=after:raise RuntimeError('ROLLBACK_BASELINE_MISMATCH')
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
  result.update(status='PASS',checks=rows,rollbackBaselinePreserved=True,existingLegacyHealthy='PASS',
                qualifier='SQL_ROLE_PRIVILEGE_AND_UNBOUND_RLS_CHECK_NOT_LOGIN_SERVICE_OR_SESSION_E2E')
 except Exception as error:
  result['reason']=str(error) if isinstance(error,RuntimeError) and str(error).isupper() else type(error).__name__
 finally:client.close()
 (directory/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
 print(json.dumps({**result,'evidence':str(directory/'result.json')}),flush=True)
 return 0 if result['status']=='PASS' else 1

if __name__=='__main__':raise SystemExit(main())
