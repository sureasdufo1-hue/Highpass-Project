"""Reviewed local-task delta applied onto the current Azure runtime."""
import importlib.util,pathlib,difflib,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('period',ROOT/'scripts/security-period-release.py');release=importlib.util.module_from_spec(s);s.loader.exec_module(release)
release.FOLDER=ROOT/'artifacts/azure/security-detail-20261020';release.REMOTE='/opt/highpass/security-detail-20261020'
release.FILES={'control':['src/server.js','src/services.js','src/postgres-store.js','src/health-helper-rag.js','src/security-console.js','src/security-observatory-view.js'],'web':['public/ui/security-console.js','public/ui/security-console.css','scripts/start-public-web.js']}
release.NEW={'control':['src/helper-audit-metadata.js','src/security-detail-data.js','src/security-protection-status.js'],'web':['public/ui/security-detail-panels.js']}
def patch(name,old):
 if name=='scripts/start-public-web.js':
  anchor="  ['GET',/^\\/api\\/security\\/events$/],"
  assert old.count(anchor)==1
  return old.replace(anchor,anchor+"\n  ['GET',/^\\/api\\/security\\/protection$/],",1)
 before=(release.FOLDER/'task-base'/name).read_text(encoding='utf8').replace('\r\n','\n');after=(ROOT/name).read_text(encoding='utf8').replace('\r\n','\n')
 imports=[line for line in after.splitlines(True) if line.startswith('import ') and line not in before.splitlines(True)]
 for line in imports:after=after.replace(line,'',1)
 a,b=before.splitlines(True),after.splitlines(True)
 for group in difflib.SequenceMatcher(None,a,b,autojunk=False).get_grouped_opcodes(2):
  left=''.join(a[group[0][1]:group[-1][2]]);right=''.join(b[group[0][3]:group[-1][4]])
  if old.count(left)!=1:raise ValueError(f'LIVE_CONTEXT_CHANGED:{name}:{group[0][1]+1}')
  old=old.replace(left,right,1)
 for line in imports:
  if line.strip() in old:raise ValueError('IMPORT_ALREADY_PRESENT:'+name)
  old=line+old
 return old
release.patch=patch
original=release.prior.runtime.remote
def remote(client,role,password,source,timeout):
 source=source.replace('highpass-security-period:','highpass-security-detail:')
 source=source.replace("if not (part=='web' and m['Destination']=='/app/scripts/start-public-web.js')","if m['Destination']!='/run/security-protection/status.json' and not (part=='web' and m['Destination']=='/app/scripts/start-public-web.js')")
 return original(client,role,password,source,timeout)
release.prior.runtime.remote=remote
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='rollback':
  c=release.prior.runtime.connect('CLOUD',None)
  try:
   check=release.prior.runtime.remote(c,'CLOUD',None,"import subprocess,json;v=subprocess.check_output(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c','SELECT count(*) FROM audit_logs WHERE helper_metadata IS NOT NULL'],timeout=10).decode().strip();print(json.dumps({'newAuditCount':int(v)}))",20)
   if check['newAuditCount']:raise SystemExit('OLD_CONTROL_ROLLBACK_BLOCKED_NEW_HASHED_METADATA_EXISTS')
  finally:c.close()
 release.main()
