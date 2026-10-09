"""Run a read-only cloud DB probe through pinned SSH and anonymous stdin."""
import json
import argparse
import re
import os
import pathlib
import sys
import time
from datetime import datetime, timezone
import paramiko
ROOT = pathlib.Path(__file__).resolve().parent.parent
IMAGE_ID = "sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cloud-image-id", default=IMAGE_ID)
    args = parser.parse_args()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", args.cloud_image_id):
        raise SystemExit("CLOUD_IMAGE_ID_INVALID")
    client = paramiko.SSHClient()
    try:
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        channel = client.get_transport().open_session(timeout=10)
        channel.settimeout(15)
        command = "sudo -n timeout 30s bash -c 'test $(hostname) = highpass-cloud && test $(docker inspect hp-capstone-control-control-1 --format {{.Image}}) = " + args.cloud_image_id + " && exec docker exec -i hp-capstone-control-control-1 /nodejs/bin/node --input-type=module'"
        channel.exec_command(command)
        channel.sendall((ROOT / "scripts/capstone-encryption-ledger-probe.js").read_bytes())
        channel.shutdown_write()
        output = bytearray()
        end = time.monotonic() + 35
        while time.monotonic() < end:
            if channel.recv_ready():
                output.extend(channel.recv(32768))
            if len(output) > 65536:
                raise RuntimeError("OUTPUT_LIMIT")
            if channel.exit_status_ready() and not channel.recv_ready():
                code = channel.recv_exit_status()
                result = json.loads(bytes(output).decode("utf8"))
                if code != 0 and result.get("status") == "PASS":
                    raise RuntimeError("EXIT_STATUS_MISMATCH")
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("PROBE_DEADLINE")
    except Exception as error:
        result = {"scope": "READ_ONLY_ENCRYPTION_LEDGER", "review": "DRAFT / UNASSIGNED", "status": "NOT VERIFIED", "reason": type(error).__name__}
    finally:
        client.close()
    directory = ROOT / "artifacts/workstation" / ("encryption-ledger-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result.get("status") == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
