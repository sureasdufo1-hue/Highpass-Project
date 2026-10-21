"""Read-only supplement: live TLS, unauthenticated denial, metadata and log counts."""
import importlib.util
import json
import pathlib
import re
import ssl
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
def load(name, file):
    spec=importlib.util.spec_from_file_location(name, ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
collector=load('collector','collect-architecture-evidence.py')
folder=sorted((ROOT/'artifacts/azure').glob('architecture-evidence-*'))[-1]
def save(name,data):
    item={'observedAt':datetime.now(timezone.utc).isoformat(),'kind':'READ_ONLY_QUERY_OUTPUT','data':data}
    (folder/(name+'.json')).write_text(json.dumps(item,ensure_ascii=False,indent=2),encoding='utf8')
    (folder/'publication'/(name+'.json')).write_text(json.dumps(collector.redact(item),ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'saved':name}),flush=True)

identity=load('evidence_extra_identity','capstone-key-identities.py')
for index,name in enumerate(['kv-hp-demo-4869edd9','kv-hp-recover-4869edd9'],7):
    data=identity.azure('keyvault','show','-n',name,'--subscription',collector.SUB,'--query',
        '{name:name,region:location,properties:{purgeProtection:properties.enablePurgeProtection,softDelete:properties.enableSoftDelete,retentionDays:properties.softDeleteRetentionInDays,rbac:properties.enableRbacAuthorization,publicNetwork:properties.publicNetworkAccess,privateEndpoints:properties.privateEndpointConnections[].privateLinkServiceConnectionState.status}}')
    save(f'{index:02d}-vault-corrected',data)

probes=[]
for label,url in [
 ('WEB_ENTRY','https://highpass-demo.japaneast.cloudapp.azure.com/hipass/'),
 ('MOBILE_ENTRY','https://highpass-demo.japaneast.cloudapp.azure.com/mobile/'),
 ('PROOF_POLICY','https://highpass-demo.japaneast.cloudapp.azure.com/api/security/proof-policy'),
 ('AUDIT_NO_AUTH','https://highpass-demo.japaneast.cloudapp.azure.com/api/security/events'),
 ('CLINICIAN_IMAGE_NO_AUTH','https://highpass-images-b.japaneast.cloudapp.azure.com/dicomweb/studies'),
 ('PATIENT_IMAGE_NO_AUTH','https://highpass-images-b.japaneast.cloudapp.azure.com/patient-dicomweb/studies?StudyInstanceUID=1.2.3')]:
    result={'test':label,'url':url,'credentialsSent':False,'method':'GET'}
    try:
        try:r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MediQ-Evidence-ReadOnly/1.0'}),context=ssl.create_default_context(),timeout=15)
        except urllib.error.HTTPError as error:r=error
        with r:
            body=r.read(4096);result.update(httpStatus=r.status,tlsVerified=True,cacheControl=r.headers.get('cache-control'))
        try:
            obj=json.loads(body)
            result['safeResponse']={k:v for k,v in obj.items() if k in ('error','reason','required','supported','replayScope') and isinstance(v,(str,bool,int))}
        except (ValueError,AttributeError):pass
        expected=200 if label in ('WEB_ENTRY','MOBILE_ENTRY','PROOF_POLICY') else (401,403)
        result['status']='PASS' if (result['httpStatus']==expected if isinstance(expected,int) else result['httpStatus'] in expected) else 'FAIL'
    except Exception as error:result.update(status='NOT VERIFIED',errorClass=type(error).__name__)
    probes.append(result)
save('14-public-tls-negative-probes',probes)

helper=load('evidence_extra_host','health-helper-runtime-check.py')
c=helper.connect('CLOUD',None)
try:
    data=helper.remote(c,'CLOUD',None,r'''
import subprocess,json
def sql(query):
 p=subprocess.run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',"BEGIN READ ONLY;SET LOCAL statement_timeout='5s';"+query+';ROLLBACK;'],capture_output=True,check=True,timeout=10)
 return json.loads(p.stdout)
proof=sql("SELECT json_build_object('present',to_regclass('public.dpop_replay_entries') IS NOT NULL,'columns',(SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns WHERE table_name='dpop_replay_entries' AND table_schema='public'))")
audit=sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT action,result,count(*) AS events FROM audit_logs WHERE created_at > now()-interval '24 hours' GROUP BY action,result ORDER BY count(*) DESC LIMIT 12) t")
i=json.loads(subprocess.check_output(['docker','inspect','hp-capstone-control-control-1'],timeout=10))[0]
env=dict(v.split('=',1) for v in i['Config']['Env'] if '=' in v)
print(json.dumps({'replayLedger':proof,'auditLast24hAggregates':audit,'tokenTtlMinutesEnvironment':env.get('DICOM_TOKEN_TTL_MINUTES','not set; inspect code default'),'noTokenValuesRead':True,'positiveTokenReplayTest':'NOT VERIFIED in this capture session'}))
''',30)
    save('15-policy-audit-metadata',data)
finally:c.close()

p=subprocess.run(['C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe',str(ROOT/'scripts/security-log-sources-inspect.py')],capture_output=True,timeout=150)
if p.returncode==0:
    save('16-waf-entra-source-check',json.loads(p.stdout))
else:save('16-waf-entra-source-check',{'status':'NOT VERIFIED','exitCode':p.returncode})
print(json.dumps({'folder':str(folder)}))
