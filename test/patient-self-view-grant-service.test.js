import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PatientSelfViewGrantService } from '../src/patient-self-view-grant-service.js';
import { LocalDevelopmentKeyProvider } from '../src/key-provider.js';

function fixture(options={}) {
  let now=1791547200123; const records=[],audits=[];
  const input={principal:{role:'PATIENT',subject:'synthetic-phantom-account',patientId:'HP-TEST-PHANTOM-001',expiresAtMs:now+60500},
    patientId:'HP-TEST-PHANTOM-001',studyInstanceUid:'1.2.3'};
  const body={seriesInstanceUids:['1.2.3.1']};
  const meta={ingressTrusted:true,method:'POST',externalUrl:'https://synthetic.invalid/api/patients/HP-TEST-PHANTOM-001/studies/1.2.3/self-view-grants'};
  const secret=randomBytes(32).toString('hex');
  // Explicit unit doubles; the separate SQL probe tests actual crypto/PG replay.
  const proofService={dpopReplayStore:{persistent:options.persistent??true},store:{save:async()=>{}},
    writeAudit:async e=>audits.push(e),verifyIssuanceProof:options.verifyProof??(async()=>({valid:true,publicKeyThumbprint:'a'.repeat(43)}))};
  const issuer=new PatientSelfViewGrantService({authority:{authorize:async()=>({decision:'ALLOWED',scope:{subject:input.principal.subject,
    patientId:input.patientId,sourceHospitalId:'H-A',studyInstanceUid:'1.2.3',allowedSeriesUids:['1.2.3.1'],ownershipRevision:'a'.repeat(64)}})},
    persistence:{create:async(i,g)=>{records.push(g);if(options.failStore)throw new Error('protected DB detail');
      if(options.expire)now=g.expiresAtMs;return {grantId:g.grantId,auditSessionId:g.auditSessionId};}},
    proofService,keyProvider:options.keyProvider??new LocalDevelopmentKeyProvider(secret),allowedOrigin:'https://synthetic.invalid',
    enabled:options.enabled??true,clock:()=>now,deadlineMs:options.deadlineMs??20000});
  return {issuer,input,body,meta,secret,records,audits};
}

test('signed patient-only audience and cnf; TTL rounds down to auth expiry; stores only hash',async()=>{
  const f=fixture();const result=await f.issuer.issue(f.input,f.body,f.meta);
  const [h,p,s]=result.accessToken.split('.'),claims=JSON.parse(Buffer.from(p,'base64url'));
  assert.equal(s,createHmac('sha256',f.secret).update(`${h}.${p}`).digest('base64url'));
  assert.equal(claims.aud,'mediq-patient-self-view-gateway');assert.equal(claims.authorityType,'PATIENT_SELF_VIEW');
  assert.equal(claims.permission,'VIEW_ONLY');assert.equal(claims.cnf.jkt,'a'.repeat(43));
  assert.deepEqual(claims.allowedSeriesUids,['1.2.3.1']);assert.ok(claims.exp*1000<=f.input.principal.expiresAtMs);
  assert.equal(f.records[0].tokenHash,createHash('sha256').update(result.accessToken).digest('hex'));
  assert.ok(!JSON.stringify(f.records).includes(result.accessToken));assert.equal(f.audits.length,0);
});

test('body privilege injection and untrusted/mismatched ingress deny with audit before ledger',async()=>{
  for(const body of [{...fixture().body,permission:'DOWNLOAD_ALLOWED'},{seriesInstanceUids:['1.2.3.1','1.2.3.2']},null]){
    const f=fixture();await assert.rejects(f.issuer.issue(f.input,body,f.meta),e=>e.code==='INVALID_REQUEST');
    assert.equal(f.records.length,0);assert.equal(f.audits.length,1);
  }
  for(const change of [{ingressTrusted:false},{method:'GET'},{externalUrl:fixture().meta.externalUrl+'?token=unsafe'},
    {externalUrl:'https://foreign.invalid/api/test'}]){
    const f=fixture();await assert.rejects(f.issuer.issue(f.input,f.body,{...f.meta,...change}),e=>e.code==='TRUSTED_INGRESS_REQUIRED');
    assert.equal(f.records.length,0);assert.equal(f.audits.length,1);
  }
});

test('nonpersistent replay, invalid proof or signing key never issue',async()=>{
  for(const options of [{persistent:false},{verifyProof:async()=>({valid:false,reason:'DPOP_NONCE_REPLAYED'})},
    {keyProvider:{currentKey:()=>null}}]){
    const f=fixture(options);await assert.rejects(f.issuer.issue(f.input,f.body,f.meta));assert.equal(f.records.length,0);
  }
});

test('disabled, failed persistence or expiry during persistence return no token',async()=>{
  for(const options of [{enabled:false},{failStore:true},{expire:true}]){
    const f=fixture(options);await assert.rejects(f.issuer.issue(f.input,f.body,f.meta),e=>!e.message.includes('protected DB'));
  }
});

test('deadline prevents a delayed proof from later issuing or persisting a token',async()=>{
  let resume;
  const f=fixture({deadlineMs:50,verifyProof:()=>new Promise(resolve=>resume=resolve)});
  await assert.rejects(f.issuer.issue(f.input,f.body,f.meta),e=>e.code==='PATIENT_GRANT_DEADLINE');
  resume({valid:true,publicKeyThumbprint:'a'.repeat(43)});await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.records.length,0);
});
