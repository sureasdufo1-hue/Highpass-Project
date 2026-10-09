"""Actual A/B private cloud TLS probes; secret credential only concealed stdin."""
import getpass
import importlib.util
import json
import pathlib
import shlex
import sys
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("workstation_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("cloud-client-" + stamp)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = ops.LocalVmTrust()
    results = []
    try:
        for role in ["A", "B"]:
            client = paramiko.SSHClient()
            stage = "/home/server/.highpass-cloud-client-" + stamp
            address, mac, _ = ops.ROLES[role]
            key = trust.key(role, credential, directory / (role + "-host-public.key"))
            client.get_host_keys().add(address, key.get_name(), key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            try:
                client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
                code, _ = ops.run(client, "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac + " && systemctl is-active --quiet wg-quick@hp-capstone", seconds=10)
                if code:
                    raise RuntimeError("VM_ROLE_OR_OVERLAY_MISMATCH")
                with client.open_sftp() as sftp:
                    sftp.get_channel().settimeout(15)
                    sftp.mkdir(stage, mode=0o700)
                    sftp.put(str(ROOT / "tmp/certs/mtls/ca.crt"), stage + "/development-ca.crt")
                    sftp.chmod(stage + "/development-ca.crt", 0o600)
                for route, expected in [("/api/health", "200"), ("/dicomweb/studies", "403"), ("/viewer", "403")]:
                    command = "timeout 8s curl --silent --show-error --connect-timeout 3 --max-time 6 --cacert " + shlex.quote(stage + "/development-ca.crt") + " -o /dev/null -w '%{http_code} %{ssl_verify_result} %{remote_ip}' https://10.90.88.1" + route
                    code, output = ops.run(client, command, seconds=10)
                    results.append({"role": role, "test": "ACTUAL_PRIVATE_CLOUD_TLS:" + route, "status": "PASS" if code == 0 and output.strip() == expected + " 0 10.90.88.1" else "NOT VERIFIED", "exitCode": code, "expectedHttp": expected})
                command = "timeout 8s curl --silent --show-error --connect-timeout 3 --max-time 6 --cacert " + shlex.quote(stage + "/development-ca.crt") + " https://10.90.88.1/api/security/proof-policy"
                code, output = ops.run(client, command, seconds=10)
                policy = json.loads(output) if code == 0 else {}
                results.append({"role": role, "test": "ACTUAL_CLOUD_PERSISTENT_DPOP_POLICY", "status": "PASS" if code == 0 and policy.get("required") is True and policy.get("replayScope") == "SHARED_POSTGRES" else "NOT VERIFIED"})
                code, output = ops.run(client, "sudo -S -p '' timeout 10s docker version --format '{{.Server.Version}}'", credential=credential, seconds=15)
                results.append({"role": role, "test": "ACTUAL_VM_DOCKER_ENGINE", "status": "PASS" if code == 0 and output.strip().startswith("29.") else "NOT VERIFIED", "exitCode": code})
            except Exception as error:
                results.append({"role": role, "test": "VM_CLIENT_GATE", "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
            finally:
                if client.get_transport() and client.get_transport().is_active():
                    code, _ = ops.run(client, "timeout 5s bash -c " + shlex.quote("if test -d " + shlex.quote(stage) + "; then rm -f -- " + shlex.quote(stage + "/development-ca.crt") + "; rmdir -- " + shlex.quote(stage) + "; fi"), seconds=10)
                    results.append({"role": role, "test": "OWNED_PUBLIC_CA_STAGE_CLEANUP", "status": "PASS" if code == 0 else "FAIL"})
                client.close()
    finally:
        trust.close()
        credential = None
    result = {"scope": "ACTUAL_A_B_TO_AZURE_METADATA_TLS_ONLY", "review": "DRAFT / UNASSIGNED", "checks": results, "status": "PASS" if results and all(item["status"] == "PASS" for item in results) else "NOT VERIFIED", "viewerE2E": "NOT VERIFIED", "keyVaultCrypto": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
