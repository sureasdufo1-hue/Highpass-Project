"""Isolated East Asia DB standby provisioning; no primary service or routing writes.

Local template checks by default. --provision creates only a new standalone RG/VM
and its network. Replication preparation is a separate explicitly selected phase.
"""
import argparse
import base64
from datetime import datetime, timezone
import importlib.util
import ipaddress
import json
import os
import pathlib
import subprocess
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
GROUP = 'rg-highpass-dr-standby-20261016'
VM = 'vm-highpass-dr-standby'
SUB = 'a3c0e7d4-ce09-4991-946b-88574869edd9'
TENANT = 'ad21525c-fc0f-4dbc-a403-67ce00add0e4'
END = datetime(2026, 10, 20, 14, 59, tzinfo=timezone.utc)
TEMPLATE = ROOT/'infra/azure/dr-standby.json'
EXPECTED = {'Microsoft.Network/networkSecurityGroups', 'Microsoft.Network/virtualNetworks',
            'Microsoft.Network/publicIPAddresses', 'Microsoft.Network/networkInterfaces',
            'Microsoft.Compute/virtualMachines'}


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/filename)
    mod = importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod


def validate_template(t):
    resources = t['resources']
    if len(resources) != 5 or {x['type'] for x in resources} != EXPECTED:
        raise ValueError('ONLY_FIVE_ISOLATED_RESOURCES_ALLOWED')
    if t['variables']['location'] != 'eastasia' or t['variables']['vmName'] != VM:
        raise ValueError('FIXED_STANDBY_REGION_AND_VM_REQUIRED')
    if set(t['parameters']) != {'adminPublicKey','operatorCidr','primaryCidr'}:
        raise ValueError('PUBLIC_INPUTS_ONLY')
    if any(x['location'] != "[variables('location')]" for x in resources):
        raise ValueError('FIXED_LOCATION_REQUIRED')
    network = next(x for x in resources if x['type'].endswith('/virtualNetworks'))
    if network['properties']['addressSpace']['addressPrefixes'] != ['10.91.0.0/24']:
        raise ValueError('FIXED_NON_OVERLAPPING_NETWORK_REQUIRED')
    nsg = next(x for x in resources if x['type'].endswith('/networkSecurityGroups'))
    rules = nsg['properties']['securityRules']
    if len(rules) != 2:
        raise ValueError('SSH_ONLY_AND_DENY_REQUIRED')
    first, deny = [r['properties'] for r in rules]
    if first != {'priority':100,'direction':'Inbound','access':'Allow','protocol':'Tcp',
                 'sourceAddressPrefixes':["[parameters('operatorCidr')]","[parameters('primaryCidr')]"],
                 'sourcePortRange':'*','destinationAddressPrefix':'*','destinationPortRange':'22'}:
        raise ValueError('ONLY_TWO_EXACT_SSH_SOURCES_ALLOWED')
    if deny != {'priority':200,'direction':'Inbound','access':'Deny','protocol':'*',
                'sourceAddressPrefix':'*','sourcePortRange':'*','destinationAddressPrefix':'*','destinationPortRange':'*'}:
        raise ValueError('DEFAULT_INBOUND_DENY_REQUIRED')
    vm = next(x for x in resources if x['type'].endswith('/virtualMachines'))
    p = vm['properties']
    if p['hardwareProfile']['vmSize'] != 'Standard_B2als_v2' or p['osProfile'].get('adminPassword'):
        raise ValueError('SMALL_SSH_ONLY_VM_REQUIRED')
    if not p['osProfile']['linuxConfiguration']['disablePasswordAuthentication']:
        raise ValueError('PASSWORD_LOGIN_FORBIDDEN')
    if p['storageProfile']['osDisk']['managedDisk'] != {'storageAccountType':'StandardSSD_LRS'}:
        raise ValueError('PLATFORM_MANAGED_DISK_REQUIRED')
    if p['storageProfile']['osDisk']['diskSizeGB'] != 32:
        raise ValueError('FIXED_DISK_SIZE_REQUIRED')
    return True


def validate_sources(operator, primary):
    for value in (operator, primary):
        net = ipaddress.ip_network(value, strict=True)
        if net.version != 4 or net.prefixlen != 32 or not net.network_address.is_global:
            raise ValueError('EXACT_PUBLIC_IPV4_SOURCE_REQUIRED')
    if operator == primary:
        raise ValueError('DISTINCT_OPERATOR_AND_PRIMARY_REQUIRED')


def check_what_if(value):
    prefix = f'/subscriptions/{SUB}/resourceGroups/{GROUP}/providers/'.lower()
    changes = value.get('changes', [])
    if value.get('status') != 'Succeeded' or len(changes) != 5:
        raise ValueError('FIVE_NEW_RESOURCES_REQUIRED')
    types = set()
    for item in changes:
        if item.get('changeType') != 'Create' or not item.get('resourceId','').lower().startswith(prefix):
            raise ValueError('EXISTING_OR_OUT_OF_SCOPE_RESOURCE_CHANGE_FORBIDDEN')
        types.add(item.get('after',{}).get('type'))
    if types != EXPECTED:
        raise ValueError('ONLY_REVIEWED_RESOURCE_TYPES_ALLOWED')
    return True


def retail_price():
    query = "serviceName eq 'Virtual Machines' and armRegionName eq 'eastasia' and armSkuName eq 'Standard_B2als_v2' and priceType eq 'Consumption'"
    url = 'https://prices.azure.com/api/retail/prices?' + urllib.parse.urlencode({'$filter':query})
    with urllib.request.urlopen(url, timeout=20) as response:
        data = json.loads(response.read(1024*1024))
    prices = [i for i in data.get('Items',[]) if i.get('productName')=='Virtual Machines Basv2 Series'
              and 'Spot' not in i.get('meterName','') and 'Low Priority' not in i.get('meterName','')
              and i.get('unitOfMeasure') == '1 Hour' and i.get('currencyCode') == 'USD'
              and i.get('isPrimaryMeterRegion') is True]
    return [{'retailHourlyUsd':i['retailPrice'],'meter':i['meterName'],'product':i['productName'],
             'effectiveStartDate':i['effectiveStartDate']} for i in prices]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provision', action='store_true')
    args = parser.parse_args()
    template = json.loads(TEMPLATE.read_text(encoding='utf-8'))
    validate_template(template)
    if not args.provision:
        print(json.dumps({'localTemplate':'PASS','azureWrites':False}));return 0
    if datetime.now(timezone.utc) >= END:raise ValueError('DEMO_WINDOW_EXPIRED')
    lab = module('dr_lab','azure-dr-validation.py')
    plan = module('dr_plan','azure-dr-plan.py')
    helper = module('dr_helper','health-helper-runtime-check.py')
    azure = lab.cli()
    folder = ROOT/'artifacts/azure'/('dr-standby-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    folder.mkdir(parents=True,exist_ok=False)
    result = {'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','scope':'ISOLATED_DB_STANDBY_FOUNDATION',
              'region':'eastasia','resourceGroup':GROUP,'vm':VM,'primaryChanged':False,
              'keyRecoveryScope':'EXISTING_JAPAN_VAULT_DEPENDENCY_NO_KEY_COPY_NO_NEW_VAULT_ROLE',
              'standbyAppServing':False,'replication':'NOT VERIFIED','promotion':'NOT VERIFIED',
              'automaticDeallocation':False,'checks':[]}
    def save(name,value):(folder/(name+'.json')).write_text(json.dumps(value,indent=2),encoding='utf-8')
    phase = 'PREFLIGHT'
    try:
        inventory = plan.azure_inventory('eastasia');save('azure-inventory',inventory)
        if 'eastasia' not in inventory['allowedLocations']:raise ValueError('REGION_NOT_ALLOWED')
        for name in ('cores','standardBasv2Family'):
            quota=inventory['regionalQuota'].get(name,{})
            if quota.get('limit',0)-quota.get('current',0)<2:raise ValueError('QUOTA_INSUFFICIENT')
        if any(ipaddress.ip_network(c).overlaps(ipaddress.ip_network('10.91.0.0/24')) for c in inventory['existingCidrs']):
            raise ValueError('NETWORK_OVERLAP')
        if azure('group','exists','-n',GROUP,'--subscription',SUB):raise ValueError('EXISTING_GROUP_REQUIRES_REVIEW')
        before = lab.snapshot(azure);save('before',before)
        primary_ip = before['publicIp'][0]['ip']
        nsg = azure('network','nsg','show','-g',lab.PRIMARY_GROUP,'-n','nsg-highpass-capstone',
                    '--subscription',SUB)
        rules = [r for r in nsg['securityRules'] if r['access']=='Allow' and r['direction']=='Inbound' and r.get('destinationPortRange')=='22']
        if len(rules)!=1:raise ValueError('UNAMBIGUOUS_OPERATOR_SOURCE_REQUIRED')
        operator = rules[0].get('sourceAddressPrefix','')
        validate_sources(operator,primary_ip+'/32')
        client = helper.connect('CLOUD',None)
        try: runtime=helper.remote(client,'CLOUD',None,(ROOT/'scripts/azure-dr-primary-inspect.py').read_text(),40)
        finally:client.close()
        save('primary-read-only',runtime)
        if runtime['recovery'] or runtime['tablespaces'] or runtime['dbBytes']>1024**3:
            raise ValueError('PRIMARY_SCOPE_REQUIRES_REVIEW')
        if runtime['settings']['wal_level']!='replica' or runtime['load'][0]>1.0 or runtime['memAvailableKiB']<512*1024:
            raise ValueError('SOURCE_CAPACITY_OR_WAL_PRECONDITION_FAILED')
        try:result['computeRetailPrice']=retail_price()
        except Exception:result['computeRetailPrice']='NOT VERIFIED'
        result['studentCreditBalance']='NOT VERIFIED'
        keypath=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud/id_ed25519.pub'
        parts=keypath.read_text().strip().split()
        if len(parts)<2 or parts[0]!='ssh-ed25519':raise ValueError('EXISTING_PUBLIC_SSH_KEY_REQUIRED')
        base64.b64decode(parts[1],validate=True)
        params={'adminPublicKey':{'value':' '.join(parts[:2])},'operatorCidr':{'value':operator},'primaryCidr':{'value':primary_ip+'/32'}}
        save('public-parameters',params)
        phase='CREATE_STANDBY_GROUP'
        azure('group','create','-n',GROUP,'-l','eastasia','--subscription',SUB,'--tags',
              'project=Highpass','purpose=synthetic-dr-standby','managedBy=highpass-dr-standby','demoEndUtc=2026-10-20T14:59:00Z')
        result['groupCreated']=True;save('result',result)
        args_base=('-g',GROUP,'--subscription',SUB,'-n','isolated-standby-foundation',
                   '--template-file',str(TEMPLATE),'--parameters','@'+str(folder/'public-parameters.json'))
        phase='ARM_VALIDATE'
        save('arm-validation',azure('deployment','group','validate',*args_base))
        result['checks'].append({'test':'ARM_VALIDATE','status':'PASS'})
        phase='WHAT_IF'
        whatif=azure('deployment','group','what-if',*args_base,'--no-pretty-print');save('what-if',whatif)
        check_what_if(whatif)
        result['checks'].append({'test':'CREATE_ONLY_ISOLATED_RESOURCES','status':'PASS'})
        phase='DEPLOY_STANDBY'
        # Detached Azure operation avoids losing its identity on a CLI wait timeout.
        created=azure('deployment','group','create',*args_base,'--mode','Incremental','--no-wait')
        save('deployment-start',created)
        result['deploymentStarted']=True
        result['checks'].append({'test':'DEPLOYMENT_COMPLETION','status':'NOT VERIFIED'})
        after=lab.snapshot(azure);save('after',after)
        if before!=after:raise ValueError('PRIMARY_BASELINE_CHANGED')
        result['checks'].append({'test':'PRIMARY_BASELINE_UNCHANGED','status':'PASS'})
        result['status']='NOT VERIFIED'
        result['next']='Read deployment state, attest SSH host key via Azure management channel, then configure replica separately.'
    except Exception as error:
        result['status']='FAIL'
        result['checks'].append({'test':phase,'status':'FAIL','reason':str(error) if isinstance(error,ValueError) else type(error).__name__})
    finally:save('result',result)
    print(json.dumps({**result,'evidence':str(folder/'result.json')}))
    return 1 if result['status']=='FAIL' else 0


if __name__=='__main__':raise SystemExit(main())
