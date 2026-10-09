"""Embedded finite Node startup/transport QA. Tokens/key bytes never emitted."""
import json
PROGRAM="""import {request,createServer} from 'node:https';
import {randomBytes,randomUUID,createHmac,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {startCapstoneMountedIdentityService} from './src/v3-capstone-mounted-service.js';
import {readCapstoneAuthorityMount,createCapstoneMountedSecretPool} from './src/v3-capstone-secret-pool.js';
import {createV3IdentityCapstoneProxy} from './src/v3-identity-capstone-proxy.js';
import {signIngress} from './src/ingress.js';
const read=name=>readFileSync('/run/secrets/highpass-v3-'+name);
const ca=read('api-ca.crt'),cert=read('proxy-client.crt'),key=read('proxy-client.key');
let service,frontend,proxy,readerPool,clinicalPool;const outcomes=[];let failure=false,proxyVerified=false,auditVerified=false,pairedVerified=false;
const random=randomBytes(2),auditIp='127.77.'+random[0]+'.'+(random[1]||1);let auditIds=[];
async function auditRows(){
 const client=await readerPool.connect();let released=false;try{
  await client.query('BEGIN READ ONLY');
  const rows=(await client.query("SELECT event_id FROM highpass_v3.preauth_security_events WHERE source_ip=$1::inet AND stage='INGRESS' AND reason_code='INGRESS_REJECTED' AND result='DENY' AND source_kind='IMMEDIATE_SOCKET' AND scope='CAPSTONE_SYNTHETIC_ONLY'",[auditIp])).rows;
  await client.query('ROLLBACK');return rows.map(row=>row.event_id);
 }catch{released=true;client.release(true);throw Error('QA_AUDIT_READ_FAILED');}finally{if(!released)client.release();}
}
function probe({credentials=true,signed=true,servername='localhost',frontendRequest=false,localAddress,extraHeaders={},method='GET',body,customPath}={}){
 const address=frontendRequest?frontend.address():service.address(),path=customPath??(frontendRequest?'/api/v3/patient-mappings/10000000-1000-4000-8000-000000000001':'/api/v3/runtime-transport-probe'),headers={...extraHeaders};
 const payload=body===undefined?undefined:Buffer.from(JSON.stringify(body));if(payload)headers['content-length']=String(payload.length);
 if(signed){const material=readCapstoneAuthorityMount('authority-keys');const ingress=signIngress({method,url:path,headers},'127.0.0.1',Buffer.from(material.ingress,'hex'));
  Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':ingress.timestamp,'x-hipass-ingress-signature':ingress.signature});}
 return new Promise((resolve,reject)=>{
  let timer;const req=request({hostname:'127.0.0.1',servername,port:address.port,path,method,headers,ca,localAddress,
   ...(credentials?{cert,key}:{}),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false},res=>{
    let body='';res.on('data',chunk=>{body+=chunk;if(body.length>8192)req.destroy(Error('QA_RESPONSE_BOUND'));});
    res.on('error',reject);res.on('end',()=>{clearTimeout(timer);try{const data=JSON.parse(body);resolve({status:res.statusCode,code:data.code,data});}catch{reject(Error('QA_RESPONSE_INVALID'));}});
   });
  req.on('error',error=>{clearTimeout(timer);reject(error);});timer=setTimeout(()=>req.destroy(Error('QA_REQUEST_DEADLINE')),2500);req.end(payload);
 });
}
try{
 service=await startCapstoneMountedIdentityService({mode:'CAPSTONE_SYNTHETIC_ONLY',port:19445});
 if(service.address()?.host!=='127.0.0.1'||service.summary.readiness.status!=='PASS')throw Error('QA_STARTUP_INVALID');
 outcomes.push({name:'actual-three-pool-startup',result:'PASS',readiness:service.summary.readiness});
 readerPool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hp_v3_identity_preauth_reader'});
 const before=new Set(await auditRows());
 const positive=await probe();
 if(positive.status!==404||positive.code!=='V3_ROUTE_NOT_FOUND')throw Error('QA_TRANSPORT_ADMISSION_INVALID');
 outcomes.push({name:'trusted-proxy-cert-and-signed-ingress',transport:'ALLOW',route:'UNKNOWN_ROUTE_404_NOT_CLINICAL_SUCCESS'});
 const unsigned=await probe({signed:false,localAddress:auditIp});
 if(unsigned.status!==403||unsigned.code!=='V3_IDENTITY_EDGE_DENIED')throw Error('QA_UNSIGNED_INGRESS_NOT_DENIED');
 outcomes.push({name:'missing-ingress-signature',result:'DENY',status:403});
 let noClient;try{await probe({credentials:false});}catch(error){noClient=error.code;}
 if(!['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE','ERR_SSL_TLSV1_ALERT_CERTIFICATE_REQUIRED'].includes(noClient))throw Error('QA_NO_CLIENT_NOT_VERIFIED');
 outcomes.push({name:'no-client-certificate',result:'DENY',code:noClient});
 let wrongHost;try{await probe({servername:'wrong-api.invalid'});}catch(error){wrongHost=error.code;}
 if(wrongHost!=='ERR_TLS_CERT_ALTNAME_INVALID')throw Error('QA_WRONG_HOSTNAME_NOT_VERIFIED');
 outcomes.push({name:'wrong-server-hostname',result:'DENY',code:wrongHost});
 const material=readCapstoneAuthorityMount('authority-keys'),ingress=Buffer.from(material.ingress,'hex');
 proxy=createV3IdentityCapstoneProxy({mode:'CAPSTONE_SYNTHETIC_ONLY',port:service.address().port,ca,cert,key,ingressSecret:ingress,deadlineMs:2500});ingress.fill(0);
 const apiKey=read('api-server.key'),apiCert=read('api-server.crt');
 frontend=createServer({key:apiKey,cert:apiCert,minVersion:'TLSv1.2'},(incoming,outgoing)=>proxy.handle(incoming,outgoing));apiKey.fill(0);apiCert.fill(0);
 frontend.requestTimeout=4000;frontend.headersTimeout=3000;frontend.setTimeout(4000,socket=>socket.destroy());
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('QA_FRONTEND_BIND_DEADLINE')),2000);frontend.once('error',()=>{clearTimeout(timer);reject(Error('QA_FRONTEND_BIND_FAILED'));});frontend.listen(0,'127.0.0.1',()=>{clearTimeout(timer);resolve();});});
 const proxied=await probe({frontendRequest:true,signed:false,credentials:false});
 if(proxied.status!==401)throw Error('QA_PROXY_AUTH_DENIAL_NOT_VERIFIED');
 proxyVerified=true;outcomes.push({name:'actual-https-frontend-to-mtls-backend',result:'PASS',humanAuth:'DENY',status:401,qualifier:'NO_TOKEN_DENIAL_NOT_CLINICAL_SUCCESS'});
 const snapshot=readCapstoneAuthorityMount('registry'),actor=snapshot.records[0],traceId=randomUUID(),auditSessionId=randomUUID();
 const claims={iss:snapshot.issuer,aud:snapshot.audience,sub:actor.subject,role:actor.role,hospitalId:actor.authHospitalId,scope:'mapping:read',exp:Math.floor(Date.now()/1000)+30};
 const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=input+'.'+createHmac('sha256',material.testAuth).update(input).digest('base64url');
 const missing=await probe({frontendRequest:true,signed:false,credentials:false,extraHeaders:{authorization:'Bearer '+token,'x-trace-id':traceId,'x-audit-session-id':auditSessionId,'x-forwarded-for':'203.0.113.99'}});
 if(missing.status!==404||missing.code!=='V3_MAPPING_NOT_FOUND')throw Error('QA_AUTHENTICATED_MAPPING_DENIAL_NOT_VERIFIED');
 clinicalPool=createCapstoneMountedSecretPool({mode:'CAPSTONE_SYNTHETIC_ONLY',role:'hp_v3_app'});
 const client=await clinicalPool.connect();let released=false;
 try{
  await client.query('BEGIN READ ONLY');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[actor.tenantId,actor.hospitalId,actor.actorId]);
  const row=(await client.query("SELECT e.action,e.result,e.reason_code,host(n.source_ip) source_ip,n.ingress_mode,encode(n.proxy_certificate_sha256,'hex') certificate FROM highpass_v3.identity_audit_outbox e JOIN highpass_v3.identity_network_audit n USING(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id) WHERE e.trace_id=$1 AND e.audit_session_id=$2 AND e.actor_id=$3",[traceId,auditSessionId,actor.actorId])).rows;
  const fingerprint=new X509Certificate(cert).fingerprint256.replaceAll(':','').toLowerCase();
  if(row.length!==1||row[0].action!=='MAPPING_DENIED'||row[0].result!=='DENY'||row[0].reason_code!=='MAPPING_NOT_FOUND'||row[0].source_ip!=='127.0.0.1'||row[0].ingress_mode!=='CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'||row[0].certificate!==fingerprint)throw Error('QA_PAIRED_AUDIT_NOT_VERIFIED');
  await client.query('ROLLBACK');pairedVerified=true;
 }catch(error){released=true;client.release(true);throw error;}finally{if(!released)client.release();}
 outcomes.push({name:'authenticated-proxy-missing-mapping-paired-audit',result:'PASS',status:404,matchedEvents:1,spoofedForwardedIp:'IGNORED',qualifier:'MISSING_RESOURCE_DENIAL_NOT_SUCCESSFUL_MAPPING_OR_CONSENT'});
 const deadline=Date.now()+3500;
 do{auditIds=(await auditRows()).filter(id=>!before.has(id));if(auditIds.length)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
 if(auditIds.length!==1)throw Error('QA_AUDIT_DELIVERY_NOT_VERIFIED');
 await service.stop();
 const afterStop=new Set(await auditRows());if(!auditIds.every(id=>afterStop.has(id)))throw Error('QA_AUDIT_AFTER_STOP_NOT_VERIFIED');
 auditVerified=true;outcomes.push({name:'actual-ingress-denial-audit-stored-after-api-stop',result:'PASS',matchedFreshEvents:1,source:'IMMEDIATE_SOCKET',qualifier:'NOT_DB_CRASH_RECOVERY_OR_WORM_PROOF'});
}catch(error){failure=true;outcomes.push({name:'runtime-qa',result:'NOT VERIFIED',reason:/^QA_[A-Z_]+$/.test(error.message)?error.message:'RUNTIME_NOT_VERIFIED',safeCode:/^(V3_[A-Z_]+|[A-Z0-9]{5})$/.test(error.code??'')?error.code:undefined});}
finally{
 proxy?.dispose();if(frontend){frontend.closeAllConnections();await new Promise(resolve=>frontend.close(resolve));}
 try{await service?.stop();outcomes.push({name:'owned-runtime-stop',result:service?'PASS':'NOT VERIFIED'});}catch{failure=true;outcomes.push({name:'owned-runtime-stop',result:'NOT VERIFIED'});}
 key.fill(0);cert.fill(0);ca.fill(0);
 await readerPool?.end();
 await clinicalPool?.end();
}
console.log(JSON.stringify({status:failure?'NOT VERIFIED':'PASS',scope:'OWNED_LOOPBACK_RUNTIME_START_STOP_AND_TLS_ONLY',outcomes,
 persistentServiceActivated:false,externalPortPublished:false,patientConsentIssued:false,mappingReviewed:false,
 clinicalHttpFlow:'NOT VERIFIED',proxyFrontendHttp:proxyVerified?'PASS':'NOT VERIFIED',preauthAuditDelivery:auditVerified?'PASS':'NOT VERIFIED',pairedIdentityAudit:pairedVerified?'PASS':'NOT VERIFIED'}));
process.exitCode=failure?1:0;
"""


def mapping_program():
    imports="""import {createCapstoneMountedAuthority} from './src/v3-capstone-mounted-authority.js';
import {V3TenantTransaction} from './src/v3-tenant-transaction.js';
import {V3IdentityIdempotency} from './src/v3-identity-idempotency.js';
import {V3PatientRefService} from './src/v3-patient-ref-service.js';
"""
    flow=""" const authority=createCapstoneMountedAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 const internalIdempotency=new V3IdentityIdempotency({transactions:new V3TenantTransaction({pool:clinicalPool,deadlineMs:8000}),hmacKey:authority.idempotencyKey});
 try{
  const writeClaims={...claims,scope:'mapping:read mapping:write',exp:Math.floor(Date.now()/1000)+60};
  const writeInput=[{alg:'HS256'},writeClaims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const writeToken=writeInput+'.'+createHmac('sha256',material.testAuth).update(writeInput).digest('base64url');
  const binding=authority.registry.resolve({headers:{authorization:'Bearer '+writeToken}},{requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
  const registrar=new V3PatientRefService({transactions:new V3TenantTransaction({pool:clinicalPool,deadlineMs:8000}),idempotency:internalIdempotency});
  const ref=await registrar.registerIdempotent(binding,'CAPSTONE-PHANTOM-REF-A-20261009');
  const again=await registrar.registerIdempotent(binding,'CAPSTONE-PHANTOM-REF-A-20261009');
  if(ref.patientRefId!==again.patientRefId)throw Error('QA_PATIENT_REF_RETRY_MISMATCH');
  const context={patientRefId:ref.patientRefId,tenantId:binding.tenantId,hospitalId:binding.hospitalId};
  const body={...context,...authority.protection.protect('HP-TEST-PHANTOM-001',context)},idempotencyKey=randomUUID();
  const headers={authorization:'Bearer '+writeToken,'content-type':'application/json','idempotency-key':idempotencyKey,'x-trace-id':randomUUID(),'x-audit-session-id':randomUUID()};
  const options={frontendRequest:true,signed:false,credentials:false,method:'POST',customPath:'/api/v3/patient-mappings/reconcile',extraHeaders:headers,body};
  const created=await probe(options),retry=await probe(options);
  if(created.status!==201||retry.status!==201||created.data.mappingId!==retry.data.mappingId||created.data.state!=='UNVERIFIED'||created.data.version!==1)throw Error('QA_MAPPING_CREATE_OR_RETRY_NOT_VERIFIED');
  const read=await probe({frontendRequest:true,signed:false,credentials:false,customPath:'/api/v3/patient-mappings/'+created.data.mappingId,extraHeaders:{authorization:'Bearer '+writeToken,'x-trace-id':randomUUID(),'x-audit-session-id':randomUUID()}});
  if(read.status!==200||read.data.mappingId!==created.data.mappingId||read.data.patientRefId!==ref.patientRefId||read.data.state!=='UNVERIFIED')throw Error('QA_MAPPING_READ_NOT_VERIFIED');
  if(JSON.stringify(read.data).includes('HP-TEST-PHANTOM-001')||'protectedLocalRef' in read.data||'localRefDigest' in read.data)throw Error('QA_MAPPING_METADATA_LEAK');
  const other=snapshot.records.find(value=>value.subject==='synthetic-capstone-b-requester');
  const otherClaims={...writeClaims,sub:other.subject,hospitalId:other.authHospitalId};
  const otherInput=[{alg:'HS256'},otherClaims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const otherToken=otherInput+'.'+createHmac('sha256',material.testAuth).update(otherInput).digest('base64url');
  const foreign=await probe({frontendRequest:true,signed:false,credentials:false,customPath:'/api/v3/patient-mappings/'+created.data.mappingId,extraHeaders:{authorization:'Bearer '+otherToken}});
  if(foreign.status!==404||foreign.code!=='V3_MAPPING_NOT_FOUND')throw Error('QA_FOREIGN_MAPPING_NOT_DENIED');
  const review=await probe({...options,customPath:'/api/v3/patient-mappings/'+created.data.mappingId+'/reviews',extraHeaders:{...headers,'idempotency-key':randomUUID()},body:{expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')}});
  if(review.status!==403||review.code!=='V3_SCOPE_NOT_ALLOWED')throw Error('QA_REQUESTER_REVIEW_NOT_DENIED');
  const final=await probe({frontendRequest:true,signed:false,credentials:false,customPath:'/api/v3/patient-mappings/'+created.data.mappingId,extraHeaders:{authorization:'Bearer '+writeToken}});
  if(final.status!==200||final.data.state!=='UNVERIFIED'||final.data.version!==1)throw Error('QA_MAPPING_CHANGED_BY_DENIAL');
  outcomes.push({name:'synthetic-a-patient-ref-and-mapping',result:'PASS',patientRefRetry:'SAME_REFERENCE',reconcile:201,retry:'SAME_MAPPING',read:200,state:'UNVERIFIED',humanReview:'NOT PERFORMED',qualifier:'SYNTHETIC_REGISTRATION_NOT_IDENTITY_MATCH_OR_CONSENT'});
  outcomes.push({name:'mapping-isolation-and-review-scope',result:'PASS',foreignHospital:404,requesterReview:403,stateAfterDenial:'UNVERIFIED',metadataSecretLeak:'NONE'});
  protectedRegistration={schemaVersion:1,scope:'CAPSTONE_SYNTHETIC_ONLY',dataset:'SYNTHETIC_PHANTOM_24_SLICE_V1',tenantId:binding.tenantId,hospitalId:binding.hospitalId,
   registeredBy:binding.actorId,patientRefId:ref.patientRefId,mappingId:created.data.mappingId,registrationState:'UNVERIFIED_AT_REGISTRATION',initialVersion:1,
   qualifier:'POINTER_ONLY_NOT_HUMAN_REVIEW_PATIENT_CONSENT_OR_AUTHORIZATION'};
 }finally{internalIdempotency.dispose();authority.protection.dispose();authority.ingressSecret.fill(0);authority.idempotencyKey.fill(0);}
"""
    return imports+PROGRAM.replace("let service,frontend,proxy,readerPool,clinicalPool;","let protectedRegistration;let service,frontend,proxy,readerPool,clinicalPool;").replace(" const deadline=Date.now()+3500;",flow+" const deadline=Date.now()+3500;").replace("scope:'OWNED_LOOPBACK_RUNTIME_START_STOP_AND_TLS_ONLY'","scope:'SYNTHETIC_A_REGISTRATION_AND_MAPPING_HTTP_QA'").replace("clinicalHttpFlow:'NOT VERIFIED'","_protectedRegistration:failure?undefined:protectedRegistration,syntheticPatientRefMappingPersisted:true,patientRefRegistration:'INTERNAL_NONOWNER_BOOTSTRAP_NOT_HTTP',mappingHttp:'PASS',clinicalHttpFlow:'NOT VERIFIED'")


def session_program(selection,resume=None):
    program=mapping_program()
    imports="""import {V3ExchangeSessionService} from './src/v3-exchange-session-service.js';
import {V3ExchangeReadService} from './src/v3-exchange-read-service.js';
"""
    flow="""
  const sessionClaims={...writeClaims,scope:'mapping:read mapping:write exchange:create exchange:read'};
  const signedRequest=override=>{
   const input=[{alg:'HS256'},{...sessionClaims,...override}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
   return {headers:{authorization:'Bearer '+input+'.'+createHmac('sha256',material.testAuth).update(input).digest('base64url')}};
  };
  const source=authority.registry.resolve(signedRequest({}),{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
  // Operator-only safe PG classification; never emit query text/parameters/raw errors.
  const diagnosedClients=new WeakSet(),connect=clinicalPool.connect.bind(clinicalPool);
  clinicalPool.connect=async()=>{
   const client=await connect();if(!diagnosedClients.has(client)){
    diagnosedClients.add(client);const query=client.query.bind(client);
    client.query=async(...args)=>{try{return await query(...args);}catch(error){
     const predicate=/permission denied for function ([a-z_]+)/.exec(error.message??'');
     const table=/permission denied for table ([a-z_]+)/.exec(error.message??'');
     outcomes.push({name:'session-safe-db-diagnostic',result:'NOT VERIFIED',sqlState:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:undefined,
      predicate:predicate?.[1],table:table?.[1]});throw error;
    }};
   }return client;
  };
  const transactions=new V3TenantTransaction({pool:clinicalPool,deadlineMs:8000});
  const sessions=new V3ExchangeSessionService({transactions,hmacKey:authority.idempotencyKey,maxLifetimeMs:3600000});
  const reads=new V3ExchangeReadService({transactions}),sessionAuditId=randomUUID(),sessionKey=SESSION_RESUME?.idempotencyKey??randomUUID();
  const command=SESSION_RESUME?.command??{patientRefId:ref.patientRefId,ownerTenantId:source.tenantId,sourceHospitalId:source.hospitalId,
   targetHospitalId:other.hospitalId,requesterId:source.actorId,purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',
   validUntil:new Date(Date.now()+1800000).toISOString(),resources:SESSION_SELECTION.resources,requestedActions:['study:view','study:pacs-transfer']};
  try{
   const created=await sessions.create(source,sessionKey,command,{auditSessionId:sessionAuditId,traceId:randomUUID()});
   if(SESSION_RESUME&&created.sessionId!==SESSION_RESUME.sessionId)throw Error('QA_SESSION_RESUME_CHANGED_REFERENCE');
   protectedSession={schemaVersion:2,scope:'CAPSTONE_SYNTHETIC_ONLY',sessionId:created.sessionId,idempotencyKey:sessionKey,auditSessionId:sessionAuditId,
    command,manifestSha256:SESSION_SELECTION.manifestSha256,qualifier:'REQUESTED_INTENTION_NOT_CONSENT_GRANT_OR_CLINICAL_ACCESS'};
   const retry=await sessions.create(source,sessionKey,command,{auditSessionId:sessionAuditId,traceId:randomUUID()});
   const read=await reads.get(source,created.sessionId,{auditSessionId:sessionAuditId,traceId:randomUUID()});
   if(JSON.stringify(created)!==JSON.stringify(retry)||read.state!=='REQUESTED'||read.version!==1||JSON.stringify(read.resources)!==JSON.stringify(created.resources))throw Error('QA_SESSION_CREATE_RETRY_READ_INVALID');
   let conflict;try{await sessions.create(source,sessionKey,{...command,purpose:'DIAGNOSTIC_REVIEW'},{auditSessionId:sessionAuditId,traceId:randomUUID()});}catch(error){conflict=error.code;}
   if(conflict!=='V3_SESSION_IDEMPOTENCY_CONFLICT')throw Error('QA_SESSION_CONFLICT_NOT_DENIED');
   let unknown;try{await sessions.create(source,randomUUID(),{...command,patientRefId:randomUUID()},{auditSessionId:sessionAuditId,traceId:randomUUID()});}catch(error){unknown=error.code;}
   if(unknown!=='V3_SESSION_RESOURCE_UNAVAILABLE')throw Error('QA_SESSION_FOREIGN_REF_NOT_DENIED');
   let foreign;try{authority.registry.resolve(signedRequest({sub:other.subject,hospitalId:other.authHospitalId}),{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});}catch(error){foreign=error.code;}
   if(foreign!=='V3_SCOPE_NOT_ALLOWED')throw Error('QA_SESSION_FOREIGN_SCOPE_NOT_DENIED');
   const inspect=await clinicalPool.connect();try{
    await inspect.query('BEGIN READ ONLY');await inspect.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[source.tenantId,source.hospitalId,source.actorId]);
    const audits=(await inspect.query('SELECT action,reason_code FROM highpass_v3.exchange_audit_outbox WHERE audit_session_id=$1 AND actor_id=$2 ORDER BY action,reason_code',[sessionAuditId,source.actorId])).rows;
    // Requester lacks audit:read. Do not add that scope just to make QA green.
    if(audits.length!==0)throw Error('QA_SESSION_REQUESTER_AUDIT_LEAK');
    await inspect.query('ROLLBACK');await inspect.query('BEGIN READ ONLY');
    await inspect.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[other.tenantId,other.hospitalId,other.actorId]);
    if((await inspect.query('SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id=$1',[created.sessionId])).rows.length!==0)throw Error('QA_SESSION_B_RLS_NOT_DENIED');
    await inspect.query('ROLLBACK');
   }finally{inspect.release(true);}
   outcomes.push({name:'source-requested-session-service',result:'PASS',state:'REQUESTED',version:1,retry:'SAME_ORIGINAL_RECEIPT',read:'PASS',studies:2,series:2,qualifier:'INTERNAL_NONOWNER_SERVICE_NOT_HTTP_CONSENT_OR_GRANT'});
   outcomes.push({name:'session-conflict-ref-scope-and-rls',result:'PASS',conflict:'DENY',unknownRef:'DENY',bForgedScope:'DENY',bRlsVisibility:0,requesterAuditRead:'DENY',resumedSameSession:!!SESSION_RESUME});
  }finally{sessions.dispose();}
"""
    anchor=" }finally{internalIdempotency.dispose();"
    if program.count(anchor)!=1:raise RuntimeError('SESSION_PROGRAM_ANCHOR_INVALID')
    return imports+'const SESSION_RESUME='+json.dumps(resume,separators=(',',':'))+';const SESSION_SELECTION='+json.dumps(selection,separators=(',',':'))+';\n'+program.replace('let protectedRegistration;', 'let protectedSession;let protectedRegistration;').replace(anchor,flow+anchor).replace("_protectedRegistration:failure?undefined:protectedRegistration,", "_protectedSession:protectedSession,sourceSessionCreated:!!protectedSession,sessionHttp:'NOT VERIFIED',_protectedRegistration:failure?undefined:protectedRegistration,")
