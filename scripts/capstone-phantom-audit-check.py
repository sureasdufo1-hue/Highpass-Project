"""Read-only audit of an exact successful owned synthetic browser receipt."""
import argparse
import json
import os
import pathlib
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parent.parent
def drain_channel(channel, seconds=30):
    """Drain both SSH streams without exposing stderr or waiting indefinitely."""
    deadline=time.monotonic()+seconds
    output=bytearray()
    total=0
    try:
        while time.monotonic()<deadline:
            for ready,receive,retain in (
                (channel.recv_ready,channel.recv,True),
                (channel.recv_stderr_ready,channel.recv_stderr,False),
            ):
                if ready():
                    chunk=receive(65536)
                    total+=len(chunk)
                    if total>1048576:
                        raise ValueError('REMOTE_OUTPUT_LIMIT')
                    if retain: output.extend(chunk)
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                return channel.recv_exit_status(),output.decode('utf8')
            time.sleep(0.02)
        raise TimeoutError('REMOTE_DRAIN_TIMEOUT')
    finally:
        channel.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('receipt', nargs='?')
    parser.add_argument('--negative-snapshot', help='Safe consent/session/jti reference JSON only; never a credential')
    args=parser.parse_args()
    if args.negative_snapshot:
        if args.receipt: raise SystemExit('ONE_AUDIT_MODE_REQUIRED')
        reference={**json.loads(args.negative_snapshot),'snapshotOnly':True}
        receipt=None
    else:
        if not args.receipt: raise SystemExit('OWNED_BROWSER_RECEIPT_REQUIRED')
        receipt=(ROOT/args.receipt).resolve()
        if not receipt.is_relative_to(ROOT/'artifacts/workstation') or receipt.name!='result.json' or not receipt.parent.name.startswith('b-browser-'):
            raise SystemExit('OWNED_BROWSER_RECEIPT_REQUIRED')
        trace=json.loads(receipt.read_text(encoding='utf8'))
        if trace.get('result')!='PASS' or trace.get('phantom',{}).get('result')!='PASS':
            raise SystemExit('SUCCESSFUL_PHANTOM_RECEIPT_REQUIRED')
        reference=trace['phantom']['auditReference']
    client=paramiko.SSHClient()
    try:
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        command="sudo -n timeout 25s docker exec -i hp-capstone-control-control-1 /nodejs/bin/node --input-type=module - "+shlex.quote(json.dumps(reference))
        channel=client.get_transport().open_session(timeout=10)
        channel.settimeout(30)
        channel.exec_command(command)
        program=(ROOT/'scripts/phantom-release-evidence.js').read_bytes()+b'\n'+(ROOT/'scripts/phantom-audit-readonly.js').read_bytes()
        channel.sendall(program)
        channel.shutdown_write()
        # Existing bounded drain reads stdout+stderr concurrently, avoids pipe deadlock.
        code,output=drain_channel(channel,seconds=30)
        result=json.loads(output)
        if code!=0 and result.get('status')=='PASS':
            result={'status':'NOT VERIFIED','reason':'REMOTE_EXIT_MISMATCH'}
    except Exception as error:
        result={'status':'NOT VERIFIED','reason':type(error).__name__}
    finally:client.close()
    if args.negative_snapshot:
        print(json.dumps(result))
        return 0 if result.get('status')=='PASS' else 1
    directory=ROOT/'artifacts/workstation'/('phantom-audit-'+datetime.now(timezone.utc).isoformat().replace(':','-'))
    directory.mkdir(parents=True)
    result.update({'browserReceipt':str(receipt),'review':'DRAFT / UNASSIGNED'})
    evidence=directory/'result.json'
    evidence.write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence)}))
    return 0 if result.get('status')=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
