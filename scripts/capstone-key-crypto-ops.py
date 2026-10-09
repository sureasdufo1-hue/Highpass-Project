"""Actual hospital-only Key Vault crypto. Moves encrypted fixture, never raw DEK."""
import getpass
import hashlib
import importlib.util
import json
import pathlib
import shlex
import sys
from datetime import datetime, timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("gateway_ops",ROOT/"scripts/capstone-a-gateway-ops.py")
gateway=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
base=gateway.base
def main():
    stamp=datetime.now(timezone.utc).isoformat().replace(":","-")
    directory=ROOT/"artifacts/workstation"/("key-crypto-"+stamp)
    directory.mkdir(parents=True)
    credential=getpass.getpass("VM credential (concealed): ")
    trust=base.ops.LocalVmTrust()
    clients={};stages={};checks=[]
    phase="PINNED_HOST_AND_EXACT_IMAGE"
    try:
        for role in ["A","B"]:
            address,mac,_=base.ops.ROLES[role]
            key=trust.key(role,credential,directory/(role+"-public-host.key"))
            client=paramiko.SSHClient();client.get_host_keys().add(address,key.get_name(),key)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(address,username="server",password=credential,look_for_keys=False,allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
            clients[role]=client
            def run(command,seconds=30):
                code,output=base.ops.run(client,"sudo -S -p '' timeout "+str(seconds)+"s bash -c "+shlex.quote("set -eu; "+command),credential=credential,seconds=seconds+5)
                if code:raise RuntimeError("REMOTE_OPERATION_FAILED_"+phase+"_"+str(code))
                return output.strip()
            run("test $(cat /sys/class/net/ens33/address) = "+mac+"; test -d /opt/highpass/capstone-key-identity")
            image=base.APP if role=="A" else "highpass-platform-mvp:capstone-b-portal-20261009"
            expected=base.APP_ID if role=="A" else "sha256:69cd63bc4966c83e46a609e90e44385a63c68b7941b713690135b445833fb693"
            if run("docker image inspect "+image+" --format '{{.Id}}'")!=expected:raise RuntimeError("RUNTIME_IMAGE_CHANGED_"+role)
            stage="/opt/highpass/key-crypto-"+stamp
            stages[role]=stage
            run("test ! -e "+stage+"; install -d -o 65532 -g 65532 -m 700 "+stage+" "+stage+"/output")
            with gateway.root_sftp(client,credential) as sftp:
                digests={}
                for source,name in [("scripts/capstone-key-crypto-probe.js","probe.mjs"),("src/azure-certificate-credential.js","azure-certificate-credential.mjs"),("src/dicomweb-single-instance.js","dicomweb-single-instance.mjs"),("src/mobile-package-crypto.js","mobile-package-crypto.mjs"),("infra/azure/capstone-key-identities.json","registry.json")]:
                    material=(ROOT/source).read_text(encoding="utf8").replace("\r\n","\n").encode("utf8")
                    digests[name]=hashlib.sha256(material).hexdigest()
                    with sftp.open(stage+"/"+name,"wb") as stream:stream.write(material)
                    sftp.chmod(stage+"/"+name,0o640);sftp.chown(stage+"/"+name,0,65532)
            if role=="B":
                with gateway.root_sftp(clients["A"],credential) as source,gateway.root_sftp(client,credential) as target:
                    with source.open(stages["A"]+"/output/package.json","rb") as stream:payload=stream.read(2097153)
                    if len(payload)>2097152:raise RuntimeError("ENCRYPTED_FIXTURE_TOO_LARGE")
                    fixture=json.loads(payload)
                    if "dek" in fixture or "manifest" in fixture or set(fixture)!={"environment","packageId","wrapped","envelope","chunks","plaintextHash","plaintextBytes"}:raise RuntimeError("FORBIDDEN_EXPORT_FIELD")
                    with target.open(stage+"/output/package.json","wx") as stream:stream.write(payload)
                    target.chmod(stage+"/output/package.json",0o600);target.chown(stage+"/output/package.json",65532,65532)
                    checks.append({"test":"A_B_ENCRYPTED_FIXTURE_TRANSFER_ONLY","status":"PASS","sha256":hashlib.sha256(payload).hexdigest()})
                    payload=None
            phase="ACTUAL_"+role+"_CRYPTO"
            command="docker run --rm --name hp-key-crypto-"+role.lower()+" --read-only --cap-drop ALL --security-opt no-new-privileges --add-host kv-hp-demo-4869edd9.vault.azure.net:10.89.1.4"
            if role=="A":
                command+=" --network hp-capstone-a-gateway_gateway_transport --network hp-capstone-hospital-a_pacs_private"
                for name in ["ca.crt","gateway-client.crt","gateway-client.key"]:command+=" -v /opt/highpass/capstone-a-gateway-secrets/"+name+":/run/pacs/"+name+":ro"
            else:command+=" --network host"
            command+=" -v /opt/highpass/capstone-key-identity:/run/identity:ro -v "+stage+":/probe:ro -v "+stage+"/output:/run/output "+image+" /probe/probe.mjs"
            code,output=base.ops.run(client,"sudo -S -p '' timeout 100s "+command,credential=credential,seconds=105)
            try:result=json.loads(output)
            except ValueError:raise RuntimeError("UNSTRUCTURED_CRYPTO_RESULT_"+role)
            checks.extend(result["checks"])
            checks.append({"test":role+"_ACTUAL_CURRENT_SOURCE_ATTESTATION","status":"PASS" if result.get("sourceDigests")==digests else "FAIL","sourceDigests":result.get("sourceDigests")})
            if result.get("sourceDigests")!=digests:raise RuntimeError("REMOTE_SOURCE_CHANGED_"+role)
            if code or result["status"]!="PASS":raise RuntimeError("ACTUAL_CRYPTO_NOT_VERIFIED_"+role)
    except Exception as error:
        checks.append({"test":phase,"status":"NOT VERIFIED","reason":str(error) if isinstance(error,RuntimeError) else type(error).__name__})
    finally:
        for role,client in clients.items():
            stage=stages.get(role)
            if stage:
                # Only explicit files in this freshly attested owned directory.
                command="rm -f -- "+stage+"/output/package.json "+stage+"/probe.mjs "+stage+"/azure-certificate-credential.mjs "+stage+"/dicomweb-single-instance.mjs "+stage+"/mobile-package-crypto.mjs "+stage+"/registry.json; rmdir -- "+stage+"/output "+stage
                try:
                    code,_=base.ops.run(client,"sudo -S -p '' timeout 10s bash -c "+shlex.quote("set -eu; "+command),credential=credential,seconds=15)
                    checks.append({"test":role+"_OWNED_CIPHERTEXT_STAGE_CLEANUP","status":"PASS" if code==0 else "FAIL"})
                except Exception:checks.append({"test":role+"_OWNED_CIPHERTEXT_STAGE_CLEANUP","status":"NOT VERIFIED"})
            client.close()
        trust.close();credential=None
    result={"scope":"REAL_KEY_VAULT_AND_AES_GCM_PACS_DICOM_OPERATOR_CRYPTO_GATE_ONLY","review":"DRAFT / UNASSIGNED","checks":checks,"status":"PASS" if checks and all(c["status"]=="PASS" for c in checks) else "NOT VERIFIED","liveConsentKeyRelease":"NOT VERIFIED","encryptedViewer":"NOT VERIFIED"}
    (directory/"result.json").write_text(json.dumps(result,indent=2),encoding="utf8")
    base.emit({**result,"evidence":str(directory/"result.json")})
    return 0 if result["status"]=="PASS" else 1
if __name__=="__main__":sys.exit(main())
