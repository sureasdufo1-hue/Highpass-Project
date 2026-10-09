"""Ephemeral VM-local patient crypto + isolated local SQL; no live service promotion."""
import getpass
import argparse
import hashlib
import hmac
import importlib.util
import io
import ipaddress
import json
import os
import pathlib
import secrets
import select
import shlex
import socket
import subprocess
import tarfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
ops = gateway.base.ops
LIMIT = 16 * 1024 * 1024

def receive(channel, seconds=30):
    result = bytearray()
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if channel.recv_ready():
            part = channel.recv(65536)
            if not part:
                break
            result.extend(part)
            if len(result) > LIMIT:
                raise RuntimeError("WORKER_RESPONSE_LIMIT")
            if result.endswith(b"\n"):
                return json.loads(result)
        elif channel.exit_status_ready():
            break
        time.sleep(0.01)
    raise RuntimeError("WORKER_RESPONSE_DEADLINE")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phantom", choices=["CT", "MR"])
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--full-app", action="store_true")
    args = parser.parse_args()
    if args.browser and not args.phantom:
        parser.error("--browser requires --phantom CT or MR")
    if args.full_app and (not args.browser or not args.phantom):
        parser.error("--full-app requires --browser and --phantom CT or MR")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = secrets.token_hex(6)
    directory = ROOT / "artifacts/workstation" / ("patient-vault-" + stamp + "-" + run_id)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    registry = json.loads((ROOT / "infra/azure/capstone-key-identities.json").read_text(encoding="utf8"))
    trust = None
    clients, stages, workers, locks, remote_ports, container_names, baselines = {}, {}, {}, {}, {}, {}, {}
    control_target = [None]
    bridge_key = secrets.token_hex(32)
    server = None
    child = None
    checks = []
    operations = []
    summary = None
    sources = list(sorted((ROOT / "src").glob("*.js"))) + [ROOT / "scripts/patient-vault-worker.js"]
    hashes = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    source_digest = hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    archive_buffer = io.BytesIO()
    with tarfile.open(fileobj=archive_buffer, mode="w:gz") as archive:
        for source in sources:
            info = tarfile.TarInfo(str(source.relative_to(ROOT)).replace("\\", "/"))
            material = source.read_bytes()
            info.size, info.mode = len(material), 0o444
            archive.addfile(info, io.BytesIO(material))

    def forward(channel, _origin, _server):
        def relay():
            connection = None
            try:
                if control_target[0] is None:
                    return
                connection = socket.create_connection(("127.0.0.1", control_target[0]), timeout=5)
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    ready, _, _ = select.select([channel, connection], [], [], 1)
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        (connection if source is channel else channel).sendall(data)
            finally:
                if connection:
                    connection.close()
                channel.close()
        threading.Thread(target=relay, daemon=True).start()

    class Bridge(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_POST(self):
            self.connection.settimeout(30)
            try:
                if not hmac.compare_digest(self.headers.get("x-probe-key", ""), bridge_key) or self.path not in ["/seal", "/open", "/stats", "/metadata"]:
                    self.send_error(403)
                    return
                size = int(self.headers.get("content-length", "0"))
                if not 0 < size <= LIMIT:
                    raise RuntimeError("BRIDGE_INPUT_LIMIT")
                payload = json.loads(self.rfile.read(size))
                target = payload["controlPort"]
                if type(target) is not int or not 1024 <= target <= 65535:
                    raise RuntimeError("CONTROL_PORT_INVALID")
                if control_target[0] is not None and control_target[0] != target:
                    raise RuntimeError("CONTROL_PORT_CHANGED")
                control_target[0] = target
                role = "B" if self.path == "/open" else "A"
                with locks[role]:
                    workers[role].sendall((json.dumps({"operation": self.path[1:], "controlPort": remote_ports[role],
                        "serviceKey": payload["serviceKey"], "params": payload["params"]}) + "\n").encode())
                    result = receive(workers[role])
                    operations.append({"role": role, "operation": self.path[1:], "ok": result.get("ok"),
                                       "reason": result.get("reason"), "controlResults": result.get("controlResults", []), "scopeChecks": result.get("scopeChecks")})
                    operations[-1]["pacsEvidence"] = result.get("pacsEvidence")
                    operations[-1]["pacsReads"] = result.get("pacsReads")
                body = json.dumps(result).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                body = b'{"ok":false,"reason":"VM_BRIDGE_FAILURE"}'
                try:
                    self.send_response(503)
                    self.send_header("content-length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except OSError:
                    pass

    try:
        trust = ops.LocalVmTrust()
        for role in ["A", "B"]:
            address, mac, _ = ops.ROLES[role]
            public = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            clients[role] = client
            client.get_host_keys().add(address, public.get_name(), public)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False,
                           timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            code, _ = ops.run(client, "test $(cat /sys/class/net/ens33/address) = " + mac, seconds=10)
            if code:
                raise RuntimeError("VM_ROLE_MISMATCH")
            current = "hp-capstone-a-gateway-gateway-1" if role == "A" else "hp-capstone-b-portal-portal-1"
            code, image = ops.run(client, "sudo -S -p '' timeout 10s docker inspect " + current + " --format '{{.Image}}'", credential=credential, seconds=15)
            image = image.strip()
            if code or not image.startswith("sha256:") or len(image) != 71:
                raise RuntimeError("RUNTIME_IMAGE_UNAVAILABLE")
            baselines[role] = (current, image)
            stage = "/opt/highpass/patient-vault-probe-" + run_id
            stages[role] = stage
            code, _ = ops.run(client, "sudo -S -p '' timeout 10s sh -c " + shlex.quote("test ! -e " + stage + "; install -d -m 755 " + stage), credential=credential, seconds=15)
            if code:
                raise RuntimeError("OWNED_STAGE_REQUIRED")
            with gateway.root_sftp(client, credential) as sftp:
                with sftp.open(stage + "/source.tgz", "wx") as stream:
                    stream.write(archive_buffer.getvalue())
            code, _ = ops.run(client, "sudo -S -p '' timeout 15s tar -xzf " + stage + "/source.tgz -C " + stage, credential=credential, seconds=20)
            if code:
                raise RuntimeError("SOURCE_STAGE_FAILED")
            remote_ports[role] = client.get_transport().request_port_forward("127.0.0.1", 0, handler=forward)
            name = "hp-patient-vault-" + role.lower() + "-" + run_id
            container_names[role] = name
            command = "sudo -S -p '' timeout 180s docker run --rm -i --name " + name + " --read-only --cap-drop ALL --security-opt no-new-privileges --network host"
            command += " --add-host " + registry["vaultHost"] + ":" + registry["privateEndpoint"]
            command += " -v /opt/highpass/capstone-key-identity:/run/key-identity:ro -v " + stage + "/src:/app/src:ro -v " + stage + "/scripts:/app/scripts:ro"
            if role == "A" and args.phantom:
                proxy = "hp-capstone-hospital-a-orthanc-mtls-1"
                expression = '{{(index .NetworkSettings.Networks "hp-capstone-hospital-a_pacs_private").IPAddress}}'
                code, pacs_ip = ops.run(client, "sudo -S -p '' timeout 10s docker inspect " + proxy + " --format " + shlex.quote(expression), credential=credential, seconds=15)
                pacs_ip = pacs_ip.strip()
                if code or not ipaddress.ip_address(pacs_ip).is_private:
                    raise RuntimeError("PRIVATE_PACS_PROXY_REQUIRED")
                command += " -e HIPASS_PROBE_PACS_ORIGIN=https://" + pacs_ip + ":8443"
                for certificate in ["ca.crt", "gateway-client.crt", "gateway-client.key"]:
                    command += " -v /opt/highpass/capstone-a-gateway-secrets/" + certificate + ":/run/pacs/" + certificate + ":ro"
            command += " --entrypoint /nodejs/bin/node " + image + " /app/scripts/patient-vault-worker.js " + role + " " + registry["keyId"]
            channel = client.get_transport().open_session(timeout=10)
            channel.settimeout(30)
            channel.exec_command(command)
            channel.sendall((credential + "\n").encode())
            workers[role], locks[role] = channel, threading.Lock()
            ready = receive(channel)
            if ready.get("role") != role or ready.get("clientId") != registry["identities"][role]["clientId"] or ready.get("tenantId") != registry["tenantId"]:
                raise RuntimeError("WORKER_IDENTITY_MISMATCH")
            if any(hashes.get(p) != value for p, value in ready.get("hashes", {}).items()) or len(ready.get("hashes", {})) != 3:
                raise RuntimeError("WORKER_SOURCE_MISMATCH")
            if ready.get("sourceDigest") != source_digest or ready.get("sourceFiles") != len(hashes):
                raise RuntimeError("FULL_WORKER_SOURCE_MISMATCH")
            checks.append({"test": role + "_VM_LOCAL_WORKER_SOURCE_AND_IDENTITY", "status": "PASS", "image": image, "hashes": ready["hashes"],
                           "sourceDigest": source_digest, "sourceFiles": len(hashes), "observedClockDeltaMs": ready.get("nowMs", 0) - int(time.time() * 1000)})
        server = ThreadingHTTPServer(("127.0.0.1", 0), Bridge)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        child = subprocess.Popen(["node", "scripts/verify-patient-full-app.js" if args.full_app else "scripts/verify-patient-self-view-postgres.js"], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**os.environ, "HIPASS_PATIENT_PROBE_BRIDGE": "http://127.0.0.1:" + str(server.server_port),
                 "HIPASS_PATIENT_PROBE_SECRET": bridge_key, "HIPASS_PATIENT_PROBE_KEY_ID": registry["keyId"], "HIPASS_PATIENT_PROBE_PHANTOM": args.phantom or "", "HIPASS_PATIENT_PROBE_BROWSER": "1" if args.browser else "0"})
        # Nonsecret fixed synthetic profile. Original no-argument one-pixel gate stays available.
        stdout, _stderr = child.communicate(timeout=240 if args.browser else 150)
        summary = json.loads(stdout)
        checks.append({"test": "ISOLATED_SQL_ACTUAL_VM_PATIENT_VAULT_FLOW", "status": "PASS" if child.returncode == 0 and summary.get("status") == "PASS" else "FAIL"})
    except Exception as error:
        checks.append({"test": "PATIENT_VM_VAULT_INTEGRATION", "status": "NOT VERIFIED", "reason": type(error).__name__})
        if child and child.poll() is None:
            child.kill()
            child.communicate(timeout=10)
    finally:
        if server:
            server.shutdown()
            server.server_close()
        for role, client in clients.items():
            if role in workers:
                workers[role].close()
            if role in remote_ports:
                client.get_transport().cancel_port_forward("127.0.0.1", remote_ports[role])
            name, stage = container_names.get(role), stages.get(role)
            try:
                if name:
                    ops.run(client, "sudo -S -p '' timeout 10s docker rm -f " + name, credential=credential, seconds=15)
                if stage:
                    assert pathlib.PurePosixPath(stage).parent == pathlib.PurePosixPath("/opt/highpass") and stage.endswith(run_id)
                    files = [stage + "/" + p for p in hashes] + [stage + "/source.tgz"]
                    cleanup = "rm -f -- " + " ".join(shlex.quote(p) for p in files) + "; rmdir -- " + stage + "/src " + stage + "/scripts " + stage
                    code, _ = ops.run(client, "sudo -S -p '' timeout 15s sh -c " + shlex.quote(cleanup), credential=credential, seconds=20)
                    checks.append({"test": role + "_OWNED_SOURCE_STAGE_CLEANUP", "status": "PASS" if code == 0 else "FAIL"})
            except Exception:
                checks.append({"test": role + "_OWNED_STAGE_CLEANUP", "status": "NOT VERIFIED"})
            if role in baselines:
                current, expected = baselines[role]
                try:
                    code, state = ops.run(client, "sudo -S -p '' timeout 10s docker inspect " + current + " --format '{{.Image}} {{.State.Running}} {{.State.Health.Status}}'", credential=credential, seconds=15)
                    checks.append({"test": role + "_ORIGINAL_RUNTIME_PRESERVED", "status": "PASS" if code == 0 and state.strip() == expected + " true healthy" else "FAIL"})
                except Exception:
                    checks.append({"test": role + "_ORIGINAL_RUNTIME_PRESERVED", "status": "NOT VERIFIED"})
            client.close()
        if trust:
            trust.close()
        credential = None
    result = {"review": "DRAFT / UNASSIGNED", "scope": "VM-local actual Azure patient crypto with isolated SQL; " + ("actual A synthetic PACS " + args.phantom if args.phantom else "one-pixel fixture") + ("; actual Chrome common Viewer via trusted local HTTPS" if args.browser else "; not browser") + "; not full app/login/public edge deployment",
              "checks": checks, "operations": operations, "integration": summary,
              "status": "FAIL" if any(c["status"] == "FAIL" for c in checks) else "PASS" if len(checks) == 7 and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    ops.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
