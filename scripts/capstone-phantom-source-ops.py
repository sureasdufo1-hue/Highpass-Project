"""Add verified synthetic objects to pinned A PACS; no cloud/identity/app mutation."""
import argparse
import getpass
import hashlib
import importlib.util
import json
import pathlib
import shlex
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('vm_ops', ROOT / 'scripts/workstation-automatic-ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
IMAGE = 'sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1'
PACS = 'sha256:9f74f2dbf91aef1f9169fc9ec36bc3b1d414294e7ec561294065b7180882aa9a'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    dataset = pathlib.Path(args.dataset).resolve()
    if not dataset.is_relative_to(ROOT / 'artifacts/synthetic-phantom'):
        raise SystemExit('GENERATED_DATASET_PATH_REQUIRED')
    manifest = json.loads((dataset / 'manifest.json').read_text(encoding='utf8'))
    if manifest.get('generator') != 'highpass-geometric-phantom-v1' or manifest.get('clinicalUseAllowed') is not False:
        raise SystemExit('SYNTHETIC_MANIFEST_REQUIRED')
    names = [row['file'] for row in manifest['instances']]
    if len(names) != 24 or len(set(names)) != 24 or any(pathlib.Path(name).name != name for name in names):
        raise SystemExit('SYNTHETIC_FILES_REQUIRED')
    for row in manifest['instances']:
        if hashlib.sha256((dataset / row['file']).read_bytes()).hexdigest() != row['sha256']:
            raise SystemExit('DATASET_HASH_MISMATCH')
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-')
    directory = ROOT / 'artifacts/workstation' / ('phantom-source-' + stamp)
    directory.mkdir(parents=True)
    stage = '/home/server/.highpass-phantom-' + stamp
    probe_name = 'hp-phantom-source-' + directory.name[-16:].replace('+', '-').replace('.', '-')
    credential = getpass.getpass('VM credential (concealed): ')
    client = paramiko.SSHClient()
    trust = None
    created = False
    uploaded = []
    result = {'status': 'NOT VERIFIED', 'review': 'DRAFT / UNASSIGNED'}
    try:
        trust = ops.LocalVmTrust()
        address, mac, _ = ops.ROLES['A']
        key = trust.key('A', credential, directory / 'A-public-host.key')
        client.get_host_keys().add(address, key.get_name(), key)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect(address, username='server', password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command, seconds=15, root=False):
            return ops.run(client, ('sudo -S -p "" ' if root else '') + 'timeout ' + str(seconds) + 's bash -c ' + shlex.quote('set -eu; ' + command), credential=credential if root else None, seconds=seconds + 5)
        code, _ = run('test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = ' + mac)
        if code:
            raise RuntimeError('A_ROLE_MISMATCH')
        command = "test $(docker inspect hp-capstone-a-gateway-gateway-1 --format '{{.Image}}') = " + IMAGE + "; test $(docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Image}}') = " + PACS + "; test $(docker inspect hp-capstone-hospital-a-orthanc-mtls-1 --format '{{.State.Health.Status}}') = healthy; test $(docker network inspect hp-capstone-hospital-a_pacs_private --format '{{.Internal}}') = true"
        code, _ = run(command, root=True)
        if code:
            raise RuntimeError('A_PINNED_BASELINE_REQUIRED')
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o755)
            created = True
            for source, name in [(dataset / name, name) for name in names] + [(dataset / 'manifest.json', 'manifest.json'), (ROOT / 'scripts/test-support/capstone-phantom-source-probe.js', 'probe.mjs')]:
                uploaded.append(stage + '/' + name)
                sftp.put(str(source), stage + '/' + name)
                sftp.chmod(stage + '/' + name, 0o644)
        command = 'docker run --rm --pull never --name ' + probe_name + ' --label highpass.phantom-stage=' + shlex.quote(stage) + (' -e HIPASS_PHANTOM_VERIFY_ONLY=1' if args.verify_only else '') + ' --user 65532:65532 --read-only --cap-drop ALL --security-opt no-new-privileges --network hp-capstone-hospital-a_pacs_private -v ' + shlex.quote(stage) + ':/fixtures:ro -v /opt/highpass/capstone-a-gateway-secrets:/run/pacs:ro ' + IMAGE + ' /fixtures/probe.mjs'
        code, output = run(command, seconds=100, root=True)
        result = json.loads(output)
        if code != 0 and result.get('status') == 'PASS':
            raise RuntimeError('SOURCE_EXIT_STATUS_MISMATCH')
    except Exception as error:
        result = {**result, 'status': 'NOT VERIFIED', 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__}
    finally:
        if created:
            try:
                code, _ = run('if docker inspect ' + probe_name + ' >/dev/null 2>&1; then test "$(docker inspect ' + probe_name + ' --format \'{{index .Config.Labels "highpass.phantom-stage"}}\')" = ' + shlex.quote(stage) + '; docker rm -f ' + probe_name + ' >/dev/null; fi', root=True)
                if code:
                    raise RuntimeError('OWNED_PROBE_CLEANUP_FAILED')
                with client.open_sftp() as sftp:
                    sftp.get_channel().settimeout(10)
                    for target in uploaded:
                        sftp.remove(target)
                    sftp.rmdir(stage)
                result['temporaryStageCleanup'] = 'PASS'
            except Exception:
                result['temporaryStageCleanup'] = 'NOT VERIFIED'
                result['status'] = 'NOT VERIFIED'
        credential = None
        client.close()
        if trust:
            trust.close()
    result['datasetManifest'] = str(dataset / 'manifest.json')
    result['cloudMappingAndMetadata'] = 'NOT REGISTERED — NO BYPASS OR DIRECT DB INSERT'
    (directory / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(directory / 'result.json')}), flush=True)
    return 0 if result.get('status') == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
