"""Explicit source-only profile activation. Separate authority directory; no original overwrite."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shlex
import subprocess
import uuid
from datetime import datetime,timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
REMOTE=r'''
import hashlib,json,os,pathlib,re,shutil,subprocess,sys
p=json.load(sys.stdin)
if os.geteuid()!=0 or not all(re.fullmatch('[a-f0-9]{32}',p[key]) for key in ('operation','sourceOperation')):raise SystemExit(2)
old=pathlib.Path('/opt/highpass/v3-runtime-authority-'+p['sourceOperation'])
new=pathlib.Path('/opt/highpass/v3-runtime-authority-'+p['operation'])
def checked(path,mode,gid):
 s=path.lstat()
 if path.is_symlink() or s.st_uid!=0 or s.st_gid!=gid or s.st_mode&0o777!=mode:raise RuntimeError('AUTHORITY_PERMISSION_INVALID')
 if path.is_file() and (s.st_nlink!=1 or s.st_size>16384):raise RuntimeError('AUTHORITY_FILE_INVALID')
def sql(body):
 r=subprocess.run(['docker','exec','-i','hp-capstone-control-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','highpass_v3_capstone'],input=body.encode(),capture_output=True,timeout=15)
 if r.returncode:raise RuntimeError('PROFILE_SQL_FAILED')
 return r.stdout.decode().strip()
result={'status':'NOT VERIFIED','profileActivated':False,'originalAuthorityPreserved':False,'persistentServiceActivated':False,'sessionCreated':False}
phase='PRECHECK';receipt=None
try:
 checked(old,0o700,0)
 for name in ('highpass-v3-registry.json','highpass-v3-authority-keys.json'):checked(old/name,0o640,65532)
 if json.loads((old/'highpass-v3-registry.json').read_text())!=p['baseline']:raise RuntimeError('AUTHORITY_BASELINE_MISMATCH')
 keysHash=hashlib.sha256((old/'highpass-v3-authority-keys.json').read_bytes()).hexdigest()
 query="SELECT json_agg(json_build_object('actorId',actor_id,'tenantId',tenant_id,'hospitalId',hospital_id,'role',role,'status',status,'scopes',scopes) ORDER BY actor_id) FROM highpass_v3.principal_bindings;"
 def directory_matches(snapshot):
  expected=[{k:row[k] for k in ('actorId','tenantId','hospitalId','role','status','scopes')} for row in snapshot['records']]
  return json.loads(sql('BEGIN READ ONLY;'+query+'ROLLBACK;'))==sorted(expected,key=lambda row:row['actorId'])
 if not directory_matches(p['baseline']):raise RuntimeError('DB_DIRECTORY_BASELINE_MISMATCH')
 # Do not stage a second directory if an earlier operation has changed DB scopes.
 os.umask(0o077);new.mkdir(mode=0o700)
 registry=new/'highpass-v3-registry.json'
 with registry.open('x') as stream:json.dump(p['next'],stream,separators=(',',':'));stream.flush();os.fsync(stream.fileno())
 shutil.copyfile(old/'highpass-v3-authority-keys.json',new/'highpass-v3-authority-keys.json')
 for name in ('highpass-v3-registry.json','highpass-v3-authority-keys.json'):
  os.chown(new/name,0,65532);os.chmod(new/name,0o640);checked(new/name,0o640,65532)
 receipt=new/'source-exchange-activation.json'
 def checkpoint():
  with receipt.open('w') as stream:
   json.dump({'scope':'CAPSTONE_SYNTHETIC_ONLY','operation':p['operation'],'sourceOperation':p['sourceOperation'],'phase':phase,
              'profileSqlSha256':p['sqlSha256'],'registrySha256':p['registrySha256']},stream);stream.flush();os.fsync(stream.fileno())
  os.chmod(receipt,0o600)
 phase='STAGED_NOT_APPLIED';checkpoint()
 if not p['sql'].startswith('BEGIN;') or not p['sql'].endswith('COMMIT;') or hashlib.sha256(p['sql'].encode()).hexdigest()!=p['sqlSha256']:raise RuntimeError('PROFILE_TRANSACTION_INVALID')
 phase='SQL_ATTEMPTED_RECONCILIATION_REQUIRED';checkpoint();result['profileActivated']='NOT VERIFIED'
 rows=[json.loads(line) for line in sql(p['sql']).splitlines()]
 result['profileActivated']=True
 if len(rows)!=2 or any(value is not True for row in rows for value in row.values()):raise RuntimeError('PROFILE_CHECK_FAILED_AFTER_COMMIT')
 if not directory_matches(p['next']):raise RuntimeError('DB_DIRECTORY_POSTCHECK_FAILED')
 if json.loads((old/'highpass-v3-registry.json').read_text())!=p['baseline'] or hashlib.sha256((old/'highpass-v3-authority-keys.json').read_bytes()).hexdigest()!=keysHash:raise RuntimeError('ORIGINAL_AUTHORITY_CHANGED')
 if hashlib.sha256((new/'highpass-v3-authority-keys.json').read_bytes()).hexdigest()!=keysHash:raise RuntimeError('KEY_COPY_MISMATCH')
 phase='APPLIED_VERIFIED_NOT_RUNTIME_ACTIVATED';checkpoint()
 result.update(status='PASS',checks=rows,newAuthorityOperation=p['operation'],newAuthorityDirectory=str(new),registrySha256=p['registrySha256'],
               originalAuthorityPreserved=True,keysCopiedWithinCloudOnly=True,sourceOnlyScopes=True,qualifier='SOURCE_REQUESTED_SESSION_AUTHORITY_ONLY_NOT_CONSENT_GRANT_OR_CLINICAL_ACCESS')
except Exception as error:
 result.update(reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__,phase=phase,stagedAuthorityRetained=new.exists(),requiresReconciliation=phase=='SQL_ATTEMPTED_RECONCILIATION_REQUIRED')
print(json.dumps(result))
'''

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-authority-operation',required=True);parser.add_argument('--activate',action='store_true')
 args=parser.parse_args()
 if not args.activate or not re.fullmatch('[a-f0-9]{32}',args.source_authority_operation):raise SystemExit('EXPLICIT_ACTIVATION_AND_SOURCE_OPERATION_REQUIRED')
 operation=uuid.uuid4().hex
 directory=ROOT/'artifacts/azure'/('v3-source-exchange-activation-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+operation[:8]);directory.mkdir(parents=True,exist_ok=False)
 result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,'profileActivated':False,'persistentServiceActivated':False}
 client=paramiko.SSHClient()
 try:
  program="""import {readFileSync} from 'node:fs';import {validateCapstoneSyntheticRegistry,buildCapstoneSourceExchangeRegistry} from './src/v3-capstone-synthetic-registry.js';import {buildCapstoneSourceExchangeActivationSql} from './src/v3-capstone-source-exchange-profile.js';const raw=JSON.parse(readFileSync('config/capstone-v3-synthetic-registry-20261009.json'));const next=buildCapstoneSourceExchangeRegistry(raw);console.log(JSON.stringify({baseline:validateCapstoneSyntheticRegistry(raw).snapshot,next:next.snapshot,registrySha256:next.sha256,sql:buildCapstoneSourceExchangeActivationSql({targetDatabase:'highpass_v3_capstone'})}));"""
  generated=subprocess.run(['node','--input-type=module','-e',program],cwd=ROOT,capture_output=True,check=True,timeout=10)
  payload=json.loads(generated.stdout);payload.update(operation=operation,sourceOperation=args.source_authority_operation,sqlSha256=hashlib.sha256(payload['sql'].encode()).hexdigest())
  identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
  client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
  client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
  health="test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_BASELINE_REQUIRED')
  result['profileSqlSha256']=payload['sqlSha256'];result['profileActivated']='NOT VERIFIED'
  result.update(json.loads(ops.command(client,'sudo -n timeout 30s python3 -c '+shlex.quote(REMOTE),json.dumps(payload).encode())))
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
  result['existingLegacyHealthy']='PASS'
 except Exception as error:result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
 finally:client.close()
 (directory/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({**result,'evidence':str(directory/'result.json')}),flush=True)
 return 0 if result['status']=='PASS' else 1

if __name__=='__main__':raise SystemExit(main())
