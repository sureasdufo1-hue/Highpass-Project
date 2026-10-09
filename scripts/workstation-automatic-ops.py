"""Bounded A/B operations; credentials arrive via concealed stdin, never argv/files.

Use the installed Azure CLI Python (already includes Paramiko). VMware's local
management channel copies PUBLIC SSH keys from each explicitly selected VMX;
RejectPolicy then pins them before any SSH password is sent. No trust-on-first-use.
"""
import base64
import ctypes
import getpass
import hashlib
import json
import logging
import os
import pathlib
import re
import shlex
import sys
import time
from datetime import datetime, timezone

import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
ROLES = {
    "A": ("192.168.111.129", "00:0c:29:25:f6:b4", "server - 복사본"),
    "B": ("192.168.111.149", "00:0c:29:a3:9e:1b", "server - 복사본 - 복사본"),
}
logging.getLogger("paramiko").setLevel(logging.CRITICAL)


def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class LocalVmTrust:
    def __init__(self):
        directory = pathlib.Path("C:/Program Files (x86)/VMware/VMware VIX")
        self.search = os.add_dll_directory(str(directory))
        self.lib = ctypes.CDLL(str(directory / "Vix64AllProductsDyn.dll"))
        specs = {
            "VixHost_Connect": [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p],
            "VixHost_OpenVM": [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p],
            "VixVM_LoginInGuest": [ctypes.c_int, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p],
            "VixVM_CopyFileFromGuestToHost": [ctypes.c_int, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p],
        }
        for name, args in specs.items():
            method = getattr(self.lib, name)
            method.argtypes = args
            method.restype = ctypes.c_int
        for name in ["VixJob_Wait", "VixJob_CheckCompletion"]:
            getattr(self.lib, name).restype = ctypes.c_uint64
        self.lib.VixJob_Wait.argtypes = [ctypes.c_int, ctypes.c_int]
        self.lib.VixJob_CheckCompletion.argtypes = [ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
        self.lib.Vix_ReleaseHandle.argtypes = [ctypes.c_int]
        self.lib.VixHost_Disconnect.argtypes = [ctypes.c_int]
        self.host = self.wait(self.lib.VixHost_Connect(-1, 3, None, 0, None, None, 0, 0, None, None), handle=True)

    def wait(self, job, handle=False):
        deadline = time.monotonic() + 25
        complete = ctypes.c_int()
        try:
            while time.monotonic() < deadline:
                error = self.lib.VixJob_CheckCompletion(job, ctypes.byref(complete))
                if error:
                    raise RuntimeError("VIX_COMPLETION_ERROR_" + str(error))
                if complete.value:
                    value = ctypes.c_int()
                    error = self.lib.VixJob_Wait(job, 3010, ctypes.byref(value), 0) if handle else self.lib.VixJob_Wait(job, 0)
                    if error:
                        raise RuntimeError("VIX_JOB_ERROR_" + str(error))
                    return value.value if handle else None
                time.sleep(0.1)
            raise RuntimeError("VIX_DEADLINE")
        finally:
            self.lib.Vix_ReleaseHandle(job)

    def key(self, role, credential, output):
        vmx = pathlib.Path(os.environ["USERPROFILE"]) / "Documents/Virtual Machines" / ROLES[role][2] / "server.vmx"
        vm = self.wait(self.lib.VixHost_OpenVM(self.host, str(vmx).encode("utf8"), 0, 0, None, None), handle=True)
        try:
            self.wait(self.lib.VixVM_LoginInGuest(vm, b"server", credential.encode("utf8"), 0, None, None))
            self.wait(self.lib.VixVM_CopyFileFromGuestToHost(vm, b"/etc/ssh/ssh_host_ed25519_key.pub", str(output).encode("utf8"), 0, 0, None, None))
            public = output.read_text(encoding="utf8").strip().split()
            if len(public) < 2 or public[0] != "ssh-ed25519":
                raise RuntimeError("VIX_PUBLIC_KEY_INVALID")
            return paramiko.Ed25519Key(data=base64.b64decode(public[1], validate=True))
        finally:
            self.lib.Vix_ReleaseHandle(vm)

    def close(self):
        self.lib.VixHost_Disconnect(self.host)
        self.search.close()


def run(client, command, credential=None, seconds=60):
    stdin, stdout, stderr = client.exec_command(command, timeout=15, get_pty=False)
    channel = stdout.channel
    if credential is not None:
        stdin.write(credential + "\n")
        stdin.flush()
    channel.shutdown_write()
    output = bytearray()
    deadline = time.monotonic() + seconds
    try:
        while time.monotonic() < deadline:
            for ready, receive in [(channel.recv_ready, channel.recv), (channel.recv_stderr_ready, channel.recv_stderr)]:
                if ready():
                    output.extend(receive(32768))
                    if len(output) > 1024 * 1024:
                        raise RuntimeError("REMOTE_OUTPUT_LIMIT")
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                return channel.recv_exit_status(), bytes(output).decode("utf8", "replace")
            time.sleep(0.1)
        raise RuntimeError("REMOTE_DEADLINE")
    finally:
        channel.close()


def classify_mtls(code, output, logs):
    """A reset is not a denial unless the server confirms the exact TCP tuple."""
    def records(value):
        result = []
        for line in value.splitlines():
            try:
                item = json.loads(line)
                if isinstance(item, dict):
                    result.append(item)
            except ValueError:
                pass
        return result
    clients = records(output)
    if code == 0 and any(item.get("statusCode") == 200 for item in clients):
        return "ALLOW"
    if any(item.get("statusCode") == 403 for item in clients):
        return "DENY"
    certificate_errors = r"ERR_SSL_.*(?:CERTIFICATE|UNKNOWN_CA).*|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    if any(re.fullmatch(certificate_errors, str(item.get("error", ""))) for item in clients):
        return "DENY"
    for item in clients:
        if item.get("error") != "ECONNRESET" or not item.get("localPort") or not item.get("localAddress"):
            continue
        for proof in records(logs):
            reason = str(proof.get("code", "")) + " " + str(proof.get("authorizationError", ""))
            if (proof.get("event") == "TLS_CLIENT_REJECTED"
                    and proof.get("remotePort") == item["localPort"]
                    and str(proof.get("remoteAddress", "")).removeprefix("::ffff:") == item["localAddress"]
                    and re.search(r"CERT_HAS_EXPIRED|INVALID_PURPOSE|SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER|CERT_SIGNATURE_FAILURE|CERTIFICATE", reason)):
                return "DENY"
    return "ENVIRONMENT_ERROR"


def verify_a(client, credential, stamp, existing_phantom=False):
    stage = "/home/server/highpass-validation-" + stamp
    files = [("tmp/certs/mtls/ca.crt", "ca.crt"),
             ("tmp/certs/mtls/gateway-client.crt", "valid.crt"),
             ("tmp/certs/mtls/gateway-client.key", "valid.key"),
             ("tmp/certs/bad/bad.crt", "bad.crt"), ("tmp/certs/bad/bad.key", "bad.key"),
             ("scripts/ops-mtls-client-check.js", "client.js"),
             ("scripts/workstation-qido-check.js", "qido.js")]
    for fixture in ["wrong-issuer", "wrong-san", "wrong-eku", "expired"]:
        for extension in ["crt", "key"]:
            files.append(("tmp/certs/generated-fixtures/" + fixture + "/client." + extension, fixture + "." + extension))
    sftp = client.open_sftp()
    sftp.get_channel().settimeout(15)
    try:
        sftp.mkdir(stage, mode=0o700)
        for local, remote in files:
            sftp.put(str(ROOT / local), stage + "/" + remote, confirm=True)
            sftp.chmod(stage + "/" + remote, 0o600)
    finally:
        sftp.close()
    image = "highpass-platform-mvp:capstone-20261008"
    network = "hp-capstone-hospital-a_pacs_private"
    base = "sudo -S -p '' timeout 25s docker run --rm --pull never --user 0 --network " + network + " -v " + stage + ":/validation:ro -e MTLS_HOST=orthanc-mtls -e MTLS_SERVERNAME=hospital-a-orthanc-mtls -e MTLS_CA_FILE=/validation/ca.crt"
    results = []
    try:
        # These are dedicated TEST client keys, never the CA private key or runtime server key.
        for fixture in ["valid", None, "wrong-issuer", "wrong-san", "wrong-eku", "expired", "bad"]:
            # Docker log timestamp precision can differ; use a two-second window,
            # then require the exact client tuple rather than trusting time alone.
            clock_code, since = run(client, "timeout 5s date -u --date='2 seconds ago' +%Y-%m-%dT%H:%M:%SZ", seconds=10)
            if clock_code or not re.fullmatch(r"[0-9TZ:.\-]+", since.strip()):
                raise RuntimeError("VM_CLOCK_EVIDENCE_UNAVAILABLE")
            options = "" if fixture is None else " -e MTLS_CERT_FILE=/validation/" + fixture + ".crt -e MTLS_KEY_FILE=/validation/" + fixture + ".key"
            code, output = run(client, base + options + " " + image + " /validation/client.js", credential=credential, seconds=30)
            log_code, logs = run(client, "sudo -S -p '' timeout 10s docker logs --since " + shlex.quote(since.strip()) + " hp-capstone-hospital-a-orthanc-mtls-1", credential=credential, seconds=15)
            actual = classify_mtls(code, output, logs if log_code == 0 else "")
            expected = "ALLOW" if fixture == "valid" else "DENY"
            results.append({"test": "mtls-" + (fixture or "no-certificate"), "expected": expected, "actual": actual,
                            "status": "PASS" if actual == expected else "NOT VERIFIED" if actual == "ENVIRONMENT_ERROR" else "FAIL",
                            "exitCode": code, "clientProof": output, "serverProof": logs if log_code == 0 else "LOG_UNAVAILABLE"})
        if results[0]["status"] == "PASS":
            if not existing_phantom:
                code, output = run(client, "sudo -S -p '' timeout 60s docker run --rm --pull never --network " + network + " -e ORTHANC_REST_URL=http://orthanc:8042 " + image + " scripts/load-sample-dicom.js", credential=credential, seconds=65)
                results.append({"test": "synthetic-seed", "status": "PASS" if code == 0 and "Uploaded 4 virtual sample" in output else "FAIL", "exitCode": code, "proof": output})
            options = " -e MTLS_CERT_FILE=/validation/valid.crt -e MTLS_KEY_FILE=/validation/valid.key"
            if existing_phantom:
                options += " -e HIPASS_EXPECT_PHANTOM=1"
            code, output = run(client, base + options + " " + image + " /validation/qido.js", credential=credential, seconds=30)
            results.append({"test": "synthetic-qido-over-mtls", "status": "PASS" if code == 0 and '"status":"PASS"' in output else "FAIL", "exitCode": code, "proof": output})
        else:
            results.append({"test": "synthetic-seed-and-qido", "status": "NOT VERIFIED", "reason": "NORMAL_MTLS_REQUIRED"})
    finally:
        # Exact, independently created stage only. Keep runtime secrets and PACS volumes untouched.
        for _, remote in files:
            run(client, "timeout 5s rm -- " + shlex.quote(stage + "/" + remote), seconds=10)
        cleanup_code, _ = run(client, "timeout 5s rmdir -- " + shlex.quote(stage), seconds=10)
        results.append({"test": "temporary-validation-credentials-cleanup", "status": "PASS" if cleanup_code == 0 else "FAIL"})
    return results


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else "diagnose"
    if mode not in ["diagnose", "install", "rotate-b", "foundation-a", "boundary-check", "verify-a", "verify-a-existing", "diagnose-a", "repair-a-dicomweb"]:
        raise RuntimeError("MODE_INVALID")
    emit({"credentialInput": "READY", "storage": "MEMORY_ONLY", "mode": mode})
    credential = getpass.getpass("") if sys.stdin.isatty() else sys.stdin.readline().rstrip("\r\n")
    if not credential or len(credential) > 1024:
        raise RuntimeError("CREDENTIAL_INPUT_INVALID")
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("automatic-" + stamp)
    directory.mkdir(parents=True, exist_ok=False)
    trust = LocalVmTrust()
    results = []
    key_a = None
    try:
        for role, (address, mac, _) in ROLES.items():
            client = paramiko.SSHClient()
            try:
                key = trust.key(role, credential, directory / (role + "-host-public.pub"))
                if role == "A":
                    key_a = key.asbytes()
                fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
                emit({"hospital": role, "hostTrust": "VERIFIED_LOCAL_VMWARE_CHANNEL", "fingerprint": fingerprint})
                client.get_host_keys().add(address, "ssh-ed25519", key)
                client.set_missing_host_key_policy(paramiko.RejectPolicy())
                client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
                code, _ = run(client, "test $(cat /sys/class/net/ens33/address) = " + mac + " && test $(id -un) = server", seconds=15)
                if code:
                    raise RuntimeError("GUEST_ROLE_MISMATCH")
                code, output = run(client, (ROOT / "scripts/workstation-install-diagnostics.sh").read_text(encoding="utf8").replace("\r\n", "\n"), seconds=45)
                result = {"hospital": role, "diagnosticExit": code, "diagnostics": output.replace(credential, "[REDACTED]"), "review": "DRAFT / UNASSIGNED", "application": "NOT VERIFIED"}
                emit({"hospital": role, "diagnosticExit": code, "diagnosticCollected": "diagnostics=COLLECTED" in output})
                if mode == "repair-a-dicomweb" and role == "A":
                    code, config_path = run(client, "sudo -S -p '' timeout 10s docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{range .Mounts}}{{if eq .Destination \"/etc/orthanc/orthanc.json\"}}{{.Source}}{{end}}{{end}}'", credential=credential, seconds=15)
                    config_path = config_path.strip()
                    if code or not re.fullmatch(r"/home/server/highpass-capstone-[0-9T:+.\-]+/orthanc/hospital-a.json", config_path):
                        raise RuntimeError("UNEXPECTED_ORTHANC_CONFIG_PATH")
                    sftp = client.open_sftp()
                    sftp.get_channel().settimeout(15)
                    try:
                        with sftp.open(config_path, "rb") as stream:
                            original = stream.read(65536)
                        updated = json.loads(original)
                        updated["Plugins"] = ["/usr/local/share/orthanc/plugins/libOrthancDicomWeb.so"]
                        backup = config_path + ".before-dicomweb-" + stamp
                        with sftp.open(backup, "wx") as stream:
                            stream.write(original)
                        sftp.chmod(backup, 0o600)
                        with sftp.open(config_path, "w") as stream:
                            stream.write(json.dumps(updated, indent=2) + "\n")
                    finally:
                        sftp.close()
                    code, output = run(client, "sudo -S -p '' timeout 30s docker restart hp-capstone-hospital-a-orthanc-1", credential=credential, seconds=35)
                    health = ""
                    if code == 0:
                        for _ in range(30):
                            health_code, health = run(client, "sudo -S -p '' timeout 5s docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.State.Health.Status}}'", credential=credential, seconds=10)
                            if health_code == 0 and health.strip() == "healthy":
                                break
                            time.sleep(2)
                    result.update({"status": "PASS" if code == 0 and health.strip() == "healthy" else "FAIL", "scope": "DICOMWEB_PLUGIN_CONFIGURATION_READINESS_ONLY", "backupPath": backup, "dicomweb": "NOT VERIFIED"})
                elif mode == "diagnose-a" and role == "A":
                    command = "sudo -S -p '' timeout 15s docker logs --tail 120 hp-capstone-hospital-a-orthanc-1"
                    code, output = run(client, command, credential=credential, seconds=20)
                    result.update({"status": "PASS" if code == 0 else "NOT VERIFIED", "scope": "DIAGNOSTIC_ONLY", "orthancStartup": output})
                    code, output = run(client, "sudo -S -p '' timeout 10s docker logs --tail 30 hp-capstone-hospital-a-orthanc-mtls-1", credential=credential, seconds=15)
                    result["proxyDiagnostic"] = output
                    code, output = run(client, "timeout 5s date -u +%Y-%m-%dT%H:%M:%SZ", seconds=10)
                    result["guestUtc"] = output.strip()
                elif mode in ["verify-a", "verify-a-existing"] and role == "A":
                    checks = verify_a(client, credential, stamp, existing_phantom=mode == "verify-a-existing")
                    verdict = "FAIL" if any(item["status"] == "FAIL" for item in checks) else "NOT VERIFIED" if any(item["status"] != "PASS" for item in checks) else "PASS"
                    result.update({"status": verdict, "scope": "A_SYNTHETIC_DICOM_AND_MTLS_ONLY", "checks": checks, "crossHospitalE2e": "NOT VERIFIED"})
                elif mode == "boundary-check":
                    if role == "A":
                        command = "sudo -S -p '' timeout 10s docker inspect hp-capstone-hospital-a-orthanc-1 hp-capstone-hospital-a-orthanc-mtls-1 --format '{{.Name}} bindings={{json .HostConfig.PortBindings}} ports={{json .NetworkSettings.Ports}} health={{.State.Health.Status}}'"
                        code, output = run(client, command, credential=credential, seconds=15)
                        result.update({"status": "PASS" if code == 0 else "FAIL", "scope": "DOCKER_NETWORK_INVENTORY_ONLY", "network": output})
                    else:
                        probe = 'import socket\ns=socket.socket();s.settimeout(3)\ntry:\n s.connect(("192.168.111.129",8042));print("RAW_ORTHANC=REACHABLE")\nexcept ConnectionRefusedError:\n print("RAW_ORTHANC=ECONNREFUSED")\nexcept OSError as e:\n print("RAW_ORTHANC=NETWORK_ERROR",type(e).__name__,e.errno)\nfinally:\n s.close()'
                        code, output = run(client, "timeout 5s python3 -c " + shlex.quote(probe), seconds=10)
                        verdict = "PASS" if code == 0 and output.strip() == "RAW_ORTHANC=ECONNREFUSED" else "FAIL" if code == 0 and output.strip() == "RAW_ORTHANC=REACHABLE" else "NOT VERIFIED"
                        result.update({"status": verdict, "scope": "B_TO_RAW_A_ORTHANC_DIRECT_DENIAL", "exitCode": code, "diagnostic": output})
                elif mode == "foundation-a" and role == "A":
                    stage = "/home/server/highpass-capstone-" + stamp
                    sftp = client.open_sftp()
                    sftp.get_channel().settimeout(15)
                    sftp.mkdir(stage, mode=0o700)
                    for child in ["orthanc", "secrets"]:
                        sftp.mkdir(stage + "/" + child, mode=0o700)
                    copies = [("artifacts/workstation/capstone-a-images.tar", "images.tar"),
                              ("infra/workstation/hospital-a.compose.yml", "compose.yml"),
                              ("orthanc/hospital-a.json", "orthanc/hospital-a.json")]
                    for name in ["ca.crt", "orthanc-server.crt", "orthanc-server.key"]:
                        copies.append(("tmp/certs/mtls/" + name, "secrets/" + name))
                    deadline = time.monotonic() + 300
                    for local, remote in copies:
                        def progress(transferred, total):
                            if time.monotonic() > deadline:
                                raise RuntimeError("UPLOAD_DEADLINE")
                        sftp.put(str(ROOT / local), stage + "/" + remote, callback=progress, confirm=True)
                        sftp.chmod(stage + "/" + remote, 0o600)
                    sftp.close()
                    archive = ROOT / "artifacts/workstation/capstone-a-images.tar"
                    with archive.open("rb") as stream:
                        archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
                    code, output = run(client, "timeout 30s sha256sum " + stage + "/images.tar", seconds=35)
                    if code or output.split()[0] != archive_hash:
                        raise RuntimeError("IMAGE_ARCHIVE_HASH_MISMATCH")
                    code, output = run(client, "sudo -S -p '' timeout 120s docker load -i " + stage + "/images.tar", credential=credential, seconds=130)
                    if code:
                        raise RuntimeError("IMAGE_LOAD_FAILED")
                    secret_dir = "/opt/highpass/capstone-a-secrets"
                    command = "sudo -S -p '' timeout 30s bash -c 'set -eu; test ! -e " + secret_dir + "; install -d -o root -g 65532 -m 750 " + secret_dir + "; "
                    command += " ".join("install -o root -g 65532 -m 640 " + stage + "/secrets/" + name + " " + secret_dir + "/" + name + ";" for name in ["ca.crt", "orthanc-server.crt", "orthanc-server.key"]) + "'"
                    code, _ = run(client, command, credential=credential, seconds=35)
                    if code:
                        raise RuntimeError("SECRET_INSTALL_FAILED_OR_EXISTING_PATH_PRESERVED")
                    environment = "HIPASS_APP_IMAGE=highpass-platform-mvp:capstone-20261008 HIPASS_ORTHANC_IMAGE=newproject-orthanc-secured:latest HIPASS_VM_SECRETS_DIR=" + secret_dir
                    compose = "docker compose --project-directory " + stage + " -p hp-capstone-hospital-a -f " + stage + "/compose.yml"
                    command = "sudo -S -p '' env " + environment + " timeout 180s " + compose + " up -d --wait --wait-timeout 150"
                    code, output = run(client, command, credential=credential, seconds=190)
                    if code:
                        raise RuntimeError("A_FOUNDATION_READINESS_FAILED")
                    code, output = run(client, "sudo -S -p '' timeout 10s docker ps --filter label=com.docker.compose.project=hp-capstone-hospital-a --format '{{.Names}} {{.Status}} {{.Ports}}'", credential=credential, seconds=15)
                    result.update({"status": "PASS" if code == 0 else "FAIL", "foundation": "A_ORTHANC_MTLS_READINESS_ONLY", "services": output, "deploymentPath": stage, "archiveSha256": archive_hash, "gatewayAuthorization": "NOT VERIFIED", "crossHospitalE2e": "NOT VERIFIED"})
                elif mode == "rotate-b" and role == "B":
                    if key_a is None:
                        raise RuntimeError("A_INDEPENDENT_BASELINE_REQUIRED")
                    if key.asbytes() != key_a:
                        result.update({"status": "PASS", "hostKeys": "ALREADY_DISTINCT_NO_ROTATION"})
                    else:
                        rotate = (ROOT / "scripts/workstation-rotate-b-hostkeys.sh").read_text(encoding="utf8").replace("\r\n", "\n")
                        encoded = base64.b64encode(rotate.encode("utf8")).decode("ascii")
                        command = "code=$(printf %s " + encoded + " | base64 --decode) && sudo -S -p '' timeout 90s bash -c \"$code\""
                        code, output = run(client, command, credential=credential, seconds=100)
                        if code or "HOST_KEY_ROTATION=PASS" not in output:
                            raise RuntimeError("B_ROTATION_FAILED_REVIEW_BACKUP")
                        new_key = trust.key(role, credential, directory / "B-new-host-public.pub")
                        if new_key.asbytes() in [key_a, key.asbytes()]:
                            raise RuntimeError("B_ROTATION_NOT_INDEPENDENT")
                        client.close()
                        client = paramiko.SSHClient()
                        client.get_host_keys().add(address, "ssh-ed25519", new_key)
                        client.set_missing_host_key_policy(paramiko.RejectPolicy())
                        client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
                        code, _ = run(client, "test $(cat /sys/class/net/ens33/address) = " + mac, seconds=15)
                        if code:
                            raise RuntimeError("B_RECONNECT_ROLE_MISMATCH")
                        result.update({"status": "PASS", "rotation": output, "hostKeys": "DISTINCT_AND_STRICT_RECONNECT_VERIFIED", "newFingerprint": "SHA256:" + base64.b64encode(hashlib.sha256(new_key.asbytes()).digest()).decode().rstrip("=")})
                elif mode == "install":
                    if "apt-get " in output or "dpkg " in output:
                        raise RuntimeError("PACKAGE_MANAGER_ACTIVE_NO_RETRY")
                    sftp = client.open_sftp()
                    sftp.get_channel().settimeout(15)
                    stage = sftp.normalize(".") + "/.highpass-capstone-install"
                    try:
                        sftp.mkdir(stage, mode=0o700)
                    except IOError:
                        if sftp.lstat(stage).st_mode & 0o170000 != 0o040000:
                            raise RuntimeError("STAGE_DIRECTORY_INVALID")
                    target = stage + "/docker-installer.sh"
                    with sftp.open(target, "w") as stream:
                        stream.write((ROOT / "scripts/workstation-install-docker-ubuntu.sh").read_text(encoding="utf8").replace("\r\n", "\n"))
                    sftp.chmod(target, 0o600)
                    sftp.close()
                    code, output = run(client, "sudo -S -p '' env HIPASS_DOCKER_SUDO_MODE=noninteractive DEBIAN_FRONTEND=noninteractive timeout 900s bash " + target, credential=credential, seconds=930)
                    result.update({"installExit": code, "installOutput": output.replace(credential, "[REDACTED]"), "status": "PASS" if code == 0 and "DOCKER_SETUP=PASS" in output and "docker-engine=" in output and "Docker Compose version" in output else "FAIL"})
                else:
                    result["status"] = "PASS" if code == 0 and "diagnostics=COLLECTED" in output else "FAIL"
                results.append(result)
                emit({k: v for k, v in result.items() if k not in ["diagnostics", "installOutput"]})
            except Exception as error:
                result = {"hospital": role, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__, "review": "DRAFT / UNASSIGNED"}
                results.append(result)
                emit(result)
            finally:
                client.close()
    finally:
        trust.close()
        credential = None
    (directory / "result.json").write_text(json.dumps(results, indent=2, ensure_ascii=True), encoding="utf8")
    overall = "FAIL" if any(item["status"] == "FAIL" for item in results) else "NOT VERIFIED" if any(item["status"] != "PASS" for item in results) else "PASS"
    emit({"evidence": str(directory / "result.json"), "operations": overall, "mvp": "NOT VERIFIED"})
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        emit({"status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
        sys.exit(1)
