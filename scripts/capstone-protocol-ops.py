"""Real B/A/Azure protocol test; synthetic actors, protected ephemeral token fixture."""
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

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("protocol-" + stamp)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = base.ops.LocalVmTrust()
    clients = {}
    checks = []
    stage_b = "/home/server/.highpass-protocol-" + stamp
    stage_c = "/home/highpassadmin/.highpass-protocol-" + stamp
    protected_b = "/opt/highpass/protocol-" + stamp
    protected_c = "/opt/highpass/protocol-" + stamp
    phase = "PINNED_ACTUAL_HOSTS"
    finalized = False
    try:
        address, mac, _ = base.ops.ROLES["B"]
        key = trust.key("B", credential, directory / "B-public-host.key")
        b = paramiko.SSHClient()
        b.get_host_keys().add(address, key.get_name(), key)
        b.set_missing_host_key_policy(paramiko.RejectPolicy())
        b.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients["B"] = b
        code, _ = base.ops.run(b, "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac, seconds=10)
        if code:
            raise RuntimeError("B_ROLE_MISMATCH")
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud = paramiko.SSHClient()
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients["C"] = cloud
        code, image = base.ops.run(cloud, "test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}}'", seconds=15)
        if code or image.strip() != base.APP_ID:
            raise RuntimeError("CLOUD_RUNTIME_IMAGE_CHANGED")
        phase = "EXACT_B_PROTOCOL_TEST_IMAGE"
        archive = directory / "reviewed-app.tar"
        if base.local(["docker", "image", "inspect", base.APP, "--format", "{{.Id}}"] ) != base.APP_ID:
            raise RuntimeError("LOCAL_IMAGE_CHANGED")
        base.local(["docker", "save", "-o", str(archive), base.APP], seconds=180)
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        started = time.monotonic()
        def deadline(transferred, total):
            if time.monotonic() - started > 300:
                raise RuntimeError("IMAGE_TRANSFER_DEADLINE")
        with b.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage_b, mode=0o700)
            sftp.put(str(archive), stage_b + "/app.tar", callback=deadline)
        code, output = base.ops.run(b, "timeout 20s sha256sum " + shlex.quote(stage_b + "/app.tar"), seconds=25)
        if code or output.split()[0] != digest:
            raise RuntimeError("IMAGE_ARCHIVE_MISMATCH")
        code, _ = base.ops.run(b, "sudo -S -p '' timeout 180s docker load -i " + shlex.quote(stage_b + "/app.tar"), credential=credential, seconds=185)
        if code:
            raise RuntimeError("B_IMAGE_LOAD_FAILED")
        code, image = base.ops.run(b, "sudo -S -p '' timeout 10s docker image inspect " + shlex.quote(base.APP) + " --format '{{.Id}}'", credential=credential, seconds=15)
        if code or image.strip() != base.APP_ID:
            raise RuntimeError("B_LOADED_IMAGE_CHANGED")
        with cloud.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage_c, mode=0o700)
        for client, stage, source in [(b, stage_b, "capstone-protocol-b.js"), (cloud, stage_c, "capstone-protocol-cloud.js")]:
            with client.open_sftp() as sftp:
                sftp.get_channel().settimeout(15)
                sftp.put(str(ROOT / "tmp/certs/mtls/ca.crt"), stage + "/ca.crt")
                with sftp.open(stage + "/protocol.js", "w") as stream:
                    stream.write((ROOT / "scripts" / source).read_text(encoding="utf8").replace("\r\n", "\n"))
                sftp.chmod(stage + "/protocol.js", 0o600)
        for role, client, target in [("B", b, protected_b), ("C", cloud, protected_c)]:
            sudo = "sudo -S -p '' " if role == "B" else "sudo -n "
            command = "set -eu; test ! -e " + shlex.quote(target) + "; install -d -o 65532 -g 65532 -m 700 " + shlex.quote(target)
            code, _ = base.ops.run(client, sudo + "timeout 10s bash -c " + shlex.quote(command), credential=credential if role == "B" else None, seconds=15)
            if code:
                raise RuntimeError("PROTECTED_FIXTURE_DIRECTORY_FAILED")

        def run_protocol(role, protocol_phase):
            client, stage, protected = (cloud, stage_c, protected_c) if role == "C" else (b, stage_b, protected_b)
            network = "--network hp-capstone-control_edge_transport " if role == "C" else "--network host "
            extra = "-v /opt/highpass/capstone-control-secrets/test-auth-secret:/run/secrets/test-auth-secret:ro " if role == "C" else ""
            command = "timeout 80s docker run -i --rm --pull never " + network + "-e HIPASS_PROTOCOL_PHASE=" + protocol_phase + " -v " + shlex.quote(stage + "/ca.crt:/run/secrets/ca.crt:ro") + " -v " + shlex.quote(protected + ":/run/result") + " " + extra + shlex.quote(base.APP) + " --input-type=module < " + shlex.quote(stage + "/protocol.js")
            sudo = "sudo -n " if role == "C" else "sudo -S -p '' "
            code, output = base.ops.run(client, sudo + "bash -c " + shlex.quote(command), credential=credential if role == "B" else None, seconds=85)
            result = json.loads(output)
            checks.extend(result["checks"])
            if code or result["status"] != "PASS":
                raise RuntimeError("PROTOCOL_STAGE_FAILED_" + role + "_" + protocol_phase)

        phase = "REAL_PATIENT_CONSENT_AND_DOCTOR_DPOP_ISSUANCE"
        run_protocol("C", "issue")
        with gateway.root_sftp(cloud) as source, gateway.root_sftp(b, credential) as target:
            with source.open(protected_c + "/grant.json", "rb") as stream:
                fixture = stream.read(32769)
            if len(fixture) > 32768:
                raise RuntimeError("FIXTURE_SIZE_LIMIT")
            with target.open(protected_b + "/grant.json", "wx") as stream:
                stream.write(fixture)
            fixture = None
            target.chmod(protected_b + "/grant.json", 0o600)
            target.chown(protected_b + "/grant.json", 65532, 65532)
        phase = "REAL_B_A_PACS_GRANTED_AND_DENIED_PROTOCOL"
        run_protocol("B", "normal")
        phase = "REAL_REVOKE_AND_AUDIT_INTEGRITY"
        run_protocol("C", "finalize")
        finalized = True
        phase = "REAL_REVOKED_ACCESS_DENY"
        run_protocol("B", "revoked")
        phase = "FINAL_ALL_EVENTS_AUDIT_CHAIN"
        run_protocol("C", "audit")
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        # Revoke the new consent on a failed protocol step where its provisional
        # fixture exists. Preserve audit records; never mutate seeded consent.
        if not finalized and "C" in clients and "run_protocol" in locals():
            code, _ = base.ops.run(clients["C"], "sudo -n timeout 5s test -f " + shlex.quote(protected_c + "/grant.json"), seconds=10)
            if code == 0:
                try:
                    run_protocol("C", "finalize")
                except Exception:
                    checks.append({"test": "FAILED_RUN_CONSENT_REVOKE_AND_AUDIT", "status": "NOT VERIFIED"})
        for role, client in clients.items():
            protected = protected_c if role == "C" else protected_b
            sudo = "sudo -n " if role == "C" else "sudo -S -p '' "
            command = "if test -d " + shlex.quote(protected) + "; then rm -f -- " + shlex.quote(protected + "/grant.json") + "; rmdir -- " + shlex.quote(protected) + "; fi"
            try:
                code, _ = base.ops.run(client, sudo + "timeout 10s bash -c " + shlex.quote(command), credential=credential if role == "B" else None, seconds=15)
                checks.append({"test": role + "_EPHEMERAL_TOKEN_KEY_CLEANUP", "status": "PASS" if code == 0 else "FAIL"})
            except Exception:
                checks.append({"test": role + "_EPHEMERAL_TOKEN_KEY_CLEANUP", "status": "NOT VERIFIED"})
            client.close()
        trust.close()
        credential = None
    result = {"scope": "ACTUAL_B_A_AZURE_SYNTHETIC_DICOM_PROTOCOL_NOT_BROWSER", "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if checks and all(item["status"] == "PASS" for item in checks) else "NOT VERIFIED", "browserViewer": "NOT VERIFIED", "realKeyVaultCrypto": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
