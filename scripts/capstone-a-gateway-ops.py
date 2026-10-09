"""Deploy actual A Gateway, preserving the existing PACS and cloud credentials."""
import getpass
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
import sys
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cloud_ops", ROOT / "scripts/capstone-cloud-control-ops.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
SECRET_DIR = "/opt/highpass/capstone-a-gateway-secrets"

def root_sftp(client, credential=None):
    channel = client.get_transport().open_session(timeout=10)
    channel.settimeout(15)
    command = "sudo -n /usr/lib/openssh/sftp-server" if credential is None else "sudo -S -p '' /usr/lib/openssh/sftp-server"
    channel.exec_command(command)
    if credential is not None:
        channel.sendall((credential + "\n").encode())
    return paramiko.SFTPClient(channel)

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("a-gateway-" + stamp)
    directory.mkdir(parents=True)
    stage = "/home/server/.highpass-a-gateway-" + stamp
    credential = getpass.getpass("VM credential (concealed): ")
    trust = base.ops.LocalVmTrust()
    clients = {}
    checks = []
    phase = "EXACT_IMAGE_AND_HOST_ATTESTATION"
    try:
        if base.local(["docker", "image", "inspect", base.APP, "--format", "{{.Id}}"] ) != base.APP_ID:
            raise RuntimeError("LOCAL_IMAGE_CHANGED")
        scan = json.loads((ROOT / "artifacts/security/container-scan/capstone-gateway-ingress-20261009.json").read_text())
        if scan.get("Metadata", {}).get("ImageID") != base.APP_ID or any(v.get("Severity") in ["HIGH", "CRITICAL"] for r in scan.get("Results", []) for v in r.get("Vulnerabilities", [])):
            raise RuntimeError("LATEST_SECURITY_SCAN_REQUIRED")
        for role in ["A", "B"]:
            address, mac, _ = base.ops.ROLES[role]
            key = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            client.get_host_keys().add(address, key.get_name(), key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            clients[role] = client
            code, _ = base.ops.run(client, "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac + " && systemctl is-active --quiet wg-quick@hp-capstone", seconds=10)
            if code:
                raise RuntimeError("VM_ROLE_MISMATCH_" + role)
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud = paramiko.SSHClient()
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients["C"] = cloud
        code, _ = base.ops.run(cloud, "test $(hostname) = highpass-cloud && test $(id -un) = highpassadmin", seconds=10)
        if code:
            raise RuntimeError("CLOUD_ROLE_MISMATCH")
        a = clients["A"]
        code, _ = base.ops.run(a, "sudo -S -p '' timeout 15s bash -c " + shlex.quote("set -eu; test ! -e " + SECRET_DIR + "; test -z \"$(ss -H -ltn 'sport = :9443')\"; test -z \"$(docker ps -aq --filter label=com.docker.compose.project=hp-capstone-a-gateway)\"; test $(docker network inspect hp-capstone-hospital-a_pacs_private --format '{{.Internal}}') = true; test $(docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.State.Health.Status}}') = healthy; test $(docker inspect hp-capstone-hospital-a-orthanc-mtls-1 --format '{{.State.Health.Status}}') = healthy"), credential=credential, seconds=20)
        if code:
            raise RuntimeError("A_EXISTING_PACS_OR_GATEWAY_STATE_PRESERVED")
        phase = "IMAGE_EXPORT_AND_TRANSFER"
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), base.APP], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        base.emit({"phase": phase, "status": "RUNNING", "bytes": archive.stat().st_size})
        started = time.monotonic()
        def deadline(transferred, total):
            if time.monotonic() - started > 300:
                raise RuntimeError("IMAGE_TRANSFER_DEADLINE")
        with a.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o700)
            sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
            for source, target in [("scripts/capstone-a-gateway-prepare.sh", "prepare.sh"), ("scripts/capstone-a-gateway-probe.js", "probe.js"), ("infra/workstation/hospital-a-gateway.compose.yml", "gateway.compose.yml")]:
                with sftp.open(stage + "/" + target, "w") as stream:
                    stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n"))
                sftp.chmod(stage + "/" + target, 0o600)
        code, output = base.ops.run(a, "timeout 20s sha256sum " + shlex.quote(stage + "/reviewed-app.tar"), seconds=25)
        if code or output.split()[0] != digest:
            raise RuntimeError("IMAGE_ARCHIVE_MISMATCH")
        code, _ = base.ops.run(a, "sudo -S -p '' timeout 180s docker load -i " + shlex.quote(stage + "/reviewed-app.tar"), credential=credential, seconds=185)
        if code:
            raise RuntimeError("DOCKER_IMAGE_LOAD_FAILED")
        code, loaded = base.ops.run(a, "sudo -S -p '' timeout 10s docker image inspect " + shlex.quote(base.APP) + " --format '{{.Id}}'", credential=credential, seconds=15)
        if code or loaded.strip() != base.APP_ID:
            raise RuntimeError("LOADED_IMAGE_ID_MISMATCH")
        phase = "A_LOCAL_TLS_KEY_AND_SCOPED_CREDENTIALS"
        code, output = base.ops.run(a, "sudo -S -p '' timeout 25s bash " + shlex.quote(stage + "/prepare.sh") + " " + shlex.quote(stage), credential=credential, seconds=30)
        if code or "GATEWAY_PREPARE=PASS" not in output:
            raise RuntimeError("ROOT_PREPARATION_FAILED")
        with a.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.get(stage + "/gateway-server.csr", str(directory / "gateway-server.csr"))
        openssl = "C:/Program Files/Git/usr/bin/openssl.exe"
        certificate = directory / "gateway-server.crt"
        base.local([openssl, "verify", "-purpose", "sslclient", "-CAfile", str(ROOT / "tmp/certs/mtls/ca.crt"), str(ROOT / "tmp/certs/mtls/gateway-client.crt")])
        base.local([openssl, "x509", "-req", "-days", "31", "-in", str(directory / "gateway-server.csr"), "-CA", str(ROOT / "tmp/certs/mtls/ca.crt"), "-CAkey", str(ROOT / "tmp/certs/mtls/ca.key"), "-set_serial", "0x" + os.urandom(16).hex(), "-extfile", str(ROOT / "config/capstone-a-gateway-dev-server.ext"), "-out", str(certificate)])
        base.local([openssl, "verify", "-purpose", "sslserver", "-verify_ip", "10.90.88.2", "-CAfile", str(ROOT / "tmp/certs/mtls/ca.crt"), str(certificate)])
        # Privileged SFTP channels remain encrypted and independently pinned.
        # Only the dedicated Gateway credential is shared; no DB/JWT/token signer
        # or CA private key is read/transferred. It is never printed or saved locally.
        with root_sftp(cloud) as source, root_sftp(a, credential) as target:
            with source.open("/opt/highpass/capstone-control-secrets/data-plane-secret", "rb") as stream:
                service_token = stream.read(257)
            if not 32 <= len(service_token) <= 256 or b"\n" in service_token:
                raise RuntimeError("INVALID_SCOPED_CREDENTIAL")
            with target.open(SECRET_DIR + "/data-plane-secret", "wx") as stream:
                stream.write(service_token)
            service_token = None
            target.chmod(SECRET_DIR + "/data-plane-secret", 0o640)
            target.chown(SECRET_DIR + "/data-plane-secret", 0, 65532)
            for source, name in [(ROOT / "tmp/certs/mtls/ca.crt", "ca.crt"), (ROOT / "tmp/certs/mtls/gateway-client.crt", "gateway-client.crt"), (ROOT / "tmp/certs/mtls/gateway-client.key", "gateway-client.key"), (certificate, "gateway-server.crt")]:
                target.put(str(source), SECRET_DIR + "/" + name)
                target.chmod(SECRET_DIR + "/" + name, 0o640)
                target.chown(SECRET_DIR + "/" + name, 0, 65532)
        phase = "GATEWAY_PRIVATE_DEPLOYMENT"
        environment = "HIPASS_APP_IMAGE=" + shlex.quote(base.APP) + " HIPASS_A_GATEWAY_SECRET_DIR=" + SECRET_DIR + " "
        compose = "docker compose -p hp-capstone-a-gateway -f " + shlex.quote(stage + "/gateway.compose.yml")
        code, _ = base.ops.run(a, "sudo -S -p '' env " + environment + "timeout 180s " + compose + " up -d --wait --wait-timeout 120 --pull never", credential=credential, seconds=185)
        if code:
            raise RuntimeError("GATEWAY_LISTENER_READINESS_FAILED")
        command = "timeout 30s docker exec -i hp-capstone-a-gateway-gateway-1 /nodejs/bin/node --input-type=module < " + shlex.quote(stage + "/probe.js")
        code, output = base.ops.run(a, "sudo -S -p '' bash -c " + shlex.quote(command), credential=credential, seconds=35)
        probe = json.loads(output)
        checks.extend(probe["checks"])
        phase = "ACTUAL_B_TO_A_GATEWAY_TLS"
        b = clients["B"]
        b_stage = "/home/server/.highpass-a-gateway-check-" + stamp
        with b.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(b_stage, mode=0o700)
            sftp.put(str(ROOT / "tmp/certs/mtls/ca.crt"), b_stage + "/ca.crt")
        command = "timeout 8s curl --silent --show-error --connect-timeout 3 --max-time 6 --cacert " + shlex.quote(b_stage + "/ca.crt") + " -o /dev/null -w '%{http_code} %{ssl_verify_result} %{remote_ip}' https://10.90.88.2:9443/dicomweb/studies"
        code, output = base.ops.run(b, command, seconds=10)
        checks.append({"test": "B_REAL_GATEWAY_TLS_UNAUTHENTICATED_DENY", "status": "PASS" if code == 0 and output.strip() == "401 0 10.90.88.2" else "NOT VERIFIED", "exitCode": code})
        code, _ = base.ops.run(b, "timeout 5s bash -c " + shlex.quote("rm -f -- " + shlex.quote(b_stage + "/ca.crt") + "; rmdir -- " + shlex.quote(b_stage)), seconds=10)
        checks.append({"test": "B_PUBLIC_CA_STAGE_CLEANUP", "status": "PASS" if code == 0 else "FAIL"})
        checks.append({"test": "EXACT_GATEWAY_IMAGE", "status": "PASS", "image": base.APP_ID, "archiveSha256": digest})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients.values():
            client.close()
        trust.close()
        credential = None
    result = {"scope": "ACTUAL_A_GATEWAY_PRIVATE_TRANSPORT_AND_B_UNAUTHENTICATED_DENIAL", "review": "DRAFT / UNASSIGNED", "stage": stage, "checks": checks, "status": "PASS" if checks and all(item["status"] == "PASS" for item in checks) else "NOT VERIFIED", "authorizedViewerE2E": "NOT VERIFIED", "keyVaultCrypto": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
