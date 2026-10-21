"""Explicit staged replication operations. No DNS cutover or database promotion."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
import pathlib
import shlex
import socket

ROOT=pathlib.Path(__file__).resolve().parents[1]
GROUP='rg-highpass-dr-standby-20261016'
VM='vm-highpass-dr-standby'
SUB='a3c0e7d4-ce09-4991-946b-88574869edd9'
TENANT='ad21525c-fc0f-4dbc-a403-67ce00add0e4'
SOURCE='/opt/highpass/dr-source'
TARGET='/opt/highpass/dr-standby'


def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def upload(sftp,path,data,mode=0o600,owner=0,group=0):
    if isinstance(data,str):data=data.encode()
    with sftp.open(path,'wx') as stream:stream.write(data)
    sftp.chmod(path,mode);sftp.chown(path,owner,group)


def guest(helper,client,program,seconds=30):return helper.remote(client,'CLOUD',None,program,seconds)


def worker(helper,client,path,phase,seconds=30):
    return guest(helper,client,'import runpy,sys;sys.argv='+repr([path,phase])+';runpy.run_path('+repr(path)+',run_name="__main__")',seconds)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase',choices=['prepare','configure','backup','preserve-staging','retry-backup','start','progress','deadline','verify'])
    phase=parser.parse_args().phase
    if datetime.now(timezone.utc)>=datetime(2026,10,20,14,59,tzinfo=timezone.utc) and phase not in ('verify','progress'):
        raise ValueError('DEMO_WINDOW_EXPIRED')
    folders=sorted(p for p in (ROOT/'artifacts/azure').glob('dr-standby-20*') if (p/'before.json').is_file())
    if not folders:raise ValueError('STANDBY_PROVISION_EVIDENCE_REQUIRED')
    folder=folders[-1]
    result={'phase':phase,'scope':'SYNTHETIC_READ_ONLY_DB_REPLICATION_ONLY','status':'NOT VERIFIED',
            'review':'DRAFT / UNASSIGNED','promotionExecuted':False,'patientTrafficChanged':False}
    helper=load('dr_connect','health-helper-runtime-check.py')
    gateway=load('dr_sftp','capstone-a-gateway-ops.py')
    lab=load('dr_lab','azure-dr-validation.py');azure=lab.cli()
    source=None;target=None
    try:
        account=azure('account','show','--query','{id:id,tenantId:tenantId,state:state}')
        if account!={'id':SUB,'tenantId':TENANT,'state':'Enabled'}:raise ValueError('APPROVED_ENABLED_ACCOUNT_REQUIRED')
        vm=azure('vm','show','-d','-g',GROUP,'-n',VM,'--subscription',SUB)
        if vm['provisioningState']!='Succeeded' or vm['location']!='eastasia' or vm.get('tags',{}).get('managedBy')!='highpass-dr-standby':
            raise ValueError('EXACT_MANAGED_STANDBY_REQUIRED')
        address=vm['publicIps']
        attestation=folder/'standby-host.json'
        if phase=='prepare':
            if attestation.exists():raise ValueError('EXISTING_PREPARATION_REQUIRES_REVIEW')
            code="import json,pathlib,socket; print(json.dumps({'hostname':socket.gethostname(),'hostKey':pathlib.Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text().strip()}))"
            value=azure('vm','run-command','invoke','-g',GROUP,'-n',VM,'--subscription',SUB,
                        '--command-id','RunShellScript','--scripts','python3 -c '+shlex.quote(code))
            message='\n'.join(x.get('message','') for x in value.get('value',[]))
            public=[json.loads(line) for line in message.splitlines() if line.startswith('{')]
            if len(public)!=1 or public[0]['hostname']!='highpass-dr-standby':raise ValueError('AZURE_HOST_ATTESTATION_FAILED')
            attestation.write_text(json.dumps({**public[0],'ip':address,'resourceId':vm['id']},indent=2))
        pin=json.loads(attestation.read_text())
        if pin['ip']!=address or pin['resourceId'].lower()!=vm['id'].lower():raise ValueError('PINNED_VM_IDENTITY_CHANGED')
        public=pin['hostKey'].split()
        if public[0]!='ssh-ed25519':raise ValueError('ED25519_HOST_KEY_REQUIRED')
        import paramiko
        target=paramiko.SSHClient();target.set_missing_host_key_policy(paramiko.RejectPolicy())
        target.get_host_keys().add(address,public[0],paramiko.Ed25519Key(data=base64.b64decode(public[1],validate=True)))
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud/id_ed25519'
        target.connect(address,username='highpassadmin',key_filename=str(identity),look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10)
        source=helper.connect('CLOUD',None)
        if phase=='prepare':
            status=guest(helper,target,"import pathlib,subprocess,json;assert pathlib.Path('/var/lib/cloud/instance/boot-finished').exists();assert subprocess.run(['systemctl','is-active','--quiet','docker']).returncode==0;print(json.dumps({'cloudInit':'PASS','docker':'PASS'}))")
            result['bootstrap']=status
            # Prepare source-only secret directory; DB and existing services remain unchanged.
            guest(helper,source,"import pathlib,json;p=pathlib.Path('/opt/highpass/dr-source');p.mkdir(mode=0o700,exist_ok=False);print(json.dumps({'created':True}))")
            with gateway.root_sftp(source) as sftp:
                upload(sftp,SOURCE+'/primary.py',(ROOT/'scripts/azure-dr-primary-configure.py').read_bytes())
                upload(sftp,SOURCE+'/root-ca.crt',(ROOT/'tmp/certs/mtls/ca.crt').read_bytes())
                upload(sftp,SOURCE+'/config.json',json.dumps({'standbyIp':address}))
                upload(sftp,SOURCE+'/known_hosts',address+' '+ ' '.join(public[:2])+'\n')
            prepared=worker(helper,source,SOURCE+'/primary.py','prepare')
            result['sourcePrepared']={k:v for k,v in prepared.items() if k!='tunnelPublicKey'}
            primary_ip=json.loads((folder/'before.json').read_text())['publicIp'][0]['ip']
            with gateway.root_sftp(target) as sftp:
                upload(sftp,TARGET+'/replica.py',(ROOT/'scripts/azure-dr-replica.py').read_bytes())
                upload(sftp,TARGET+'/Dockerfile.postgres',(ROOT/'infra/azure/Dockerfile.postgres-capstone').read_bytes())
                upload(sftp,TARGET+'/tunnel-config.json',json.dumps({'sourcePublicKey':prepared['tunnelPublicKey'],'sourceIp':primary_ip}))
            # Only the NEW standby sshd is extended. Existing operator login stays unchanged.
            setup=r'''
import json,pathlib,subprocess,os,pwd
b=pathlib.Path('/opt/highpass/dr-standby');v=json.loads((b/'tunnel-config.json').read_text())
subprocess.run(['useradd','--create-home','--shell','/usr/sbin/nologin','--password','*','hpreplicatunnel'],check=True,capture_output=True)
u=pwd.getpwnam('hpreplicatunnel');ssh=pathlib.Path(u.pw_dir)/'.ssh';ssh.mkdir(mode=0o700);os.chown(ssh,u.pw_uid,u.pw_gid)
p=ssh/'authorized_keys';p.write_text('from="'+v['sourceIp']+'",restrict,port-forwarding,permitlisten="127.0.0.1:15432" '+v['sourcePublicKey']+'\n');p.chmod(0o600);os.chown(p,u.pw_uid,u.pw_gid)
c=pathlib.Path('/etc/ssh/sshd_config');original=c.read_text();(b/'sshd-before.conf').write_text(original)
block='\n# Highpass isolated outbound replication peer\nMatch User hpreplicatunnel\n  AllowTcpForwarding remote\n  PermitListen 127.0.0.1:15432\n  PermitOpen none\n  MaxSessions 0\n  AllowAgentForwarding no\n  X11Forwarding no\n  PermitTTY no\n  AuthenticationMethods publickey\n  PasswordAuthentication no\n  KbdInteractiveAuthentication no\n'
c.write_text(original+block)
test=subprocess.run(['/usr/sbin/sshd','-t'],capture_output=True)
if test.returncode:c.write_text(original);raise RuntimeError('STANDBY_SSH_CONFIG_REJECTED')
subprocess.run(['systemctl','reload','ssh'],check=True,capture_output=True)
sec=b/'secrets';sec.mkdir(mode=0o750);os.chown(sec,0,70)
subprocess.run(['systemd-run','--unit=highpass-dr-image-build','--property=RuntimeMaxSec=660','/usr/bin/python3',str(b/'replica.py'),'build'],check=True,capture_output=True)
print(json.dumps({'status':'PASS','imageBuildStarted':True,'tunnelAccountShell':'nologin','maxSessions':0,'onlyRemoteListen':'127.0.0.1:15432'}))
'''
            result['standbyPrepared']=guest(helper,target,setup)
            result['databaseChanged']=False;result['status']='PASS'
        elif phase=='configure':
            build=guest(helper,target,"import pathlib,json;print(pathlib.Path('/opt/highpass/dr-standby/image-result.json').read_text())")
            if build['status']!='PASS':raise ValueError('STANDBY_IMAGE_BUILD_REQUIRED')
            result['image']=build
            result['sourceConfiguration']=worker(helper,source,SOURCE+'/primary.py','configure',40)
            # Credential goes SSH-to-memory-to-SSH only; never CLI argv, log or workstation file.
            with gateway.root_sftp(source) as src, gateway.root_sftp(target) as dst:
                with src.open(SOURCE+'/secrets/replication-password','rb') as stream:password=stream.read(256).decode()
                if len(password)!=64 or any(c not in '0123456789abcdef' for c in password):raise ValueError('GENERATED_CREDENTIAL_REQUIRED')
                upload(dst,TARGET+'/secrets/replication.pgpass','highpass-v3-postgres.invalid:15432:*:hp_dr_repl_20261016:'+password+'\n',owner=70,group=70)
                upload(dst,TARGET+'/secrets/root-ca.crt',(ROOT/'tmp/certs/mtls/ca.crt').read_bytes(),mode=0o440,group=70)
                upload(src,'/etc/systemd/system/highpass-dr-source-tunnel.service',(ROOT/'infra/azure/dr-source-tunnel.service').read_bytes(),mode=0o644)
            password=None
            result['tunnel']=guest(helper,source,"import subprocess,json;subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True);subprocess.run(['systemctl','enable','--now','highpass-dr-source-tunnel.service'],check=True,capture_output=True);print(json.dumps({'status':'PASS','sourceTunnelStarted':True,'postgresRestarted':False}))")
            result['status']='PASS';result['databaseChanged']='SCOPED_REPLICATION_ROLE_AND_HBA_ONLY'
        elif phase=='preserve-staging':
            # Exact previously inspected stale artifact only; active HBA/config never moved.
            result['preservedSourceStaging']=guest(helper,source,r'''
import pathlib,subprocess,json,hashlib,os,time
d=pathlib.Path('/var/lib/docker/volumes/hp-capstone-control_capstone-control-db/_data')
name='pg_hba.conf.highpass-v3-10b44bf92ef1439e87c967fa12f8a694.pending';p=d/name
expected='495acf651412a19494e70dff8187d0b4c0f2ccf98d6d1399bd760ff5fe124ec7'
assert p.is_file() and not p.is_symlink() and p.resolve().parent==d.resolve()
s=p.stat();assert s.st_uid==0 and s.st_gid==0 and s.st_mode & 0o777==0o600 and time.time()-s.st_mtime>86400
assert hashlib.sha256(p.read_bytes()).hexdigest()==expected
active=subprocess.check_output(['docker','exec','hp-capstone-control-postgres-1','psql','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c','SHOW hba_file'],timeout=5).decode().strip()
assert active=='/var/lib/postgresql/data/pg_hba.conf'
for f in list(d.glob('*.conf'))+[d/'pg_hba.conf',d/'pg_ident.conf']:
 if f.is_file():assert name.encode() not in f.read_bytes()
b=pathlib.Path('/opt/highpass/dr-source/preserved-inactive-hba');b.mkdir(mode=0o700,exist_ok=False)
dest=b/name;assert not dest.exists() and dest.parent.resolve()==b.resolve()
active_hash=hashlib.sha256((d/'pg_hba.conf').read_bytes()).hexdigest();p.rename(dest)
assert hashlib.sha256(dest.read_bytes()).hexdigest()==expected and hashlib.sha256((d/'pg_hba.conf').read_bytes()).hexdigest()==active_hash
subprocess.run(['logger','-t','highpass-dr','PRESERVED_UNUSED_V3_HBA_PENDING_OUTSIDE_PGDATA_NO_ACTIVE_RULE_CHANGE'],check=True,capture_output=True,timeout=5)
print(json.dumps({'status':'PASS','preservedPath':str(dest),'sha256':expected,'activeHbaUnchanged':True,'deleted':False,'restorable':True}))
''')
            result['status']='PASS'
        elif phase=='retry-backup':
            # Preserve the failed dataset and worker. No recursive delete or source DB change.
            result['preservedFailure']=guest(helper,target,r'''
import pathlib,json,subprocess,datetime
b=pathlib.Path('/opt/highpass/dr-standby');r=json.loads((b/'backup-result.json').read_text())
assert r['status']=='FAIL'
s=subprocess.run(['systemctl','is-active','highpass-dr-backup.service'],capture_output=True,timeout=5)
assert s.stdout.decode().strip() not in ('active','activating')
assert not subprocess.check_output(['docker','ps','-aq','--filter','name=^/hp-dr-postgres$'],timeout=5).strip()
p=b/'pgdata';assert p.is_dir() and not p.is_symlink() and p.resolve().parent==b.resolve()
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S');dest=b/('pgdata.failed-'+stamp);assert not dest.exists()
p.rename(dest);(b/'backup-result.json').rename(b/('backup-result.failed-'+stamp+'.json'))
print(json.dumps({'status':'PASS','failedDataPreserved':str(dest),'deleted':False}))
''')
            with gateway.root_sftp(target) as sftp:
                old=sftp.stat(TARGET+'/replica.py')
                if old.st_uid!=0 or old.st_mode & 0o022:raise ValueError('ROOT_PROTECTED_WORKER_REQUIRED')
                with sftp.open(TARGET+'/replica.py','rb') as stream:prior=stream.read(128*1024)
                upload(sftp,TARGET+'/replica-before-retry-'+datetime.now(timezone.utc).strftime('%H%M%S')+'.py',prior)
                with sftp.open(TARGET+'/replica.py','wb') as stream:stream.write((ROOT/'scripts/azure-dr-replica.py').read_bytes())
            result['retry']=guest(helper,target,"import subprocess,json;subprocess.run(['systemctl','reset-failed','highpass-dr-backup.service'],check=True,capture_output=True);subprocess.run(['systemctl','start','--no-block','highpass-dr-backup.service'],check=True,capture_output=True);print(json.dumps({'started':True,'oldEvidencePreserved':True}))")
        elif phase=='backup':
            with gateway.root_sftp(target) as sftp:
                upload(sftp,'/etc/systemd/system/highpass-dr-backup.service',(ROOT/'infra/azure/dr-standby-backup.service').read_bytes(),mode=0o644)
            result['backupJob']=guest(helper,target,"import subprocess,json;subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True);subprocess.run(['systemctl','start','--no-block','highpass-dr-backup.service'],check=True,capture_output=True);print(json.dumps({'started':True,'timeoutSeconds':900,'sourceRateLimit':'1MiB/s'}))")
        elif phase=='start':
            result['container']=worker(helper,target,TARGET+'/replica.py','start',40);result['status']='PASS'
        elif phase=='deadline':
            role_path=ROOT/'infra/azure/dr-self-deallocate-role.json'
            definition=json.loads(role_path.read_text())
            if definition['Actions']!=['Microsoft.Compute/virtualMachines/deallocate/action'] or definition['DataActions']:
                raise ValueError('SELF_DEALLOCATE_ONLY_PERMISSION_REQUIRED')
            roles=azure('role','definition','list','--name',definition['Name'],'--subscription',SUB)
            if roles:raise ValueError('EXISTING_CUSTOM_ROLE_REQUIRES_REVIEW')
            created=azure('role','definition','create','--role-definition',str(role_path),'--subscription',SUB)
            role_id=created['id']
            assigned=azure('role','assignment','create','--assignee-object-id',vm['identity']['principalId'],
                           '--assignee-principal-type','ServicePrincipal','--role',role_id,'--scope',vm['id'],'--subscription',SUB)
            if assigned['scope'].lower()!=vm['id'].lower():raise ValueError('EXACT_SELF_VM_SCOPE_REQUIRED')
            result['assignment']={'scope':assigned['scope'],'roleDefinitionId':role_id,'actions':definition['Actions']}
            with gateway.root_sftp(target) as sftp:
                upload(sftp,TARGET+'/self-deallocate.py',(ROOT/'scripts/azure-dr-self-deallocate.py').read_bytes())
                upload(sftp,'/etc/systemd/system/highpass-dr-self-deallocate.service',(ROOT/'infra/azure/dr-self-deallocate.service').read_bytes(),mode=0o644)
                upload(sftp,'/etc/systemd/system/highpass-dr-self-deallocate.timer',(ROOT/'infra/azure/dr-self-deallocate.timer').read_bytes(),mode=0o644)
            result['timer']=guest(helper,target,"import subprocess,json;subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True);subprocess.run(['systemctl','enable','--now','highpass-dr-self-deallocate.timer'],check=True,capture_output=True);r=subprocess.run(['systemctl','show','highpass-dr-self-deallocate.timer','-p','NextElapseUSecRealtime','-p','ActiveState'],check=True,capture_output=True,timeout=5);print(json.dumps({'status':'PASS','timer':r.stdout.decode()}))")
            result['dryRun']=guest(helper,target,"import subprocess,json;r=subprocess.run(['python3','/opt/highpass/dr-standby/self-deallocate.py','--check'],check=True,capture_output=True,timeout=10);print(r.stdout.decode())")
            result['actualScheduledDeallocation']='NOT VERIFIED';result['status']='PASS'
        elif phase=='progress':
            result['backup']=guest(helper,target,"import pathlib,subprocess,json;p=pathlib.Path('/opt/highpass/dr-standby/backup-result.json');d=p.parent/'pgdata';s=subprocess.run(['systemctl','show','highpass-dr-backup.service','-p','ActiveState','-p','SubState','-p','Result'],capture_output=True,timeout=5);print(json.dumps({'job':s.stdout.decode().strip(),'backup':json.loads(p.read_text()) if p.exists() else None,'manifestPresent':(d/'backup_manifest').is_file(),'pgVersionPresent':(d/'PG_VERSION').is_file(),'fileCount':sum(1 for x in d.rglob('*') if x.is_file()) if d.exists() else 0}))")
            result['backupClientErrors']=guest(helper,target,"import pathlib,json;b=pathlib.Path('/opt/highpass/dr-standby');logs=sorted(b.glob('backup-stderr-*.log'));lines=logs[-1].read_text()[:4096].splitlines() if logs else [];print(json.dumps([line for line in lines if line.startswith('pg_basebackup: error:')]))")
            sql="BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT coalesce(json_agg(t),'[]') FROM (SELECT phase,backup_total,backup_streamed FROM pg_stat_progress_basebackup) t;ROLLBACK;"
            result['sourceProgress']=guest(helper,source,'import subprocess,json;r=subprocess.run(["docker","exec","hp-capstone-control-postgres-1","psql","-X","-qAt","-U","hipass_bootstrap","-d","hipass","-c",'+repr(sql)+'],check=True,capture_output=True,timeout=10);print(r.stdout.decode())')
            if result['backup']['backup'] is not None:result['status']=result['backup']['backup']['status']
        elif phase=='verify':
            result['infrastructure']={'region':vm['location'],'size':vm['hardwareProfile']['vmSize'],
                                      'resourceId':vm['id'],'provisioningState':vm['provisioningState']}
            disk=azure('disk','show','--ids',vm['storageProfile']['osDisk']['managedDisk']['id'],
                        '--subscription',SUB,'--query','{sizeGiB:diskSizeGB,encryption:encryption,sku:sku.name,state:diskState}')
            result['managedDisk']=disk
            if disk['encryption']['type']!='EncryptionAtRestWithPlatformKey' or disk['sizeGiB']!=32:
                raise ValueError('EXPECTED_32GIB_PLATFORM_DISK_ENCRYPTION_REQUIRED')
            nsg=azure('network','nsg','show','-g',GROUP,'-n','nsg-highpass-dr-standby','--subscription',SUB,
                      '--query','securityRules[].{name:name,priority:priority,access:access,direction:direction,protocol:protocol,port:destinationPortRange,sources:sourceAddressPrefixes,source:sourceAddressPrefix}')
            result['standbyNsg']=nsg
            params=json.loads((folder/'public-parameters.json').read_text())
            allow=[r for r in nsg if r['access']=='Allow']
            deny=[r for r in nsg if r['access']=='Deny']
            if len(nsg)!=2 or len(allow)!=1 or len(deny)!=1 or allow[0]['port']!='22' or allow[0]['protocol']!='Tcp':
                raise ValueError('EXACT_SSH_ONLY_STANDBY_NSG_REQUIRED')
            if set(allow[0]['sources'])!={params['operatorCidr']['value'],params['primaryCidr']['value']} or deny[0]['port']!='*':
                raise ValueError('EXACT_OPERATOR_AND_SOURCE_ONLY_REQUIRED')
            result['standby']=worker(helper,target,TARGET+'/replica.py','status',30)
            sql="BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT json_build_object('started',pg_postmaster_start_time(),'recovery',pg_is_in_recovery(),'lsn',pg_current_wal_lsn(),'senders',(SELECT coalesce(json_agg(t),'[]') FROM (SELECT application_name,state,sync_state,sent_lsn,write_lsn,flush_lsn,replay_lsn FROM pg_stat_replication WHERE usename='hp_dr_repl_20261016') t),'role',(SELECT json_build_object('superuser',rolsuper,'replication',rolreplication,'createRole',rolcreaterole,'createDb',rolcreatedb,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil) FROM pg_roles WHERE rolname='hp_dr_repl_20261016'),'slots',(SELECT count(*) FROM pg_replication_slots),'hbaErrors',(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL));ROLLBACK;"
            result['primary']=guest(helper,source,'import subprocess,json;r=subprocess.run(["docker","exec","hp-capstone-control-postgres-1","psql","-X","-qAt","-U","hipass_bootstrap","-d","hipass","-c",'+repr(sql)+'],check=True,capture_output=True,timeout=10);print(r.stdout.decode())')
            primary_before=json.loads((folder/'primary-read-only.json').read_text())
            if result['primary']['started']!=primary_before['started']:raise ValueError('PRIMARY_POSTMASTER_CHANGED')
            if result['primary']['recovery'] is not False or result['primary']['hbaErrors']!=0:raise ValueError('PRIMARY_STATE_FAILED')
            senders=result['primary']['senders'];st=result['standby']
            if len(senders)!=1 or senders[0]['state']!='streaming' or senders[0]['sync_state']!='async':raise ValueError('ASYNC_STREAMING_REQUIRED')
            if not (st['recovery'] is True and st['readOnly']=='on' and st['writeDenied'] is True):raise ValueError('READ_ONLY_STANDBY_REQUIRED')
            before=json.loads((folder/'before.json').read_text());after=lab.snapshot(azure)
            result['publicAndInfrastructureBaselineUnchanged']=before==after
            if before!=after:raise ValueError('PUBLIC_OR_INFRASTRUCTURE_BASELINE_CHANGED')
            assignments=azure('role','assignment','list','--assignee-object-id',vm['identity']['principalId'],
                              '--all','--subscription',SUB,'--query','[].{scope:scope,role:roleDefinitionId}')
            result['standbyIdentityAssignments']=assignments
            deadline_files=sorted(folder.glob('replication-deadline-*.json'))
            if len(assignments)!=1 or not deadline_files:raise ValueError('ONLY_APPROVED_SELF_DEALLOCATE_ASSIGNMENT_ALLOWED')
            expected=json.loads(deadline_files[-1].read_text())['assignment']
            if assignments[0]['scope'].lower()!=vm['id'].lower() or assignments[0]['role'].lower()!=expected['roleDefinitionId'].lower():
                raise ValueError('UNREVIEWED_IDENTITY_PERMISSION')
            actual=azure('role','definition','list','--name',assignments[0]['role'].split('/')[-1],'--subscription',SUB)
            if len(actual)!=1 or len(actual[0]['permissions'])!=1:raise ValueError('EXACT_SELF_DEALLOCATE_ROLE_REQUIRED')
            permission=actual[0]['permissions'][0]
            if permission['actions']!=['Microsoft.Compute/virtualMachines/deallocate/action'] or permission['dataActions']:
                raise ValueError('KEY_OR_OTHER_MANAGEMENT_PERMISSION_FORBIDDEN')
            result['liveRoleActions']=permission['actions']
            result['keyVaultPermissionsAdded']=False
            result['primaryRuntime']=guest(helper,source,"import subprocess,json,os,shutil;names=['hp-capstone-control-control-1','hp-capstone-control-postgres-1'];items=json.loads(subprocess.check_output(['docker','inspect',*names],timeout=10));print(json.dumps({'containers':[{'name':i['Name'],'image':i['Image'],'running':i['State']['Running'],'startedAt':i['State']['StartedAt'],'health':i['State'].get('Health',{}).get('Status')} for i in items],'load':os.getloadavg(),'diskFreeBytes':shutil.disk_usage('/').free}))")
            if any(not i['running'] or i['health']!='healthy' for i in result['primaryRuntime']['containers']):
                raise ValueError('PRIMARY_CONTAINER_HEALTH_REQUIRED')
            role=result['primary']['role']
            if role['superuser'] or role['createRole'] or role['createDb'] or not role['replication'] or role['connectionLimit']!=2:
                raise ValueError('REPLICATION_ROLE_LEAST_PRIVILEGE_FAILED')
            if st['receiveLsn']!=st['replayLsn'] or st['health']!='healthy':raise ValueError('HEALTHY_REPLAY_CAUGHT_UP_REQUIRED')
            for line in st['listeners'].splitlines():
                if any(':'+port+' ' in line for port in ('15432','15433','5432')) and '127.0.0.1:' not in line:
                    raise ValueError('ONLY_LOOPBACK_DB_AND_TUNNEL_LISTENERS_ALLOWED')
            result['backup']=guest(helper,target,"import pathlib,json;print(pathlib.Path('/opt/highpass/dr-standby/backup-result.json').read_text())")
            result['status']='PASS'
    except Exception as error:
        result.update(status='FAIL',reason=str(error) if isinstance(error,ValueError) else type(error).__name__)
    finally:
        if source:source.close()
        if target:target.close()
        result['observedAt']=datetime.now(timezone.utc).isoformat()
        path=folder/('replication-'+phase+'-'+datetime.now(timezone.utc).strftime('%H%M%S')+'.json')
        path.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({**result,'evidence':str(path)}))
    return 1 if result['status']=='FAIL' else 0


if __name__=='__main__':raise SystemExit(main())
