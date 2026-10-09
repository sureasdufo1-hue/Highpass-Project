"""B-only mobile promotion. Password comes from stdin; no A/cloud/DB writes."""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import shlex
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vm_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
NAME = "hp-capstone-b-portal-portal-1"
FILES = ["src/capstone-b-portal.js", "public/mobile/app.js", "public/mobile/index.html", "public/mobile/sw.js"]

def local(args, timeout=60):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("LOCAL_COMMAND_FAILED")
    return result.stdout.decode().strip()

def archived_file_bytes(blob):
    # Never extract archive paths to the host filesystem.
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:*") as archive:
        members = archive.getmembers()
        if len(members) != 1 or not members[0].isfile() or members[0].size > 2_000_000:
            raise RuntimeError("CANDIDATE_ARCHIVE_INVALID")
        return archive.extractfile(members[0]).read()

def candidate_hashes(image_id):
    container = local(["docker", "create", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", image_id], 30)
    if not re.fullmatch(r"[a-f0-9]{64}", container):
        raise RuntimeError("INSPECTION_CONTAINER_ID_INVALID")
    try:
        actual = {}
        for name in FILES:
            result = subprocess.run(["docker", "cp", container + ":/app/" + name, "-"], cwd=ROOT, capture_output=True, timeout=20)
            if result.returncode:
                raise RuntimeError("CANDIDATE_FILE_READ_FAILED")
            actual[name] = hashlib.sha256(archived_file_bytes(result.stdout)).hexdigest()
        return actual
    finally:
        # Only the exact container created here is removed; it is never started.
        local(["docker", "rm", container], 20)

def attest_candidate(image_id):
    expected = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in FILES}
    actual = candidate_hashes(image_id)
    if actual != expected:
        raise RuntimeError("CANDIDATE_SOURCE_MISMATCH")
    return expected

def presentation_files(manifest):
    assets = manifest.get("assets", [])
    names = [row.get("file") for row in assets]
    required = {"public/index.html", "public/app.js", "public/ui/workspace.css", "public/ui/tokens.css", "public/ui/clinician.js", "public/ui/patient.js", "public/mobile/index.html", "public/mobile/app.js", "public/mobile/sw.js", "public/mobile/manifest.json", "public/brand/mediq-source.png"}
    if (manifest.get("scope") != "PRESENTATION_STATIC_ASSETS_ONLY" or not names or
        any(not isinstance(name, str) or not re.fullmatch(r"public/[A-Za-z0-9_./-]+", name) or ".." in name or name.startswith(("public/assets/clinical/", "public/mockups/")) for name in names) or
        len(set(names)) != len(names) or not required.issubset(names)):
        raise RuntimeError("PRESENTATION_MANIFEST_INVALID")
    return ["src/capstone-b-portal.js"] + names

def validated_context(labels):
    stage = labels.get("com.docker.compose.project.working_dir", "")
    configs = labels.get("com.docker.compose.project.config_files", "").split(",")
    if labels.get("com.docker.compose.project") != "hp-capstone-b-portal" or not re.fullmatch(r"/home/server/\.highpass-app-[0-9T.+-]{20,60}", stage):
        raise RuntimeError("ORIGINAL_COMPOSE_PATH_INVALID")
    if configs != [stage + "/portal.yml", stage + "/encryption.yml"]:
        raise RuntimeError("ORIGINAL_COMPOSE_FILES_INVALID")
    return stage, configs

def runtime_differences(before, after):
    def environment(values):
        parsed = dict(value.split("=", 1) for value in values)
        if len(parsed) != len(values):
            raise RuntimeError("DUPLICATE_RUNTIME_ENVIRONMENT")
        return parsed
    # Order in Docker inspection arrays is not a runtime permission or value.
    differences = []
    if environment(before["Config"]["Env"]) != environment(after["Config"]["Env"]):
        differences.append("ENVIRONMENT_VALUES")
    if sorted(before["HostConfig"].get("Binds") or []) != sorted(after["HostConfig"].get("Binds") or []):
        differences.append("MOUNT_BINDINGS")
    for group, keys in [("Config", ["Cmd", "Entrypoint", "User", "WorkingDir"]), ("HostConfig", ["PortBindings", "ReadonlyRootfs", "Privileged", "CapAdd", "CapDrop", "SecurityOpt", "NetworkMode"])]:
        for key in keys:
            if before[group].get(key) != after[group].get(key):
                differences.append(group + "." + key)
    return differences

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--image")
    parser.add_argument("--image-id")
    parser.add_argument("--expected-current-id")
    parser.add_argument("--scan")
    parser.add_argument("--trusted-baseline", help="Previously verified B host pin, beneath artifacts/workstation")
    parser.add_argument("--presentation-ui", action="store_true", help="Attest the complete presentation static assets in addition to the B portal source")
    parser.add_argument("--rehearse-rollback", action="store_true", help="After candidate readiness, restore the baseline and then repromote the candidate")
    args = parser.parse_args()
    if args.rehearse_rollback and not args.apply:
        raise SystemExit("ROLLBACK_REHEARSAL_REQUIRES_APPLY")
    if args.presentation_ui:
        # Match the UI overlay's source inventory instead of checking only four
        # mobile files. A missing shared stylesheet must block promotion.
        manifest = json.loads(local(["node", "scripts/presentation-ui-manifest.js"], 15))
        FILES[:] = presentation_files(manifest)
    if args.apply and (not args.scan or not re.fullmatch(r"highpass-platform-mvp:capstone-mobile-[a-z0-9-]{1,50}", args.image or "") or
                       not all(re.fullmatch(r"sha256:[a-f0-9]{64}", value or "") for value in [args.image_id, args.expected_current_id])):
        raise SystemExit("INVALID_IMAGE_ARGUMENTS")
    credential = sys.stdin.readline().rstrip("\r\n")
    if not credential or len(credential) > 128:
        raise SystemExit("CONCEALED_STDIN_CREDENTIAL_REQUIRED")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory = ROOT / "artifacts/workstation" / ("mobile-b-rollout-" + stamp)
    directory.mkdir(parents=True, exist_ok=False)
    client = paramiko.SSHClient()
    trust = None
    checks = []
    rollback = "NOT REQUIRED"
    promotion_attempted = False
    current = None
    try:
        address, mac, _ = ops.ROLES["B"]
        if args.trusted_baseline:
            baseline = (ROOT / args.trusted_baseline).resolve()
            if not baseline.is_relative_to(ROOT / "artifacts/workstation"):
                raise RuntimeError("TRUST_BASELINE_PATH_INVALID")
            receipt = json.loads((baseline / "result.json").read_text(encoding="utf8"))
            if receipt.get("status") != "PASS" or receipt.get("scope") != "A_B_APP_ONLY_PROMOTION" or not any(check.get("test") == "B_PINNED_RUNTIME_BASELINE" and check.get("status") == "PASS" for check in receipt.get("checks", [])):
                raise RuntimeError("TRUST_BASELINE_NOT_VERIFIED")
            parts = (baseline / "B-public-host.key").read_text(encoding="utf8").strip().split()
            if len(parts) < 2 or parts[0] != "ssh-ed25519":
                raise RuntimeError("TRUST_PIN_INVALID")
            public = paramiko.Ed25519Key(data=base64.b64decode(parts[1], validate=True))
        else:
            trust = ops.LocalVmTrust()
            public = trust.key("B", credential, directory / "B-public-host.key")
        client.get_host_keys().add(address, public.get_name(), public)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command, seconds=25):
            code, output = ops.run(client, "sudo -S -p '' timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), credential=credential, seconds=seconds+5)
            if code:
                raise RuntimeError("REMOTE_COMMAND_FAILED_" + str(code))
            return output.strip()
        run("test $(cat /sys/class/net/ens33/address) = " + mac + "; systemctl is-active --quiet docker; systemctl is-active --quiet wg-quick@hp-capstone")
        current = json.loads(run("docker inspect " + NAME))[0]
        if not current["State"].get("Running") or current["State"].get("Health", {}).get("Status") != "healthy":
            raise RuntimeError("CURRENT_B_NOT_HEALTHY")
        env = dict(value.split("=", 1) for value in current["Config"]["Env"])
        for marker in ["CAPSTONE_IMAGE_ENCRYPTION_REQUIRED", "CAPSTONE_RUNTIME_DIAGNOSTICS"]:
            if env.get(marker) != "1":
                raise RuntimeError("REQUIRED_SECURITY_MODE_MISSING")
        checks.append({"test": "B_BASELINE_HEALTH_ENCRYPTION_DIAGNOSTICS", "status": "PASS"})
        if args.apply:
            if current["Image"] != args.expected_current_id:
                raise RuntimeError("B_BASELINE_IMAGE_CHANGED")
            scan_path = (ROOT / args.scan).resolve()
            if not scan_path.is_relative_to(ROOT / "artifacts/security/container-scan"):
                raise RuntimeError("SCAN_PATH_INVALID")
            scan = json.loads(scan_path.read_text(encoding="utf8"))
            if scan.get("Metadata", {}).get("ImageID") != args.image_id or not scan.get("Results") or any(v.get("Severity") in ["HIGH", "CRITICAL"] for r in scan.get("Results", []) for v in r.get("Vulnerabilities", [])):
                raise RuntimeError("EXACT_ZERO_HIGH_CRITICAL_SCAN_REQUIRED")
            if local(["docker", "image", "inspect", args.image, "--format", "{{.Id}}"], 15) != args.image_id:
                raise RuntimeError("CANDIDATE_CHANGED")
            checks.append({"test": "EXACT_SCANNED_CANDIDATE", "status": "PASS"})
            source_hashes = attest_candidate(args.image_id)
            checks.append({"test": "CURRENT_PRESENTATION_SOURCE_BYTES" if args.presentation_ui else "CURRENT_MOBILE_SOURCE_BYTES", "status": "PASS", "sha256": source_hashes})
            labels = current["Config"]["Labels"]
            workdir, configs = validated_context(labels)
            prefix = "env HIPASS_B_PORTAL_SECRET_DIR=/opt/highpass/capstone-b-portal-secrets HIPASS_KEY_RELEASE_VAULT_KEY_ID=" + shlex.quote(env["CAPSTONE_VAULT_KEY_ID"])
            def compose(image):
                return prefix + " HIPASS_APP_IMAGE=" + shlex.quote(image) + " docker compose --project-directory " + shlex.quote(workdir) + " -p hp-capstone-b-portal" + "".join(" -f " + shlex.quote(p) for p in configs)
            baseline_config = json.loads(run(compose(current["Image"]) + " config --format json"))
            candidate_config = json.loads(run(compose(args.image) + " config --format json"))
            if baseline_config["services"]["portal"]["image"] != current["Image"]:
                raise RuntimeError("ROLLBACK_IMAGE_NOT_RESOLVED")
            candidate_config["services"]["portal"]["image"] = current["Image"]
            if candidate_config != baseline_config:
                raise RuntimeError("NON_IMAGE_COMPOSE_CHANGE")
            if run("docker image inspect " + current["Image"] + " --format '{{.Id}}'") != current["Image"]:
                raise RuntimeError("ROLLBACK_IMAGE_MISSING")
            checks.append({"test": "ORIGINAL_COMPOSE_ROLLBACK_IMAGE_PRESERVED", "status": "PASS"})
            archive = directory / "candidate.tar"
            local(["docker", "save", "-o", str(archive), args.image], 180)
            with archive.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            stage = "/home/server/.highpass-mobile-" + stamp
            with client.open_sftp() as sftp:
                sftp.get_channel().settimeout(15)
                sftp.mkdir(stage, mode=0o700)
                start = time.monotonic()
                def deadline(done, total):
                    if time.monotonic()-start > 300:
                        raise RuntimeError("TRANSFER_DEADLINE")
                sftp.put(str(archive), stage + "/candidate.tar", callback=deadline)
            if run("sha256sum " + stage + "/candidate.tar").split()[0] != digest:
                raise RuntimeError("TRANSFER_HASH_MISMATCH")
            run("docker load -i " + stage + "/candidate.tar", 180)
            if run("docker image inspect " + args.image + " --format '{{.Id}}'") != args.image_id:
                raise RuntimeError("LOADED_IMAGE_CHANGED")
            # No image drift may occur between initial inventory and promotion.
            if run("docker inspect " + NAME + " --format '{{.Image}}'") != current["Image"]:
                raise RuntimeError("B_CHANGED_BEFORE_PROMOTION")
            if attest_candidate(args.image_id) != source_hashes:
                raise RuntimeError("SOURCE_CHANGED_BEFORE_PROMOTION")
            promotion_attempted = True
            run(compose(args.image) + " up -d --no-deps --force-recreate --pull never portal", 90)
            end = time.monotonic() + 90
            while True:
                observed = json.loads(run("docker inspect " + NAME))[0]
                if observed["Image"] == args.image_id and observed["State"].get("Health", {}).get("Status") == "healthy":
                    break
                if time.monotonic() >= end:
                    raise RuntimeError("READINESS_DEADLINE")
                time.sleep(2)
            differences = runtime_differences(current, observed)
            if differences:
                checks.append({"test": "RUNTIME_CONFIGURATION_PRESERVED", "status": "FAIL", "changedFields": differences})
                raise RuntimeError("RUNTIME_CONFIGURATION_CHANGED")
            checks.append({"test": "RUNTIME_CONFIGURATION_PRESERVED", "status": "PASS"})
            if args.rehearse_rollback:
                for image, expected, label in [(current["Image"], current["Image"], "ROLLBACK_REHEARSAL"), (args.image, args.image_id, "CANDIDATE_REPROMOTION")]:
                    run(compose(image) + " up -d --no-deps --force-recreate --pull never portal", 90)
                    end = time.monotonic() + 90
                    while True:
                        restored = json.loads(run("docker inspect " + NAME))[0]
                        if restored["Image"] == expected and restored["State"].get("Health", {}).get("Status") == "healthy":
                            break
                        if time.monotonic() >= end:
                            raise RuntimeError(label + "_READINESS_DEADLINE")
                        time.sleep(2)
                    if runtime_differences(current, restored):
                        raise RuntimeError(label + "_RUNTIME_CHANGED")
                    if run("curl --cacert /opt/highpass/capstone-b-portal-secrets/ca.crt --max-time 10 -s -o /dev/null -w '%{http_code}' https://192.168.111.149:9443/api/health", 12) != "200":
                        raise RuntimeError(label + "_HEALTH_ROUTE_FAILED")
                    checks.append({"test": label, "status": "PASS"})
                rollback = "EXECUTED_AND_VERIFIED"
            routes = ["/api/health", "/hipass/", "/mobile/", "/mobile/manifest.json", "/mobile/app.js", "/mobile/sw.js"]
            if args.presentation_ui:
                routes += ["/ui/workspace.css", "/ui/tokens.css", "/ui/clinician.js", "/ui/patient.js", "/brand/mediq-source.png"]
            for route in routes:
                status = run("curl --cacert /opt/highpass/capstone-b-portal-secrets/ca.crt --max-time 10 -s -o /dev/null -w '%{http_code}' https://192.168.111.149:9443" + route, 12)
                if status != "200":
                    raise RuntimeError("STRICT_TLS_ROUTE_FAILED")
                checks.append({"test": "B_STRICT_TLS_ROUTE", "path": route, "status": "PASS"})
        scope = "B_PRESENTATION_UI_PROMOTION" if args.apply and args.presentation_ui else "B_MOBILE_PROMOTION" if args.apply else "B_READ_ONLY_INVENTORY"
        result = {"status": "PASS", "scope": scope, "review": "DRAFT / UNASSIGNED", "baselineImageId": current["Image"], "baselineImage": current["Config"]["Image"], "imageId": args.image_id, "checks": checks, "rollbackExecution": rollback, "cloudModified": False, "hospitalAModified": False, "browserE2E": "NOT VERIFIED"}
    except Exception as error:
        if promotion_attempted:
            try:
                run(compose(current["Image"]) + " up -d --no-deps --force-recreate --pull never portal", 90)
                end = time.monotonic() + 90
                while True:
                    old = json.loads(run("docker inspect " + NAME))[0]
                    if old["Image"] == current["Image"] and old["State"].get("Health", {}).get("Status") == "healthy":
                        break
                    if time.monotonic() >= end:
                        raise RuntimeError("ROLLBACK_READINESS_DEADLINE")
                    time.sleep(2)
                rollback = "PASS"
            except Exception:
                rollback = "OUTCOME UNKNOWN — RECONCILE BEFORE RETRY"
        result = {"status": "NOT VERIFIED", "scope": "B_MOBILE_PROMOTION", "review": "DRAFT / UNASSIGNED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__, "checks": checks, "rollbackExecution": rollback}
    finally:
        client.close()
        if trust:
            trust.close()
        credential = None
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
