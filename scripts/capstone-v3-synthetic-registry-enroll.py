"""Explicit synthetic authority registration; never patient consent/human approval."""
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

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
REMOTE=r'''
import json,os,pathlib,re,secrets,subprocess,sys
p=json.load(sys.stdin)
if os.geteuid()!=0 or not re.fullmatch('[a-f0-9]{32}',p['operation']) or not re.fullmatch('[a-f0-9]{64}',p['registrySha256']):raise SystemExit(2)
snapshot=p['snapshot']
if snapshot['scope']!='CAPSTONE_SYNTHETIC_ONLY' or len(snapshot['institutions'])!=2 or len(snapshot['records'])!=6:raise SystemExit(2)
directory=pathlib.Path('/opt/highpass/v3-runtime-authority-'+p['operation']);os.umask(0o077);directory.mkdir(mode=0o700)
result={'status':'NOT VERIFIED','clinicalReadiness':'NOT VERIFIED','serviceActivated':False,'patientConsentIssued':False,'mappingReviewed':False,'directory':str(directory)}
def write(name,value,shared=True):
 file=directory/name
 with file.open('x') as stream:
  json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
 os.chown(file,0,65532 if shared else 0);os.chmod(file,0o640 if shared else 0o600)
 if file.stat().st_nlink!=1:raise RuntimeError('FILE_PROTECTION_INVALID')
def sql(body):
 r=subprocess.run(['docker','exec','-i','hp-capstone-control-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','highpass_v3_capstone'],input=body.encode(),capture_output=True,timeout=20)
 if r.returncode:raise RuntimeError('REGISTRY_TRANSACTION_NOT_VERIFIED')
 if len(r.stdout)>32768:raise RuntimeError('OUTPUT_LIMIT')
 return r.stdout.decode().strip()
try:
 write('highpass-v3-registry.json',snapshot)
 material={name:secrets.token_hex(32) for name in ('testAuth','ingress','idempotency','identifierEncryption','identifierLookup')}
 if len(set(material.values()))!=5:raise RuntimeError('KEY_SEPARATION_FAILED')
 write('highpass-v3-authority-keys.json',{'scope':'CAPSTONE_SYNTHETIC_ONLY','identifierKeyId':'capstone-dev-local-ref-v1',**material})
 sql(p['sql'])
 result['registrationCommitAcknowledged']=True
 counts=json.loads(sql("BEGIN READ ONLY;SELECT json_build_object('tenants',(SELECT count(*) FROM highpass_v3.tenants),'hospitals',(SELECT count(*) FROM highpass_v3.hospitals),'principals',(SELECT count(*) FROM highpass_v3.principal_bindings),'patientPrincipals',(SELECT count(*) FROM highpass_v3.principal_bindings WHERE role='PATIENT'),'patientRefs',(SELECT count(*) FROM highpass_v3.patient_refs),'mappings',(SELECT count(*) FROM highpass_v3.patient_mappings));ROLLBACK;"))
 if counts!={'tenants':2,'hospitals':2,'principals':6,'patientPrincipals':0,'patientRefs':0,'mappings':0}:raise RuntimeError('REGISTRATION_COUNTS_NOT_VERIFIED')
 receipt={'action':'CAPSTONE_SYNTHETIC_AUTHORITY_REGISTERED','operation':p['operation'],'registrySha256':p['registrySha256'],
 'counts':counts,'review':'DRAFT / UNASSIGNED','patientConsentIssued':False,'mappingReviewed':False}
 write('operator-enrollment-receipt.json',receipt,False)
 result.update(status='PASS',counts=counts,registrySha256=p['registrySha256'],
   secretProtection='ROOT_0700_PARENT_ROOT_65532_0640_MOUNTS',operatorReceipt='ROOT_ONLY_0600_NEW_FILE',credentialLogOrExport=False)
except Exception as error:
 result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__,artifactsRetainedForRecovery=True)
print(json.dumps(result))
'''


def main():
    operation=uuid.uuid4().hex
    evidence=ROOT/'artifacts/azure'/('v3-synthetic-registry-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+operation[:8]);evidence.mkdir(parents=True,exist_ok=False)
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,'scope':'CAPSTONE_SYNTHETIC_DIRECTORY_REGISTRATION_ONLY','secretsStoredInRepository':False}
    client=paramiko.SSHClient()
    try:
        run=subprocess.run(['node','scripts/build-capstone-synthetic-registry-sql.js'],cwd=ROOT,capture_output=True,timeout=10,check=True)
        plan=json.loads(run.stdout)
        if set(plan)!={'registrySha256','snapshot','sql'} or not re.fullmatch('[a-f0-9]{64}',plan['registrySha256']):raise RuntimeError('REGISTRY_PLAN_NOT_VERIFIED')
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                       allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health="sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        count=ops.sql(client,'BEGIN READ ONLY;SELECT (SELECT count(*) FROM highpass_v3.tenants)+(SELECT count(*) FROM highpass_v3.hospitals)+(SELECT count(*) FROM highpass_v3.principal_bindings);ROLLBACK;',ops.TARGET)
        if count!='0':raise RuntimeError('AUTHORITY_ALREADY_REGISTERED_REINSPECT')
        result.update(json.loads(ops.command(client,'sudo -n timeout 25s python3 -c '+shlex.quote(REMOTE),json.dumps({'operation':operation,**plan}).encode())))
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result['existingLegacyHealthy']='PASS'
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
    finally:
        client.close();(evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
