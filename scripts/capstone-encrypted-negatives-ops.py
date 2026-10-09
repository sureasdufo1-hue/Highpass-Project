"""Actual pinned A/B/cloud crypto negatives. Credentials/proofs stay in memory."""
import getpass
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base = gateway.base
HOSPITAL_IMAGE = "sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1"
CLOUD_IMAGE = "sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807"

def main():
    directory = ROOT / "artifacts/workstation" / ("encrypted-negatives-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    clients = {}
    trust = None
    presenter = None
    phase = "PINNED_FLEET_BASELINE"
    baseline_checks = []
    result = {}
    try:
        trust = base.ops.LocalVmTrust()
        for role in ["A", "B"]:
            address, mac, _ = base.ops.ROLES[role]
            public = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            clients[role] = client
            client.get_host_keys().add(address, public.get_name(), public)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            code, _ = base.ops.run(client, "timeout 5s bash -c " + shlex.quote("set -eu; test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = " + mac), seconds=10)
            if code:
                raise RuntimeError("HOSPITAL_ROLE_MISMATCH_" + role)
            name = "hp-capstone-a-gateway-gateway-1" if role == "A" else "hp-capstone-b-portal-portal-1"
            code, state = base.ops.run(client, "sudo -S -p '' timeout 10s docker inspect " + name + " --format '{{.Image}} {{.State.Running}} {{.State.Health.Status}}'", credential=credential, seconds=15)
            if code or state.strip() != HOSPITAL_IMAGE + " true healthy":
                raise RuntimeError("HOSPITAL_RUNTIME_MISMATCH_" + role)
            baseline_checks.append({"test": role + "_PINNED_HEALTHY_CURRENT_RUNTIME", "status": "PASS"})
        cloud = paramiko.SSHClient()
        clients["C"] = cloud
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, state = base.ops.run(cloud, "test $(hostname) = highpass-cloud && sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Running}} {{.State.Health.Status}}'", seconds=15)
        if code or state.strip() != CLOUD_IMAGE + " true healthy":
            raise RuntimeError("CLOUD_RUNTIME_MISMATCH")
        baseline_checks.append({"test": "CLOUD_PINNED_HEALTHY_CURRENT_RUNTIME", "status": "PASS"})
        with gateway.root_sftp(cloud) as sftp, sftp.open("/opt/highpass/capstone-control-secrets/capstone-login-key", "rb") as stream:
            presenter = stream.read(129).decode("ascii").strip()
        if len(presenter) != 64 or any(char not in "0123456789abcdef" for char in presenter):
            raise RuntimeError("PRESENTER_CONTRACT_INVALID")
        phase = "ACTUAL_DEPLOYED_CRYPTO_AND_POLICY_NEGATIVES"
        base.emit({"phase": phase, "status": "RUNNING", "credentials": "ANONYMOUS_STDIN_MEMORY_ONLY"})
        source = (ROOT / "scripts/capstone-encrypted-negatives-probe.js").read_bytes()
        payload = bytearray(("const presenterKey = " + json.dumps(presenter) + ";\n").encode())
        payload.extend(source)
        channel = clients["B"].get_transport().open_session(timeout=10)
        channel.settimeout(10)
        channel.exec_command("sudo -S -p '' timeout 200s docker exec -i hp-capstone-b-portal-portal-1 /nodejs/bin/node --input-type=module")
        channel.sendall((credential + "\n").encode())
        channel.sendall(payload)
        channel.shutdown_write()
        payload[:] = b"\0" * len(payload)
        presenter = None
        output = bytearray()
        deadline = time.monotonic() + 210
        try:
            while time.monotonic() < deadline:
                if channel.recv_ready():
                    output.extend(channel.recv(32768))
                if channel.recv_stderr_ready():
                    channel.recv_stderr(32768)  # Discard raw exceptions/paths.
                if len(output) > 65536:
                    raise RuntimeError("PROBE_OUTPUT_LIMIT")
                if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                    code = channel.recv_exit_status()
                    result = json.loads(bytes(output).decode("utf8"))
                    if code != 0 and result.get("status") == "PASS":
                        raise RuntimeError("PROBE_EXIT_MISMATCH")
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("OWNED_REMOTE_PROBE_DEADLINE")
        finally:
            channel.close()
        result["probeSourceSha256"] = hashlib.sha256(source).hexdigest()
    except Exception as error:
        result = {"scope": "ACTUAL_ENCRYPTED_NEGATIVES", "review": "DRAFT / UNASSIGNED", "status": "NOT VERIFIED", "checks": [{"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__}]}
    finally:
        for client in clients.values():
            client.close()
        if trust:
            trust.close()
        presenter = None
        credential = None
    result["baselineChecks"] = baseline_checks
    result["images"] = {"hospital": HOSPITAL_IMAGE, "cloud": CLOUD_IMAGE}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result.get("status") == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
