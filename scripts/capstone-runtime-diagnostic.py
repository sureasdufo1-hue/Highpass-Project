"""Pinned cloud runtime diagnostic. Raw logs are inspected only in memory."""
import json
import argparse
import getpass
import importlib.util
import os
import pathlib
import re
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXPECTED = "sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807"

def bounded(client, command):
    channel = client.get_transport().open_session(timeout=10)
    channel.settimeout(10)
    channel.exec_command(command)
    output = bytearray()
    end = time.monotonic() + 20
    while time.monotonic() < end:
        if channel.recv_ready(): output.extend(channel.recv(32768))
        if channel.recv_stderr_ready(): output.extend(channel.recv_stderr(32768))
        if len(output) > 262144: raise RuntimeError("OUTPUT_LIMIT")
        if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
            return channel.recv_exit_status(), output
        time.sleep(0.1)
    channel.close()
    raise RuntimeError("PROBE_DEADLINE")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--hospital-image-id")
    parser.add_argument("--cloud-image-id", default=EXPECTED)
    args=parser.parse_args()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}",args.cloud_image_id):
        raise SystemExit("CLOUD_IMAGE_ID_INVALID")
    if args.hospital_image_id and not re.fullmatch(r"sha256:[a-f0-9]{64}",args.hospital_image_id):
        raise SystemExit("HOSPITAL_IMAGE_ID_INVALID")
    client = paramiko.SSHClient()
    trust=None
    hospital_clients=[]
    hospital_diagnostics={}
    clock_samples={}
    credential=getpass.getpass("VM credential (concealed): ") if args.hospital_image_id else None
    try:
        identity = pathlib.Path(os.environ["USERPROFILE"]) / ".ssh/highpass-capstone-cloud"
        client.load_host_keys(str(identity / "known_hosts"))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect("138.91.2.60", username="highpassadmin", key_filename=str(identity / "id_ed25519"), look_for_keys=False, allow_agent=False, timeout=10, banner_timeout=10, auth_timeout=10, channel_timeout=15)
        code, output = bounded(client, "sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'")
        if code or output.decode().strip() != args.cloud_image_id + " running healthy": raise RuntimeError("BASELINE_MISMATCH")
        before=time.time()*1000
        code,output=bounded(client,"timeout 5s date +%s%3N")
        after=time.time()*1000
        if code or not output.decode().strip().isdigit(): raise RuntimeError("CLOUD_CLOCK_READ_FAILED")
        clock_samples["C"]={"offsetLowerMs":round(int(output)-after),"offsetUpperMs":round(int(output)-before),"roundtripMs":round(after-before)}
        code, output = bounded(client, "sudo -n timeout 10s docker logs --since 2026-10-08T18:04:50Z --tail 400 hp-capstone-control-control-1")
        if code: raise RuntimeError("LOG_READ_FAILED")
        source = output.decode("utf8", "replace")
        names = ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "AUDIT_CHAIN_LINK_INVALID", "AUDIT_CHAIN_INTEGRITY_REQUIRED", "ACTOR_QUARANTINED", "TOKEN_EXPIRED", "KV_TIMEOUT", "DPOP_STORE_FAILURE_AUDIT_NOT_RECORDED", "ServiceValidationError", "TypeError", "ReferenceError"]
        counts = {name: len(re.findall(r"\b" + name + r"\b", source)) for name in names}
        # SQL error codes and fixed constraint classes only. Never output row
        # contents, detail/context, actor identifiers, URLs or exception text.
        sql_codes = sorted(set(re.findall(r"code: ['\"]([0-9A-Z]{5})['\"]", source)))
        result = {"scope":"READ_ONLY_CLOUD_RUNTIME_DIAGNOSTIC","review":"DRAFT / UNASSIGNED","status":"PASS","healthy":True,"safeErrorCounts":counts,"sqlErrorCodes":sql_codes,"notNullViolation":'null value in column' in source,"constraintViolation":'violates check constraint' in source,"rawLogsStored":False}
        output[:] = b"\0" * len(output)
        source = None
        if args.hospital_image_id:
            spec=importlib.util.spec_from_file_location("vm_ops",ROOT / "scripts/workstation-automatic-ops.py")
            ops=importlib.util.module_from_spec(spec); spec.loader.exec_module(ops)
            trust=ops.LocalVmTrust()
            for role,name in [("A","hp-capstone-a-gateway-gateway-1"),("B","hp-capstone-b-portal-portal-1")]:
                address,mac,_=ops.ROLES[role]
                public=trust.key(role,credential,ROOT / "tmp" / ("diagnostic-"+role+"-public-host.key"))
                hospital=paramiko.SSHClient(); hospital_clients.append(hospital)
                hospital.get_host_keys().add(address,public.get_name(),public)
                hospital.set_missing_host_key_policy(paramiko.RejectPolicy())
                hospital.connect(address,username="server",password=credential,look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
                command="sudo -S -p '' timeout 10s docker inspect "+name+" --format '{{.Image}} {{.State.Status}}'"
                code,output=ops.run(hospital,command,credential=credential,seconds=15)
                if code or output.strip()!=args.hospital_image_id+" running": raise RuntimeError("HOSPITAL_BASELINE_MISMATCH_"+role)
                before=time.time()*1000
                code,output=ops.run(hospital,"timeout 5s date +%s%3N",seconds=10)
                after=time.time()*1000
                if code or not output.strip().isdigit(): raise RuntimeError("HOSPITAL_CLOCK_READ_FAILED_"+role)
                clock_samples[role]={"offsetLowerMs":round(int(output)-after),"offsetUpperMs":round(int(output)-before),"roundtripMs":round(after-before)}
                code,output=ops.run(hospital,"sudo -S -p '' timeout 10s docker logs --tail 1000 "+name+" 2>&1",credential=credential,seconds=15)
                if code: raise RuntimeError("HOSPITAL_LOG_READ_FAILED_"+role)
                events=[]
                for line in output.splitlines():
                    try: event=json.loads(line)
                    except ValueError: continue
                    if event.get("event")!="CAPSTONE_RUNTIME_DIAGNOSTIC": continue
                    fields=["stage","code","httpStatus","elapsedMs"]
                    if all(re.fullmatch(r"[A-Z_]{1,64}",str(event.get(field,""))) for field in fields[:2]) and isinstance(event.get("httpStatus"),int) and isinstance(event.get("elapsedMs"),int):
                        events.append({field:event[field] for field in fields})
                hospital_diagnostics[role]={"status":"PASS","events":events[-20:],"failureEvents":[event for event in events if event["httpStatus"]>=500][-25:],"imageEvents":[event for event in events if event["stage"] in ["IMAGE_DECRYPTION","IMAGE_ENCRYPTION","CONTROL_READY","CONTROL_AUTHORIZATION","UPSTREAM_IMAGE"]][-25:],"rawLogsStored":False}
                output=None
            result["hospitalDiagnostics"]=hospital_diagnostics
        result["clockSamplesRelativeToWindows"]=clock_samples
    except Exception as error:
        result = {"scope":"READ_ONLY_CLOUD_RUNTIME_DIAGNOSTIC","review":"DRAFT / UNASSIGNED","status":"NOT VERIFIED","reason":str(error) if isinstance(error,RuntimeError) else type(error).__name__}
    finally:
        client.close()
        for hospital in hospital_clients: hospital.close()
        if trust: trust.close()
        credential=None
    directory = ROOT / "artifacts/workstation" / ("runtime-diagnostic-" + datetime.now(timezone.utc).isoformat().replace(":","-"))
    directory.mkdir(parents=True)
    (directory / "result.json").write_text(json.dumps(result,indent=2),encoding="utf8")
    print(json.dumps({**result,"evidence":str(directory / "result.json")}),flush=True)
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
