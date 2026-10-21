"""Read-only DR inventory and fail-closed plan builder; never deploys or promotes.

No credentials, DB contents, environment variables or raw CLI errors are emitted.
Do not treat a generated plan as release approval or runtime readiness.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import importlib.util
import ipaddress
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUB = 'a3c0e7d4-ce09-4991-946b-88574869edd9'
TENANT = 'ad21525c-fc0f-4dbc-a403-67ce00add0e4'
PRIMARY_RG = 'rg-highpass-capstone-20261008'
PRIMARY_HOST = 'highpass-demo.japaneast.cloudapp.azure.com'
PRIMARY_VM = 'vm-highpass-capstone'
SIZE = 'Standard_B2als_v2'
END = '2026-10-20T14:59:00+00:00'  # User: through Oct 20; 23:59 KST assumption.


def parse_time(value):
    if not isinstance(value, str):
        raise ValueError('EXPLICIT_TIMESTAMP_REQUIRED')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('EXPLICIT_TIMEZONE_REQUIRED')
    return parsed.astimezone(timezone.utc)


def canonical_host(value):
    if not isinstance(value, str) or len(value) > 300:
        raise ValueError('HOST_INVALID')
    url = urllib.parse.urlsplit(value if '://' in value else 'https://' + value)
    if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443):
        raise ValueError('HTTPS_HOST_REQUIRED')
    if url.path not in ('', '/') or url.query or url.fragment:
        raise ValueError('HOST_WITHOUT_PATH_REQUIRED')
    host = (url.hostname or '').lower().rstrip('.')
    if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', host):
        raise ValueError('PUBLIC_DNS_HOST_REQUIRED')
    return host


def geography(region):
    # Explicitly reviewed candidate regions; not a universal Azure geography map.
    return {'japaneast': 'Japan', 'japanwest': 'Japan', 'eastasia': 'Asia Pacific',
            'southeastasia': 'Asia Pacific', 'centralindia': 'India',
            'malaysiawest': 'Malaysia'}.get(region)


def make_plan(inventory, hostname=PRIMARY_HOST, region='eastasia', now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('EXPLICIT_TIMEZONE_REQUIRED')
    host = canonical_host(hostname)
    if inventory.get('subscription') != SUB or inventory.get('tenant') != TENANT:
        raise ValueError('APPROVED_ACCOUNT_REQUIRED')
    if inventory.get('primaryRegion') != 'japaneast' or region == 'japaneast':
        raise ValueError('INDEPENDENT_REGION_REQUIRED')
    if not geography(region):
        raise ValueError('REVIEWED_REGION_REQUIRED')
    proposed = ipaddress.ip_network('10.91.0.0/24')
    overlap = any(proposed.overlaps(ipaddress.ip_network(cidr))
                  for cidr in inventory.get('existingCidrs', []))
    allowed = region in inventory.get('allowedLocations', [])
    quota = inventory.get('regionalQuota', {})
    quota_ok = all(quota.get(name, {}).get('limit', 0) - quota.get(name, {}).get('current', 0) >= 2
                   for name in ('cores', 'standardBasv2Family'))
    same_geo = geography(region) == geography('japaneast')
    custom = not (host == PRIMARY_HOST or host.endswith('.cloudapp.azure.com')
                  or host.endswith('.trafficmanager.net'))
    deadline = parse_time(END)
    remaining_hours = max(0, (deadline - now.astimezone(timezone.utc)).total_seconds() / 3600)
    blockers = []
    for condition, code in [
        (not allowed, 'REGION_DISALLOWED_BY_SUBSCRIPTION'),
        (not quota_ok, 'REGIONAL_COMPUTE_QUOTA_NOT_VERIFIED'),
        (overlap, 'NETWORK_RANGE_COLLISION'),
        (not custom, 'CUSTOM_HTTPS_DNS_CONTROL_REQUIRED'),
        (not same_geo, 'CROSS_GEOGRAPHY_KEY_RECOVERY_DECISION_REQUIRED'),
        (inventory.get('creditBalanceVerified') is not True, 'REMAINING_STUDENT_CREDIT_NOT_VERIFIED'),
        (remaining_hours <= 0, 'DEMO_WINDOW_EXPIRED'),
    ]:
        if condition:
            blockers.append(code)
    rate = inventory.get('linuxHourlyUsd')
    return {
        'schemaVersion': 'highpass.dr-plan.v1', 'review': 'DRAFT / UNASSIGNED',
        'status': 'NOT VERIFIED', 'scope': 'SYNTHETIC_CONTROL_PLANE_DR_PREPARATION',
        'primary': {'region': 'japaneast', 'hostname': PRIMARY_HOST},
        'standby': {'regionCandidate': region, 'sizeCandidate': SIZE,
                    'newResourceGroupCandidate': 'rg-highpass-dr-demo-20261016',
                    'vnetCandidate': str(proposed), 'quotaSufficient': quota_ok,
                    'regionAllowed': allowed, 'networkCollision': overlap},
        'trafficManager': {'method': 'Priority', 'primaryPriority': 1, 'standbyPriority': 2,
                           'profileStatus': 'Disabled', 'endpointStatus': 'Disabled',
                           'ttlSeconds': 30, 'monitorProtocol': 'HTTPS',
                           'monitorPathCandidate': '/health/dr-route',
                           'existingDnsChanged': False, 'hostnameCandidate': host,
                           'dnsControlVerified': False},
        'database': {'methodCandidate': 'PostgreSQL physical asynchronous streaming',
                     'promotion': 'EXPLICIT_OPERATOR_APPROVAL_AFTER_FENCING',
                     'publicDatabasePort': False, 'rpoZeroGuaranteed': False,
                     'replicationRole': 'DEDICATED_REPLICATION_ONLY_NO_SUPERUSER',
                     'maxSlotWalKeepSizeMbCandidate': 1024,
                     'staleConsentAccess': 'DENY', 'automaticFailback': False},
        'keyRecovery': {'sameGeographyBackupRestoreEligible': same_geo,
                        'backupRestoreAcrossGeographyAllowed': False,
                        'existingVaultChanged': False},
        'demoWindow': {'endUtc': END, 'endKst': '2026-10-20T23:59:00+09:00',
                       'endTimeIsAssumption': True, 'remainingHours': round(remaining_hours, 2),
                       'deallocationScheduled': False,
                       'residualChargesAfterDeallocation': ['disks', 'public IP', 'storage', 'monitoring']},
        'cost': {'remainingCreditVerified': inventory.get('creditBalanceVerified') is True,
                 'hourlyComputeUsd': rate, 'computeOnlyUntilDeadlineUsd':
                 round(rate * remaining_hours, 2) if isinstance(rate, (int, float)) and rate >= 0 else None,
                 'notAFullQuote': True},
        'blockers': blockers, 'resourcesCreated': False,
        'promotionImplemented': False, 'liveFailoverTested': False,
        'forbidden': ['public PACS', 'public DB', 'Control DICOM persistence',
                      'automatic DB promotion', 'revived old QR', 'stale consent authorization'],
    }


def promotion_preconditions(evidence, now=None):
    """Evaluate recorded prerequisites only. Does not authenticate an approver,
    acquire a distributed lock, fence a primary or execute pg_promote().
    A real operator must collect fresh live evidence and use a separate executor.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('EXPLICIT_TIMEZONE_REQUIRED')
    required = ['operatorApproved', 'primaryFenced', 'lastCommitReconciled',
                'consentRevocationsCurrent', 'qrConsumptionCurrent', 'replayLedgerCurrent',
                'auditIntegrityVerified', 'tlsVerified', 'keyAccessVerified',
                'hospitalPathVerified', 'singleWriterLockHeld']
    missing = [name for name in required if evidence.get(name) is not True]
    try:
        age = (now.astimezone(timezone.utc) - parse_time(evidence['observedAt'])).total_seconds()
        if not 0 <= age <= 60:
            missing.append('freshEvidenceRequired')
    except (KeyError, TypeError, ValueError):
        missing.append('freshEvidenceRequired')
    if evidence.get('receivedLsn') != evidence.get('replayedLsn') or not re.fullmatch(
            r'[0-9A-F]+/[0-9A-F]+', str(evidence.get('receivedLsn', ''))):
        missing.append('replayCaughtUpRequired')
    return {'eligibleForSeparateOperatorProcedure': not missing,
            'failedPreconditions': missing, 'promotionExecuted': False,
            'claimBoundary': 'RECORDED_PRECONDITIONS_ONLY_NOT_AUTHORIZATION_OR_LIVE_FENCING'}


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def azure_inventory(region):
    identity = load_module('dr_identity', 'capstone-key-identities.py')
    queries = {
        'account': ('account', 'show', '--query', '{id:id,tenantId:tenantId,state:state}'),
        'policies': ('policy', 'assignment', 'list', '--subscription', SUB,
                     '--query', '[].{name:name,parameters:parameters}'),
        'primary': ('vm', 'show', '-g', PRIMARY_RG, '-n', PRIMARY_VM, '--subscription', SUB,
                    '--query', '{location:location,size:hardwareProfile.vmSize,image:storageProfile.imageReference}'),
        'vnets': ('network', 'vnet', 'list', '--subscription', SUB,
                  '--query', '[].{name:name,location:location,prefixes:addressSpace.addressPrefixes}'),
        'quota': ('vm', 'list-usage', '--location', region, '--subscription', SUB,
                  '--query', "[?name.value=='cores' || name.value=='standardBasv2Family'].{name:name.value,current:currentValue,limit:limit}"),
        'resources': ('resource', 'list', '--subscription', SUB,
                      '--query', "[?type=='Microsoft.Network/trafficManagerProfiles' || type=='Microsoft.Compute/virtualMachines'].{name:name,type:type,location:location}"),
    }
    raw = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(identity.azure, *args): name for name, args in queries.items()}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                raw[name] = future.result()
            except Exception:
                raw[name] = {'status': 'NOT VERIFIED', 'reason': 'AZURE_READ_FAILED'}
    if raw.get('account') != {'id': SUB, 'tenantId': TENANT, 'state': 'Enabled'}:
        raise RuntimeError('APPROVED_ENABLED_ACCOUNT_REQUIRED')
    allowed = []
    for policy in raw.get('policies', []):
        if policy['name'] == 'sys.regionrestriction':
            allowed = policy['parameters']['listOfAllowedLocations']['value']
    return {
        'subscription': SUB, 'tenant': TENANT,
        'primaryRegion': raw.get('primary', {}).get('location'),
        'allowedLocations': allowed,
        'existingCidrs': [cidr for v in raw.get('vnets', []) for cidr in v['prefixes']],
        'regionalQuota': {q['name']: {'current': int(q['current']), 'limit': int(q['limit'])}
                          for q in raw.get('quota', [])} if isinstance(raw.get('quota'), list) else {},
        'creditBalanceVerified': False, 'linuxHourlyUsd': None,
        'rawReadOnlyInventory': raw,
    }


def primary_runtime_inventory():
    host = load_module('dr_host', 'health-helper-runtime-check.py')
    client = host.connect('CLOUD', None)
    try:
        return host.remote(client, 'CLOUD', None, r'''
import json,subprocess
names=['hp-capstone-control-postgres-1','hp-capstone-control-control-1']
items=json.loads(subprocess.check_output(['docker','inspect',*names],timeout=10))
out=[]
for item in items:
 out.append({'name':item['Name'],'image':item['Image'],'running':item['State']['Running'],
  'health':item['State'].get('Health',{}).get('Status'),'ports':item['HostConfig']['PortBindings'],
  'mountTypes':[m['Type'] for m in item['Mounts']]})
sql="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT json_build_object('version',current_setting('server_version'),'recovery',pg_is_in_recovery(),'settings',(SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN ('wal_level','max_wal_senders','max_replication_slots','max_slot_wal_keep_size','ssl','ssl_min_protocol_version')),'streamingClients',(SELECT count(*) FROM pg_stat_replication));ROLLBACK;"
query=subprocess.run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',sql],capture_output=True,timeout=10)
if query.returncode: raise RuntimeError('READ_ONLY_DB_QUERY_FAILED')
print(json.dumps({'containers':out,'postgres':json.loads(query.stdout.decode())}))
''', 25)
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region', default='eastasia')
    parser.add_argument('--hostname', default=PRIMARY_HOST)
    args = parser.parse_args()
    # Validate request before external calls; no --apply switch intentionally exists.
    canonical_host(args.hostname)
    if not geography(args.region):
        parser.error('REVIEWED_REGION_REQUIRED')
    folder = ROOT / 'artifacts/azure' / ('dr-preflight-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    folder.mkdir(parents=True, exist_ok=False)
    inventory = azure_inventory(args.region)
    try:
        inventory['primaryRuntime'] = primary_runtime_inventory()
    except Exception:
        inventory['primaryRuntime'] = {'status': 'NOT VERIFIED', 'reason': 'PINNED_PRIMARY_READ_FAILED'}
    plan = make_plan(inventory, args.hostname, args.region)
    (folder / 'inventory.json').write_text(json.dumps(inventory, indent=2), encoding='utf-8')
    (folder / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    print(json.dumps({'status': plan['status'], 'region': args.region, 'blockers': plan['blockers'],
                      'primaryRuntime': 'PASS' if 'postgres' in inventory['primaryRuntime'] else 'NOT VERIFIED',
                      'resourcesCreated': False, 'evidence': str(folder / 'plan.json')}))


if __name__ == '__main__':
    main()
