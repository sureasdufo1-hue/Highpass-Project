import importlib.util,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('detail',ROOT/'scripts/security-detail-release.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=m.release;r.FOLDER=ROOT/'artifacts/azure/security-detail-mobile-20261020';r.REMOTE='/opt/highpass/security-detail-mobile-20261020-v2'
r.FILES={'web':['public/ui/security-console.css','scripts/start-public-web.js']};r.NEW={'web':[]}
patch=r.patch
r.patch=lambda name,old:old if name=='scripts/start-public-web.js' else patch(name,old)
prior=r.prior.runtime.remote
def remote(client,role,password,source,timeout):return prior(client,role,password,source.replace("roles=['control','web'] if role=='CLOUD' else ['portal']","roles=['web'] if role=='CLOUD' else ['portal']").replace('highpass-security-period:','highpass-security-detail-mobile:'),timeout)
r.prior.runtime.remote=remote
if __name__=='__main__':r.main()
