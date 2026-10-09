"""Split existing root-only provisioning credentials into nonroot role mounts."""
import argparse
import importlib.util
import json
import os
import pathlib
import re
import shlex
import uuid
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/capstone-v3-cloud-bootstrap.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
REMOTE = r'''
import json,os,pathlib,re,sys
p=json.load(sys.stdin)
if os.geteuid()!=0 or not all(re.fullmatch('[a-f0-9]{32}',p[key]) for key in ('sourceOperation','operation')):raise SystemExit(2)
source=pathlib.Path('/opt/highpass/v3-identity-secrets-'+p['sourceOperation']);master=source/'roles.json'
if source.is_symlink() or master.is_symlink() or source.stat().st_uid!=0 or master.stat().st_uid!=0 or source.stat().st_mode&0o777!=0o700 or master.stat().st_mode&0o777!=0o600:raise SystemExit(2)
saved=json.loads(master.read_text());roles=('hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader')
if saved['operation']!=p['sourceOperation'] or saved['scope']!='CAPSTONE_SYNTHETIC_ONLY' or saved['database']!='highpass_v3_capstone' or tuple(saved['roles'])!=roles:raise SystemExit(2)
for role in roles:
 if saved['roles'][role]['username']!=role or not re.fullmatch('[a-f0-9]{64}',saved['roles'][role]['password']):raise SystemExit(2)
os.umask(0o077);directory=pathlib.Path('/opt/highpass/v3-runtime-mounts-'+p['operation']);directory.mkdir(mode=0o700)
files=[]
for role in roles:
 file=directory/('highpass-v3-'+role+'.json')
 with file.open('x') as stream:
  json.dump({'scope':saved['scope'],'database':saved['database'],'user':role,'password':saved['roles'][role]['password']},stream)
  stream.flush();os.fsync(stream.fileno())
 os.chown(file,0,65532);os.chmod(file,0o640)
 stat=file.stat()
 if stat.st_uid!=0 or stat.st_gid!=65532 or stat.st_mode&0o777!=0o640 or stat.st_nlink!=1:raise SystemExit(3)
 files.append({'role':role,'path':str(file),'owner':'root','group':65532,'mode':'0640','containsOnlyOneRole':True})
print(json.dumps({'status':'PASS','scope':'CAPSTONE_SYNTHETIC_ROLE_MOUNTS_ONLY','directory':str(directory),'files':files,'serviceActivated':False,'runtimeMountReadability':'NOT VERIFIED'}))
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-operation', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{32}', args.source_operation):
        raise SystemExit('SOURCE_OPERATION_INVALID')
    operation = uuid.uuid4().hex
    directory = ROOT / 'artifacts/azure' / ('v3-role-mounts-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + operation[:8])
    directory.mkdir(parents=True, exist_ok=False)
    result = {'status': 'NOT VERIFIED', 'review': 'DRAFT / UNASSIGNED', 'operation': operation,
              'sourceCredentialOperation': args.source_operation, 'secretsStoredInRepository': False}
    client = paramiko.SSHClient()
    try:
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        health = "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        result.update(json.loads(ops.command(client, 'sudo -n timeout 20s python3 -c ' + shlex.quote(REMOTE),
                                            json.dumps({'sourceOperation': args.source_operation, 'operation': operation}).encode())))
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result['existingLegacyHealthy'] = 'PASS'
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
    finally:
        client.close()
        (directory / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result,'evidence':str(directory / 'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
