"""Pass cloud-only presenter key via anonymous stdin pipe, never env/file/log."""
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gateway_ops", ROOT / "scripts/capstone-a-gateway-ops.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)

def main():
    client = paramiko.SSHClient()
    try:
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        with gateway.root_sftp(client) as sftp, sftp.open("/opt/highpass/capstone-control-secrets/capstone-login-key", "rb") as stream:
            presenter = stream.read(129)
        deadline_seconds = 675 if os.environ.get("HIPASS_BROWSER_LIVE_POLICY") == "1" else 375 if os.environ.get("HIPASS_BROWSER_OUTAGE_DIR") else 195
        if os.environ.get("HIPASS_BROWSER_VERTICAL_FLOW") == "1":
            deadline_seconds = 315
        if os.environ.get("HIPASS_BROWSER_MOBILE_QR") == "1" and os.environ.get("HIPASS_BROWSER_MOBILE_QR_EXPIRY") == "1":
            deadline_seconds = 1035
        script = "scripts/mobile-qr-browser-check.js" if os.environ.get("HIPASS_BROWSER_MOBILE_QR") == "1" else "scripts/browser-authorization-trace.js"
        process = subprocess.run(["node", script], cwd=ROOT, input=presenter, capture_output=True, timeout=deadline_seconds)
        presenter = None
        try:
            result = json.loads(process.stdout.decode("utf8"))
        except (ValueError, UnicodeError):
            result = {"result": "NOT VERIFIED", "reason": "BROWSER_OUTPUT_NOT_STRUCTURED", "exitCode": process.returncode}
        # Never forward raw stderr, browser exception values or credentials.
    except Exception as error:
        result = {"result": "NOT VERIFIED", "reason": type(error).__name__}
        process = None
    finally:
        client.close()
    result["review"] = "DRAFT / UNASSIGNED"
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("b-browser-" + stamp)
    directory.mkdir(parents=True)
    (directory / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}, ensure_ascii=True), flush=True)
    return 0 if result.get("result") == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
