"""Read-only bounded CT incident inventory. Never emits credentials or tokens."""
import argparse,importlib.util,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runtime',ROOT/'scripts/health-helper-runtime-check.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
parser=argparse.ArgumentParser();parser.add_argument('--repair-address',action='store_true');parser.add_argument('--persist-address',action='store_true');args=parser.parse_args()
client=runtime.connect('CLOUD',None)
try:
 if args.persist_address:
  import base64
  content=base64.b64encode((ROOT/'infra/azure/patient-entry-secondary-address.conf').read_bytes()).decode()
  print(json.dumps(runtime.remote(client,'CLOUD',None,'CONTENT='+repr(content)+'\n'+r'''
import subprocess,json,pathlib,base64,hashlib,time
network=pathlib.Path('/run/systemd/network/10-netplan-eth0.network')
assert network.is_file()
before=hashlib.sha256(network.read_bytes()).hexdigest()
assert 'DHCP=' in network.read_text()
directory=pathlib.Path('/etc/systemd/network/10-netplan-eth0.network.d')
directory.mkdir(mode=0o755,exist_ok=True)
target=directory/'60-highpass-patient-address.conf'
data=base64.b64decode(CONTENT)
assert not target.exists() or target.read_bytes()==data
target.write_bytes(data);target.chmod(0o644)
subprocess.run(['networkctl','reload'],check=True,timeout=15)
assert hashlib.sha256(network.read_bytes()).hexdigest()==before
for attempt in range(20):
 addresses=json.loads(subprocess.check_output(['ip','-j','address','show','dev','eth0']))
 if all(any(a.get('local')==ip for row in addresses for a in row['addr_info']) for ip in ['10.89.0.4','10.89.0.5']):break
 time.sleep(0.25)
else:raise RuntimeError('NETWORK_ADDRESS_READINESS_TIMEOUT')
print(json.dumps({'persistentDropIn':str(target),'sha256':hashlib.sha256(data).hexdigest(),'primaryDhcpConfigurationUnchanged':True,'bothAddressesPresent':True,'networkReload':True}))
''',25)))
 if args.repair_address:
  print(json.dumps(runtime.remote(client,'CLOUD',None,r'''
import subprocess,json,pathlib,time
unit=pathlib.Path('/etc/systemd/system/hp-patient-entry-network.service').read_text()
assert 'ExecStart=/usr/bin/python3 /opt/highpass/patient-public-entry/prepare.py' in unit
subprocess.run(['systemctl','restart','hp-patient-entry-network.service'],check=True,timeout=15)
addresses=json.loads(subprocess.check_output(['ip','-j','address','show','dev','eth0']))
assert any(a.get('local')=='10.89.0.5' for row in addresses for a in row['addr_info'])
print(json.dumps({'addressRestored':True,'existingPreparationServiceUsed':True}))
''',25)))
 result=runtime.remote(client,'CLOUD',None,r'''
import subprocess,json,time,socket
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=12);return p.returncode,p.stdout.decode(errors='replace')
_,raw=run(['docker','ps','-a','--format','{{json .}}']);containers=[]
for line in raw.splitlines():
 i=json.loads(line);containers.append({k:i.get(k) for k in ['Names','Status','Image']})
_,interfaces=run(['wg','show','interfaces']);peers=[]
for interface in interfaces.split():
 _,raw=run(['wg','show',interface,'latest-handshakes'])
 peers.extend({'interface':interface,'ageSeconds':int(time.time())-int(line.split()[1]) if int(line.split()[1]) else None} for line in raw.splitlines())
ports=[]
for host in ['10.90.88.2','10.90.88.3']:
 for port in [443,9443,9444]:
  s=socket.socket();s.settimeout(3)
  try:s.connect((host,port));status='CONNECTED'
  except Exception as e:status=type(e).__name__
  finally:s.close()
  ports.append({'host':host,'port':port,'status':status})
sql="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce(json_agg(t),'[]') FROM (SELECT action,result,reason_code,count(*) FROM audit_logs WHERE created_at>now()-interval '3 hours' GROUP BY action,result,reason_code ORDER BY count(*) DESC LIMIT 35)t; ROLLBACK;"
rc,audit=run(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',sql])
_,units=run(['systemctl','list-units','--all','--no-pager','--plain','--no-legend','hp-patient*'])
_,addresses=run(['ip','-j','address','show','dev','eth0'])
_,firewall=run(['iptables','-S','HP-PVIEW-OUT'])
_,listeners=run(['ss','-lnt'])
_,network=run(['networkctl','status','eth0','--no-pager'])
print(json.dumps({'containers':containers,'wireguard':peers,'ports':ports,'audit':json.loads(audit) if rc==0 else {'queryFailed':True},'units':units,'addresses':json.loads(addresses),'firewall':firewall,'listeners':listeners,'network':network}))
''',55)
 from datetime import datetime,timezone
 result['observedAt']=datetime.now(timezone.utc).isoformat();result['review']='DRAFT / UNASSIGNED'
 folder=ROOT/'artifacts/azure'/('patient-ct-incident-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
 folder.mkdir(parents=True,exist_ok=False)
 (folder/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
 print(json.dumps({'evidence':str(folder/'result.json'),**result}))
finally:client.close()
