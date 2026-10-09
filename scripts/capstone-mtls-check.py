"""Current A PACS mTLS tests only; no seeding, runtime certificate replacement or CA key transfer."""
import argparse
import getpass
import importlib.util
import json
import pathlib
import re
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vm_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--image-id", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"highpass-platform-mvp:capstone-[a-z0-9-]{1,70}", args.image) or not re.fullmatch(r"sha256:[a-f0-9]{64}", args.image_id):
        raise SystemExit("PUBLIC_IMAGE_ARGUMENT_INVALID")
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("current-mtls-" + stamp)
    directory.mkdir(parents=True)
    stage = "/home/server/.highpass-mtls-check-" + stamp
    credential = getpass.getpass("VM credential (concealed): ")
    client = paramiko.SSHClient()
    trust = None
    uploaded = []
    stage_created = False
    checks = []
    try:
        trust = ops.LocalVmTrust()
        address, mac, _ = ops.ROLES["A"]
        key = trust.key("A", credential, directory / "A-public-host.key")
        client.get_host_keys().add(address, key.get_name(), key)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command, seconds=20, root=False):
            return ops.run(client, ("sudo -S -p '' " if root else "") + "timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), credential=credential if root else None, seconds=seconds + 5)
        code, _ = run("test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = " + mac)
        if code:
            raise RuntimeError("PINNED_A_GUEST_ROLE_REQUIRED")
        code, fixture_uid = run("id -u", 5)
        if code or not re.fullmatch(r"[1-9][0-9]{0,6}", fixture_uid.strip()):
            raise RuntimeError("TEST_FIXTURE_OWNER_REQUIRED")
        fixture_uid = fixture_uid.strip()
        code, _ = run("test $(docker image inspect " + args.image + " --format '{{.Id}}') = " + args.image_id + "; test $(docker inspect hp-capstone-a-gateway-gateway-1 --format '{{.Image}}') = " + args.image_id + "; test $(docker inspect hp-capstone-hospital-a-orthanc-mtls-1 --format '{{.State.Health.Status}}') = healthy", root=True)
        if code:
            raise RuntimeError("PINNED_A_RUNTIME_BASELINE_REQUIRED")
        files = [("tmp/certs/mtls/ca.crt", "ca.crt"), ("tmp/certs/mtls/gateway-client.crt", "valid.crt"), ("tmp/certs/mtls/gateway-client.key", "valid.key"), ("tmp/certs/bad/bad.crt", "bad.crt"), ("tmp/certs/bad/bad.key", "bad.key"), ("scripts/ops-mtls-client-check.js", "client.js")]
        for fixture in ["wrong-issuer", "wrong-san", "wrong-eku", "expired"]:
            for extension in ["crt", "key"]:
                files.append(("tmp/certs/generated-fixtures/" + fixture + "/client." + extension, fixture + "." + extension))
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o700)
            stage_created = True
            for source, name in files:
                uploaded.append(stage + "/" + name)
                sftp.put(str(ROOT / source), stage + "/" + name)
                sftp.chmod(stage + "/" + name, 0o600)
        for fixture in ["valid", None, "wrong-issuer", "wrong-san", "wrong-eku", "expired", "bad"]:
            code, since = run("date -u --date='2 seconds ago' +%Y-%m-%dT%H:%M:%SZ", 5)
            if code or not re.fullmatch(r"[0-9TZ:.\-]+", since.strip()):
                raise RuntimeError("CLOCK_EVIDENCE_UNAVAILABLE")
            options = "" if fixture is None else " -e MTLS_CERT_FILE=/validation/" + fixture + ".crt -e MTLS_KEY_FILE=/validation/" + fixture + ".key"
            command = "docker run --rm --pull never --read-only --cap-drop ALL --security-opt no-new-privileges --user " + fixture_uid + " --network hp-capstone-hospital-a_pacs_private -v " + stage + ":/validation:ro -e MTLS_HOST=orthanc-mtls -e MTLS_SERVERNAME=hospital-a-orthanc-mtls -e MTLS_CA_FILE=/validation/ca.crt" + options + " " + args.image + " /validation/client.js"
            code, output = run(command, 15, root=True)
            log_code, logs = run("docker logs --since " + shlex.quote(since.strip()) + " --tail 100 hp-capstone-hospital-a-orthanc-mtls-1", 10, root=True)
            actual = ops.classify_mtls(code, output, logs if log_code == 0 else "")
            expected = "ALLOW" if fixture == "valid" else "DENY"
            # Fixed classified result only. No raw server logs/certificate/key output.
            safe_error = next((name for name in ["EACCES", "ENOENT", "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"] if re.search(r"\b" + name + r"\b", output)), None)
            checks.append({"test": "MTLS_" + (fixture or "no-certificate"), "expected": expected, "actual": actual, "status": "PASS" if actual == expected else "NOT VERIFIED" if actual == "ENVIRONMENT_ERROR" else "FAIL", "exitCode": code, "safeEnvironmentError": safe_error})
    except Exception as error:
        checks.append({"test": "CURRENT_A_MTLS", "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        cleaned = True
        if stage_created:
            try:
                for target in uploaded:
                    code, _ = ops.run(client, "timeout 5s rm -f -- " + shlex.quote(target), seconds=10)
                    cleaned = cleaned and code == 0
                code, _ = ops.run(client, "timeout 5s rmdir -- " + shlex.quote(stage), seconds=10)
                cleaned = cleaned and code == 0
            except Exception:
                cleaned = False
            checks.append({"test": "OWNED_TEST_CLIENT_KEY_CLEANUP", "status": "PASS" if cleaned else "NOT VERIFIED"})
        client.close()
        if trust:
            trust.close()
        credential = None
    result = {"scope": "CURRENT_A_PACS_MTLS_COMPONENT_NOT_FULL_E2E", "review": "DRAFT / UNASSIGNED", "imageId": args.image_id, "checks": checks, "runtimeCertificatesReplaced": False, "seedPerformed": False, "caPrivateKeyTransferred": False, "status": "PASS" if len(checks) == 8 and all(row["status"] == "PASS" for row in checks) else "FAIL" if any(row["status"] == "FAIL" for row in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
