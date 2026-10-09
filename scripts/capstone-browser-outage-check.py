"""Owned B-container egress faults with exact-rule rollback and timed watchdog."""
import getpass
import importlib.util
import ipaddress
import json
import os
import pathlib
import shlex
import subprocess
import threading
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
APP = inventory.APPS["B"]
TARGETS = {"B_VAULT_CONNECTION": "10.89.1.4", "B_CONTROL_CONNECTION": "10.90.88.1"}


def exact_rule(source, target, comment):
    ipaddress.IPv4Address(source)
    if target not in TARGETS.values() or not comment.startswith("hp-cap-outage-") or not comment.replace("-", "").isalnum():
        raise RuntimeError("FAULT_TARGET_INVALID")
    return "DOCKER-USER -s " + source + "/32 -d " + target + "/32 -p tcp --dport 443 -m comment --comment " + comment + " -j REJECT --reject-with tcp-reset"


def main():
    directory = ROOT / "artifacts/workstation" / ("browser-outage-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust, client, process = None, None, None
    active = None
    checks, chunks = [], bytearray()
    phase = "PINNED_B_BASELINE"
    began = time.monotonic()

    def run(command):
        code, output = inventory.ops.run(client, "sudo -S -p '' timeout 15s bash -c " + shlex.quote("set -eu; " + command), credential=credential, seconds=20)
        if code:
            raise RuntimeError("BOUNDED_FAULT_OPERATION_FAILED")
        return output.strip()

    def remove(rule):
        run("if iptables -w 3 -C " + rule + "; then iptables -w 3 -D " + rule + "; fi; if iptables -w 3 -C " + rule + "; then exit 4; fi")

    def journal():
        (directory / "state.json").write_text(json.dumps({"review": "DRAFT / UNASSIGNED", "phase": phase,
                                                       "activeOwnedRule": active, "checks": checks}, indent=2), encoding="utf8")

    try:
        trust = inventory.ops.LocalVmTrust()
        key = trust.key("B", credential, directory / "B-public-host.key")
        client = paramiko.SSHClient()
        address, mac, _ = inventory.ops.ROLES["B"]
        client.get_host_keys().add(address, key.get_name(), key)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False,
                       timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        run("test $(cat /sys/class/net/ens33/address) = " + mac + "; systemctl is-active --quiet docker; systemctl is-active --quiet wg-quick@hp-capstone")
        before = inventory.parse_inventory(run(inventory.INSPECT))
        if len(before) != 1 or before[0]["name"] != APP or before[0]["imageId"] != inventory.IMAGE or before[0]["health"] != "healthy":
            raise RuntimeError("B_EXACT_OWNED_HEALTHY_CONTAINER_REQUIRED")
        addresses = json.loads(run("docker inspect " + APP + " --format '{{json .NetworkSettings.Networks}}'"))
        if len(addresses) != 1:
            raise RuntimeError("SINGLE_CONTAINER_NETWORK_REQUIRED")
        source = next(iter(addresses.values()))["IPAddress"]
        if not ipaddress.IPv4Address(source).is_private:
            raise RuntimeError("PRIVATE_CONTAINER_IP_REQUIRED")
        run("iptables -w 3 -S DOCKER-USER >/dev/null")
        checks.append({"test": phase, "status": "PASS"})
        env = dict(os.environ, HIPASS_BROWSER_OUTAGE_DIR=str(directory))
        process = subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                                    "scripts/run-browser-authorization-trace.ps1", "-Port", "9231", "-BrowserUrl",
                                    "https://192.168.111.149:9443/hipass/", "-Capstone", "-NegativeBoundary"],
                                   cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        def drain(stream, keep):
            while True:
                chunk = stream.read(4096)
                if not chunk:
                    return
                if keep and len(chunks) + len(chunk) <= 2 * 1024 * 1024:
                    chunks.extend(chunk)

        readers = [threading.Thread(target=drain, args=(process.stdout, True), daemon=True),
                   threading.Thread(target=drain, args=(process.stderr, False), daemon=True)]
        for reader in readers:
            reader.start()
        completed = set()
        end = time.monotonic() + 405
        while time.monotonic() < end and process.poll() is None:
            marker = directory / "browser-phase.json"
            label = ""
            if marker.exists():
                try:
                    label = json.loads(marker.read_text(encoding="utf8")).get("phase", "")
                except ValueError:
                    pass
            for name, target in TARGETS.items():
                if label == name + "_READY" and name not in completed and active is None:
                    phase = name + "_INJECTION"
                    comment = "hp-cap-outage-" + name.lower().replace("_", "-") + "-" + str(time.time_ns())
                    rule = exact_rule(source, target, comment)
                    # Watchdog registered BEFORE mutation; removes only this exact rule
                    # if this local verifier dies. It does not change persistent policy.
                    cleanup = "if iptables -w 3 -C " + rule + "; then iptables -w 3 -D " + rule + "; fi"
                    run("systemd-run --quiet --unit=" + comment + " --on-active=150s /bin/bash -c " + shlex.quote(cleanup))
                    active = {"name": name, "rule": rule, "comment": comment}
                    journal()
                    run("iptables -w 3 -I " + rule + "; iptables -w 3 -C " + rule)
                    (directory / (name + "_INJECTED")).write_text("INJECTED", encoding="ascii")
                    inventory.ops.emit({"phase": phase, "status": "RUNNING", "scope": "ONE_B_CONTAINER_ONE_DESTINATION_443"})
                elif label == name + "_RESTORE" and active and active["name"] == name:
                    lines = run("iptables -w 3 -L DOCKER-USER -n -v -x").splitlines()
                    matched = [line.split()[0] for line in lines if active["comment"] in line]
                    packets = int(matched[0]) if len(matched) == 1 and matched[0].isdigit() else 0
                    remove(active["rule"])
                    active = None
                    completed.add(name)
                    checks.append({"test": name + "_OBSERVED_RULE_AND_EXACT_CLEANUP", "status": "PASS" if packets > 0 else "FAIL", "blockedPacketCount": packets})
                    journal()
                    (directory / (name + "_RESTORED")).write_text("RESTORED", encoding="ascii")
            if label == "ABORT_RESTORE" and active:
                remove(active["rule"])
                active = None
                journal()
            time.sleep(0.2)
        if process.poll() is None:
            raise RuntimeError("BROWSER_OUTAGE_OUTER_DEADLINE")
        for reader in readers:
            reader.join(timeout=5)
        raw = chunks.decode("utf8", errors="replace")
        offset = raw.find('{"generatedAt"')
        if offset < 0:
            raise RuntimeError("BROWSER_RESULT_NOT_STRUCTURED")
        browser, _ = json.JSONDecoder().raw_decode(raw[offset:])
        gate = browser.get("connectionOutage", {})
        if process.returncode or browser.get("result") != "PASS" or gate.get("result") != "PASS":
            raise RuntimeError("ACTUAL_BROWSER_OUTAGE_NOT_PASS")
        checks.append({"test": "ACTUAL_BROWSER_CONNECTION_FAILURE_AND_RECOVERY", "status": "PASS", "checks": gate["checks"],
                       "evidence": browser.get("evidence"), "revocationAcknowledged": browser.get("revocationAcknowledged")})
        after = inventory.parse_inventory(run(inventory.INSPECT))
        if before != after:
            raise RuntimeError("B_CONTAINER_IMAGE_MOUNTS_OR_HEALTH_CHANGED")
        checks.append({"test": "B_RUNTIME_UNCHANGED", "status": "PASS"})
        phase = "FRESH_BROWSER_POST_FAULT_RECOVERY"
        checks.append({"test": phase, **recovery.browser_gate()})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        if active:
            try:
                remove(active["rule"])
                active = None
            except Exception:
                checks.append({"test": "OWNED_RULE_RESTORATION", "status": "NOT VERIFIED", "reason": "WATCHDOG_REGISTERED_RECHECK_REQUIRED"})
        if process and process.poll() is None:
            # Allow browser's bounded deadline + PowerShell finally to clean its own
            # Chrome before terminating the owned wrapper. No global taskkill.
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.terminate()
        if client:
            client.close()
        if trust:
            trust.close()
        credential = None
        journal()
    passed = len(checks) == 6 and active is None and all(row["status"] == "PASS" for row in checks)
    result = {"scope": "B_PORTAL_EGRESS_VAULT_CONTROL_CONNECTION_FAULTS_NOT_GLOBAL_PROVIDER_OUTAGE",
              "review": "DRAFT / UNASSIGNED", "checks": checks, "activeRuleRemaining": active is not None,
              "elapsedSeconds": round(time.monotonic() - began, 3), "status": "PASS" if passed else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    inventory.ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
