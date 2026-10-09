"""One-time VM-local certificates and narrowly scoped Entra Key Vault identities."""
import getpass
import importlib.util
import json
import os
import pathlib
import shlex
import subprocess
import sys
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base = gateway.base
TENANT = "ad21525c-fc0f-4dbc-a403-67ce00add0e4"
VAULT = "/subscriptions/a3c0e7d4-ce09-4991-946b-88574869edd9/resourceGroups/rg-highpass-capstone-20261008/providers/Microsoft.KeyVault/vaults/kv-hp-demo-4869edd9"
SCOPE = VAULT + "/keys/capstone-b-kek-20261009"
IDENTITIES = {
    "A": ("faa9f09f-fc51-40b2-b384-49f4daf67d0d", "e1ca957c-676e-477f-ae30-4414f109ecd0", "capstone-key-wrap-role.json"),
    "B": ("2e2a4f86-c0b3-4005-9b60-5c6542558fa4", "4d4a4bcf-f879-443d-9c18-283cace062d2", "capstone-key-unwrap-role.json"),
}

def azure(*args):
    process = subprocess.run(["C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe", "-IBm", "azure.cli", *args, "--only-show-errors", "-o", "json"], capture_output=True, cwd=ROOT, timeout=60, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if process.returncode:
        raise RuntimeError("AZURE_" + "_".join(args[:3]) + "_FAILED")
    payload = process.stdout or b"null"
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Windows Azure CLI may retain the Korean console encoding when piped.
        # Strict fallback, never lossy replacement and never print raw responses.
        text = payload.decode("cp949")
    return json.loads(text)

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("key-identities-" + stamp)
    directory.mkdir(parents=True)
    credential = getpass.getpass("VM credential (concealed): ")
    trust = base.ops.LocalVmTrust()
    checks = []
    client = None
    phase = "VM_ATTESTATION"
    try:
        for role, (app, principal, definition) in IDENTITIES.items():
            address, mac, _ = base.ops.ROLES[role]
            key = trust.key(role, credential, directory / (role + "-public-host.key"))
            client = paramiko.SSHClient()
            client.get_host_keys().add(address, key.get_name(), key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address, username="server", password=credential, look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
            def run(command, seconds=30):
                code, output = base.ops.run(client, "sudo -S -p '' timeout " + str(seconds) + "s bash -c " + shlex.quote("set -eu; " + command), credential=credential, seconds=seconds + 5)
                if code:
                    raise RuntimeError("GUEST_OPERATION_FAILED_" + role + "_" + str(code))
                return output.strip()
            phase = "LOCAL_CERTIFICATE_" + role
            remote = "/opt/highpass/capstone-key-identity"
            run("test $(cat /sys/class/net/ens33/address) = " + mac + "; test ! -e " + remote + "; install -d -o root -g 65532 -m 750 " + remote + "; umask 077; openssl req -x509 -newkey rsa:2048 -nodes -days 31 -subj /CN=highpass-capstone-hospital-" + role.lower() + "-entra-development-only -keyout " + remote + "/identity.key -out " + remote + "/identity.crt 2>/dev/null; chown root:65532 " + remote + "/identity.key " + remote + "/identity.crt; chmod 640 " + remote + "/identity.key " + remote + "/identity.crt")
            with gateway.root_sftp(client, credential) as sftp:
                certificate = directory / (role + "-identity-public.crt")
                sftp.get(remote + "/identity.crt", str(certificate))
                with sftp.open(remote + "/identity.json", "wx") as stream:
                    stream.write(json.dumps({"tenantId": TENANT, "clientId": app, "role": role, "scope": SCOPE}))
                sftp.chmod(remote + "/identity.json", 0o640)
                sftp.chown(remote + "/identity.json", 0, 65532)
                sftp.put(str(ROOT / "scripts/capstone-key-identity-probe.py"), remote + "/probe.py")
                sftp.chmod(remote + "/probe.py", 0o640)
                sftp.chown(remote + "/probe.py", 0, 65532)
            phase = "PUBLIC_CERTIFICATE_REGISTRATION_" + role
            azure("ad", "app", "credential", "reset", "--id", app, "--cert", "@" + str(certificate), "--append", "--end-date", "2026-11-08T16:30:00Z", "--display-name", "capstone-31-day-VM-local-certificate")
            phase = "NARROW_ROLE_ASSIGNMENT_" + role
            definition_path = ROOT / "infra/azure" / definition
            role_name = json.loads(definition_path.read_text())["Name"]
            existing = azure("role", "definition", "list", "--name", role_name)
            if existing:
                raise RuntimeError("EXISTING_ROLE_REQUIRES_REVIEW")
            created = azure("role", "definition", "create", "--role-definition", str(definition_path))
            assignment = azure("role", "assignment", "create", "--assignee-object-id", principal, "--assignee-principal-type", "ServicePrincipal", "--role", created["name"], "--scope", SCOPE)
            checks.append({"test": role + "_KEY_ONLY_ROLE_ASSIGNED", "status": "PASS", "principal": principal, "roleDefinition": created["name"], "scope": assignment["scope"], "dataActions": created["permissions"][0]["dataActions"]})
            phase = "ACTUAL_ENTRA_CERTIFICATE_TOKEN_" + role
            probe = json.loads(run("python3 " + remote + "/probe.py", 25))
            checks.append({"test": role + "_ACTUAL_CERTIFICATE_AUTHENTICATION", **probe})
            client.close()
            client = None
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        if client:
            client.close()
        trust.close()
        credential = None
    result = {"scope": "HOSPITAL_CERTIFICATE_IDENTITIES_AND_KEY_SCOPED_ROLES_ONLY", "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if checks and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED", "actualKeyWrapUnwrap": "NOT VERIFIED", "keyCreation": "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    base.emit({**result, "evidence": str(directory / "result.json")})
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
