"""Actual TLS B portal login checks. No presenter key or actor token in output."""
import importlib.util
import json
import os
import pathlib
import ssl
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


def main():
    client = paramiko.SSHClient()
    checks = []
    try:
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        context = ssl.create_default_context(cafile=str(ROOT / "tmp/certs/mtls/ca.crt"))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
        origin = "https://192.168.111.149:9443"
        def http(path, body=None, headers=None):
            request = urllib.request.Request(origin + path, data=None if body is None else json.dumps(body).encode(), headers=headers or {})
            try:
                response = opener.open(request, timeout=12)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                payload = response.read(1048577)
                if len(payload) > 1048576:
                    raise RuntimeError("RESPONSE_LIMIT")
                return response.status, json.loads(payload)
        for name, headers, expected in [("LOGIN_MISSING_ORIGIN_DENY", {"content-type": "application/json"}, 403), ("LOGIN_WRONG_KEY_DENY", {"content-type": "application/json", "origin": origin}, 401)]:
            status, _ = http("/api/capstone-demo/login", {"key": "invalid-presenter-key"}, headers)
            checks.append({"test": name, "status": "PASS" if status == expected else "FAIL", "http": status})
        with gateway.root_sftp(client) as sftp, sftp.open("/opt/highpass/capstone-control-secrets/capstone-login-key", "rb") as stream:
            presenter = stream.read(129).decode()
        status, session = http("/api/capstone-demo/login", {"key": presenter}, {"content-type": "application/json", "origin": origin})
        presenter = None
        profiles = session.get("profiles", {})
        valid = status == 200 and set(profiles) == {"PATIENT", "DOCTOR", "SECURITY_ADMIN"} and session.get("environment") == "CAPSTONE_SYNTHETIC_MOCK_IDP_ONLY"
        checks.append({"test": "ACTUAL_FIXED_SYNTHETIC_LOGIN", "status": "PASS" if valid else "FAIL", "http": status})
        if not valid:
            raise RuntimeError("MOCK_LOGIN_NOT_VERIFIED")
        status, _ = http("/api/imaging-studies", headers={"authorization": "Bearer " + profiles["PATIENT"]})
        checks.append({"test": "SIGNED_PATIENT_JWT_API", "status": "PASS" if status == 200 else "FAIL", "http": status})
        status, _ = http("/api/imaging-studies", headers={"x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001"})
        checks.append({"test": "SPOOFED_ROLE_HEADERS_DENY", "status": "PASS" if status == 401 else "FAIL", "http": status})
        status, integrity = http("/api/audit-integrity", headers={"authorization": "Bearer " + profiles["SECURITY_ADMIN"]})
        checks.append({"test": "CURRENT_CLOUD_POSTGRES_AUDIT_HASH_CHAIN", "status": "PASS" if status == 200 and integrity.get("ok") is True else "FAIL", "http": status, "checked": integrity.get("checked")})
        profiles = None
        session = None
    except Exception as error:
        checks.append({"test": "ACTUAL_B_LOGIN_CHECK", "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        client.close()
    result = {"scope": "ACTUAL_B_HTTPS_CLOUD_SYNTHETIC_LOGIN_ONLY", "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if checks and all(c["status"] == "PASS" for c in checks) else "NOT VERIFIED", "browserViewer": "NOT VERIFIED"}
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("b-login-" + stamp)
    directory.mkdir(parents=True)
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
