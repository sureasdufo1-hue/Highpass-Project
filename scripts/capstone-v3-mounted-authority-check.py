"""Actual mounted mock registry -> nonowner TLS/RLS read-only authority QA."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shlex
import time
import uuid
import subprocess
from datetime import datetime,timezone
import paramiko

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/capstone-v3-cloud-bootstrap.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
PROGRAM="""import {createHmac} from 'node:crypto';
import {createCapstoneMountedAuthority} from './src/v3-capstone-mounted-authority.js';
import {createCapstoneMountedSecretPool,readCapstoneAuthorityMount} from './src/v3-capstone-secret-pool.js';
const authority=createCapstoneMountedAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY'});
const snapshot=readCapstoneAuthorityMount('registry'),material=readCapstoneAuthorityMount('authority-keys');
const pool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hp_v3_app'});
const outcomes=[];
function request(record,overrides={}){
 const claims={iss:snapshot.issuer,aud:snapshot.audience,sub:record.subject,role:record.role,hospitalId:record.authHospitalId,scope:record.scopes.join(' '),exp:Math.floor(Date.now()/1000)+60,...overrides};
 if(record.role==='DOCTOR')claims.doctorId=record.actorId;
 const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=input+'.'+createHmac('sha256',material.testAuth).update(input).digest('base64url');
 return {headers:{authorization:'Bearer '+token}};
}
try{
 for(const record of snapshot.records){
  const binding=authority.registry.resolve(request(record),{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN','SECURITY_ADMIN','DOCTOR']});
  const client=await pool.connect();try{
   await client.query('BEGIN READ ONLY');
   await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[binding.tenantId,binding.hospitalId,binding.actorId]);
   const result=(await client.query("SELECT p.actor_id,p.role,p.scopes FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id WHERE p.actor_id=$1 AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'",[binding.actorId])).rows;
   if(result.length!==1||result[0].role!==binding.role||JSON.stringify(result[0].scopes)!==JSON.stringify(record.scopes))throw Error('DB_AUTHORITY_MISMATCH');
   const isolation=(await client.query('SELECT count(*)::int n FROM highpass_v3.principal_bindings WHERE actor_id<>$1',[binding.actorId])).rows[0];
   if(isolation.n!==0)throw Error('PRINCIPAL_RLS_ISOLATION_FAILED');
   await client.query('ROLLBACK');outcomes.push({subject:record.subject,registeredBinding:'PASS',nonownerTlsRls:'PASS',otherPrincipalVisibility:'DENY'});
  }finally{client.release();}
 }
 const negatives=[
  ['wrong-hospital',snapshot.records[0],{hospitalId:'CAPSTONE-B'},'mapping:read','V3_HOSPITAL_BINDING_MISMATCH'],
  ['requester-cannot-review',snapshot.records[0],{scope:'mapping:read mapping:write mapping:review'},'mapping:review','V3_SCOPE_NOT_ALLOWED'],
  ['expired-mock-token',snapshot.records[0],{exp:Math.floor(Date.now()/1000)-5},'mapping:read','JWT_EXPIRED']
 ];
 for(const [name,record,overrides,requiredScope,expected] of negatives){
  let reason;try{authority.registry.resolve(request(record,overrides),{requiredScope,allowedRoles:['HOSPITAL_ADMIN','SECURITY_ADMIN','DOCTOR']});}catch(error){reason=error.code;}
  if(reason!==expected)throw Error('AUTHORITY_NEGATIVE_NOT_VERIFIED');outcomes.push({name,expected:'DENY',actual:'DENY',code:reason});
 }
 console.log(JSON.stringify({status:'PASS',registrySha256:authority.registrySha256,scope:'SIGNED_SYNTHETIC_AUTH_AND_READ_ONLY_DB_METADATA_ONLY',outcomes,patientConsentIssued:false,mappingReviewed:false}));
}catch(error){console.log(JSON.stringify({status:'NOT VERIFIED',reason:['DB_AUTHORITY_MISMATCH','PRINCIPAL_RLS_ISOLATION_FAILED','AUTHORITY_NEGATIVE_NOT_VERIFIED'].includes(error.message)?error.message:'AUTHORITY_NOT_VERIFIED',safeCode:error.code??null,outcomes}));process.exitCode=1;}
finally{await pool.end();authority.protection.dispose();authority.ingressSecret.fill(0);authority.idempotencyKey.fill(0);}"""


def source_files(readiness=False,runtime=False,mapping=False,session=False):
    pending=['v3-capstone-mounted-authority.js']+(['v3-identity-readiness.js'] if readiness else [])+(['v3-capstone-mounted-service.js','v3-identity-capstone-proxy.js','ingress.js'] if runtime else [])+(['v3-patient-ref-service.js'] if mapping else []);files={}
    if session:pending+=['v3-exchange-session-service.js','v3-exchange-read-service.js']
    while pending:
        name=pending.pop()
        if name in files:continue
        if not re.fullmatch('[a-z0-9-]+[.]js',name):raise RuntimeError('SOURCE_PATH_INVALID')
        body=(ROOT/'src'/name).read_bytes()
        if len(body)>100000 or len(files)>=40:raise RuntimeError('SOURCE_BOUND_EXCEEDED')
        files[name]=body
        pending.extend(re.findall(r"from\s+['\"]\./([a-z0-9-]+[.]js)['\"]",body.decode()))
    return files


def qa_program(readiness=False):
    if not readiness:return PROGRAM
    program=PROGRAM.replace("const outcomes=[];", """const outcomes=[];
const readinessResults=[];
const publisherPool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hp_v3_identity_preauth_writer'});
const readerPool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hp_v3_identity_preauth_reader'});
const readiness=new V3IdentityReadiness({mode:'CAPSTONE_SYNTHETIC_ONLY',clinicalPool:pool,publisherPool,readerPool,deadlineMs:3000});""")
    program="import {V3IdentityReadiness} from './src/v3-identity-readiness.js';\n"+program
    program=program.replace(" const negatives=[", """ for(const record of snapshot.records){
  const binding=authority.registry.resolve(request(record),{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN','SECURITY_ADMIN','DOCTOR']});
  const result=await readiness.check(binding);readinessResults.push({subject:record.subject,...result});
  if(result.status!=='PASS')throw Error('READINESS_NOT_VERIFIED');
 }
 const forged=await readiness.check({...authority.registry.resolve(request(snapshot.records[0]),{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']})});
 if(forged.status!=='FAIL'||forged.reason!=='VERIFIED_MAPPING_BINDING_REQUIRED')throw Error('READINESS_NEGATIVE_NOT_VERIFIED');
 readinessResults.push({name:'cloned-binding',expected:'DENY',actual:'DENY',reason:forged.reason});
 const negatives=[""")
    program=program.replace("scope:'SIGNED_SYNTHETIC_AUTH_AND_READ_ONLY_DB_METADATA_ONLY',outcomes", "scope:'THREE_ROLE_READ_ONLY_READINESS_NOT_RUNTIME_ACTIVATION',readinessResults,outcomes")
    program=program.replace("'AUTHORITY_NEGATIVE_NOT_VERIFIED'].includes", "'AUTHORITY_NEGATIVE_NOT_VERIFIED','READINESS_NOT_VERIFIED','READINESS_NEGATIVE_NOT_VERIFIED'].includes")
    program=program.replace("safeCode:error.code??null,outcomes", "safeCode:error.code??null,readinessResults,outcomes")
    program=program.replace("finally{await pool.end();", "finally{readiness.dispose();await Promise.all([publisherPool.end(),readerPool.end()]);await pool.end();")
    return program


def validate_registration_receipt(value):
    fields={'schemaVersion','scope','dataset','tenantId','hospitalId','registeredBy','patientRefId','mappingId','registrationState','initialVersion','qualifier'}
    if not isinstance(value,dict) or set(value)!=fields:raise RuntimeError('REGISTRATION_RECEIPT_INVALID')
    fixed={'schemaVersion':1,'scope':'CAPSTONE_SYNTHETIC_ONLY','dataset':'SYNTHETIC_PHANTOM_24_SLICE_V1',
           'tenantId':'a1000000-1000-4000-8000-000000000001','hospitalId':'a2000000-1000-4000-8000-000000000001',
           'registeredBy':'a3000000-1000-4000-8000-000000000001','registrationState':'UNVERIFIED_AT_REGISTRATION','initialVersion':1,
           'qualifier':'POINTER_ONLY_NOT_HUMAN_REVIEW_PATIENT_CONSENT_OR_AUTHORIZATION'}
    if any(type(value[key]) is not type(expected) or value[key]!=expected for key,expected in fixed.items()):raise RuntimeError('REGISTRATION_RECEIPT_INVALID')
    for key in ('patientRefId','mappingId'):
        if not isinstance(value[key],str) or not re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value[key]):raise RuntimeError('REGISTRATION_RECEIPT_INVALID')
    if value['patientRefId']==value['mappingId']:raise RuntimeError('REGISTRATION_RECEIPT_INVALID')
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


def store_registration_receipt(client,authority,value):
    data=validate_registration_receipt(value)
    target=authority+'/synthetic-a-phantom-registration.json'
    ops.root_shell(client,'test "$(stat -c %u:%g:%a '+authority+')" = 0:0:700')
    state=ops.root_shell(client,'if test -e '+target+' || test -L '+target+'; then test -f '+target+'; test ! -L '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1; test "$(stat -c %s '+target+')" -le 4096; cat '+target+'; fi')
    if state:
        if validate_registration_receipt(json.loads(state))!=data:raise RuntimeError('REGISTRATION_RECEIPT_REPLACEMENT_REFUSED')
        disposition='EXISTING_EXACT_RECEIPT_PRESERVED'
    else:
        shell='set -eu; umask 077; set -C; cat > '+target+'; chmod 600 '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1'
        ops.command(client,'sudo -n timeout 10s sh -c '+shlex.quote(shell),data)
        disposition='NEW_ROOT_ONLY_RECEIPT'
    digest=hashlib.sha256(data).hexdigest()
    if ops.root_shell(client,'sha256sum '+target).split()[0]!=digest:raise RuntimeError('REGISTRATION_RECEIPT_HASH_MISMATCH')
    return {'status':'PASS','remoteFile':target,'sha256':digest,'disposition':disposition,'identifiersExported':False,
            'qualifier':'POINTER_ONLY_NOT_HUMAN_REVIEW_PATIENT_CONSENT_OR_AUTHORIZATION'}


def load_metadata_candidate(dataset):
    completed=subprocess.run(['node',str(ROOT/'scripts/capstone-phantom-metadata-candidate.js'),dataset],cwd=ROOT,capture_output=True,timeout=10)
    if completed.returncode or len(completed.stdout)>16384:raise RuntimeError('METADATA_CANDIDATE_NOT_VERIFIED')
    value=json.loads(completed.stdout)
    if value.get('clinicalAuthorization') is not False or value.get('reviewStatus')!='PENDING_HUMAN_REVIEW' or value.get('instanceCount')!=24:
        raise RuntimeError('METADATA_CANDIDATE_NOT_VERIFIED')
    return value


def load_session_selection(dataset):
    # Explicit demo choices, not a default full-Study request or clinical approval.
    root='1.2.826.0.1.3680043.10.5432.20261009'
    choices=[{'studyInstanceUid':root+'.'+str(n),'seriesInstanceUids':[root+'.'+str(n)+'.1']} for n in (1,2)]
    completed=subprocess.run(['node',str(ROOT/'scripts/capstone-phantom-metadata-candidate.js'),dataset,
                              '--session-resources',json.dumps(choices)],cwd=ROOT,capture_output=True,timeout=10)
    if completed.returncode or len(completed.stdout)>4096:raise RuntimeError('SESSION_SELECTION_NOT_VERIFIED')
    value=json.loads(completed.stdout)
    if value.get('resources')!=choices or value.get('clinicalAuthorization') is not False or not re.fullmatch('[a-f0-9]{64}',value.get('manifestSha256','')):
        raise RuntimeError('SESSION_SELECTION_NOT_VERIFIED')
    return value


def validate_session_receipt(value):
    keys={'schemaVersion','scope','sessionId','idempotencyKey','command','manifestSha256','qualifier'}
    if isinstance(value,dict) and value.get('schemaVersion')==2:keys.add('auditSessionId')
    if not isinstance(value,dict) or set(value)!=keys or type(value['schemaVersion']) is not int or value['schemaVersion'] not in (1,2):
        raise RuntimeError('SESSION_RECEIPT_INVALID')
    if value['scope']!='CAPSTONE_SYNTHETIC_ONLY' or value['qualifier']!='REQUESTED_INTENTION_NOT_CONSENT_GRANT_OR_CLINICAL_ACCESS':raise RuntimeError('SESSION_RECEIPT_INVALID')
    for key in ('sessionId','idempotencyKey')+ (('auditSessionId',) if value['schemaVersion']==2 else ()):
        if not isinstance(value[key],str) or not re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value[key]):raise RuntimeError('SESSION_RECEIPT_INVALID')
    if not isinstance(value['manifestSha256'],str) or not re.fullmatch('[a-f0-9]{64}',value['manifestSha256']):raise RuntimeError('SESSION_RECEIPT_INVALID')
    command=value['command']
    fields={'patientRefId','ownerTenantId','sourceHospitalId','targetHospitalId','requesterId','purpose','initiationType','validUntil','resources','requestedActions'}
    fixed={'ownerTenantId':'a1000000-1000-4000-8000-000000000001','sourceHospitalId':'a2000000-1000-4000-8000-000000000001',
           'targetHospitalId':'b2000000-1000-4000-8000-000000000001','requesterId':'a3000000-1000-4000-8000-000000000001',
           'purpose':'TREATMENT','initiationType':'PROVIDER_INITIATED','requestedActions':['study:view','study:pacs-transfer']}
    if not isinstance(command,dict) or set(command)!=fields or any(command[key]!=expected for key,expected in fixed.items()):raise RuntimeError('SESSION_RECEIPT_INVALID')
    if not isinstance(command['patientRefId'],str) or not re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',command['patientRefId']):raise RuntimeError('SESSION_RECEIPT_INVALID')
    if not isinstance(command['validUntil'],str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z',command['validUntil']):raise RuntimeError('SESSION_RECEIPT_INVALID')
    datetime.fromisoformat(command['validUntil'].replace('Z','+00:00'))
    root='1.2.826.0.1.3680043.10.5432.20261009'
    if command['resources']!=[{'studyInstanceUid':root+'.'+str(n),'seriesInstanceUids':[root+'.'+str(n)+'.1']} for n in (1,2)]:raise RuntimeError('SESSION_RECEIPT_INVALID')
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


def verify_session_audit(client,value,resumed=False):
    validate_session_receipt(value)
    if value['schemaVersion']!=2:raise RuntimeError('SESSION_AUDIT_RECEIPT_REQUIRED')
    # IDs are validated UUIDs; only aggregate policy-event counts leave the DB.
    session=value['sessionId'];audit=value['auditSessionId'];actor=value['command']['requesterId']
    sql="""BEGIN READ ONLY;SELECT json_build_object(
      'originCreated',(SELECT count(*) FROM highpass_v3.exchange_audit_outbox WHERE event_id='%s' AND session_id='%s' AND actor_id='%s' AND action='SESSION_CREATED' AND reason_code='SESSION_REQUESTED'),
      'currentCreated',count(*) FILTER(WHERE action='SESSION_CREATED' AND reason_code='SESSION_REQUESTED'),
      'currentRead',count(*) FILTER(WHERE action='SESSION_READ' AND reason_code='METADATA_READ'),
      'currentConflict',count(*) FILTER(WHERE action='SESSION_DENIED' AND reason_code='IDEMPOTENCY_CONFLICT'),
      'currentRefDenied',count(*) FILTER(WHERE action='SESSION_DENIED' AND reason_code='SOURCE_REF_UNAVAILABLE'),
      'currentTotal',count(*)) FROM highpass_v3.exchange_audit_outbox WHERE audit_session_id='%s' AND actor_id='%s';ROLLBACK;"""%(session,session,actor,audit,actor)
    counts=json.loads(ops.sql(client,sql,ops.TARGET))
    # A successful original-receipt retry now records METADATA_READ. Resume has
    # two such reads, fresh creation one; both also perform one explicit GET.
    expected={'originCreated':1,'currentCreated':0 if resumed else 1,'currentRead':3 if resumed else 2,'currentConflict':1,'currentRefDenied':1,'currentTotal':5}
    if counts!=expected or any(type(value) is not int for value in counts.values()):raise RuntimeError('SESSION_OPERATOR_AUDIT_NOT_VERIFIED')
    return {'status':'PASS','counts':counts,'qualifier':'PINNED_OPERATOR_AGGREGATE_CHECK_NOT_REQUESTER_AUDIT_AUTHORITY_OR_HTTP_NETWORK_AUDIT'}


def store_session_receipt(client,authority,operation,value):
    if not re.fullmatch('[a-f0-9]{32}',operation):raise RuntimeError('SESSION_OPERATION_INVALID')
    data=validate_session_receipt(value)
    if len(data)>8192:raise RuntimeError('SESSION_RECEIPT_INVALID')
    target=authority+'/synthetic-a-session-'+operation+'.json'
    ops.root_shell(client,'test "$(stat -c %u:%g:%a '+authority+')" = 0:0:700; test ! -e '+target+'; test ! -L '+target)
    shell='set -eu; umask 077; set -C; cat > '+target+'; chmod 600 '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1'
    ops.command(client,'sudo -n timeout 10s sh -c '+shlex.quote(shell),data)
    digest=hashlib.sha256(data).hexdigest()
    if ops.root_shell(client,'sha256sum '+target).split()[0]!=digest:raise RuntimeError('SESSION_RECEIPT_HASH_MISMATCH')
    return {'status':'PASS','remoteFile':target,'sha256':digest,'opaqueIdentifiersExported':False,
            'qualifier':'REQUESTED_INTENTION_NOT_CONSENT_GRANT_OR_CLINICAL_ACCESS'}


def store_metadata_review_packet(client,authority,registration,candidate):
    pointer=validate_registration_receipt(registration)
    # Even internal callers must not turn review input into an approval receipt.
    expected={'schemaVersion':1,'scope':'CAPSTONE_SYNTHETIC_ONLY','dataset':'SYNTHETIC_PHANTOM_24_SLICE_V1',
              'instanceCount':24,'clinicalUseAllowed':False,'clinicalAuthorization':False,
              'reviewStatus':'PENDING_HUMAN_REVIEW','sourceFreshness':'LOCAL_FILES_VERIFIED_LIVE_A_NOT_REVERIFIED',
              'qualifier':'METADATA_CANDIDATE_ONLY_NOT_IDENTITY_VERIFICATION_CONSENT_OR_CLINICAL_ACCESS'}
    if not isinstance(candidate,dict) or any(type(candidate.get(key)) is not type(value) or candidate.get(key)!=value for key,value in expected.items()):
        raise RuntimeError('METADATA_CANDIDATE_NOT_VERIFIED')
    packet={'registrationPointerSha256':hashlib.sha256(pointer).hexdigest(),'registration':registration,'candidate':candidate,
            'qualifier':'REVIEW_INPUT_ONLY_NOT_SOURCE_LIVE_VERIFICATION_MAPPING_APPROVAL_CONSENT_OR_ACCESS'}
    data=json.dumps(packet,sort_keys=True,separators=(',',':')).encode()
    if len(data)>16384:raise RuntimeError('METADATA_PACKET_TOO_LARGE')
    target=authority+'/synthetic-a-phantom-metadata-review.json'
    ops.root_shell(client,'test "$(stat -c %u:%g:%a '+authority+')" = 0:0:700')
    existing=ops.root_shell(client,'if test -e '+target+' || test -L '+target+'; then test -f '+target+'; test ! -L '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1; test "$(stat -c %s '+target+')" -le 16384; cat '+target+'; fi')
    if existing:
        if json.dumps(json.loads(existing),sort_keys=True,separators=(',',':')).encode()!=data:raise RuntimeError('METADATA_PACKET_REPLACEMENT_REFUSED')
        disposition='EXISTING_EXACT_PACKET_PRESERVED'
    else:
        shell='set -eu; umask 077; set -C; cat > '+target+'; chmod 600 '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1'
        ops.command(client,'sudo -n timeout 10s sh -c '+shlex.quote(shell),data)
        disposition='NEW_ROOT_ONLY_PACKET'
    digest=hashlib.sha256(data).hexdigest()
    if ops.root_shell(client,'sha256sum '+target).split()[0]!=digest:raise RuntimeError('METADATA_PACKET_HASH_MISMATCH')
    return {'status':'PASS','remoteFile':target,'sha256':digest,'disposition':disposition,'studies':2,'series':2,'instances':24,
            'reviewStatus':'PENDING_HUMAN_REVIEW','liveAReverification':'NOT VERIFIED','clinicalAuthorization':False,'opaqueIdentifiersExported':False}


def main():
    parser=argparse.ArgumentParser()
    for key in ('authority-operation','mount-operation','tls-operation','network-owner'):parser.add_argument('--'+key,required=True)
    phases=parser.add_mutually_exclusive_group()
    phases.add_argument('--readiness',action='store_true',help='Read-only three-pool diagnostic only; no API activation')
    phases.add_argument('--runtime',action='store_true',help='Owned loopback startup/TLS QA only; no persistent deployment')
    parser.add_argument('--api-tls-operation')
    parser.add_argument('--mapping',action='store_true',help='Persist one idempotent synthetic A patient ref and UNVERIFIED mapping through real services')
    parser.add_argument('--metadata-dataset',help='Stage deterministic synthetic metadata as protected review input only')
    parser.add_argument('--session',action='store_true',help='Persist one REQUESTED Session through existing nonowner services; not HTTP/consent/Grant')
    parser.add_argument('--resume-session-operation',help='Reuse the protected Session command/key after later QA failure; never generate a replacement')
    args=parser.parse_args()
    if not all(re.fullmatch('[a-f0-9]{32}',getattr(args,key)) for key in ('authority_operation','mount_operation','tls_operation','network_owner')):raise SystemExit('OPERATION_INVALID')
    if args.runtime and not re.fullmatch('[a-f0-9]{32}',args.api_tls_operation or ''):raise SystemExit('API_TLS_OPERATION_REQUIRED')
    if args.api_tls_operation and not args.runtime:raise SystemExit('API_TLS_REQUIRES_RUNTIME_QA')
    if args.mapping and not args.runtime:raise SystemExit('MAPPING_REQUIRES_RUNTIME_QA')
    if args.metadata_dataset and not args.mapping:raise SystemExit('METADATA_REQUIRES_MAPPING_QA')
    if args.session and not (args.runtime and args.mapping and args.metadata_dataset):raise SystemExit('SESSION_REQUIRES_RUNTIME_MAPPING_AND_METADATA')
    if args.resume_session_operation and (not args.session or not re.fullmatch('[a-f0-9]{32}',args.resume_session_operation)):raise SystemExit('SESSION_RESUME_INVALID')
    operation=uuid.uuid4().hex
    prefix='v3-mounted-runtime-check-' if args.runtime else 'v3-mounted-readiness-check-' if args.readiness else 'v3-mounted-authority-check-'
    evidence=ROOT/'artifacts/azure'/(prefix+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+operation[:8]);evidence.mkdir(parents=True,exist_ok=False)
    stage='/home/highpassadmin/.highpass-v3-authority-check-'+operation;code='/opt/highpass/v3-authority-check-'+operation
    authority='/opt/highpass/v3-runtime-authority-'+args.authority_operation
    secret='/opt/highpass/v3-runtime-mounts-'+args.mount_operation
    ca='/opt/highpass/v3-db-tls-'+args.tls_operation+'/ca.crt'
    network='highpass-v3-db-'+args.network_owner[:12];container='hp-v3-authority-check-'+operation
    result={'status':'NOT VERIFIED','review':'DRAFT / UNASSIGNED','operation':operation,'serviceActivated':False,'activeOwnedContainer':container}
    client=paramiko.SSHClient()
    try:
        candidate=load_metadata_candidate(args.metadata_dataset) if args.metadata_dataset else None
        selection=load_session_selection(args.metadata_dataset) if args.session else None
        files=source_files(args.readiness,args.runtime,args.mapping,args.session);result['sourceHashes']={name:hashlib.sha256(body).hexdigest() for name,body in files.items()}
        result['credentialComposition']='THREE_SEPARATE_ROLE_FILES_ONE_PROCESS' if args.runtime else 'THREE_SEPARATE_ROLE_FILES_READ_ONLY_DIAGNOSTIC' if args.readiness else 'ONE_CLINICAL_ROLE_FILE'
        identity=pathlib.Path(os.environ['USERPROFILE'])/'.ssh/highpass-capstone-cloud'
        client.load_host_keys(str(identity/'known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect('138.91.2.60',username='highpassadmin',key_filename=str(identity/'id_ed25519'),look_for_keys=False,
                       allow_agent=False,timeout=10,banner_timeout=10,auth_timeout=10,channel_timeout=15)
        health="sudo -n timeout 10s docker inspect hp-capstone-control-control-1 --format '{{.Image}} {{.State.Status}} {{.State.Health.Status}}'"
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_HEALTH_NOT_VERIFIED')
        resume=None
        if args.resume_session_operation:
            target=authority+'/synthetic-a-session-'+args.resume_session_operation+'.json'
            value=ops.root_shell(client,'test "$(stat -c %u:%g:%a '+authority+')" = 0:0:700; test -f '+target+'; test ! -L '+target+'; test "$(stat -c %u:%g:%a:%h '+target+')" = 0:0:600:1; test "$(stat -c %s '+target+')" -le 8192; cat '+target)
            resume=json.loads(value);validate_session_receipt(resume)
            if resume['manifestSha256']!=selection['manifestSha256'] or resume['command']['resources']!=selection['resources']:raise RuntimeError('SESSION_RESUME_DATASET_MISMATCH')
        old_checks=[]
        for previous in list((ROOT/'artifacts/azure').glob('v3-mounted-authority-check-*/result.json'))+list((ROOT/'artifacts/azure').glob('v3-mounted-readiness-check-*/result.json'))+list((ROOT/'artifacts/azure').glob('v3-mounted-runtime-check-*/result.json')):
            prior=json.loads(previous.read_text())
            named=prior.get('activeOwnedContainer');oldop=prior.get('operation')
            if named and re.fullmatch('[a-f0-9]{32}',oldop or '') and named=='hp-v3-authority-check-'+oldop:
                absent=ops.command(client,'sudo -n timeout 10s docker container ls -aq --filter '+shlex.quote('name=^/'+named+'$'))==''
                old_checks.append({'operation':oldop,'absent':absent})
                if not absent:raise RuntimeError('PRIOR_QA_CONTAINER_STILL_PRESENT')
        result['previousQaContainerAbsence']=old_checks
        owner=ops.command(client,'sudo -n timeout 10s docker network inspect '+network+" --format '{{index .Labels \"highpass.capstone.v3-db\"}} {{.Internal}}'")
        if owner!=args.network_owner+' true':raise RuntimeError('NETWORK_NOT_OWNED')
        deadline=time.monotonic()+20
        with client.open_sftp() as sftp:
            sftp.get_channel().settimeout(10);sftp.mkdir(stage,mode=0o700)
            for name,body in files.items():
                if time.monotonic()>deadline:raise RuntimeError('SOURCE_UPLOAD_DEADLINE')
                with sftp.open(stage+'/'+name,'wb') as stream:stream.write(body)
        install='test ! -e '+code+'; install -d -o root -g root -m 700 '+code+'; '+'; '.join('install -o root -g root -m 644 '+stage+'/'+name+' '+code+'/'+name for name in files)
        ops.root_shell(client,install)
        command=['sudo','-n','timeout','35s' if args.readiness or args.runtime else '25s','docker','run','--rm','--name',container,'--label','highpass.validation.authority='+operation,
                 '--network',network,'--read-only','--user','65532:65532','--cap-drop','ALL','--security-opt','no-new-privileges']
        mounts=[(secret+'/highpass-v3-hp_v3_app.json','/run/secrets/highpass-v3-hp_v3_app.json'),(ca,'/run/secrets/highpass-v3-db-ca.crt')]
        if args.readiness or args.runtime:
            mounts += [(secret+'/highpass-v3-'+role+'.json','/run/secrets/highpass-v3-'+role+'.json') for role in ('hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader')]
        mounts += [(authority+'/highpass-v3-'+name+'.json','/run/secrets/highpass-v3-'+name+'.json') for name in ('registry','authority-keys')]
        if args.runtime:
            api_tls='/opt/highpass/v3-identity-tls-'+args.api_tls_operation
            mounts += [(api_tls+'/'+name,'/run/secrets/highpass-v3-'+name) for name in ('api-server.key','api-server.crt','api-ca.crt','proxy-client.key','proxy-client.crt')]
        mounts += [(code+'/'+name,'/app/src/'+name) for name in files]
        for source,destination in mounts:command+=['--mount','type=bind,src='+source+',dst='+destination+',readonly']
        if args.runtime:
            runtime_spec=importlib.util.spec_from_file_location('runtime_qa',ROOT/'scripts/capstone-v3-runtime-qa-program.py')
            runtime_qa=importlib.util.module_from_spec(runtime_spec);runtime_spec.loader.exec_module(runtime_qa)
            program=runtime_qa.session_program(selection,resume) if args.session else runtime_qa.mapping_program() if args.mapping else runtime_qa.PROGRAM
        else:program=qa_program(args.readiness)
        command += [ops.EXPECTED,'--input-type=module','-e',program]
        # The program only emits allowlisted safe JSON. Keep it on a nonzero exit
        # instead of losing diagnostic classifications to the SSH wrapper.
        wrapped=shlex.join(command)+' 2>/dev/null; status=$?; printf "\\nHP_QA_EXIT=%s\\n" "$status"'
        output=ops.command(client,'sh -c '+shlex.quote(wrapped))
        lines=output.splitlines();record=next((line for line in lines if line.startswith('{')),None)
        if record is None:raise RuntimeError('SAFE_QA_OUTPUT_MISSING')
        observed=json.loads(record)
        private_registration=observed.pop('_protectedRegistration',None)
        private_session=observed.pop('_protectedSession',None)
        # Retain a proven creation receipt for recovery even if a later QA check fails.
        if private_session is not None:result['protectedSessionReceipt']=store_session_receipt(client,authority,operation,private_session)
        result['qaExitCode']=int(lines[-1].split('=',1)[1]) if lines[-1].startswith('HP_QA_EXIT=') else None
        result.update(observed)
        if result['qaExitCode']!=0:raise RuntimeError('QA_PROCESS_EXIT_NOT_SUCCESSFUL')
        if observed.get('status')!='PASS':raise RuntimeError('ACTUAL_AUTHORITY_QA_NOT_VERIFIED')
        if args.session:result['sourceSessionAudit']=verify_session_audit(client,private_session,bool(args.resume_session_operation))
        if args.mapping:result['protectedRegistrationReceipt']=store_registration_receipt(client,authority,private_registration)
        if candidate:result['protectedMetadataReviewPacket']=store_metadata_review_packet(client,authority,private_registration,candidate)
        if ops.command(client,'sudo -n timeout 10s docker container ls -aq --filter '+shlex.quote('name=^/'+container+'$')):raise RuntimeError('OWNED_CONTAINER_ABSENCE_NOT_VERIFIED')
        result.pop('activeOwnedContainer',None)
        if ops.command(client,health)!=ops.EXPECTED+' running healthy':raise RuntimeError('LEGACY_AFTER_HEALTH_NOT_VERIFIED')
        result.update(ownedContainerRemoved=True,existingLegacyHealthy='PASS',sourceStageRetained=code)
    except Exception as error:
        result.update(status='NOT VERIFIED',reason=str(error) if isinstance(error,RuntimeError) else type(error).__name__)
    finally:
        if client.get_transport() and client.get_transport().is_active():
            try:
                absent=ops.command(client,'sudo -n timeout 10s docker container ls -aq --filter '+shlex.quote('name=^/'+container+'$'))==''
                result['ownedContainerRemoved']=absent
                if absent:result.pop('activeOwnedContainer',None)
                else:result['status']='NOT VERIFIED'
            except Exception:result['ownedContainerRemoved']='NOT VERIFIED';result['status']='NOT VERIFIED'
        client.close();(evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({**result,'evidence':str(evidence/'result.json')}))
    return 0 if result['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
