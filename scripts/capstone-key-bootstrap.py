"""Temporary create-only operator role, transient stdin token, strict private TLS."""
import importlib.util
import json
import os
import pathlib
import shlex
import sys
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("key_identities", ROOT / "scripts/capstone-key-identities.py")
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)
OPERATOR = "86aba420-e1d9-4284-9145-5d0f524a296a"

def main():
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/azure" / ("key-bootstrap-" + stamp)
    directory.mkdir(parents=True)
    client = paramiko.SSHClient()
    assignment = None
    checks = []
    phase = "EXACT_SUBSCRIPTION_AND_PRIVATE_VAULT"
    try:
        account = identity.azure("account", "show")
        vault = identity.azure("keyvault", "show", "--name", "kv-hp-demo-4869edd9", "--subscription", account["id"])
        if account["id"] != "a3c0e7d4-ce09-4991-946b-88574869edd9" or account["tenantId"] != identity.TENANT or vault["properties"]["publicNetworkAccess"] != "Disabled" or vault["properties"]["enableRbacAuthorization"] is not True:
            raise RuntimeError("APPROVED_PRIVATE_VAULT_REQUIRED")
        phase = "TEMPORARY_CREATE_ONLY_OPERATOR_ROLE"
        definition = identity.azure("role", "definition", "create", "--role-definition", str(ROOT / "infra/azure/capstone-key-bootstrap-role.json"))
        assignment = identity.azure("role", "assignment", "create", "--assignee-object-id", OPERATOR, "--assignee-principal-type", "User", "--role", definition["name"], "--scope", identity.VAULT)
        ssh = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(ssh / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(ssh / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        stage = "/home/highpassadmin/.highpass-key-bootstrap-" + stamp
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15)
            sftp.mkdir(stage, mode=0o700)
            sftp.put(str(ROOT / "scripts/capstone-key-bootstrap-guest.py"), stage + "/bootstrap.py")
            sftp.chmod(stage + "/bootstrap.py", 0o600)
        phase = "PRIVATE_TLS_KEY_CREATION"
        token = identity.azure("account", "get-access-token", "--resource", "https://vault.azure.net", "--subscription", account["id"])["accessToken"]
        stdin, stdout, stderr = client.exec_command("timeout 125s python3 " + shlex.quote(stage + "/bootstrap.py"), timeout=15, get_pty=False)
        stdout.channel.settimeout(135)
        stdin.write(json.dumps({"token": token}))
        stdin.flush()
        stdin.channel.shutdown_write()
        token = None
        payload = stdout.read(16385)
        if len(payload) > 16384 or stdout.channel.recv_exit_status() != 0:
            raise RuntimeError("BOOTSTRAP_RESPONSE_NOT_VERIFIED")
        result = json.loads(payload)
        checks.append({"test": "ACTUAL_PRIVATE_TLS_VERSIONED_RSA_KEY_CREATION", **result})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
        if assignment:
            try:
                identity.azure("role", "assignment", "delete", "--ids", assignment["id"])
                remaining = identity.azure("role", "assignment", "list", "--scope", identity.VAULT, "--query", "[?id=='" + assignment["id"] + "']")
                checks.append({"test": "TEMPORARY_BOOTSTRAP_ROLE_REMOVED", "status": "PASS" if not remaining else "FAIL"})
            except Exception:
                checks.append({"test": "TEMPORARY_BOOTSTRAP_ROLE_REMOVED", "status": "FAIL", "assignmentId": assignment["id"]})
    result = {"scope": "REAL_PRIVATE_KEY_CREATION_ONLY_NO_WRAP_UNWRAP_CLAIM", "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if checks and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
