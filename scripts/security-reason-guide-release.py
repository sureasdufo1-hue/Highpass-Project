"""Web-only reason guide overlay using the existing guarded rollout and rollback."""
import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('polish', ROOT / 'scripts/viewer-access-polish-release.py')
polish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(polish)
release = polish.release
release.FOLDER = ROOT / 'artifacts/azure/security-reason-guide-20261019'
release.REMOTE = '/opt/highpass/security-reason-guide-20261019'
release.FILES = {'web': ['public/ui/security-console.js', 'public/ui/security-console.css',
                         'public/ui/security-report.js', 'scripts/start-public-web.js']}
release.NEW = []
previous_remote = release.previous.runtime.remote

def remote(client, role, password, source, timeout):
    source = source.replace('highpass-viewer-access-polish:', 'highpass-security-reason-guide:')
    source = source.replace('highpass-patient-viewer:', 'highpass-security-reason-guide:')
    return previous_remote(client, role, password, source, timeout)

release.previous.runtime.remote = remote
if __name__ == '__main__':
    release.main()
