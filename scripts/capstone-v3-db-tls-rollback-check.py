"""Exact-operation config rollback/reapply rehearsal before any v3 listener starts."""
import argparse
import importlib.util
import json
import os
import pathlib
import re
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
DATA='/var/lib/postgresql/data'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--deployment-operation',required=True);args=parser.parse_args()
    op=args.deployment_operation
    if not re.fullmatch('[a-f0-9]{32}',op):raise SystemExit('OPERATION_INVALID')
    evidence=ROOT/'artifacts/azure'/('v3-db-tls-rollback-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+op[:8]);evidence.mkdir(parents=True,exist_ok=False)
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','scope':'EXACT CONFIG ROLLBACK AND REAPPLY ONLY','operation':op,'serviceActivated':False}
    client=paramiko.SSHClient();snapshot=False;restored=False
    auto=DATA+'/postgresql.auto.conf';hba=DATA+'/pg_hba.conf'
    files=[(auto,auto+'.v3-tls-'+op+'.before',auto+'.v3-tls-'+op+'.reapply'),(hba,hba+'.v3-tls-'+op+'.before',hba+'.v3-tls-'+op+'.reapply')]
    def shell(text):return ops.command(client,'sudo -n timeout 15s docker exec '+ops.PG+' sh -c '+shlex.quote('set -eu; '+text))
    def sha(path):return shell('sha256sum '+path).split()[0]
    def health():
        value=ops.command(client,"sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'")
        if value!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
    def observe(expected):
        until=time.monotonic()+5
        while time.monotonic()<until:
            observed=json.loads(ops.sql(client,"SELECT json_build_object('ssl',current_setting('ssl'),'cert',current_setting('ssl_cert_file'),'key',current_setting('ssl_key_file'));",ops.TARGET))
            if observed==expected:return
            time.sleep(0.2)
        raise RuntimeError('SETTINGS_NOT_REVERIFIED')
    try:
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                       allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health()
        initial={'ssl':'on','cert':DATA+'/highpass-v3-tls-'+op+'/server.crt','key':DATA+'/highpass-v3-tls-'+op+'/server.key'}
        observe(initial)
        shell('grep -q '+shlex.quote('# HIGHPASS_V3_TLS_'+op)+' '+hba)
        matches=[]
        for path in (ROOT/'artifacts/azure').glob('v3-db-tls-apply-*/result.json'):
            value=json.loads(path.read_text())
            if value.get('operation')==op and value.get('status')=='PASS' and value.get('databaseTlsActivated') is True:matches.append(value)
        if len(matches)!=1:raise RuntimeError('DEPLOYMENT_EVIDENCE_NOT_SELECTED')
        saved=matches[0]['configBackup']
        original_hashes=[saved['autoSha256'],saved['hbaSha256']]
        for (_,before,_),expected in zip(files,original_hashes):
            if sha(before)!=expected:raise RuntimeError('ORIGINAL_BACKUP_CHANGED')
        snapshot_hashes=[]
        for current,_,after in files:
            shell('test ! -e '+after+'; cp -p '+current+' '+after)
            snapshot_hashes.append(sha(after))
        snapshot=True
        for (current,before,_),expected in zip(files,snapshot_hashes):
            if sha(current)!=expected:raise RuntimeError('CONCURRENT_CONFIG_CHANGE')
            shell('cp -p '+before+' '+current)
        restored=True
        if ops.sql(client,'SELECT pg_reload_conf();',ops.TARGET)!='t':raise RuntimeError('ROLLBACK_RELOAD_FAILED')
        observe({'ssl':'off','cert':'server.crt','key':'server.key'})
        if any(sha(current)!=expected for (current,_,_),expected in zip(files,original_hashes)):raise RuntimeError('ROLLBACK_FILE_CONTENT_MISMATCH')
        health();result['rollback']='PASS'
        for (current,_,after),expected in zip(files,original_hashes):
            if sha(current)!=expected:raise RuntimeError('CONCURRENT_ROLLBACK_CONFIG_CHANGE')
            shell('cp -p '+after+' '+current)
        if ops.sql(client,'SELECT pg_reload_conf();',ops.TARGET)!='t':raise RuntimeError('REAPPLY_RELOAD_FAILED')
        observe(initial)
        if any(sha(current)!=expected for (current,_,_),expected in zip(files,snapshot_hashes)):raise RuntimeError('REAPPLY_FILE_CONTENT_MISMATCH')
        if ops.sql(client,'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;',ops.TARGET)!='0':raise RuntimeError('REAPPLY_HBA_INVALID')
        health();result.update(status='PASS',reapply='PASS',existingLegacyHealthy='PASS',configurationSnapshotsRetained=True,tlsConnectionAfterReapply='NOT VERIFIED')
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__,snapshotTaken=snapshot,restoreAttempted=restored)
        # Never blindly overwrite unknown concurrently changed configuration.
        result['currentTlsState']='NOT VERIFIED — REINSPECT BEFORE RETRY'
    finally:
        client.close();(evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
