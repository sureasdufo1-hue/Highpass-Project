"""Apply fictional hospital wallpapers over independently pinned SSH; no sudo."""
import argparse
import ast
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
SCHEMA = 'org.gnome.desktop.background'
KEYS = ('picture-uri', 'picture-uri-dark', 'picture-options')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--a', required=True)
    parser.add_argument('--b', required=True)
    parser.add_argument('--role', choices=('A', 'B'))
    args = parser.parse_args()
    sources = {role: pathlib.Path(value).resolve() for role, value in [('A', args.a), ('B', args.b)]}
    for source in sources.values():
        if not source.is_file() or not source.is_relative_to(ROOT / 'assets/hospital-wallpapers'):
            raise SystemExit('WORKSPACE_WALLPAPER_REQUIRED')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    directory = ROOT / 'artifacts/workstation' / ('hospital-wallpapers-' + stamp)
    directory.mkdir(parents=True, exist_ok=False)
    credential = getpass.getpass('VM credential (concealed): ')
    trust = None
    results = []
    try:
        trust = ops.LocalVmTrust()
        for role in ((args.role,) if args.role else ('A', 'B')):
            client = paramiko.SSHClient()
            previous = {}
            changed = False
            result = {'hospital': role, 'status': 'NOT VERIFIED', 'review': 'DRAFT / UNASSIGNED'}
            try:
                address, mac, _ = ops.ROLES[role]
                key = trust.key(role, credential, directory / (role + '-public-host.key'))
                client.get_host_keys().add(address, key.get_name(), key)
                client.set_missing_host_key_policy(paramiko.RejectPolicy())
                client.connect(address, username='server', password=credential, look_for_keys=False,
                               allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)

                def command(value):
                    code, output = ops.run(client, 'timeout 15s bash -c ' + shlex.quote('set -eu; ' + value), seconds=20)
                    if code:
                        raise RuntimeError('REMOTE_COMMAND_FAILED_' + str(code) + ': ' + value + ': ' + output.strip()[:500])
                    return output.strip()

                command('test "$(id -un)" = server; test "$(cat /sys/class/net/ens33/address)" = ' + mac)
                uid = command('id -u')
                if not uid.isdigit():
                    raise RuntimeError('INVALID_UID')
                session_code, _ = ops.run(client, 'timeout 5s pgrep -u ' + uid + ' -x gnome-shell', seconds=10)
                bus_code, _ = ops.run(client, 'test -S /run/user/' + uid + '/bus', seconds=10)
                env = ('env XDG_RUNTIME_DIR=/run/user/' + uid + ' DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/' + uid + '/bus '
                       if bus_code == 0 else 'dbus-run-session -- ')
                for setting in KEYS:
                    previous[setting] = command(env + 'gsettings get ' + SCHEMA + ' ' + setting)
                # Write recovery data before any desktop setting changes. Public paths only.
                backup = {'hospital': role, 'address': address, 'uid': uid, 'schema': SCHEMA, 'settings': previous}
                (directory / (role + '-previous-background.json')).write_text(json.dumps(backup, indent=2), encoding='utf8')
                remote_dir = '/home/server/Pictures/Highpass/' + stamp
                command('mkdir -p ' + shlex.quote(remote_dir))
                target = remote_dir + '/hospital-' + role.lower() + sources[role].suffix.lower()
                command('test ! -e ' + shlex.quote(target))
                with client.open_sftp() as sftp:
                    sftp.get_channel().settimeout(15)
                    sftp.put(str(sources[role]), target, confirm=True)
                    sftp.chmod(target, 0o644)
                digest = hashlib.sha256(sources[role].read_bytes()).hexdigest()
                actual = command('sha256sum ' + shlex.quote(target)).split()[0]
                if digest != actual:
                    raise RuntimeError('WALLPAPER_HASH_MISMATCH')
                uri = 'file://' + target
                changed = True
                for setting in KEYS:
                    value = 'zoom' if setting == 'picture-options' else uri
                    command(env + 'gsettings set ' + SCHEMA + ' ' + setting + ' ' + shlex.quote(value))
                verified = {setting: command(env + 'gsettings get ' + SCHEMA + ' ' + setting) for setting in KEYS}
                for setting, value in verified.items():
                    if ast.literal_eval(value) != ('zoom' if setting == 'picture-options' else uri):
                        raise RuntimeError('SETTING_READBACK_MISMATCH')
                result.update(status='PASS', sha256=digest, localImage=str(sources[role]), remoteImage=target,
                              settings=verified, activeGnomeSession='PASS' if session_code == 0 else 'NOT ACTIVE — APPLIES AT NEXT DESKTOP LOGIN', uploadedHash='PASS',
                              visualScreenshot='NOT VERIFIED', backup=str(directory / (role + '-previous-background.json')))
                rollback = '\n'.join(env + 'gsettings set ' + SCHEMA + ' ' + setting + ' ' + shlex.quote(value)
                                     for setting, value in previous.items()) + '\n'
                (directory / (role + '-restore-background.sh')).write_text(rollback, encoding='utf8')
            except Exception as error:
                result['reason'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
                if changed:
                    try:
                        for setting, value in previous.items():
                            command(env + 'gsettings set ' + SCHEMA + ' ' + setting + ' ' + shlex.quote(value))
                        result['failureRollback'] = 'PASS'
                    except Exception:
                        result['failureRollback'] = 'NOT VERIFIED'
            finally:
                client.close()
            results.append(result)
            print(json.dumps(result, ensure_ascii=True), flush=True)
    finally:
        credential = None
        if trust:
            trust.close()
    summary = {'results': results, 'scope': 'FICTIONAL CAPSTONE DESKTOP WALLPAPERS ONLY',
               'status': 'PASS' if len(results) == (1 if args.role else 2) and all(row['status'] == 'PASS' for row in results) else 'NOT VERIFIED'}
    (directory / 'result.json').write_text(json.dumps(summary, indent=2), encoding='utf8')
    print(json.dumps({'status': summary['status'], 'evidence': str(directory / 'result.json')}), flush=True)
    return 0 if summary['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
