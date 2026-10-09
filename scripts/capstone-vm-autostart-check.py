"""Read-only, independently pinned A/B restart-readiness inventory. No reboot."""
import argparse
import getpass
import hashlib
import importlib.util
import json
import pathlib
import shlex
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vm_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
IMAGE = "sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1"
OWNED = {
    "A": {"hp-capstone-a-gateway", "hp-capstone-hospital-a"},
    "B": {"hp-capstone-b-portal", "hp-capstone-hospital-b"},
}
APPS = {"A": "hp-capstone-a-gateway-gateway-1", "B": "hp-capstone-b-portal-portal-1"}
INSPECT = """docker ps -aq | xargs -r docker inspect --format '{{json .Name}}|{{json .Id}}|{{json .Image}}|{{json .HostConfig.RestartPolicy.Name}}|{{json .State.Running}}|{{json .Config.Labels}}|{{json .Mounts}}|{{json .State.Health}}'"""


def parse_inventory(raw):
    rows = []
    for line in raw.splitlines():
        fields = line.split("|")
        if len(fields) != 8:
            raise RuntimeError("FILTERED_INVENTORY_INVALID")
        name, container, image, restart, running, labels, mounts, health = map(json.loads, fields)
        rows.append({"name": name.removeprefix("/"), "containerId": container,
                     "imageId": image, "restart": restart, "running": running,
                     "project": (labels or {}).get("com.docker.compose.project"),
                     "mountFingerprint": hashlib.sha256(json.dumps(mounts, sort_keys=True).encode()).hexdigest(),
                     "health": (health or {}).get("Status", "NO_HEALTHCHECK")})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply-order", action="store_true", help="Install exact owned Docker overlay ordering drop-in, without restarting services")
    args = parser.parse_args()
    directory = ROOT / "artifacts/workstation" / ("vm-autostart-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = None
    clients = []
    checks, inventories = [], {}
    phase = "INDEPENDENT_LOCAL_VM_TRUST"
    try:
        trust = ops.LocalVmTrust()
        for role in ["A", "B"]:
            phase = role + "_READ_ONLY_RESTART_READINESS"
            address, mac, _ = ops.ROLES[role]
            key = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            clients.append(client)
            client.get_host_keys().add(address, key.get_name(), key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False,
                           allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)

            def run(command, sudo=False):
                shell = "timeout 20s bash -c " + shlex.quote("set -eu; " + command)
                code, output = ops.run(client, ("sudo -S -p '' " if sudo else "") + shell,
                                       credential=credential if sudo else None, seconds=25)
                if code:
                    raise RuntimeError("READ_ONLY_COMMAND_FAILED")
                return output.strip()

            run("test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = " + mac)
            units = run("for unit in docker wg-quick@hp-capstone; do systemctl is-enabled \"$unit\"; systemctl is-active \"$unit\"; done")
            if units.splitlines() != ["enabled", "active", "enabled", "active"]:
                raise RuntimeError("BOOT_SERVICE_NOT_ENABLED_ACTIVE")
            rows = parse_inventory(run(INSPECT, sudo=True))
            apps = [row for row in rows if row["name"] == APPS[role]]
            if len(apps) != 1 or apps[0]["imageId"] != IMAGE or apps[0]["health"] != "healthy":
                raise RuntimeError("CURRENT_APP_NOT_HEALTHY_PINNED")
            unowned = [row["name"] for row in rows if row["project"] not in OWNED[role]]
            bad_restart = [row["name"] for row in rows if row["project"] in OWNED[role]
                           and (row["restart"] not in {"always", "unless-stopped"} or not row["running"])]
            if args.apply_order:
                if unowned or bad_restart:
                    raise RuntimeError("MUTATION_BASELINE_NOT_SAFE")
                source = ROOT / "infra/workstation/docker-capstone-overlay.conf"
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                remote = "/home/server/.highpass-docker-order-" + directory.name.removeprefix("vm-autostart-") + ".conf"
                sftp = client.open_sftp()
                sftp.get_channel().settimeout(15)
                try:
                    sftp.put(str(source), remote, confirm=True)
                    sftp.chmod(remote, 0o600)
                finally:
                    sftp.close()
                target = "/etc/systemd/system/docker.service.d/90-highpass-capstone-overlay.conf"
                try:
                    run("test $(sha256sum " + shlex.quote(remote) + " | cut -d' ' -f1) = " + digest +
                        "; if test -e " + target + "; then test ! -L " + target +
                        "; test $(sha256sum " + target + " | cut -d' ' -f1) = " + digest +
                        "; else install -d -m 755 /etc/systemd/system/docker.service.d; install -o root -g root -m 644 " +
                        shlex.quote(remote) + " " + target + "; fi; systemctl daemon-reload", sudo=True)
                finally:
                    # Single exact owned public-config upload, not a recursive removal.
                    run("rm -- " + shlex.quote(remote))
            order = run("systemctl show docker --property=After --value")
            boot_order = "wg-quick@hp-capstone.service" in order.split()
            if args.apply_order and not boot_order:
                raise RuntimeError("LOADED_OVERLAY_ORDER_NOT_VERIFIED")
            inventories[role] = {"containers": rows, "unownedContainers": unowned,
                                 "invalidRestartPolicies": bad_restart,
                                 "dockerExplicitlyAfterOverlay": boot_order,
                                 "bootId": run("cat /proc/sys/kernel/random/boot_id")}
            checks.append({"test": phase, "status": "PASS" if not unowned and not bad_restart else "FAIL",
                           "unitsEnabledActive": True, "unownedContainerCount": len(unowned),
                           "invalidRestartPolicyCount": len(bad_restart),
                           "overlayOrdering": "PASS" if boot_order else "NOT VERIFIED"})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED",
                       "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients:
            client.close()
        if trust:
            trust.close()
        credential = None
    passed = len(checks) == 2 and all(row["status"] == "PASS" for row in checks)
    result = {"scope": "A_B_AUTOSTART_ORDER_PREFLIGHT_NOT_ACTUAL_REBOOT" if args.apply_order else "READ_ONLY_A_B_AUTOSTART_PREFLIGHT_NOT_ACTUAL_REBOOT",
              "review": "DRAFT / UNASSIGNED", "checks": checks, "inventories": inventories,
              "orderDropInRequested": args.apply_order,
              "rebootExecuted": False, "status": "PASS" if passed else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    ops.emit({"scope": result["scope"], "checks": checks, "status": result["status"],
              "evidence": str(directory / "result.json")})
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
