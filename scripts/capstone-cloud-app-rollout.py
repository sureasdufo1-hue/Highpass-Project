"""Baseline-pinned cloud app promotion; preserve PostgreSQL and existing hashes."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shlex
import stat
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cloud_ops", ROOT / "scripts/capstone-cloud-control-ops.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
KEY_ID = "https://kv-hp-demo-4869edd9.vault.azure.net/keys/capstone-b-kek-20261009/9c03b2560a3240418d33d92a165b6806"
FILES = [("infra/azure/capstone-control.compose.yml", "control.yml"), ("infra/azure/capstone-control-ingress.compose.yml", "ingress.yml"), ("infra/azure/capstone-mock-idp.compose.yml", "mock.yml"), ("infra/azure/capstone-control-key-release.compose.yml", "key-release.yml")]
PHANTOM_FLAG = "HIPASS_CAPSTONE_PHANTOM_CATALOG"
PHANTOM_OVERLAY = "phantom-catalog.yml"
PHANTOM_SOURCE = "infra/azure/capstone-phantom-catalog.compose.yml"

def validated_context(labels):
    stage = labels.get("com.docker.compose.project.working_dir", "")
    configs = labels.get("com.docker.compose.project.config_files", "").split(",")
    if labels.get("com.docker.compose.project") != "hp-capstone-control" or not re.fullmatch(r"/home/highpassadmin/\.highpass-app-[0-9T.+-]{20,60}", stage):
        raise RuntimeError("ORIGINAL_COMPOSE_PATH_INVALID")
    expected = [stage + "/" + name for _, name in FILES]
    if configs not in [expected, expected + [stage + "/" + PHANTOM_OVERLAY]]:
        raise RuntimeError("ORIGINAL_COMPOSE_FILES_INVALID")
    return stage, configs

def runtime_differences(before, after, phantom_catalog=False):
    differences = []
    def environment(values):
        parsed = dict(value.split("=", 1) for value in values)
        if len(parsed) != len(values):
            raise RuntimeError("DUPLICATE_RUNTIME_ENVIRONMENT")
        return parsed
    expected_env = environment(before["Config"]["Env"])
    if phantom_catalog:
        expected_env[PHANTOM_FLAG] = "1"
    if expected_env != environment(after["Config"]["Env"]):
        differences.append("ENVIRONMENT_VALUES")
    if sorted(before["HostConfig"].get("Binds") or []) != sorted(after["HostConfig"].get("Binds") or []):
        differences.append("MOUNT_BINDINGS")
    for group, keys in [("Config", ["Cmd", "Entrypoint", "User", "WorkingDir"]), ("HostConfig", ["PortBindings", "ReadonlyRootfs", "Privileged", "CapAdd", "CapDrop", "SecurityOpt", "NetworkMode"])]:
        for key in keys:
            if before[group].get(key) != after[group].get(key):
                differences.append(group + "." + key)
    return differences

def assert_image_only_config(baseline, candidate, baseline_image, candidate_image):
    normalized = copy.deepcopy(candidate)
    for service in ["control", "ingress", "bootstrap", "key-release-migrate"]:
        if baseline["services"][service]["image"] != baseline_image:
            raise RuntimeError("ROLLBACK_IMAGE_NOT_RESOLVED")
        if normalized["services"][service]["image"] != candidate_image:
            raise RuntimeError("CANDIDATE_IMAGE_NOT_RESOLVED")
        normalized["services"][service]["image"] = baseline_image
    if normalized != baseline:
        raise RuntimeError("NON_IMAGE_COMPOSE_CHANGE")

def assert_phantom_config(baseline, candidate, baseline_image, candidate_image):
    normalized = copy.deepcopy(candidate)
    environment = normalized["services"]["control"].setdefault("environment", {})
    if environment.get(PHANTOM_FLAG) != "1":
        raise RuntimeError("EXACT_PHANTOM_OPT_IN_REQUIRED")
    prior = baseline["services"]["control"].get("environment", {})
    if PHANTOM_FLAG in prior:
        environment[PHANTOM_FLAG] = prior[PHANTOM_FLAG]
    else:
        environment.pop(PHANTOM_FLAG)
    assert_image_only_config(baseline, normalized, baseline_image, candidate_image)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--image-id", required=True)
    parser.add_argument("--expected-current-id", required=True)
    parser.add_argument("--scan", required=True)
    parser.add_argument("--verify-rollback", action="store_true")
    parser.add_argument("--phantom-catalog", action="store_true")
    args = parser.parse_args()
    if args.phantom_catalog and not args.verify_rollback:
        raise SystemExit("PHANTOM_ACTIVATION_REQUIRES_ROLLBACK_REHEARSAL")
    if not re.fullmatch(r"highpass-platform-mvp:capstone-[a-z0-9-]{1,70}", args.image) or not all(re.fullmatch(r"sha256:[a-f0-9]{64}", value) for value in [args.image_id, args.expected_current_id]):
        raise SystemExit("PUBLIC_IMAGE_ARGUMENT_INVALID")
    scan_path = (ROOT / args.scan).resolve()
    if not scan_path.is_relative_to(ROOT / "artifacts/security/container-scan"):
        raise SystemExit("SCAN_PATH_INVALID")
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("cloud-app-rollout-" + stamp)
    directory.mkdir(parents=True)
    stage = "/home/highpassadmin/.highpass-app-" + stamp
    checks, baselines = [], {}
    client = paramiko.SSHClient()
    phase = "EXACT_IMAGE_SCAN"
    promotion_attempted = False
    rollback = "NOT REQUIRED"
    try:
        scan = json.loads(scan_path.read_text(encoding="utf8"))
        created = datetime.fromisoformat(scan["CreatedAt"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - created).total_seconds()
        if not 0 <= age < 86400 or not isinstance(scan.get("Results"), list) or scan.get("Metadata", {}).get("ImageID") != args.image_id or any(v.get("Severity") in ["HIGH", "CRITICAL"] for result in scan["Results"] for v in result.get("Vulnerabilities", [])):
            raise RuntimeError("EXACT_FRESH_ZERO_HIGH_CRITICAL_SCAN_REQUIRED")
        if base.local(["docker", "image", "inspect", args.image, "--format", "{{.Id}}"] ) != args.image_id:
            raise RuntimeError("CANDIDATE_CHANGED")
        checks.append({"test": "EXACT_FRESH_IMAGE_SECURITY_SCAN", "status": "PASS"})
        paths = ["src/postgres-store.js", "src/audit-chain-order.js", "src/services.js", "src/server.js", "src/auth.js", "src/domain.js", "scripts/start-capstone-control.js", "src/consent-bound-key-release.js"]
        if args.phantom_catalog:
            paths += ["src/capstone-mock-idp.js", "src/capstone-phantom-catalog.js", "scripts/test-support/synthetic-phantom.js"]
        expression = "import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';console.log(JSON.stringify(Object.fromEntries(" + json.dumps(paths) + ".map(p=>[p,createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')]))));"
        hashes = json.loads(base.local(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--entrypoint", "/nodejs/bin/node", args.image, "--input-type=module", "-e", expression]))
        if any(hashes[p] != hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths):
            raise RuntimeError("SCOPED_IMAGE_SOURCE_CHANGED")
        checks.append({"test": "SCOPED_RUNTIME_SOURCE_ATTESTATION", "status": "PASS", "sourceHashes": hashes})
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command, seconds=20):
            code, output = base.ops.run(client, "sudo -n timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), seconds=seconds + 5)
            if code:
                raise RuntimeError("REMOTE_STAGE_FAILED_" + phase + "_" + str(code))
            return output.strip()
        phase = "PINNED_CLOUD_BASELINE"
        run("test $(hostname) = highpass-cloud; test $(docker inspect hp-capstone-control-control-1 --format '{{.Image}}') = " + args.expected_current_id + "; test $(docker inspect hp-capstone-control-postgres-1 --format '{{.Image}}') = " + base.PG_ID)
        pg_id = run("docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'")
        labels = json.loads(run("docker inspect hp-capstone-control-control-1 --format '{{json .Config.Labels}}'"))
        baselines = {key: labels.get("com.docker.compose." + key) for key in ["project.working_dir", "project.config_files"]}
        workdir, configs = validated_context(labels)
        current = {name: json.loads(run("docker inspect " + name))[0] for name in ["hp-capstone-control-control-1", "hp-capstone-control-ingress-1"]}
        if any(value["Image"] != args.expected_current_id or not value["State"].get("Running") for value in current.values()):
            raise RuntimeError("BASELINE_RUNTIME_MISMATCH")
        if current["hp-capstone-control-control-1"]["State"].get("Health", {}).get("Status") != "healthy":
            raise RuntimeError("BASELINE_NOT_HEALTHY")
        run("docker image inspect " + args.expected_current_id + " --format '{{.Id}}'")
        sql = "SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(audit_id || ':' || record_hash || ':' || coalesce(previous_hash,'HEAD'), ',' ORDER BY audit_id),''),'UTF8')),'hex') FROM audit_logs"
        fingerprint_command = "docker exec hp-capstone-control-postgres-1 psql -U hipass_bootstrap -d hipass -At -c " + shlex.quote(sql)
        before = run(fingerprint_command)
        checks.append({"test": "PINNED_CLOUD_PG_AUDIT_BASELINE", "status": "PASS", "fingerprint": before})
        archive = directory / "reviewed-app.tar"
        base.local(["docker", "save", "-o", str(archive), args.image], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        phase = "EXACT_IMAGE_TRANSFER"
        base.emit({"phase": phase, "status": "RUNNING"})
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o700)
            started = time.monotonic()
            def deadline(done, total):
                if time.monotonic() - started > 300:
                    raise RuntimeError("TRANSFER_DEADLINE")
            sftp.put(str(archive), stage + "/reviewed-app.tar", callback=deadline)
            sftp.chmod(stage + "/reviewed-app.tar", 0o600)
        if run("sha256sum " + stage + "/reviewed-app.tar").split()[0] != digest:
            raise RuntimeError("TRANSFER_DIGEST_MISMATCH")
        run("docker load -i " + stage + "/reviewed-app.tar", 180)
        if run("docker image inspect " + args.image + " --format '{{.Id}}'") != args.image_id:
            raise RuntimeError("LOADED_IMAGE_CHANGED")
        checks.append({"test": "EXACT_TRANSFER_IMAGE", "status": "PASS", "archiveSha256": digest})
        environment = {"HIPASS_APP_IMAGE": args.image, "HIPASS_POSTGRES_IMAGE": base.PG, "HIPASS_CLOUD_SECRET_DIR": "/opt/highpass/capstone-control-secrets", "HIPASS_CAPSTONE_PUBLIC_ORIGIN": "https://192.168.111.149:9443", "HIPASS_KEY_RELEASE_VAULT_KEY_ID": KEY_ID}
        candidate_files = list(configs)
        if args.phantom_catalog:
            overlay_path = workdir + "/" + PHANTOM_OVERLAY
            overlay = (ROOT / PHANTOM_SOURCE).read_text(encoding="utf8").replace("\r\n", "\n")
            # Exclusive creation; never overwrite an existing operator file.
            with client.open_sftp() as sftp:
                sftp.get_channel().settimeout(15)
                try:
                    overlay_info = sftp.lstat(overlay_path)
                except FileNotFoundError:
                    overlay_info = None
                if overlay_info is not None:
                    if not stat.S_ISREG(overlay_info.st_mode):
                        raise RuntimeError("PHANTOM_OVERLAY_NOT_REGULAR_FILE")
                    with sftp.open(overlay_path, "r") as stream:
                        if stream.read().decode("utf8") != overlay:
                            raise RuntimeError("EXISTING_PHANTOM_OVERLAY_CHANGED")
                else:
                    with sftp.open(overlay_path, "wx") as stream:
                        stream.write(overlay)
                    sftp.chmod(overlay_path, 0o600)
                if overlay_path not in candidate_files:
                    candidate_files.append(overlay_path)
        def compose_for(image, phantom_catalog=False):
            values = {**environment, "HIPASS_APP_IMAGE": image}
            selected_files = candidate_files if phantom_catalog else configs
            return "env " + " ".join(k + "=" + shlex.quote(v) for k, v in values.items()) + " docker compose --project-directory " + shlex.quote(workdir) + " -p hp-capstone-control" + "".join(" -f " + shlex.quote(name) for name in selected_files)
        compose = compose_for(args.image, args.phantom_catalog)
        baseline_config = json.loads(run(compose_for(args.expected_current_id) + " config --format json"))
        candidate_config = json.loads(run(compose + " config --format json"))
        # Migration/bootstrap images change only in rendered configuration;
        # --no-deps means these services are never executed by this operator.
        config_check = assert_phantom_config if args.phantom_catalog else assert_image_only_config
        config_check(baseline_config, candidate_config, args.expected_current_id, args.image)
        for name, original in current.items():
            service = original["Config"]["Labels"]["com.docker.compose.service"]
            actual_env = dict(value.split("=", 1) for value in original["Config"]["Env"])
            if any(actual_env.get(key) != str(value) for key, value in baseline_config["services"][service].get("environment", {}).items()):
                raise RuntimeError("ORIGINAL_COMPOSE_ENVIRONMENT_DRIFT")
            expected_binds = sorted((volume["source"], volume["target"], bool(volume.get("read_only"))) for volume in baseline_config["services"][service].get("volumes", []) if volume["type"] == "bind")
            actual_binds = sorted((volume["Source"], volume["Destination"], not volume["RW"]) for volume in original["Mounts"] if volume["Type"] == "bind")
            if expected_binds != actual_binds:
                raise RuntimeError("ORIGINAL_COMPOSE_MOUNT_DRIFT")
        run(compose + " config --quiet")
        checks.append({"test": "COMPOSE_CONFIGURATION", "status": "PASS"})
        phase = "CLOUD_APP_ONLY_PROMOTION"
        def verify_runtime(image, phantom_catalog=False):
            end = time.monotonic() + 90
            while True:
                if run("docker inspect hp-capstone-control-control-1 --format '{{.State.Health.Status}}'") == "healthy":
                    break
                if time.monotonic() >= end:
                    raise RuntimeError("READINESS_DEADLINE_OBSERVE_SAME_CONTAINER")
                time.sleep(2)
            for name, original in current.items():
                observed = json.loads(run("docker inspect " + name))[0]
                if observed["Image"] != image or not observed["State"].get("Running"):
                    raise RuntimeError("PROMOTION_STATE_MISMATCH")
                if runtime_differences(original, observed, phantom_catalog and name == "hp-capstone-control-control-1"):
                    raise RuntimeError("RUNTIME_CONFIGURATION_CHANGED")
        promotion_attempted = True
        run(compose + " up -d --no-deps --force-recreate --pull never control ingress", 90)
        verify_runtime(args.image_id, args.phantom_catalog)
        checks.append({"test": "NEW_CLOUD_APP_READINESS", "status": "PASS"})
        if args.verify_rollback:
            phase = "ROLLBACK_REHEARSAL"
            run(compose_for(args.expected_current_id) + " up -d --no-deps --force-recreate --pull never control ingress", 90)
            verify_runtime(args.expected_current_id)
            rollback = "EXECUTED_AND_VERIFIED"
            checks.append({"test": "ROLLBACK_REHEARSAL", "status": "PASS"})
            run(compose + " up -d --no-deps --force-recreate --pull never control ingress", 90)
            verify_runtime(args.image_id, args.phantom_catalog)
            checks.append({"test": "CANDIDATE_REPROMOTION", "status": "PASS"})
        after = run(fingerprint_command)
        if before != after or run("docker inspect hp-capstone-control-postgres-1 --format '{{.Id}}'") != pg_id:
            raise RuntimeError("PERSISTED_AUDIT_OR_DATABASE_CHANGED")
        checks.append({"test": "ALL_PERSISTED_HASHES_AND_PG_UNCHANGED", "status": "PASS", "fingerprint": after})
    except Exception as error:
        checks.append({"test": phase, "status": "FAIL" if isinstance(error, RuntimeError) and str(error) == "PERSISTED_AUDIT_OR_DATABASE_CHANGED" else "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
        if promotion_attempted:
            try:
                run(compose_for(args.expected_current_id) + " up -d --no-deps --force-recreate --pull never control ingress", 90)
                verify_runtime(args.expected_current_id)
                rollback = "FAILURE_RECOVERY_VERIFIED"
            except Exception:
                rollback = "FAILURE_RECOVERY_NOT_VERIFIED"
    finally:
        client.close()
    result = {"scope": "CLOUD_APP_AND_EXACT_PHANTOM_OPT_IN_PROMOTION" if args.phantom_catalog else "CLOUD_APP_ONLY_PRESERVED_CONTEXT_PROMOTION", "review": "DRAFT / UNASSIGNED", "imageId": args.image_id, "checks": checks, "stage": stage, "previousContext": baselines, "rollback": rollback, "status": "PASS" if len(checks) >= 7 and all(row["status"] == "PASS" for row in checks) else "FAIL" if any(row["status"] == "FAIL" for row in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
