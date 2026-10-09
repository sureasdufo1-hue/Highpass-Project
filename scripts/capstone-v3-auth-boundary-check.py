"""Safe read-only auth-rule classification for fixed capstone database only."""
import importlib.util
import json
import os
import pathlib
import paramiko
import argparse
import shlex
import uuid

ROLES = 'hp_v3_app,hp_v3_identity_preauth_writer,hp_v3_identity_preauth_reader'


def v3_prefix(operation):
    import re
    if not re.fullmatch('[a-f0-9]{32}', operation):
        raise ValueError('OPERATION_INVALID')
    return ('# HIGHPASS_V3_AUTH_' + operation + '\n' +
            'local highpass_v3_capstone ' + ROLES + ' scram-sha-256\n' +
            'host highpass_v3_capstone ' + ROLES + ' 127.0.0.1/32 scram-sha-256\n' +
            'host highpass_v3_capstone ' + ROLES + ' ::1/128 scram-sha-256\n' +
            'host highpass_v3_capstone ' + ROLES + ' all reject\n' +
            'local all ' + ROLES + ' reject\n' +
            'host all ' + ROLES + ' all reject\n')

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/capstone-v3-cloud-bootstrap.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply-v3-only', action='store_true')
    args = parser.parse_args()
    client = paramiko.SSHClient()
    try:
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        if args.apply_v3_only:
            health = "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
            if ops.command(client, health) != ops.EXPECTED + ' running healthy':
                raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
            operation = uuid.uuid4().hex
            hba = ops.sql(client, 'SHOW hba_file;', ops.TARGET)
            if hba != '/var/lib/postgresql/data/pg_hba.conf':
                raise RuntimeError('HBA_PATH_NOT_SELECTED')
            original = ops.command(client, 'sudo -n timeout 10s docker exec ' + ops.PG + ' cat ' + hba)
            if 'HIGHPASS_V3_AUTH_' in original:
                raise RuntimeError('EXISTING_V3_HBA_RULES_REQUIRE_REVIEW')
            prefix = v3_prefix(operation)
            backup = hba + '.highpass-v3-' + operation + '.before'
            temporary = hba + '.highpass-v3-' + operation + '.pending'
            shell = 'set -eu; umask 077; test ! -e ' + backup + '; test ! -e ' + temporary + '; cp -p ' + hba + ' ' + backup + '; set -C; cat > ' + temporary + '; chown "$(stat -c %u:%g ' + hba + ')" ' + temporary + '; chmod "$(stat -c %a ' + hba + ')" ' + temporary + '; mv ' + temporary + ' ' + hba
            ops.command(client, 'sudo -n timeout 10s docker exec -i ' + ops.PG + ' sh -c ' + shlex.quote(shell), (prefix + original + '\n').encode())
            try:
                invalid = ops.sql(client, 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;', ops.TARGET)
                if invalid != '0' or ops.sql(client, 'SELECT pg_reload_conf();', ops.TARGET) != 't':
                    raise RuntimeError('HBA_VALIDATION_OR_RELOAD_FAILED')
                if ops.command(client, health) != ops.EXPECTED + ' running healthy':
                    raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
                print(json.dumps({'operation': operation, 'configuration': 'PASS', 'scope': 'ONLY_THREE_V3_ROLES', 'previousHbaRemotePath': backup,
                                  'externalPlaintext': 'REJECT_RULE_INSTALLED', 'runtimeTls': 'NOT VERIFIED', 'authentication': 'NOT VERIFIED'}))
            except Exception:
                restore = 'set -eu; test -f ' + backup + '; grep -q ' + shlex.quote('# HIGHPASS_V3_AUTH_' + operation) + ' ' + hba + '; cp -p ' + backup + ' ' + hba
                ops.command(client, 'sudo -n timeout 10s docker exec ' + ops.PG + ' sh -c ' + shlex.quote(restore))
                ops.sql(client, 'SELECT pg_reload_conf();', ops.TARGET)
                raise
        value = ops.sql(client, "BEGIN READ ONLY;SELECT json_build_object('rules',coalesce(json_agg(json_build_object('line',line_number,'type',type,'database',database,'roles',user_name,'address',address,'netmask',netmask,'method',auth_method,'valid',error IS NULL) ORDER BY rule_number),'[]'::json)) FROM pg_hba_file_rules;ROLLBACK;", ops.TARGET)
        print(value)
    finally:
        client.close()


if __name__ == '__main__':
    main()
