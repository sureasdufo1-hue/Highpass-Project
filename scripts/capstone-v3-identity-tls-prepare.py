"""Stage separate30-day development API/proxy certificates; never export private keys."""
import importlib.util
import json
import os
import pathlib
import shlex
import subprocess
import uuid
import argparse
import re
from datetime import datetime, timezone

import paramiko
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import ExtendedKeyUsageOID

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cloud_ops', ROOT / 'scripts/capstone-v3-cloud-bootstrap.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
PROFILES = (
    ('api-server', 'Highpass Identity API DEVELOPMENT ONLY', 'capstone-v3-identity-api-dev-server.ext', 'sslserver'),
    ('proxy-client', 'Highpass Identity Proxy DEVELOPMENT ONLY', 'identity-edge-dev-client.ext', 'sslclient'),
)


def check_public_certificate(cert, csr, ca, role):
    cert.verify_directly_issued_by(ca)
    now = datetime.now(timezone.utc)
    if not csr.is_signature_valid or cert.public_key().public_numbers() != csr.public_key().public_numbers():
        raise RuntimeError('CSR_OR_CERTIFICATE_KEY_INVALID')
    if cert.not_valid_before_utc > now or not now < cert.not_valid_after_utc <= ca.not_valid_after_utc:
        raise RuntimeError('CERTIFICATE_DATE_INVALID')
    if (cert.not_valid_after_utc - cert.not_valid_before_utc).total_seconds() > 30 * 86400:
        raise RuntimeError('CERTIFICATE_LIFETIME_TOO_LONG')
    if cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
        raise RuntimeError('LEAF_MUST_NOT_BE_CA')
    eku = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
    expected = ExtendedKeyUsageOID.SERVER_AUTH if role == 'api-server' else ExtendedKeyUsageOID.CLIENT_AUTH
    if list(eku) != [expected]:
        raise RuntimeError('CERTIFICATE_ROLE_INVALID')
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    actual = [(type(item).__name__, str(item.value)) for item in san]
    wanted = [('DNSName', 'localhost'), ('IPAddress', '127.0.0.1')] if role == 'api-server' else [('UniformResourceIdentifier', 'spiffe://highpass.local/dev/identity-edge-proxy')]
    if actual != wanted:
        raise RuntimeError('CERTIFICATE_SAN_INVALID')
    return actual


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--resume');args=parser.parse_args()
    if args.resume and not re.fullmatch('[a-f0-9]{32}',args.resume):raise SystemExit('OPERATION_INVALID')
    operation = args.resume or uuid.uuid4().hex
    stage = '/opt/highpass/v3-identity-tls-' + operation
    evidence = ROOT / 'artifacts/azure' / ('v3-identity-tls-prepare-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + operation[:8])
    evidence.mkdir(parents=True, exist_ok=False)
    result = {'status': 'NOT VERIFIED', 'review': 'DRAFT / UNASSIGNED', 'operation': operation,
              'scope': 'DEVELOPMENT_ONLY_API_PROXY_CERTIFICATE_STAGING', 'serviceActivated': False,
              'privateKeyExported': False, 'certificates': []}
    client = paramiko.SSHClient()
    public_keys=[]
    try:
        ca_path = ROOT / 'tmp/certs/mtls/ca.crt'
        ca_data = ca_path.read_bytes()
        ca = x509.load_pem_x509_certificate(ca_data)
        now = datetime.now(timezone.utc)
        if ca.not_valid_before_utc > now or (ca.not_valid_after_utc - now).days < 31 or not ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
            raise RuntimeError('DEVELOPMENT_CA_INVALID')
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60', username='highpassadmin', key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        health = "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        if args.resume:
            ops.root_shell(client,'test "$(stat -c %u:%g:%a ' + stage + ')" = 0:0:700')
        else:
            ops.root_shell(client, 'umask 077; test ! -e ' + stage + '; install -d -o root -g root -m 700 ' + stage)

        def upload(name, data):
            # Public certificates only, no key or combined authority-file payload.
            existing=ops.root_shell(client,'test ! -e '+stage+'/'+name+' || cat '+stage+'/'+name)
            if existing:
                if existing != data.decode().strip():raise RuntimeError('EXISTING_PUBLIC_CERTIFICATE_MISMATCH')
                return
            shell = 'set -eu; umask 077; set -C; cat > ' + stage + '/' + name + '; chown root:65532 ' + stage + '/' + name + '; chmod 640 ' + stage + '/' + name
            ops.command(client, 'sudo -n timeout 10s sh -c ' + shlex.quote(shell), data)

        upload('api-ca.crt', ca_data)
        for role, subject, profile, purpose in PROFILES:
            result['phase'] = role + '-KEY_CSR'
            ops.root_shell(client, 'umask 077; if test -e '+stage+'/'+role+'.key; then test -f '+stage+'/'+role+'.csr; else '
                           'timeout 15s openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ' + stage + '/' + role + '.key 2>/dev/null; '
                           'timeout 10s openssl req -new -key ' + stage + '/' + role + '.key -subj ' + shlex.quote('/CN=' + subject) + ' -out ' + stage + '/' + role + '.csr; fi')
            csr_data = ops.root_shell(client, 'cat ' + stage + '/' + role + '.csr').encode()
            csr = x509.load_pem_x509_csr(csr_data)
            if not csr.is_signature_valid:
                raise RuntimeError('CSR_SIGNATURE_INVALID')
            existing_cert=ops.root_shell(client,'test ! -e '+stage+'/'+role+'.crt || cat '+stage+'/'+role+'.crt')
            if existing_cert:
                cert_data=existing_cert.encode()
            else:
                signed = subprocess.run(['C:/Program Files/Git/usr/bin/openssl.exe', 'x509', '-req', '-CA', str(ca_path),
                                     '-CAkey', str(ROOT / 'tmp/certs/mtls/ca.key'), '-set_serial', '0x' + uuid.uuid4().hex,
                                     '-days', '30', '-sha256', '-extfile', str(ROOT / 'config' / profile)],
                                        input=csr_data, capture_output=True, timeout=15)
                if signed.returncode:raise RuntimeError('PUBLIC_CSR_SIGNING_FAILED')
                cert_data=signed.stdout
            cert = x509.load_pem_x509_certificate(cert_data)
            san = check_public_certificate(cert, csr, ca, role)
            if cert.public_key().public_numbers() in public_keys:raise RuntimeError('CERTIFICATE_KEY_REUSE')
            public_keys.append(cert.public_key().public_numbers())
            upload(role + '.crt', cert_data)
            result['phase'] = role + '-REMOTE_VERIFY'
            # Wait only for the actual remote clock to enter NotBefore, never waive dates.
            not_before=int(cert.not_valid_before_utc.timestamp())
            ops.root_shell(client,'for attempt in 1 2 3 4 5; do test "$(date +%s)" -lt '+str(not_before)+' || break; sleep 1; done; test "$(date +%s)" -ge '+str(not_before))
            verification = 'timeout 10s openssl verify -CAfile ' + stage + '/api-ca.crt -purpose ' + purpose
            if role == 'api-server':verification += ' -verify_hostname localhost'
            ops.root_shell(client, verification + ' ' + stage + '/' + role + '.crt >/dev/null')
            result['phase']=role+'-KEY_MATCH'
            digests=ops.root_shell(client,'openssl pkey -in '+stage+'/'+role+'.key -pubout 2>/dev/null | openssl sha256; openssl x509 -in '+stage+'/'+role+'.crt -pubkey -noout | openssl sha256').splitlines()
            if len(digests)!=2 or digests[0]!=digests[1]:raise RuntimeError('REMOTE_KEY_MATCH_FAILED')
            result['phase']=role+'-KEY_PERMISSIONS'
            ops.root_shell(client,'chown root:65532 '+stage+'/'+role+'.key; chmod 640 '+stage+'/'+role+'.key; test "$(stat -c %u:%g:%a:%h '+stage+'/'+role+'.key)" = 0:65532:640:1')
            ops.root_shell(client,'test "$(stat -c %u:%g:%a:%h '+stage+'/'+role+'.crt)" = 0:65532:640:1; test "$(stat -c %u:%g:%a:%h '+stage+'/api-ca.crt)" = 0:65532:640:1')
            wrong_purpose = 'sslclient' if role == 'api-server' else 'sslserver'
            negative = 'if output=$(timeout 10s openssl verify -CAfile ' + stage + '/api-ca.crt -purpose ' + wrong_purpose + ' ' + stage + '/' + role + '.crt 2>&1); then exit 1; fi; case "$output" in *"error 26"*) :;; *) exit 1;; esac'
            ops.root_shell(client, negative)
            if role == 'api-server':
                ops.root_shell(client, 'if output=$(timeout 10s openssl verify -CAfile ' + stage + '/api-ca.crt -verify_hostname wrong-api.invalid ' + stage + '/' + role + '.crt 2>&1); then exit 1; fi; case "$output" in *"error 62"*) :;; *) exit 1;; esac')
            result['certificates'].append({'role': role, 'subject': cert.subject.rfc4514_string(), 'issuer': cert.issuer.rfc4514_string(),
                                          'serial': format(cert.serial_number, 'x'), 'fingerprintSha256': cert.fingerprint(hashes.SHA256()).hex(),
                                          'validFrom': cert.not_valid_before_utc.isoformat(), 'validUntil': cert.not_valid_after_utc.isoformat(),
                                          'san': san, 'purpose': purpose, 'keyMatch': 'PASS', 'caVerification': 'PASS',
                                          'wrongPurpose': 'DENY', 'wrongHostname': 'DENY' if role == 'api-server' else 'N/A-URI_CLIENT'})
        if result['certificates'][0]['fingerprintSha256'] == result['certificates'][1]['fingerprintSha256']:
            raise RuntimeError('CERTIFICATE_ROLE_REUSE')
        if ops.command(client, health) != ops.EXPECTED + ' running healthy':
            raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result.update(status='PASS', remoteDirectory=stage, existingLegacyHealthy='PASS', distinctRoleKeys='PASS',protectedMounts='ROOT_0700_PARENT_ROOT_65532_0640_FILES')
    except Exception as error:
        result.update(status='NOT VERIFIED', reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__, remoteDirectory=stage)
    finally:
        client.close()
        (evidence / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(evidence / 'result.json')}))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
