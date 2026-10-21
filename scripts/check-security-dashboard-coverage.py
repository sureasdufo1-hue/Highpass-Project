"""Read-only deployment coverage check; no auth bypass or data mutation."""
import importlib.util,pathlib,json,hashlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
ui=urllib.request.urlopen('https://highpass-demo.japaneast.cloudapp.azure.com/ui/security-console.js',timeout=20).read()
local=(ROOT/'public/ui/security-console.js').read_bytes()
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.connect('CLOUD',None)
try:
 live=r.remote(c,'CLOUD',None,r'''
import subprocess,json,hashlib
program="""const fs=require('fs'),crypto=require('crypto');const paths=['src/security-helper-monitor.js','src/security-console.js','src/health-helper-rag.js','src/security-console-http.js'];const out={};for(const p of paths){try{const v=fs.readFileSync('/app/'+p,'utf8');out[p]={sha256:crypto.createHash('sha256').update(v).digest('hex'),helperSummary:v.includes('summarizeHelper'),helperConnection:v.includes('helperConnection'),requestAuditHasModelFields:p.endsWith('health-helper-rag.js')?(/modelName|sourceIds|corpusVersion/.test(v.slice(v.indexOf('const log ='),v.indexOf('const reject =')))):undefined};}catch{out[p]={missing:true}}}console.log(JSON.stringify(out));"""
print(subprocess.check_output(['docker','exec','hp-capstone-control-control-1','/nodejs/bin/node','-e',program],timeout=15).decode())
''',25)
finally:c.close()
for name,item in live.items():
 path=ROOT/name
 item['matchesLocal']=path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==item.get('sha256')
text=ui.decode('utf8');print(json.dumps({'publicUiMatchesLocal':hashlib.sha256(ui).hexdigest()==hashlib.sha256(local).hexdigest(),'publicUiBytes':len(ui),'uiIsJavaScript':text.lstrip().startswith('import '),'uiFeatures':{x:x in text for x in ['건강도우미 · 응답과 연결','연결 확인:','같은 실행의 연결 기록','이벤트 탐색기','chart.helper','모델 이름','지식베이스 버전','sourceIds','hostnossl']},'control':live},ensure_ascii=False))
