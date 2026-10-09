"""A-only retained-image rollback/re-promotion; never roll back cloud audit fix."""
import argparse
import getpass
import importlib.util
import json
import os
import pathlib
import re
import shlex
import subprocess
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("encryption_rollout", ROOT / "scripts/capstone-encryption-rollout.py")
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
base = previous.base
CURRENT = "highpass-platform-mvp:capstone-interactive-capacity-20261009"
CURRENT_ID = "sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1"
OLD = "highpass-platform-mvp:capstone-timeouts-20261009"
OLD_ID = "sha256:9d2a12f600d8ec7f114620a9f58ccdf18e69a6ca1ef513e8321168a561849b40"
CLOUD_ID = "sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807"
GATEWAY = "hp-capstone-a-gateway-gateway-1"


def validated_context(labels):
    stage = labels.get("com.docker.compose.project.working_dir", "")
    files = labels.get("com.docker.compose.project.config_files", "")
    if not re.fullmatch(r"/home/server/\.highpass-app-[0-9T.+-]{20,60}", stage):
        raise RuntimeError("CONTEXT_PATH_INVALID")
    expected = [stage + "/gateway.yml", stage + "/encryption.yml"]
    if files.split(",") != expected:
        raise RuntimeError("CONTEXT_FILES_INVALID")
    return stage, expected


def compose_command(stage, files, image):
    environment = {"HIPASS_APP_IMAGE": image,
                   "HIPASS_KEY_RELEASE_VAULT_KEY_ID": previous.KEY_ID,
                   "HIPASS_A_GATEWAY_SECRET_DIR": "/opt/highpass/capstone-a-gateway-secrets"}
    return "env " + " ".join(key + "=" + shlex.quote(value) for key, value in environment.items()) + " docker compose --project-directory " + shlex.quote(stage) + " -p hp-capstone-a-gateway" + "".join(" -f " + shlex.quote(path) for path in files)


def browser_gate():
    process = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                              "scripts/run-browser-authorization-trace.ps1", "-Port", "9231",
                              "-BrowserUrl", "https://192.168.111.149:9443/hipass/", "-Capstone", "-NegativeBoundary"],
                             cwd=ROOT, capture_output=True, timeout=235)
    # Never export raw browser stderr, arbitrary exceptions or credential-bearing text.
    raw = process.stdout.decode("utf8", errors="replace")
    start = raw.find('{"generatedAt"')
    if start < 0:
        raise RuntimeError("BROWSER_OUTPUT_NOT_STRUCTURED")
    result, _ = json.JSONDecoder().raw_decode(raw[start:])
    if process.returncode or result.get("result") != "PASS":
        raise RuntimeError("BROWSER_GATE_NOT_PASS")
    return {"status": "PASS", "evidence": result.get("evidence"),
            "trustedHttps": result.get("trustedHttps"), "viewerRender": result.get("viewerRender"),
            "revocationUi": result.get("revocationUi"), "singleTransferLinkage": result.get("singleTransferLinkage"), "scope": "SYNTHETIC_BUILT_IN_VIEWER_NOT_OHIF"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-image", default=CURRENT)
    parser.add_argument("--current-image-id", default=CURRENT_ID)
    args = parser.parse_args()
    if not re.fullmatch(r"highpass-platform-mvp:capstone-[a-z0-9-]{1,70}", args.current_image) or not re.fullmatch(r"sha256:[a-f0-9]{64}", args.current_image_id):
        raise SystemExit("PUBLIC_IMAGE_ARGUMENT_INVALID")
    directory = ROOT / "artifacts/workstation" / ("a-rollback-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    clients = {}
    trust = None
    restore = None
    checks = []
    recovery = "NOT_REQUIRED"
    phase = "PINNED_FLEET_BASELINE"
    began = time.monotonic()
    try:
        trust = base.ops.LocalVmTrust()
        for role in ["A", "B"]:
            address, mac, _ = base.ops.ROLES[role]
            key = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            clients[role] = client
            client.get_host_keys().add(address, key.get_name(), key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False,
                           timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            code, _ = base.ops.run(client, "timeout 8s bash -c " + shlex.quote("set -eu; test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = " + mac + "; systemctl is-active --quiet docker; systemctl is-active --quiet wg-quick@hp-capstone"), seconds=12)
            if code:
                raise RuntimeError("ROLE_OR_OVERLAY_NOT_VERIFIED")
        cloud = paramiko.SSHClient()
        clients["C"] = cloud
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"),
                      look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)

        def run(role, command, seconds=15):
            prefix = "sudo -n " if role == "C" else "sudo -S -p '' "
            code, output = base.ops.run(clients[role], prefix + "timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command),
                                        credential=None if role == "C" else credential, seconds=seconds + 5)
            if code:
                raise RuntimeError("BOUNDED_REMOTE_OPERATION_FAILED_" + role)
            return output.strip()

        def healthy(role, name, expected):
            state = run(role, "docker inspect " + name + " --format '{{.Image}} {{.State.Running}} {{.State.Health.Status}}'")
            return state == expected + " true healthy"

        if not all([healthy("A", GATEWAY, args.current_image_id), healthy("B", "hp-capstone-b-portal-portal-1", args.current_image_id), healthy("C", "hp-capstone-control-control-1", CLOUD_ID)]):
            raise RuntimeError("CURRENT_RUNTIME_NOT_VERIFIED")
        unchanged = {"B": run("B", "docker inspect hp-capstone-b-portal-portal-1 --format '{{.Id}}'"),
                     "PG": run("C", "docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'"),
                     "C": run("C", "docker inspect hp-capstone-control-control-1 --format '{{.Id}}'"),
                     "PACS": run("A", "docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}} {{json .Mounts}}'")}
        labels = json.loads(run("A", "docker inspect " + GATEWAY + " --format '{{json .Config.Labels}}'"))
        stage, files = validated_context(labels)
        for image, digest in [(OLD, OLD_ID), (args.current_image, args.current_image_id)]:
            if run("A", "docker image inspect " + image + " --format '{{.Id}}'") != digest:
                raise RuntimeError("RETAINED_IMAGE_CHANGED")
        current_command = compose_command(stage, files, args.current_image)
        old_command = compose_command(stage, files, OLD)
        run("A", current_command + " config --quiet")
        run("A", old_command + " config --quiet")
        checks.append({"test": "PINNED_HEALTHY_FLEET_AND_RETAINED_IMAGES", "status": "PASS"})

        def promote(command, digest):
            run("A", command + " up -d --no-deps --force-recreate --pull never gateway", 90)
            end = time.monotonic() + 75
            while not healthy("A", GATEWAY, digest):
                if time.monotonic() >= end:
                    raise RuntimeError("READINESS_DEADLINE")
                time.sleep(2)
            for flag in ["CAPSTONE_IMAGE_ENCRYPTION_REQUIRED=1", "CAPSTONE_RUNTIME_DIAGNOSTICS=1"]:
                if run("A", "docker inspect " + GATEWAY + " --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Fx " + shlex.quote(flag)) != flag:
                    raise RuntimeError("REQUIRED_MODE_LOST")

        # Register compensation before mutation so partial recreation is restored too.
        restore = lambda: promote(current_command, args.current_image_id)
        phase = "A_ROLLBACK"
        base.emit({"phase": phase, "status": "RUNNING"})
        promote(old_command, OLD_ID)
        checks.append({"test": "A_PREVIOUS_IMAGE_HEALTH_AND_REQUIRED_ENCRYPTION", "status": "PASS"})
        phase = "ROLLBACK_ACTUAL_BROWSER"
        checks.append({"test": phase, **browser_gate()})
        phase = "A_REPROMOTION"
        restore()
        restore = None
        recovery = "LATEST_IMAGE_RESTORED"
        checks.append({"test": "A_LATEST_IMAGE_HEALTH_AND_REQUIRED_ENCRYPTION", "status": "PASS"})
        phase = "RESTORED_ACTUAL_BROWSER"
        checks.append({"test": phase, **browser_gate()})
        after = {"B": run("B", "docker inspect hp-capstone-b-portal-portal-1 --format '{{.Id}}'"),
                 "PG": run("C", "docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'"),
                 "C": run("C", "docker inspect hp-capstone-control-control-1 --format '{{.Id}}'"),
                 "PACS": run("A", "docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}} {{json .Mounts}}'")}
        if after != unchanged:
            raise RuntimeError("UNRELATED_RUNTIME_OR_PACS_MOUNTS_CHANGED")
        checks.append({"test": "B_CLOUD_PG_PACS_CONTAINER_AND_MOUNTS_UNCHANGED", "status": "PASS"})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        if restore:
            try:
                restore()
                recovery = "LATEST_IMAGE_RESTORED_AFTER_FAILED_GATE"
            except Exception:
                recovery = "RESTORATION_NOT_VERIFIED_REQUIRES_DIAGNOSIS"
        for client in clients.values():
            client.close()
        if trust:
            trust.close()
        credential = None
    result = {"scope": "A_GATEWAY_ONLY_ROLLBACK_AND_REPROMOTION_NOT_VM_COLDSTART_OR_B_CLOUD_ROLLBACK",
              "review": "DRAFT / UNASSIGNED", "currentImageId": args.current_image_id, "rollbackImageId": OLD_ID,
              "checks": checks, "recovery": recovery, "elapsedSeconds": round(time.monotonic() - began, 3),
              "status": "PASS" if len(checks) == 6 and all(row["status"] == "PASS" for row in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
