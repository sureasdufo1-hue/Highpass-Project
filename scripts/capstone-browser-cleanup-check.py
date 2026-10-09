"""Expected early browser stop proves exact owned consent cleanup, not demo success."""
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    directory = ROOT / 'artifacts/workstation' / ('browser-cleanup-' + datetime.now(timezone.utc).isoformat().replace(':', '-'))
    directory.mkdir(parents=True)
    env = dict(os.environ)
    for key in ['HIPASS_BROWSER_DIAGNOSTICS', 'HIPASS_BROWSER_OUTAGE_DIR', 'HIPASS_BROWSER_LIVE_POLICY']:
        env.pop(key, None)
    env['HIPASS_BROWSER_TEST_STOP_AFTER_CONSENT'] = '1'
    result = {'scope': 'EXPECTED_EARLY_STOP_OWNED_CONSENT_CLEANUP_ONLY_NOT_COMPLETE_DEMO',
              'review': 'DRAFT / UNASSIGNED', 'status': 'NOT VERIFIED', 'automaticRetries': 0}
    try:
        process = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                                  'scripts/run-browser-authorization-trace.ps1', '-Port', '9231', '-BrowserUrl',
                                  'https://192.168.111.149:9443/hipass/', '-Capstone', '-NegativeBoundary'],
                                 cwd=ROOT, env=env, capture_output=True, timeout=235)
        raw = process.stdout.decode('utf8', errors='replace')
        offset = raw.find('{"generatedAt"')
        if offset < 0:
            raise RuntimeError('BROWSER_RESULT_NOT_STRUCTURED')
        trace, _ = json.JSONDecoder().raw_decode(raw[offset:])
        cleanup = trace.get('ownedConsentCleanup', {})
        stopped = trace.get('pageState', {}).get('ownedCleanupTestStop') is True
        passed = (process.returncode == 1 and trace.get('result') == 'FAIL' and stopped and
                  cleanup.get('status') == 'PASS' and cleanup.get('effectiveStatus') == 'REVOKED' and
                  cleanup.get('recordsDeleted') == 0 and cleanup.get('httpStatuses') == [200, 200, 200])
        result.update(status='PASS' if passed else 'NOT VERIFIED', originalDemoResult=trace.get('result'),
                      exitCode=process.returncode, expectedStopObserved=stopped,
                      cleanup=cleanup, browserEvidence=trace.get('evidence'))
    except Exception as error:
        result['reason'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    evidence = directory / 'result.json'
    evidence.write_text(json.dumps(result, indent=2), encoding='utf8')
    print(json.dumps({**result, 'evidence': str(evidence)}), flush=True)
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
