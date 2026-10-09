"""Read-only existing-VM preflight; no deployment, registration, or secrets output."""
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('rollout', ROOT / 'scripts/capstone-cloud-app-rollout.py')
rollout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rollout)
BASELINE = 'sha256:7f0901aa0e7e8f6b70a07ee980dcb5c0cf480c6e4ea4fa17b28231ffd3d7009a'
CANDIDATE = 'sha256:d638ccf024fdb00ca31a8feede83abb14826af6626b4d6d3097f481bcd809f26'


def main():
    checks = []
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-')
    directory = ROOT / 'artifacts/workstation' / ('phantom-cloud-preflight-' + stamp)
    directory.mkdir(parents=True)
    client = paramiko.SSHClient()
    phase = 'LOCAL_CANDIDATE_SCAN'
    try:
        scan = json.loads((ROOT / 'artifacts/security/container-scan/capstone-phantom-control-20261009.json').read_text(encoding='utf8'))
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(scan['CreatedAt'].replace('Z', '+00:00'))).total_seconds()
        if scan.get('Metadata', {}).get('ImageID') != CANDIDATE or not isinstance(scan.get('Results'), list) or not 0 <= age < 86400:
            raise RuntimeError('EXACT_FRESH_SCAN_REQUIRED')
        if any(v.get('Severity') in ['HIGH', 'CRITICAL'] for row in scan['Results'] for v in row.get('Vulnerabilities', [])):
            raise RuntimeError('IMAGE_VULNERABILITIES_PRESENT')
        if rollout.base.local(['docker', 'image', 'inspect', CANDIDATE, '--format', '{{.Id}}']) != CANDIDATE:
            raise RuntimeError('EXACT_LOCAL_IMAGE_REQUIRED')
        checks.append({'test': phase, 'status': 'PASS', 'imageId': CANDIDATE})
        phase = 'STRICT_SSH_CLOUD_IDENTITY'
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)

        def run(command):
            code, output = rollout.base.ops.run(client, 'sudo -n timeout 15s bash -c ' + shlex.quote('set -eu; ' + command), seconds=20)
            if code:
                raise RuntimeError('READ_ONLY_COMMAND_FAILED_' + str(code))
            return output.strip()

        run('test $(hostname) = highpass-cloud; systemctl is-active --quiet wg-quick@hp-capstone')
        checks.append({'test': phase, 'status': 'PASS'})
        phase = 'CURRENT_IMAGE_HEALTH_AND_CONTEXT'
        context = None
        for name, expected in [('hp-capstone-control-control-1', BASELINE), ('hp-capstone-control-ingress-1', BASELINE),
                               ('hp-capstone-control-postgres-1', rollout.base.PG_ID)]:
            # Inspect only public operational metadata. Never full environment/mount secrets.
            value = json.loads(run('docker inspect ' + name + " --format '{{json .Image}}'"))
            state = json.loads(run('docker inspect ' + name + " --format '{{json .State}}'"))
            if value != expected or not state.get('Running') or state.get('Health', {}).get('Status', 'healthy') != 'healthy':
                raise RuntimeError('PINNED_RUNNING_BASELINE_CHANGED')
            if name.endswith('control-1'):
                labels = json.loads(run('docker inspect ' + name + " --format '{{json .Config.Labels}}'"))
                workdir, configs = rollout.validated_context(labels)
                context = {'workingDirectory': workdir, 'files': configs}
            checks.append({'test': name, 'status': 'PASS', 'imageId': value})
        checks.append({'test': phase, 'status': 'PASS', 'context': context})
        phase = 'AUDIT_BASELINE_AND_CATALOG_COUNTS'
        sql = "SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(audit_id || ':' || record_hash || ':' || coalesce(previous_hash,'HEAD'), ',' ORDER BY audit_id),''),'UTF8')),'hex') FROM audit_logs"
        fingerprint = run('docker exec hp-capstone-control-postgres-1 psql -U hipass_bootstrap -d hipass -At -c ' + shlex.quote(sql))
        counts = run('docker exec hp-capstone-control-postgres-1 psql -U hipass_bootstrap -d hipass -At -c ' + shlex.quote("SELECT (SELECT count(*) FROM patients),(SELECT count(*) FROM imaging_studies),(SELECT count(*) FROM patients WHERE patient_id='HP-TEST-PHANTOM-001')"))
        checks.append({'test': phase, 'status': 'PASS', 'auditFingerprint': fingerprint, 'patientStudyPhantomCounts': counts})
    except Exception as error:
        checks.append({'test': phase, 'status': 'NOT VERIFIED', 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    result = {'scope': 'READ_ONLY_EXISTING_CLOUD_VM_NOT_DEPLOYMENT_OR_VIEWER_E2E', 'review': 'DRAFT / UNASSIGNED',
              'status': 'PASS' if checks and all(c['status'] == 'PASS' for c in checks) else 'NOT VERIFIED', 'checks': checks}
    evidence = directory / 'result.json'
    evidence.write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(evidence)}))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
