"""Create one isolated DISABLED Traffic Manager profile, never route user traffic.

Defaults to local template checks. --apply is explicitly required for Azure writes.
Only a new dedicated RG and one new profile are allowed; existing profiles are not
updated. No VM, firewall, public DNS record, Entra, key, database or app mutation.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import pathlib
import socket
import ssl
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUB = 'a3c0e7d4-ce09-4991-946b-88574869edd9'
TENANT = 'ad21525c-fc0f-4dbc-a403-67ce00add0e4'
GROUP = 'rg-highpass-dr-validation-20261016'
PROFILE = 'highpass-dr-lab-4869edd9'
PRIMARY_GROUP = 'rg-highpass-capstone-20261008'
PRIMARY_HOST = 'highpass-demo.japaneast.cloudapp.azure.com'
FQDN = PROFILE + '.trafficmanager.net'
RID = f'/subscriptions/{SUB}/resourceGroups/{GROUP}/providers/Microsoft.Network/trafficManagerProfiles/{PROFILE}'
TEMPLATE = ROOT / 'infra/azure/dr-traffic-manager.validation.json'
END = datetime(2026, 10, 20, 14, 59, tzinfo=timezone.utc)


def read_template():
    return json.loads(TEMPLATE.read_text(encoding='utf-8'))


def validate_template(template):
    """Exact allowlist: edited templates must never broaden the approved scope."""
    if set(template) != {'$schema', 'contentVersion', 'metadata', 'resources', 'outputs'}:
        raise ValueError('TEMPLATE_TOP_LEVEL_SCOPE_MISMATCH')
    resources = template.get('resources', [])
    if len(resources) != 1:
        raise ValueError('ONE_RESOURCE_REQUIRED')
    r = resources[0]
    if set(r) != {'type', 'apiVersion', 'name', 'location', 'tags', 'properties'}:
        raise ValueError('RESOURCE_SCOPE_MISMATCH')
    if (r['type'], r['apiVersion'], r['name'], r['location']) != (
            'Microsoft.Network/trafficManagerProfiles', '2022-04-01', PROFILE, 'global'):
        raise ValueError('RESOURCE_IDENTITY_MISMATCH')
    p = r['properties']
    expected = {
        'profileStatus': 'Disabled', 'trafficRoutingMethod': 'Priority',
        'trafficViewEnrollmentStatus': 'Disabled',
        'dnsConfig': {'relativeName': PROFILE, 'ttl': 30},
        'monitorConfig': {'protocol': 'HTTPS', 'port': 443, 'path': '/',
                          'intervalInSeconds': 30, 'timeoutInSeconds': 10,
                          'toleratedNumberOfFailures': 3,
                          'expectedStatusCodeRanges': [{'min': 200, 'max': 200}]},
        'endpoints': [{'name': 'primary-reference-disabled',
                       'type': 'Microsoft.Network/trafficManagerProfiles/externalEndpoints',
                       'properties': {'target': PRIMARY_HOST, 'endpointStatus': 'Disabled',
                                      'priority': 1, 'alwaysServe': 'Disabled'}}],
    }
    if p != expected:
        raise ValueError('DISABLED_VALIDATION_CONFIGURATION_REQUIRED')
    if r['tags'].get('managedBy') != 'highpass-dr-validation' or r['tags'].get('purpose') != 'isolated-dr-validation':
        raise ValueError('OWNERSHIP_TAGS_REQUIRED')
    return True


def check_what_if(result):
    if str(result.get('status', '')).lower() != 'succeeded':
        raise ValueError('WHAT_IF_NOT_SUCCEEDED')
    changes = result.get('changes', [])
    if len(changes) != 1 or changes[0].get('changeType') != 'Create' or changes[0].get('resourceId', '').lower() != RID.lower():
        raise ValueError('WHAT_IF_MUST_CREATE_ONLY_ISOLATED_PROFILE')
    return True


def verify_profile(value):
    p = value.get('properties', {})
    endpoints = p.get('endpoints', [])
    valid = (
        value.get('id', '').lower() == RID.lower()
        and p.get('profileStatus') == 'Disabled'
        and p.get('trafficRoutingMethod') == 'Priority'
        and p.get('trafficViewEnrollmentStatus') in (None, 'Disabled')
        and p.get('dnsConfig', {}).get('fqdn') == FQDN
        and p.get('dnsConfig', {}).get('ttl') == 30
        and len(endpoints) == 1
        and endpoints[0].get('name') == 'primary-reference-disabled'
        and endpoints[0].get('properties', {}).get('endpointStatus') == 'Disabled'
        and endpoints[0].get('properties', {}).get('target') == PRIMARY_HOST
        and endpoints[0].get('properties', {}).get('priority') == 1
        and endpoints[0].get('properties', {}).get('alwaysServe') == 'Disabled')
    if not valid:
        raise ValueError('LIVE_DISABLED_PROFILE_VERIFICATION_FAILED')
    return True


def cli():
    spec = importlib.util.spec_from_file_location('dr_cli', ROOT/'scripts/capstone-key-identities.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.azure


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def public_entry(path):
    request = urllib.request.Request('https://' + PRIMARY_HOST + path,
                                     headers={'User-Agent': 'Highpass-DR-isolation-check/1.0'})
    # Default trust store and hostname validation; no credentials or cookies.
    with urllib.request.urlopen(request, timeout=15, context=ssl.create_default_context()) as response:
        body = response.read(2 * 1024 * 1024 + 1)
        if response.status != 200 or len(body) > 2 * 1024 * 1024 or response.url != request.full_url:
            raise ValueError('PUBLIC_ENTRY_NOT_UNCHANGED_STATIC_HTTPS')
        return {'status': response.status, 'sha256': hashlib.sha256(body).hexdigest()}


def snapshot(azure):
    # Selected infrastructure/configuration only, not runtime secrets or account data.
    out = {}
    for kind, name in [('vm', 'vm-highpass-capstone'), ('network nsg', 'nsg-highpass-capstone')]:
        value = azure(*kind.split(), 'show', '-g', PRIMARY_GROUP, '-n', name, '--subscription', SUB)
        for transient in ('etag', 'systemData', 'provisioningState', 'timeCreated'):
            value.pop(transient, None)
        out[kind] = fingerprint(value)
    ips = azure('network', 'public-ip', 'list', '--subscription', SUB,
                '--query', "[?dnsSettings.fqdn=='" + PRIMARY_HOST + "'].{id:id,ip:ipAddress,dns:dnsSettings}")
    if len(ips) != 1:
        raise ValueError('UNIQUE_PRIMARY_PUBLIC_IP_REQUIRED')
    out['publicIp'] = ips
    # Track the existing public Entra client redirect configuration without PII.
    out['entraRedirects'] = azure('ad', 'app', 'show', '--id', '3f8bd8d2-4a43-4ec4-849b-788c5f49ba74',
                                   '--query', '{appId:appId,spa:spa.redirectUris,web:web.redirectUris,publicClient:publicClient.redirectUris}')
    out['publicDnsIpv4'] = sorted({x[4][0] for x in socket.getaddrinfo(PRIMARY_HOST, 443, socket.AF_INET)})
    out['entryPages'] = {path: public_entry(path) for path in ('/', '/mobile/')}
    return out


def verify_existing():
    """Read-only recheck of the last isolated deployment and DNS behavior."""
    folders = sorted(p for p in (ROOT/'artifacts/azure').glob('dr-validation-20*')
                     if p.is_dir() and (p/'before.json').is_file() and (p/'profile.json').is_file())
    if not folders:
        raise ValueError('PREVIOUS_DEPLOYMENT_EVIDENCE_REQUIRED')
    folder = folders[-1]
    azure = cli()
    account = azure('account', 'show', '--query', '{id:id,tenantId:tenantId,state:state}')
    if account != {'id': SUB, 'tenantId': TENANT, 'state': 'Enabled'}:
        raise ValueError('APPROVED_ENABLED_ACCOUNT_REQUIRED')
    profile = azure('rest', '--method', 'get', '--url',
                    'https://management.azure.com' + RID + '?api-version=2022-04-01')
    verify_profile(profile)
    before = json.loads((folder/'before.json').read_text(encoding='utf-8'))
    if before != snapshot(azure):
        raise ValueError('BASELINE_CHANGED_REQUIRES_REVIEW')
    # Windows workstation DNS client. A timeout/SERVFAIL is not accepted as NXDOMAIN.
    command = ("try { $answer = Resolve-DnsName -Name '" + FQDN + "' -Type A -DnsOnly -ErrorAction Stop; "
               "[pscustomobject]@{result='ANSWER'} | ConvertTo-Json } catch { "
               "[pscustomobject]@{result='DNS_ERROR';nativeErrorCode=$_.Exception.NativeErrorCode} | ConvertTo-Json }")
    process = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
                             capture_output=True, timeout=25)
    dns = json.loads(process.stdout.decode('utf-8-sig'))
    dns_ok = dns.get('result') == 'DNS_ERROR' and dns.get('nativeErrorCode') == 9003
    activity = azure('monitor', 'activity-log', 'list', '--resource-group', GROUP,
                     '--subscription', SUB, '--offset', '1h', '--query',
                     '[].{time:eventTimestamp,operation:operationName.value,status:status.value,resourceId:resourceId,correlationId:correlationId}')
    profile_write = any(x.get('resourceId', '').lower() == RID.lower()
                        and x.get('operation', '').lower() == 'microsoft.network/trafficmanagerprofiles/write'
                        and x.get('status') == 'Succeeded' for x in activity)
    result = {'scope': 'READ_ONLY_DISABLED_VALIDATION_RECHECK',
              'observedAt': datetime.now(timezone.utc).isoformat(),
              'status': 'PASS' if dns_ok else 'NOT VERIFIED', 'azureWrites': False,
              'profileDisabled': 'PASS', 'existingServiceBaselineUnchanged': 'PASS',
              'disabledDnsNxDomain': {'status': 'PASS' if dns_ok else 'NOT VERIFIED', 'observation': dns},
              'profileWriteActivityLog': 'PASS' if profile_write else 'NOT VERIFIED',
              'activityLog': activity, 'liveFailover': 'NOT VERIFIED',
              'note': 'Activity Log ingestion may lag; no new diagnostic export or alert connection was configured.'}
    path = folder/'post-verification.json'
    path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({**{k: v for k, v in result.items() if k != 'activityLog'}, 'evidence': str(path)}))
    return 0 if dns_ok else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true', help='Read-only recheck of the last lab deployment')
    args = parser.parse_args()
    validate_template(read_template())
    if args.verify:
        return verify_existing()
    if not args.apply:
        print(json.dumps({'localTemplate': 'PASS', 'azureWrites': False, 'profileStatus': 'Disabled'}))
        return 0
    if datetime.now(timezone.utc) >= END:
        raise ValueError('DEMO_WINDOW_EXPIRED')
    folder = ROOT/'artifacts/azure'/('dr-validation-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    folder.mkdir(parents=True, exist_ok=False)
    result = {'review': 'DRAFT / UNASSIGNED', 'scope': 'ISOLATED_DISABLED_TRAFFIC_MANAGER_ONLY',
              'status': 'NOT VERIFIED', 'resourceGroup': GROUP, 'profile': PROFILE,
              'standbyCreated': False, 'databaseChanged': False, 'liveFailover': 'NOT VERIFIED',
              'automaticCleanup': False, 'createdResources': [], 'checks': []}

    def save(name, value):
        (folder/(name+'.json')).write_text(json.dumps(value, indent=2), encoding='utf-8')

    phase = 'ACCOUNT'
    try:
        azure = cli()
        account = azure('account', 'show', '--query', '{id:id,tenantId:tenantId,state:state}')
        if account != {'id': SUB, 'tenantId': TENANT, 'state': 'Enabled'}:
            raise ValueError('APPROVED_ENABLED_ACCOUNT_REQUIRED')
        phase = 'BASELINE'
        before = snapshot(azure)
        save('before', before)
        profiles = azure('network', 'traffic-manager', 'profile', 'list', '--subscription', SUB)
        if any(x.get('name', '').lower() == PROFILE for x in profiles):
            raise ValueError('EXISTING_PROFILE_REQUIRES_SEPARATE_REVIEW_NO_OVERWRITE')
        phase = 'CREATE_ISOLATED_GROUP'
        if azure('group', 'exists', '-n', GROUP, '--subscription', SUB):
            group = azure('group', 'show', '-n', GROUP, '--subscription', SUB)
            resources = azure('resource', 'list', '-g', GROUP, '--subscription', SUB)
            if group.get('tags', {}).get('managedBy') != 'highpass-dr-validation' or resources:
                raise ValueError('NONEMPTY_OR_UNOWNED_GROUP_REJECTED')
        else:
            azure('group', 'create', '-n', GROUP, '-l', 'japaneast', '--subscription', SUB,
                  '--tags', 'project=Highpass', 'purpose=isolated-dr-validation',
                  'managedBy=highpass-dr-validation', 'demoEndUtc=2026-10-20T14:59:00Z')
            result['createdResources'].append('RESOURCE_GROUP')
            save('result', result)
        deployment = 'disabled-traffic-manager-validation'
        base = ('-g', GROUP, '--subscription', SUB, '-n', deployment, '--template-file', str(TEMPLATE))
        phase = 'ARM_VALIDATE'
        validated = azure('deployment', 'group', 'validate', *base)
        save('arm-validation', validated)
        result['checks'].append({'test': 'ARM_VALIDATION', 'status': 'PASS'})
        phase = 'WHAT_IF'
        planned = azure('deployment', 'group', 'what-if', *base, '--no-pretty-print')
        save('what-if', planned)
        check_what_if(planned)
        result['checks'].append({'test': 'CREATE_ONLY_WHAT_IF', 'status': 'PASS'})
        # Check local scope again immediately before applying the exact reviewed file.
        validate_template(read_template())
        phase = 'CREATE_DISABLED_PROFILE'
        receipt = azure('deployment', 'group', 'create', *base, '--mode', 'Incremental')
        save('deployment', receipt)
        result['createdResources'].append(RID)
        save('result', result)
        phase = 'VERIFY_DISABLED_PROFILE'
        profile = azure('rest', '--method', 'get', '--url',
                        'https://management.azure.com' + RID + '?api-version=2022-04-01')
        save('profile', profile)
        verify_profile(profile)
        result['checks'].append({'test': 'LIVE_DISABLED_PROFILE', 'status': 'PASS'})
        phase = 'VERIFY_EXISTING_SERVICE_UNCHANGED'
        after = snapshot(azure)
        save('after', after)
        if before != after:
            raise ValueError('BASELINE_CHANGED_REQUIRES_REVIEW')
        result['checks'].append({'test': 'PRIMARY_DNS_VM_NSG_ENTRA_AND_ENTRY_PAGES_UNCHANGED', 'status': 'PASS'})
        result['status'] = 'PASS'
        result['portalUrl'] = 'https://portal.azure.com/#@' + TENANT + '/resource' + RID + '/overview'
        result['validationDnsName'] = FQDN
    except Exception as error:
        result['checks'].append({'test': phase, 'status': 'FAIL',
                                 'reason': str(error) if isinstance(error, ValueError) else type(error).__name__})
        result['status'] = 'FAIL'
    finally:
        save('result', result)
    print(json.dumps({**result, 'evidence': str(folder/'result.json')}))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
