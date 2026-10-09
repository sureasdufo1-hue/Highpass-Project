"""Three sequential fresh-browser demo runs; no debugger, retries or fault injection."""
import hashlib
import argparse
import json
import os
import pathlib
import subprocess
import time
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent


def phantom_result_matches(result, modality):
    phantom = result.get('phantom') or {}
    return (phantom.get('result') == 'PASS' and phantom.get('modality') == modality
            and phantom.get('instanceCount') == 12 and phantom.get('uniqueInstances') == 12
            and all(phantom.get(field) is True for field in ['exactInstances', 'dimensions256', 'nextSlice']))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phantom-modality', choices=['CT', 'MR'])
    args = parser.parse_args()
    directory = ROOT / "artifacts/workstation" / ("browser-repeat-" + datetime.now(timezone.utc).isoformat().replace(":", "-"))
    directory.mkdir(parents=True)
    env = dict(os.environ)
    for key in ["HIPASS_BROWSER_DIAGNOSTICS", "HIPASS_BROWSER_OUTAGE_DIR", "HIPASS_BROWSER_LIVE_POLICY", "HIPASS_BROWSER_TEST_STOP_AFTER_CONSENT"]:
        env.pop(key, None)
    checks = []
    started = time.monotonic()
    for index in range(1, 4):
        print(json.dumps({"phase": "FRESH_BROWSER", "run": index, "status": "RUNNING", "debugger": False}), flush=True)
        row = {"run": index, "status": "NOT VERIFIED"}
        try:
            command = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                                      "scripts/run-browser-authorization-trace.ps1", "-Port", "9231", "-BrowserUrl",
                                      "https://192.168.111.149:9443/hipass/", "-Capstone", "-NegativeBoundary"]
            if args.phantom_modality:
                command += ['-PhantomModality', args.phantom_modality]
            process = subprocess.run(command,
                                     cwd=ROOT, env=env, capture_output=True, timeout=235)
            raw = process.stdout.decode("utf8", errors="replace")
            offset = raw.find('{"generatedAt"')
            if offset < 0:
                raise RuntimeError("BROWSER_RESULT_NOT_STRUCTURED")
            result, _ = json.JSONDecoder().raw_decode(raw[offset:])
            row = {"run": index, "exitCode": process.returncode, "status": result.get("result", "NOT VERIFIED"),
                   "evidence": result.get("evidence"), "viewerRender": result.get("viewerRender"),
                   "linkage": result.get("singleTransferLinkage"), "revocationAcknowledged": result.get("revocationAcknowledged"),
                   "uiStage": result.get("pageState", {}).get("uiProbeStage"),
                   "safeReasonCode": result.get("pageState", {}).get("reasonCode"),
                   "safeApiResponses": result.get("safeApiResponses", []), "debugger": False}
            if args.phantom_modality:
                row['phantom'] = result.get('phantom')
                if not phantom_result_matches(result, args.phantom_modality):
                    row['status'] = 'FAIL'
            if process.returncode or result.get("result") != "PASS":
                row["status"] = "FAIL"
        except Exception as error:
            row["reason"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        checks.append(row)
        (directory / "state.json").write_text(json.dumps({"review": "DRAFT / UNASSIGNED", "checks": checks}, indent=2), encoding="utf8")
        if row["status"] != "PASS":
            break  # Never retry away a failure or reuse a failed browser session.
    passed = len(checks) == 3 and all(row["status"] == "PASS" for row in checks)
    result = {"scope": "THREE_SEQUENTIAL_FRESH_BUILT_IN_SYNTHETIC_VIEWER_RUNS_NOT_LOAD_OR_HA",
              "review": "DRAFT / UNASSIGNED", "checks": checks, "status": "PASS" if passed else "NOT VERIFIED",
              "debugger": False, "automaticRetries": 0, "elapsedSeconds": round(time.monotonic() - started, 3),
              "verifierSha256": hashlib.sha256((ROOT / "scripts/browser-authorization-trace.js").read_bytes()).hexdigest()}
    if args.phantom_modality:
        result['scope'] = 'THREE_SEQUENTIAL_FRESH_FIXED_PHANTOM_VIEWER_RUNS_NOT_LOAD_OR_HA'
        result['phantomModality'] = args.phantom_modality
    (directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps({"status": result["status"], "checks": [{key: value for key, value in row.items() if key != "safeApiResponses"} for row in checks],
                      "elapsedSeconds": result["elapsedSeconds"], "evidence": str(directory / "result.json")}), flush=True)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
