import importlib.util,pathlib,json,datetime,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('az',ROOT/'scripts/capstone-key-identities.py');az=importlib.util.module_from_spec(s);s.loader.exec_module(az)
out=pathlib.Path.home()/'Downloads'/'MediQ_관제증적_20261020'/'queries'
rg='rg-highpass-capstone-20261008';sub='a3c0e7d4-ce09-4991-946b-88574869edd9'
scope=f'/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.KeyVault/vaults/kv-hp-demo-4869edd9'
tasks={
 'disk':['disk','show','-g',rg,'-n','osdisk-highpass-capstone','--query','{name:name,location:location,encryption:encryption,managedByAttached:managedBy!=null}'],
 'vault':['keyvault','show','-n','kv-hp-demo-4869edd9','--query','{name:name,location:location,rbac:properties.enableRbacAuthorization,publicNetwork:properties.publicNetworkAccess,purgeProtection:properties.enablePurgeProtection,softDelete:properties.enableSoftDelete,retention:properties.softDeleteRetentionInDays,privateEndpoints:properties.privateEndpointConnections[].privateLinkServiceConnectionState.status}'],
 'vaultRoles':['role','assignment','list','--scope',scope+'/keys/capstone-b-kek-20261009','--include-inherited','--query','[].{role:roleDefinitionName,principalType:principalType,scope:scope}'],
 'vaultDiagnostics':['monitor','diagnostic-settings','list','--resource',scope,'--query','value[].{name:name,logs:logs[].{category:category,enabled:enabled},workspaceConnected:workspaceId!=null}']}
for name,args in tasks.items():
 if len(sys.argv)>1 and name not in sys.argv[1:]:continue
 try:data=az.azure(*args);status='PASS'
 except Exception as e:data={'failureClass':type(e).__name__};status='NOT VERIFIED'
 # Resource IDs are not needed on presentation evidence.
 if name=='vaultRoles' and isinstance(data,list):
  for x in data:x['scope']='key' if '/keys/' in x['scope'] else 'vault' if '/vaults/' in x['scope'] else 'resource-group/subscription'
 (out/(name+'.json')).write_text(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,'data':data},ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'subject':name,'status':status}),flush=True)
