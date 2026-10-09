import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,createHash,randomBytes,randomUUID } from 'node:crypto';
import { PatientSelfViewAuthorization,parsePatientDataPlaneRequest } from '../src/patient-self-view-authorization.js';
import { LocalDevelopmentKeyProvider } from '../src/key-provider.js';
import { InternalServiceProvider } from '../src/auth.js';
import { isLegacyImageOperation } from '../src/data-plane-authorization.js';

function fixture(change={}) {
  const now=Math.floor(Date.now()/1000),secret=randomBytes(32).toString('hex'),audits=[];
  const claims={iss:'highpass-control-plane',aud:'mediq-patient-self-view-gateway',jti:randomUUID(),sub:'synthetic-phantom-account',
    actorType:'PATIENT',authorityType:'PATIENT_SELF_VIEW',patientId:'HP-TEST-PHANTOM-001',sourceHospitalId:'H-A',viewingGatewayId:'hospital-b-portal',
    studyInstanceUid:'1.2.3',allowedSeriesUids:['1.2.3.1'],permission:'VIEW_ONLY',purpose:'PATIENT_SELF_VIEW',iat:now,exp:now+120,auditSessionId:randomUUID(),cnf:{jkt:'a'.repeat(43)},...change};
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT',kid:'local-dev-key-v1'})).toString('base64url'),p=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token=`${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
  const row={subject:claims.sub,patient_id:claims.patientId,ref_id:'ref',ownership_revision:'a'.repeat(64),authority_type:'PATIENT_SELF_VIEW',permission:'VIEW_ONLY',status:'ACTIVE',
    source_hospital_id:'H-A',viewing_gateway_id:'hospital-b-portal',study_instance_uid:'1.2.3',series_instance_uid:'1.2.3.1',proof_key_thumbprint:claims.cnf.jkt,
    audit_session_id:claims.auditSessionId,issued_at:new Date(now*1000),expires_at:new Date((now+120)*1000)};
  const service={dpopReplayStore:{persistent:true},verifyDPoPProof:async(proof,args)=>{
    assert.equal(args.accessToken,token);assert.equal(args.url,'https://synthetic.invalid/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances');return {valid:true};},
    writeAudit:async e=>audits.push(e),store:{save:async()=>{}}};
  const authority={authorize:async input=>{assert.equal(input.principal.authMethod,'PATIENT_SELF_VIEW_GRANT');return {decision:'ALLOWED',scope:{refId:'ref',ownershipRevision:'a'.repeat(64)}};}};
  const pool={query:async config=>{assert.deepEqual(config.values,[claims.jti,createHash('sha256').update(token).digest('hex')]);return {rows:[row]};}};
  const verifier=new PatientSelfViewAuthorization({pool,authority,service,keyProvider:new LocalDevelopmentKeyProvider(secret),publicBaseUrl:'https://synthetic.invalid',sourceHospitalId:'H-A',enabled:true});
  const caller={role:'INTERNAL_SERVICE',roles:['INTERNAL_SERVICE'],scopes:['gateway:patient-self-view-authorize'],hospitalId:'H-A',
    authMethod:'INTERNAL_SERVICE_TOKEN',subject:'patient-self-view-gateway'};
  const input={method:'GET',path:'/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances',authorizationScheme:'DPoP',token,dpopProof:'unit-double'};
  return {verifier,caller,input,row,pool,authority,service,audits};
}
test('patient parser rejects broad/unfiltered/raw/download/encoded paths; Cloud blocks patient prefix',()=>{
  for(const path of ['/patient-dicomweb/studies','/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances/1.2.3.1.1',
    '/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances/1.2.3.1.1/download','/patient-dicomweb/studies/01.2/series','/patient-dicomweb/%2e%2e/studies'])
    assert.throws(()=>parsePatientDataPlaneRequest({method:'GET',path},'https://synthetic.invalid'));
  assert.equal(isLegacyImageOperation('/patient-dicomweb/studies'),true);
});
test('bound patient signature, live ledger/revision and DPoP authorize metadata without raw token',async()=>{
  const f=fixture(),result=await f.verifier.authorize(f.input,f.caller);assert.equal(result.active,true);
  assert.equal(result.scope.permission,'VIEW_ONLY');assert.ok(!JSON.stringify(result).includes(f.input.token));
});
test('doctor audience, expired token, privilege substitution, wrong Series/service role deny',async()=>{
  for(const change of [{aud:'highpass-dicomweb-gateway'},{permission:'DOWNLOAD_ALLOWED'},{exp:Math.floor(Date.now()/1000)-1},{actorType:'DOCTOR'}]){
    const f=fixture(change);assert.equal((await f.verifier.authorize(f.input,f.caller)).active,false);
  }
  const f=fixture();assert.equal((await f.verifier.authorize({...f.input,path:f.input.path.replace('1.2.3.1','1.2.3.2')},f.caller)).reason,'SCOPE_MISMATCH');
  assert.equal((await f.verifier.authorize(f.input,{...f.caller,scopes:['gateway:data-plane-authorize']})).active,false);
  assert.equal((await f.verifier.authorize(f.input,{...f.caller,authMethod:'TEST_JWT'})).active,false);
});
test('revoked ledger, changed ownership and DB outage deny; outage is503 not policy DENY',async()=>{
  const f=fixture();f.row.status='REVOKED';assert.equal((await f.verifier.authorize(f.input,f.caller)).active,false);
  f.row.status='ACTIVE';f.authority.authorize=async()=>({decision:'ALLOWED',scope:{refId:'changed',ownershipRevision:'b'.repeat(64)}});
  assert.equal((await f.verifier.authorize(f.input,f.caller)).active,false);
  f.pool.query=async()=>{throw new Error('protected database detail');};
  const result=await f.verifier.authorize(f.input,f.caller);assert.equal(result.statusCode,503);assert.ok(!JSON.stringify(result).includes('protected'));
});
test('source/ref mutation during proof and denied proof cannot yield active response',async()=>{
  const f=fixture();f.service.verifyDPoPProof=async()=>{f.row.status='REVOKED';return {valid:true};};
  assert.equal((await f.verifier.authorize(f.input,f.caller)).active,false);
  assert.ok(!f.audits.some(e=>e.result==='SUCCESS'));
});
test('patient Gateway credential has only its own scope; sharing old credentials is rejected',()=>{
  const key=randomBytes(32).toString('hex'),env={HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN:key,HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID:'H-A'};
  const p=new InternalServiceProvider(env).authenticate({headers:{'x-hipass-service-token':key}});
  assert.deepEqual(p.scopes,['gateway:patient-self-view-authorize']);assert.equal(p.hospitalId,'H-A');
  assert.throws(()=>new InternalServiceProvider({...env,HIPASS_DATA_PLANE_SERVICE_TOKEN:key}).authenticate({headers:{'x-hipass-service-token':key}}));
});

test('patient preparation receipt revalidates current authority without replaying browser DPoP; not delivery',async()=>{
  const f=fixture(),decision=await f.verifier.authorize(f.input,f.caller);
  f.service.verifyDPoPProof=async()=>{throw new Error('must not reuse proof');};
  const result=await f.verifier.ready({receipt:decision.receipt,bytesPrepared:128,outcome:'READY'},f.caller);
  assert.equal(result.accepted,true);assert.equal(result.delivery,'NOT VERIFIED');
  assert.ok(f.audits.some(e=>e.action==='PATIENT_SELF_VIEW_RESPONSE_PREPARED'));
  const payload=JSON.parse(Buffer.from(decision.receipt.split('.')[0],'base64url'));
  assert.ok(!JSON.stringify(payload).includes(f.input.token));assert.equal(payload.path,f.input.path);
  assert.ok(payload.deadline<=Date.now()+30000);
});

test('receipt tamper, foreign service, deadline, restart and revoked grant fail closed with audit',async()=>{
  for(const kind of ['tamper','service','deadline','restart','revoked','ref','size']){
    const f=fixture(),decision=await f.verifier.authorize(f.input,f.caller);
    let receipt=decision.receipt,caller=f.caller;
    if(kind==='tamper')receipt='a'+receipt;
    if(kind==='service')caller={...caller,subject:'data-plane-gateway'};
    if(kind==='deadline')f.verifier.clock=()=>Date.now()+31000;
    if(kind==='restart')f.verifier.receiptKey=randomBytes(32);
    if(kind==='revoked')f.row.status='REVOKED';
    if(kind==='ref')f.authority.authorize=async()=>({decision:'ALLOWED',scope:{refId:'foreign',ownershipRevision:'a'.repeat(64)}});
    const result=await f.verifier.ready({receipt,bytesPrepared:kind==='size'?33554433:128,outcome:'READY'},caller);
    assert.equal(result.accepted,false,kind);assert.ok(f.audits.some(e=>e.result==='FAIL'),kind);
  }
});

test('receipt audit failure, DB outage and mutation during readiness audit never release prepared output',async()=>{
  for(const kind of ['audit','db','mutation','key']){
    const f=fixture(),decision=await f.verifier.authorize(f.input,f.caller);
    if(kind==='audit')f.service.store.save=async()=>{throw new Error('secret detail');};
    if(kind==='db')f.pool.query=async()=>{throw new Error('secret detail');};
    if(kind==='mutation')f.service.store.save=async()=>{f.row.status='REVOKED';};
    if(kind==='key')f.verifier.keyProvider={getKey:()=>{throw new Error('secret detail');}};
    const result=await f.verifier.ready({receipt:decision.receipt,bytesPrepared:128,outcome:'READY'},f.caller);
    assert.equal(result.accepted,false,kind);assert.ok(!JSON.stringify(result).includes('secret detail'));
    assert.equal(result.statusCode,kind==='mutation'?403:503);
  }
});
