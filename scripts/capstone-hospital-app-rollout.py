"""Baseline-pinned A/B app-only promotion; no cloud/PG/PACS changes."""
import argparse
import getpass
import hashlib
import importlib.util
import json
import pathlib
import re
import shlex
import time
from datetime import datetime, timezone
import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("encryption_rollout", ROOT / "scripts/capstone-encryption-rollout.py")
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
base = previous.base

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--image-id", required=True)
    parser.add_argument("--expected-current-id", required=True)
    parser.add_argument("--scan", required=True)
    args=parser.parse_args()
    if not re.fullmatch(r"highpass-platform-mvp:capstone-[a-z0-9-]{1,70}",args.image) or not all(re.fullmatch(r"sha256:[a-f0-9]{64}",value) for value in [args.image_id,args.expected_current_id]):
        raise SystemExit("PUBLIC_IMAGE_ARGUMENT_INVALID")
    scan_path=(ROOT / args.scan).resolve()
    if not scan_path.is_relative_to(ROOT / "artifacts/security/container-scan"):
        raise SystemExit("SCAN_PATH_INVALID")
    stamp=datetime.now(timezone.utc).isoformat().replace(":","-")
    directory=ROOT / "artifacts/workstation" / ("hospital-app-rollout-"+stamp)
    directory.mkdir(parents=True)
    credential=getpass.getpass("VM credential (concealed): ")
    clients,baselines,stages={}, {}, {}
    trust=None
    checks=[]
    phase="LOCAL_IMAGE_SCAN"
    try:
        if base.local(["docker","image","inspect",args.image,"--format","{{.Id}}"] )!=args.image_id:
            raise RuntimeError("CANDIDATE_CHANGED")
        scan=json.loads(scan_path.read_text(encoding="utf8"))
        if scan.get("Metadata",{}).get("ImageID")!=args.image_id or any(v.get("Severity") in ["HIGH","CRITICAL"] for r in scan.get("Results",[]) for v in r.get("Vulnerabilities",[])):
            raise RuntimeError("EXACT_ZERO_HIGH_CRITICAL_SCAN_REQUIRED")
        checks.append({"test":"EXACT_IMAGE_SECURITY_SCAN","status":"PASS"})
        paths=["src/capstone-runtime-diagnostics.js","src/data-plane-gateway.js","src/capstone-b-portal.js","src/capstone-encrypted-transfer.js","scripts/data-plane-gateway.js","scripts/start-capstone-b-portal.js","public/app.js","public/consent-selection.js"]
        expression="import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')]))));"
        hashes=json.loads(base.local(["docker","run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--entrypoint","/nodejs/bin/node",args.image,"--input-type=module","-e",expression]))
        if any(hashes[p]!=hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths):
            raise RuntimeError("IMAGE_SOURCE_CHANGED")
        checks.append({"test":"SCOPED_RUNTIME_SOURCE_ATTESTATION","status":"PASS","sourceHashes":hashes})
        archive=directory / "reviewed-app.tar"
        base.local(["docker","save","-o",str(archive),args.image],seconds=180)
        with archive.open("rb") as stream: archive_hash=hashlib.file_digest(stream,"sha256").hexdigest()
        trust=base.ops.LocalVmTrust()
        for role in ["B","A"]:
            phase="BASELINE_"+role
            address,mac,_=base.ops.ROLES[role]
            public=trust.key(role,credential,directory / (role+"-public-host.key"))
            client=paramiko.SSHClient(); clients[role]=client
            client.get_host_keys().add(address,public.get_name(),public)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address,username="server",password=credential,look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
            def run(command,seconds=20):
                code,output=base.ops.run(client,"sudo -S -p '' timeout "+str(seconds)+"s bash -c "+shlex.quote("set -eu; "+command),credential=credential,seconds=seconds+5)
                if code: raise RuntimeError("REMOTE_OPERATION_FAILED_"+phase+"_"+str(code))
                return output.strip()
            run("test $(cat /sys/class/net/ens33/address) = "+mac+"; systemctl is-active --quiet docker; systemctl is-active --quiet wg-quick@hp-capstone")
            name=previous.CONTAINERS[role][0]
            raw=run("docker inspect "+name+" --format '{{json .Image}} {{json .State}} {{json .Config.Labels}}'")
            image,state,labels=raw.split(" ",2)
            state,labels=json.loads(state),json.loads(labels)
            if json.loads(image)!=args.expected_current_id or not state.get("Running") or state.get("Health",{}).get("Status","healthy")!="healthy":
                raise RuntimeError("CURRENT_RUNTIME_REQUIRES_DIAGNOSIS_"+role)
            baselines[role]={"imageId":json.loads(image),"workingDirectory":labels.get("com.docker.compose.project.working_dir"),"configFiles":labels.get("com.docker.compose.project.config_files")}
            if int(run("df -Pk / | tail -1").split()[3])<4*1024*1024: raise RuntimeError("DISK_CAPACITY_UNAVAILABLE")
            pacs_id=run("docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}}'") if role=="A" else None
            checks.append({"test":role+"_PINNED_RUNTIME_BASELINE","status":"PASS"})
            phase="TRANSFER_"+role
            base.emit({"phase":phase,"status":"RUNNING"})
            stage="/home/server/.highpass-app-"+stamp; stages[role]=stage
            with client.open_sftp() as sftp:
                sftp.get_channel().settimeout(15); sftp.mkdir(stage,mode=0o700)
                began=time.monotonic()
                def deadline(transferred,total):
                    if time.monotonic()-began>300: raise RuntimeError("TRANSFER_DEADLINE")
                sftp.put(str(archive),stage+"/reviewed-app.tar",callback=deadline)
                for source,target in previous.FILES[role]:
                    with sftp.open(stage+"/"+target,"wb") as stream: stream.write((ROOT / source).read_text(encoding="utf8").replace("\r\n","\n").encode())
                    sftp.chmod(stage+"/"+target,0o600)
            if run("sha256sum "+stage+"/reviewed-app.tar").split()[0]!=archive_hash: raise RuntimeError("ARCHIVE_CHANGED")
            run("docker load -i "+stage+"/reviewed-app.tar",180)
            if run("docker image inspect "+args.image+" --format '{{.Id}}'")!=args.image_id: raise RuntimeError("LOADED_IMAGE_CHANGED")
            env={"HIPASS_APP_IMAGE":args.image,"HIPASS_KEY_RELEASE_VAULT_KEY_ID":previous.KEY_ID,"HIPASS_A_GATEWAY_SECRET_DIR":"/opt/highpass/capstone-a-gateway-secrets","HIPASS_B_PORTAL_SECRET_DIR":"/opt/highpass/capstone-b-portal-secrets"}
            project={"A":"hp-capstone-a-gateway","B":"hp-capstone-b-portal"}[role]
            compose="env "+" ".join(k+"="+shlex.quote(v) for k,v in env.items())+" docker compose --project-directory "+stage+" -p "+project+"".join(" -f "+stage+"/"+target for _,target in previous.FILES[role])
            run(compose+" config --quiet")
            checks.append({"test":role+"_EXACT_TRANSFER_AND_COMPOSE","status":"PASS","archiveSha256":archive_hash})
            phase="PROMOTE_"+role; base.emit({"phase":phase,"status":"RUNNING"})
            run(compose+" up -d --no-deps --force-recreate --pull never "+("gateway" if role=="A" else "portal"),90)
            end=time.monotonic()+90
            while True:
                raw=run("docker inspect "+name+" --format '{{json .Image}} {{json .State}}'")
                image,state=raw.split(" ",1); state=json.loads(state)
                if json.loads(image)==args.image_id and state.get("Running") and state.get("Health",{}).get("Status","healthy")=="healthy": break
                if time.monotonic()>end: raise RuntimeError("READINESS_DEADLINE")
                time.sleep(2)
            for marker in ["CAPSTONE_IMAGE_ENCRYPTION_REQUIRED=1","CAPSTONE_RUNTIME_DIAGNOSTICS=1"]:
                if run("docker inspect "+name+" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Fx "+shlex.quote(marker))!=marker: raise RuntimeError("REQUIRED_MODE_NOT_VERIFIED")
            checks.append({"test":role+"_EXACT_IMAGE_HEALTH_REQUIRED_MODES","status":"PASS"})
            if role=="A":
                if run("docker inspect hp-capstone-hospital-a-orthanc-1 --format '{{.Id}}'")!=pacs_id: raise RuntimeError("PACS_CHANGED")
                checks.append({"test":"EXISTING_PACS_CONTAINER_PRESERVED","status":"PASS"})
            else:
                if run("curl --cacert /opt/highpass/capstone-b-portal-secrets/ca.crt --max-time 8 -s -o /dev/null -w '%{http_code}' https://192.168.111.149:9443/api/health",10)!="200": raise RuntimeError("STRICT_TLS_HEALTH_NOT_VERIFIED")
                checks.append({"test":"B_CLOUD_STRICT_TLS_HEALTH","status":"PASS"})
    except Exception as error:
        checks.append({"test":phase,"status":"NOT VERIFIED","reason":str(error) if isinstance(error,RuntimeError) else type(error).__name__})
    finally:
        for client in clients.values(): client.close()
        if trust: trust.close()
        credential=None
    result={"scope":"A_B_APP_ONLY_PROMOTION","review":"DRAFT / UNASSIGNED","imageId":args.image_id,"checks":checks,"stages":stages,"baselines":baselines,"cloudModified":False,"rollbackExecution":"NOT VERIFIED","status":"PASS" if len(checks)==10 and all(r["status"]=="PASS" for r in checks) else "NOT VERIFIED"}
    (directory / "result.json").write_text(json.dumps(result,indent=2),encoding="utf8")
    base.emit({**result,"evidence":str(directory / "result.json")})
    return 0 if result["status"]=="PASS" else 1

if __name__=="__main__": raise SystemExit(main())
