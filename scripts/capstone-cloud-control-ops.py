"""Exact reviewed-image deployment, no secret/CA private-key upload or public API."""
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = "highpass-platform-mvp:capstone-20261008-dataplane"
PG = "highpass-postgres-capstone:16-20261009"
APP_ID = "sha256:0c0379a376fcba9db0c8bdb65876f3854f000afddb1f620bde21a5534b25b399"
PG_ID = "sha256:8d0e686f1620c154c0c35ba8c7173a90f8f1a55ff8062f75677be1f3a4196568"
spec = importlib.util.spec_from_file_location("workstation_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

def emit(value):
    print(json.dumps(value), flush=True)

def local(args, seconds=30):
    return subprocess.run(args, cwd=ROOT, timeout=seconds, capture_output=True, check=True).stdout.decode("utf8").strip()

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/azure" / ("cloud-control-" + stamp)
    directory.mkdir(parents=True)
    client = paramiko.SSHClient()
    results = []
    phase = "LOCAL_IMAGE_ATTESTATION"
    stage = "/home/highpassadmin/.highpass-control-" + stamp
    try:
        for image, image_id, scan_name in [(APP, APP_ID, "capstone-gateway-ingress-20261009.json"), (PG, PG_ID, "capstone-postgres-hardened-20261009.json")]:
            if local(["docker", "image", "inspect", image, "--format", "{{.Id}}"] ) != image_id:
                raise RuntimeError("LOCAL_IMAGE_CHANGED")
            scan = json.loads((ROOT / "artifacts/security/container-scan" / scan_name).read_text(encoding="utf8"))
            vulnerabilities = [v for result in scan.get("Results", []) for v in result.get("Vulnerabilities", [])]
            if scan.get("Metadata", {}).get("ImageID") != image_id or any(v.get("Severity") in ["HIGH", "CRITICAL"] for v in vulnerabilities):
                raise RuntimeError("LATEST_IMAGE_SECURITY_GATE_NOT_SATISFIED")
        phase = "CLOUD_IDENTITY_AND_EXISTING_STATE"
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, _ = ops.run(client, "test $(hostname) = highpass-cloud && test $(id -un) = highpassadmin && systemctl is-active --quiet wg-quick@hp-capstone && sudo -n test ! -e /opt/highpass/capstone-control-secrets && test -z \"$(sudo -n docker ps -aq --filter label=com.docker.compose.project=hp-capstone-control)\"", seconds=15)
        if code:
            raise RuntimeError("ROLE_OR_EXISTING_DEPLOYMENT_REQUIRES_DIAGNOSIS")
        code, disk = ops.run(client, "df -Pk / | tail -1", seconds=10)
        if code or int(disk.split()[3]) < 4 * 1024 * 1024:
            raise RuntimeError("CLOUD_DISK_CAPACITY_UNAVAILABLE")
        phase = "EXACT_IMAGE_EXPORT"
        emit({"phase": phase, "status": "RUNNING"})
        archive = directory / "reviewed-images.tar"
        local(["docker", "save", "-o", str(archive), APP, PG], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        phase = "BOUNDED_IMAGE_TRANSFER"
        emit({"phase": phase, "status": "RUNNING", "bytes": archive.stat().st_size})
        sftp = client.open_sftp()
        sftp.get_channel().settimeout(15)
        started = time.monotonic()
        def deadline(transferred, total):
            if time.monotonic() - started > 600:
                raise RuntimeError("IMAGE_TRANSFER_DEADLINE")
        try:
            sftp.mkdir(stage, mode=0o700)
            sftp.put(str(archive), stage + "/reviewed-images.tar", callback=deadline)
            for source, name in [("scripts/capstone-cloud-control-prepare.sh", "prepare.sh"), ("scripts/capstone-overlay-firewall.sh", "firewall.sh"), ("infra/azure/capstone-control.compose.yml", "control.compose.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.compose.yml")]:
                with sftp.open(stage + "/" + name, "w") as stream:
                    stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n"))
                sftp.chmod(stage + "/" + name, 0o600)
        finally:
            sftp.close()
        phase = "ARCHIVE_VERIFY_AND_LOAD"
        emit({"phase": phase, "status": "RUNNING"})
        code, output = ops.run(client, "timeout 60s sha256sum " + shlex.quote(stage + "/reviewed-images.tar"), seconds=65)
        if code or output.split()[0] != digest:
            raise RuntimeError("ARCHIVE_HASH_MISMATCH")
        code, _ = ops.run(client, "sudo -n timeout 180s docker load -i " + shlex.quote(stage + "/reviewed-images.tar"), seconds=185)
        if code:
            raise RuntimeError("DOCKER_LOAD_FAILED")
        for image, image_id in [(APP, APP_ID), (PG, PG_ID)]:
            code, output = ops.run(client, "sudo -n timeout 10s docker image inspect " + shlex.quote(image) + " --format '{{.Id}}'", seconds=15)
            if code or output.strip() != image_id:
                raise RuntimeError("LOADED_IMAGE_ID_MISMATCH")
        results.append({"test": "EXACT_REVIEWED_IMAGES", "status": "PASS", "appImage": APP_ID, "postgresImage": PG_ID, "archiveSha256": digest})
        phase = "ROLE_SEPARATED_CERTIFICATE"
        code, output = ops.run(client, "sudo -n timeout 25s bash " + shlex.quote(stage + "/prepare.sh") + " " + shlex.quote(stage), seconds=30)
        if code or "CLOUD_PREPARE=PASS" not in output:
            raise RuntimeError("ROOT_SECRET_PREPARATION_FAILED")
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.get(stage + "/cloud-server.csr", str(directory / "cloud-server.csr"))
        openssl = "C:/Program Files/Git/usr/bin/openssl.exe"
        certificate = directory / "cloud-server.crt"
        local([openssl, "x509", "-req", "-days", "31", "-in", str(directory / "cloud-server.csr"), "-CA", str(ROOT / "tmp/certs/mtls/ca.crt"), "-CAkey", str(ROOT / "tmp/certs/mtls/ca.key"), "-set_serial", "0x" + os.urandom(16).hex(), "-extfile", str(ROOT / "config/capstone-cloud-dev-server.ext"), "-out", str(certificate)])
        local([openssl, "verify", "-purpose", "sslserver", "-verify_ip", "10.90.88.1", "-CAfile", str(ROOT / "tmp/certs/mtls/ca.crt"), str(certificate)])
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.put(str(certificate), stage + "/cloud-server.crt")
            sftp.put(str(ROOT / "tmp/certs/mtls/ca.crt"), stage + "/ca.crt")
        code, _ = ops.run(client, "sudo -n timeout 10s install -o root -g 65532 -m 640 " + shlex.quote(stage + "/cloud-server.crt") + " /opt/highpass/capstone-control-secrets/cloud-server.crt", seconds=15)
        if code:
            raise RuntimeError("CERTIFICATE_INSTALL_FAILED")
        pair_check = "set -eu; cert=$(openssl x509 -in /opt/highpass/capstone-control-secrets/cloud-server.crt -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum); key=$(openssl pkey -in /opt/highpass/capstone-control-secrets/cloud-server.key -pubout -outform DER | sha256sum); test \"$cert\" = \"$key\""
        code, _ = ops.run(client, "sudo -n timeout 10s bash -c " + shlex.quote(pair_check), seconds=15)
        if code:
            raise RuntimeError("CERTIFICATE_PUBLIC_KEY_MISMATCH")
        cert_info = local([openssl, "x509", "-in", str(certificate), "-noout", "-dates", "-fingerprint", "-sha256"])
        results.append({"test": "DEVELOPMENT_SERVER_CERTIFICATE", "status": "PASS", "publicCertificate": cert_info, "privateKey": "GENERATED_ON_CLOUD_ONLY", "caPrivateKey": "NEVER_TRANSFERRED"})
        phase = "PRIVATE_COMPOSE_DEPLOYMENT"
        environment = "HIPASS_APP_IMAGE=" + shlex.quote(APP) + " HIPASS_POSTGRES_IMAGE=" + shlex.quote(PG) + " HIPASS_CLOUD_SECRET_DIR=/opt/highpass/capstone-control-secrets HIPASS_CAPSTONE_PUBLIC_ORIGIN=https://192.168.111.149:9443 "
        compose = "docker compose -p hp-capstone-control -f " + shlex.quote(stage + "/control.compose.yml") + " -f " + shlex.quote(stage + "/ingress.compose.yml")
        code, _ = ops.run(client, "sudo -n env " + environment + "timeout 240s " + compose + " up -d --wait --wait-timeout 180 --pull never", seconds=245)
        if code:
            raise RuntimeError("COMPOSE_STARTUP_NOT_VERIFIED")
        firewall_path = "/etc/highpass/capstone-overlay/firewall.sh"
        backup = stage + "/firewall.before-control.sh"
        command = "set -eu; test -f " + firewall_path + "; test ! -e " + shlex.quote(backup) + "; cp -p " + firewall_path + " " + shlex.quote(backup) + "; install -o root -g root -m 700 " + shlex.quote(stage + "/firewall.sh") + " " + firewall_path
        code, _ = ops.run(client, "sudo -n timeout 10s bash -c " + shlex.quote(command), seconds=15)
        if code:
            raise RuntimeError("PERSISTENT_OWNED_FIREWALL_INSTALL_FAILED")
        # Docker DNAT precedes FORWARD. Match the original overlay-only host socket,
        # exact peers, protocol and translated TLS port in the existing owned chain.
        for peer in ["10.90.88.2", "10.90.88.3"]:
            rule = "-i hp-capstone -s " + peer + "/32 -p tcp --dport 8443 -m conntrack --ctstate NEW --ctorigdst 10.90.88.1 --ctorigdstport 443 -j ACCEPT"
            command = "iptables -w 3 -C HP-CAP-WG-F " + rule + " || iptables -w 3 -I HP-CAP-WG-F 2 " + rule
            code, _ = ops.run(client, "sudo -n timeout 10s bash -c " + shlex.quote(command), seconds=15)
            if code:
                raise RuntimeError("NARROW_OVERLAY_FORWARD_RULE_FAILED")
        phase = "ACTUAL_CLOUD_TLS_READINESS"
        for route, expected in [("/api/health", "200"), ("/dicomweb/studies", "403"), ("/viewer", "403")]:
            command = "timeout 8s curl --silent --show-error --connect-timeout 3 --max-time 6 --cacert " + shlex.quote(stage + "/ca.crt") + " -o /dev/null -w '%{http_code} %{ssl_verify_result}' https://10.90.88.1" + route
            code, output = ops.run(client, command, seconds=10)
            results.append({"test": "CLOUD_TLS:" + route, "status": "PASS" if code == 0 and output.strip() == expected + " 0" else "NOT VERIFIED", "exitCode": code, "expectedHttpStatus": expected})
        results.append({"test": "A_B_CLIENT_TLS_AND_VIEWER", "status": "NOT VERIFIED", "reason": "NEXT_DISTRIBUTED_GATE"})
    except Exception as error:
        results.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    deployment_checks = [item for item in results if item["test"] != "A_B_CLIENT_TLS_AND_VIEWER"]
    result = {"scope": "ACTUAL_AZURE_PRIVATE_METADATA_CONTROL_ONLY", "review": "DRAFT / UNASSIGNED", "stage": stage, "checks": results, "status": "PASS" if deployment_checks and all(item["status"] == "PASS" for item in deployment_checks) else "NOT VERIFIED", "distributedMvp": "NOT VERIFIED", "keyVaultCrypto": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
