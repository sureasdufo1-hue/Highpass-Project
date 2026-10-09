import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {createServer,request} from 'node:https';
import {once} from 'node:events';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3ExchangeSessionService} from '../src/v3-exchange-session-service.js';
import {V3ExchangeReadService} from '../src/v3-exchange-read-service.js';
import {V3MappingReadService} from '../src/v3-mapping-read-service.js';
import {V3MappingWriteService} from '../src/v3-mapping-write-service.js';
import {V3IdentityIdempotency} from '../src/v3-identity-idempotency.js';
import {V3IdentifierProtection} from '../src/v3-identifier-protection.js';
import {createV3IdentityCapstoneEdge} from '../src/v3-identity-secure-edge.js';
import {signIngress} from '../src/ingress.js';

test('actual mTLS Session POST receipt replay/GET pairs audits; failed audit releases no receipt',async()=>{
 const cert=n=>readFileSync('tmp/certs/'+n),secret=randomBytes(32),hmacKey=randomBytes(32),jwtKey=randomBytes(32);
 const principal={issuer:'session-http-test',subject:'synthetic-source',tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),
   role:'HOSPITAL_ADMIN',authHospitalId:'SYNTHETIC-A',status:'ACTIVE',scopes:['exchange:create','exchange:read']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:principal.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:jwtKey.toString('hex')}),records:[principal]});
 const command={patientRefId:randomUUID(),ownerTenantId:principal.tenantId,sourceHospitalId:principal.hospitalId,targetHospitalId:randomUUID(),requesterId:principal.actorId,
   purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',validUntil:new Date(Date.now()+600000).toISOString(),
   resources:[{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.1']}],requestedActions:['study:view']};
 const sessionId=randomUUID(),retryKey='synthetic_session_retry_001',created=new Date().toISOString(),targetTenant=randomUUID();
 const row={session_id:sessionId,patient_ref:command.patientRefId,owner_tenant_id:principal.tenantId,source_hospital_id:principal.hospitalId,
   target_hospital_id:command.targetHospitalId,requester_id:principal.actorId,purpose:command.purpose,initiation_type:command.initiationType,
   requested_actions:command.requestedActions,state:'REQUESTED',version:1,valid_from:created,valid_until:command.validUntil,
   created_at:created,updated_at:created,resource_count:1,live:true,resource_snapshot_digest:createHash('sha256').update(JSON.stringify(command.resources)).digest()};
 const scope=JSON.stringify([principal.tenantId,principal.hospitalId,principal.actorId,'SESSION_CREATE']);
 const ledger={session_id:sessionId,response_state:'REQUESTED',response_version:1,response_created_at:created,
   request_digest:createHmac('sha256',hmacKey).update(JSON.stringify(['HPV3-SESSION-COMMAND',scope,JSON.stringify(command)])).digest()};
 // Explicit transaction adapter fixture, not a PostgreSQL RLS implementation.
 const committed=[],queries=[];let connections=0,failNetwork=false,expired=false;
 const pool={async connect(){connections++;const staged=[];return {async query(q){const sql=q.text;queries.push(sql);
   if(sql.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
   if(sql.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
   if(sql.includes('FROM highpass_v3.exchange_write_results'))return {rows:[ledger]};
   if(sql.startsWith('SELECT patient_ref FROM'))return {rows:[{patient_ref:command.patientRefId}]};
   if(sql.startsWith('SELECT hospital_id,tenant_id,status'))return {rows:[{hospital_id:command.targetHospitalId,tenant_id:targetTenant,status:'ACTIVE'}]};
   if(sql.startsWith('SELECT tenant_id,status'))return {rows:[{tenant_id:targetTenant,status:'ACTIVE'}]};
   if(sql.startsWith('SELECT state,version'))return {rows:[{state:'REQUESTED',version:1,live:!expired}]};
   if(sql.includes('FROM highpass_v3.exchange_sessions'))return {rows:[row]};
   if(sql.startsWith('SELECT study_instance_uid'))return {rows:[{study_instance_uid:'1.2.3',whole_study:false,series_instance_uids:['1.2.3.1']}]};
   if(sql.includes('INSERT INTO highpass_v3.exchange_network_audit')&&failNetwork)throw Error('SYNTHETIC_PRIVATE_DATABASE_FAILURE');
   if(sql.startsWith('INSERT INTO highpass_v3.exchange_'))staged.push({sql,values:q.values});
   if(sql==='COMMIT')committed.push(...staged);
   if(sql==='ROLLBACK')staged.length=0;
   return {rows:[],rowCount:1};},release(){}};}};
 const transactions=new V3TenantTransaction({pool,deadlineMs:8000});
 const sessions=new V3ExchangeSessionService({transactions,hmacKey,maxLifetimeMs:3600000,requireNetworkAudit:true});
 const sessionRead=new V3ExchangeReadService({transactions,requireNetworkAudit:true});
 const idempotency=new V3IdentityIdempotency({transactions,hmacKey:randomBytes(32),requireNetworkAudit:true});
 const protection=new V3IdentifierProtection({encryptionKeys:new Map([['synthetic',randomBytes(32)]]),activeKeyId:'synthetic',lookupKey:randomBytes(32)});
 const edge=createV3IdentityCapstoneEdge({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret,registry,
   readService:new V3MappingReadService({transactions,requireNetworkAudit:true}),writeService:new V3MappingWriteService({idempotency,protection}),
   sessionCreateService:sessions,sessionReadService:sessionRead});
 const server=createServer({key:cert('edge/localhost.key'),cert:cert('edge/localhost.crt'),ca:cert('mtls/ca.crt'),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>edge.handle(req,res));
 server.setTimeout(4000,s=>s.destroy());server.requestTimeout=4000;server.headersTimeout=4000;
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const token=()=>{const unsigned=[{alg:'HS256'},{iss:principal.issuer,aud:'synthetic-api',sub:principal.subject,role:principal.role,hospitalId:principal.authHospitalId,
   scope:principal.scopes.join(' '),exp:Math.floor(Date.now()/1000)+60}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
   return unsigned+'.'+createHmac('sha256',jwtKey.toString('hex')).update(unsigned).digest('base64url');};
 const call=({method='GET',path='/api/v3/exchange-sessions/'+sessionId,body,auth=true,signed=true}={})=>new Promise((resolve,reject)=>{
   const text=body===undefined?'':JSON.stringify(body),headers={'x-audit-session-id':randomUUID(),'x-trace-id':randomUUID()};
   if(auth)headers.authorization='Bearer '+token();
   if(body!==undefined)Object.assign(headers,{'content-type':'application/json','content-length':String(Buffer.byteLength(text)),'idempotency-key':retryKey});
   const ingress=signIngress({method,url:path,headers},'127.0.0.1',secret);
   if(signed)Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':ingress.timestamp,'x-hipass-ingress-signature':ingress.signature});
   const req=request({hostname:'localhost',port:server.address().port,method,path,headers,key:cert('identity-edge/identity-proxy-dev.key'),cert:cert('identity-edge/identity-proxy-dev.crt'),
     ca:cert('mtls/ca.crt'),rejectUnauthorized:true,timeout:4000},res=>{let data='';res.on('data',c=>data+=c);res.on('error',reject);
       res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(data),headers:res.headers});}catch(e){reject(e);}});});
   req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TEST_TIMEOUT')));req.end(text);
 });
 try{
   const path='/api/v3/exchange-sessions';
   const first=await call({method:'POST',path,body:command}),second=await call({method:'POST',path,body:command});
   assert.equal(first.status,201);assert.equal(second.status,201);assert.deepEqual(first.body,second.body);
   assert.equal(first.body.sessionId,sessionId);assert.equal(first.body.createdAt,created);assert.equal(first.headers['cache-control'],'no-store');
   assert.equal((await call()).status,200);assert.equal(committed.length,6);
   for(let i=0;i<committed.length;i+=2){assert.match(committed[i].sql,/exchange_audit_outbox/);assert.match(committed[i+1].sql,/exchange_network_audit/);
     assert.equal(committed[i].values[0],committed[i+1].values[0]);assert.equal(committed[i].values[7],'SESSION_READ');}
   assert.equal(new Set(committed.filter((_,i)=>i%2===0).map(e=>e.values[0])).size,3);
   failNetwork=true;const failed=await call({method:'POST',path,body:command});
   assert.equal(failed.status,503);assert.ok(!('sessionId' in failed.body));assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
   assert.equal(committed.length,6);assert.equal(queries.at(-1),'ROLLBACK');failNetwork=false;
   const conflict=await call({method:'POST',path,body:{...command,purpose:'DIAGNOSTIC_REVIEW'}});
   assert.equal(conflict.status,409);assert.equal(committed.length,8);
   assert.equal(committed[6].values[9],'IDEMPOTENCY_CONFLICT');assert.equal(committed[6].values[0],committed[7].values[0]);
   expired=true;const stale=await call({method:'POST',path,body:command});
   assert.equal(stale.status,404);assert.ok(!('sessionId' in stale.body));assert.equal(committed.length,10);
   assert.equal(committed[8].values[9],'SESSION_EXPIRED');assert.equal(committed[8].values[0],committed[9].values[0]);
   assert.equal(queries.at(-1),'COMMIT');expired=false;
   const before=connections;assert.equal((await call({auth:false})).status,401);assert.equal((await call({signed:false})).status,403);
   assert.equal((await call({path:'/api/v3/exchange-sessions/%2e%2e'})).status,422);assert.equal(connections,before);
   assert.equal((await call({path:'/api/v3/exchange-sessions-extra'})).status,404);
 }finally{edge.dispose();sessions.dispose();idempotency.dispose();protection.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
