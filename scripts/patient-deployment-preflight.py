"""Read-only current cloud patient readiness, not migration or activation."""
import importlib.util
import json
import os
import pathlib
import shlex
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("rollout", ROOT / "scripts/capstone-cloud-app-rollout.py")
rollout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rollout)
EXPECTED = "sha256:a54879068331c235fbd9636b899717fd06b5682ccf07ea9605a0a87ee1178783"

def main():
    checks = []
    client = paramiko.SSHClient()
    directory = ROOT / "artifacts/workstation" / ("patient-deployment-preflight-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    directory.mkdir(parents=True)
    phase = "STRICT_CLOUD_HOST_IDENTITY"
    try:
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"),
                       look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        def run(command):
            code, output = rollout.base.ops.run(client, "sudo -n timeout 15s bash -c " + shlex.quote("set -eu; " + command), seconds=20)
            if code:
                raise RuntimeError("READ_ONLY_COMMAND_FAILED")
            return output.strip()
        run("test $(hostname) = highpass-cloud; systemctl is-active --quiet wg-quick@hp-capstone")
        checks.append({"test": phase, "status": "PASS"})
        phase = "EXISTING_RUNTIME_BASELINE"
        for name, expected in [("hp-capstone-control-control-1", EXPECTED), ("hp-capstone-control-ingress-1", EXPECTED),
                               ("hp-capstone-control-postgres-1", rollout.base.PG_ID)]:
            image = json.loads(run("docker inspect " + name + " --format '{{json .Image}}'"))
            state = json.loads(run("docker inspect " + name + " --format '{{json .State}}'"))
            ok = image == expected and state.get("Running") and state.get("Health", {}).get("Status", "healthy") == "healthy"
            checks.append({"test": name, "status": "PASS" if ok else "FAIL", "imageId": image})
        labels = json.loads(run("docker inspect hp-capstone-control-control-1 --format '{{json .Config.Labels}}'"))
        stage, files = rollout.validated_context(labels)
        checks.append({"test": "VALIDATED_EXISTING_COMPOSE_CONTEXT", "status": "PASS", "directory": stage, "files": files})
        phase = "PATIENT_RUNTIME_FLAGS"
        # Filter inside the VM. Never return complete environment or secret values.
        filter_script = "import sys,json; env=dict(v.split('=',1) for v in json.load(sys.stdin)); print(json.dumps({k:env.get(k)=='1' for k in ['HIPASS_CAPSTONE_PATIENT_GRANTS','HIPASS_CAPSTONE_PATIENT_KEY_RELEASE','HIPASS_CAPSTONE_SINGLE_WRITER']}))"
        flags = json.loads(run("docker inspect hp-capstone-control-control-1 --format '{{json .Config.Env}}' | python3 -c " + shlex.quote(filter_script)))
        checks.append({"test": phase, "status": "PASS" if all(flags.values()) else "NOT VERIFIED", "enabled": flags})
        phase = "ROOT_PROTECTED_PATIENT_SECRET_METADATA"
        # Only lstat metadata, not secret contents. Presence is not validity proof.
        secret_probe = """import os,stat,json
names=['patient-authority-password','patient-a-service-secret','patient-b-service-secret']
out={}
for name in names:
 try:
  value=os.lstat('/opt/highpass/capstone-control-secrets/'+name)
  out[name]=stat.S_ISREG(value.st_mode) and value.st_uid==0 and value.st_mode & 0o077==0
 except FileNotFoundError:
  out[name]=False
print(json.dumps(out))"""
        secret_metadata = json.loads(run("python3 -c " + shlex.quote(secret_probe)))
        checks.append({"test": phase, "status": "PASS" if all(secret_metadata.values()) else "NOT VERIFIED", "protectedRegularFiles": secret_metadata})
        phase = "READ_ONLY_SQL_AUTHORITY_METADATA"
        sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='5s';
SELECT json_build_object('readOnly',current_setting('transaction_read_only'),
'accounts',to_regclass('public.capstone_patient_accounts') IS NOT NULL,
'ownershipRefs',to_regclass('public.capstone_patient_ownership_refs') IS NOT NULL,
'grants',to_regclass('public.capstone_patient_self_view_grants') IS NOT NULL,
'releases',to_regclass('public.capstone_patient_key_releases') IS NOT NULL,
'authorityRole',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hipass_patient_authority' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb));
ROLLBACK;"""
        metadata = json.loads(run("docker exec hp-capstone-control-postgres-1 psql -X -qAt -U hipass_bootstrap -d hipass -c " + shlex.quote(sql)))
        if metadata.get("readOnly") != "on":
            raise RuntimeError("READ_ONLY_TRANSACTION_REQUIRED")
        checks.append({"test": phase, "status": "PASS" if all(metadata[k] is True for k in ["accounts", "ownershipRefs", "grants", "releases", "authorityRole"]) else "NOT VERIFIED", "metadata": metadata})
    except Exception as error:
        checks.append({"test": phase, "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    status = "FAIL" if any(c["status"] == "FAIL" for c in checks) else "NOT VERIFIED"
    result = {"status": status, "review": "DRAFT / UNASSIGNED", "scope": "read-only cloud runtime/flags/schema only; not secret mount, ownership correctness, deployment or E2E readiness", "checks": checks}
    target = directory / "result.json"
    target.write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(target)}))
    return 1 if status == "FAIL" else 2

if __name__ == "__main__":
    raise SystemExit(main())
