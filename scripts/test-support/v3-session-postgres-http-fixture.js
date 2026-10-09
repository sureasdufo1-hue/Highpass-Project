import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createServer,request} from 'node:https';
import {once} from 'node:events';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {V3PatientRefService} from '../../src/v3-patient-ref-service.js';
import {V3ExchangeSessionService} from '../../src/v3-exchange-session-service.js';
import {V3ExchangeReadService} from '../../src/v3-exchange-read-service.js';
import {V3MappingReadService} from '../../src/v3-mapping-read-service.js';
import {V3MappingWriteService} from '../../src/v3-mapping-write-service.js';
import {V3IdentityIdempotency} from '../../src/v3-identity-idempotency.js';
import {V3IdentifierProtection} from '../../src/v3-identifier-protection.js';
import {buildCapstoneSourceExchangeRegistry} from '../../src/v3-capstone-synthetic-registry.js';
import {createV3IdentityCapstoneEdge} from '../../src/v3-identity-secure-edge.js';
import {createSyntheticPreauthObserver} from '../../src/v3-preauth-security-events.js';
import {signIngress} from '../../src/ingress.js';

/** Only newly owned loopback fixture. Real services/SQL/RLS; never cloud access.
 * Fixture DB is loopback plaintext; HTTP is strict mTLS, not DB TLS evidence. */
export async function checkSessionPostgresHttp({port,password,target,registry:source,check}){
 if(!Number.isInteger(port)||port<1||port>65535||target!=='highpass_v3_capstone_rehearsal'||!/^[a-f0-9]{64}$/.test(password))throw Error('HTTP_PG_FIXTURE_REQUIRED');
 const pools=[],config={host:'127.0.0.1',port,database:target,connectionTimeoutMillis:3000,query_timeout:5000,statement_timeout:3000,idleTimeoutMillis:1000,max:3};
 const pool=(user,password)=>{const p=new pg.Pool({...config,user,password});p.on('error',()=>{});pools.push(p);return p;};
 const admin=pool('postgres',password),jwt=randomBytes(32).toString('hex'),ingress=randomBytes(32);
 let sessions,idempotency,protection,edge,observer,server;
 try{
  const rolePools={};
  for(const role of ['hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader']){
   const credential=randomBytes(32).toString('hex');
   // Fixed role names and locally generated hex only; no user input/SQL secret log.
   await admin.query(`ALTER ROLE ${role} PASSWORD '${credential}'`);rolePools[role]=pool(role,credential);
  }
  const snapshot=buildCapstoneSourceExchangeRegistry(source.snapshot).snapshot;
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:snapshot.issuer,JWT_AUDIENCE:snapshot.audience,TEST_JWT_SECRET:jwt}),records:snapshot.records});
  const a=snapshot.records[0],b=snapshot.records.find(r=>r.subject==='synthetic-capstone-b-requester');
  const token=(record,scopes=record.scopes)=>{const text=[{alg:'HS256'},{iss:snapshot.issuer,aud:snapshot.audience,sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
   scope:scopes.join(' '),exp:Math.floor(Date.now()/1000)+120}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return text+'.'+createHmac('sha256',jwt).update(text).digest('base64url');};
  const transactions=new V3TenantTransaction({pool:rolePools.hp_v3_app,deadlineMs:8000});
  const binding=registry.resolve({headers:{authorization:'Bearer '+token(a)}},{requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
  const ref=await new V3PatientRefService({transactions}).register(binding);
  check('actual nonowner source PatientRef registered without patient consent',typeof ref.patientRefId==='string');
  sessions=new V3ExchangeSessionService({transactions,hmacKey:randomBytes(32),maxLifetimeMs:3600000,requireNetworkAudit:true});
  idempotency=new V3IdentityIdempotency({transactions,hmacKey:randomBytes(32),requireNetworkAudit:true});
  protection=new V3IdentifierProtection({encryptionKeys:new Map([['synthetic',randomBytes(32)]]),activeKeyId:'synthetic',lookupKey:randomBytes(32)});
  const factory=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
  observer=factory.createEdgeObserver({sink:factory.createDurableSink({publisherPool:rolePools.hp_v3_identity_preauth_writer,reconciliationPool:rolePools.hp_v3_identity_preauth_reader,deadlineMs:1000,maxConcurrent:2})});
  edge=createV3IdentityCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:ingress,registry,preauthObserver:observer,
   readService:new V3MappingReadService({transactions,requireNetworkAudit:true}),writeService:new V3MappingWriteService({idempotency,protection}),
   sessionCreateService:sessions,sessionReadService:new V3ExchangeReadService({transactions,requireNetworkAudit:true})});
  const cert=n=>readFileSync('tmp/certs/'+n);
  server=createServer({key:cert('edge/localhost.key'),cert:cert('edge/localhost.crt'),ca:cert('mtls/ca.crt'),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>edge.handle(req,res));
  server.requestTimeout=5000;server.headersTimeout=5000;server.setTimeout(5000,s=>s.destroy());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const correlation=randomUUID();
  const call=({method='GET',path,body,key=randomUUID(),record=a,scopes,auth=true,signed=true}={})=>new Promise((resolve,reject)=>{
   const data=body===undefined?'':JSON.stringify(body),headers={'x-audit-session-id':correlation,'x-trace-id':randomUUID()};
   if(auth)headers.authorization='Bearer '+token(record,scopes);
   if(body!==undefined)Object.assign(headers,{'content-type':'application/json','content-length':String(Buffer.byteLength(data)),'idempotency-key':key});
   const sig=signIngress({method,url:path,headers},'127.0.0.1',ingress);
   if(signed)Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':sig.timestamp,'x-hipass-ingress-signature':sig.signature});
   const req=request({hostname:'localhost',port:server.address().port,method,path,headers,agent:false,ca:cert('mtls/ca.crt'),key:cert('identity-edge/identity-proxy-dev.key'),cert:cert('identity-edge/identity-proxy-dev.crt'),rejectUnauthorized:true,timeout:5000},res=>{
    let text='';res.on('data',c=>text+=c);res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)});}catch{reject(Error('HTTP_SAFE_RESPONSE_REQUIRED'));}});
   });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTP_FIXTURE_DEADLINE')));req.end(data);
  });
  const path='/api/v3/exchange-sessions',key=randomUUID(),command={patientRefId:ref.patientRefId,ownerTenantId:a.tenantId,sourceHospitalId:a.hospitalId,targetHospitalId:b.hospitalId,requesterId:a.actorId,
   purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',validUntil:new Date(Date.now()+600000).toISOString(),resources:[{studyInstanceUid:'1.2.826.0.1.3680043.10.5432.99',seriesInstanceUids:['1.2.826.0.1.3680043.10.5432.99.1']}],requestedActions:['study:view']};
  const first=await call({method:'POST',path,body:command,key});
  check('fresh HTTPS Session POST201 persisted REQUESTED/version1',first.status===201&&first.body.state==='REQUESTED'&&first.body.version===1);
  const retry=await call({method:'POST',path,body:command,key});
  check('actual database retry preserves original response',retry.status===201&&JSON.stringify(first.body)===JSON.stringify(retry.body));
  const read=await call({path:path+'/'+first.body.sessionId});
  check('actual HTTPS GET preserves selected Study/Series',read.status===200&&JSON.stringify(read.body.resources)===JSON.stringify(command.resources));
  check('changed command retry denied409',(await call({method:'POST',path,body:{...command,purpose:'DIAGNOSTIC_REVIEW'},key})).status===409);
  check('unknown source ref denied404',(await call({method:'POST',path,body:{...command,patientRefId:randomUUID()}})).status===404);
  check('registered B cannot forge source exchange scope',(await call({path:path+'/'+first.body.sessionId,record:b,scopes:['exchange:read']})).status===403);
  const counts=await admin.query(`SELECT e.action,e.reason_code,count(*)::int n,count(n.event_id)::int paired
   FROM highpass_v3.exchange_audit_outbox e LEFT JOIN highpass_v3.exchange_network_audit n
   ON n.event_id=e.event_id AND n.tenant_id=e.tenant_id AND n.hospital_id=e.hospital_id AND n.actor_id=e.actor_id
   AND n.audit_session_id=e.audit_session_id AND n.trace_id=e.trace_id WHERE e.audit_session_id=$1 GROUP BY e.action,e.reason_code`,[correlation]);
  const expected=new Map([['SESSION_CREATED/SESSION_REQUESTED',1],['SESSION_READ/METADATA_READ',2],['SESSION_DENIED/IDEMPOTENCY_CONFLICT',1],['SESSION_DENIED/SOURCE_REF_UNAVAILABLE',1]]);
  check('five actual domain/network pairs exact tuple recorded once',counts.rows.length===4&&counts.rows.every(r=>r.n===expected.get(r.action+'/'+r.reason_code)&&r.paired===r.n));
  const requesterAudit=await transactions.run(binding,'exchange:read',tx=>tx.query('SELECT count(*)::int n FROM highpass_v3.exchange_network_audit'));
  check('real HTTP requester still cannot read audit rows',requesterAudit.rows[0].n===0);
  const other=registry.resolve({headers:{authorization:'Bearer '+token(b)}},{requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
  const foreign=await transactions.run(other,'mapping:write',tx=>tx.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions WHERE session_id=$1',[first.body.sessionId]));
  check('direct B nonowner SQL sees no invited source Session',foreign.rows[0].n===0);
  const shortCommand={...command,validUntil:new Date(Date.now()+3000).toISOString()},shortKey=randomUUID();
  const short=await call({method:'POST',path,body:shortCommand,key:shortKey});
  check('actual short-lived REQUESTED Session created',short.status===201);
  await new Promise(r=>setTimeout(r,3100));
  check('elapsed actual Session GET denied404',(await call({path:path+'/'+short.body.sessionId})).status===404);
  check('elapsed actual Session receipt retry denied404',(await call({method:'POST',path,body:shortCommand,key:shortKey})).status===404);
  // Failure injected only by revoking the owned fixture's network INSERT, not a
  // runtime bypass: creation must roll back parent, ledger, audit and resources.
  const before=(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n;
  const atomicCounts=async()=>{const r=await admin.query(`SELECT
   (SELECT count(*)::int FROM highpass_v3.exchange_audit_outbox) audits,
   (SELECT count(*)::int FROM highpass_v3.exchange_network_audit) network,
   (SELECT count(*)::int FROM highpass_v3.exchange_write_results) ledger,
   (SELECT count(*)::int FROM highpass_v3.exchange_resource_scopes) resources`);return JSON.stringify(r.rows[0]);};
  const beforeAtomic=await atomicCounts();
  await admin.query('REVOKE INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at) ON highpass_v3.exchange_network_audit FROM hp_v3_app');
  const failed=await call({method:'POST',path,body:command});
  check('actual network-audit SQL failure suppresses new receipt503',failed.status===503&&!failed.body.sessionId);
  check('failed HTTP creation leaves no new Session',(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n===before);
  check('failed HTTP creation leaves no audit network ledger or resource residue',await atomicCounts()===beforeAtomic);
  check('missing bearer401 and unsigned ingress403 observed',(await call({path:path+'/'+first.body.sessionId,auth:false})).status===401&&(await call({path:path+'/'+first.body.sessionId,signed:false})).status===403);
  let durable=false;const until=Date.now()+3000;
  while(Date.now()<until){const rows=await rolePools.hp_v3_identity_preauth_reader.query("SELECT reason_code,source_kind,host(source_ip) ip FROM highpass_v3.preauth_security_events WHERE reason_code IN ('HUMAN_AUTH_REJECTED','INGRESS_REJECTED')");
   if(rows.rows.some(r=>r.reason_code==='HUMAN_AUTH_REJECTED')&&rows.rows.some(r=>r.reason_code==='INGRESS_REJECTED')&&rows.rows.every(r=>r.source_kind==='IMMEDIATE_SOCKET'&&r.ip==='127.0.0.1')){durable=true;break;}
   await new Promise(r=>setTimeout(r,100));}
  check('separate durable preauth reader confirms socket-origin authentication and ingress denials',durable);
 }finally{
  edge?.dispose();observer?.dispose();sessions?.dispose();idempotency?.dispose();protection?.dispose();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await Promise.all(pools.map(p=>p.end()));
 }
}
