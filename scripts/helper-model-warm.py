"""Load the existing fixed local model; no patient input, no audit fabrication."""
import urllib.request,json,datetime,pathlib,time
t=time.monotonic();payload={'model':'qwen3.5:4b','stream':False,'keep_alive':'30m','prompt':'','options':{'num_ctx':2048}}
try:
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:11434/api/generate',data=json.dumps(payload).encode(),headers={'content-type':'application/json'}),timeout=180) as res:v=json.load(res)
 out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'loadOnly':True,'model':v.get('model'),'done':v.get('done'),'doneReason':v.get('done_reason'),'elapsedSeconds':round(time.monotonic()-t,2)}
except Exception as e:out={'status':'FAIL','safeErrorType':type(e).__name__}
p=pathlib.Path(__file__).resolve().parents[1]/'artifacts/azure/helper-recovery-20261020/model-warm.json';p.write_text(json.dumps(out,indent=2),encoding='utf8');print(json.dumps(out),flush=True)
