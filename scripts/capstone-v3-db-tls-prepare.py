"""Development-only DB certificate staging. Key stays on Azure; no PG reload."""
import importlib.util
import json
import os
import pathlib
import shlex
import subprocess
import uuid
from datetime import datetime, timezone
import paramiko
import argparse
import re
from cryptography import x509
from cryptography.hazmat.primitives import hashes

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/capstone-v3-cloud-bootstrap.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def local(arguments):
    run = subprocess.run(['C:/Program Files/Git/usr/bin/openssl.exe', *arguments],capture_output=True,timeout=15)
    if run.returncode:
        raise RuntimeError('LOCAL_CERTIFICATE_OPERATION_FAILED')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--resume');args=parser.parse_args()
    if args.resume and not re.fullmatch('[a-f0-9]{32}',args.resume):raise SystemExit('OPERATION_INVALID')
    operation = args.resume or uuid.uuid4().hex
    stage = '/opt/highpass/v3-db-tls-' + operation
    directory = ROOT / 'artifacts/azure' / ('v3-db-tls-prepare-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + operation[:8])
    directory.mkdir(parents=True,exist_ok=False)
    result = {'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,
              'scope':'DEVELOPMENT_ONLY_DB_SERVER_CERTIFICATE_STAGING','databaseTlsActivated':False,
              'privateKeyExported':False,'tlsConnection':'NOT VERIFIED'}
    client = paramiko.SSHClient()
    try:
        ca_path = ROOT / 'tmp/certs/mtls/ca.crt'
        ca = x509.load_pem_x509_certificate(ca_path.read_bytes())
        now = datetime.now(timezone.utc)
        if ca.not_valid_before_utc>now or (ca.not_valid_after_utc-now).days<31 or not ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
            raise RuntimeError('EXISTING_DEVELOPMENT_CA_NOT_VALID')
        identity = pathlib.Path(os.environ['USERPROFILE']) / '.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity / 'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity / 'id_ed25519'),
                       look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health = "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        result['phase']='REMOTE_KEY_AND_CSR'
        if not args.resume:
            ops.root_shell(client,'umask 077; test ! -e '+stage+'; install -d -o root -g root -m 700 '+stage+
                       '; timeout 15s openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out '+stage+'/server.key 2>/dev/null'+
                       '; timeout 10s openssl req -new -key '+stage+'/server.key -subj '+shlex.quote('/CN=Highpass PostgreSQL DEVELOPMENT ONLY')+
                       ' -out '+stage+'/server.csr; test "$(stat -c %U:%G:%a '+stage+'/server.key)" = root:root:600')
        else:
            ops.root_shell(client,'test "$(stat -c %U:%G:%a '+stage+')" = root:root:700; test "$(stat -c %U:%G:%a '+stage+'/server.key)" = root:root:600; test -f '+stage+'/server.csr')
        csr = ops.root_shell(client,'cat '+stage+'/server.csr')
        request = x509.load_pem_x509_csr(csr.encode())
        if not request.is_signature_valid:raise RuntimeError('CSR_SIGNATURE_INVALID')
        temp = ROOT / 'tmp/certs' / ('capstone-v3-db-'+operation)
        if not args.resume:temp.mkdir(mode=0o700,exist_ok=False)
        csr_path=temp/'server.csr';cert_path=temp/'server.crt'
        result['phase']='LOCAL_CA_SIGN_AND_VERIFY'
        if not args.resume:
            csr_path.write_text(csr+'\n',encoding='ascii')
            local(['x509','-req','-in',str(csr_path),'-CA',str(ca_path),'-CAkey',str(ROOT/'tmp/certs/mtls/ca.key'),
               '-set_serial','0x'+uuid.uuid4().hex,'-out',str(cert_path),'-days','30','-sha256','-extfile',str(ROOT/'config/capstone-v3-postgres-dev-server.ext')])
        elif not csr_path.is_file() or csr_path.read_text().strip()!=csr.strip() or not cert_path.is_file():
            raise RuntimeError('RESUME_PUBLIC_CERTIFICATE_MISMATCH')
        local(['verify','-CAfile',str(ca_path),'-purpose','sslserver','-verify_hostname','highpass-v3-postgres.invalid',str(cert_path)])
        wrong=subprocess.run(['C:/Program Files/Git/usr/bin/openssl.exe','verify','-CAfile',str(ca_path),'-purpose','sslserver','-verify_hostname','wrong-db.invalid',str(cert_path)],capture_output=True,timeout=10)
        if wrong.returncode==0 or b'hostname mismatch' not in wrong.stderr:
            raise RuntimeError('HOSTNAME_NEGATIVE_NOT_VERIFIED')
        cert=x509.load_pem_x509_certificate(cert_path.read_bytes())
        if cert.public_key().public_numbers()!=request.public_key().public_numbers() or cert.not_valid_after_utc>ca.not_valid_after_utc:
            raise RuntimeError('CERTIFICATE_KEY_OR_CA_LIFETIME_INVALID')
        result['phase']='REMOTE_PUBLIC_CERTIFICATES'
        for filename,data in [('server.crt',cert_path.read_bytes()),('ca.crt',ca_path.read_bytes())]:
            if args.resume:
                existing=ops.root_shell(client,'test ! -e '+stage+'/'+filename+' || cat '+stage+'/'+filename)
                if existing:
                    if existing!=data.decode().strip():raise RuntimeError('EXISTING_PUBLIC_CERTIFICATE_MISMATCH')
                    continue
            shell='set -eu; umask 077; set -C; cat > '+stage+'/'+filename+'; chmod 644 '+stage+'/'+filename
            ops.command(client,'sudo -n timeout 10s sh -c '+shlex.quote(shell),data)
        result['phase']='REMOTE_CA_HOSTNAME_AND_KEY_VERIFY'
        ops.root_shell(client,'timeout 10s openssl verify -CAfile '+stage+'/ca.crt -purpose sslserver -verify_hostname highpass-v3-postgres.invalid '+stage+'/server.crt >/dev/null; '+
                       'test "$(openssl pkey -in '+stage+'/server.key -pubout 2>/dev/null | openssl sha256)" = "$(openssl x509 -in '+stage+'/server.crt -pubkey -noout | openssl sha256)"')
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result.update(status='PASS',remoteDirectory=stage,subject=cert.subject.rfc4514_string(),issuer=cert.issuer.rfc4514_string(),
                      serial=format(cert.serial_number,'x'),fingerprintSha256=cert.fingerprint(hashes.SHA256()).hex(),
                      validFrom=cert.not_valid_before_utc.isoformat(),validUntil=cert.not_valid_after_utc.isoformat(),
                      san=cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName),
                      extendedKeyUsage='serverAuth',keyCertificateMatch='PASS',hostnameAndCaVerification='PASS',wrongHostname='DENY',existingLegacyHealthy='PASS')
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
    finally:
        client.close();(directory/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(directory/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':
    raise SystemExit(main())
