"""Bounded B incident inspection with concealed operator input."""
import getpass,importlib.util,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runtime',ROOT/'scripts/health-helper-runtime-check.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
password=getpass.getpass('B VM credential (concealed): ')
c=runtime.connect('B',password)
try:
 print(json.dumps(runtime.remote(c,'B',password,r'''
import subprocess,json
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=12);return p.returncode,p.stdout.decode(errors='replace')
_,raw=run(['docker','ps','-a','--format','{{json .}}']);items=[]
for line in raw.splitlines():
 i=json.loads(line);items.append({k:i.get(k) for k in ['Names','Status','Image']})
_,units=run(['systemctl','list-units','--all','--no-pager','--plain','--no-legend','highpass*'])
_,sockets=run(['ss','-lnt'])
_,mounts=run(['lsblk','-o','NAME,TYPE,MOUNTPOINTS'])
print(json.dumps({'containers':items,'units':units,'listeners':sockets,'storage':mounts}))
''',45)))
finally:c.close();password=None
