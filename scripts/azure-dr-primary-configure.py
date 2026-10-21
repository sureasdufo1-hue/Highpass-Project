"""Root guest worker: scoped replication identity and outbound reverse SSH only.

Does not restart PostgreSQL, alter application schemas, publish DB ports, create
replication slots, change primary NSG/DNS/Entra, or promote any database.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
import pathlib
import secrets
import subprocess
import time

BASE = pathlib.Path('/opt/highpass/dr-source')
DB = 'hp-capstone-control-postgres-1'
CONTROL = 'hp-capstone-control-control-1'
ROLE = 'hp_dr_repl_20261016'
END = datetime(2026,10,20,14,59,tzinfo=timezone.utc)
NETWORK = 'hp-capstone-control_db_private'


def command(args, data=None, timeout=15):
    process = subprocess.run(args,input=data,capture_output=True,timeout=timeout)
    if process.returncode:raise RuntimeError('SCOPED_GUEST_COMMAND_FAILED')
    return process.stdout


def paths():
    data=json.loads(command(['docker','inspect',DB]))[0]
    mounts=[m for m in data['Mounts'] if m['Destination']=='/var/lib/postgresql/data']
    if len(mounts)!=1:raise ValueError('EXACT_PGDATA_REQUIRED')
    return pathlib.Path(mounts[0]['Source'])


def network():
    info=json.loads(command(['docker','inspect',DB]))[0]
    address=info['NetworkSettings']['Networks'][NETWORK]['IPAddress']
    ipam=json.loads(command(['docker','network','inspect',NETWORK]))[0]['IPAM']['Config']
    if len(ipam)!=1 or not ipam[0].get('Gateway'):raise ValueError('BRIDGE_GATEWAY_REQUIRED')
    return address,ipam[0]['Gateway']


def prepare():
    if datetime.now(timezone.utc)>=END:raise ValueError('DEMO_WINDOW_EXPIRED')
    BASE.mkdir(mode=0o700,exist_ok=True)
    (BASE/'secrets').mkdir(mode=0o700,exist_ok=True)
    password=BASE/'secrets/replication-password'
    if not password.exists():
        with password.open('x') as stream:stream.write(secrets.token_hex(32))
        password.chmod(0o600)
    private=BASE/'secrets/tunnel_ed25519'
    if not private.exists():
        command(['ssh-keygen','-q','-t','ed25519','-N','','-C','highpass-scoped-dr-tunnel','-f',str(private)])
    public=(private.with_suffix('.pub')).read_text().split()
    print(json.dumps({'status':'PASS','phase':'SOURCE_SECRETS_CREATED_ROOT_ONLY',
                      'tunnelPublicKey':' '.join(public[:2]),'sourceNetwork':network(),
                      'databaseChanged':False}))


NODE = r"""
const fs=require('node:fs'),{Client}=require('pg');let input='';
process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);
process.stdin.on('end',async()=>{
 let c;try{
 const v=JSON.parse(input);c=new Client({host:v.host,port:5432,database:'hipass',user:'hipass_bootstrap',
 password:v.admin,ssl:{ca:v.ca,servername:'highpass-v3-postgres.invalid',rejectUnauthorized:true},
 connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000});await c.connect();
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='1s'");
 await c.query("SET LOCAL log_statement='none'");await c.query("SET LOCAL log_min_error_statement='panic'");
 await c.query('SET LOCAL log_parameter_max_length_on_error=0');
 if(v.disable){await c.query('ALTER ROLE hp_dr_repl_20261016 NOLOGIN');}
 else{
 await c.query("SELECT set_config('highpass.dr_password',$1,true)",[v.password]);
 await c.query(`DO $dr$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hp_dr_repl_20261016') THEN RAISE EXCEPTION 'ROLE_ALREADY_EXISTS'; END IF;
 EXECUTE format('CREATE ROLE hp_dr_repl_20261016 LOGIN REPLICATION NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 2 PASSWORD %L VALID UNTIL %L',current_setting('highpass.dr_password'),'2026-10-20T14:59:00Z');
 END $dr$;`);
 }await c.query('COMMIT');await c.end();console.log(JSON.stringify({status:'PASS'}));
 }catch(e){if(c)await c.end().catch(()=>{});console.log(JSON.stringify({status:'FAIL',code:e.code||'DB_OPERATION_FAILED'}));process.exitCode=1;}
});
"""


def role_operation(disable=False):
    config=json.loads((BASE/'config.json').read_text())
    password=(BASE/'secrets/replication-password').read_text()
    admin=pathlib.Path('/opt/highpass/capstone-control-secrets/admin-password').read_text().strip()
    public_ca=(BASE/'root-ca.crt').read_text()
    payload=json.dumps({'host':network()[0],'password':password,'admin':admin,'ca':public_ca,'disable':disable}).encode()
    result=command(['docker','exec','-i',CONTROL,'/nodejs/bin/node','-e',NODE],payload,20)
    if json.loads(result).get('status')!='PASS':raise ValueError('ROLE_OPERATION_FAILED')


def hba_block(gateway):
    ip=ipaddress.ip_address(gateway)
    if ip.version!=4 or not ip.is_private:raise ValueError('PRIVATE_BRIDGE_REQUIRED')
    return ('# BEGIN HIGHPASS DR 20261016\n'
            f'hostssl replication {ROLE} {gateway}/32 scram-sha-256\n'
            f'host replication {ROLE} 0.0.0.0/0 reject\n'
            f'host replication {ROLE} ::/0 reject\n'
            f'local replication {ROLE} reject\n'
            f'host all {ROLE} 0.0.0.0/0 reject\n'
            f'host all {ROLE} ::/0 reject\n'
            f'local all {ROLE} reject\n'
            '# END HIGHPASS DR 20261016\n').encode()


def sql(value):
    result=command(['docker','exec',DB,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','hipass','-c',value])
    return result.decode().strip()


def configure():
    if datetime.now(timezone.utc)>=END:raise ValueError('DEMO_WINDOW_EXPIRED')
    hba=paths()/'pg_hba.conf'
    original=hba.read_bytes()
    if b'HIGHPASS DR 20261016' in original or (BASE/'role-created.json').exists():
        raise ValueError('EXISTING_DR_CONFIGURATION_REQUIRES_REVIEW')
    # Existing content is preserved exactly, after the dedicated role-only rules.
    stat=hba.stat();backup=BASE/'hba-before.conf'
    with backup.open('xb') as stream:stream.write(original)
    backup.chmod(0o600)
    role_operation()
    (BASE/'role-created.json').write_text(json.dumps({'createdAt':datetime.now(timezone.utc).isoformat(),'role':ROLE}))
    patched=hba_block(network()[1])+original
    temp=hba.with_name('pg_hba.dr-20261016.tmp')
    try:
        if hba.read_bytes()!=original:raise ValueError('CONCURRENT_HBA_CHANGE')
        with temp.open('xb') as stream:stream.write(patched);stream.flush();os.fsync(stream.fileno())
        temp.chmod(stat.st_mode & 0o777);os.chown(temp,stat.st_uid,stat.st_gid);temp.replace(hba)
        errors=sql("SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL")
        if errors!='0':raise ValueError('HBA_PARSE_ERROR')
        if sql('SELECT pg_reload_conf()')!='t':raise ValueError('HBA_RELOAD_FAILED')
    except Exception:
        # Roll back only if the file still equals our exact patch; preserve others' edits.
        if hba.read_bytes()==patched:
            with hba.open('wb') as stream:stream.write(original);stream.flush();os.fsync(stream.fileno())
            sql('SELECT pg_reload_conf()')
        role_operation(disable=True)
        raise
    command(['logger','-t','highpass-dr','DR_REPLICATION_ROLE_CREATED_AND_SCOPED_HBA_RELOADED'])
    print(json.dumps({'status':'PASS','role':ROLE,'hbaBeforeSha256':hashlib.sha256(original).hexdigest(),
                      'hbaAfterSha256':hashlib.sha256(patched).hexdigest(),'databaseRestarted':False,
                      'replicationSlotCreated':False}))


def watch():
    config=json.loads((BASE/'config.json').read_text())
    address=str(ipaddress.ip_address(config['standbyIp']))
    private=BASE/'secrets/tunnel_ed25519'
    child=None;last=None
    try:
        while datetime.now(timezone.utc)<END:
            dest=network()[0]
            if child is None or child.poll() is not None or dest!=last:
                if child and child.poll() is None:child.terminate();child.wait(timeout=5)
                child=subprocess.Popen(['ssh','-N','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
                     '-o','UserKnownHostsFile='+str(BASE/'known_hosts'),'-o','IdentitiesOnly=yes',
                     '-o','ConnectTimeout=10','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15',
                     '-o','ServerAliveCountMax=2','-i',str(private),'-R','127.0.0.1:15432:'+dest+':5432',
                     'hpreplicatunnel@'+address],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                last=dest
            time.sleep(5)
    finally:
        if child and child.poll() is None:child.terminate();child.wait(timeout=5)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['prepare','configure','watch'])
    phase=parser.parse_args().phase
    {'prepare':prepare,'configure':configure,'watch':watch}[phase]()
