"""Upload metadata-only diagnostics through the existing pinned SSH trust."""
import pathlib,importlib.util,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);c=r.connect('CLOUD',None)
try:
 with c.open_sftp() as ftp:ftp.put(str(ROOT/'scripts/linux-terminal-evidence.py'),'/home/highpassadmin/.terminal-evidence.py');ftp.chmod('/home/highpassadmin/.terminal-evidence.py',0o600)
 print(json.dumps(r.remote(c,'CLOUD',None,"import pathlib,json,hashlib;src=pathlib.Path('/home/highpassadmin/.terminal-evidence.py');d=pathlib.Path('/opt/highpass/terminal-evidence-20261020');d.mkdir(mode=0o700,exist_ok=True);p=d/'read-only.py';p.write_bytes(src.read_bytes());p.chmod(0o600);print(json.dumps({'installed':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}))",20)))
finally:c.close()
