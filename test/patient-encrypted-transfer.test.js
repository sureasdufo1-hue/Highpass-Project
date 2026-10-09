import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,publicEncrypt,privateDecrypt,constants,randomBytes,randomUUID,createHash} from 'node:crypto';
import {createPatientImageEncryptor,createPatientImageDecryptor} from '../src/patient-encrypted-transfer.js';
import {PatientBoundKeyRelease} from '../src/patient-bound-key-release.js';
import {parsePatientDataPlaneRequest} from '../src/patient-self-view-authorization.js';

function setup({clockOffsetMs=0}={}){
  const token=randomBytes(32).toString('base64url'),path='/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances/1.2.3.1.1/rendered';
  const keyId='https://synthetic-demo.vault.azure.net/keys/demo/'+'a'.repeat(32);
  const issuedAt=Date.now();
  const c={type:'PATIENT_RESPONSE_PREPARATION',tokenHash:createHash('sha256').update(token).digest('hex'),path,issuedAt,deadline:issuedAt+30000,
    claims:{authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',permission:'VIEW_ONLY',jti:randomUUID(),sub:'synthetic-account',patientId:'SYNTHETIC-PATIENT',
      sourceHospitalId:'H-A',viewingGatewayId:'hospital-b-portal',studyInstanceUid:'1.2.3',allowedSeriesUids:['1.2.3.1'],auditSessionId:randomUUID()}};
  const receipt=Buffer.from(JSON.stringify(c)).toString('base64url')+'.fixture-mac';
  let active=true,outage=false,afterUnwrap=()=>{};
  const authorizer={revalidatePreparationReceipt:async value=>{if(!active || value!==receipt || Date.now()>=c.deadline)throw new Error('PATIENT_GRANT_INACTIVE');return {...c,route:parsePatientDataPlaneRequest({method:'GET',path},'https://synthetic.invalid')};}};
  const service={writeAudit:async()=>{},store:{save:async()=>{if(outage)throw new Error('audit outage');}}};
  const rows=new Map(); // Explicit ledger/auth fixture, not SQL persistence evidence.
  const repository={persistent:true,create:async row=>rows.set(row.releaseId,{...structuredClone(row),status:'PENDING'}),read:async id=>structuredClone(rows.get(id)),
    activate:async id=>{rows.get(id).status='PREPARED';return true;},precheck:async id=>{const r=rows.get(id);if(!['PREPARED','PRECHECKED'].includes(r.status))return false;r.status='PRECHECKED';return true;},
    consume:async id=>{const r=rows.get(id);if(r.status!=='PRECHECKED')return false;r.status='CONSUMED';return true;}};
  const policy=new PatientBoundKeyRelease({authorizer,service,repository,keyId});
  const control=async(endpoint,body)=>{
    try{
      if(endpoint.endsWith('/wrap-authorize'))return {status:200,body:{authorized:await policy.authorizeWrap(body)}};
      if(endpoint.endsWith('/prepare'))return {status:200,body:await policy.prepare(body)};
      assert.equal(endpoint,'/gateway/patient-self-view/package/authorize');
      return {status:200,body:{authorized:await policy.authorize({...body,authenticatedViewingGatewayId:'hospital-b-portal'})}};
    }catch{return {status:403,body:{authorized:false}};}
  };
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const keyTransport=async({url,body})=>{
    const unwrap=url.includes('/unwrapkey?'),input=Buffer.from(body.value,'base64url');
    const result=(unwrap?privateDecrypt:publicEncrypt)({key:unwrap?keys.privateKey:keys.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},input);
    try{if(unwrap)afterUnwrap();return {kid:keyId,value:result.toString('base64url')};}finally{input.fill(0);result.fill(0);}
  };
  const a=createPatientImageEncryptor({keyId,tokenProvider:async()=> 'synthetic-token',keyTransport,control,now:()=>Date.now()+clockOffsetMs});
  const b=createPatientImageDecryptor({keyId,tokenProvider:async()=> 'synthetic-token',keyTransport,control,publicBaseUrl:'https://synthetic.invalid',now:()=>Date.now()+clockOffsetMs});
  const body=Buffer.from('synthetic image fixture, not clinical pixels'),scope={...c.claims,tokenId:c.claims.jti,subject:c.claims.sub};
  const seal=(suppliedReceipt=receipt)=>a.sealPatient({body,contentType:'image/png',route:parsePatientDataPlaneRequest({method:'GET',path},'https://synthetic.invalid'),scope,receipt:suppliedReceipt});
  return {seal,b,body,path,token,c,receipt,rows,revoke:()=>{active=false;},auditOutage:()=>{outage=true;},afterUnwrap:callback=>{afterUnwrap=callback;}};
}
test('patient RSA-OAEP/AES-GCM roundtrip binds separate authority and consumes once without consent surrogate',async()=>{
  const f=setup(),sealed=await f.seal();assert.ok(!sealed.body.includes(f.body));assert.ok(!sealed.body.includes(Buffer.from(f.token)));
  const payload=JSON.parse(sealed.body);assert.equal(payload.type,'PATIENT_IMAGE');assert.equal(payload.manifest.consentId,undefined);
  const result=await f.b.openPatient(sealed,f.path,{token:f.token});assert.deepEqual(result.body,f.body);result.body.fill(0);
  await assert.rejects(f.b.openPatient(sealed,f.path,{token:f.token}));
});

test('signed receipt lifetime is independent of receiver clock; current Control expiry still denies',async()=>{
  const f=setup({clockOffsetMs:-3000});
  const sealed=await f.seal();
  const result=await f.b.openPatient(sealed,f.path,{token:f.token});assert.deepEqual(result.body,f.body);result.body.fill(0);
  const g=setup({clockOffsetMs:-3000}),pending=await g.seal();
  g.c.deadline=Date.now()-1; // Authoritative Control fixture expired, receiver still behind.
  await assert.rejects(g.b.openPatient(pending,g.path,{token:g.token}));
  assert.notEqual([...g.rows.values()][0].status,'CONSUMED');
});

test('missing issuance time and lifetime above30s fail before patient release preparation',async()=>{
  const f=setup();
  for(const invalid of [{...f.c,issuedAt:undefined},{...f.c,deadline:f.c.issuedAt+30001},{...f.c,deadline:f.c.issuedAt}]){
    const receipt=Buffer.from(JSON.stringify(invalid)).toString('base64url')+'.fixture-mac';
    await assert.rejects(f.seal(receipt),/PATIENT_PACKAGE_LIFETIME_INVALID/);
  }
  assert.equal(f.rows.size,0);
});
test('patient crypto rejects altered ciphertext/manifest, another SOP/token and doctor envelope',async()=>{
  const f=setup(),sealed=await f.seal();
  for(const field of ['cipher','manifest','type']){
    const payload=JSON.parse(sealed.body);
    if(field==='cipher')payload.cipher.tag=Buffer.alloc(16).toString('base64url');
    if(field==='manifest')payload.manifest.plainBytes++;
    if(field==='type')payload.type='DOCTOR_IMAGE';
    await assert.rejects(f.b.openPatient({...sealed,body:Buffer.from(JSON.stringify(payload))},f.path,{token:f.token}));
  }
  await assert.rejects(f.b.openPatient(sealed,f.path.replace('1.2.3.1.1','1.2.3.1.2'),{token:f.token}));
  await assert.rejects(f.b.openPatient(sealed,f.path,{token:'another-token'}));
});
test('patient revoke before or during Vault response, deadline and audit failure never return plaintext',async()=>{
  for(const mode of ['before','during','expiry','audit']){
    const f=setup(),sealed=await f.seal();
    if(mode==='before')f.revoke();if(mode==='during')f.afterUnwrap(f.revoke);
    if(mode==='expiry')f.c.deadline=Date.now()-1;if(mode==='audit')f.auditOutage();
    await assert.rejects(f.b.openPatient(sealed,f.path,{token:f.token}),mode);
  }
});
