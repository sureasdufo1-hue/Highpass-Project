"""Standby-only guest worker. Streams/filters backup, verifies, starts read-only PG.

Never promotes. Source TLS private keys are discarded in the tar stream before
disk extraction. No raw backup tar or database rows are written to normal logs.
"""
import argparse
from datetime import datetime, timezone
import json
import os
import pathlib
import shutil
import subprocess
import tarfile

BASE=pathlib.Path('/opt/highpass/dr-standby')
DATA=BASE/'pgdata'
IMAGE='highpass-postgres-dr:16-20261016'
NAME='hp-dr-postgres'
CONN=('host=highpass-v3-postgres.invalid hostaddr=127.0.0.1 port=15432 '
      'user=hp_dr_repl_20261016 passfile=/run/dr/replication.pgpass '
      'sslmode=verify-full sslrootcert=/run/dr/root-ca.crt '
      'application_name=hp-dr-standby connect_timeout=5')


def safe_member(name):
    p=pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or '\\' in name or '\x00' in name:
        raise ValueError('UNSAFE_BACKUP_MEMBER')
    return p


def is_private_key(name):
    p=safe_member(name)
    return p.suffix.lower() in ('.key','.pem','.pfx','.p12') or p.name in ('id_rsa','id_ed25519','id_ecdsa','id_dsa')


def extract_stream(stream,directory,max_bytes=1024**3):
    """No generic tar extraction, no links/devices, bounded file data, empty target."""
    directory=pathlib.Path(directory)
    if not directory.is_dir() or any(directory.iterdir()):raise ValueError('EMPTY_NEW_TARGET_REQUIRED')
    ignored=[];total=0
    # pg_basebackup stdout can append injected manifest content after tar padding.
    # Consume through EOF, not the first zero header (which prematurely closed stdout).
    with tarfile.open(fileobj=stream,mode='r|',ignore_zeros=True) as archive:
        for member in archive:
            p=safe_member(member.name)
            target=directory.joinpath(*p.parts)
            if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
                raise ValueError('LINKS_AND_SPECIAL_FILES_FORBIDDEN')
            if member.size<0 or member.size>max_bytes or total+member.size>max_bytes:
                raise ValueError('BACKUP_SIZE_LIMIT')
            total+=member.size
            if is_private_key(member.name):
                ignored.append(str(p));continue
            if member.isdir():target.mkdir(mode=0o700,parents=True,exist_ok=True);continue
            target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            source=archive.extractfile(member)
            if source is None:raise ValueError('REGULAR_FILE_STREAM_REQUIRED')
            with target.open('xb') as out:
                shutil.copyfileobj(source,out,length=65536)
            target.chmod(0o600)
    return {'streamBytes':total,'excludedPrivateKeyFiles':ignored}


def run(args,timeout=15):
    result=subprocess.run(args,capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError('STANDBY_GUEST_COMMAND_FAILED')
    return result.stdout.decode().strip()


def build():
    result={'status':'NOT VERIFIED'}
    try:
        with (BASE/'image-build.log').open('xb') as log:
            process=subprocess.run(['docker','build','--pull','-f',str(BASE/'Dockerfile.postgres'),'-t',IMAGE,str(BASE)],
                                   stdout=log,stderr=subprocess.STDOUT,timeout=600)
        if process.returncode:raise ValueError('ISOLATED_IMAGE_BUILD_FAILED')
        version=run(['docker','run','--rm',IMAGE,'postgres','--version'])
        if '16.15' not in version:raise ValueError('MATCHED_POSTGRES_VERSION_REQUIRED')
        result={'status':'PASS','image':IMAGE,'imageId':json.loads(run(['docker','image','inspect',IMAGE]))[0]['Id'],
                'postgresVersion':version,'vulnerabilityScan':'NOT VERIFIED'}
    except Exception as error:result={'status':'FAIL','reason':str(error) if isinstance(error,ValueError) else type(error).__name__}
    (BASE/'image-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
    return 0 if result['status']=='PASS' else 1


def client_args():
    return ['docker','run','--rm','--network','host','--user','70:70','--cap-drop','ALL',
            '--security-opt','no-new-privileges:true','--read-only','--pids-limit','64',
            '--memory','128m','--cpus','0.5','--mount','type=bind,src='+str(BASE/'secrets')+',dst=/run/dr,readonly',
            '--tmpfs','/tmp:rw,noexec,nosuid,size=32m,uid=70,gid=70,mode=0700',IMAGE]


def backup():
    result={'status':'NOT VERIFIED','scope':'FILTERED_PHYSICAL_DATABASE_BACKUP_ONLY'}
    child=None
    try:
        if datetime.now(timezone.utc)>=datetime(2026,10,20,14,59,tzinfo=timezone.utc):raise ValueError('DEMO_WINDOW_EXPIRED')
        if DATA.exists():raise ValueError('PGDATA_ALREADY_EXISTS_NO_OVERWRITE')
        if shutil.disk_usage(BASE).free<4*1024**3:raise ValueError('STANDBY_DISK_HEADROOM_REQUIRED')
        version=run(client_args()+['postgres','--version'])
        if '16.15' not in version:raise ValueError('MATCHED_POSTGRES_VERSION_REQUIRED')
        # Ordinary SQL access must be denied even with the valid replication password.
        denied=subprocess.run(client_args()+['psql',CONN+' dbname=hipass','-X','-qAt','-c','SELECT 1'],capture_output=True,timeout=20)
        if denied.returncode==0 or b'pg_hba.conf rejects connection' not in denied.stderr:
            raise ValueError('REPLICATION_ROLE_MUST_NOT_OPEN_NORMAL_DATABASE')
        result['ordinarySqlDenied']='PASS'
        DATA.mkdir(mode=0o700)
        # -Xfetch permits stdout tar filtering; no permanent or temporary slot is used.
        # A missing recycled WAL fails the backup instead of retaining WAL on primary.
        error_path=BASE/('backup-stderr-'+datetime.now(timezone.utc).strftime('%H%M%S')+'.log')
        with error_path.open('xb') as error_stream:
            child=subprocess.Popen(client_args()+['pg_basebackup','--dbname',CONN,'-D','-','-Ft',
                  '-X','fetch','--checkpoint=spread','--max-rate=1M','--manifest-checksums=SHA256',
                  '--no-slot','--label=highpass-isolated-dr-20261016'],stdout=subprocess.PIPE,stderr=error_stream)
            filtered=extract_stream(child.stdout,DATA)
            result.update(filtered)
            child.stdout.close()
            result['baseBackupExitCode']=child.wait(timeout=30)
            if result['baseBackupExitCode']!=0:raise ValueError('BASE_BACKUP_FAILED')
        if (DATA/'PG_VERSION').read_text().strip()!='16':raise ValueError('PG16_DATA_REQUIRED')
        if not (DATA/'backup_manifest').is_file():raise ValueError('BACKUP_MANIFEST_REQUIRED')
        for path in DATA.rglob('*'):
            if is_private_key(path.name):raise ValueError('PRIVATE_KEY_MUST_NOT_PERSIST_IN_PGDATA')
        verification=client_args()
        # Mount source data separately read-only; all exclusions are explicitly reported.
        verification.insert(2,'--mount');verification.insert(3,'type=bind,src='+str(DATA)+',dst=/backup,readonly')
        # Verification runs as root because extraction owner is root until checked.
        verification[verification.index('--user')+1]='0:0'
        verify_args=['pg_verifybackup']
        for name in filtered['excludedPrivateKeyFiles']:verify_args+=['--ignore',name]
        verified=run(verification+verify_args+['/backup'],timeout=120)
        result.update(filtered)
        result['manifestVerification']='PASS_WITH_EXPLICIT_PRIVATE_KEY_EXCLUSIONS'
        # Only now change standby-specific configuration, after manifest verification.
        auto=DATA/'postgresql.auto.conf'
        with auto.open('a') as stream:
            stream.write("\n# Isolated standby; no promotion executor\nprimary_conninfo = '"+CONN+"'\nprimary_slot_name = ''\nhot_standby_feedback = off\nmax_standby_streaming_delay = '5s'\n")
        (DATA/'standby.signal').touch(mode=0o600)
        (DATA/'pg_hba.conf').write_text('local all hipass_bootstrap trust\nlocal all all reject\nhostssl all hipass_bootstrap 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n')
        os.chown(DATA,70,70)
        for path in DATA.rglob('*'):os.chown(path,70,70)
        result['status']='PASS'
        result['standbyReadyToStart']=True
    except Exception as error:
        if child and child.poll() is None:child.terminate();child.wait(timeout=10)
        result.update(status='FAIL',reason=str(error) if isinstance(error,ValueError) else type(error).__name__)
    finally:
        (BASE/'backup-result.json').write_text(json.dumps(result,indent=2))
        (BASE/'backup-result.json').chmod(0o600)
    print(json.dumps(result))
    return 0 if result['status']=='PASS' else 1


def start():
    result=json.loads((BASE/'backup-result.json').read_text())
    if result['status']!='PASS' or not (DATA/'standby.signal').exists():raise ValueError('VERIFIED_STANDBY_SIGNAL_REQUIRED')
    if run(['docker','ps','-aq','--filter','name=^/'+NAME+'$']):raise ValueError('EXISTING_CONTAINER_NO_OVERWRITE')
    directory=BASE/'secrets'
    key=directory/'local.key';cert=directory/'local.crt'
    if key.exists() or cert.exists():raise ValueError('EXISTING_LOCAL_TLS_KEY_NO_OVERWRITE')
    run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','7',
         '-subj','/CN=highpass-dr-postgres.invalid','-keyout',str(key),'-out',str(cert)])
    for path in (key,cert):path.chmod(0o600);os.chown(path,70,70)
    args=['docker','run','-d','--name',NAME,'--restart','unless-stopped','--network','host',
          '--user','70:70','--cap-drop','ALL','--security-opt','no-new-privileges:true',
          '--read-only','--pids-limit','128','--memory','1g','--cpus','1',
          '--mount','type=bind,src='+str(DATA)+',dst=/var/lib/postgresql/data',
          '--mount','type=bind,src='+str(directory)+',dst=/run/dr,readonly',
          '--tmpfs','/tmp:rw,noexec,nosuid,size=32m,uid=70,gid=70,mode=0700',
          '--health-cmd','pg_isready -h /tmp -p 15433 -U hipass_bootstrap -d hipass -t 3',
          '--health-interval','10s','--health-timeout','4s','--health-retries','12',
          IMAGE,'postgres','-D','/var/lib/postgresql/data','-c','listen_addresses=127.0.0.1',
          '-c','port=15433','-c','unix_socket_directories=/tmp','-c','hot_standby=on',
          '-c','archive_mode=off','-c','ssl=on','-c','ssl_cert_file=/run/dr/local.crt',
          '-c','ssl_key_file=/run/dr/local.key']
    run(args)
    print(json.dumps({'status':'PASS','containerStarted':NAME,'promotionExecuted':False,'publicListener':False}))


def status():
    query="BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT json_build_object('recovery',pg_is_in_recovery(),'readOnly',current_setting('transaction_read_only'),'receiveLsn',pg_last_wal_receive_lsn(),'replayLsn',pg_last_wal_replay_lsn(),'replayTimestamp',pg_last_xact_replay_timestamp(),'receiver',(SELECT coalesce(json_agg(t),'[]') FROM (SELECT status,slot_name,receive_start_lsn,written_lsn,flushed_lsn,latest_end_lsn FROM pg_stat_wal_receiver) t));ROLLBACK;"
    info=json.loads(run(['docker','inspect',NAME]))[0]
    state=json.loads(run(['docker','exec',NAME,'psql','-h','/tmp','-p','15433','-X','-qAt','-U','hipass_bootstrap','-d','hipass','-c',query]))
    if state['recovery'] is not True:raise ValueError('READ_ONLY_RECOVERY_REQUIRED_NO_PROBE_ON_WRITER')
    attempt=subprocess.run(['docker','exec',NAME,'psql','-h','/tmp','-p','15433','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','hipass_bootstrap','-d','hipass','-c','BEGIN;CREATE TABLE public.__highpass_dr_readonly_probe(id integer);ROLLBACK;'],capture_output=True,timeout=10)
    state['writeDenied']=attempt.returncode!=0 and b'25006' in attempt.stderr
    state['health']=info['State'].get('Health',{}).get('Status')
    state['listeners']=run(['ss','-H','-ltn'])
    print(json.dumps(state))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['build','backup','start','status'])
    phase=parser.parse_args().phase
    raise SystemExit({'build':build,'backup':backup,'start':start,'status':status}[phase]() or 0)
