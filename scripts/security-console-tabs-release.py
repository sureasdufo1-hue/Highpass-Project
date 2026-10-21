"""Web-only tabbed security dashboard rollout on the captured live baseline."""
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reason_release', ROOT / 'scripts/security-reason-guide-release.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
release = module.release
release.FOLDER = ROOT / 'artifacts/azure/security-console-tabs-20261019'
release.REMOTE = '/opt/highpass/security-console-tabs-20261019'
release.FILES = {'web': ['public/ui/security-console.js', 'public/ui/security-console.css',
                         'public/ui/security-period-panel.js', 'scripts/start-public-web.js']}
previous_remote = release.previous.runtime.remote

def remote(client, role, password, source, timeout):
    source = source.replace('highpass-patient-viewer:', 'highpass-security-console-tabs:')
    return previous_remote(client, role, password, source, timeout)

release.previous.runtime.remote = remote
if __name__ == '__main__':
    release.main()
