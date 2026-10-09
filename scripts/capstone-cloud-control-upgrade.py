"""Preserve cloud DB, external secrets, TLS key and prior image during exact upgrade."""
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
NEW_ID = "sha256:0c0379a376fcba9db0c8bdb65876f3854f000afddb1f620bde21a5534b25b399"
BASELINE_ID = "sha256:78c4e538e04d6044cf945a07757e2a0f3d28c502447af8a11273db585bf82c59"

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/azure" / ("cloud-control-upgrade-" + stamp)
    directory.mkdir(parents=True)
    stage = "/home/highpassadmin/.highpass-control-upgrade-" + stamp
    client = paramiko.SSHClient()
    checks = []
    phase = "FRESH_SCAN_AND_IMAGE"
    try:
        scan = json.loads((ROOT / "artifacts/security/container-scan/capstone-gateway-ingress-20261009.json").read_text())
        if scan.get("Metadata", {}).get("ImageID") != NEW_ID or any(v.get("Severity") in ["HIGH", "CRITICAL"] for r in scan.get("Results", []) for v in r.get("Vulnerabilities", [])) or base.local(["docker", "image", "inspect", base.APP, "--format", "{{.Id}}"]) != NEW_ID:
            raise RuntimeError("FRESH_SECURITY_GATE_NOT_SATISFIED")
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        phase = "PRESERVE_EXISTING_STATE"
        code, old = base.ops.run(client, "test $(hostname) = highpass-cloud && test $(id -un) = highpassadmin && sudo -n test -d /opt/highpass/capstone-control-secrets && sudo -n timeout 10s docker image inspect " + shlex.quote(base.APP) + " --format '{{.Id}}'", seconds=15)
        if code or old.strip() != BASELINE_ID:
            raise RuntimeError("UNEXPECTED_CLOUD_BASELINE_PRESERVED")
        volume_command = "sudo -n timeout 10s docker volume inspect hp-capstone-control_capstone-control-db --format '{{.CreatedAt}}'"
        code, volume_before = base.ops.run(client, volume_command, seconds=15)
        if code:
            raise RuntimeError("DATABASE_VOLUME_UNAVAILABLE")
        rollback = "highpass-platform-mvp:capstone-before-service-header-20261009"
        code, _ = base.ops.run(client, "sudo -n timeout 10s docker tag " + shlex.quote(BASELINE_ID) + " " + rollback, seconds=15)
        if code:
            raise RuntimeError("PREVIOUS_IMAGE_PRESERVATION_FAILED")
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), base.APP], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        phase = "BOUNDED_EXACT_IMAGE_TRANSFER"
        base.emit({"phase": phase, "status": "RUNNING", "bytes": archive.stat().st_size})
        started = time.monotonic()
        def deadline(transferred, total):
            if time.monotonic() - started > 600:
                raise RuntimeError("TRANSFER_DEADLINE")
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o700)
            sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
            sftp.put(str(ROOT / "tmp/certs/mtls/ca.crt"), stage + "/ca.crt")
            for source, name in [("infra/azure/capstone-control.compose.yml", "control.compose.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.compose.yml"), ("scripts/capstone-gateway-ingress-check.py", "gateway-check.py")]:
                with sftp.open(stage + "/" + name, "w") as stream:
                    stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n"))
                sftp.chmod(stage + "/" + name, 0o600)
        code, output = base.ops.run(client, "timeout 45s sha256sum " + shlex.quote(stage + "/reviewed-app.tar"), seconds=50)
        if code or output.split()[0] != digest:
            raise RuntimeError("ARCHIVE_HASH_MISMATCH")
        phase = "PRESERVING_COMPOSE_UPGRADE"
        code, _ = base.ops.run(client, "sudo -n timeout 180s docker load -i " + shlex.quote(stage + "/reviewed-app.tar"), seconds=185)
        if code:
            raise RuntimeError("IMAGE_LOAD_FAILED")
        code, image = base.ops.run(client, "sudo -n timeout 10s docker image inspect " + shlex.quote(base.APP) + " --format '{{.Id}}'", seconds=15)
        if code or image.strip() != NEW_ID:
            raise RuntimeError("LOADED_IMAGE_CHANGED")
        environment = "HIPASS_APP_IMAGE=" + shlex.quote(base.APP) + " HIPASS_POSTGRES_IMAGE=" + shlex.quote(base.PG) + " HIPASS_CLOUD_SECRET_DIR=/opt/highpass/capstone-control-secrets HIPASS_CAPSTONE_PUBLIC_ORIGIN=https://192.168.111.149:9443 "
        compose = "docker compose -p hp-capstone-control -f " + shlex.quote(stage + "/control.compose.yml") + " -f " + shlex.quote(stage + "/ingress.compose.yml")
        code, _ = base.ops.run(client, "sudo -n env " + environment + "timeout 240s " + compose + " up -d --wait --wait-timeout 180 --pull never", seconds=245)
        if code:
            raise RuntimeError("UPGRADE_READINESS_NOT_VERIFIED")
        code, volume_after = base.ops.run(client, volume_command, seconds=15)
        checks.append({"test": "DATABASE_VOLUME_PRESERVED", "status": "PASS" if code == 0 and volume_before == volume_after else "FAIL"})
        phase = "REAL_GATEWAY_PRINCIPAL_TLS_CHECK"
        code, output = base.ops.run(client, "sudo -n timeout 25s python3 " + shlex.quote(stage + "/gateway-check.py") + " " + shlex.quote(stage + "/ca.crt"), seconds=30)
        gate = json.loads(output)
        checks.extend(gate["checks"])
        checks.append({"test": "EXACT_RUNTIME_UPGRADE", "status": "PASS", "image": NEW_ID, "priorImageTag": rollback, "archiveSha256": digest})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    result = {"scope": "ACTUAL_AZURE_CONTROL_UPGRADE_AND_SERVICE_PRINCIPAL_ONLY", "review": "DRAFT / UNASSIGNED", "stage": stage, "checks": checks, "status": "PASS" if checks and all(item["status"] == "PASS" for item in checks) else "NOT VERIFIED", "viewerE2E": "NOT VERIFIED", "keyVaultCrypto": "NOT VERIFIED", "rollbackExecution": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
