import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PatientBoundKeyRelease} from '../src/patient-bound-key-release.js';

function fixture(){
  const records=new Map(),audits=[],keyId='https://synthetic-demo.vault.azure.net/keys/demo/'+'a'.repeat(32);
  const context={claims:{jti:randomUUID(),sub:'synthetic-patient',patientId:'SYNTHETIC-PATIENT',sourceHospitalId:'H-A',
    viewingGatewayId:'hospital-b-portal',auditSessionId:randomUUID(),authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',permission:'VIEW_ONLY'},
    deadline:Date.now()+30000,path:'/patient-dicomweb/studies/1.2/series/1.2.3/instances/1.2.3.4/rendered',
    route:{kind:'instance',studyInstanceUid:'1.2',seriesInstanceUid:'1.2.3',sopInstanceUid:'1.2.3.4'}};
  const authorizer={revalidatePreparationReceipt:async()=>context};
  const service={writeAudit:async row=>audits.push(row),store:{save:async()=>{}}};
  const repository={persistent:true,create:async r=>records.set(r.releaseId,{...structuredClone(r),status:'PENDING'}),
    read:async id=>structuredClone(records.get(id)),activate:async id=>{records.get(id).status='PREPARED';return true;},
    precheck:async id=>{const row=records.get(id);if(!['PREPARED','PRECHECKED'].includes(row.status))return false;row.status='PRECHECKED';return true;},
    consume:async id=>{const row=records.get(id);if(row.status!=='PRECHECKED')return false;row.status='CONSUMED';return true;}};
  const policy=new PatientBoundKeyRelease({authorizer,service,repository,keyId});
  const packageBinding={packageId:'pkg_'+randomUUID().replaceAll('-',''),keyId,viewingGatewayId:'hospital-b-portal',wrappedKeyHash:'a'.repeat(64),ciphertextHash:'b'.repeat(64),manifestHash:'c'.repeat(64)};
  return {policy,authorizer,service,records,context,audits,input:{receipt:'fixture-receipt',packageBinding}};
}
test('patient key release separates authority and binds exact package hashes; precheck then one consume',async()=>{
  const f=fixture(),release=await f.policy.prepare(f.input),input={...f.input,...release,authenticatedViewingGatewayId:'hospital-b-portal'};
  await assert.rejects(f.policy.authorize({...input,phase:'AFTER_UNWRAP'}));
  assert.equal(await f.policy.authorize({...input,phase:'BEFORE_UNWRAP'}),true);
  const outcomes=await Promise.allSettled([f.policy.authorize({...input,phase:'AFTER_UNWRAP'}),f.policy.authorize({...input,phase:'AFTER_UNWRAP'})]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
});
test('patient release denies doctor authority, metadata-only path and forged package binding',async()=>{
  for(const type of ['doctor','metadata','hash','gateway']){
    const f=fixture();
    if(type==='doctor')f.context.claims.authorityType='DOCTOR';
    if(type==='metadata')f.context.path=f.context.path.replace('/rendered','/metadata');
    if(type==='hash')f.input.packageBinding.wrappedKeyHash='invalid';
    if(type==='gateway')f.input.packageBinding.viewingGatewayId='doctor-gateway';
    await assert.rejects(f.policy.prepare(f.input));assert.equal(f.records.size,0);
  }
});
test('patient release audit outage leaves PENDING row, never an unwrap authorization',async()=>{
  const f=fixture();f.service.store.save=async()=>{throw new Error('audit unavailable');};
  await assert.rejects(f.policy.prepare(f.input));assert.equal([...f.records.values()][0].status,'PENDING');
});
test('patient ownership changes after consume audit deny plaintext; consumed row is not reset',async()=>{
  const f=fixture(),release=await f.policy.prepare(f.input),input={...f.input,...release,authenticatedViewingGatewayId:'hospital-b-portal'};
  await f.policy.authorize({...input,phase:'BEFORE_UNWRAP'});
  f.service.store.save=async()=>{f.authorizer.revalidatePreparationReceipt=async()=>{throw new Error('PATIENT_GRANT_INACTIVE');};};
  await assert.rejects(f.policy.authorize({...input,phase:'AFTER_UNWRAP'}));assert.equal(f.records.get(release.releaseId).status,'CONSUMED');
});
test('patient precheck denies changed subject, another hash or unauthorized viewing Gateway',async()=>{
  for(const mode of ['subject','hash','gateway']){
    const f=fixture(),release=await f.policy.prepare(f.input),input={...f.input,...release,phase:'BEFORE_UNWRAP',authenticatedViewingGatewayId:'hospital-b-portal'};
    if(mode==='subject')f.context.claims.sub='someone-else';
    if(mode==='hash')input.packageBinding={...input.packageBinding,ciphertextHash:'d'.repeat(64)};
    if(mode==='gateway')input.authenticatedViewingGatewayId='doctor-gateway';
    await assert.rejects(f.policy.authorize(input));assert.equal(f.records.get(release.releaseId).status,'PREPARED');
  }
});
