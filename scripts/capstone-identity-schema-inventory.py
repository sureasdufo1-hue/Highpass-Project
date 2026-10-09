"""Pinned existing Azure metadata inventory; never migrate or issue credentials.

Uses an existing administrative local socket ONLY for catalog inspection in a
READ ONLY transaction, not as a clinical fallback or deployment readiness test.
No remote upload, secret reads, patient rows or raw error/log storage.
"""
import hashlib
import argparse
import json
import os
import pathlib
import time
from datetime import datetime, timezone

import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXPECTED = 'sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807'
TABLES = {'tenants', 'hospitals', 'principal_bindings', 'patient_refs', 'patient_ref_registrations',
          'patient_mappings', 'identity_write_results', 'identity_audit_outbox', 'identity_network_audit', 'preauth_security_events'}
ROLES = {'hipass_app', 'hp_v3_app', 'hp_v3_owner', 'hp_v3_clinical_policy', 'hp_v3_pending_policy',
         'hp_v3_preauth_publisher_policy', 'hp_v3_preauth_reader_policy',
         'hp_v3_identity_preauth_writer', 'hp_v3_identity_preauth_reader', 'hp_v3_schema_owner',
         'hp_v3_expiry_policy', 'hp_v3_consent_approval_policy', 'hp_v3_consent_withdraw_policy', 'hp_v3_consent_expiry_policy'}


def execute(client, command, payload=None):
    channel = client.get_transport().open_session(timeout=10)
    channel.settimeout(10)
    output = bytearray()
    try:
        channel.exec_command(command)
        if payload is not None:
            channel.sendall(payload)
        channel.shutdown_write()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if channel.recv_ready():
                output.extend(channel.recv(32768))
            if channel.recv_stderr_ready():
                # Do not retain raw SQL/SSH/container errors.
                channel.recv_stderr(32768)
            if len(output) > 32768:
                raise RuntimeError('INVENTORY_OUTPUT_LIMIT')
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                if channel.recv_exit_status() != 0:
                    raise RuntimeError('INVENTORY_REMOTE_COMMAND_FAILED')
                return bytes(output).decode('utf8')
            time.sleep(0.05)
        raise RuntimeError('INVENTORY_DEADLINE')
    finally:
        channel.close()


def validate(value, database='hipass'):
    if database not in ('hipass', 'highpass_v3_capstone'):
        raise RuntimeError('INVENTORY_DATABASE_NOT_SELECTED')
    if not isinstance(value, dict) or set(value) != {'transactionReadOnly', 'database', 'inspectionRole', 'serverMajor',
                                                   'v3SchemaPresent', 'identityTables', 'v3TableCount', 'roles', 'targetDatabasePresent'}:
        raise RuntimeError('INVENTORY_SHAPE_INVALID')
    if value['transactionReadOnly'] != 'on' or value['database'] != database or value['inspectionRole'] != 'hipass_bootstrap':
        raise RuntimeError('READ_ONLY_INSPECTION_REQUIRED')
    if type(value['serverMajor']) is not int or not 16 <= value['serverMajor'] <= 18:
        raise RuntimeError('SERVER_VERSION_NOT_VERIFIED')
    if type(value['targetDatabasePresent']) is not bool or type(value['v3SchemaPresent']) is not bool or type(value['v3TableCount']) is not int or not 0 <= value['v3TableCount'] <= 1000:
        raise RuntimeError('INVENTORY_SHAPE_INVALID')
    for field, allowed, keys in [('identityTables', TABLES, {'name', 'rls', 'forceRls'}),
                                ('roles', ROLES, {'name', 'login', 'superuser', 'bypassRls', 'createRole', 'createDb', 'replication'})]:
        rows = value[field]
        if not isinstance(rows, list) or len(rows) > len(allowed):
            raise RuntimeError('INVENTORY_SHAPE_INVALID')
        names = set()
        for row in rows:
            if not isinstance(row, dict) or set(row) != keys or row['name'] not in allowed or row['name'] in names:
                raise RuntimeError('INVENTORY_SHAPE_INVALID')
            if any(type(row[key]) is not bool for key in keys - {'name'}):
                raise RuntimeError('INVENTORY_SHAPE_INVALID')
            names.add(row['name'])
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', choices=('hipass', 'highpass_v3_capstone'), default='hipass')
    args = parser.parse_args()
    directory = ROOT / 'artifacts/azure' / ('identity-schema-inventory-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    directory.mkdir(parents=True, exist_ok=False)
    client = paramiko.SSHClient()
    result = {'scope': 'READ_ONLY_EXISTING_CLOUD_CATALOG_INVENTORY', 'review': 'DRAFT / UNASSIGNED',
              'deploymentReadiness': 'NOT VERIFIED', 'rawLogsStored': False, 'patientRowsRead': False,
              'migrationsApplied': False, 'credentialsIssued': False}
    try:
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        if execute(client, "test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'").strip() != EXPECTED + ' running healthy':
            raise RuntimeError('EXISTING_RUNTIME_BASELINE_MISMATCH')
        sql = (ROOT / 'scripts/capstone-identity-schema-inventory.sql').read_bytes()
        result['sqlSha256'] = hashlib.sha256(sql).hexdigest()
        source = execute(client, 'sudo -n timeout 12s docker exec -i hp-capstone-control-postgres-1 psql -X -qAt -v ON_ERROR_STOP=1 -U hipass_bootstrap -d ' + args.database, sql)
        inventory = validate(json.loads(source), args.database)
        result.update(status='PASS', inventory=inventory, missingIdentityTables=sorted(TABLES - {row['name'] for row in inventory['identityTables']}),
                      localMigrationSha256={path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                        for path in sorted((ROOT / 'db/migrations').glob('*.sql')) if 6 <= int(path.name[:3]) <= 29 or path.name.startswith('031_')},
                      installedMigrationChecksums='NOT VERIFIED', clinicalCredentialReadiness='NOT VERIFIED')
        if execute(client, "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'").strip() != EXPECTED + ' running healthy':
            raise RuntimeError('POST_INSPECTION_RUNTIME_BASELINE_MISMATCH')
        result['existingRuntimeHealthyBeforeAndAfter'] = True
    except Exception as error:
        result.update(status='NOT VERIFIED', reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
    finally:
        client.close()
    (directory / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(directory / 'result.json')}), flush=True)
    return 0 if result['status'] == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
