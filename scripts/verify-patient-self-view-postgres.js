// Isolated synthetic integration probe. Never connects to the deployed database.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash, generateKeyPairSync, sign, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PostgresStore } from '../src/postgres-store.js';
import { HipassService } from '../src/services.js';
import { createPatientSelfViewPersistence } from '../src/patient-self-view-audit-adapter.js';
import { PatientSelfViewAuthorityReader } from '../src/patient-self-view-authority.js';
import { createSeedData } from '../src/seed.js';
import { PatientSelfViewGrantService } from '../src/patient-self-view-grant-service.js';
import { LocalDevelopmentKeyProvider } from '../src/key-provider.js';
import { dpopReplaySchemaSql, PostgresDPoPReplayStore } from '../src/dpop-replay-store.js';
import { createServer } from 'node:http';
import { authenticateRequest } from '../src/auth.js';
import { ingressMeta, signIngress } from '../src/ingress.js';
import { createPatientSelfViewGrantHttpHandler, createPatientGrantAuthenticationAudit } from '../src/patient-self-view-grant-http-handler.js';
import { PatientSelfViewAuthorization } from '../src/patient-self-view-authorization.js';
import { InternalServiceProvider } from '../src/auth.js';

const docker = args => execFileSync('docker',args,{encoding:'utf8',timeout:15000,env:childEnv,stdio:['pipe','pipe','pipe']}).trim();
const childEnv={...process.env,POSTGRES_PASSWORD:randomBytes(32).toString('hex')};
const name=`hp-selfview-validation-${randomUUID().slice(0,8)}`;
let ownedId,admin,pool,legacy,http,cleanup=false,stage='container',failureCode,finalCounts;
const results=[]; const start=Date.now();
try {
  const image=docker(['inspect','hipass-postgres','--format','{{.Image}}']);
  assert.match(image,/^sha256:[a-f0-9]{64}$/);
  ownedId=docker(['run','--rm','-d','--name',name,'--label','highpass.purpose=isolated-selfview-validation',
    '--tmpfs','/var/lib/postgresql/data:rw,size=256m',
    '-e','POSTGRES_PASSWORD','-p','127.0.0.1::5432',image]);
  assert.match(ownedId,/^[a-f0-9]{64}$/);
  const port=Number(docker(['inspect',ownedId,'--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}']));
  const config={host:'127.0.0.1',port,user:'postgres',password:childEnv.POSTGRES_PASSWORD,database:'postgres',
    connectionTimeoutMillis:1500,query_timeout:5000,statement_timeout:5000};
  const deadline=Date.now()+45000;
  stage='readiness';
  while(!admin && Date.now()<deadline) {
    const candidate=new pg.Client(config);candidate.on('error',()=>{});
    try {await candidate.connect();await candidate.query('SELECT 1');admin=candidate;}
    catch(error) {failureCode=error.code;await candidate.end().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,300));}
  }
  assert.ok(admin,'READINESS_TIMEOUT');
  failureCode=undefined;
  stage='schema';
  const schema=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');
  for(const table of ['patients','hospitals','imaging_studies','imaging_series','audit_logs']) {
    const ddl=schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(ddl,'SCHEMA_TABLE_REQUIRED');await admin.query({text:ddl[0],query_timeout:20000});
  }
  await admin.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ticket_id varchar');
  for(const migration of ['033_capstone_patient_self_view_authority.sql','034_capstone_patient_self_view_grants.sql','035_capstone_patient_audit_lock.sql'])
    await admin.query({text:await readFile(new URL(`../db/migrations/${migration}`,import.meta.url),'utf8'),query_timeout:20000});
  await admin.query(dpopReplaySchemaSql);
  const now=Date.now(),ref=randomUUID();
  await admin.query("INSERT INTO patients VALUES ('HP-TEST-PHANTOM-001','Synthetic phantom','1970-01-01',NULL,now())");
  await admin.query("INSERT INTO hospitals VALUES ('H-A','Synthetic A','https://synthetic.invalid','ACTIVE',NULL)");
  await admin.query("INSERT INTO imaging_studies VALUES ('SYNTHETIC','HP-TEST-PHANTOM-001','H-A','1.2.3','CT','PHANTOM','2026-10-09','Synthetic',true)");
  await admin.query("INSERT INTO imaging_series VALUES ('1.2.3.1','1.2.3','CT','Synthetic',12,0,NULL)");
  await admin.query("INSERT INTO capstone_patient_accounts VALUES ('synthetic-phantom-account','HP-TEST-PHANTOM-001','CAPSTONE_MOCK_IDP','ACTIVE',$1)",[randomUUID()]);
  await admin.query("INSERT INTO capstone_patient_ownership_refs VALUES ($1,'synthetic-phantom-account','HP-TEST-PHANTOM-001','1.2.3','H-A','ACTIVE',1)",[ref]);
  // Test-only role, no superuser/table ownership. UPDATE column privilege is
  // needed by PostgreSQL row-lock SELECT, not exercised as a policy mutation.
  await admin.query(`CREATE ROLE hp_selfview_probe NOLOGIN;
    GRANT USAGE ON SCHEMA public TO hp_selfview_probe;
    GRANT SELECT ON patients,hospitals,imaging_studies,imaging_series,capstone_patient_accounts,capstone_patient_ownership_refs,audit_logs TO hp_selfview_probe;
    GRANT INSERT ON capstone_patient_self_view_grants,audit_logs TO hp_selfview_probe;
    GRANT SELECT ON capstone_patient_self_view_grants TO hp_selfview_probe;
    GRANT EXECUTE ON FUNCTION public.capstone_patient_lock_audit() TO hp_selfview_probe;
    GRANT SELECT,INSERT,UPDATE,DELETE ON dpop_replay_entries TO hp_selfview_probe;
    GRANT UPDATE (patient_id) ON patients TO hp_selfview_probe;
    GRANT UPDATE (hospital_name) ON hospitals TO hp_selfview_probe;
    GRANT UPDATE (study_id) ON imaging_studies TO hp_selfview_probe;
    GRANT UPDATE (description) ON imaging_series TO hp_selfview_probe;
    GRANT UPDATE (evidence_kind) ON capstone_patient_accounts TO hp_selfview_probe;
    GRANT UPDATE (ref_id) ON capstone_patient_ownership_refs TO hp_selfview_probe;`);
  pool=new pg.Pool({...config,max:2});
  let databaseFailureCode;
  const rolePool={connect:async()=>{
    const c=await pool.connect();await c.query('SET ROLE hp_selfview_probe');
    if(!c.probeWrapped){const original=c.query.bind(c);c.query=async(...args)=>{try{return await original(...args);}catch(error){databaseFailureCode=error.code;throw error;}};c.probeWrapped=true;}
    return c;
  }};
  legacy=new pg.Client(config);legacy.on('error',()=>{});await legacy.connect();await legacy.query('SET ROLE hp_selfview_probe');
  const role=(await legacy.query("SELECT r.rolsuper,r.rolbypassrls,has_table_privilege(current_user,'audit_logs','UPDATE') AS audit_update FROM pg_roles r WHERE r.rolname=current_user")).rows[0];
  assert.deepEqual(role,{rolsuper:false,rolbypassrls:false,audit_update:false});
  const store=Object.create(PostgresStore.prototype);store.client=legacy;store.saveQueue=Promise.resolve();
  store.data=Object.fromEntries(Object.entries(createSeedData()).map(([key,value])=>[key,Array.isArray(value)?[]:value]));
  store.persistedData=structuredClone(store.data);
  const service=new HipassService(store,()=>new Date().toISOString());
  const input={principal:{role:'PATIENT',subject:'synthetic-phantom-account',patientId:'HP-TEST-PHANTOM-001',authMethod:'TEST_JWT',authMode:'TEST',
    issuer:'highpass-capstone-test-idp',audience:'highpass-capstone-api',expiresAtMs:now+600000},patientId:'HP-TEST-PHANTOM-001',
    studyInstanceUid:'1.2.3',seriesInstanceUid:'1.2.3.1',requestedAction:'VIEW'};
  const reader=new PatientSelfViewAuthorityReader({pool:{query:async c=>{const client=await rolePool.connect();try{return await client.query(c);}finally{client.release();}}},enabled:true});
  const decision=await reader.authorize(input);assert.equal(decision.decision,'ALLOWED');
  const grant=()=>({grantId:randomUUID(),auditSessionId:randomUUID(),tokenHash:createHash('sha256').update(randomBytes(32)).digest('hex'),
    ownershipRevision:decision.scope.ownershipRevision,proofKeyThumbprint:'a'.repeat(43),viewingGatewayId:'hospital-b-portal',issuedAtMs:now,expiresAtMs:now+300000});
  const adapter=createPatientSelfViewPersistence({store,pool:rolePool,enabled:true,singleWriter:true});
  stage='grant-and-audit';
  const count=async()=> (await admin.query('SELECT (SELECT count(*) FROM capstone_patient_self_view_grants)::int AS grants,(SELECT count(*) FROM audit_logs)::int AS audits')).rows[0];
  try {await adapter.create(input,grant());}catch(error){if(databaseFailureCode)error.code=databaseFailureCode;throw error;}
  assert.deepEqual(await count(),{grants:1,audits:1});assert.equal(service.verifyAuditIntegrity().ok,true);
  results.push('REAL_GRANT_AND_EXISTING_AUDIT_COMMIT');
  const originalInsert=store.insertAuditLogs;
  store.insertAuditLogs=async function(rows,client){if(client)await client.query('SELECT 1/0');return originalInsert.call(this,rows,client);};
  await assert.rejects(adapter.create(input,grant()));assert.deepEqual(await count(),{grants:1,audits:1});assert.equal(store.data.auditLogs.length,1);
  store.insertAuditLogs=originalInsert;results.push('AUDIT_SQL_FAILURE_ROLLS_BACK_GRANT_AND_AUDIT');
  await admin.query('UPDATE capstone_patient_ownership_refs SET version=2 WHERE ref_id=$1',[ref]);
  await assert.rejects(adapter.create(input,grant()));assert.deepEqual(await count(),{grants:1,audits:1});
  await admin.query('UPDATE capstone_patient_ownership_refs SET version=1 WHERE ref_id=$1',[ref]);results.push('OWNERSHIP_CHANGE_DENIED_WITHOUT_SIDE_EFFECT');
  await Promise.all([adapter.create(input,grant()),service.writeAudit({actorType:'PATIENT',actorId:input.principal.subject,
    action:'SYNTHETIC_CONCURRENT_AUDIT',result:'SUCCESS',skipAnomalyDetection:true})]);
  await store.save();assert.deepEqual(await count(),{grants:2,audits:3});assert.equal(service.verifyAuditIntegrity().ok,true);
  const fromDatabase=await store.readTable('auditLogs');assert.equal(fromDatabase.length,3);
  const memory=store.data.auditLogs;store.data.auditLogs=fromDatabase;
  assert.equal(service.verifyAuditIntegrity().ok,true);store.data.auditLogs=memory;
  results.push('REAL_LEGACY_SAVE_AND_GRANT_SHARE_ONE_CHAIN');
  for(const invalid of [{...input,seriesInstanceUid:'1.2.3.2'},{...input,principal:{...input.principal,role:'DOCTOR'}}])
    await assert.rejects(adapter.create(invalid,grant()));
  assert.deepEqual(await count(),{grants:2,audits:3});results.push('FOREIGN_SERIES_AND_ROLE_DENIED_WITHOUT_SIDE_EFFECT');
  results.push('NONOWNER_ROLE_HAS_NO_AUDIT_UPDATE_RIGHT');
  stage='persistent-dpop-issuance';
  service.dpopReplayStore=new PostgresDPoPReplayStore(undefined,{pool:{query:async(text,values)=>{
    const client=await rolePool.connect();try{return await client.query({text,values,query_timeout:5000});}finally{client.release();}
  }}});
  const secret=randomBytes(32).toString('hex');
  const issuer=new PatientSelfViewGrantService({authority:reader,persistence:adapter,proofService:service,
    keyProvider:new LocalDevelopmentKeyProvider(secret),allowedOrigin:'https://synthetic.invalid',enabled:true});
  const url=`https://synthetic.invalid/api/patients/${input.patientId}/studies/1.2.3/self-view-grants`;
  const pair=generateKeyPairSync('ec',{namedCurve:'P-256'}),jwk=pair.publicKey.export({format:'jwk'});
  const makeProof=({method='POST',target=url,token}={})=>{
    const header=Buffer.from(JSON.stringify({typ:'dpop+jwt',alg:'ES256',jwk})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({jti:randomUUID(),htm:method,htu:target,iat:Math.floor(Date.now()/1000),
      ...(token?{ath:createHash('sha256').update(token).digest('base64url')}:{})})).toString('base64url');
    return `${header}.${payload}.${sign('SHA256',Buffer.from(`${header}.${payload}`),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
  };
  const meta={ingressTrusted:true,method:'POST',externalUrl:url,dpopProof:makeProof()};
  const issued=await issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},meta);
  const [header,payload,signature]=issued.accessToken.split('.'),claims=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(signature,createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url'));
  assert.equal(claims.aud,'mediq-patient-self-view-gateway');assert.equal(claims.permission,'VIEW_ONLY');
  assert.ok(claims.exp-claims.iat<=300);assert.ok(claims.exp*1000<=input.principal.expiresAtMs);
  const persistedGrant=(await admin.query('SELECT token_hash,audit_session_id,proof_key_thumbprint FROM capstone_patient_self_view_grants WHERE grant_id=$1',[claims.jti])).rows[0];
  assert.equal(persistedGrant.token_hash,createHash('sha256').update(issued.accessToken).digest('hex'));
  assert.equal(persistedGrant.proof_key_thumbprint,claims.cnf.jkt);assert.equal(persistedGrant.audit_session_id,claims.auditSessionId);
  assert.deepEqual(await count(),{grants:3,audits:4});results.push('REAL_PERSISTENT_DPOP_SIGNED_PATIENT_GRANT_AND_HASH_LEDGER');
  await assert.rejects(issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},meta),e=>e.code==='DPOP_NONCE_REPLAYED');
  await assert.rejects(issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},{...meta,dpopProof:undefined}),e=>e.code==='DPOP_PROOF_REQUIRED');
  const forged=makeProof().split('.');forged[2]=(forged[2][0]==='a'?'b':'a')+forged[2].slice(1);
  await assert.rejects(issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},{...meta,dpopProof:forged.join('.')}),e=>e.code==='DPOP_SIGNATURE_INVALID');
  assert.equal((await count()).grants,3);
  const storedAudits=await store.readTable('auditLogs'),beforeReadVerification=store.data.auditLogs;
  store.data.auditLogs=storedAudits;assert.equal(service.verifyAuditIntegrity().ok,true);
  store.data.auditLogs=beforeReadVerification;results.push('REAL_REPLAY_MISSING_AND_FORGED_PROOFS_DENIED_WITH_AUDIT');
  service.dpopReplayStore=new PostgresDPoPReplayStore(undefined,{pool:{query:async(text,values)=>{
    const client=await rolePool.connect();try{return await client.query({text,values,query_timeout:5000});}finally{client.release();}
  }}});
  await assert.rejects(issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},meta),e=>e.code==='DPOP_NONCE_REPLAYED');
  service.dpopReplayStore=new PostgresDPoPReplayStore(undefined,{pool:{query:async()=>{throw new Error('synthetic replay outage');}}});
  await assert.rejects(issuer.issue(input,{seriesInstanceUids:['1.2.3.1']},{...meta,dpopProof:makeProof()}),e=>e.code==='DPOP_REPLAY_STORE_UNAVAILABLE'&&e.statusCode===503);
  assert.equal((await count()).grants,3);results.push('PERSISTED_REPLAY_SURVIVES_ADAPTER_RESTART_AND_STORE_OUTAGE_DENIES');
  const beforeFinalRead=store.data.auditLogs;store.data.auditLogs=await store.readTable('auditLogs');
  assert.equal(service.verifyAuditIntegrity().ok,true);store.data.auditLogs=beforeFinalRead;
  stage='authenticated-http';
  service.dpopReplayStore=new PostgresDPoPReplayStore(undefined,{pool:{query:async(text,values)=>{
    const client=await rolePool.connect();try{return await client.query({text,values,query_timeout:5000});}finally{client.release();}
  }}});
  const ingressSecret=randomBytes(32).toString('hex');
  const authEnv={AUTH_MODE:'TEST',NODE_ENV:'test',TEST_JWT_SECRET:secret,JWT_ISSUER:'highpass-capstone-test-idp',JWT_AUDIENCE:'highpass-capstone-api'};
  const handler=createPatientSelfViewGrantHttpHandler({issuer,auditAuthenticationDenied:createPatientGrantAuthenticationAudit(service),authenticate:r=>authenticateRequest(r,authEnv),requestMeta:r=>({
    ...ingressMeta(r,ingressSecret),method:r.method,externalUrl:new URL(r.url,'https://synthetic.invalid').href,dpopProof:r.headers.dpop,
  })});
  http=createServer(async(req,res)=>{try{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}}catch{res.writeHead(503);res.end();}});
  http.requestTimeout=25000;http.headersTimeout=10000;
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const jwt=changes=>{
    const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const p=Buffer.from(JSON.stringify({iss:authEnv.JWT_ISSUER,aud:authEnv.JWT_AUDIENCE,sub:input.principal.subject,
      role:'PATIENT',patientId:input.patientId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...changes})).toString('base64url');
    return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
  };
  const path=new URL(url).pathname;
  const call=async({token=jwt({}),trusted=true,proof=makeProof(),body={seriesInstanceUids:['1.2.3.1']}}={})=>{
    const headers={'content-type':'application/json',dpop:proof};if(token)headers.authorization=`Bearer ${token}`;
    if(trusted){const signature=signIngress({method:'POST',url:path,headers},'192.0.2.1',ingressSecret);
      Object.assign(headers,{'x-forwarded-for':'192.0.2.1','x-forwarded-proto':'https','x-hipass-ingress-time':signature.timestamp,'x-hipass-ingress-signature':signature.signature});}
    const res=await fetch(`http://127.0.0.1:${http.address().port}${path}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control'),referrer:res.headers.get('referrer-policy'),location:res.headers.get('location')};
  };
  const response=await call();assert.equal(response.status,201);assert.equal(response.cache,'no-store');
  assert.equal(response.referrer,'no-referrer');assert.equal(response.location,null);assert.ok(response.body.accessToken);
  const granted=(await count()).grants;
  assert.equal((await call({token:null})).status,401);
  assert.equal((await call({trusted:false})).status,403);
  assert.equal((await call({token:jwt({role:'DOCTOR',doctorId:'SYNTHETIC-DOCTOR',hospitalId:'H-B'})})).status,403);
  assert.equal((await call({token:jwt({patientId:'P-1001'})})).status,403);
  assert.equal((await call({body:{seriesInstanceUids:['1.2.3.1'],permission:'DOWNLOAD_ALLOWED'}})).status,400);
  assert.equal((await count()).grants,granted);
  const beforeHttpRead=store.data.auditLogs;store.data.auditLogs=await store.readTable('auditLogs');
  assert.equal(service.verifyAuditIntegrity().ok,true);store.data.auditLogs=beforeHttpRead;
  results.push('REAL_HTTP_JWT_INGRESS_ISSUANCE_AND_IDENTITY_INPUT_DENIALS');
  stage='patient-gateway-authorization';
  const gatewayKey=randomBytes(32).toString('hex');
  const caller=new InternalServiceProvider({HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN:gatewayKey,HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID:'H-A'})
    .authenticate({headers:{'x-hipass-service-token':gatewayKey}});
  const queryPool={query:async config=>{const client=await rolePool.connect();try{return await client.query(config);}finally{client.release();}}};
  const verifier=new PatientSelfViewAuthorization({pool:queryPool,authority:new PatientSelfViewAuthorityReader({pool:queryPool,enabled:true,allowIssuedGrant:true}),
    service,keyProvider:new LocalDevelopmentKeyProvider(secret),publicBaseUrl:'https://synthetic.invalid',sourceHospitalId:'H-A',enabled:true});
  const patientPath='/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances',patientUrl='https://synthetic.invalid'+patientPath;
  const access={method:'GET',path:patientPath,token:response.body.accessToken,authorizationScheme:'DPoP',
    dpopProof:makeProof({method:'GET',target:patientUrl,token:response.body.accessToken})};
  const checked=await verifier.authorize(access,caller);assert.equal(checked.active,true);assert.equal(checked.scope.permission,'VIEW_ONLY');
  assert.ok(!JSON.stringify(checked).includes(access.token));
  assert.equal((await verifier.ready({receipt:checked.receipt,bytesPrepared:128,outcome:'READY'},caller)).accepted,true);
  assert.equal((await verifier.ready({receipt:'a'+checked.receipt,bytesPrepared:128,outcome:'READY'},caller)).accepted,false);
  assert.equal((await verifier.authorize(access,caller)).reason,'DPOP_NONCE_REPLAYED');
  assert.equal((await verifier.authorize({...access,path:patientPath.replace('1.2.3.1','1.2.3.2')},caller)).reason,'SCOPE_MISMATCH');
  const usedClaims=JSON.parse(Buffer.from(access.token.split('.')[1],'base64url'));
  await admin.query("UPDATE capstone_patient_self_view_grants SET status='REVOKED' WHERE grant_id=$1",[usedClaims.jti]);
  assert.equal((await verifier.ready({receipt:checked.receipt,bytesPrepared:128,outcome:'READY'},caller)).accepted,false);
  assert.equal((await verifier.authorize({...access,dpopProof:makeProof({method:'GET',target:patientUrl,token:access.token})},caller)).active,false);
  await admin.query("UPDATE capstone_patient_self_view_grants SET status='ACTIVE' WHERE grant_id=$1",[usedClaims.jti]);
  await admin.query('UPDATE capstone_patient_ownership_refs SET version=2 WHERE ref_id=$1',[ref]);
  assert.equal((await verifier.ready({receipt:checked.receipt,bytesPrepared:128,outcome:'READY'},caller)).accepted,false);
  assert.equal((await verifier.authorize({...access,dpopProof:makeProof({method:'GET',target:patientUrl,token:access.token})},caller)).active,false);
  assert.equal((await count()).grants,granted);
  const beforeGatewayRead=store.data.auditLogs;store.data.auditLogs=await store.readTable('auditLogs');
  assert.equal(service.verifyAuditIntegrity().ok,true);store.data.auditLogs=beforeGatewayRead;
  results.push('REAL_PATIENT_CAPABILITY_LEDGER_SCOPE_DPOP_AND_REVOCATION_REVALIDATION');
  results.push('REAL_PATIENT_PREPARATION_RECEIPT_AUDIT_TAMPER_REVOCATION_AND_OWNERSHIP_RECHECK');
  finalCounts={...await count(),proofs:(await admin.query('SELECT count(*)::int AS count FROM dpop_replay_entries')).rows[0].count};
} catch(error) {process.exitCode=1;failureCode=typeof error.code==='string'?error.code:error.message==='Query read timeout'?'QUERY_TIMEOUT':error.name;results.push(`FAIL_OR_ENVIRONMENT_BLOCKED:${stage}`);}
finally {
  if(http){http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
  await pool?.end().catch(()=>{});await legacy?.end().catch(()=>{});await admin?.end().catch(()=>{});
  if(ownedId) {try {docker(['stop','--time','3',ownedId]);cleanup=true;}catch{process.exitCode=1;}}
  console.log(JSON.stringify({status:process.exitCode?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',scope:'isolated synthetic PostgreSQL/tmpfs and loopback HTTP behind signed-ingress simulation; actual JWT/DPoP/SQL, not public TLS/deployment/clinical bytes/disk crash durability',
    checks:results,finalCounts,failureCode,cleanup,elapsedMs:Date.now()-start},null,2));
}
