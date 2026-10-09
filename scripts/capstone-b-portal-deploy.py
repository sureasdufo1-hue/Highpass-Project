"""One-time reviewed B portal and explicit cloud Mock IdP deployment.

Preserves A PACS, PostgreSQL volume, previous cloud image and root secrets.
Private B TLS key is generated on B; CA/signing/presenter keys never go to B.
"""
import getpass
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
import sys
import time
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base = gateway.base
APP = "highpass-platform-mvp:capstone-b-portal-20261009"
IMAGE = "sha256:69cd63bc4966c83e46a609e90e44385a63c68b7941b713690135b445833fb693"
B_SECRETS = "/opt/highpass/capstone-b-portal-secrets"
C_SECRETS = "/opt/highpass/capstone-control-secrets"


def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("b-portal-" + stamp)
    directory.mkdir(parents=True)
    stage_b = "/home/server/.highpass-b-portal-" + stamp
    stage_c = "/home/highpassadmin/.highpass-mock-idp-" + stamp
    credential = getpass.getpass("VM credential (concealed): ")
    trust = base.ops.LocalVmTrust()
    clients = []
    checks = []
    phase = "REVIEWED_IMAGE_AND_HOST_ATTESTATION"
    try:
        scan = json.loads((ROOT / "artifacts/security/container-scan/capstone-b-portal-20261009.json").read_text())
        if scan.get("Metadata", {}).get("ImageID") != IMAGE or any(v.get("Severity") in ["HIGH", "CRITICAL"] for r in scan.get("Results", []) for v in r.get("Vulnerabilities", [])) or base.local(["docker", "image", "inspect", APP, "--format", "{{.Id}}"] ) != IMAGE:
            raise RuntimeError("FRESH_SECURITY_SCAN_REQUIRED")
        address, mac, _ = base.ops.ROLES["B"]
        key = trust.key("B", credential, directory / "B-public-host.key")
        b = paramiko.SSHClient()
        b.get_host_keys().add(address, key.get_name(), key)
        b.set_missing_host_key_policy(paramiko.RejectPolicy())
        b.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients.append(b)
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud = paramiko.SSHClient()
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients.append(cloud)
        def run(client, command, seconds=30):
            prefix = "sudo -S -p '' " if client is b else "sudo -n "
            code, output = base.ops.run(client, prefix + "timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), credential=credential if client is b else None, seconds=seconds + 5)
            if code:
                raise RuntimeError("REMOTE_OPERATION_FAILED_" + phase + "_" + str(code))
            return output.strip()
        run(b, "test $(cat /sys/class/net/ens33/address) = " + mac + "; systemctl is-active --quiet wg-quick@hp-capstone; test ! -e " + B_SECRETS + "; test -z \"$(ss -H -ltn 'sport = :9443')\"; test -z \"$(docker ps -aq --filter label=com.docker.compose.project=hp-capstone-b-portal)\"")
        if run(cloud, "test $(hostname) = highpass-cloud; docker inspect hp-capstone-control-control-1 --format '{{.Image}}'") != base.APP_ID:
            raise RuntimeError("UNEXPECTED_CLOUD_BASELINE")
        run(cloud, "test ! -e " + C_SECRETS + "/capstone-login-key")
        volume_command = "docker volume inspect hp-capstone-control_capstone-control-db --format '{{.CreatedAt}}'"
        volume_before = run(cloud, volume_command)
        run(cloud, "docker tag " + base.APP_ID + " highpass-platform-mvp:capstone-before-mock-idp-20261009")
        phase = "EXACT_IMAGE_TRANSFER"
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), APP], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        for client, stage, files in [(b, stage_b, [("scripts/capstone-b-portal-prepare.sh", "prepare.sh"), ("infra/workstation/hospital-b-portal.compose.yml", "portal.compose.yml")]), (cloud, stage_c, [("infra/azure/capstone-control.compose.yml", "control.compose.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.compose.yml"), ("infra/azure/capstone-mock-idp.compose.yml", "mock.compose.yml")])]:
            base.emit({"phase": phase, "role": "B" if client is b else "CLOUD", "status": "RUNNING", "bytes": archive.stat().st_size})
            started = time.monotonic()
            def deadline(transferred, total):
                if time.monotonic() - started > 600:
                    raise RuntimeError("TRANSFER_DEADLINE")
            with client.open_sftp() as sftp:
                sftp.get_channel().settimeout(15)
                sftp.mkdir(stage, mode=0o700)
                sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
                for source, name in files:
                    with sftp.open(stage + "/" + name, "w") as stream:
                        stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n"))
                    sftp.chmod(stage + "/" + name, 0o600)
            if run(client, "sha256sum " + shlex.quote(stage + "/reviewed-app.tar"), 45).split()[0] != digest:
                raise RuntimeError("ARCHIVE_HASH_MISMATCH")
            run(client, "docker load -i " + shlex.quote(stage + "/reviewed-app.tar"), 180)
            if run(client, "docker image inspect " + APP + " --format '{{.Id}}'") != IMAGE:
                raise RuntimeError("LOADED_IMAGE_MISMATCH")
        phase = "B_LOCAL_PRIVATE_KEY_AND_PUBLIC_CERTIFICATE"
        if "B_PORTAL_PREPARE=PASS" not in run(b, "bash " + shlex.quote(stage_b + "/prepare.sh") + " " + shlex.quote(stage_b)):
            raise RuntimeError("B_PREPARATION_FAILED")
        with b.open_sftp() as sftp:
            sftp.get(stage_b + "/b-server.csr", str(directory / "b-server.csr"))
        openssl = "C:/Program Files/Git/usr/bin/openssl.exe"
        certificate = directory / "b-server.crt"
        base.local([openssl, "x509", "-req", "-days", "31", "-in", str(directory / "b-server.csr"), "-CA", str(ROOT / "tmp/certs/mtls/ca.crt"), "-CAkey", str(ROOT / "tmp/certs/mtls/ca.key"), "-set_serial", "0x" + os.urandom(16).hex(), "-extfile", str(ROOT / "config/capstone-b-portal-dev-server.ext"), "-out", str(certificate)])
        base.local([openssl, "verify", "-purpose", "sslserver", "-verify_ip", address, "-CAfile", str(ROOT / "tmp/certs/mtls/ca.crt"), str(certificate)])
        with gateway.root_sftp(b, credential) as sftp:
            for source, name in [(certificate, "b-server.crt"), (ROOT / "tmp/certs/mtls/ca.crt", "ca.crt")]:
                sftp.put(str(source), B_SECRETS + "/" + name)
                sftp.chmod(B_SECRETS + "/" + name, 0o640)
                sftp.chown(B_SECRETS + "/" + name, 0, 65532)
        phase = "CLOUD_ONLY_PRESENTER_KEY_AND_IDP"
        generation = "import os,secrets; p='" + C_SECRETS + "/capstone-login-key'; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640); os.fchown(f,0,65532); os.write(f,secrets.token_hex(32).encode()); os.close(f)"
        run(cloud, "python3 -c " + shlex.quote(generation))
        environment = "HIPASS_APP_IMAGE=" + APP + " HIPASS_POSTGRES_IMAGE=" + base.PG + " HIPASS_CLOUD_SECRET_DIR=" + C_SECRETS + " HIPASS_CAPSTONE_PUBLIC_ORIGIN=https://192.168.111.149:9443 "
        compose = "docker compose -p hp-capstone-control -f " + stage_c + "/control.compose.yml -f " + stage_c + "/ingress.compose.yml -f " + stage_c + "/mock.compose.yml"
        run(cloud, "env " + environment + compose + " up -d --wait --wait-timeout 180 --pull never", 240)
        checks.append({"test": "CLOUD_DB_VOLUME_PRESERVED", "status": "PASS" if run(cloud, volume_command) == volume_before else "FAIL"})
        checks.append({"test": "CLOUD_EXACT_REVIEWED_IMAGE", "status": "PASS" if run(cloud, "docker inspect hp-capstone-control-control-1 --format '{{.Image}}'") == IMAGE else "FAIL"})
        phase = "B_PORTAL_PRIVATE_TRANSPORT_READINESS"
        compose_b = "env HIPASS_APP_IMAGE=" + APP + " HIPASS_B_PORTAL_SECRET_DIR=" + B_SECRETS + " docker compose -p hp-capstone-b-portal -f " + stage_b + "/portal.compose.yml"
        run(b, compose_b + " up -d --wait --wait-timeout 120 --pull never", 180)
        checks.append({"test": "B_EXACT_REVIEWED_IMAGE", "status": "PASS" if run(b, "docker inspect hp-capstone-b-portal-portal-1 --format '{{.Image}}'") == IMAGE else "FAIL"})
        ca = B_SECRETS + "/ca.crt"
        for name, target, expected in [("B_HTTPS_PORTAL", "/", "200"), ("B_CLOUD_API_HEALTH", "/api/health", "200"), ("B_UNAUTHENTICATED_DICOM_DENY", "/dicomweb/studies", "401"), ("B_INTERNAL_SERVICE_ROUTE_DENY", "/gateway/data-plane/authorize", "404")]:
            output = run(b, "curl --silent --show-error --connect-timeout 3 --max-time 8 --cacert " + ca + " -o /dev/null -w '%{http_code} %{ssl_verify_result}' https://192.168.111.149:9443" + target, 12)
            checks.append({"test": name, "status": "PASS" if output == expected + " 0" else "FAIL", "httpTls": output})
        phase = "ACTUAL_B_LOGIN_AND_FIXED_PROFILE_AUTHENTICATION"
        context = ssl.create_default_context(cafile=str(ROOT / "tmp/certs/mtls/ca.crt"))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
        origin = "https://192.168.111.149:9443"
        def http(path, body=None, headers=None):
            request = urllib.request.Request(origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers or {})
            try:
                response = opener.open(request, timeout=12)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                payload = response.read(1048577)
                if len(payload) > 1048576:
                    raise RuntimeError("PROBE_RESPONSE_LIMIT")
                return response.status, json.loads(payload)
        for name, headers, expected in [("LOGIN_MISSING_ORIGIN_DENY", {"content-type": "application/json"}, 403), ("LOGIN_WRONG_KEY_DENY", {"content-type": "application/json", "origin": origin}, 401)]:
            status, _ = http("/api/capstone-demo/login", {"key": "invalid-presenter-key"}, headers)
            checks.append({"test": name, "status": "PASS" if status == expected else "FAIL", "http": status})
        with gateway.root_sftp(cloud) as sftp, sftp.open(C_SECRETS + "/capstone-login-key", "rb") as stream:
            presenter = stream.read(129).decode()
        status, session = http("/api/capstone-demo/login", {"key": presenter}, {"content-type": "application/json", "origin": origin})
        presenter = None
        profiles = session.get("profiles", {})
        valid = status == 200 and set(profiles) == {"PATIENT", "DOCTOR", "SECURITY_ADMIN"} and session.get("environment") == "CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY"
        checks.append({"test": "ACTUAL_FIXED_SYNTHETIC_LOGIN", "status": "PASS" if valid else "FAIL", "http": status})
        if not valid:
            raise RuntimeError("ACTUAL_MOCK_LOGIN_NOT_VERIFIED")
        status, _ = http("/api/imaging-studies", headers={"authorization": "Bearer " + profiles["PATIENT"]})
        checks.append({"test": "PATIENT_SIGNED_JWT_API_ACCESS", "status": "PASS" if status == 200 else "FAIL", "http": status})
        status, _ = http("/api/imaging-studies", headers={"x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001"})
        checks.append({"test": "B_SPOOFED_MOCK_HEADERS_DENY", "status": "PASS" if status == 401 else "FAIL", "http": status})
        profiles = None
        session = None
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients:
            client.close()
        trust.close()
        credential = None
    result = {"scope": "B_HTTPS_PORTAL_AND_EXPLICIT_SYNTHETIC_CLOUD_IDP_DEPLOYMENT", "review": "DRAFT / UNASSIGNED", "stageB": stage_b, "stageCloud": stage_c, "checks": checks, "status": "PASS" if checks and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED", "browserViewer": "NOT VERIFIED", "keyVaultCrypto": "NOT VERIFIED", "rollbackExecution": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
