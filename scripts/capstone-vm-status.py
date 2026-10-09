"""Read-only, pinned SSH status check for the two capstone hospital VMs."""
import getpass
import importlib.util
import json
import pathlib
import shlex
import sys
from datetime import datetime, timezone

import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vm_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def main():
    directory = ROOT / "artifacts/workstation" / ("vm-status-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = None
    checks = []
    expected = {
        "A": ["hp-capstone-hospital-a-orthanc-1", "hp-capstone-hospital-a-orthanc-mtls-1", "hp-capstone-a-gateway-gateway-1"],
        "B": ["hp-capstone-b-portal-portal-1"],
    }
    try:
        trust = ops.LocalVmTrust()
        for role in ["A", "B"]:
            client = paramiko.SSHClient()
            try:
                address, mac, _ = ops.ROLES[role]
                key = trust.key(role, credential, directory / (role + "-public-host.key"))
                client.get_host_keys().add(address, key.get_name(), key)
                client.set_missing_host_key_policy(paramiko.RejectPolicy())
                client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
                command = "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac + " && systemctl is-active --quiet docker && systemctl is-active --quiet wg-quick@hp-capstone"
                code, _ = ops.run(client, "timeout 10s bash -c " + shlex.quote(command), seconds=15)
                checks.append({"test": role + "_SSH_ROLE_DOCKER_OVERLAY", "status": "PASS" if code == 0 else "FAIL", "exitCode": code})
                for name in expected[role]:
                    # Inspect only state: never print container environment or secrets.
                    command = "sudo -S -p '' timeout 10s docker inspect " + shlex.quote(name) + " --format '{{json .State}}'"
                    code, output = ops.run(client, command, credential=credential, seconds=15)
                    state = json.loads(output) if code == 0 else {}
                    health = state.get("Health", {}).get("Status", "NO_HEALTHCHECK")
                    good = state.get("Running") is True and health in ["healthy", "NO_HEALTHCHECK"]
                    checks.append({"test": name, "status": "PASS" if good else "FAIL", "running": state.get("Running", False), "health": health, "exitCode": code})
            except Exception as error:
                checks.append({"test": role + "_STATUS", "status": "NOT VERIFIED", "reason": type(error).__name__})
            finally:
                client.close()
    except Exception as error:
        checks.append({"test": "VM_TRUST", "status": "NOT VERIFIED", "reason": type(error).__name__})
    finally:
        if trust:
            trust.close()
        credential = None
    result = {"scope": "READ_ONLY_VM_RUNTIME_STATUS_NOT_APPLICATION_E2E", "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if len(checks) == 6 and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
