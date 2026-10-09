"""Sequential guest reboot gate; never power off VMs, rebuild apps or delete data."""
import getpass
import importlib.util
import json
import os
import pathlib
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("autostart", ROOT / "scripts/capstone-vm-autostart-check.py")
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
spec = importlib.util.spec_from_file_location("recovery", ROOT / "scripts/capstone-a-rollback-check.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


def unchanged(before, after):
    def identities(rows):
        return sorted((row["name"], row["containerId"], row["imageId"], row["restart"], row["mountFingerprint"]) for row in rows)
    return identities(before) == identities(after)


def main():
    directory = ROOT / "artifacts/workstation" / ("vm-reboot-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust, cloud = None, None
    clients, checks, requested = {}, [], []
    phase = "PINNED_FLEET_PREFLIGHT"
    started = time.monotonic()

    def journal():
        (directory / "state.json").write_text(json.dumps({"review": "DRAFT / UNASSIGNED", "phase": phase,
                                                       "rebootsRequested": requested, "checks": checks}, indent=2), encoding="utf8")

    def connect(role, key):
        client = paramiko.SSHClient()
        address = inventory.ops.ROLES[role][0]
        client.get_host_keys().add(address, key.get_name(), key)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        try:
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False,
                           timeout=5, banner_timeout=5, auth_timeout=5, channel_timeout=10)
            return client
        except Exception:
            client.close()
            raise

    def run(client, command, sudo=False):
        code, output = inventory.ops.run(client, ("sudo -S -p '' " if sudo else "") +
                                         "timeout 15s bash -c " + shlex.quote("set -eu; " + command),
                                         credential=credential if sudo else None, seconds=20)
        if code:
            raise RuntimeError("BOUNDED_REMOTE_CHECK_FAILED")
        return output.strip()

    def snapshot(role, client):
        mac = inventory.ops.ROLES[role][1]
        run(client, "test $(id -un) = server; test $(cat /sys/class/net/ens33/address) = " + mac +
            "; for unit in docker wg-quick@hp-capstone; do systemctl is-enabled --quiet \"$unit\"; systemctl is-active --quiet \"$unit\"; done")
        if "wg-quick@hp-capstone.service" not in run(client, "systemctl show docker --property=After --value").split():
            raise RuntimeError("OVERLAY_BOOT_ORDER_MISSING")
        rows = inventory.parse_inventory(run(client, inventory.INSPECT, sudo=True))
        if not rows or any(row["project"] not in inventory.OWNED[role] or not row["running"] or
                           row["restart"] not in {"always", "unless-stopped"} or
                           row["health"] not in {"healthy", "NO_HEALTHCHECK"} for row in rows):
            raise RuntimeError("OWNED_HEALTHY_INVENTORY_REQUIRED")
        app = [row for row in rows if row["name"] == inventory.APPS[role]]
        if len(app) != 1 or app[0]["imageId"] != inventory.IMAGE:
            raise RuntimeError("CURRENT_APP_PIN_REQUIRED")
        return {"bootId": run(client, "cat /proc/sys/kernel/random/boot_id"), "containers": rows}

    def cloud_identity():
        code, output = inventory.ops.run(cloud, "sudo -n timeout 12s docker inspect hp-capstone-control-control-1 hp-capstone-control-postgres-1 --format '{{.Id}} {{.Image}} {{.State.Running}} {{.State.Health.Status}}'", seconds=17)
        lines = output.strip().splitlines()
        if code or len(lines) != 2 or not all(line.endswith(" true healthy") for line in lines) or recovery.CLOUD_ID not in lines[0]:
            raise RuntimeError("CLOUD_CURRENT_HEALTH_NOT_VERIFIED")
        return lines

    try:
        trust = inventory.ops.LocalVmTrust()
        keys, before = {}, {}
        for role in ["A", "B"]:
            keys[role] = trust.key(role, credential, directory / (role + "-public-host.key"))
            clients[role] = connect(role, keys[role])
            before[role] = snapshot(role, clients[role])
        cloud = paramiko.SSHClient()
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"),
                      look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        cloud_before = cloud_identity()
        checks.append({"test": phase, "status": "PASS"})
        journal()
        for role in ["A", "B"]:
            phase = role + "_SEQUENTIAL_GUEST_REBOOT"
            # Register the exact request before mutation. Never automatically retry a reboot.
            requested.append({"role": role, "state": "SCHEDULING_ONCE"})
            journal()
            unit = "hp-capstone-reboot-" + role.lower() + "-" + str(time.time_ns())
            run(clients[role], "systemd-run --quiet --unit=" + unit + " --on-active=3s /usr/bin/systemctl reboot", sudo=True)
            requested[-1]["state"] = "SCHEDULED_ONCE"
            journal()
            clients[role].close()
            inventory.ops.emit({"phase": phase, "status": "RUNNING", "deadlineSeconds": 240})
            end = time.monotonic() + 240
            restored = None
            while time.monotonic() < end:
                client = None
                try:
                    client = connect(role, keys[role])
                    candidate = snapshot(role, client)
                    if candidate["bootId"] != before[role]["bootId"]:
                        if not unchanged(before[role]["containers"], candidate["containers"]):
                            raise RuntimeError("PERSISTED_CONTAINER_OR_MOUNTS_CHANGED")
                        restored = candidate
                        clients[role] = client
                        client = None
                        break
                except RuntimeError as error:
                    if str(error) == "PERSISTED_CONTAINER_OR_MOUNTS_CHANGED":
                        raise
                except paramiko.BadHostKeyException:
                    raise RuntimeError("POST_REBOOT_HOST_KEY_CHANGED")
                except Exception:
                    pass
                finally:
                    if client:
                        client.close()
                time.sleep(2)
            if restored is None:
                raise RuntimeError("POST_REBOOT_READINESS_DEADLINE")
            checks.append({"test": phase, "status": "PASS", "bootIdChanged": True,
                           "sameContainersImagesMounts": True, "containers": len(restored["containers"]),
                           "overlayDockerActive": True, "manualComposeStart": False})
            requested[-1]["state"] = "NEW_BOOT_READY"
            journal()
        phase = "POST_REBOOT_ACTUAL_BROWSER"
        journal()
        checks.append({"test": phase, **recovery.browser_gate()})
        phase = "CLOUD_PG_UNCHANGED"
        if cloud_identity() != cloud_before:
            raise RuntimeError("UNRELATED_CLOUD_CHANGED")
        checks.append({"test": phase, "status": "PASS"})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED",
                       "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients.values():
            client.close()
        if cloud:
            cloud.close()
        if trust:
            trust.close()
        credential = None
        journal()
    passed = len(checks) == 5 and all(check["status"] == "PASS" for check in checks)
    result = {"scope": "A_B_SEQUENTIAL_GUEST_REBOOT_AUTO_RECOVERY_NOT_VM_POWER_OFF_CLOUD_REBOOT_OR_DR",
              "review": "DRAFT / UNASSIGNED", "currentHospitalImage": inventory.IMAGE, "checks": checks,
              "rebootsRequested": requested, "elapsedSeconds": round(time.monotonic() - started, 3),
              "status": "PASS" if passed else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    inventory.ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
