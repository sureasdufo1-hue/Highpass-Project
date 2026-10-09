"""Pinned non-destructive bootstrap on existing capstone Azure only.

Legacy backup stays root-only on the host. Restore is isolated and denied to
ordinary logins. No original DICOM, private key, token or dump is printed/copied
locally. New target is never automatically dropped after uncertain outcomes.
"""
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import time
import uuid
from datetime import datetime, timezone

import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
PG = 'hp-capstone-control-postgres-1'
TARGET = 'highpass_v3_capstone'
EXPECTED = 'sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807'
POLICIES = ['hp_v3_clinical_policy', 'hp_v3_expiry_policy', 'hp_v3_pending_policy', 'hp_v3_preauth_publisher_policy',
            'hp_v3_preauth_reader_policy', 'hp_v3_consent_approval_policy', 'hp_v3_consent_withdraw_policy', 'hp_v3_consent_expiry_policy']
COLLISIONS = POLICIES + ['hp_v3_schema_owner', 'hp_v3_app', 'hp_v3_identity_preauth_writer', 'hp_v3_identity_preauth_reader']

# Strict streaming canonical data representation. COPY values are never filtered.
# Only fixed pg_dump metadata outside COPY is ignored; unexpected SQL fails.
CANON = r'''import sys,hashlib,re,json
h=hashlib.sha256();inside=False;total=0;row_total=0;blocks=[];sequences=[]
while True:
 line=sys.stdin.buffer.readline(2*1024*1024+1)
 if not line:break
 total+=len(line)
 if len(line)>2*1024*1024 or total>64*1024*1024:raise SystemExit(2)
 if inside:
  h.update(line)
  if line==b"\\.\n":
   inside=False;blocks.append({'headerSha256':hashlib.sha256(header).hexdigest(),'rows':len(rows),
    'orderedRowsSha256':hashlib.sha256(''.join(rows).encode()).hexdigest(),
    'sortedRowsSha256':hashlib.sha256(''.join(sorted(rows)).encode()).hexdigest()})
  else:
   row_total+=1
   if row_total>250000:raise SystemExit(2)
   rows.append(hashlib.sha256(line).hexdigest())
 elif line.startswith(b"COPY ") and line.rstrip().endswith(b" FROM stdin;"):
  inside=True;h.update(line);header=line;rows=[]
 elif line.startswith(b"SELECT pg_catalog.setval(") and line.rstrip().endswith(b");"):
  h.update(line);sequences.append(hashlib.sha256(line).hexdigest())
 elif not line.strip() or line.startswith((b"--",b"SET ",b"SELECT pg_catalog.set_config(",b"\\restrict ",b"\\unrestrict ")):pass
 else:raise SystemExit(3)
if inside:raise SystemExit(4)
if len(blocks)>256 or len(sequences)>256 or len({b['headerSha256'] for b in blocks})!=len(blocks):raise SystemExit(5)
logical=[{'headerSha256':b['headerSha256'],'rows':b['rows'],'sortedRowsSha256':b['sortedRowsSha256']} for b in blocks]
logical.sort(key=lambda b:b['headerSha256'])
canonical=hashlib.sha256(json.dumps(['HP_PGDUMP_COPY_MULTISET_V1',logical,sorted(sequences)],sort_keys=True,separators=(',',':')).encode()).hexdigest()
if '--diagnostic' in sys.argv:print(json.dumps({'canonicalDataSha256':canonical,'orderedDataSha256':h.hexdigest(),'blocks':blocks,'sequences':sequences}))
else:print(canonical)
'''


def restore_name(value):
    if not isinstance(value, str) or not re.fullmatch(r'highpass_v3_backup_check_[a-f0-9]{12}', value):
        raise RuntimeError('RESTORE_TARGET_NOT_OWNED')
    return value


def command(client, text, payload=None):
    channel = client.get_transport().open_session(timeout=10)
    channel.settimeout(10)
    output = bytearray()
    try:
        channel.exec_command(text)
        if payload is not None:
            channel.sendall(payload)
        channel.shutdown_write()
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            if channel.recv_ready():
                output.extend(channel.recv(32768))
            if channel.recv_stderr_ready():
                channel.recv_stderr(32768)  # Never retain raw errors/dump/logs.
            if len(output) > 65536:
                raise RuntimeError('SAFE_OUTPUT_LIMIT')
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                if channel.recv_exit_status() != 0:
                    raise RuntimeError('REMOTE_PHASE_FAILED')
                return bytes(output).decode('utf8').strip()
            time.sleep(0.05)
        raise RuntimeError('REMOTE_PHASE_DEADLINE')
    finally:
        channel.close()


def sql(client, body, database='hipass'):
    if database not in ('hipass', TARGET) and not re.fullmatch(r'highpass_v3_backup_check_[a-f0-9]{12}', database):
        raise RuntimeError('DATABASE_NOT_SELECTED')
    return command(client, 'sudo -n timeout 35s docker exec -i ' + PG +
                   ' psql -X -qAt -v ON_ERROR_STOP=1 -U hipass_bootstrap -d ' + database,
                   ("SET statement_timeout='3000ms';SET lock_timeout='1000ms';\n" + body).encode('utf8'))


def root_shell(client, body):
    return command(client, 'sudo -n timeout 35s bash -c ' + shlex.quote('set -eu -o pipefail; ' + body))


def main():
    operation = uuid.uuid4().hex
    backup_dir = '/opt/highpass/v3-bootstrap-' + operation
    backup_file = backup_dir + '/legacy.dump'
    restore = restore_name('highpass_v3_backup_check_' + operation[:12])
    marker = 'HIGHPASS_CAPSTONE_V3_BOOTSTRAP_' + operation
    directory = ROOT / 'artifacts/azure' / ('v3-bootstrap-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + operation[:8])
    directory.mkdir(parents=True, exist_ok=False)
    client = paramiko.SSHClient()
    phase = 'LOCAL_BASELINE'
    restore_attempted = False
    result = {'review': 'DRAFT / UNASSIGNED', 'scope': 'CAPSTONE SYNTHETIC CLOUD SCHEMA BOOTSTRAP ONLY',
              'clinicalReadiness': 'NOT VERIFIED', 'serviceActivated': False, 'credentialsIssued': False,
              'backupStoredInRepository': False, 'backupRemotePath': backup_file, 'operation': operation}
    try:
        generated = subprocess.run(['node', 'scripts/build-capstone-v3-bootstrap-sql.js'], cwd=ROOT, capture_output=True,
                                   timeout=10, check=True)
        bundle = json.loads(generated.stdout)
        if set(bundle) != {'bundleSha256', 'migrations', 'sql'} or not re.fullmatch(r'[a-f0-9]{64}', bundle['bundleSha256']) or len(bundle['migrations']) != 25:
            raise RuntimeError('LOCAL_BUNDLE_NOT_VERIFIED')
        result['bundleSha256'] = bundle['bundleSha256']
        phase = 'PINNED_CLOUD_AND_FRESH_COLLISION_CHECK'
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        health = "test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if command(client, health) != EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_BASELINE_MISMATCH')
        names = ','.join("'" + name + "'" for name in COLLISIONS)
        fresh = json.loads(sql(client, "BEGIN READ ONLY;SELECT json_build_object('target',EXISTS(SELECT 1 FROM pg_database WHERE datname='" + TARGET + "'),"
            "'roles',(SELECT count(*) FROM pg_roles WHERE rolname IN (" + names + ")),"
            "'restore',EXISTS(SELECT 1 FROM pg_database WHERE datname='" + restore + "'),"
            "'legacyBytes',pg_database_size('hipass'),'super',EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper));ROLLBACK;"))
        if fresh['target'] or fresh['roles'] != 0 or fresh['restore'] or fresh['super'] is not True or fresh['legacyBytes'] > 64*1024*1024:
            raise RuntimeError('TARGET_COLLISION_OR_CAPACITY_NOT_VERIFIED')
        free = command(client, "df -Pk / | tail -1").split()
        if len(free) < 4 or int(free[3]) < 2*1024*1024:
            raise RuntimeError('DISK_CAPACITY_NOT_VERIFIED')
        phase = 'PROTECTED_LEGACY_BACKUP'
        print(json.dumps({'phase': phase, 'status': 'RUNNING'}), flush=True)
        root_shell(client, 'umask 077; test ! -e ' + backup_dir + '; install -d -o root -g root -m 700 ' + backup_dir +
                   '; timeout 25s docker exec ' + PG + ' pg_dump -U hipass_bootstrap -d hipass -Fc > ' + backup_file +
                   '; test -s ' + backup_file + '; test "$(stat -c %U:%G:%a ' + backup_dir + ')" = root:root:700' +
                   '; test "$(stat -c %U:%G:%a ' + backup_file + ')" = root:root:600')
        backup_hash = root_shell(client, 'sha256sum ' + backup_file).split()[0]
        if not re.fullmatch(r'[a-f0-9]{64}', backup_hash):
            raise RuntimeError('BACKUP_HASH_NOT_VERIFIED')
        result.update(backupSha256=backup_hash, backupProtection='ROOT_ONLY_0700_DIRECTORY_0600_FILE')
        source_hash = root_shell(client, 'timeout 25s docker exec -i ' + PG +
            ' pg_restore --data-only --no-owner --no-privileges -f - < ' + backup_file + ' | python3 -c ' + shlex.quote(CANON))
        if not re.fullmatch(r'[a-f0-9]{64}', source_hash):
            raise RuntimeError('BACKUP_DATA_DIGEST_NOT_VERIFIED')
        phase = 'ISOLATED_ACTUAL_RESTORE'
        print(json.dumps({'phase': phase, 'status': 'RUNNING'}), flush=True)
        restore_attempted = True
        sql(client, 'CREATE DATABASE ' + restore + ' OWNER hipass_bootstrap ALLOW_CONNECTIONS false;'
            "COMMENT ON DATABASE " + restore + " IS '" + marker + "';REVOKE ALL ON DATABASE " + restore +
            ' FROM PUBLIC,hipass_app;ALTER DATABASE ' + restore + ' ALLOW_CONNECTIONS true;')
        root_shell(client, 'timeout 25s docker exec -i ' + PG + ' pg_restore --exit-on-error -U hipass_bootstrap -d ' + restore + ' < ' + backup_file)
        restored_hash = root_shell(client, 'timeout 25s docker exec ' + PG + ' pg_dump --data-only --no-owner --no-privileges -U hipass_bootstrap -d ' + restore +
                                   ' | python3 -c ' + shlex.quote(CANON))
        if source_hash != restored_hash:
            # Diagnose ordering without outputting a COPY header or any row value.
            diagnostic_program = shlex.quote(CANON) + ' --diagnostic'
            source_facts = json.loads(root_shell(client, 'timeout 25s docker exec -i ' + PG +
                ' pg_restore --data-only --no-owner --no-privileges -f - < ' + backup_file + ' | python3 -c ' + diagnostic_program))
            restored_facts = json.loads(root_shell(client, 'timeout 25s docker exec ' + PG +
                ' pg_dump --data-only --no-owner --no-privileges -U hipass_bootstrap -d ' + restore + ' | python3 -c ' + diagnostic_program))
            result['safeRestoreDiagnostic'] = {'source': source_facts, 'restored': restored_facts}
            raise RuntimeError('RESTORED_DATA_DIGEST_MISMATCH')
        result.update(legacyBackupRestore='PASS', restoredDataSha256=restored_hash,
                      dataDigestAlgorithm='HP_PGDUMP_COPY_MULTISET_V1',
                      restoreScope='Same existing PG cluster, original owner/ACL roles retained, every COPY row including duplicate multiplicity and sequence state; ignores physical row/table order only')
        phase = 'FRESH_TARGET_CREATION'
        print(json.dumps({'phase': phase, 'status': 'RUNNING'}), flush=True)
        result['targetCreationAttempted'] = True
        # Keep target inaccessible while creation/security metadata is established.
        sql(client, 'CREATE DATABASE ' + TARGET + ' OWNER hipass_bootstrap ALLOW_CONNECTIONS false;'
            "COMMENT ON DATABASE " + TARGET + " IS '" + marker + "';REVOKE ALL ON DATABASE " + TARGET +
            ' FROM PUBLIC,hipass_app;ALTER DATABASE ' + TARGET + ' ALLOW_CONNECTIONS true;')
        result['targetCreationAcknowledged'] = True
        phase = 'ATOMIC_DDL_LEDGER_AND_NOLOGIN_OWNER'
        print(json.dumps({'phase': phase, 'status': 'RUNNING'}), flush=True)
        sql(client, bundle['sql'], TARGET)
        installed = sql(client, "BEGIN READ ONLY;SELECT file_name||'|'||sha256||'|'||bundle_sha256 FROM highpass_v3.deployment_migrations ORDER BY sequence;ROLLBACK;", TARGET)
        expected = '\n'.join(entry['file'] + '|' + entry['sha256'] + '|' + bundle['bundleSha256'] for entry in bundle['migrations'])
        if installed != expected:
            raise RuntimeError('INSTALLED_LEDGER_NOT_VERIFIED')
        guards = json.loads(sql(client, "BEGIN READ ONLY;SELECT json_build_object("
            "'unsafeOwners',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND c.relkind IN ('r','p') AND c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner')),"
            "'unsafeFunctions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highpass_v3' AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner')),"
            "'safeRoles',(SELECT count(*) FROM pg_roles WHERE rolname IN (" + names + ") AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication),"
            "'legacyCanConnect',has_database_privilege('hipass_app','highpass_v3_capstone','CONNECT'),"
            "'schemaOwnerSafe',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='highpass_v3' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner')));ROLLBACK;", TARGET))
        if guards != {'unsafeOwners': 0, 'unsafeFunctions': 0, 'safeRoles': 9, 'legacyCanConnect': False, 'schemaOwnerSafe': True}:
            raise RuntimeError('OWNERSHIP_OR_ISOLATION_NOT_VERIFIED')
        if command(client, health) != EXPECTED + ' running healthy':
            raise RuntimeError('POST_BOOTSTRAP_LEGACY_HEALTH_NOT_VERIFIED')
        result.update(status='PASS', installedMigrationCount=25, catalogGuards=guards,
                      existingLegacyServiceHealthy='PASS', targetDatabase=TARGET)
    except Exception as error:
        result.update(status='NOT VERIFIED', phase=phase, reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
    finally:
        if restore_attempted:
            try:
                observed = sql(client, "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='" + restore_name(restore) + "';")
                if observed != marker:
                    raise RuntimeError('RESTORE_OWNERSHIP_NOT_VERIFIED')
                sql(client, 'DROP DATABASE ' + restore_name(restore) + ';')
                absent = sql(client, "SELECT count(*) FROM pg_database WHERE datname='" + restore + "';")
                result['ownedRestoreCleanup'] = 'PASS' if absent == '0' else 'NOT VERIFIED'
            except Exception:
                result['ownedRestoreCleanup'] = 'NOT VERIFIED'
            if result['ownedRestoreCleanup'] != 'PASS':
                result['status'] = 'NOT VERIFIED'
        client.close()
        result['backupRetainedForRecovery'] = True if 'backupSha256' in result else 'NOT VERIFIED'
    (directory / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(directory / 'result.json')}), flush=True)
    return 0 if result.get('status') == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
