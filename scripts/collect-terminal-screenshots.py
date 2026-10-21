"""Coordinate CLI queries and screenshot-only native window capture. No UI input."""
import pathlib,json,time,subprocess,sys
import psutil
psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS);psutil.Process().ionice(psutil.IOPRIO_NORMAL)
root=pathlib.Path.home()/'Downloads'/'MediQ_리눅스터미널_증적_20261020'
panels=['01-runtime','02-services','03-wireguard','04-audit-summary','05-qr','06-consent','07-denial','08-helper-results','09-helper-requests','10-helper-metadata','11-helper-connection','12-storage','13-db-tls','14-plaintext-deny','15-hash-columns','16-protection-snapshot','17-system-audit']
handle=sys.argv[1]
if len(sys.argv)>2:root=pathlib.Path(sys.argv[2])
if len(sys.argv)>3:panels=sys.argv[3].split(',')
results=json.loads((root/'capture-results.json').read_text(encoding='utf8')) if (root/'capture-results.json').exists() else []
for panel in panels:
 (root/'control.json').write_text(json.dumps({'panel':panel,'stop':False}),encoding='utf8')
 deadline=time.monotonic()+150
 while time.monotonic()<deadline:
  try:done=json.loads((root/'completed.json').read_text(encoding='utf-8-sig'))
  except (FileNotFoundError,json.JSONDecodeError):done={}
  if done.get('panel')==panel:break
  time.sleep(.5)
 else:raise RuntimeError('TIMEOUT '+panel)
 if done.get('exit')!=0:raise RuntimeError('SSH_FAILED '+panel)
 time.sleep(.8)
 p=subprocess.run([sys.executable,'scripts/capture-terminal-window.py',handle,str(root/'original'/f'{panel}.png')],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=40)
 if p.returncode:raise RuntimeError('CAPTURE_FAILED '+panel+' '+p.stderr)
 transcript=(root/'transcripts'/f'{panel}.txt').read_text(encoding='utf-16')
 results=[x for x in results if x['panel']!=panel]
 results.append({'panel':panel,'sshExit':done['exit'],'capturedAt':done['completedAt'],'observationComplete':'[OBSERVATION COMPLETE]' in transcript,'queryFailure':'QUERY_FAILED' in transcript,'lines':len(transcript.splitlines())})
 (root/'capture-results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
 print(json.dumps(results[-1]),flush=True)
print('CAPTURE_COMPLETE',flush=True)
