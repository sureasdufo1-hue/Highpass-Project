"""Actual synthetic browser flow overlapped with bounded read-only audit snapshots."""
import argparse
import json
import pathlib
import re
import subprocess
import threading
import sys
import time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent

def drain_output(stream, target, overflow, limit=65536):
    """Always drain the pipe, but cap retained bytes even on invalid output."""
    while True:
        chunk = stream.read(4096)
        if not chunk:
            break
        if len(target) + len(chunk) <= limit:
            target.extend(chunk)
        else:
            overflow[0] = True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cloud-image-id", required=True)
    parser.add_argument("--port", type=int, default=9231)
    args = parser.parse_args()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", args.cloud_image_id) or not 1024 <= args.port <= 65535:
        raise SystemExit("PUBLIC_ARGUMENT_INVALID")
    stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    directory = ROOT / "artifacts/workstation" / ("concurrent-audit-" + stamp)
    directory.mkdir(parents=True)
    snapshots, checks = [], []
    browser = None
    browser_result = {}
    output_buffers = [bytearray(), bytearray()]
    output_overflow = [False]
    readers = []
    started = time.monotonic()
    deadline = started + 240
    def snapshot():
        process = subprocess.run([sys.executable, str(ROOT / "scripts/capstone-encryption-ledger-ops.py"), "--cloud-image-id", args.cloud_image_id], cwd=ROOT, capture_output=True, timeout=45)
        result = json.loads(process.stdout.decode("utf8"))
        if process.returncode != 0 and result.get("status") == "PASS":
            raise RuntimeError("PROBE_EXIT_MISMATCH")
        # Existing probe emits counts and fixed codes only; preserve its own
        # evidence file, no patient/user records or raw database logs here.
        snapshots.append({"status": result.get("status", "NOT VERIFIED"), "storedLinkDiagnostics": result.get("storedLinkDiagnostics", {}), "evidence": result.get("evidence"), "browserRunning": browser is not None and browser.poll() is None})
        return result
    try:
        baseline = snapshot()
        if baseline.get("status") != "PASS":
            raise RuntimeError("BASELINE_AUDIT_NOT_VALID")
        command = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "scripts/run-browser-authorization-trace.ps1"), "-BrowserUrl", "https://192.168.111.149:9443/hipass/", "-Port", str(args.port), "-Capstone", "-NegativeBoundary"]
        browser = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # Drain both Windows pipes while the child is alive. Waiting for exit
        # first can deadlock even a valid JSON result on a small pipe buffer.
        for stream, target in zip([browser.stdout, browser.stderr], output_buffers):
            reader = threading.Thread(target=drain_output, args=(stream, target, output_overflow), daemon=True)
            reader.start()
            readers.append(reader)
        reads = 0
        while browser.poll() is None and reads < 24 and time.monotonic() < deadline:
            snapshot()
            reads += 1
            print(json.dumps({"phase": "CONCURRENT_READ_ONLY_AUDIT", "sample": reads, "status": snapshots[-1]["status"]}), flush=True)
            time.sleep(1)
        while browser.poll() is None and time.monotonic() < deadline:
            time.sleep(1)
        if browser.poll() is None:
            raise RuntimeError("OWNED_BROWSER_DEADLINE")
        for reader in readers:
            reader.join(timeout=5)
        if any(reader.is_alive() for reader in readers) or output_overflow[0]:
            raise RuntimeError("BROWSER_OUTPUT_LIMIT")
        for line in output_buffers[0].decode("utf8", "replace").splitlines():
            if line.startswith("{"):
                value = json.loads(line)
                if "result" in value:
                    browser_result = value
        checks.append({"test": "ACTUAL_ENCRYPTED_VIEWER_AUTH_NEGATIVES_REVOKE", "status": "PASS" if browser.returncode == 0 and browser_result.get("result") == "PASS" and browser_result.get("negativeImageBoundary", {}).get("result") == "PASS" and browser_result.get("revocationUi", {}).get("imageCleared") is True else "FAIL", "evidence": browser_result.get("evidence")})
        final = snapshot()
        overlapping = [row for row in snapshots if row["browserRunning"]]
        baseline_count = baseline.get("storedLinkDiagnostics", {}).get("recordCount", 0)
        final_count = final.get("storedLinkDiagnostics", {}).get("recordCount", 0)
        checks.append({"test": "MULTIPLE_ACTUAL_READ_ONLY_SNAPSHOTS_OVERLAP_WRITES", "status": "PASS" if len(overlapping) >= 3 and all(row["status"] == "PASS" for row in snapshots) and final_count > baseline_count else "FAIL", "overlappingSnapshots": len(overlapping), "baselineAuditCount": baseline_count, "finalAuditCount": final_count, "modifiedRecordCount": 0})
    except Exception as error:
        checks.append({"test": "CONCURRENT_AUDIT_GATE", "status": "NOT VERIFIED", "reason": str(error) if isinstance(error, RuntimeError) else type(error).__name__})
    finally:
        if browser is not None and browser.poll() is None:
            # Exact owned process tree only, never a generic Chrome/PowerShell kill.
            subprocess.run(["taskkill", "/PID", str(browser.pid), "/T", "/F"], capture_output=True, timeout=10)
            checks.append({"test": "BROWSER_DEADLINE_CLEANUP", "status": "NOT VERIFIED", "reason": "OWNED_TREE_STOPPED_PROFILE_CLEANUP_NOT_VERIFIED"})
        for reader in readers:
            reader.join(timeout=5)
    result = {"scope": "BOUNDED_SINGLE_SYNTHETIC_BROWSER_CONCURRENT_AUDIT_NOT_HA", "review": "DRAFT / UNASSIGNED", "cloudImageId": args.cloud_image_id, "checks": checks, "snapshots": snapshots, "elapsedSeconds": round(time.monotonic() - started, 3), "status": "PASS" if len(checks) == 2 and all(row["status"] == "PASS" for row in checks) else "FAIL" if any(row["status"] == "FAIL" for row in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({**result, "evidence": str(directory / "result.json")}), flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
