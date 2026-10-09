import { spawnSync } from 'node:child_process';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID,randomBytes,createHmac,createHash } from 'node:crypto';
import { Pool } from 'pg';
import { createServer,request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { TestProvider } from '../src/auth.js';
import { V3PrincipalRegistry } from '../src/v3-principal-registry.js';
import { V3TenantTransaction } from '../src/v3-tenant-transaction.js';
import { appendIdentityAudit } from '../src/v3-identity-audit.js';
import { V3IdentifierProtection } from '../src/v3-identifier-protection.js';
import { V3MappingReadService } from '../src/v3-mapping-read-service.js';
import { createV3IdentityRuntimeRouter } from '../src/v3-identity-runtime-router.js';
import {checkIdentitySecureEdge} from './test-support/v3-identity-secure-edge-fixture.js';
import { V3PatientRefService } from '../src/v3-patient-ref-service.js';
import { V3IdentityIdempotency } from '../src/v3-identity-idempotency.js';
import { V3MappingWriteService } from '../src/v3-mapping-write-service.js';
import { V3ExchangeSessionService } from '../src/v3-exchange-session-service.js';
import { V3ExchangeReadService } from '../src/v3-exchange-read-service.js';
import { createV3ExchangeHttpHandler } from '../src/v3-exchange-http-handler.js';
import { V3ExchangeCancelService } from '../src/v3-exchange-cancel-service.js';
import { v3ExchangeExpiryPolicy,prepareExchangeExpiryBatch } from '../src/v3-exchange-expiry-contract.js';
import { V3ExchangeExpiryService } from '../src/v3-exchange-expiry-service.js';
import {checkPendingProjection} from './test-support/v3-pending-projection-fixture.js';
import {checkPreauthStorage} from './test-support/v3-preauth-storage-fixture.js';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture,observeOwnedFixtureAbsence} from './test-support/owned-postgres-start.js';

const name=`hp-v3-tx-${randomUUID()}`,owner=randomUUID(),label='highpass.validation.identity-tx';
const password=randomBytes(32).toString('hex'),appPassword=randomBytes(32).toString('hex');
const ids=Array.from({length:9},()=>randomUUID());
const [ta,tb,ha,hb,actorA,actorB,patient,ma,mb]=ids;
const actorC=randomUUID();
const results=[];let admin,app,concurrentPool,mappingCrypto,sessions,server,lastDbFault,launched=false,failed=false,summary,cleanupStatus='NOT VERIFIED';
let startupObservation=null,cleanupObservations=[];
let activeHttpOperation=null;
let activeFixturePhase=null;
const maintenanceSqlPhases=[],maintenanceFaults=[];
function maintenancePhase(text){
  if(text==='BEGIN'||text==='COMMIT'||text==='ROLLBACK')return text;
  if(text.includes('FROM pg_roles r'))return 'ROLE_CHECK';
  if(text.includes('set_config'))return 'CONTEXT_CONFIG';
  if(text.includes('FROM highpass_v3.principal_bindings p'))return 'PRINCIPAL_CHECK';
  if(text.includes('count(*)::int FROM highpass_v3.patient_refs'))return 'VISIBILITY_QUERY';
  return 'OTHER';
}
const maximumHttpObservation={receivedMs:null,bodyEndedMs:null,responseFinishedMs:null,status:null};
const maximumSqlPhases=[];
function captureMaximumPhase(phase,began){
 if(activeHttpOperation==='SESSION_MAXIMUM_RESOURCES'&&maximumSqlPhases.length<64)
  maximumSqlPhases.push({phase,durationMs:Math.round(performance.now()-began)});
}
const beganAt=Date.now();
const sourceFiles=['src/v3-principal-registry.js','src/v3-tenant-transaction.js','src/v3-identity-audit.js',
  'src/v3-identifier-protection.js','src/v3-mapping-read-service.js','src/v3-mapping-read-handler.js',
  'src/auth.js','src/v3-mapping-write-contract.js','src/v3-patient-ref-service.js',
  'db/migrations/006_highpass_v3_identity.sql','db/migrations/007_highpass_v3_identity_transactions.sql',
  'db/migrations/008_highpass_v3_patient_ref_registration.sql','db/migrations/009_highpass_v3_identity_idempotency.sql',
  'src/v3-identity-idempotency.js','db/migrations/010_highpass_v3_mapping_review.sql',
  'src/v3-mapping-write-service.js','src/v3-mapping-write-handler.js','src/http-utils.js',
  'db/migrations/011_highpass_v3_exchange_foundation.sql','db/migrations/012_highpass_v3_exchange_create_authority.sql',
  'src/v3-exchange-session-contract.js','src/v3-exchange-session-service.js','scripts/v3-identity-transaction-check.js'];
sourceFiles.push('src/v3-identity-capstone-runtime.js');
sourceFiles.push('db/migrations/013_highpass_v3_exchange_read_audit.sql','db/migrations/014_highpass_v3_exchange_requested_actions.sql','src/v3-exchange-audit.js','src/v3-exchange-read-service.js');
sourceFiles.push('scripts/test-support/owned-postgres-start.js');
sourceFiles.push('src/v3-exchange-http-handler.js');
sourceFiles.push('db/migrations/015_highpass_v3_exchange_cancel_events.sql','src/v3-exchange-cancel-contract.js','src/v3-exchange-cancel-service.js');
sourceFiles.push('db/migrations/016_highpass_v3_expiry_principal.sql','src/v3-exchange-expiry-contract.js');
sourceFiles.push('db/migrations/017_highpass_v3_exchange_expiry_events.sql','src/v3-exchange-expiry-service.js');
sourceFiles.push('db/migrations/018_highpass_v3_pending_preparation_foundation.sql');
sourceFiles.push('db/migrations/019_highpass_v3_pending_source_projection.sql');
sourceFiles.push('src/v3-pending-projection.js','scripts/test-support/v3-pending-projection-fixture.js');
sourceFiles.push('db/migrations/020_highpass_v3_pending_write_authority.sql','src/v3-pending-service.js','src/v3-pending-audit.js',
 'src/v3-consent-pending-contract.js','scripts/test-support/v3-pending-write-fixture.js');
sourceFiles.push('scripts/test-support/v3-pending-adversarial-fixture.js');
sourceFiles.push('scripts/test-support/v3-pending-race-fixture.js');
sourceFiles.push('src/v3-pending-http-handler.js','scripts/test-support/v3-pending-http-fixture.js');
sourceFiles.push('src/v3-pending-secure-edge.js','src/ingress.js','scripts/test-support/v3-pending-secure-edge-fixture.js','config/pending-edge-dev-client.ext');
sourceFiles.push('src/v3-pending-network-context.js');
sourceFiles.push('src/v3-identity-runtime-router.js');
sourceFiles.push('src/v3-identity-secure-edge.js','scripts/test-support/v3-identity-secure-edge-fixture.js','config/identity-edge-dev-client.ext','tmp/certs/identity-edge/identity-proxy-dev.crt');
sourceFiles.push('src/v3-identity-capstone-proxy.js','scripts/prepare-identity-edge-dev-cert.js','tmp/certs/identity-edge/untrusted-dev.crt');
sourceFiles.push('src/v3-identity-network-context.js');
sourceFiles.push('src/v3-identity-network-audit.js','db/migrations/031_highpass_v3_identity_network_audit.sql');
sourceFiles.push('scripts/test-support/v3-identity-preauth-fixture.js');
sourceFiles.push('src/v3-identity-capstone-host.js');
sourceFiles.push('src/v3-identity-readiness.js');
sourceFiles.push('src/v3-pending-network-audit.js');
sourceFiles.push('src/v3-preauth-security-events.js');
sourceFiles.push('db/migrations/022_highpass_v3_preauth_security_events.sql','scripts/test-support/v3-preauth-storage-fixture.js');
sourceFiles.push('scripts/test-support/v3-preauth-outage-fixture.js');
sourceFiles.push('scripts/test-support/v3-preauth-http-fixture.js');
sourceFiles.push('scripts/test-support/v3-pending-network-race-fixture.js');
sourceFiles.push('db/migrations/021_highpass_v3_pending_network_audit.sql','scripts/test-support/v3-pending-network-schema-fixture.js');
// Public certificate bytes only. NEVER hash, capture or print private key files.
sourceFiles.push('tmp/certs/edge/localhost.crt','tmp/certs/mtls/ca.crt','tmp/certs/mtls/orthanc-server.crt');
sourceFiles.push('tmp/certs/pending-edge/pending-proxy-dev.crt','tmp/certs/mtls/gateway-client.crt','tmp/certs/bad/bad.crt',
 'tmp/certs/generated-fixtures/untrusted-client/untrusted-client.crt');
const sourceHashesAtStart=hashSources();
function hashSources(){return Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));}
function docker(args,timeout=15000){return spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});}
function check(name,condition){results.push({name,result:condition?'PASS':'FAIL'});if(!condition)throw new Error('CHECK_FAILED');}
async function expected(code,action){try{await action();return false;}catch(error){return error.code===code;}}
function event(mappingId){return {mappingId,auditSessionId:randomUUID(),traceId:'synthetic_tx_trace_001',action:'MAPPING_REVIEWED',
  result:'ALLOW',reasonCode:'MAPPING_REVIEW_REQUIRED',oldState:'UNVERIFIED',newState:'UNVERIFIED',mappingVersion:2};}
try{
  const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);
  if(image.status!==0)throw new Error('POSTGRES_IMAGE_UNAVAILABLE');
  startupObservation=startOwnedPostgresFixture({name,owner,label,password,docker});
  launched=startupObservation.owned;if(!launched)throw new Error('POSTGRES_START_UNAVAILABLE');
  // Resolve readiness of this same owned object even if a CLI ACK was lost.
  // Running/container existence alone is never a PostgreSQL regression PASS.
  const readyUntil=Date.now()+60000;let ready=false;
  while(Date.now()<readyUntil){
    if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','2'],4000).status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('POSTGRES_READINESS_UNAVAILABLE');
  const portOutput=docker(['port',name,'5432/tcp']);
  const match=portOutput.stdout?.trim().match(/^127\.0\.0\.1:(\d+)$/);
  if(portOutput.status!==0 || !match)throw new Error('POSTGRES_PORT_UNAVAILABLE');
  const base={host:'127.0.0.1',port:Number(match[1]),database:'postgres',connectionTimeoutMillis:3000,
    query_timeout:5000,statement_timeout:4000,options:'-c lock_timeout=3000',max:1};
  admin=new Pool({...base,user:'postgres',password,max:2});admin.on('error',()=>{});
  const migrations=['006_highpass_v3_identity.sql','007_highpass_v3_identity_transactions.sql','008_highpass_v3_patient_ref_registration.sql','009_highpass_v3_identity_idempotency.sql','010_highpass_v3_mapping_review.sql','011_highpass_v3_exchange_foundation.sql','012_highpass_v3_exchange_create_authority.sql','013_highpass_v3_exchange_read_audit.sql','014_highpass_v3_exchange_requested_actions.sql','015_highpass_v3_exchange_cancel_events.sql','016_highpass_v3_expiry_principal.sql','017_highpass_v3_exchange_expiry_events.sql'].map(file=>readFileSync(new URL(`../db/migrations/${file}`,import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/018_highpass_v3_pending_preparation_foundation.sql',import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/019_highpass_v3_pending_source_projection.sql',import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/020_highpass_v3_pending_write_authority.sql',import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/021_highpass_v3_pending_network_audit.sql',import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/022_highpass_v3_preauth_security_events.sql',import.meta.url),'utf8'));
  migrations.push(readFileSync(new URL('../db/migrations/031_highpass_v3_identity_network_audit.sql',import.meta.url),'utf8'));
  await admin.query(`BEGIN;${migrations.join('\n')}ROLLBACK;`);
  check('006 through 022 plus identity-network031 rollback leaves no v3 schema',(await admin.query("SELECT count(*)::int n FROM pg_namespace WHERE nspname='highpass_v3'")).rows[0].n===0);
  await admin.query(`BEGIN;${migrations.join('\n')}COMMIT;`);
  await admin.query(`CREATE ROLE hp_v3_app LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT hp_v3_clinical_policy TO hp_v3_app;
    GRANT USAGE ON SCHEMA highpass_v3 TO hp_v3_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA highpass_v3 TO hp_v3_app;
    GRANT UPDATE(status) ON highpass_v3.tenants,highpass_v3.hospitals,highpass_v3.principal_bindings TO hp_v3_app;
    GRANT UPDATE(version,updated_at,status,evidence_digest,verified_by,verified_at) ON highpass_v3.patient_mappings TO hp_v3_app;
    GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_v3_app;
    GRANT INSERT ON highpass_v3.identity_audit_outbox,highpass_v3.patient_refs,highpass_v3.patient_ref_registrations,highpass_v3.identity_write_results,highpass_v3.patient_mappings TO hp_v3_app;
    GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
     ON highpass_v3.identity_network_audit TO hp_v3_app;
    GRANT INSERT ON highpass_v3.exchange_sessions,highpass_v3.exchange_creation_context,highpass_v3.exchange_session_participants,
     highpass_v3.exchange_resource_scopes,highpass_v3.exchange_audit_outbox,highpass_v3.exchange_write_results TO hp_v3_app;
    GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_v3_app;
    GRANT UPDATE(state,version,updated_at) ON highpass_v3.exchange_sessions TO hp_v3_app;
    GRANT INSERT ON highpass_v3.exchange_state_events,highpass_v3.exchange_cancel_results,highpass_v3.exchange_cascade_outbox TO hp_v3_app;
    GRANT EXECUTE ON FUNCTION highpass_v3.exchange_expirer(uuid,uuid),highpass_v3.clinical_principal_context(),highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),highpass_v3.valid_exchange_actions(text[]),highpass_v3.valid_exchange_series(text[]),highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),
     highpass_v3.exchange_directory_caller() TO hp_v3_app;`);
  await admin.query('INSERT INTO highpass_v3.tenants VALUES($1,$2,$3,$4),($5,$6,$7,$8)',[ta,'SYNTH-A','SYNTHETIC A','ACTIVE',tb,'SYNTH-B','SYNTHETIC B','ACTIVE']);
  await admin.query('INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES($1,$2,$3),($4,$5,$6)',[ha,ta,'A',hb,tb,'B']);
  await admin.query('INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES($1)',[patient]);
  const crypto=new V3IdentifierProtection({encryptionKeys:new Map([['demo-v1',randomBytes(32)]]),activeKeyId:'demo-v1',lookupKey:randomBytes(32)});
  try{
    for(const [mappingId,tenantId,hospitalId] of [[ma,ta,ha],[mb,tb,hb]]){
      const context={tenantId,hospitalId,patientRefId:patient};
      const secured=crypto.verify(crypto.protect('SYNTHETIC-LOCAL-001',context),context);
      await admin.query(`INSERT INTO highpass_v3.patient_mappings(mapping_id,tenant_id,hospital_id,patient_ref,protected_local_ref,local_ref_digest)
        VALUES($1,$2,$3,$4,$5,$6)`,[mappingId,tenantId,hospitalId,patient,secured.protectedLocalRef,secured.localRefDigest]);
    }
  }finally{crypto.dispose();}
  for(const [actorId,tenantId,hospitalId] of [[actorA,ta,ha],[actorB,tb,hb],[actorC,ta,ha]]){
    await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes) VALUES($1,$2,$3,$4,$5)`,
      [actorId,tenantId,hospitalId,'HOSPITAL_ADMIN',['mapping:write','mapping:read','mapping:review','exchange:create','exchange:read','exchange:cancel','audit:read']]);
  }
  const secret=randomBytes(32).toString('hex'),issuer='synthetic-idp-tx';
  const records=[[actorA,ta,ha,'synthetic-A'],[actorB,tb,hb,'synthetic-B'],[actorC,ta,ha,'synthetic-reviewer-A']].map(([actorId,tenantId,hospitalId,subject])=>
    ({actorId,tenantId,hospitalId,subject,issuer,role:'HOSPITAL_ADMIN',authHospitalId:subject,scopes:['mapping:write','mapping:read','mapping:review','exchange:create','exchange:read','exchange:cancel','audit:read'],status:'ACTIVE'}));
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records});
  function token(index,scope='mapping:write mapping:read mapping:review'){
    const r=records[index],claims={iss:issuer,aud:'synthetic-v3',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope,exp:Math.floor(Date.now()/1000)+120};
    const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return `${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`;
  }
  function binding(index){
    return registry.resolve({headers:{authorization:`Bearer ${token(index)}`}},
      {requiredScope:'mapping:write',allowedRoles:['HOSPITAL_ADMIN']});
  }
  app=new Pool({...base,user:'hp_v3_app',password:appPassword});app.on('error',()=>{});
  // Independent storage/transport gate first; all legacy gates still run below.
  // This records targeted evidence even if the existing maximum HTTP gate fails.
  await admin.query('REVOKE ALL ON highpass_v3.preauth_security_events FROM hp_v3_app');
  await checkPreauthStorage({admin,base,clinicalPool:app,check});
  const runner=new V3TenantTransaction({pool:app});const a=binding(0),b=binding(1);
  const concurrentBackends=new Set();
  concurrentPool=new Pool({...base,user:'hp_v3_app',password:appPassword,max:2});concurrentPool.on('error',()=>{});
  concurrentPool.on('connect',client=>concurrentBackends.add(client.processID));
  const tracedPool={async connect(){const acquiredAt=performance.now();const client=await concurrentPool.connect();captureMaximumPhase('POOL_ACQUIRE',acquiredAt);return {
    async query(q){const phaseAt=performance.now();let queryFault;try{return await client.query(q);}catch(error){lastDbFault={
      code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CLIENT_FAULT',
      transportClass:/query read timeout/i.test(error.message??'')?'QUERY_READ_TIMEOUT':/timeout exceeded when trying to connect/i.test(error.message??'')?'POOL_CONNECT_TIMEOUT':undefined,
      driverErrorClass:error.name==='TypeError'?'TYPE_ERROR':/client has encountered a connection error/i.test(error.message??'')?'CLIENT_ALREADY_FAILED':/connection terminated/i.test(error.message??'')?'CONNECTION_TERMINATED':/query read timeout/i.test(error.message??'')?'QUERY_READ_TIMEOUT':'OTHER_DRIVER_ERROR',
      policyRelation:error.message?.match(/infinite recursion detected in policy for relation "(exchange_sessions|exchange_session_participants|exchange_creation_context|patient_refs|hospitals|tenants|principal_bindings)"/)?.[1],
      operation:q.text.startsWith('INSERT INTO highpass_v3.patient_mappings')?'MAPPING_INSERT':q.text==='COMMIT'?'COMMIT':
        q.text.includes('identity_audit_outbox')?'AUDIT':q.text.includes('identity_write_results')?'LEDGER':q.text.includes('exchange_sessions')?'SESSION':q.text.includes('exchange_session_participants')?'PARTICIPANT':'OTHER',
      constraint:['mapping_registration','patient_mappings_status_check','identity_write_results_check','identity_write_results_check1'].includes(error.constraint)?error.constraint:undefined};queryFault={...lastDbFault};throw error;}
      finally{if(activeFixturePhase==='MAINTENANCE_VISIBILITY'&&maintenanceSqlPhases.length<16){
        maintenanceSqlPhases.push({phase:maintenancePhase(q.text),durationMs:Math.round(performance.now()-phaseAt)});
        if(queryFault&&maintenanceFaults.length<16)maintenanceFaults.push({...queryFault,phase:maintenancePhase(q.text)});
      }
       captureMaximumPhase(q.text==='COMMIT'?'COMMIT':q.text.startsWith('INSERT INTO highpass_v3.exchange_resource_scopes')?'RESOURCE_INSERT':
       q.text.includes('FROM highpass_v3.exchange_resource_scopes')?'RESOURCE_READ':q.text.startsWith('INSERT INTO highpass_v3.exchange_write_results')?'LEDGER_INSERT':'OTHER_SQL',phaseAt);}},
    on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
  };}};
  const concurrentTransactions=new V3TenantTransaction({pool:tracedPool,deadlineMs:8000});
  const ledgerKey=randomBytes(32);
  const ledger=new V3IdentityIdempotency({transactions:concurrentTransactions,hmacKey:ledgerKey});
  const idempotentRefs=new V3PatientRefService({transactions:concurrentTransactions,idempotency:ledger});
  const [one,two]=await Promise.all([idempotentRefs.registerIdempotent(a,'synthetic_shared_key_001'),idempotentRefs.registerIdempotent(a,'synthetic_shared_key_001')]);
  check('two actual PG sessions register same scoped key exactly once',concurrentBackends.size>=2&&one.patientRefId===two.patientRefId
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_refs WHERE patient_ref=$1',[one.patientRefId])).rows[0].n===1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE patient_ref=$1',[one.patientRefId])).rows[0].n===1);
  const restarted=new V3IdentityIdempotency({transactions:concurrentTransactions,hmacKey:ledgerKey});
  const afterRestart=await restarted.run(a,'PATIENT_REF_REGISTER','synthetic_shared_key_001',{},async()=>{throw new Error('CALLBACK_MUST_NOT_RUN');});
  check('new coordinator reads durable original result after recreation',isDeepStrictEqual(one,afterRestart));
  let loseAck=true;
  const ackTransactions=new V3TenantTransaction({deadlineMs:8000,pool:{async connect(){
    const client=await concurrentPool.connect();return {
      async query(q){const result=await client.query(q);if(q.text==='COMMIT'&&loseAck){loseAck=false;throw new Error('SYNTHETIC_LOST_ACK');}return result;},
      on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
    };
  }}});
  const ackLedger=new V3IdentityIdempotency({transactions:ackTransactions,hmacKey:ledgerKey});
  const ackRefs=new V3PatientRefService({transactions:ackTransactions,idempotency:ackLedger});
  const refsBeforeAck=(await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_refs')).rows[0].n;
  check('real DB COMMIT followed by injected lost ACK returns outcome unknown',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>ackRefs.registerIdempotent(a,'synthetic_lost_ack_001')));
  const ackReplay=await idempotentRefs.registerIdempotent(a,'synthetic_lost_ack_001');
  check('same-key retry after committed unknown outcome has one resource and audit',
    (await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_refs')).rows[0].n===refsBeforeAck+1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE patient_ref=$1',[ackReplay.patientRefId])).rows[0].n===1);
  check('same key different command is conflict before callback',await expected('V3_IDEMPOTENCY_CONFLICT',()=>ledger.run(a,'PATIENT_REF_REGISTER','synthetic_shared_key_001',{different:true},async()=>{throw new Error('CALLBACK_MUST_NOT_RUN');})));
  const otherActor=await idempotentRefs.registerIdempotent(b,'synthetic_shared_key_001');
  check('same textual key scoped to foreign actor/hospital independently',otherActor.patientRefId!==one.patientRefId);
  check('no-context identity ledger is invisible',(await app.query('SELECT count(*)::int n FROM highpass_v3.identity_write_results')).rows[0].n===0);
  let ledgerImmutable=false;try{await admin.query('DELETE FROM highpass_v3.identity_write_results');}catch(error){ledgerImmutable=error.code==='42501';}
  check('identity ledger trigger prevents owner deletion',ledgerImmutable);
  const beforeFault=await admin.query('SELECT (SELECT count(*)::int FROM highpass_v3.patient_refs) r,(SELECT count(*)::int FROM highpass_v3.identity_audit_outbox) a');
  await admin.query('REVOKE INSERT ON highpass_v3.identity_write_results FROM hp_v3_app');
  check('ledger insert failure safely rejects registration',await expected('V3_DATABASE_UNAVAILABLE',()=>idempotentRefs.registerIdempotent(a,'synthetic_ledger_fault_001')));
  const afterFault=await admin.query('SELECT (SELECT count(*)::int FROM highpass_v3.patient_refs) r,(SELECT count(*)::int FROM highpass_v3.identity_audit_outbox) a');
  check('ledger fault rolls back both resource and audit',isDeepStrictEqual(beforeFault.rows,afterFault.rows));
  await admin.query('GRANT INSERT ON highpass_v3.identity_write_results TO hp_v3_app');
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=statement_timestamp() WHERE patient_ref=$1',[one.patientRefId]);
  check('replay cannot return deleted resource snapshot',await expected('V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE',()=>idempotentRefs.registerIdempotent(a,'synthetic_shared_key_001')));
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[actorB]);
  check('revoked DB principal denied on replay before ledger result',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>idempotentRefs.registerIdempotent(b,'synthetic_shared_key_001')));
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[actorB]);
  const refs=new V3PatientRefService({transactions:new V3TenantTransaction({pool:app,deadlineMs:8000})});
  const registered=await refs.register(a);
  const registration=await admin.query(`SELECT r.owner_tenant_id,r.owner_hospital_id,r.registered_by,a.action
    FROM highpass_v3.patient_refs r JOIN highpass_v3.identity_audit_outbox a ON a.patient_ref=r.patient_ref
    WHERE r.patient_ref=$1`,[registered.patientRefId]);
  check('PatientRef own-tenant registration and typed audit actually commit',registration.rows.length===1
    &&registration.rows[0].owner_tenant_id===ta&&registration.rows[0].owner_hospital_id===ha
    &&registration.rows[0].registered_by===actorA&&registration.rows[0].action==='PATIENT_REF_CREATED');
  const ownRef=await runner.run(a,'mapping:write',tx=>tx.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1',[registered.patientRefId]));
  const foreignRef=await runner.run(b,'mapping:write',tx=>tx.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1',[registered.patientRefId]));
  check('unmapped registered ref visible to own institution but not foreign',ownRef.rowCount===1&&foreignRef.rowCount===0);
  check('PatientRef no context exposes zero refs',(await app.query('SELECT count(*)::int n FROM highpass_v3.patient_refs')).rows[0].n===0);
  check('PatientRef app role cannot mutate owner or delete rows',(await admin.query(
    "SELECT has_table_privilege('hp_v3_app','highpass_v3.patient_refs','UPDATE') u,has_table_privilege('hp_v3_app','highpass_v3.patient_refs','DELETE') d")).rows.every(row=>!row.u&&!row.d));
  await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[ha]);
  let inactiveRef;
  try{
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[ta,ha,actorA]);
    inactiveRef=await app.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1',[registered.patientRefId]);
  }finally{await app.query('ROLLBACK');await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[ha]);}
  check('PatientRef owner SELECT RLS denies suspended hospital even with explicit context',inactiveRef.rowCount===0);
  check('forged PatientRef owner rejected by INSERT RLS',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:write',tx=>
    tx.query('INSERT INTO highpass_v3.patient_refs(patient_ref,owner_tenant_id,owner_hospital_id,registered_by) VALUES($1,$2,$3,$4)',[randomUUID(),tb,hb,actorA]))));
  check('foreign PatientRef audit reference rejected',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(b,'mapping:write',tx=>
    appendIdentityAudit(tx,b,{patientRefId:registered.patientRefId,auditSessionId:randomUUID(),traceId:'synthetic_ref_trace_001',
      action:'PATIENT_REF_CREATED',result:'ALLOW',reasonCode:'PATIENT_REF_REGISTERED'}))));
  const refCountBefore=(await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_refs')).rows[0].n;
  await admin.query('REVOKE INSERT ON highpass_v3.identity_audit_outbox FROM hp_v3_app');
  check('PatientRef audit fault returns safe technical failure',await expected('V3_DATABASE_UNAVAILABLE',()=>refs.register(a)));
  check('PatientRef creation rolled back on audit failure',(await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_refs')).rows[0].n===refCountBefore);
  await admin.query('GRANT INSERT ON highpass_v3.identity_audit_outbox TO hp_v3_app');
  const reviewer=binding(2);
  mappingCrypto=new V3IdentifierProtection({encryptionKeys:new Map([['mapping-test',randomBytes(32)]]),activeKeyId:'mapping-test',lookupKey:randomBytes(32)});
  const writes=new V3MappingWriteService({idempotency:ledger,protection:mappingCrypto});
  const mappingContext={tenantId:ta,hospitalId:ha,patientRefId:registered.patientRefId};
  const reconcileRequest={...mappingContext,...mappingCrypto.protect('SYNTHETIC-MAPPING-LOCAL-002',mappingContext)};
  const [created,createdRetry]=await Promise.all([writes.reconcile(a,'synthetic_mapping_create_001',reconcileRequest),writes.reconcile(a,'synthetic_mapping_create_001',reconcileRequest)]);
  check('mapping concurrent create starts UNVERIFIED with one maker and one audit',created.state==='UNVERIFIED'&&created.version===1&&created.mappingId===createdRetry.mappingId
    &&(await admin.query('SELECT registered_by FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].registered_by===actorA
    &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE mapping_id=$1 AND action='MAPPING_CREATED'",[created.mappingId])).rows[0].n===1);
  const reviewedCommand={expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')};
  check('mapping maker self-review commits DENY without changing version',await expected('V3_MAPPING_SELF_REVIEW',()=>writes.review(a,'synthetic_self_review_001',created.mappingId,reviewedCommand))
    &&(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version===1);
  const reviewed=await writes.review(reviewer,'synthetic_mapping_review_001',created.mappingId,reviewedCommand);
  const reviewedRetry=await writes.review(reviewer,'synthetic_mapping_review_001',created.mappingId,reviewedCommand);
  check('independent reviewer verifies once and idempotent retry does not increment',reviewed.state==='VERIFIED'&&reviewed.version===2&&isDeepStrictEqual(reviewed,reviewedRetry)
    &&(await admin.query('SELECT verified_by FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].verified_by===actorC);
  check('stale mapping review commits DENY and preserves current version',await expected('V3_MAPPING_VERSION_CONFLICT',()=>writes.review(reviewer,'synthetic_stale_review_001',created.mappingId,reviewedCommand))
    &&(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version===2);
  const competing=await Promise.allSettled(['NO_MATCH','MULTIPLE_MATCH'].map((state,index)=>writes.review(reviewer,`synthetic_competing_review_00${index}`,created.mappingId,
    {expectedVersion:2,state,evidenceDigest:randomBytes(32).toString('base64url')})));
  check('competing reviewer versions produce one commit and one stale DENY',competing.filter(r=>r.status==='fulfilled').length===1
    &&competing.some(r=>r.status==='rejected'&&r.reason.code==='V3_MAPPING_VERSION_CONFLICT'));
  for(const state of ['NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED']){
    const before=(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version;
    const result=await writes.review(reviewer,`synthetic_state_${state}_001`,created.mappingId,{expectedVersion:before,state,evidenceDigest:randomBytes(32).toString('base64url')});
    const physical=(await admin.query('SELECT status,version,verified_by,verified_at FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0];
    check(`review transition ${state} versions and verifier fields`,result.version===before+1&&physical.status===state
      &&(state==='VERIFIED'?physical.verified_by===actorC&&physical.verified_at!==null:physical.verified_by===null&&physical.verified_at===null));
  }
  const versionBeforeFault=(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version;
  await admin.query('REVOKE INSERT ON highpass_v3.identity_audit_outbox FROM hp_v3_app');
  check('review audit failure rolls back mapping version and state',await expected('V3_DATABASE_UNAVAILABLE',()=>writes.review(reviewer,'synthetic_review_audit_fault',created.mappingId,
    {expectedVersion:versionBeforeFault,state:'UNVERIFIED',evidenceDigest:randomBytes(32).toString('base64url')}))
    &&(await admin.query('SELECT version,status FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows.every(r=>r.version===versionBeforeFault&&r.status==='VERIFIED'));
  await admin.query('GRANT INSERT ON highpass_v3.identity_audit_outbox TO hp_v3_app');
  const competingRef=await idempotentRefs.registerIdempotent(a,'synthetic_other_patient_001');
  const conflictContext={...mappingContext,patientRefId:competingRef.patientRefId};
  const conflictRequest={...conflictContext,...mappingCrypto.protect('SYNTHETIC-MAPPING-LOCAL-002',conflictContext)};
  check('same local digest different PatientRef commits conflict DENY, never merges',await expected('V3_MAPPING_IDENTITY_CONFLICT',()=>writes.reconcile(a,'synthetic_mapping_conflict_001',conflictRequest))
    &&(await admin.query('SELECT status,patient_ref,verified_by FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows.every(r=>r.status==='IDENTITY_CONFLICT'&&r.patient_ref===registered.patientRefId&&r.verified_by===null));
  const conflictVersion=(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version;
  check('repeated denied collision does not increment version again',await expected('V3_MAPPING_IDENTITY_CONFLICT',()=>writes.reconcile(a,'synthetic_mapping_conflict_001',conflictRequest))
    &&(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[created.mappingId])).rows[0].version===conflictVersion);
  check('foreign/missing mapping review both commit safe 404 DENY',await expected('V3_MAPPING_NOT_FOUND',()=>writes.review(b,'synthetic_foreign_review_001',created.mappingId,reviewedCommand))
    &&await expected('V3_MAPPING_NOT_FOUND',()=>writes.review(reviewer,'synthetic_missing_review_001',randomUUID(),reviewedCommand)));
  check('direct SQL maker verification refused by DB guard',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:review',tx=>tx.query(`UPDATE highpass_v3.patient_mappings
    SET status='VERIFIED',version=version+1,evidence_digest=$2,verified_by=$3,verified_at=statement_timestamp()
    WHERE mapping_id=$1`,[created.mappingId,randomBytes(32),actorA]))));
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=statement_timestamp() WHERE patient_ref=$1',[registered.patientRefId]);
  check('old reviewed snapshot denied when linked PatientRef is deleted',await expected('V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE',()=>writes.review(reviewer,'synthetic_mapping_review_001',created.mappingId,reviewedCommand)));
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[registered.patientRefId]);
  const legacyOwned=randomUUID(),legacyContext={...mappingContext};
  const legacyEnvelope=mappingCrypto.verify(mappingCrypto.protect('SYNTHETIC-LEGACY-UNASSIGNED-003',legacyContext),legacyContext);
  await admin.query(`INSERT INTO highpass_v3.patient_mappings(mapping_id,tenant_id,hospital_id,patient_ref,protected_local_ref,local_ref_digest)
    VALUES($1,$2,$3,$4,$5,$6)`,[legacyOwned,ta,ha,registered.patientRefId,legacyEnvelope.protectedLocalRef,legacyEnvelope.localRefDigest]);
  check('legacy mapping without recorded maker cannot be approved',await expected('V3_MAPPING_REGISTRATION_REQUIRED',()=>writes.review(reviewer,'synthetic_unassigned_maker_001',legacyOwned,reviewedCommand)));
  const auditScope=await admin.query(`SELECT count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE mapping_id=$1
    AND action='MAPPING_REVIEWED' AND old_state IS NOT NULL AND new_state IS NOT NULL AND evidence_digest IS NOT NULL AND actor_id=$2`,[created.mappingId,actorC]);
  check('review audits retain actor old/new states versions and evidence',auditScope.rows[0].n===7);
  const unauditedId=randomUUID();
  const checkedEnvelope=mappingCrypto.verify(reconcileRequest,mappingContext);
  check('new mapping INSERT without audit cannot COMMIT',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>runner.run(a,'mapping:write',tx=>tx.query(`INSERT INTO highpass_v3.patient_mappings
    (mapping_id,tenant_id,hospital_id,patient_ref,protected_local_ref,local_ref_digest,registered_by,evidence_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[unauditedId,ta,ha,registered.patientRefId,checkedEnvelope.protectedLocalRef,randomBytes(32),actorA,randomBytes(32)])))
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[unauditedId])).rows[0].n===0);
  const read=async tx=>(await tx.query(`SELECT pg_backend_pid() pid,count(*)::int n FROM highpass_v3.patient_mappings m
    JOIN highpass_v3.hospitals h USING(tenant_id,hospital_id)`)).rows[0];
  const first=await runner.run(a,'mapping:write',read),second=await runner.run(b,'mapping:write',read);
  check('actual pg Pool max1 reused backend across A/B with scoped join',first.pid===second.pid && first.n===3 && second.n===1);
  check('same pool without context sees no mapping or actor',(await app.query('SELECT (SELECT count(*)::int FROM highpass_v3.patient_mappings) n,(SELECT count(*)::int FROM highpass_v3.principal_bindings) p')).rows.every(row=>row.n===0&&row.p===0));
  const contextAfter=await app.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant,nullif(current_setting('app.actor_id',true),'') actor");
  check('SET LOCAL values removed after commit',contextAfter.rows[0].tenant===null&&contextAfter.rows[0].actor===null);
  check('row-lock UPDATE privilege cannot change registry due to WITH CHECK(false)',
    await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:write',tx=>tx.query("UPDATE highpass_v3.tenants SET status='REVOKED' WHERE tenant_id=$1 RETURNING tenant_id",[ta])))
    && (await admin.query('SELECT status FROM highpass_v3.tenants WHERE tenant_id=$1',[ta])).rows[0].status==='ACTIVE');
  const foreignWrites=await runner.run(a,'mapping:write',tx=>tx.query('UPDATE highpass_v3.patient_mappings SET version=version+1 WHERE mapping_id=$1 RETURNING mapping_id',[mb]));
  check('foreign mapping UPDATE has zero side effects',foreignWrites.rowCount===0);
  await runner.run(a,'mapping:write',async tx=>{
    await tx.query('UPDATE highpass_v3.patient_mappings SET version=2,updated_at=statement_timestamp() WHERE mapping_id=$1',[ma]);
    await appendIdentityAudit(tx,a,event(ma));
  });
  const committed=await admin.query(`SELECT (SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1) version,
    (SELECT count(*)::int FROM highpass_v3.identity_audit_outbox WHERE mapping_id=$1) audits`,[ma]);
  check('mapping mutation and audit commit together',committed.rows[0].version===2&&committed.rows[0].audits===1);
  check('foreign mapping audit insert fails closed',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:write',tx=>appendIdentityAudit(tx,a,event(mb)))));
  check('fabricated mapping audit version fails closed',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:write',tx=>appendIdentityAudit(tx,a,{...event(ma),mappingVersion:99}))));
  check('app audit UPDATE/DELETE privileges absent',(await admin.query("SELECT has_table_privilege('hp_v3_app','highpass_v3.identity_audit_outbox','UPDATE') u,has_table_privilege('hp_v3_app','highpass_v3.identity_audit_outbox','DELETE') d")).rows.every(row=>!row.u&&!row.d));
  let immutable=false;try{await admin.query('DELETE FROM highpass_v3.identity_audit_outbox');}catch(error){immutable=error.code==='42501';}
  check('audit mutation trigger rejects even owner delete',immutable);
  await admin.query('REVOKE INSERT ON highpass_v3.identity_audit_outbox FROM hp_v3_app');
  check('audit fault denies whole transaction',await expected('V3_DATABASE_UNAVAILABLE',()=>runner.run(a,'mapping:write',async tx=>{
    await tx.query('UPDATE highpass_v3.patient_mappings SET version=3 WHERE mapping_id=$1',[ma]);await appendIdentityAudit(tx,a,{...event(ma),mappingVersion:3});
  })));
  check('failed audit rolled back mapping version',(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[ma])).rows[0].version===2);
  await admin.query('GRANT INSERT ON highpass_v3.identity_audit_outbox TO hp_v3_app');
  check('context removed after rollback',(await app.query("SELECT nullif(current_setting('app.tenant_id',true),'') t")).rows[0].t===null);
  for(const [table,column,id] of [['principal_bindings','actor_id',actorA],['tenants','tenant_id',ta],['hospitals','hospital_id',ha]]){
    await admin.query(`UPDATE highpass_v3.${table} SET status='REVOKED' WHERE ${column}=$1`,[id]);
    let invoked=false;
    check(`${table} revoked denies before callback`,await expected('V3_DB_PRINCIPAL_INACTIVE',()=>runner.run(a,'mapping:write',async()=>{invoked=true;}))&&!invoked);
    await admin.query(`UPDATE highpass_v3.${table} SET status='ACTIVE' WHERE ${column}=$1`,[id]);
  }
  let unlock,readyOperation;
  const operationReady=new Promise(resolve=>{readyOperation=resolve;});
  const held=runner.run(a,'mapping:write',async()=>{readyOperation();await new Promise(resolve=>{unlock=resolve;});});
  await operationReady;
  let revokeError;
  const revoking=admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[actorA])
    .catch(error=>{revokeError=error.code;});
  let waiting=false;
  try{
    const waitUntil=Date.now()+1500;
    while(Date.now()<waitUntil){
      const status=await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE query LIKE 'UPDATE highpass_v3.principal_bindings SET status=%' AND wait_event_type='Lock'");
      if(status.rows[0].n>0){waiting=true;break;}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }finally{unlock();await held;await revoking;}
  check('concurrent revocation waits on actual PostgreSQL row lock',waiting&&!revokeError);
  check('next transaction denied after concurrent revocation commits',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>runner.run(a,'mapping:write',async()=>{})));
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[actorA]);
  const beforeTimeout=await runner.run(a,'mapping:write',async tx=>(await tx.query('SELECT pg_backend_pid() pid')).rows[0].pid);
  const limited=new V3TenantTransaction({pool:app,deadlineMs:150,queryMs:100});let closed;
  check('hung callback hits finite deadline',await expected('V3_TRANSACTION_DEADLINE',()=>limited.run(a,'mapping:write',async tx=>{
    closed=tx;await tx.query('UPDATE highpass_v3.patient_mappings SET version=4 WHERE mapping_id=$1',[ma]);await new Promise(()=>{});
  })));
  check('captured query facade cannot execute after timeout',await expected('V3_TRANSACTION_CLOSED',()=>closed.query('SELECT 1')));
  const afterTimeout=await runner.run(a,'mapping:write',async tx=>(await tx.query('SELECT pg_backend_pid() pid')).rows[0].pid);
  check('timed-out connection destroyed; new backend and unchanged mapping',beforeTimeout!==afterTimeout && (await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[ma])).rows[0].version===2);
  const closedPool=new Pool({...base,user:'hp_v3_app',password:appPassword});await closedPool.end();
  check('unavailable pool is technical failure, not policy DENY',await expected('V3_DATABASE_UNAVAILABLE',()=>new V3TenantTransaction({pool:closedPool}).run(a,'mapping:write',async()=>{})));
  check('schema owner pool explicitly refused',await expected('V3_DATABASE_ROLE_UNSAFE',()=>new V3TenantTransaction({pool:admin}).run(a,'mapping:write',async()=>{})));
  check('stalled SQL query fails within configured budget',await expected('V3_DATABASE_UNAVAILABLE',()=>new V3TenantTransaction({pool:app,deadlineMs:2000,queryMs:100}).run(a,'mapping:write',tx=>tx.query('SELECT pg_sleep(2)'))));
  let readyFault;
  const faultReady=new Promise(resolve=>{readyFault=resolve;});
  const faulted=runner.run(a,'mapping:write',async tx=>{
    const pid=(await tx.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await tx.query('UPDATE highpass_v3.patient_mappings SET version=7 WHERE mapping_id=$1',[ma]);
    readyFault(pid);await new Promise(()=>{});
  });
  const faultDenied=expected('V3_DATABASE_UNAVAILABLE',()=>faulted);
  const ownPid=await faultReady;await admin.query('SELECT pg_terminate_backend($1)',[ownPid]);
  check('actual borrowed-client backend termination safely fails closed',await faultDenied);
  check('terminated backend rolls back own mapping mutation',(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[ma])).rows[0].version===2);

  const identityRouter=createV3IdentityRuntimeRouter({mode:'CAPSTONE_SYNTHETIC_ONLY',registry,
    readService:new V3MappingReadService({transactions:new V3TenantTransaction({pool:app,deadlineMs:8000})}),writeService:writes});
  let exchangeHandler;
  server=createServer((req,res)=>{
    if(req.headers['idempotency-key']==='synthetic.session:maximum-001'){
      maximumHttpObservation.receivedMs=Date.now()-beganAt;
      req.once('end',()=>{maximumHttpObservation.bodyEndedMs=Date.now()-beganAt;});
      res.once('finish',()=>{maximumHttpObservation.responseFinishedMs=Date.now()-beganAt;maximumHttpObservation.status=res.statusCode;});
    }
    if(exchangeHandler&&req.url?.startsWith('/api/v3/exchange-sessions'))return exchangeHandler(req,res);
    return identityRouter.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}});
  });server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=8000;server.keepAliveTimeout=1000;
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function get(id,bearer=token(0),suffix=''){
    const response=await fetch(`${origin}/api/v3/patient-mappings/${id}${suffix}`,{
      headers:bearer?{authorization:`Bearer ${bearer}`}:{},signal:AbortSignal.timeout(5000)});
    return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
  }
  const beforeReadAudit=await admin.query("SELECT result,count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE action IN ('MAPPING_READ','MAPPING_DENIED') GROUP BY result");
  const own=await get(ma);
  const allowed=['mappingId','patientRefId','tenantId','hospitalId','state','version','createdAt','updatedAt'];
  check('actual loopback metadata GET returns own mapping whitelist and no-store',own.status===200&&own.cache==='no-store'
    && Object.keys(own.body).every(key=>allowed.includes(key))&&own.body.mappingId===ma&&own.body.version===2
    && !JSON.stringify(own.body).includes('SYNTHETIC-LOCAL-001'));
  const outside=await get(mb),missing=await get(randomUUID());
  check('foreign and missing mapping HTTP both 404 with identical safe code',outside.status===404&&missing.status===404
    &&outside.body.code==='V3_MAPPING_NOT_FOUND'&&missing.body.code===outside.body.code);
  const auditReads=await admin.query("SELECT result,count(*)::int n FROM highpass_v3.identity_audit_outbox WHERE action IN ('MAPPING_READ','MAPPING_DENIED') GROUP BY result");
  const priorAuditCount=result=>beforeReadAudit.rows.find(row=>row.result===result)?.n??0;
  check('metadata GET ALLOW and two 404 DENY events actually committed',auditReads.rows.some(row=>row.result==='ALLOW'&&row.n-priorAuditCount('ALLOW')===1)&&auditReads.rows.some(row=>row.result==='DENY'&&row.n-priorAuditCount('DENY')===2));
  const noToken=await get(ma,null),noScope=await get(ma,token(0,'mapping:write'));
  check('metadata GET unauthenticated 401 and no-read-scope 403',noToken.status===401&&noScope.status===403&&noScope.body.code==='V3_SCOPE_NOT_ALLOWED');
  const queryAttempt=await get(ma,token(0),'?token=SYNTHETIC-MUST-NOT-REFLECT');
  check('URL query token rejected and not reflected in error',queryAttempt.status===422&&!JSON.stringify(queryAttempt.body).includes('SYNTHETIC-MUST-NOT-REFLECT'));
  await admin.query('REVOKE INSERT ON highpass_v3.identity_audit_outbox FROM hp_v3_app');
  const failedAudit=await get(ma);
  check('metadata GET audit failure returns safe 503 without metadata',failedAudit.status===503
    &&failedAudit.body.code==='V3_DATABASE_UNAVAILABLE'&&!('mappingId' in failedAudit.body)&&!JSON.stringify(failedAudit.body).includes('permission denied'));
  await admin.query('GRANT INSERT ON highpass_v3.identity_audit_outbox TO hp_v3_app');
  async function post(route,body,key,bearer=token(0),extra={}){
    const response=await fetch(origin+route,{method:'POST',headers:{authorization:`Bearer ${bearer}`,
      'content-type':'application/json','idempotency-key':key,'x-audit-session-id':randomUUID(),...extra},
      body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
  }
  const route='/api/v3/patient-mappings/reconcile';
  const httpProtected=mappingCrypto.protect('SYNTHETIC-HTTP-LOCAL-001',{tenantId:ta,hospitalId:ha,patientRefId:registered.patientRefId});
  const httpCommand={patientRefId:registered.patientRefId,tenantId:ta,hospitalId:ha,...httpProtected};
  const httpCreated=await post(route,httpCommand,'synthetic.http:create-001');
  check('HTTP reconcile 201 safe metadata/no-store with real PG',httpCreated.status===201&&httpCreated.cache==='no-store'
    &&httpCreated.body.state==='UNVERIFIED'&&httpCreated.body.version===1&&!('protectedLocalRef' in httpCreated.body));
  const httpRetry=await post(route,httpCommand,'synthetic.http:create-001');
  check('HTTP retry returns same durable result',httpRetry.status===201&&isDeepStrictEqual(httpCreated.body,httpRetry.body));
  const changed=await post(route,{...httpCommand,patientRefId:randomUUID()},'synthetic.http:create-001');
  // The altered protected context is invalid before idempotency; use another valid envelope instead.
  check('HTTP mismatched encrypted context fails before mutation',changed.status===422);
  const alternate={...httpCommand,...mappingCrypto.protect('SYNTHETIC-HTTP-LOCAL-002',{tenantId:ta,hospitalId:ha,patientRefId:registered.patientRefId})};
  const conflict=await post(route,alternate,'synthetic.http:create-001');
  check('HTTP same key different valid command conflicts',conflict.status===409&&conflict.body.code==='V3_IDEMPOTENCY_CONFLICT');
  const reviewRoute=`/api/v3/patient-mappings/${httpCreated.body.mappingId}/reviews`;
  const reviewCommand={expectedVersion:1,state:'VERIFIED',evidenceDigest:randomBytes(32).toString('base64url')};
  const selfHttp=await post(reviewRoute,reviewCommand,'synthetic.http:self-001');
  const reviewerHttp=await post(reviewRoute,reviewCommand,'synthetic.http:review-001',token(2));
  const reviewerRetry=await post(reviewRoute,reviewCommand,'synthetic.http:review-001',token(2));
  check('HTTP maker denied and separate reviewer verifies with durable retry',selfHttp.status===403&&selfHttp.body.code==='V3_MAPPING_SELF_REVIEW'
    &&reviewerHttp.status===200&&reviewerHttp.body.version===2&&isDeepStrictEqual(reviewerHttp.body,reviewerRetry.body));
  const staleHttp=await post(reviewRoute,reviewCommand,'synthetic.http:stale-001',token(2));
  const foreignHttp=await post(reviewRoute,reviewCommand,'synthetic.http:foreign-001',token(1));
  const missingHttp=await post(`/api/v3/patient-mappings/${randomUUID()}/reviews`,reviewCommand,'synthetic.http:missing-001',token(1));
  check('HTTP stale version 409 and foreign/missing uniform 404',staleHttp.status===409&&foreignHttp.status===404&&missingHttp.status===404&&foreignHttp.body.code===missingHttp.body.code);
  // Exact source fixture ID, isolated DB only: no live mapping, legacy-patient merge or clinical approval.
  const phantomRef=await idempotentRefs.registerIdempotent(a,'synthetic.phantom:ref-001');
  const phantomProtection=mappingCrypto.protect('HP-TEST-PHANTOM-001',{tenantId:ta,hospitalId:ha,patientRefId:phantomRef.patientRefId});
  const phantomCreated=await post(route,{patientRefId:phantomRef.patientRefId,tenantId:ta,hospitalId:ha,...phantomProtection},'synthetic.phantom:reconcile-001');
  check('composed router registers phantom mapping UNVERIFIED in isolated actual PG',phantomCreated.status===201&&phantomCreated.body.state==='UNVERIFIED'&&phantomCreated.body.patientRefId===phantomRef.patientRefId);
  const phantomReview={expectedVersion:1,state:'VERIFIED',evidenceDigest:createHash('sha256').update('SYNTHETIC PHANTOM TEST MAPPING ONLY NOT HUMAN REVIEW').digest('base64url')};
  const phantomReviewPath=`/api/v3/patient-mappings/${phantomCreated.body.mappingId}/reviews`;
  const phantomSelf=await post(phantomReviewPath,phantomReview,'synthetic.phantom:self-001');
  const phantomVerified=await post(phantomReviewPath,phantomReview,'synthetic.phantom:review-001',token(2));
  check('composed router phantom maker denied; distinct synthetic reviewer verifies',phantomSelf.status===403&&phantomSelf.body.code==='V3_MAPPING_SELF_REVIEW'&&phantomVerified.status===200&&phantomVerified.body.state==='VERIFIED'&&phantomVerified.body.version===2);
  const phantomMetadata=await get(phantomCreated.body.mappingId),phantomForeign=await get(phantomCreated.body.mappingId,token(1));
  check('composed router phantom metadata excludes local identifier and foreign tenant denies',phantomMetadata.status===200&&phantomMetadata.body.state==='VERIFIED'&&phantomForeign.status===404&&!JSON.stringify(phantomMetadata.body).includes('HP-TEST-PHANTOM-001')&&!('protectedLocalRef' in phantomMetadata.body));
  const storedPhantom=await admin.query('SELECT protected_local_ref FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[phantomCreated.body.mappingId]);
  check('phantom local identifier persisted only as protected bytes',storedPhantom.rows.length===1&&!storedPhantom.rows[0].protected_local_ref.includes(Buffer.from('HP-TEST-PHANTOM-001')));
  await checkIdentitySecureEdge({admin,base,registry,protection:mappingCrypto,
    transactions:new V3TenantTransaction({pool:app,deadlineMs:8000}),pool:concurrentPool,issueToken:token,mappingId:phantomCreated.body.mappingId,command:{patientRefId:phantomRef.patientRefId,tenantId:ta,hospitalId:ha,...phantomProtection},check});
  for(const [label,body,extra,status] of [
    ['invalid JSON','{',{},422],['body too large','x'.repeat(16385),{},413],
    ['unsupported type','{}',{'content-type':'text/plain'},415],['missing key','{}',{'idempotency-key':''},422],
    ['missing audit','{}',{'x-audit-session-id':''},422],['encoded body','{}',{'content-encoding':'gzip'},415],
    ['unauthenticated','{}',{authorization:''},401]]){
    const denied=await post(route,body,'synthetic.http:boundary-001',token(0),extra);
    check(`HTTP ${label} safe denial`,denied.status===status&&denied.cache==='no-store'&&!('mappingId' in denied.body));
  }
  const scopeHttp=await post(reviewRoute,reviewCommand,'synthetic.http:scope-001',token(0,'mapping:write'));
  const queryHttp=await post(route+'?token=SYNTHETIC-PRIVATE',httpCommand,'synthetic.http:query-001');
  check('HTTP review scope and query token rejected without reflection',scopeHttp.status===403&&queryHttp.status===422&&!JSON.stringify(queryHttp.body).includes('SYNTHETIC-PRIVATE'));
  async function rawPost({duplicate=false,slow=false}={}){
    return new Promise((resolve,reject)=>{
      const req=httpRequest(origin+route,{method:'POST',headers:{authorization:`Bearer ${token(0)}`,
        'content-type':'application/json','idempotency-key':duplicate?['synthetic.http:dup-001','synthetic.http:dup-002']:'synthetic.http:slow-001',
        'x-audit-session-id':randomUUID()}},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));
        res.once('error',reject);res.once('end',()=>{clearTimeout(timer);req.destroy();try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('CHECK_FAILED'));}});
      });
      const timer=setTimeout(()=>req.destroy(new Error('CHECK_FAILED')),7000);
      req.once('error',error=>{clearTimeout(timer);reject(error);});
      if(slow){req.flushHeaders();req.write('{');}else req.end('{}');
    });
  }
  const duplicateHttp=await rawPost({duplicate:true}),slowHttp=await rawPost({slow:true});
  check('actual duplicate security header denied without reflection',duplicateHttp.status===422&&duplicateHttp.body.code==='V3_DUPLICATE_HEADER'&&!JSON.stringify(duplicateHttp.body).includes('synthetic.http:dup'));
  check('actual incomplete body deadline returns safe 408',slowHttp.status===408&&slowHttp.body.code==='V3_BODY_TIMEOUT');
  await admin.query('REVOKE INSERT ON highpass_v3.identity_audit_outbox FROM hp_v3_app');
  const auditHttp=await post(reviewRoute,{...reviewCommand,expectedVersion:2,state:'UNVERIFIED'},'synthetic.http:audit-001',token(2));
  check('HTTP audit fault safe 503 and mutation rollback',auditHttp.status===503&&!('mappingId' in auditHttp.body)
    &&(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[httpCreated.body.mappingId])).rows[0].version===2);
  await admin.query('GRANT INSERT ON highpass_v3.identity_audit_outbox TO hp_v3_app');
  const createBinding=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:create exchange:read')}`}},
    {requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
  const sessionKey=randomBytes(32);
  sessions=new V3ExchangeSessionService({transactions:concurrentTransactions,hmacKey:sessionKey,maxLifetimeMs:3600000});
  const sessionRequest={patientRefId:registered.patientRefId,ownerTenantId:ta,sourceHospitalId:ha,targetHospitalId:hb,requesterId:actorA,
    purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',validUntil:new Date(Date.now()+600000).toISOString(),
    resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.1']},{studyInstanceUid:'1.2.3'}],requestedActions:['study:view']};
  const [sessionOne,sessionTwo]=await Promise.all([sessions.create(createBinding,'synthetic.session:create-001',sessionRequest),sessions.create(createBinding,'synthetic.session:create-001',sessionRequest)]);
  check('actual nonowner Session concurrent create returns one REQUESTED snapshot',isDeepStrictEqual(sessionOne,sessionTwo)&&sessionOne.state==='REQUESTED'&&sessionOne.version===1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n===1
    &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE action='SESSION_CREATED'")).rows[0].n===1);
  check('Session selected scopes produce verified hash and no private fields',sessionOne.resources.length===2&&!('resourceSnapshotDigest' in sessionOne)&&!('targetTenantId' in sessionOne));
  const originalSessionLedger=(await admin.query('SELECT response_state,response_version,response_created_at FROM highpass_v3.exchange_write_results WHERE session_id=$1',[sessionOne.sessionId])).rows[0];
  check('Session same key different command conflicts',await expected('V3_SESSION_IDEMPOTENCY_CONFLICT',()=>sessions.create(createBinding,'synthetic.session:create-001',{...sessionRequest,purpose:'SECOND_OPINION'})));
  const invited=await runner.run(b,'mapping:read',tx=>tx.query('SELECT session_id FROM highpass_v3.exchange_sessions'));
  check('invited destination still sees no created Session',invited.rows.length===0);
  const deniedRef=await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:foreign-001',{...sessionRequest,patientRefId:randomUUID()}));
  check('missing source ref commits DENY audit without Session mutation',deniedRef
    &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE reason_code='SOURCE_REF_UNAVAILABLE'")).rows[0].n===1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n===1);
  await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_app');
  check('actual Session audit fault returns safe database failure',await expected('V3_DATABASE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:audit-001',sessionRequest)));
  check('Session audit fault rolls back all new Session/scope/context/result rows',(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n===1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_creation_context')).rows[0].n===1
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_write_results')).rows[0].n===1);
  await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_app');
  await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[hb]);
  check('target suspension denies idempotent Session replay',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:create-001',sessionRequest)));
  await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[hb]);
  check('target restored replay retains same original metadata',isDeepStrictEqual(sessionOne,await sessions.create(createBinding,'synthetic.session:create-001',sessionRequest)));
  const noContext=await app.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions');
  check('pooled Session context does not leak after commit',noContext.rows[0].n===0);
  const patientActor=randomUUID(),patientRecord={actorId:patientActor,tenantId:ta,hospitalId:ha,patientRefId:registered.patientRefId,
    issuer,subject:'synthetic-session-patient',role:'PATIENT',authHospitalId:'synthetic-A',scopes:['exchange:create','exchange:read','exchange:cancel'],status:'ACTIVE'};
  await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,patient_ref)
    VALUES($1,$2,$3,'PATIENT',$4,$5)`,[patientActor,ta,ha,patientRecord.scopes,registered.patientRefId]);
  const patientRegistry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[patientRecord]});
  const patientInput=[{alg:'HS256'},{iss:issuer,aud:'synthetic-v3',sub:patientRecord.subject,role:'PATIENT',hospitalId:'synthetic-A',patientId:'SYNTHETIC-PATIENT',
    scope:'exchange:create exchange:read exchange:cancel',exp:Math.floor(Date.now()/1000)+60}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const patientBinding=patientRegistry.resolve({headers:{authorization:`Bearer ${patientInput}.${createHmac('sha256',secret).update(patientInput).digest('base64url')}`}},
    {requiredScope:'exchange:create',allowedRoles:['PATIENT']});
  const patientRequest={...sessionRequest,requesterId:patientActor,initiationType:'PATIENT_INITIATED'};
  const patientSession=await sessions.create(patientBinding,'synthetic.session:patient-001',patientRequest);
  check('actual nonowner patient initiation uses persistent bound ref without clinical consent',patientSession.initiationType==='PATIENT_INITIATED'
    &&patientSession.requesterId===patientActor&&patientSession.state==='REQUESTED');
  const patientAudit=await concurrentTransactions.run(patientBinding,'exchange:create',tx=>tx.query('SELECT event_id FROM highpass_v3.exchange_audit_outbox'));
  check('patient creation does not unlock administrator audit reads',patientAudit.rows.length===0);
  check('patient cannot choose another ref',await expected('V3_SESSION_PATIENT_MISMATCH',()=>sessions.create(patientBinding,'synthetic.session:patient-forged-001',{...patientRequest,patientRefId:randomUUID()})));
  // Use another existing synthetic ref to test persistent binding drift.
  await admin.query('UPDATE highpass_v3.principal_bindings SET patient_ref=$1 WHERE actor_id=$2',[patient,patientActor]);
  check('changed persistent patient binding denies replay',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>sessions.create(patientBinding,'synthetic.session:patient-001',patientRequest)));
  const appendDenied=await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>concurrentTransactions.run(createBinding,'exchange:create',tx=>
    tx.query(`INSERT INTO highpass_v3.exchange_resource_scopes VALUES($1,3,'1.2.5',true,NULL)`,[sessionOne.sessionId])));
  check('nonowner raw snapshot append fails exact deferred constraint and rolls back',appendDenied&&lastDbFault?.code==='23514'
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1',[sessionOne.sessionId])).rows[0].n===2);
  const recipientBinding=registry.resolve({headers:{authorization:`Bearer ${token(1,'exchange:create')}`}},
    {requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
  const invitedWriteDenied=await expected('V3_DATABASE_UNAVAILABLE',()=>concurrentTransactions.run(recipientBinding,'exchange:create',tx=>
    tx.query(`INSERT INTO highpass_v3.exchange_session_participants VALUES($1,$2,$3,$4,'DESTINATION','INVITED')`,[sessionOne.sessionId,registered.patientRefId,tb,hb])));
  check('nonowner invited recipient cannot self-insert participation',invitedWriteDenied&&lastDbFault?.code==='42501');
  loseAck=true;
  const sessionAck=new V3ExchangeSessionService({transactions:ackTransactions,hmacKey:sessionKey,maxLifetimeMs:3600000});
  const beforeSessionAck=(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n;
  try{
    check('Session real COMMIT with injected lost ACK is outcome unknown',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>sessionAck.create(createBinding,'synthetic.session:ack-001',sessionRequest)));
    const ackSession=await sessions.create(createBinding,'synthetic.session:ack-001',sessionRequest);
    check('Session lost ACK retry has one committed resource and creation audit',
      (await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions')).rows[0].n===beforeSessionAck+1
      &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE session_id=$1 AND action='SESSION_CREATED'",[ackSession.sessionId])).rows[0].n===1);
  }finally{sessionAck.dispose();}
  const reads=new V3ExchangeReadService({transactions:concurrentTransactions});
  const patientRead=patientRegistry.resolve({headers:{authorization:`Bearer ${patientInput}.${createHmac('sha256',secret).update(patientInput).digest('base64url')}`}},
    {requiredScope:'exchange:read',allowedRoles:['PATIENT']});
  check('changed persistent patient binding denies metadata read',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>reads.get(patientRead,patientSession.sessionId)));
  await admin.query('UPDATE highpass_v3.principal_bindings SET patient_ref=$1 WHERE actor_id=$2',[registered.patientRefId,patientActor]);
  check('actual patient reads bound Session metadata',isDeepStrictEqual(await reads.get(patientRead,patientSession.sessionId),patientSession));
  check('patient metadata read does not expose administrator audit',
    (await concurrentTransactions.run(patientRead,'exchange:read',tx=>tx.query('SELECT event_id FROM highpass_v3.exchange_audit_outbox'))).rows.length===0);
  const readBinding=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:read')}`}},
    {requiredScope:'exchange:read',allowedRoles:['HOSPITAL_ADMIN']});
  const recipientRead=registry.resolve({headers:{authorization:`Bearer ${token(1,'exchange:read')}`}},
    {requiredScope:'exchange:read',allowedRoles:['HOSPITAL_ADMIN']});
  check('Session GET metadata agrees with safe immutable create snapshot',isDeepStrictEqual(await reads.get(readBinding,sessionOne.sessionId),sessionOne));
  const shortRequest={...sessionRequest,validUntil:new Date(Date.now()+1200).toISOString()};
  const shortSession=await sessions.create(createBinding,'synthetic.session:expiry-001',shortRequest);
  const originalShortLedger=(await admin.query('SELECT response_state,response_version,response_created_at FROM highpass_v3.exchange_write_results WHERE session_id=$1',[shortSession.sessionId])).rows[0];
  let expired=false;const expiryDeadline=Date.now()+2500;
  while(Date.now()<expiryDeadline){expired=(await admin.query('SELECT valid_until<=clock_timestamp() expired FROM highpass_v3.exchange_sessions WHERE session_id=$1',[shortSession.sessionId])).rows[0].expired;
    if(expired)break;await new Promise(resolve=>setTimeout(resolve,25));}
  check('actual expired Session metadata is denied and audited',expired
    &&await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>reads.get(readBinding,shortSession.sessionId))
    &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE reason_code='SESSION_EXPIRED'")).rows[0].n===1);
  const beforeExpiredRetry=(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE reason_code='SESSION_EXPIRED' AND result='DENY'")).rows[0].n;
  check('elapsed same-key creation retry denies and commits expiry audit',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:expiry-001',shortRequest))
    &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE reason_code='SESSION_EXPIRED' AND result='DENY'")).rows[0].n===beforeExpiredRetry+1);
  check('elapsed fresh creation remains rejected without another Session',await expected('V3_SESSION_REQUEST_INVALID',()=>sessions.create(createBinding,'synthetic.session:expired-new-001',shortRequest))
    &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_sessions WHERE session_id=$1',[shortSession.sessionId])).rows[0].n===1);
  check('invited and missing Session reads have same safe denial',
    await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>reads.get(recipientRead,sessionOne.sessionId))
    &&await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>reads.get(recipientRead,randomUUID())));
  check('Session conflict audit commits exact reason without new Session',
    (await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE reason_code='IDEMPOTENCY_CONFLICT'")).rows[0].n===1);
  await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_app');
  check('Session read fails closed when audit cannot persist',await expected('V3_DATABASE_UNAVAILABLE',()=>reads.get(readBinding,sessionOne.sessionId)));
  await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_app');
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=statement_timestamp() WHERE patient_ref=$1',[registered.patientRefId]);
  check('deleted source ref denies Session metadata',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>reads.get(readBinding,sessionOne.sessionId)));
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[registered.patientRefId]);
  const doctorActor=randomUUID(),doctorRecord={actorId:doctorActor,tenantId:ta,hospitalId:ha,issuer,subject:'synthetic-session-doctor',
    role:'DOCTOR',authHospitalId:'synthetic-A',scopes:['exchange:create','exchange:read','exchange:cancel'],status:'ACTIVE'};
  await admin.query(`INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes) VALUES($1,$2,$3,'DOCTOR',$4)`,
    [doctorActor,ta,ha,doctorRecord.scopes]);
  const doctorRegistry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[doctorRecord]});
  const doctorInput=[{alg:'HS256'},{iss:issuer,aud:'synthetic-v3',sub:doctorRecord.subject,role:'DOCTOR',hospitalId:'synthetic-A',doctorId:'SYNTHETIC-DOCTOR',
    scope:'exchange:create exchange:read exchange:cancel',exp:Math.floor(Date.now()/1000)+60}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const doctorBinding=doctorRegistry.resolve({headers:{authorization:`Bearer ${doctorInput}.${createHmac('sha256',secret).update(doctorInput).digest('base64url')}`}},
    {requiredScope:'exchange:read',allowedRoles:['DOCTOR']});
  check('actual Doctor noncreator participant reads source metadata',isDeepStrictEqual(await reads.get(doctorBinding,sessionOne.sessionId),sessionOne));
  const doctorSession=await sessions.create(doctorBinding,'synthetic.session:doctor-001',{...sessionRequest,requesterId:doctorActor});
  check('actual Doctor provider initiation remains REQUESTED',doctorSession.initiationType==='PROVIDER_INITIATED'&&doctorSession.state==='REQUESTED');
  // Prove lock ordering using actual pg_blocking_pids, not a sleep-only assumption.
  let releaseHeld,readyHeld,hold=true;
  const creationHeldPromise=new Promise(resolve=>{releaseHeld=resolve;}),creationReadyPromise=new Promise(resolve=>{readyHeld=resolve;});
  const raceTransactions=new V3TenantTransaction({deadlineMs:8000,pool:{async connect(){const client=await concurrentPool.connect();return {
    async query(q){const result=await client.query(q);if(hold&&q.text.startsWith('SELECT tenant_id,status FROM highpass_v3.tenants')){
      hold=false;readyHeld(client.processID);let timer;try{await Promise.race([creationHeldPromise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SYNTHETIC_BARRIER_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);}}
      return result;},on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
  };}}});
  const racing=new V3ExchangeSessionService({transactions:raceTransactions,hmacKey:sessionKey,maxLifetimeMs:3600000});
  const racingResult=racing.create(createBinding,'synthetic.session:race-001',sessionRequest);racingResult.catch(()=>{});
  let updater;
  try{
    let readyTimer;const lockingPid=await Promise.race([creationReadyPromise,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(new Error('CHECK_FAILED')),4000);})]).finally(()=>clearTimeout(readyTimer));
    updater=await admin.connect();const suspended=updater.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[hb]);suspended.catch(()=>{});
    let blocked=false;const until=Date.now()+1500;
    while(Date.now()<until){blocked=(await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS blocked',[lockingPid,updater.processID])).rows[0].blocked;
      if(blocked)break;await new Promise(resolve=>setTimeout(resolve,25));}
    check('actual target suspension blocks on in-flight source creation locks',blocked);
    releaseHeld();const racedSession=await racingResult;await suspended;
    check('creation commits before queued suspension',racedSession.state==='REQUESTED');
    check('committed suspension denies race replay and new create',
      await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:race-001',sessionRequest))
      &&await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:after-suspend-001',sessionRequest)));
  }finally{releaseHeld();await racingResult.catch(()=>{});updater?.release();racing.dispose();}
  await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[hb]);
  const httpRegistry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[...records,patientRecord,doctorRecord]});
  exchangeHandler=createV3ExchangeHttpHandler({registry:httpRegistry,createService:sessions,readService:reads,bodyDeadlineMs:1000});
  const sessionRoute='/api/v3/exchange-sessions';
  const sessionCreated=await post(sessionRoute,sessionRequest,'synthetic.session:http-001',token(0,'exchange:create'));
  check('actual Session HTTP POST 201 metadata/no-store with nonowner PG',sessionCreated.status===201&&sessionCreated.cache==='no-store'&&sessionCreated.body.state==='REQUESTED'
    &&isDeepStrictEqual(sessionCreated.body.requestedActions,['study:view'])&&!('grantId' in sessionCreated.body));
  check('actual Session HTTP same-key retry returns original metadata',isDeepStrictEqual((await post(sessionRoute,sessionRequest,'synthetic.session:http-001',token(0,'exchange:create'))).body,sessionCreated.body));
  check('actual Session HTTP changed actions conflict',
    (await post(sessionRoute,{...sessionRequest,requestedActions:['study:download']},'synthetic.session:http-001',token(0,'exchange:create'))).status===409);
  async function sessionGet(id,bearer=token(0,'exchange:read'),suffix=''){
    const response=await fetch(origin+sessionRoute+'/'+id+suffix,{headers:bearer?{authorization:`Bearer ${bearer}`}:{},signal:AbortSignal.timeout(5000)});
    return {status:response.status,body:await response.json()};
  }
  check('actual Session HTTP GET reads committed immutable metadata',isDeepStrictEqual((await sessionGet(sessionCreated.body.sessionId)).body,sessionCreated.body));
  const foreignSession=await sessionGet(sessionCreated.body.sessionId,token(1,'exchange:read')),absentSession=await sessionGet(randomUUID());
  check('actual Session HTTP INVITED/missing uniform safe404',foreignSession.status===404&&absentSession.status===404&&foreignSession.body.code===absentSession.body.code);
  check('actual Session HTTP auth/scope enforced',
    (await sessionGet(sessionCreated.body.sessionId,null)).status===401&&(await sessionGet(sessionCreated.body.sessionId,token(0,'mapping:read'))).status===403);
  check('actual Session HTTP query and encoded route are rejected',
    (await sessionGet(sessionCreated.body.sessionId,token(0,'exchange:read'),'?token=SYNTHETIC')).status===422
    &&(await sessionGet('%31'+sessionCreated.body.sessionId.slice(1))).status===404);
  check('actual Session HTTP duplicate JSON field rejected',
    (await post(sessionRoute,'{"purpose":"TREATMENT","purpose":"OTHER"}','synthetic.session:duplicate-001',token(0,'exchange:create'))).status===422);
  const patientBearer=`${patientInput}.${createHmac('sha256',secret).update(patientInput).digest('base64url')}`;
  const doctorBearer=`${doctorInput}.${createHmac('sha256',secret).update(doctorInput).digest('base64url')}`;
  check('actual patient HTTP creates bound Session and reads it',
    (await post(sessionRoute,patientRequest,'synthetic.session:http-patient-001',patientBearer)).status===201
    &&(await sessionGet(patientSession.sessionId,patientBearer)).status===200);
  check('actual Doctor HTTP provider initiation succeeds',
    (await post(sessionRoute,{...sessionRequest,requesterId:doctorActor},'synthetic.session:http-doctor-001',doctorBearer)).status===201);
  check('actual Session HTTP patient/source spoofing denied',
    (await post(sessionRoute,{...patientRequest,patientRefId:randomUUID()},'synthetic.session:http-spoof-001',patientBearer)).status===403
    &&(await post(sessionRoute,{...sessionRequest,sourceHospitalId:hb},'synthetic.session:http-source-001',token(0,'exchange:create'))).status===403);
  check('actual Session HTTP expired metadata denied',(await sessionGet(shortSession.sessionId)).status===404);
  check('actual HTTP elapsed same-key create retry denies404',
    (await post(sessionRoute,shortRequest,'synthetic.session:expiry-001',token(0,'exchange:create'))).status===404);
  await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_app');
  try{check('elapsed retry audit fault returns503 not a receipt',
    (await post(sessionRoute,shortRequest,'synthetic.session:expiry-001',token(0,'exchange:create'))).status===503);}
  finally{await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_app');}
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=statement_timestamp() WHERE patient_ref=$1',[registered.patientRefId]);
  check('actual Session HTTP deleted source denied',(await sessionGet(sessionCreated.body.sessionId)).status===404);
  await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[registered.patientRefId]);
  async function rawSession({duplicate=false,slow=false,getBody=false,oversize=false}={}){
    return new Promise((resolve,reject)=>{
      const req=httpRequest(origin+sessionRoute+(getBody?'/'+sessionCreated.body.sessionId:''),{method:getBody?'GET':'POST',headers:{authorization:`Bearer ${token(0,'exchange:create exchange:read')}`,
        'content-type':'application/json','idempotency-key':duplicate?['synthetic.session:dup-001','synthetic.session:dup-002']:'synthetic.session:raw-001',
        'x-audit-session-id':randomUUID(),...(getBody?{'content-length':'2'}:oversize?{'content-length':String(4*1024*1024+1)}:{})}},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.once('error',reject);
        res.once('end',()=>{clearTimeout(timer);req.destroy();try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('CHECK_FAILED'));}});
      });
      const timer=setTimeout(()=>req.destroy(new Error('CHECK_FAILED')),4000);
      req.once('error',error=>{clearTimeout(timer);reject(error);});
      if(slow){req.flushHeaders();req.write('{');}else req.end('{}');
    });
  }
  check('actual Session HTTP duplicate sensitive headers denied',(await rawSession({duplicate:true})).status===422);
  check('actual Session HTTP slow body terminates with408',(await rawSession({slow:true})).status===408);
  check('actual Session HTTP GET body rejected',(await rawSession({getBody:true})).status===422);
  check('actual Session HTTP oversized declared body rejected before upload',(await rawSession({oversize:true})).status===413);
  const maximumResources=Array.from({length:100},(_,s)=>({studyInstanceUid:`1.2.${s}`,seriesInstanceUids:
    Array.from({length:500},(_,i)=>`${'1'.repeat(54)}.${s}.${i}`)}));
  activeHttpOperation='SESSION_MAXIMUM_RESOURCES';
  const maximumHttp=await post(sessionRoute,{...sessionRequest,validUntil:new Date(Date.now()+60000).toISOString(),resources:maximumResources},'synthetic.session:maximum-001',token(0,'exchange:create'));
  activeHttpOperation=null;
  check('canonical 100 Study x500 Series traverses real HTTP and PG intact',maximumHttp.status===201&&maximumHttp.body.resources.length===100
    &&maximumHttp.body.resources.every(resource=>resource.seriesInstanceUids.length===500));
  await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_app');
  const httpAuditFailed=await sessionGet(sessionCreated.body.sessionId);
  check('actual Session HTTP audit fault returns safe503 not metadata',httpAuditFailed.status===503&&!('sessionId' in httpAuditFailed.body));
  await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_app');
  const cancelBinding=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:cancel')}`}},
    {requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
  const cancelService=new V3ExchangeCancelService({transactions:concurrentTransactions,hmacKey:sessionKey});
  try{
    const cancelled=await Promise.all([1,2].map(()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-001',sessionOne.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'})));
    check('two real nonowner PG cancellations share one original receipt',isDeepStrictEqual(cancelled[0],cancelled[1])&&cancelled[0].state==='CANCELLED'&&cancelled[0].version===2);
    check('cancellation has exactly one state audit cascade and retry ledger',
      (await admin.query('SELECT (SELECT count(*)::int FROM highpass_v3.exchange_state_events WHERE session_id=$1) events,(SELECT count(*)::int FROM highpass_v3.exchange_audit_outbox WHERE session_id=$1 AND action=\'SESSION_CANCELLED\') audits,(SELECT count(*)::int FROM highpass_v3.exchange_cascade_outbox) cascades,(SELECT count(*)::int FROM highpass_v3.exchange_cancel_results) results',[sessionOne.sessionId])).rows.every(r=>r.events===1&&r.audits===1&&r.cascades===1&&r.results===1));
    check('cancelled Session create retry cannot resurrect it',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(createBinding,'synthetic.session:create-001',sessionRequest)));
    check('cancelled Session retains original creation ledger',isDeepStrictEqual(originalSessionLedger,
      (await admin.query('SELECT response_state,response_version,response_created_at FROM highpass_v3.exchange_write_results WHERE session_id=$1',[sessionOne.sessionId])).rows[0]));
    check('cancelled metadata reads with accurate version2 audit',(await reads.get(readBinding,sessionOne.sessionId)).version===2
      &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_audit_outbox WHERE session_id=$1 AND action='SESSION_READ' AND session_version=2",[sessionOne.sessionId])).rows[0].n===1);
    check('new-key stale cancel denies412',await expected('V3_SESSION_VERSION_MISMATCH',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-stale-001',sessionOne.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'})));
    check('new-key terminal cancel denies409',await expected('V3_SESSION_TERMINAL',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-terminal-001',sessionOne.sessionId,'"2"',{reasonCode:'REQUESTER_CANCELLED'})));
    check('same cancellation key changed comment conflicts',await expected('V3_SESSION_IDEMPOTENCY_CONFLICT',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-001',sessionOne.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED',comment:'SYNTHETIC'})));
    const invitedCancel=registry.resolve({headers:{authorization:`Bearer ${token(1,'exchange:cancel')}`}},
      {requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
    check('invited source mismatch cannot cancel',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>cancelService.cancel(invitedCancel,'synthetic.session:cancel-invited-001',patientSession.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'})));
    await admin.query('REVOKE INSERT ON highpass_v3.exchange_cascade_outbox FROM hp_v3_app');
    check('cascade enqueue failure denies and rolls back',await expected('V3_DATABASE_UNAVAILABLE',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-fault-001',doctorSession.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'})));
    check('failed cascade leaves no changed state or event',(await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[doctorSession.sessionId])).rows.every(r=>r.state==='REQUESTED'&&r.version===1)
      &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1',[doctorSession.sessionId])).rows[0].n===0);
    await admin.query('GRANT INSERT ON highpass_v3.exchange_cascade_outbox TO hp_v3_app');
    const rawNoProof=await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>concurrentTransactions.run(cancelBinding,'exchange:cancel',tx=>tx.query("UPDATE highpass_v3.exchange_sessions SET state='CANCELLED',version=2,updated_at=clock_timestamp() WHERE session_id=$1",[doctorSession.sessionId])));
    check('raw cancellation without full proof fails exact deferred constraint',rawNoProof&&lastDbFault?.code==='23514');
    await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_app');
    check('cancellation audit failure denies and rolls back',await expected('V3_DATABASE_UNAVAILABLE',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-audit-001',doctorSession.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'})));
    await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_app');
    check('raw unsupported READY transition denied',await expected('V3_DATABASE_UNAVAILABLE',()=>concurrentTransactions.run(cancelBinding,'exchange:cancel',tx=>tx.query("UPDATE highpass_v3.exchange_sessions SET state='READY',version=2,updated_at=clock_timestamp() WHERE session_id=$1",[doctorSession.sessionId])))&&lastDbFault?.code==='42501');
    await admin.query('GRANT UPDATE(purpose) ON highpass_v3.exchange_sessions TO hp_v3_app');
    check('raw immutable purpose edit denied by trigger with column grant',await expected('V3_DATABASE_UNAVAILABLE',()=>concurrentTransactions.run(cancelBinding,'exchange:cancel',tx=>tx.query("UPDATE highpass_v3.exchange_sessions SET purpose='OTHER',state='CANCELLED',version=2,updated_at=clock_timestamp() WHERE session_id=$1",[doctorSession.sessionId])))&&lastDbFault?.code==='42501');
    await admin.query('REVOKE UPDATE(purpose) ON highpass_v3.exchange_sessions FROM hp_v3_app');
    check('owner cannot delete cascade request',await expected('42501',()=>admin.query('DELETE FROM highpass_v3.exchange_cascade_outbox')));
    check('raw terminal reopening denied',await expected('V3_DATABASE_UNAVAILABLE',()=>concurrentTransactions.run(cancelBinding,'exchange:cancel',tx=>tx.query("UPDATE highpass_v3.exchange_sessions SET state='REQUESTED',version=3,updated_at=clock_timestamp() WHERE session_id=$1",[sessionOne.sessionId])))&&lastDbFault?.code==='42501');
    loseAck=true;const cancelAck=new V3ExchangeCancelService({transactions:ackTransactions,hmacKey:sessionKey});
    try{
      check('actual cancellation COMMIT with lost ACK is outcome unknown',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>cancelAck.cancel(cancelBinding,'synthetic.session:cancel-ack-001',doctorSession.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'})));
      check('lost ACK cancellation retry returns one original receipt',(await cancelService.cancel(cancelBinding,'synthetic.session:cancel-ack-001',doctorSession.sessionId,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'})).version===2
        &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1',[doctorSession.sessionId])).rows[0].n===1);
    }finally{cancelAck.dispose();}
    exchangeHandler=createV3ExchangeHttpHandler({registry:httpRegistry,createService:sessions,readService:reads,cancelService,bodyDeadlineMs:1000});
    const cancelRoute=sessionRoute+'/'+sessionCreated.body.sessionId+'/cancel';
    const httpCancel=await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-cancel-001',token(0,'exchange:cancel'),{'if-match':'"1"'});
    check('actual cancellation HTTP200 safe metadata/no-store',httpCancel.status===200&&httpCancel.cache==='no-store'&&httpCancel.body.state==='CANCELLED'&&httpCancel.body.version===2);
    check('HTTP same-key cancellation returns immutable receipt',isDeepStrictEqual((await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-cancel-001',token(0,'exchange:cancel'),{'if-match':'"1"'})).body,httpCancel.body));
    check('HTTP stale412 and terminal409 are distinct',
      (await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-stale-001',token(0,'exchange:cancel'),{'if-match':'"1"'})).status===412
      &&(await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-terminal-001',token(0,'exchange:cancel'),{'if-match':'"2"'})).status===409);
    check('HTTP weak If-Match and wrong scope rejected',
      (await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-weak-001',token(0,'exchange:cancel'),{'if-match':'W/"2"'})).status===422
      &&(await post(cancelRoute,{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:http-scope-001',token(0,'exchange:read'),{'if-match':'"2"'})).status===403);
    const patientCancel=patientRegistry.resolve({headers:{authorization:`Bearer ${patientBearer}`}},{requiredScope:'exchange:cancel',allowedRoles:['PATIENT']});
    const patientCanceled=await cancelService.cancel(patientCancel,'synthetic.session:patient-cancel-001',patientSession.sessionId,'"1"',{reasonCode:'PATIENT_WITHDRAWN'});
    check('actual bound patient cancels without admin audit exposure',patientCanceled.state==='CANCELLED'
      &&(await concurrentTransactions.run(patientCancel,'exchange:cancel',tx=>tx.query('SELECT event_id FROM highpass_v3.exchange_audit_outbox'))).rows.length===0);
    await admin.query('UPDATE highpass_v3.principal_bindings SET patient_ref=$1 WHERE actor_id=$2',[patient,patientActor]);
    check('patient binding drift denies cancellation replay',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>cancelService.cancel(patientCancel,'synthetic.session:patient-cancel-001',patientSession.sessionId,'"1"',{reasonCode:'PATIENT_WITHDRAWN'})));
    await admin.query('UPDATE highpass_v3.principal_bindings SET patient_ref=$1 WHERE actor_id=$2',[registered.patientRefId,patientActor]);
    check('expired Session cannot be cancelled',await expected('V3_SESSION_EXPIRED',()=>cancelService.cancel(cancelBinding,'synthetic.session:cancel-expired-001',shortSession.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'})));
    const freshSource=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
    const freshRequest={...sessionRequest,validUntil:new Date(Date.now()+60000).toISOString()};
    const raceSession=await sessions.create(freshSource,'synthetic.session:cancel-race-create-001',freshRequest);
    const raceResults=await Promise.allSettled([1,2].map(index=>cancelService.cancel(cancelBinding,`synthetic.session:cancel-race-${index}-001`,raceSession.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'})));
    check('different cancel keys serialize one success and one stale412',raceResults.filter(result=>result.status==='fulfilled').length===1
      &&raceResults.filter(result=>result.status==='rejected'&&result.reason.code==='V3_SESSION_VERSION_MISMATCH').length===1
      &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1',[raceSession.sessionId])).rows[0].n===1);
    const freshDoctor=httpRegistry.resolve({headers:{authorization:`Bearer ${doctorBearer}`}},{requiredScope:'exchange:cancel',allowedRoles:['DOCTOR']});
    const doctorCancelSession=await sessions.create(freshDoctor,'synthetic.session:doctor-cancel-create-001',{...freshRequest,requesterId:doctorActor});
    const doctorCancelHttp=await post(sessionRoute+'/'+doctorCancelSession.sessionId+'/cancel',{reasonCode:'REQUESTER_CANCELLED'},'synthetic.session:doctor-cancel-http-001',doctorBearer,{'if-match':'"1"'});
    check('actual requester Doctor cancels over HTTP',doctorCancelHttp.status===200&&doctorCancelHttp.body.version===2&&doctorCancelHttp.body.state==='CANCELLED');
    check('Doctor cannot cancel another source requester',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>cancelService.cancel(freshDoctor,'synthetic.session:doctor-cancel-other-001',sessionOne.sessionId,'"2"',{reasonCode:'REQUESTER_CANCELLED'})));
  }finally{cancelService.dispose();}
  const expiryActor=randomUUID(),expirySecret=randomBytes(32).toString('hex'),expiryIssuer='synthetic-expiry-isolated';
  const expiryRecord={issuer:expiryIssuer,subject:'synthetic-worker-A',role:'INTERNAL_SERVICE',scopes:['exchange:expire'],servicePurpose:'SESSION_EXPIRY',
    actorId:expiryActor,tenantId:ta,hospitalId:ha,authHospitalId:'SYNTHETIC-A',status:'ACTIVE'};
  await admin.query("INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,service_purpose) VALUES($1,$2,$3,'INTERNAL_SERVICE',$4,'SESSION_EXPIRY')",[expiryActor,ta,ha,['exchange:expire']]);
  const expiryInput=[{alg:'HS256'},{iss:expiryIssuer,aud:'synthetic-expiry-api',sub:expiryRecord.subject,role:'INTERNAL_SERVICE',hospitalId:'SYNTHETIC-A',scope:'exchange:expire',exp:Math.floor(Date.now()/1000)+60}]
    .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const expiryRegistry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:expiryIssuer,JWT_AUDIENCE:'synthetic-expiry-api',TEST_JWT_SECRET:expirySecret}),records:[expiryRecord]});
  const expiryBinding=expiryRegistry.resolve({headers:{authorization:`Bearer ${expiryInput}.${createHmac('sha256',expirySecret).update(expiryInput).digest('base64url')}`}},v3ExchangeExpiryPolicy);
  check('dedicated maintenance principal has source-scoped bounded batch',prepareExchangeExpiryBatch(expiryBinding).hospitalId===ha);
  activeFixturePhase='MAINTENANCE_VISIBILITY';
  const expiryVisibility=await concurrentTransactions.run(expiryBinding,'exchange:expire',tx=>tx.query(`SELECT
    (SELECT count(*)::int FROM highpass_v3.patient_refs) refs,(SELECT count(*)::int FROM highpass_v3.patient_mappings) mappings,
    (SELECT count(*)::int FROM highpass_v3.exchange_sessions) sessions,
    (SELECT count(*)::int FROM highpass_v3.exchange_resource_scopes) scopes,
    (SELECT count(*)::int FROM highpass_v3.exchange_audit_outbox) audits`));
  check('actual nonowner maintenance cannot read clinical metadata or audits',expiryVisibility.rows.every(r=>Object.values(r).every(value=>value===0)));
  activeFixturePhase=null;
  check('maintenance cannot fabricate identity audit under permissive legacy policy',await expected('V3_DATABASE_UNAVAILABLE',()=>concurrentTransactions.run(expiryBinding,'exchange:expire',tx=>
    tx.query("INSERT INTO highpass_v3.identity_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code) VALUES($1,$2,$3,$4,$5,'synthetic_expiry_trace_001','MAPPING_READ','ALLOW','METADATA_READ')",[randomUUID(),ta,ha,expiryActor,randomUUID()])))&&lastDbFault?.code==='42501');
  check('overbroad maintenance DB enrollment rejected',await expected('23514',()=>admin.query("UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['exchange:expire','exchange:read'] WHERE actor_id=$1",[expiryActor])));
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='SUSPENDED' WHERE actor_id=$1",[expiryActor]);
  check('suspended maintenance principal denied before repository operation',await expected('V3_DB_PRINCIPAL_INACTIVE',()=>concurrentTransactions.run(expiryBinding,'exchange:expire',()=>{throw Error('MUST NOT RUN');})));
  await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[expiryActor]);
  const expiryPassword=randomBytes(32).toString('hex');
  await admin.query(`CREATE ROLE hp_v3_expiry LOGIN PASSWORD '${expiryPassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT hp_v3_expiry_policy TO hp_v3_expiry;
    GRANT USAGE ON SCHEMA highpass_v3 TO hp_v3_expiry;
    GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_v3_expiry;
    GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_v3_expiry;
    GRANT SELECT(tenant_id,hospital_id,status) ON highpass_v3.hospitals TO hp_v3_expiry;
    GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_v3_expiry;
    GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,state,version,valid_until,updated_at) ON highpass_v3.exchange_sessions TO hp_v3_expiry;
    GRANT UPDATE(state,version,updated_at) ON highpass_v3.exchange_sessions TO hp_v3_expiry;
    GRANT SELECT(event_id,session_id,actor_id,from_state,to_state,from_version,to_version,occurred_at) ON highpass_v3.exchange_state_events TO hp_v3_expiry;
    GRANT SELECT(event_id,kind) ON highpass_v3.exchange_cascade_outbox TO hp_v3_expiry;
    GRANT INSERT ON highpass_v3.exchange_state_events,highpass_v3.exchange_cascade_outbox,highpass_v3.exchange_audit_outbox TO hp_v3_expiry;
    GRANT EXECUTE ON FUNCTION highpass_v3.valid_exchange_actions(text[]),highpass_v3.exchange_expirer(uuid,uuid),highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),
     highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),highpass_v3.exchange_directory_caller() TO hp_v3_expiry;`);
  const expiryPool=new Pool({...base,user:'hp_v3_expiry',password:expiryPassword,max:2});expiryPool.on('error',()=>{});
  const expiryTransactions=new V3TenantTransaction({pool:{async connect(){const client=await expiryPool.connect();return {
    async query(q){try{return await client.query(q);}catch(error){lastDbFault={code:error.code,operation:'EXPIRY',
      permissionRelation:error.message?.match(/permission denied for (?:table|function) ([a-z_]+)/)?.[1]};throw error;}},
    on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
  };}},deadlineMs:8000}),expiryService=new V3ExchangeExpiryService({transactions:expiryTransactions});
  try{
    check('least privilege expiry role cannot SELECT full Session',await expected('V3_DATABASE_UNAVAILABLE',()=>expiryTransactions.run(expiryBinding,'exchange:expire',tx=>tx.query('SELECT * FROM highpass_v3.exchange_sessions')))&&lastDbFault?.code==='42501');
    const expiredTogether=await Promise.all([1,2].map(()=>expiryService.expireBatch(expiryBinding,{limit:100})));
    check('actual concurrent expiry records exactly one event per expired Session',expiredTogether.reduce((n,result)=>n+result.processed,0)>=1
      &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED'",[shortSession.sessionId])).rows[0].n===1);
    check('expiry event audit and durable request all committed',
      (await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events e JOIN highpass_v3.exchange_audit_outbox a ON a.event_id=e.event_id JOIN highpass_v3.exchange_cascade_outbox o ON o.event_id=e.event_id WHERE e.session_id=$1 AND a.action='SESSION_EXPIRED' AND o.kind='EXPIRY_REQUESTED'",[shortSession.sessionId])).rows[0].n===1);
    check('expiry receipts contain no patient or imaging metadata',expiredTogether.flatMap(r=>r.receipts).every(r=>Object.keys(r).every(k=>['sessionId','eventId','state','version','recordedAt','cascadeStatus'].includes(k))));
    check('expiry rerun is bounded empty batch',(await expiryService.expireBatch(expiryBinding)).processed===0);
    check('expired state never reopens clinical metadata',(await sessionGet(shortSession.sessionId)).status===404);
    check('persisted expiry preserves original creation ledger',isDeepStrictEqual(originalShortLedger,
      (await admin.query('SELECT response_state,response_version,response_created_at FROM highpass_v3.exchange_write_results WHERE session_id=$1',[shortSession.sessionId])).rows[0]));
    const freshCreate=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
    check('persisted EXPIRED same-key retry denies without second state event',await expected('V3_SESSION_RESOURCE_UNAVAILABLE',()=>sessions.create(freshCreate,'synthetic.session:expiry-001',shortRequest))
      &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1',[shortSession.sessionId])).rows[0].n===1);
    const wrongExpiryPool=new V3ExchangeExpiryService({transactions:concurrentTransactions});
    try{check('expiry refuses clinical application pool even with enrolled actor',await expected('V3_EXPIRY_DATABASE_ROLE_UNSAFE',()=>wrongExpiryPool.expireBatch(expiryBinding)));}finally{wrongExpiryPool.close();}
    async function expiredFixture(key){
      const fresh=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
      const created=await sessions.create(fresh,key,{...sessionRequest,validUntil:new Date(Date.now()+1500).toISOString()});
      let expired=false;const until=Date.now()+3000;
      while(Date.now()<until){expired=(await admin.query('SELECT valid_until<=clock_timestamp() expired FROM highpass_v3.exchange_sessions WHERE session_id=$1',[created.sessionId])).rows[0].expired;
        if(expired)break;await new Promise(resolve=>setTimeout(resolve,25));}
      if(!expired)throw Error('CHECK_FAILED');return created;
    }
    const failureSession=await expiredFixture('synthetic.expiry:fault-create-001');
    await admin.query('REVOKE INSERT ON highpass_v3.exchange_audit_outbox FROM hp_v3_expiry');
    check('expiry audit failure fails closed',await expected('V3_DATABASE_UNAVAILABLE',()=>expiryService.expireBatch(expiryBinding)));
    await admin.query('GRANT INSERT ON highpass_v3.exchange_audit_outbox TO hp_v3_expiry');
    await admin.query('REVOKE INSERT ON highpass_v3.exchange_cascade_outbox FROM hp_v3_expiry');
    check('expiry cascade failure fails closed',await expected('V3_DATABASE_UNAVAILABLE',()=>expiryService.expireBatch(expiryBinding)));
    await admin.query('GRANT INSERT ON highpass_v3.exchange_cascade_outbox TO hp_v3_expiry');
    check('failed expiry rolls back state and events',(await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[failureSession.sessionId])).rows.every(r=>r.state==='REQUESTED'&&r.version===1)
      &&(await admin.query('SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1',[failureSession.sessionId])).rows[0].n===0);
    let loseExpiryAck=true;
    const expiryAckTransactions=new V3TenantTransaction({deadlineMs:8000,pool:{async connect(){const client=await expiryPool.connect();return {
      async query(q){const result=await client.query(q);if(q.text==='COMMIT'&&loseExpiryAck){loseExpiryAck=false;throw Error('SYNTHETIC_LOST_ACK');}return result;},
      on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
    };}}});
    const expiryAckService=new V3ExchangeExpiryService({transactions:expiryAckTransactions});
    try{check('actual expiry COMMIT lost ACK is outcome unknown',await expected('V3_COMMIT_OUTCOME_UNKNOWN',()=>expiryAckService.expireBatch(expiryBinding)));}
    finally{expiryAckService.close();}
    check('expiry lost ACK retry does not duplicate event',(await expiryService.expireBatch(expiryBinding)).processed===0
      &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED'",[failureSession.sessionId])).rows[0].n===1);
    const raceSession=await expiredFixture('synthetic.expiry:cancel-race-001');
    const raceBinding=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:cancel')}`}},{requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
    const raceCancel=new V3ExchangeCancelService({transactions:concurrentTransactions,hmacKey:sessionKey});
    try{
      const raced=await Promise.allSettled([expiryService.expireBatch(expiryBinding),raceCancel.cancel(raceBinding,'synthetic.expiry:cancel-race-001',raceSession.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'})]);
      check('expired deadline race permits expiry and denies concurrent cancellation',raced[0].status==='fulfilled'&&raced[0].value.processed===1
        &&raced[1].status==='rejected'&&['V3_SESSION_EXPIRED','V3_SESSION_VERSION_MISMATCH'].includes(raced[1].reason.code));
      check('expiry cancellation race leaves exactly one EXPIRED event',
        (await admin.query('SELECT state,version FROM highpass_v3.exchange_sessions WHERE session_id=$1',[raceSession.sessionId])).rows.every(r=>r.state==='EXPIRED'&&r.version===2)
        &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED'",[raceSession.sessionId])).rows[0].n===1);
    }finally{raceCancel.dispose();}
    const beforeDeadlineRequest={...sessionRequest,validUntil:new Date(Date.now()+2000).toISOString()};
    const beforeDeadline=await sessions.create(freshCreate,'synthetic.expiry:cancel-first-create-001',beforeDeadlineRequest);
    const firstCancel=new V3ExchangeCancelService({transactions:concurrentTransactions,hmacKey:sessionKey});
    try{
      const cancelledFirst=await firstCancel.cancel(raceBinding,'synthetic.expiry:cancel-first-001',beforeDeadline.sessionId,'"1"',{reasonCode:'REQUESTER_CANCELLED'});
      let elapsed=false;const until=Date.now()+3500;
      while(Date.now()<until){elapsed=(await admin.query('SELECT valid_until<=clock_timestamp() elapsed FROM highpass_v3.exchange_sessions WHERE session_id=$1',[beforeDeadline.sessionId])).rows[0].elapsed;
        if(elapsed)break;await new Promise(resolve=>setTimeout(resolve,25));}
      check('cancellation before deadline remains terminal after expiry scan',elapsed&&cancelledFirst.state==='CANCELLED'
        &&(await expiryService.expireBatch(expiryBinding)).processed===0
        &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='CANCELLED'",[beforeDeadline.sessionId])).rows[0].n===1
        &&(await admin.query("SELECT count(*)::int n FROM highpass_v3.exchange_state_events WHERE session_id=$1 AND to_state='EXPIRED'",[beforeDeadline.sessionId])).rows[0].n===0);
    }finally{firstCancel.dispose();}
    expiryService.close();
    check('closed expiry service rejects new work',await expected('V3_EXPIRY_SERVICE_CLOSED',()=>expiryService.expireBatch(expiryBinding)));
  }finally{expiryService.close();await expiryPool.end();}
  const pendingCreate=registry.resolve({headers:{authorization:`Bearer ${token(0,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
  const pendingParent=await sessions.create(pendingCreate,'synthetic.pending:projection-parent-001',{...sessionRequest,validUntil:new Date(Date.now()+3600000).toISOString()});
  const pendingLifecycle={
    async cancel(id,onLockAttempt){
      const actor=registry.resolve({headers:{authorization:`Bearer ${token(2,'exchange:cancel')}`}},{requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
      const racePool={async connect(){const client=await concurrentPool.connect();return {
        async query(q){if(q.text.startsWith('SELECT * FROM highpass_v3.exchange_sessions')&&q.text.includes('FOR UPDATE'))onLockAttempt(client.processID);return client.query(q);},
        on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
      };}};
      const cancel=new V3ExchangeCancelService({transactions:new V3TenantTransaction({pool:racePool,deadlineMs:8000}),hmacKey:sessionKey});
      try{return await cancel.cancel(actor,'synthetic.pending:actual-cancel-001',id,'"1"',{reasonCode:'ADMINISTRATIVE_CANCEL'});}finally{cancel.dispose();}
    },
    async createExpiring(){
      const actor=registry.resolve({headers:{authorization:`Bearer ${token(2,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
      return sessions.create(actor,'synthetic.pending:expiring-parent-001',{...sessionRequest,requesterId:actor.actorId,validUntil:new Date(Date.now()+2000).toISOString()});
    },
    async createTransportParent(){
      const actor=registry.resolve({headers:{authorization:`Bearer ${token(2,'exchange:create')}`}},{requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
      return sessions.create(actor,'synthetic.pending:transport-parent-001',{...sessionRequest,requesterId:actor.actorId,validUntil:new Date(Date.now()+3600000).toISOString()});
    },
    async expire(){
      const pool=new Pool({...base,user:'hp_v3_expiry',password:expiryPassword,max:1});pool.on('error',()=>{});
      const service=new V3ExchangeExpiryService({transactions:new V3TenantTransaction({pool,deadlineMs:8000})});
      try{return await service.expireBatch(expiryBinding);}finally{await service.close();await pool.end();}
    }
  };
  await checkPendingProjection({admin,base,record:records[0],sessionId:pendingParent.sessionId,check,lifecycle:pendingLifecycle});
  summary={result:'PASS',scope:'P0-04/05 REGRESSION + PENDING SOURCE/ATOMIC WRITE / NOT EXHAUSTIVE PA-01..08 OR LIVE HTTPS/FULL MVP',imageId:image.stdout.trim(),
    migrationSha256:migrations.map(text=>createHash('sha256').update(text).digest('hex')),results,
    notVerified:['deployed scheduler graceful drain and real workload identity','exhaustive mutation/HTTP negative matrix','clinical transition authorization and live nonterminal receipt lifecycle','actual cascade delivery/grant revoke/work cancellation','cross-institution PatientRef approval/membership','runtime route activation and HTTPS/mTLS image','full audit hash chain/outbox delivery','external IdP/KMS/DB TLS verify-full']};
}catch(error){
  const failureCode=/^(?:[0-9A-Z]{5}|V3_[A-Z0-9_]+|JWT_[A-Z0-9_]+|ECONNRESET|ETIMEDOUT|ABORT_ERR)$/.test(error.code??'')?error.code:
    ['TimeoutError','AbortError'].includes(error.name)?error.name:'UNCLASSIFIED_TECHNICAL_FAILURE';
  failed=true;
  const reason=['CHECK_FAILED','POSTGRES_IMAGE_UNAVAILABLE','POSTGRES_START_UNAVAILABLE','POSTGRES_READINESS_UNAVAILABLE','POSTGRES_PORT_UNAVAILABLE'].includes(error.message)?error.message
    : /^[0-9A-Z]{5}$/.test(error.code??'')?`POSTGRES_${error.code}`
    : ['V3_DATABASE_UNAVAILABLE','V3_DATABASE_ROLE_UNSAFE','V3_DB_PRINCIPAL_INACTIVE','V3_TRANSACTION_DEADLINE'].includes(error.code)?error.code:'TRANSACTION_OR_ENVIRONMENT_FAILURE';
  summary={result:results.some(item=>item.result==='FAIL')?'FAIL':'NOT VERIFIED',reason,failureCode,lastDbFault,activeHttpOperation,activeFixturePhase,maintenanceSqlPhases,maintenanceFaults,maximumHttpObservation,results};
}finally{
  mappingCrypto?.dispose();
  sessions?.dispose();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await Promise.all([app?.end(),concurrentPool?.end(),admin?.end()]);
  const removal=removeOwnedPostgresFixture({name,owner,label,docker});
  const followup=!removal.absent&&removal.owned?await observeOwnedFixtureAbsence({name,owner,label,docker}):null;
  cleanupObservations=[...removal.observations,...(followup?.observations??[])];
  cleanupStatus=removal.absent||followup?.absent?'PASS':'NOT VERIFIED';if(cleanupStatus!=='PASS')failed=true;
  summary={...summary,startupObservation,cleanupObservations,maximumHttpObservation,maximumSqlPhases,maintenanceSqlPhases,maintenanceFaults,cleanup:cleanupStatus,durationMs:Date.now()-beganAt,nodeVersion:process.version,generatedAt:new Date().toISOString(),
    sourceHashes:hashSources()};
  summary.sourceUnchanged=JSON.stringify(sourceHashesAtStart)===JSON.stringify(summary.sourceHashes);
  if(!summary.sourceUnchanged){failed=true;summary.result='NOT VERIFIED';summary.reason='SOURCE_CHANGED_DURING_VALIDATION';}
  if(failed && summary.result==='PASS')summary.result='NOT VERIFIED';
  console.log(JSON.stringify(summary,null,2));
  // Fixed-schema machine evidence only: never captures raw SQL/PG errors or credentials.
  try{
    const sha=dockerGitSha();
    const directory=path.join('evidence','generated',`hp-v3-identity-tx-${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}-${owner.slice(0,8)}`);
    mkdirSync(directory,{recursive:true});
    const file=path.join(directory,'transaction-check.json');
    writeFileSync(file,JSON.stringify(summary,null,2),{flag:'wx'});
    const entry={evidenceId:'v3-identity-transaction',repositorySha:sha,sourcePath:file.replaceAll('\\','/'),
      sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED',containsSecrets:false,containsPersonalData:false};
    writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({repositorySha:sha,workingTreeDirty:true,
      containsSecrets:false,containsPersonalData:false,evidence:[entry]},null,2),{flag:'wx'});
    console.log(JSON.stringify({evidenceDirectory:directory.replaceAll('\\','/'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED'}));
  }catch{failed=true;console.log(JSON.stringify({evidence:'NOT VERIFIED',reason:'EVIDENCE_GENERATION_FAILED'}));}
  process.exitCode=failed?1:0;
}
function dockerGitSha(){
  const output=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:10000});
  if(output.status!==0 || !/^[a-f0-9]{40}$/.test(output.stdout.trim()))throw new Error('GIT_SHA_UNAVAILABLE');
  return output.stdout.trim();
}
