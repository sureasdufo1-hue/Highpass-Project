"""Guarded Control/Web RAG observability overlay; preserves current runtime files."""
import importlib.util,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('period',ROOT/'scripts/security-period-release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
release.FOLDER=ROOT/'artifacts/azure/security-helper-monitor-20261019'
release.REMOTE='/opt/highpass/security-helper-monitor-20261019'
release.FILES={'control':['src/server.js','src/security-console.js'],'web':['public/ui/security-console.js','public/ui/security-console.css','scripts/start-public-web.js']}
release.NEW={'control':['src/security-helper-monitor.js'],'web':[]}
original_remote=release.prior.runtime.remote
def remote(client,role,password,source,timeout):
    return original_remote(client,role,password,source.replace('highpass-security-period:','highpass-security-helper-monitor:'),timeout)
release.prior.runtime.remote=remote
if __name__=='__main__':release.main()
