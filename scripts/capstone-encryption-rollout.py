"""Promote reviewed encrypted transport; preserve existing volumes and images."""
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
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base = gateway.base
APP = "highpass-platform-mvp:capstone-encryption-20261009"
APP_ID = "sha256:cc0c78cb72f6eebc7ff6a07c7175ea8e5a5636030039747de9a81fad7fbf33c9"
OLD = {"A": base.APP_ID, "B": "sha256:69cd63bc4966c83e46a609e90e44385a63c68b7941b713690135b445833fb693", "C": "sha256:69cd63bc4966c83e46a609e90e44385a63c68b7941b713690135b445833fb693"}
KEY_ID = "https://kv-hp-demo-4869edd9.vault.azure.net/keys/capstone-b-kek-20261009/9c03b2560a3240418d33d92a165b6806"
CONTAINERS = {"A": ["hp-capstone-a-gateway-gateway-1"], "B": ["hp-capstone-b-portal-portal-1"], "C": ["hp-capstone-control-control-1", "hp-capstone-control-ingress-1"]}
FILES = {
 "C": [("infra/azure/capstone-control.compose.yml", "control.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.yml"), ("infra/azure/capstone-mock-idp.compose.yml", "mock.yml"), ("infra/azure/capstone-control-key-release.compose.yml", "key-release.yml")],
 "B": [("infra/workstation/hospital-b-portal.compose.yml", "portal.yml"), ("infra/workstation/hospital-b-encryption.compose.yml", "encryption.yml")],
 "A": [("infra/workstation/hospital-a-gateway.compose.yml", "gateway.yml"), ("infra/workstation/hospital-a-encryption.compose.yml", "encryption.yml")],
}


def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("encryption-rollout-" + stamp)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = None
    clients, stages, baselines, commands = {}, {}, {}, {}
    checks = []
    phase = "LOCAL_REVIEWED_IMAGE"
    old_pg_container = None
    try:
        if base.local(["docker", "image", "inspect", APP, "--format", "{{.Id}}"] ) != APP_ID:
            raise RuntimeError("CANDIDATE_IMAGE_CHANGED")
        scan = json.loads((ROOT / "artifacts/security/container-scan/capstone-encryption-20261009.json").read_text(encoding="utf8"))
        if scan.get("Metadata", {}).get("ImageID") != APP_ID or any(v.get("Severity") in ["HIGH", "CRITICAL"] for result in scan.get("Results", []) for v in result.get("Vulnerabilities", [])):
            raise RuntimeError("EXACT_FRESH_SECURITY_SCAN_REQUIRED")
        checks.append({"test": "EXACT_REVIEWED_IMAGE_SCAN", "status": "PASS", "imageId": APP_ID})
        trust = base.ops.LocalVmTrust()
        for role in ["A", "B"]:
            address, mac, _ = base.ops.ROLES[role]
            public = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            clients[role] = client
            client.get_host_keys().add(address, public.get_name(), public)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            code, _ = base.ops.run(client, "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac + " && systemctl is-active --quiet wg-quick@hp-capstone", seconds=10)
            if code:
                raise RuntimeError("VM_ROLE_MISMATCH_" + role)
        cloud = paramiko.SSHClient()
        clients["C"] = cloud
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)

        def run(role, command, seconds=20):
            prefix = "sudo -n " if role == "C" else "sudo -S -p '' "
            code, output = base.ops.run(clients[role], prefix + "timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), credential=None if role == "C" else credential, seconds=seconds + 5)
            if code:
                raise RuntimeError("REMOTE_OPERATION_FAILED_" + phase + "_" + role + "_" + str(code))
            return output.strip()

        phase = "AUTHORITATIVE_RUNTIME_BASELINE"
        run("C", "test $(hostname) = highpass-cloud; test $(id -un) = root; systemctl is-active --quiet wg-quick@hp-capstone")
        for role in ["C", "B", "A"]:
            if int(run(role, "df -Pk / | tail -1").split()[3]) < 4 * 1024 * 1024:
                raise RuntimeError("DISK_CAPACITY_UNAVAILABLE_" + role)
            rows = []
            for name in CONTAINERS[role]:
                raw = run(role, "docker inspect " + name + " --format '{{json .Image}} {{json .State.Running}} {{json .Config.Labels}}'")
                image, running, labels = raw.split(" ", 2)
                image = json.loads(image)
                labels = json.loads(labels)
                if image not in [OLD[role], APP_ID] or running != "true":
                    raise RuntimeError("CURRENT_RUNTIME_REQUIRES_DIAGNOSIS_" + role)
                rows.append({"container": name, "imageId": image, "workingDirectory": labels.get("com.docker.compose.project.working_dir"), "configFiles": labels.get("com.docker.compose.project.config_files")})
            baselines[role] = rows
            if role in ["A", "B"]:
                run(role, "test -d /opt/highpass/capstone-key-identity")
            secret_dir = "/opt/highpass/capstone-control-secrets" if role == "C" else "/opt/highpass/capstone-b-portal-secrets"
            if role != "A":
                run(role, "test $(stat -c '%u:%g:%a' " + secret_dir + "/b-key-release-secret) = 0:65532:640")
        old_pg_container = run("C", "docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'")
        old_pacs = run("A", "docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}}'")
        checks.append({"test": "PINNED_HOSTS_AND_CURRENT_RUNTIME_BASELINE", "status": "PASS"})
        phase = "EXACT_IMAGE_EXPORT"
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), APP], seconds=180)
        with archive.open("rb") as stream:
            archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        for role in ["C", "B", "A"]:
            phase = "IMAGE_TRANSFER_" + role
            base.emit({"phase": phase, "status": "RUNNING", "archiveBytes": archive.stat().st_size})
            home = "/home/highpassadmin" if role == "C" else "/home/server"
            stage = home + "/.highpass-encryption-" + stamp
            stages[role] = stage
            with clients[role].open_sftp() as sftp:
                sftp.get_channel().settimeout(15)
                sftp.mkdir(stage, mode=0o700)
                began = time.monotonic()
                def deadline(transferred, total):
                    if time.monotonic() - began > 300:
                        raise RuntimeError("IMAGE_TRANSFER_DEADLINE")
                sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
                for source, name in FILES[role]:
                    with sftp.open(stage + "/" + name, "wb") as stream:
                        stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n", "\n").encode("utf8"))
                    sftp.chmod(stage + "/" + name, 0o600)
            if run(role, "sha256sum " + stage + "/reviewed-app.tar").split()[0] != archive_hash:
                raise RuntimeError("TRANSFER_ARCHIVE_HASH_MISMATCH_" + role)
            run(role, "docker load -i " + stage + "/reviewed-app.tar", seconds=180)
            if run(role, "docker image inspect " + APP + " --format '{{.Id}}'") != APP_ID:
                raise RuntimeError("LOADED_IMAGE_CHANGED_" + role)
            project = {"C": "hp-capstone-control", "B": "hp-capstone-b-portal", "A": "hp-capstone-a-gateway"}[role]
            env = {"HIPASS_APP_IMAGE": APP, "HIPASS_KEY_RELEASE_VAULT_KEY_ID": KEY_ID,
                   "HIPASS_A_GATEWAY_SECRET_DIR": "/opt/highpass/capstone-a-gateway-secrets",
                   "HIPASS_B_PORTAL_SECRET_DIR": "/opt/highpass/capstone-b-portal-secrets",
                   "HIPASS_CLOUD_SECRET_DIR": "/opt/highpass/capstone-control-secrets",
                   "HIPASS_CAPSTONE_PUBLIC_ORIGIN": "https://192.168.111.149:9443", "HIPASS_POSTGRES_IMAGE": base.PG}
            compose = "env " + " ".join(key + "=" + shlex.quote(value) for key, value in env.items()) + " docker compose --project-directory " + stage + " -p " + project
            compose += "".join(" -f " + stage + "/" + name for _, name in FILES[role])
            commands[role] = compose
            run(role, compose + " config --quiet")
            checks.append({"test": role + "_EXACT_IMAGE_TRANSFER_AND_COMPOSE_CONFIG", "status": "PASS", "archiveSha256": archive_hash})

        phase = "CLOUD_ADDITIVE_MIGRATION"
        run("C", commands["C"] + " up -d --no-deps --pull never key-release-migrate", seconds=60)
        migration_deadline = time.monotonic() + 60
        while True:
            state = json.loads(run("C", "docker inspect hp-capstone-control-key-release-migrate-1 --format '{{json .State}}'"))
            if state.get("Status") == "exited":
                if state.get("ExitCode") != 0:
                    raise RuntimeError("ADDITIVE_MIGRATION_FAILED")
                break
            if time.monotonic() >= migration_deadline:
                raise RuntimeError("ADDITIVE_MIGRATION_STILL_RUNNING_OBSERVE_SAME_CONTAINER")
            time.sleep(1)
        checks.append({"test": "CLOUD_APP_ROLE_ADDITIVE_MIGRATION", "status": "PASS"})
        for role in ["C", "B", "A"]:
            phase = "PROMOTION_" + role
            base.emit({"phase": phase, "status": "RUNNING"})
            services = {"C": "control ingress", "B": "portal", "A": "gateway"}[role]
            run(role, commands[role] + " up -d --no-deps --force-recreate --pull never " + services, seconds=90)
            until = time.monotonic() + 90
            while True:
                ready = True
                for name in CONTAINERS[role]:
                    raw = run(role, "docker inspect " + name + " --format '{{json .Image}} {{json .State}}'")
                    image, state = raw.split(" ", 1)
                    state = json.loads(state)
                    ready &= json.loads(image) == APP_ID and state.get("Running") is True and state.get("Health", {}).get("Status", "healthy") == "healthy"
                if ready:
                    break
                if time.monotonic() >= until:
                    raise RuntimeError("PROMOTED_SERVICE_NOT_READY_" + role)
                time.sleep(2)
            variable = "HIPASS_CAPSTONE_KEY_RELEASE=1" if role == "C" else "CAPSTONE_IMAGE_ENCRYPTION_REQUIRED=1"
            name = CONTAINERS[role][0]
            marker = run(role, "docker inspect " + name + " --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Fx " + shlex.quote(variable))
            if marker != variable:
                raise RuntimeError("MANDATORY_CRYPTO_MODE_NOT_VERIFIED_" + role)
            checks.append({"test": role + "_PROMOTED_EXACT_IMAGE_READINESS_AND_REQUIRED_MODE", "status": "PASS"})
        phase = "PRESERVATION_AND_PRIVATE_TLS"
        if run("C", "docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'") != old_pg_container or run("A", "docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}}'") != old_pacs:
            raise RuntimeError("DATABASE_OR_PACS_CONTAINER_CHANGED")
        checks.append({"test": "EXISTING_PG_AND_PACS_CONTAINER_PRESERVED", "status": "PASS"})
        code = run("B", "curl --cacert /opt/highpass/capstone-b-portal-secrets/ca.crt --max-time 8 -s -o /dev/null -w '%{http_code}' https://192.168.111.149:9443/api/health", seconds=10)
        if code != "200":
            raise RuntimeError("B_CLOUD_STRICT_TLS_READINESS_NOT_VERIFIED")
        checks.append({"test": "B_PORTAL_CLOUD_STRICT_TLS_HEALTH", "status": "PASS"})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients.values():
            client.close()
        if trust:
            trust.close()
        credential = None
    result = {"scope": "DISTRIBUTED_ENCRYPTION_PROMOTION_NOT_VIEWER_E2E", "review": "DRAFT / UNASSIGNED", "imageId": APP_ID,
              "checks": checks, "stages": stages, "baselines": baselines,
              "status": "PASS" if len(checks) == 11 and all(row["status"] == "PASS" for row in checks) else "NOT VERIFIED",
              "encryptedViewer": "NOT VERIFIED", "rollbackExecution": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
