"""Real nonroot read-only container mount/config QA, without opening DB sockets."""
import argparse
import importlib.util
import json
import os
import pathlib
import re
import shlex
import uuid
from datetime import datetime, timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
ROLES=('hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader')
PROGRAM="""import {createCapstoneMountedSecretPool} from './src/v3-capstone-secret-pool.js';
import {existsSync} from 'node:fs';
const role=process.argv[1];
const pool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role});
const roles=['hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader'];
if(roles.some(other=>other!==role&&existsSync('/run/secrets/highpass-v3-'+other+'.json')))throw Error('CROSS_ROLE_MOUNT');
if(pool.options.ssl.rejectUnauthorized!==true||pool.options.ssl.servername!=='highpass-v3-postgres.invalid')throw Error('TLS_CONFIGURATION');
await pool.end();console.log(JSON.stringify({result:'PASS',role,nonrootUid:process.getuid(),singleRoleMount:true,tlsVerificationRequired:true,databaseConnection:'NOT VERIFIED'}));"""
TLS_PROGRAM="""import {createCapstoneMountedSecretPool} from './src/v3-capstone-secret-pool.js';
import {Pool} from 'pg';import {readFileSync} from 'node:fs';
const role=process.argv[1],pool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role});
const outcomes=[];
try{
 const client=await pool.connect();try{
  await client.query('BEGIN READ ONLY');
  const r=(await client.query("SELECT current_user actor,current_database() database,current_setting('transaction_read_only') readonly,ssl,version,bits FROM pg_stat_ssl WHERE pid=pg_backend_pid()" )).rows[0];
  if(!r||r.actor!==role||r.database!=='highpass_v3_capstone'||r.readonly!=='on'||r.ssl!==true||!['TLSv1.2','TLSv1.3'].includes(r.version)||r.bits<128)throw Error('POSITIVE_TLS_NOT_VERIFIED');
  await client.query('ROLLBACK');outcomes.push({name:'verified-ca-hostname-scram',result:'PASS',protocol:r.version,bits:r.bits});
 }finally{client.release();}
 const wrongCa=readFileSync('/run/secrets/highpass-v3-negative-ca.crt','utf8');
 for(const [name,config,codes] of [
  ['wrong-hostname',{...pool.options,host:'wrong-db.invalid'},['ERR_TLS_CERT_ALTNAME_INVALID']],
  ['untrusted-ca',{...pool.options,ssl:{...pool.options.ssl,ca:wrongCa}},['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN']],
  // Deliberate negative request only; production factory never accepts plaintext.
  ['plaintext',{...pool.options,ssl:false},['28000']],
  ['wrong-password',{...pool.options,password:'0'.repeat(64)},['28P01']]
 ]){
  const probe=new Pool(config);let denied;
  try{const c=await probe.connect();c.release();}catch(error){denied=error.code;}
  finally{await probe.end();}
  if(!codes.includes(denied))throw Error('NEGATIVE_REASON_NOT_VERIFIED');
  outcomes.push({name,result:'PASS',expected:'DENY',actual:'DENY',code:denied});
 }
 console.log(JSON.stringify({result:'PASS',role,nonrootUid:process.getuid(),databaseConnection:'PASS',outcomes}));
}catch(error){console.log(JSON.stringify({result:'NOT VERIFIED',role,reason:['POSITIVE_TLS_NOT_VERIFIED','NEGATIVE_REASON_NOT_VERIFIED'].includes(error.message)?error.message:'TLS_CONNECTION_NOT_VERIFIED',safeCode:error.code??null,outcomes}));process.exitCode=1;}
finally{await pool.end();}"""


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mount-operation',required=True);parser.add_argument('--tls-operation',required=True)
    parser.add_argument('--network-owner');args=parser.parse_args()
    if not all(re.fullmatch('[a-f0-9]{32}',value) for value in (args.mount_operation,args.tls_operation)):raise SystemExit('OPERATION_INVALID')
    if args.network_owner and not re.fullmatch('[a-f0-9]{32}',args.network_owner):raise SystemExit('NETWORK_OWNER_INVALID')
    operation=uuid.uuid4().hex
    evidence=ROOT/'artifacts/azure'/('v3-mounted-pool-check-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+operation[:8]);evidence.mkdir(parents=True,exist_ok=False)
    stage='/home/highpassadmin/.highpass-v3-mount-check-'+operation
    code='/opt/highpass/v3-mount-check-'+operation
    secret='/opt/highpass/v3-runtime-mounts-'+args.mount_operation
    ca='/opt/highpass/v3-db-tls-'+args.tls_operation+'/ca.crt'
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,'scope':'OWNED NONROOT NETWORK_NONE READONLY MOUNT QA ONLY',
            'databaseConnection':'NOT VERIFIED','serviceActivated':False,'results':[]}
    client=paramiko.SSHClient()
    try:
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                       allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health="sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        network='none'
        if args.network_owner:
            network='highpass-v3-db-'+args.network_owner[:12]
            observed=json.loads(ops.command(client,'sudo -n timeout 10s docker network inspect '+network+" --format '{{json .}}'"))
            if observed.get('Labels',{}).get('highpass.capstone.v3-db')!=args.network_owner or observed.get('Internal') is not True:
                raise RuntimeError('OWNED_PRIVATE_NETWORK_REQUIRED')
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(15);sftp.mkdir(stage,mode=0o700)
            for name in ('v3-capstone-secret-pool.js','v3-capstone-identity-grants.js'):
                sftp.put(str(ROOT/'src'/name),stage+'/'+name,confirm=True)
            if args.network_owner:
                sftp.put(str(ROOT/'tmp/certs/identity-edge/untrusted-dev.crt'),stage+'/negative-ca.crt',confirm=True)
        ops.root_shell(client,'test ! -e '+code+'; install -d -o root -g root -m 700 '+code+'; '+
                       'install -o root -g root -m 644 '+stage+'/v3-capstone-secret-pool.js '+code+'/v3-capstone-secret-pool.js; '+
                       'install -o root -g root -m 644 '+stage+'/v3-capstone-identity-grants.js '+code+'/v3-capstone-identity-grants.js')
        if args.network_owner:
            ops.root_shell(client,'install -o root -g root -m 644 '+stage+'/negative-ca.crt '+code+'/negative-ca.crt')
        for role in ROLES:
            name='hp-v3-mount-check-'+operation[:12]+'-'+role
            result['activeOwnedContainer']=name
            arguments=['sudo','-n','timeout','20s','docker','run','--rm','--name',name,'--label','highpass.validation.mount-check='+operation,
                       '--network',network,'--user','65532:65532','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
                       '--mount','type=bind,src='+secret+'/highpass-v3-'+role+'.json,dst=/run/secrets/highpass-v3-'+role+'.json,readonly',
                       '--mount','type=bind,src='+ca+',dst=/run/secrets/highpass-v3-db-ca.crt,readonly']
            for file in ('v3-capstone-secret-pool.js','v3-capstone-identity-grants.js'):
                arguments+=['--mount','type=bind,src='+code+'/'+file+',dst=/app/src/'+file+',readonly']
            if args.network_owner:
                arguments+=['--mount','type=bind,src='+code+'/negative-ca.crt,dst=/run/secrets/highpass-v3-negative-ca.crt,readonly']
            arguments+=[ops.EXPECTED,'--input-type=module','-e',TLS_PROGRAM if args.network_owner else PROGRAM,role]
            value=json.loads(ops.command(client,shlex.join(arguments)))
            if value.get('result')!='PASS' or value.get('role')!=role or value.get('nonrootUid')!=65532:raise RuntimeError('MOUNT_RESULT_INVALID')
            result['results'].append(value)
            absence=ops.command(client,'sudo -n timeout 10s docker container ls -aq --filter '+shlex.quote('name=^/'+name+'$'))
            if absence:raise RuntimeError('OWNED_CONTAINER_ABSENCE_NOT_VERIFIED')
            result.pop('activeOwnedContainer',None)
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result.update(status='PASS',ownedContainersRemoved=True,existingLegacyHealthy='PASS',sourceStageRetained=code)
        if args.network_owner:
            result.update(scope='ACTUAL PRIVATE NETWORK NONOWNER DB TLS POSITIVE AND NEGATIVE QA',databaseConnection='PASS',network=network)
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
    finally:
        client.close();(evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':main_exit=main();raise SystemExit(main_exit)
