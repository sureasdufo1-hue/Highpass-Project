"""Narrow delta on current Control image; preserve current TLS, auth and DB."""
import pathlib,importlib.util,difflib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('detail',ROOT/'scripts/security-detail-release.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=m.release
r.FOLDER=ROOT/'artifacts/azure/helper-version-20261020';r.REMOTE='/opt/highpass/helper-version-20261020'
r.FILES={'control':['src/helper-audit-metadata.js','src/health-helper-candidate-generation.js','src/health-helper-patient-translation.js','src/health-helper-rag.js','src/health-helper-ollama.js']};r.NEW={'control':[]}
def patch(name,old):
 before=(r.FOLDER/'task-base'/name).read_text(encoding='utf8').replace('\r\n','\n');after=(ROOT/name).read_text(encoding='utf8').replace('\r\n','\n')
 a,b=before.splitlines(True),after.splitlines(True)
 for group in difflib.SequenceMatcher(None,a,b,autojunk=False).get_grouped_opcodes(3):
  left=''.join(a[group[0][1]:group[-1][2]]);right=''.join(b[group[0][3]:group[-1][4]])
  if old.count(left)!=1:raise ValueError('LIVE_CONTEXT_CHANGED:'+name)
  old=old.replace(left,right,1)
 return old
r.patch=patch
prior=r.prior.runtime.remote
def remote(client,role,password,source,timeout):
 return prior(client,role,password,source.replace("roles=['control','web'] if role=='CLOUD' else ['portal']","roles=['control'] if role=='CLOUD' else ['portal']").replace('highpass-security-period:','highpass-helper-version:'),timeout)
r.prior.runtime.remote=remote
if __name__=='__main__':r.main()
