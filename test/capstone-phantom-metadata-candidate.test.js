import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPhantomMetadataCandidate,selectPhantomExchangeResources} from '../scripts/capstone-phantom-metadata-candidate.js';
import {createPhantomInstance,PHANTOM_VERSION} from '../scripts/test-support/synthetic-phantom.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const files=[],instances=[];
 for(const modality of ['CT','MR'])for(let slice=1;slice<=12;slice++){
  const {dicom,...row}=createPhantomInstance(modality,slice);files.push(dicom);instances.push({...row,file:modality.toLowerCase()+'-'+String(slice).padStart(2,'0')+'.dcm',bytes:dicom.length,sha256:hash(dicom)});
 }
 return {manifest:{generator:PHANTOM_VERSION,clinicalUseAllowed:false,patientIdentifier:'HP-TEST-PHANTOM-001',generatorSha256:'a'.repeat(64),instances},files,context:{manifestSha256:'b'.repeat(64),generatorSha256:'a'.repeat(64)}};
}
test('exact deterministic24 slices produce bounded candidate not clinical authorization',()=>{
 const f=fixture(),result=buildPhantomMetadataCandidate(f.manifest,f.files,f.context);
 assert.equal(result.instanceCount,24);assert.equal(result.studies.length,2);assert.equal(result.clinicalAuthorization,false);
 assert.equal(result.reviewStatus,'PENDING_HUMAN_REVIEW');assert.ok(!JSON.stringify(result).includes('HP-TEST-PHANTOM-001'));
});
test('foreign patient UIDs paths missing slices and tampered pixels refused',()=>{
 for(const mutate of [f=>f.manifest.patientIdentifier='OTHER',f=>f.manifest.clinicalUseAllowed=true,
  f=>f.manifest.instances[0].studyUid='1.2.3',f=>f.manifest.instances[0].file='../secret',
  f=>f.manifest.instances.pop(),f=>f.files[0][1000]^=1]){
  const f=fixture();mutate(f);assert.throws(()=>buildPhantomMetadataCandidate(f.manifest,f.files,f.context),/METADATA_INVALID/);
 }
});
test('explicit Series selection uses existing Session resource contract without granting access',()=>{
 const f=fixture(),candidate=buildPhantomMetadataCandidate(f.manifest,f.files,f.context),study=candidate.studies[0];
 const selection=[{studyInstanceUid:study.studyInstanceUid,seriesInstanceUids:[study.series[0].seriesInstanceUid]}];
 const result=selectPhantomExchangeResources(candidate,selection);
 assert.deepEqual(result,selection);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result[0].seriesInstanceUids));
 assert.equal(candidate.clinicalAuthorization,false);assert.equal(candidate.reviewStatus,'PENDING_HUMAN_REVIEW');
 assert.throws(()=>candidate.studies.pop(),TypeError);
 assert.throws(()=>candidate.studies[0].series[0].seriesInstanceUid='1.2.3',TypeError);
 for(const bad of [[{studyInstanceUid:study.studyInstanceUid}],
  [{studyInstanceUid:'1.2.3',seriesInstanceUids:[study.series[0].seriesInstanceUid]}],
  [{studyInstanceUid:study.studyInstanceUid,seriesInstanceUids:['1.2.3']}],
  [{studyInstanceUid:study.studyInstanceUid,seriesInstanceUids:[candidate.studies[1].series[0].seriesInstanceUid]}]]){
  assert.throws(()=>selectPhantomExchangeResources(candidate,bad));
 }
 assert.throws(()=>selectPhantomExchangeResources(JSON.parse(JSON.stringify(candidate)),selection),/METADATA_INVALID/);
});
