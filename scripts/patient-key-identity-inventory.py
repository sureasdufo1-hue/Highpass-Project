"""Read-only A/B inventory and real Entra assertion; no exported private material."""
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
    directory = ROOT / "artifacts/workstation" / ("patient-key-inventory-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = None
    checks = []
    registry = json.loads((ROOT / "infra/azure/capstone-key-identities.json").read_text(encoding="utf8"))
    try:
        trust = ops.LocalVmTrust()
        for role in ["A", "B"]:
            address, mac, _ = ops.ROLES[role]
            public = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            client.get_host_keys().add(address, public.get_name(), public)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            try:
                client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False,
                               timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
                code, _ = ops.run(client, "test $(id -un) = server && test $(cat /sys/class/net/ens33/address) = " + mac, seconds=10)
                if code:
                    raise RuntimeError("VM_ROLE_MISMATCH")
                container = "hp-capstone-a-gateway-gateway-1" if role == "A" else "hp-capstone-b-portal-portal-1"
                command = "sudo -S -p '' timeout 10s docker inspect " + container + " --format '{{.Image}} {{.State.Running}} {{.State.Health.Status}}'"
                code, state = ops.run(client, command, credential=credential, seconds=15)
                if code or len(state.strip().split()) != 3:
                    raise RuntimeError("RUNTIME_INVENTORY_FAILED")
                checks.append({"test": role + "_PINNED_HOST_RUNTIME", "status": "PASS", "runtime": state.strip()})
                code, time_state = ops.run(client, "timeout 8s sh -c 'timedatectl show -p NTP -p NTPSynchronized; vmware-toolbox-cmd timesync status'", seconds=10)
                checks[-1]["clockSynchronization"] = time_state.strip()
                probe = (ROOT / "scripts/capstone-key-identity-probe.py").read_text(encoding="utf8")
                code, output = ops.run(client, "sudo -S -p '' timeout 35s python3 -c " + shlex.quote(probe), credential=credential, seconds=40)
                result = json.loads(output)
                bound = result.get("tenant") == registry["tenantId"] and result.get("clientId") == registry["identities"][role]["clientId"]
                checks.append({"test": role + "_ACTUAL_ENTRA_CERTIFICATE_AUTH", "status": "PASS" if code == 0 and result.get("status") == "PASS" and bound else "NOT VERIFIED",
                               "identityBound": bound, "http": result.get("http"), "reason": result.get("reason")})
            finally:
                client.close()
    except Exception as error:
        checks.append({"test": "PATIENT_KEY_IDENTITY_INVENTORY", "status": "NOT VERIFIED", "reason": type(error).__name__})
    finally:
        if trust:
            trust.close()
        credential = None
    result = {"review": "DRAFT / UNASSIGNED", "scope": "read-only runtime and real Entra auth only; not patient Key Vault wrap/unwrap or Viewer",
              "checks": checks, "status": "PASS" if len(checks) == 4 and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
