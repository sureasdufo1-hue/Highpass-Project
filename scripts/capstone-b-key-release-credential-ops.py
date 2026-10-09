"""Provision only the recipient service credential; no image/DB rollout."""
import getpass
import importlib.util
import json
import os
import pathlib
import shlex
import sys
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base = gateway.base


def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("b-key-release-credential-" + stamp)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = None
    clients = []
    secret = None
    checks = []
    try:
        trust = base.ops.LocalVmTrust()
        address, mac, _ = base.ops.ROLES["B"]
        public = trust.key("B", credential, directory / "B-public-host.key")
        b = paramiko.SSHClient()
        clients.append(b)
        b.get_host_keys().add(address, public.get_name(), public)
        b.set_missing_host_key_policy(paramiko.RejectPolicy())
        b.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, _ = base.ops.run(b, "test $(cat /sys/class/net/ens33/address) = " + mac, seconds=10)
        if code:
            raise RuntimeError("B_ROLE_MISMATCH")
        cloud = paramiko.SSHClient()
        clients.append(cloud)
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        cloud.load_host_keys(str(identity / "known_hosts"))
        cloud.set_missing_host_key_policy(paramiko.RejectPolicy())
        cloud.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, _ = base.ops.run(cloud, "test $(hostname) = highpass-cloud && test $(id -un) = highpassadmin", seconds=10)
        if code:
            raise RuntimeError("CLOUD_ROLE_MISMATCH")
        path = "/opt/highpass/capstone-control-secrets/b-key-release-secret"
        command = "set -eu; test -d /opt/highpass/capstone-control-secrets; if test ! -e " + path + "; then umask 077; set -C; openssl rand -hex 32 > " + path + "; chown root:65532 " + path + "; chmod 640 " + path + "; fi; test $(stat -c '%u:%g:%a' " + path + ") = 0:65532:640; test $(wc -c < " + path + ") = 65; grep -Eq '^[a-f0-9]{64}$' " + path + "; for other in app-password admin-password token-secret test-auth-secret ingress-secret data-plane-secret capstone-login-key; do test -f /opt/highpass/capstone-control-secrets/$other; if cmp -s " + path + " /opt/highpass/capstone-control-secrets/$other; then exit 1; fi; done"
        code, _ = base.ops.run(cloud, "sudo -n timeout 10s bash -c " + shlex.quote(command), seconds=15)
        if code:
            raise RuntimeError("CLOUD_DISTINCT_CREDENTIAL_NOT_VERIFIED")
        checks.append({"test": "CLOUD_ROOT_PROTECTED_DISTINCT_B_CREDENTIAL", "status": "PASS"})
        target_path = "/opt/highpass/capstone-b-portal-secrets/b-key-release-secret"
        with gateway.root_sftp(cloud) as source, gateway.root_sftp(b, credential) as target:
            if target.stat("/opt/highpass/capstone-b-portal-secrets").st_uid != 0:
                raise RuntimeError("B_SECRET_DIRECTORY_NOT_ROOT_OWNED")
            with source.open(path, "rb") as stream:
                secret = bytearray(stream.read(257))
            if len(secret) != 65:
                raise RuntimeError("CREDENTIAL_FORMAT_INVALID")
            try:
                target.stat(target_path)
                with target.open(target_path, "rb") as stream:
                    if stream.read(257) != secret:
                        raise RuntimeError("EXISTING_B_CREDENTIAL_PRESERVED_MISMATCH")
            except FileNotFoundError:
                with target.open(target_path, "wx") as stream:
                    stream.write(secret)
                target.chown(target_path, 0, 65532)
                target.chmod(target_path, 0o640)
            with target.open(target_path, "rb") as stream:
                if stream.read(257) != secret:
                    raise RuntimeError("B_CREDENTIAL_TRANSFER_NOT_VERIFIED")
            info = target.stat(target_path)
            if info.st_uid != 0 or info.st_gid != 65532 or info.st_mode & 0o777 != 0o640:
                raise RuntimeError("B_CREDENTIAL_PERMISSIONS_NOT_VERIFIED")
        checks.append({"test": "PINNED_ENCRYPTED_ROOT_SFTP_B_DELIVERY_MATCH", "status": "PASS"})
        checks.append({"test": "NO_WINDOWS_SECRET_FILE_OR_DOCKER_ENV_WRITE", "status": "PASS"})
    except Exception as error:
        checks.append({"test": "RECIPIENT_SERVICE_CREDENTIAL", "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        if secret is not None:
            for index in range(len(secret)):
                secret[index] = 0
        for client in clients:
            client.close()
        if trust:
            trust.close()
        credential = None
    result = {"scope": "B_SERVICE_CREDENTIAL_PROVISIONING_ONLY", "review": "DRAFT / UNASSIGNED", "checks": checks,
              "status": "PASS" if len(checks) == 3 and all(row["status"] == "PASS" for row in checks) else "NOT VERIFIED", "encryptedViewer": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
