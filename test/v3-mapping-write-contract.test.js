import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3IdentifierProtection} from '../src/v3-identifier-protection.js';
import {prepareMappingReconcile,prepareMappingReview,v3MappingWritePolicy} from '../src/v3-mapping-write-contract.js';

function fixture({scopes=['mapping:write','mapping:review'],role='HOSPITAL_ADMIN'}={}){
  const context={tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID()};
  const secret=randomBytes(32).toString('hex');
  const record={...context,actorId:randomUUID(),issuer:'synthetic-write',subject:'synthetic-admin',authHospitalId:'SYNTHETIC-A',role,scopes,status:'ACTIVE'};
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
  const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role,hospitalId:record.authHospitalId,
    doctorId:role==='DOCTOR'?'SYNTHETIC-DOCTOR':undefined,
    scope:scopes.join(' '),exp:Math.floor(Date.now()/1000)+60}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
    {...v3MappingWritePolicy,allowedRoles:[role]});
  const protection=new V3IdentifierProtection({encryptionKeys:new Map([['synthetic',randomBytes(32)]]),activeKeyId:'synthetic',lookupKey:randomBytes(32)});
  return {context,binding,protection,request:{...context,...protection.protect('SYNTHETIC-LOCAL-ONLY',context)}};
}
test('reconcile accepts bound protected input and never auto-verifies or returns plaintext',()=>{
  const f=fixture();try{
    const result=prepareMappingReconcile(f.binding,f.request,f.protection);
    assert.equal(result.state,'UNVERIFIED');assert.ok(Buffer.isBuffer(result.protectedLocalRef));assert.equal(result.localRefDigest.length,32);
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC-LOCAL-ONLY'));
  }finally{f.protection.dispose();}
});
test('reconcile refuses tenant/hospital mismatch, extras, raw ref and unbranded principal',()=>{
  const f=fixture();try{
    for(const key of ['tenantId','hospitalId'])assert.throws(()=>prepareMappingReconcile(f.binding,{...f.request,[key]:randomUUID()},f.protection),e=>e.code==='V3_MAPPING_CONTEXT_MISMATCH');
    for(const key of ['state','actorId','localRef','demographics'])assert.throws(()=>prepareMappingReconcile(f.binding,{...f.request,[key]:'SYNTHETIC'},f.protection),e=>e.statusCode===422);
    assert.throws(()=>prepareMappingReconcile({...f.binding},f.request,f.protection),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  }finally{f.protection.dispose();}
});
test('reconcile rejects AAD/digest tampering and unavailable provider without private diagnostic',()=>{
  const f=fixture();try{
    for(const request of [{...f.request,patientRefId:randomUUID()},{...f.request,localRefDigest:randomBytes(32).toString('base64url')},{...f.request,protectedLocalRef:'invalid'}]){
      assert.throws(()=>prepareMappingReconcile(f.binding,request,f.protection),e=>e.code==='V3_IDENTIFIER_PROTECTION_INVALID'&&!e.message.includes('SYNTHETIC-LOCAL'));
    }
    assert.throws(()=>prepareMappingReconcile(f.binding,f.request,null),e=>e.statusCode===503);
    f.protection.dispose();assert.throws(()=>prepareMappingReconcile(f.binding,f.request,f.protection),e=>e.statusCode===503);
  }finally{f.protection.dispose();}
});
test('review requires explicit version/state/evidence and keeps all states typed',()=>{
  const f=fixture(),mapping=randomUUID(),evidenceDigest=randomBytes(32).toString('base64url');try{
    for(const state of ['NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED']){
      const result=prepareMappingReview(f.binding,mapping,{expectedVersion:1,state,evidenceDigest});
      assert.equal(result.state,state);assert.equal(result.evidenceDigest.length,32);
    }
    for(const expectedVersion of [0,-1,1.5,'1',2147483647,NaN])assert.throws(()=>prepareMappingReview(f.binding,mapping,{expectedVersion,state:'VERIFIED',evidenceDigest}),e=>e.statusCode===422);
    for(const evidence of ['',evidenceDigest+'=',evidenceDigest+'A'])assert.throws(()=>prepareMappingReview(f.binding,mapping,{expectedVersion:1,state:'VERIFIED',evidenceDigest:evidence}),e=>e.statusCode===422);
    assert.throws(()=>prepareMappingReview(f.binding,mapping,{expectedVersion:1,state:'VERIFIED',evidenceDigest,verifiedBy:randomUUID()}),e=>e.statusCode===422);
  }finally{f.protection.dispose();}
});
test('write/review require separate scope and restricted role, reject accessors',()=>{
  const f=fixture({scopes:['mapping:write']}),doctor=fixture({role:'DOCTOR'});try{
    assert.throws(()=>prepareMappingReview(f.binding,randomUUID(),{}),e=>e.code==='V3_SCOPE_NOT_ALLOWED');
    assert.throws(()=>prepareMappingReconcile(doctor.binding,doctor.request,doctor.protection),e=>e.code==='V3_ROLE_NOT_ALLOWED');
    const request={...f.request};Object.defineProperty(request,'patientRefId',{get(){throw new Error('SYNTHETIC-PRIVATE');}});
    assert.throws(()=>prepareMappingReconcile(f.binding,request,f.protection),e=>e.code==='V3_MAPPING_REQUEST_INVALID');
  }finally{f.protection.dispose();doctor.protection.dispose();}
});
