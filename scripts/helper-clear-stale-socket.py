"""Remove only the proved stale helper socket, never a live listener."""
import pathlib,importlib.util,json
root=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('r',root/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);c=r.connect('CLOUD',None)
try:
 print(json.dumps(r.remote(c,'CLOUD',None,r'''
import pathlib,subprocess,stat,json
p=pathlib.Path('/home/highpassadmin/.highpass-helper/ollama.sock')
assert p.parent.resolve()==pathlib.Path('/home/highpassadmin/.highpass-helper') and not p.is_symlink()
st=p.stat();assert stat.S_ISSOCK(st.st_mode)
listeners=subprocess.check_output(['ss','-xlpn'],text=True,timeout=5)
assert str(p) not in listeners
assert p.stat().st_ino==st.st_ino
p.unlink()
print(json.dumps({'removed':'stale helper Unix socket only','liveListenerAbsent':True,'recovery':'reverse SSH will recreate socket'}))
''',15)))
finally:c.close()
