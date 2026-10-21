"""Exact-context Control-only TLS overlay; no DB/DR restart."""
import importlib.util,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('period',ROOT/'scripts/security-period-release.py')
release=importlib.util.module_from_spec(s);s.loader.exec_module(release)
release.FOLDER=ROOT/'artifacts/azure/db-tls-20261019'
release.REMOTE='/opt/highpass/db-tls-20261019'
release.FILES={'control':['src/server.js','src/postgres-store.js','src/dpop-replay-store.js','src/patient-self-view-grant-runtime.js','src/pacs-transfer-job-runtime.js']}
release.NEW={'control':['src/postgres-tls.js']}
original=release.prior.runtime.remote
def remote(client,role,password,source,timeout):
 source=source.replace("roles=['control','web'] if role=='CLOUD' else ['portal']","roles=['control'] if role=='CLOUD' else ['portal']").replace('highpass-security-period:','highpass-db-tls:')
 source=source.replace("if not (part=='web' and m['Destination']=='/app/scripts/start-public-web.js')", "if m['Destination']!='/run/db-tls/ca.crt' and not (part=='web' and m['Destination']=='/app/scripts/start-public-web.js')")
 source=source.replace("allowed={'HIPASS_PATIENT_IMAGE_ORIGIN','HIPASS_PATIENT_ISSUANCE_ORIGIN'}", "allowed={'HIPASS_PATIENT_IMAGE_ORIGIN','HIPASS_PATIENT_ISSUANCE_ORIGIN','HIPASS_POSTGRES_TLS_REQUIRED','HIPASS_POSTGRES_TLS_CA_FILE','HIPASS_POSTGRES_TLS_SERVERNAME'}")
 return original(client,role,password,source,timeout)
release.prior.runtime.remote=remote
if __name__=='__main__':release.main()
