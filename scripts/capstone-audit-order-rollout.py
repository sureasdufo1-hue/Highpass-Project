"""Cloud-only audit-order fix. Preserve persisted audit hashes and PostgreSQL."""
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
APP = "highpass-platform-mvp:capstone-encryption-audit-20261009"
APP_ID = "sha256:5e728e53be1fc44685279ec8aec9c119ec0fe24a63c635771945df30883611da"
OLD_ID = "sha256:cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9"
KEY_ID = "https://kv-hp-demo-4869edd9.vault.azure.net/keys/capstone-b-kek-20261009/9c03b2560a3240418d33d92a165b6806"


def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("audit-order-rollout-" + stamp)
    directory.mkdir(parents=True)
    stage = "/home/highpassadmin/.highpass-audit-order-" + stamp
    checks = []
    client = paramiko.SSHClient()
    phase = "REVIEWED_CANDIDATE"
    try:
        scan = json.loads((ROOT / "artifacts/security/container-scan/capstone-encryption-audit-20261009.json").read_text(encoding="utf8"))
        if base.local(["docker", "image", "inspect", APP, "--format", "{{.Id}}"] ) != APP_ID or scan.get("Metadata", {}).get("ImageID") != APP_ID or any(v.get("Severity") in ["HIGH", "CRITICAL"] for result in scan.get("Results", []) for v in result.get("Vulnerabilities", [])):
            raise RuntimeError("EXACT_NEW_IMAGE_SCAN_REQUIRED")
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts")); client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command, seconds=20):
            code, output = base.ops.run(client, "sudo -n timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), seconds=seconds + 5)
            if code:
                raise RuntimeError("REMOTE_STAGE_FAILED_" + phase + "_" + str(code))
            return output.strip()
        phase = "BASELINE_AND_HASH_FINGERPRINT"
        run("test $(hostname) = highpass-cloud; test $(docker inspect hp-capstone-control-control-1 --format '{{.Image}}') = " + OLD_ID)
        pg_id = run("docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'")
        sql = "SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(audit_id || ':' || record_hash || ':' || coalesce(previous_hash,'HEAD'), ',' ORDER BY audit_id),''),'UTF8')),'hex') FROM audit_logs"
        fingerprint_command = "docker exec hp-capstone-control-postgres-1 psql -U hipass_bootstrap -d hipass -At -c " + shlex.quote(sql)
        before = run(fingerprint_command)
        checks.append({"test": "PINNED_CLOUD_AND_PERSISTED_AUDIT_BASELINE", "status": "PASS", "fingerprint": before})
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), APP], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        phase = "EXACT_IMAGE_TRANSFER"
        base.emit({"phase": phase, "status": "RUNNING"})
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15); sftp.mkdir(stage, mode=0o700)
            started = time.monotonic()
            def deadline(done, total):
                if time.monotonic() - started > 300:
                    raise RuntimeError("TRANSFER_DEADLINE")
            sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
            for source, name in [("infra/azure/capstone-control.compose.yml", "control.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.yml"), ("infra/azure/capstone-mock-idp.compose.yml", "mock.yml"), ("infra/azure/capstone-control-key-release.compose.yml", "key-release.yml")]:
                with sftp.open(stage + "/" + name, "wb") as stream:
                    stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n").encode("utf8"))
                sftp.chmod(stage + "/" + name, 0o600)
        if run("sha256sum " + stage + "/reviewed-app.tar").split()[0] != digest:
            raise RuntimeError("TRANSFER_DIGEST_MISMATCH")
        run("docker load -i " + stage + "/reviewed-app.tar", seconds=180)
        if run("docker image inspect " + APP + " --format '{{.Id}}'") != APP_ID:
            raise RuntimeError("LOADED_IMAGE_CHANGED")
        checks.append({"test": "EXACT_REVIEWED_NEW_CLOUD_IMAGE", "status": "PASS", "imageId": APP_ID})
        compose = "env HIPASS_APP_IMAGE=" + APP + " HIPASS_POSTGRES_IMAGE=" + base.PG + " HIPASS_CLOUD_SECRET_DIR=/opt/highpass/capstone-control-secrets HIPASS_CAPSTONE_PUBLIC_ORIGIN=https://192.168.111.149:9443 HIPASS_KEY_RELEASE_VAULT_KEY_ID=" + KEY_ID + " docker compose --project-directory " + stage + " -p hp-capstone-control"
        compose += "".join(" -f " + stage + "/" + name for name in ["control.yml", "ingress.yml", "mock.yml", "key-release.yml"])
        run(compose + " config --quiet")
        phase = "CLOUD_CONTROL_INGRESS_PROMOTION"
        run(compose + " up -d --no-deps --force-recreate --pull never control ingress", seconds=90)
        end = time.monotonic() + 90
        while True:
            ready = run("docker inspect hp-capstone-control-control-1 --format '{{.State.Health.Status}}'")
            if ready == "healthy":
                break
            if time.monotonic() >= end:
                raise RuntimeError("READINESS_DEADLINE_OBSERVE_SAME_CONTAINER")
            time.sleep(2)
        for name in ["hp-capstone-control-control-1", "hp-capstone-control-ingress-1"]:
            if run("docker inspect " + name + " --format '{{.Image}} {{.State.Running}}'") != APP_ID + " true":
                raise RuntimeError("CLOUD_PROMOTION_STATE_MISMATCH")
        checks.append({"test": "CLOUD_NEW_IMAGE_READINESS", "status": "PASS"})
        after = run(fingerprint_command)
        if before != after or run("docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'") != pg_id:
            raise RuntimeError("PERSISTED_AUDIT_OR_DATABASE_CHANGED")
        checks.append({"test": "ALL_PERSISTED_HASHES_AND_PG_CONTAINER_UNCHANGED", "status": "PASS", "fingerprint": after})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    result = {"scope": "CLOUD_AUDIT_ORDER_FIX_ONLY", "review": "DRAFT / UNASSIGNED", "checks": checks, "stage": stage,
              "status": "PASS" if len(checks) == 4 and all(row["status"] == "PASS" for row in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
