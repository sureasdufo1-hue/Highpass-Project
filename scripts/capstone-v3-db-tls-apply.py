"""Pinned capstone DB TLS operator. Preserve legacy DB/service; no runtime activation."""
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
import ipaddress

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
ROLES='hp_v3_app,hp_v3_identity_preauth_writer,hp_v3_identity_preauth_reader'
PGDATA='/var/lib/postgresql/data'


def tls_hba(operation,subnet):
    if not re.fullmatch('[a-f0-9]{32}',operation):raise ValueError('OPERATION_INVALID')
    network=ipaddress.ip_network(subnet,strict=True)
    if network.version!=4 or not 16<=network.prefixlen<=28 or not any(network.subnet_of(ipaddress.ip_network(block)) for block in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')):
        raise ValueError('PRIVATE_SUBNET_REQUIRED')
    return ('# HIGHPASS_V3_TLS_'+operation+'\n'+
            'local highpass_v3_capstone '+ROLES+' scram-sha-256\n'+
            'host highpass_v3_capstone '+ROLES+' 127.0.0.1/32 scram-sha-256\n'+
            'host highpass_v3_capstone '+ROLES+' ::1/128 scram-sha-256\n'+
            'hostssl highpass_v3_capstone '+ROLES+' '+str(network)+' scram-sha-256\n'+
            'hostnossl highpass_v3_capstone '+ROLES+' all reject\n'+
            'local all '+ROLES+' reject\n'+
            'host all '+ROLES+' all reject\n')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--tls-operation');args=parser.parse_args()
    if args.apply and not re.fullmatch('[a-f0-9]{32}',args.tls_operation or ''):raise SystemExit('TLS_OPERATION_INVALID')
    operation=uuid.uuid4().hex
    evidence=ROOT/'artifacts/azure'/('v3-db-tls-apply-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+operation[:8]);evidence.mkdir(parents=True,exist_ok=False)
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,'serviceActivated':False,'clinicalReadiness':'NOT VERIFIED'}
    client=paramiko.SSHClient();mutated=False;post_config_hash=None;network=None;connected=False;phase='READ_ONLY_INVENTORY'
    auto=PGDATA+'/postgresql.auto.conf';hba=PGDATA+'/pg_hba.conf';backup_auto=auto+'.v3-tls-'+operation+'.before';backup_hba=hba+'.v3-tls-'+operation+'.before'
    def shell(body):return ops.command(client,'sudo -n timeout 15s docker exec '+ops.PG+' sh -c '+shlex.quote('set -eu; '+body))
    def digest(file):return shell('sha256sum '+file).split()[0]
    def health():
        value=ops.command(client,"sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'")
        if value!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
    try:
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                       allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health()
        settings=json.loads(ops.sql(client,"BEGIN READ ONLY;SELECT json_agg(json_build_object('name',name,'setting',setting,'context',context,'pendingRestart',pending_restart) ORDER BY name) FROM pg_settings WHERE name IN ('ssl','ssl_cert_file','ssl_key_file','ssl_min_protocol_version','data_directory','hba_file');ROLLBACK;",ops.TARGET))
        result['beforeSettings']=settings
        result['postgresPublishedPorts']=json.loads(ops.command(client,"sudo -n timeout 10s docker inspect "+ops.PG+" --format '{{json .HostConfig.PortBindings}}'"))
        if not args.apply:
            result.update(status='PASS',scope='READ_ONLY_SSL_SETTINGS_INVENTORY',tlsConnection='NOT VERIFIED')
        else:
            byname={row['name']:row for row in settings}
            if byname['data_directory']['setting']!=PGDATA or byname['hba_file']['setting']!=hba or byname['ssl']['setting']!='off' or result['postgresPublishedPorts']:
                raise RuntimeError('PG_BASELINE_NOT_SELECTED')
            if any(byname[name]['context']!='sighup' or byname[name]['pendingRestart'] for name in ('ssl','ssl_cert_file','ssl_key_file','ssl_min_protocol_version')):
                raise RuntimeError('BOUNDED_RELOAD_NOT_AVAILABLE')
            phase='PROTECTED_CONFIG_BACKUP'
            shell('test ! -e '+backup_auto+'; test ! -e '+backup_hba+'; cp -p '+auto+' '+backup_auto+'; cp -p '+hba+' '+backup_hba)
            result['configBackup']={'auto':backup_auto,'hba':backup_hba,'autoSha256':digest(backup_auto),'hbaSha256':digest(backup_hba)}
            original=ops.command(client,'sudo -n timeout 10s docker exec '+ops.PG+' cat '+hba)
            if not original.startswith('# HIGHPASS_V3_AUTH_') or '\n# HIGHPASS_V3_TLS_' in original:
                raise RuntimeError('HBA_BASELINE_NOT_SELECTED')
            # Previous operator prefix exactly7 lines including marker; rest untouched.
            lines=original.splitlines(keepends=True)
            if len(lines)<7 or any(ROLES not in line for line in lines[1:7]):raise RuntimeError('HBA_PREFIX_NOT_SELECTED')
            phase='INSTALL_STAGED_CERTIFICATE'
            stage='/opt/highpass/v3-db-tls-'+args.tls_operation
            destination=PGDATA+'/highpass-v3-tls-'+operation
            ops.root_shell(client,'test "$(stat -c %U:%G:%a '+stage+'/server.key)" = root:root:600; timeout 10s openssl verify -CAfile '+stage+'/ca.crt -verify_hostname highpass-v3-postgres.invalid -purpose sslserver '+stage+'/server.crt >/dev/null')
            shell('test ! -e '+destination+'; mkdir -m 700 '+destination+'; chown postgres:postgres '+destination)
            for file in ('server.key','server.crt'):
                ops.root_shell(client,'timeout 10s docker cp '+stage+'/'+file+' '+ops.PG+':'+destination+'/'+file)
            shell('chown postgres:postgres '+destination+'/server.key '+destination+'/server.crt; chmod 600 '+destination+'/server.key; chmod 644 '+destination+'/server.crt')
            phase='TLS_RELOAD'
            mutated=True
            ops.sql(client,"ALTER SYSTEM SET ssl='on';ALTER SYSTEM SET ssl_cert_file='"+destination+"/server.crt';ALTER SYSTEM SET ssl_key_file='"+destination+"/server.key';ALTER SYSTEM SET ssl_min_protocol_version='TLSv1.2';",ops.TARGET)
            post_config_hash=digest(auto)
            if ops.sql(client,'SELECT pg_reload_conf();',ops.TARGET)!='t':raise RuntimeError('RELOAD_NOT_ACKNOWLEDGED')
            # New session after bounded SIGHUP delivery; actual setting is authoritative.
            import time
            until=time.monotonic()+5
            while time.monotonic()<until:
                if ops.sql(client,'SHOW ssl;',ops.TARGET)=='on':break
                time.sleep(0.2)
            else:raise RuntimeError('SSL_NOT_ACTIVE')
            health()
            phase='OWNED_PRIVATE_DB_NETWORK'
            network='highpass-v3-db-'+operation[:12]
            ops.command(client,'sudo -n timeout 10s docker network create --internal --label highpass.capstone.v3-db='+operation+' '+network)
            ops.command(client,'sudo -n timeout 10s docker network connect --alias highpass-v3-postgres.invalid --alias wrong-db.invalid '+network+' '+ops.PG)
            connected=True
            address=json.loads(ops.command(client,'sudo -n timeout 10s docker network inspect '+network+" --format '{{json .IPAM.Config}}'"))
            if len(address)!=1 or not isinstance(address[0].get('Subnet'),str):raise RuntimeError('PRIVATE_NETWORK_SUBNET_NOT_VERIFIED')
            subnet=address[0]['Subnet']
            phase='V3_TLS_ONLY_HBA'
            temporary=hba+'.v3-tls-'+operation+'.pending'
            payload=(tls_hba(operation,subnet)+''.join(lines[7:])+'\n').encode()
            script='set -eu; umask 077; test ! -e '+temporary+'; set -C; cat > '+temporary+'; chown "$(stat -c %u:%g '+hba+')" '+temporary+'; chmod "$(stat -c %a '+hba+')" '+temporary+'; mv '+temporary+' '+hba
            ops.command(client,'sudo -n timeout 10s docker exec -i '+ops.PG+' sh -c '+shlex.quote(script),payload)
            if ops.sql(client,'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;',ops.TARGET)!='0' or ops.sql(client,'SELECT pg_reload_conf();',ops.TARGET)!='t':
                raise RuntimeError('TLS_HBA_RELOAD_FAILED')
            health()
            result.update(status='PASS',scope='PG_TLS_CONFIGURATION_AND_PRIVATE_NETWORK_ONLY',databaseTlsActivated=True,
                          network=network,subnet=subnet,networkOwner=operation,pgTlsDirectory=destination,configRollback='NOT VERIFIED',
                          tlsConnection='NOT VERIFIED',plaintextPacketDenial='NOT VERIFIED',existingLegacyHealthy='PASS')
    except Exception as error:
        result.update(status='NOT VERIFIED',phase=phase,reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
        if mutated:
            try:
                if not post_config_hash or digest(auto)!=post_config_hash:raise RuntimeError('CONFIG_CHANGED_OR_OUTCOME_UNKNOWN')
                shell('test -f '+backup_auto+'; test -f '+backup_hba+'; cp -p '+backup_auto+' '+auto+'; cp -p '+backup_hba+' '+hba)
                if ops.sql(client,'SELECT pg_reload_conf();',ops.TARGET)!='t':raise RuntimeError('ROLLBACK_RELOAD_FAILED')
                result['failureRollback']='RELOAD_ACKNOWLEDGED — SETTINGS NOT YET REVERIFIED'
            except Exception:result['failureRollback']='NOT VERIFIED'
        if network:result.update(retainedNetwork=network,postgresConnected=connected)
    finally:
        client.close();(evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
