"""Read-only Azure/host evidence. No deployment, auth bypass, promotion or raw secrets.

Selected metadata is collected, not an azqr/compliance certification. Raw output is
local-only; publication copies redact identifiers and addresses. No secret APIs.
"""
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUB = 'a3c0e7d4-ce09-4991-946b-88574869edd9'
RG = 'rg-highpass-capstone-20261008'
DR = 'rg-highpass-dr-standby-20261016'
TM_RG = 'rg-highpass-dr-validation-20261016'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def redact(value):
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r'(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', '[ID REDACTED]', value)
    value = re.sub(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?(?![\w.])', '[ADDRESS REDACTED]', value)
    return re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[ACCOUNT REDACTED]', value)


def main():
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = ROOT / 'artifacts' / 'azure' / ('architecture-evidence-' + stamp)
    folder.mkdir(parents=True, exist_ok=False)
    (folder / 'publication').mkdir()
    identity = load('evidence_identity', 'capstone-key-identities.py')
    azure = identity.azure
    checks = []

    def collect(label, function):
        observed = datetime.now(timezone.utc).isoformat()
        try:
            data = function()
            status = 'PASS' if data is not None else 'NOT VERIFIED'
        except Exception as error:
            data = {'errorClass': type(error).__name__}
            status = 'NOT VERIFIED'
        entry = {'observedAt': observed, 'kind': 'READ_ONLY_QUERY_OUTPUT',
                 'subject': label, 'status': status, 'data': data}
        raw = folder / (label + '.json')
        raw.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding='utf-8')
        public = folder / 'publication' / raw.name
        public.write_text(json.dumps(redact(entry), ensure_ascii=False, indent=2), encoding='utf-8')
        checks.append({'subject': label, 'status': status, 'observedAt': observed,
                       'raw': raw.name, 'publication': 'publication/' + raw.name,
                       'sha256': hashlib.sha256(public.read_bytes()).hexdigest()})
        print(json.dumps({'subject': label, 'status': status}), flush=True)
        return data

    account = azure('account', 'show', '--query', '{id:id,state:state}')
    if account != {'id': SUB, 'state': 'Enabled'}:
        raise ValueError('EXPECTED_ENABLED_SUBSCRIPTION_REQUIRED')
    collect('01-resources', lambda: azure('resource', 'list', '--subscription', SUB,
        '--query', '[].{name:name,type:type,region:location,group:resourceGroup}'))
    for label, group, name in [('02-primary-nsg', RG, 'nsg-highpass-capstone'),
                                ('03-standby-nsg', DR, 'nsg-highpass-dr-standby')]:
        collect(label, lambda g=group, n=name: azure('network', 'nsg', 'show', '-g', g, '-n', n,
            '--subscription', SUB, '--query', '{name:name,rules:securityRules[].{name:name,priority:priority,direction:direction,protocol:protocol,access:access,source:sourceAddressPrefix,sources:sourceAddressPrefixes,destination:destinationAddressPrefix,ports:destinationPortRanges,port:destinationPortRange}}'))
    for label, group, name in [('04-primary-vm', RG, 'vm-highpass-capstone'),
                                ('05-standby-vm', DR, 'vm-highpass-dr-standby')]:
        collect(label, lambda g=group, n=name: azure('vm', 'show', '-d', '-g', g, '-n', n,
            '--subscription', SUB, '--query', '{name:name,region:location,size:hardwareProfile.vmSize,state:powerState,provisioningState:provisioningState,identityType:identity.type,security:securityProfile}'))
    collect('06-traffic-manager', lambda: azure('network', 'traffic-manager', 'profile', 'show',
        '-g', TM_RG, '-n', 'highpass-dr-lab-4869edd9', '--subscription', SUB,
        '--query', '{name:name,state:profileStatus,routing:trafficRoutingMethod,dns:dnsConfig,monitor:monitorConfig,endpoints:endpoints[].{name:name,status:endpointStatus,target:target,priority:priority,monitorStatus:endpointMonitorStatus}}'))
    for index, name in enumerate(['kv-hp-demo-4869edd9', 'kv-hp-recover-4869edd9'], 7):
        collect(f'{index:02d}-vault', lambda n=name: azure('keyvault', 'show', '-g', RG, '-n', n,
            '--subscription', SUB, '--query', '{name:name,region:location,properties:{purgeProtection:properties.enablePurgeProtection,softDelete:properties.enableSoftDelete,retentionDays:properties.softDeleteRetentionInDays,rbac:properties.enableRbacAuthorization,publicNetwork:properties.publicNetworkAccess,networkRules:properties.networkAcls,privateEndpoints:properties.privateEndpointConnections[].privateLinkServiceConnectionState.status}}'))
        resource = f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.KeyVault/vaults/{name}'
        collect(f'{index:02d}-vault-diagnostics', lambda r=resource: azure('monitor', 'diagnostic-settings', 'list',
            '--resource', r, '--subscription', SUB,
            '--query', '[].{name:name,workspaceId:workspaceId,logs:logs,metrics:metrics}'))
    collect('09-log-workspace', lambda: azure('monitor', 'log-analytics', 'workspace', 'show',
        '-g', RG, '-n', 'law-highpass-key-audit-20261013', '--subscription', SUB,
        '--query', '{name:name,region:location,retentionInDays:retentionInDays,sku:sku,publicQuery:publicNetworkAccessForQuery,publicIngestion:publicNetworkAccessForIngestion,features:features}'))
    collect('10-private-endpoints', lambda: azure('network', 'private-endpoint', 'list', '-g', RG,
        '--subscription', SUB, '--query', '[].{name:name,region:location,connections:privateLinkServiceConnections[].{groups:groupIds,state:privateLinkServiceConnectionState.status}}'))

    def host_metadata():
        helper = load('evidence_host', 'health-helper-runtime-check.py')
        client = helper.connect('CLOUD', None)
        try:
            return helper.remote(client, 'CLOUD', None, r'''
import subprocess,json,pathlib,re,time,hashlib
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=12)
 return p.returncode,p.stdout.decode(errors='replace')
names=['hp-capstone-control-control-1','hp-capstone-control-postgres-1','hp-capstone-control-ingress-1','hp-public-web-web-1','hp-public-web-waf-1','hp-security-audit-reader']
rc,raw=run(['docker','inspect',*names]);assert rc==0
items=json.loads(raw);out=[];configs=[]
allowed=['AUTH_MODE','HIPASS_CONTROL_PLANE_ONLY','HIPASS_DPOP_REQUIRED','HIPASS_CAPSTONE_MOCK_IDP','CAPSTONE_ENTRA_LOGIN_ENABLED']
for i in items:
 env=dict(x.split('=',1) for x in i['Config']['Env'] if '=' in x)
 out.append({'name':i['Name'],'image':i['Image'],'running':i['State']['Running'],'health':i['State'].get('Health',{}).get('Status'),'startedAt':i['State']['StartedAt'],'securityFlags':{k:env[k] for k in allowed if k in env},'readOnlyRootfs':i['HostConfig'].get('ReadonlyRootfs'),'securityOpt':i['HostConfig'].get('SecurityOpt'),'publishedPorts':i['HostConfig']['PortBindings']})
 if i['Name']=='/hp-public-web-waf-1':
  for m in i['Mounts']:
   if m['Destination']=='/etc/caddy/Caddyfile':
    b=pathlib.Path(m['Source']).read_bytes();text=b.decode()
    directives=[]
    for line in text.splitlines():
     s=line.strip()
     if re.match(r'^(SecRuleEngine|SecAuditEngine|SecAuditLogParts|SecRequestBodyAccess|SecResponseBodyAccess|Include|tls|protocols|coraza_waf)\b',s):
      directives.append(s[:180])
    configs.append({'destination':m['Destination'],'sha256':hashlib.sha256(b).hexdigest(),'selectedDirectives':directives,'fullConfigNotPersisted':True})
rc,interfaces=run(['wg','show','interfaces']);wg=[]
if rc==0:
 for interface in interfaces.split():
  _,handshake=run(['wg','show',interface,'latest-handshakes'])
  _,traffic=run(['wg','show',interface,'transfer'])
  transfers={line.split()[0]:line.split()[1:] for line in traffic.splitlines()}
  peers=[]
  for number,line in enumerate(handshake.splitlines(),1):
   public,timestamp=line.split();ts=int(timestamp)
   peers.append({'peer':number,'handshakeAgeSeconds':round(time.time()-ts) if ts else None,'receivedBytes':int(transfers.get(public,['0','0'])[0]),'sentBytes':int(transfers.get(public,['0','0'])[1])})
  wg.append({'interface':interface,'peers':peers,'keysAndEndpointsExcluded':True})
_,timer=run(['systemctl','is-active','highpass-waf-audit.timer'])
print(json.dumps({'containers':out,'wafConfig':configs,'wireGuard':wg,'wafCollectorTimer':timer.strip(),'noPrivateKeysRead':True,'noRawRequestsOrTokenValuesPersisted':True}))
''', 55)
        finally:
            client.close()
    collect('11-primary-security-runtime', host_metadata)
    manifest = {'createdAt': datetime.now(timezone.utc).isoformat(),
        'review': 'DRAFT / UNASSIGNED', 'purpose': 'SYNTHETIC_MVP_EVIDENCE',
        'note': 'PASS means selected query succeeded, not full security/clinical certification.',
        'liveChangesPerformed': False, 'failoverExecuted': False,
        'checks': checks, 'portalCapture': 'PENDING_OPERATOR_AUTHENTICATION'}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'evidenceFolder': str(folder), 'checks': len(checks),
                      'notVerified': sum(x['status'] != 'PASS' for x in checks)}))


if __name__ == '__main__':
    main()
