"""Approved narrow A/B/cloud overlay; only public peer keys cross machines."""
import getpass
import importlib.util
import ipaddress
import json
import os
import pathlib
import re
import shlex
import sys
import time
from datetime import datetime, timezone

import paramiko

# Hyphenated module is loaded explicitly; it is a library here, not its CLI.
ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("workstation_ops", ROOT / "scripts/workstation-automatic-ops.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def exact_drop_counter(output):
    values = []
    for line in output.splitlines():
        fields = line.split()
        if (len(fields) >= 10 and fields[0].isdigit() and fields[2] == "DROP"
                and fields[3] in ["tcp", "6"] and fields[5] == "hp-capstone"
                and fields[7] in ["10.90.88.3", "10.90.88.3/32"]
                and fields[8] in ["10.90.88.2", "10.90.88.2/32"]
                and "dpt:8042" in fields):
            values.append(int(fields[0]))
    if len(values) != 1:
        raise RuntimeError("EXACT_DROP_COUNTER_UNAVAILABLE")
    return values[0]


def preflight(client, role, credential):
    code, output = ops.run(client, "timeout 5s ip -j -4 route show", seconds=10)
    if code:
        raise RuntimeError("ROUTE_INVENTORY_FAILED")
    for route in json.loads(output):
        destination = route.get("dst", "default")
        if destination == "default":
            continue
        subnet = ipaddress.ip_network(destination, strict=False)
        if subnet.overlaps(ipaddress.ip_network("10.90.88.0/24")):
            raise RuntimeError("OVERLAY_ROUTE_COLLISION")
        if role != "C" and subnet.overlaps(ipaddress.ip_network("10.89.1.4/32")):
            raise RuntimeError("PRIVATE_ENDPOINT_ROUTE_COLLISION")
    sudo = "sudo -n " if role == "C" else "sudo -S -p '' "
    code, output = ops.run(client, sudo + "timeout 5s sh -c 'test ! -e /etc/wireguard/hp-capstone.conf && ! ip link show hp-capstone >/dev/null 2>&1'", credential=credential, seconds=10)
    if code:
        raise RuntimeError("EXISTING_OVERLAY_PRESERVED_USE_VERIFY")


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else "verify"
    if mode not in ["configure", "verify"]:
        raise RuntimeError("MODE_INVALID")
    emit({"credentialInput": "READY", "storage": "MEMORY_ONLY", "mode": mode})
    credential = getpass.getpass("") if sys.stdin.isatty() else sys.stdin.readline().rstrip("\r\n")
    if not credential or len(credential) > 1024:
        raise RuntimeError("CREDENTIAL_INVALID")
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("overlay-" + stamp)
    directory.mkdir(parents=True, exist_ok=False)
    trust = ops.LocalVmTrust()
    clients = {}
    stages = {}
    keys = {}
    results = []
    try:
        for role, (address, mac, _) in ops.ROLES.items():
            key = trust.key(role, credential, directory / (role + "-host-public.pub"))
            client = paramiko.SSHClient()
            client.get_host_keys().add(address, "ssh-ed25519", key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            clients[role] = client
            code, _ = ops.run(client, "test $(cat /sys/class/net/ens33/address) = " + mac + " && test $(id -un) = server", seconds=10)
            if code:
                raise RuntimeError("GUEST_ROLE_MISMATCH")
        client = paramiko.SSHClient()
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        clients["C"] = client
        code, _ = ops.run(client, "test $(hostname) = highpass-cloud && test $(id -un) = highpassadmin", seconds=10)
        if code:
            raise RuntimeError("CLOUD_ROLE_MISMATCH")
        if mode == "configure":
            for role, client in clients.items():
                preflight(client, role, credential if role != "C" else None)
            for role, client in clients.items():
                stage = ("/home/highpassadmin" if role == "C" else "/home/server") + "/.highpass-overlay-" + stamp
                sftp = client.open_sftp()
                sftp.get_channel().settimeout(15)
                try:
                    sftp.mkdir(stage, mode=0o700)
                    for local, target in [("capstone-overlay-setup.sh", "setup.sh"), ("capstone-overlay-firewall.sh", "firewall.sh")]:
                        with sftp.open(stage + "/" + target, "w") as stream:
                            stream.write((ROOT / "scripts" / local).read_text(encoding="utf8").replace("\r\n", "\n"))
                        sftp.chmod(stage + "/" + target, 0o600)
                finally:
                    sftp.close()
                stages[role] = stage
                sudo = "sudo -n " if role == "C" else "sudo -S -p '' "
                emit({"role": role, "stage": "PREPARE_RUNNING"})
                code, output = ops.run(client, sudo + "timeout 400s bash " + shlex.quote(stage + "/setup.sh") + " prepare " + role, credential=credential if role != "C" else None, seconds=410)
                matches = re.findall(r"^PUBLIC_KEY=([A-Za-z0-9+/]{43}=)$", output, re.MULTILINE)
                if code or len(matches) != 1 or "PREPARE=PASS" not in output:
                    raise RuntimeError("OVERLAY_PREPARE_FAILED_" + role)
                keys[role] = matches[0]
                emit({"role": role, "prepare": "PASS", "privateKey": "REMAINS_ON_OWN_HOST"})
            if len(set(keys.values())) != 3:
                raise RuntimeError("OVERLAY_KEYS_NOT_DISTINCT")
            for role in ["C", "A", "B"]:
                sudo = "sudo -n " if role == "C" else "sudo -S -p '' "
                command = sudo + "timeout 65s bash " + shlex.quote(stages[role] + "/setup.sh") + " configure " + role + " " + " ".join(shlex.quote(keys[key]) for key in ["C", "A", "B"])
                code, output = ops.run(clients[role], command, credential=credential if role != "C" else None, seconds=70)
                if code or "OVERLAY_CONFIGURE=PASS" not in output:
                    raise RuntimeError("OVERLAY_CONFIGURE_FAILED_" + role)
                emit({"role": role, "configure": "PASS"})
        for role in ["A", "B"]:
            code, output = ops.run(clients[role], "timeout 8s ping -c 2 -W 2 10.90.88.1", seconds=10)
            results.append({"role": role, "test": "PRIVATE_CLOUD_OVERLAY_PING", "status": "PASS" if code == 0 else "NOT VERIFIED", "exitCode": code})
            # Explicit private resolution, not disabled hostname/TLS verification.
            command = "timeout 12s curl --silent --show-error --connect-timeout 3 --max-time 10 --resolve kv-hp-demo-4869edd9.vault.azure.net:443:10.89.1.4 --output /dev/null --write-out 'VAULT=%{http_code},%{remote_ip},%{ssl_verify_result}' 'https://kv-hp-demo-4869edd9.vault.azure.net/keys?api-version=7.4'"
            code, output = ops.run(clients[role], command, seconds=15)
            results.append({"role": role, "test": "PRIVATE_KEYVAULT_TLS_UNAUTHENTICATED", "status": "PASS" if code == 0 and output.strip() == "VAULT=401,10.89.1.4,0" else "NOT VERIFIED", "exitCode": code, "proof": output[:1024]})
        code, output = ops.run(clients["C"], "sudo -n timeout 5s wg show hp-capstone latest-handshakes", seconds=10)
        handshakes = [int(line.split()[1]) for line in output.splitlines() if len(line.split()) == 2 and line.split()[1].isdigit()]
        now = int(time.time())
        results.append({"role": "C", "test": "TWO_AUTHENTICATED_PEER_HANDSHAKES", "status": "PASS" if code == 0 and len(handshakes) == 2 and all(0 <= now - stamp < 180 for stamp in handshakes) else "NOT VERIFIED", "proof": output})
        # An observation timeout alone is not DENY. Require packet counter proof
        # from an exact source/destination/port DROP rule in our own cloud chain.
        rule = "-i hp-capstone -s 10.90.88.3/32 -d 10.90.88.2/32 -p tcp --dport 8042 -j DROP"
        command = "sudo -n timeout 10s bash -c " + shlex.quote("set -eu; test $(hostname) = highpass-cloud; iptables -w 3 -C HP-CAP-WG-F " + rule + " || iptables -w 3 -I HP-CAP-WG-F 2 " + rule)
        code, _ = ops.run(clients["C"], command, seconds=15)
        if code:
            raise RuntimeError("EXACT_OVERLAY_DENIAL_RULE_UNAVAILABLE")
        counter_command = "sudo -n timeout 5s iptables -w 3 -nvxL HP-CAP-WG-F"
        def counter():
            code, output = ops.run(clients["C"], counter_command, seconds=10)
            if code:
                raise RuntimeError("EXACT_DROP_COUNTER_UNAVAILABLE")
            return exact_drop_counter(output)
        before = counter()
        probe = 'import socket\ns=socket.socket();s.settimeout(3)\ntry:\n s.connect(("10.90.88.2",8042));print("RAW=REACHABLE")\nexcept TimeoutError:\n print("RAW=TIMEOUT")\nexcept OSError as e:\n print("RAW=NETWORK_ERROR",type(e).__name__,e.errno)\nfinally:\n s.close()'
        code, output = ops.run(clients["B"], "timeout 5s python3 -c " + shlex.quote(probe), seconds=10)
        after = counter()
        results.append({"role": "B", "test": "RAW_ORTHANC_OVERLAY_PACKET_DROP", "status": "PASS" if code == 0 and output.strip() == "RAW=TIMEOUT" and after > before else "FAIL" if output.strip() == "RAW=REACHABLE" else "NOT VERIFIED", "proof": {"socket": output.strip(), "exactDropPacketsBefore": before, "exactDropPacketsAfter": after}})
    except Exception as error:
        results.append({"status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        for client in clients.values():
            client.close()
        trust.close()
        credential = None
    result = {"review": "DRAFT / UNASSIGNED", "scope": "PRIVATE_OVERLAY_AND_KEYVAULT_TLS_ONLY", "checks": results,
              "status": "PASS" if results and all(item["status"] == "PASS" for item in results) else "NOT VERIFIED",
              "keyOperations": "NOT VERIFIED", "distributedMvp": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
