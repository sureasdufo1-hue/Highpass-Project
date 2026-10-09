"""Run the fixed HTTPS registration check with a secret passed only via stdin."""
import importlib.util
import argparse
import json
import os
import pathlib
import subprocess
import re
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('gateway', ROOT / 'scripts/capstone-a-gateway-ops.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-image-id', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', args.expected_image_id):
        raise SystemExit('EXACT_IMAGE_ID_REQUIRED')
    client = paramiko.SSHClient()
    try:
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, _ = gateway.base.ops.run(client, "sudo -n timeout 10s bash -c 'test $(hostname) = highpass-cloud; test $(docker inspect hp-capstone-control-control-1 --format {{.Image}}) = " + args.expected_image_id + "'", seconds=15)
        if code:
            raise RuntimeError('EXACT_DEPLOYED_CANDIDATE_REQUIRED')
        with gateway.root_sftp(client) as sftp, sftp.open('/opt/highpass/capstone-control-secrets/capstone-login-key','rb') as stream:
            presenter = stream.read(129)
        process = subprocess.run(['node','scripts/phantom-catalog-live-check.js'], cwd=ROOT,
                                 input=presenter, capture_output=True, timeout=100)
        presenter = None
        result = json.loads(process.stdout.decode('utf8'))
        print(json.dumps(result))
        return process.returncode
    except Exception as error:
        print(json.dumps({'status':'NOT VERIFIED','reason':str(error) if isinstance(error,RuntimeError) else type(error).__name__,'review':'DRAFT / UNASSIGNED'}))
        return 1
    finally:
        client.close()


if __name__ == '__main__':
    raise SystemExit(main())
