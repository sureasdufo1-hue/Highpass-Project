"""Rehearse/apply four read-only columns required by existing Session audit RLS."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
from datetime import datetime,timezone
import paramiko
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
BASELINE="BEGIN READ ONLY;SELECT json_build_object('eventRead',has_column_privilege('hp_v3_app','highpass_v3.exchange_state_events','event_id','SELECT'),'expiryPredicate',has_function_privilege('hp_v3_app','highpass_v3.exchange_expirer(uuid,uuid)','EXECUTE'),'sessions',(SELECT count(*) FROM highpass_v3.exchange_sessions));ROLLBACK;"
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 directory=ROOT/'artifacts/azure'/('v3-session-audit-dependency-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));directory.mkdir(parents=True,exist_ok=False)
 result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','applied':False,'mode':'ACTIVATE' if args.apply else 'REHEARSAL','sessionCreated':False}
 client=paramiko.SSHClient()
 try:
  program="import {buildCapstoneSourceExchangeAuditDependencySql} from './src/v3-capstone-source-exchange-profile.js';console.log(buildCapstoneSourceExchangeAuditDependencySql({targetDatabase:'highpass_v3_capstone',mode:'"+result['mode']+"'}));"
  generated=subprocess.run(['node','--input-type=module','-e',program],cwd=ROOT,capture_output=True,check=True,timeout=10);sql=generated.stdout.decode().strip()
  result['sqlSha256']=hashlib.sha256(sql.encode()).hexdigest()
  identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud';client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
  client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,allow_agent=False,timeout=10,auth_timeout=10,banner_timeout=10,channel_timeout=15)
  health="sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_BASELINE_REQUIRED')
  before=json.loads(ops.sql(client,BASELINE,ops.TARGET))
  if before['expiryPredicate'] is not False:raise RuntimeError('DEPENDENCY_ALREADY_APPLIED_RECONCILE_INSTEAD')
  if args.apply:result['applied']='NOT VERIFIED'
  checks=json.loads(ops.sql(client,sql,ops.TARGET))
  if args.apply:result['applied']=True
  if len(checks)!=4 or any(value is not True for value in checks.values()):raise RuntimeError('DEPENDENCY_CHECK_FAILED')
  after=json.loads(ops.sql(client,BASELINE,ops.TARGET))
  if after['sessions']!=before['sessions'] or after['eventRead']!=(True if args.apply else before['eventRead']) or after['expiryPredicate'] is not args.apply:raise RuntimeError('DEPENDENCY_POSTCHECK_FAILED')
  if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
  result.update(status='PASS',checks=checks,sessionRowsPreserved=True,existingLegacyHealthy='PASS',qualifier='FOUR_RLS_PROOF_COLUMNS_ONLY_NOT_STATE_MUTATION_OR_CANCEL_AUTHORITY')
 except Exception as error:result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
 finally:client.close()
 (directory/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({**result,'evidence':str(directory/'result.json')}),flush=True)
 return 0 if result['status']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
