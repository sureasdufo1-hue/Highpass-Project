import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPhantomInstance,PHANTOM_VERSION} from './test-support/synthetic-phantom.js';
import {parseExchangeResourceSelection} from '../src/v3-exchange-session-contract.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const fail=()=>{throw Error('CAPSTONE_PHANTOM_METADATA_INVALID');};
const verifiedCandidates=new WeakSet();
export function buildPhantomMetadataCandidate(manifest,files,{manifestSha256,generatorSha256}={}){
 if(manifest?.generator!==PHANTOM_VERSION||manifest.clinicalUseAllowed!==false||manifest.patientIdentifier!=='HP-TEST-PHANTOM-001'
  ||manifest.generatorSha256!==generatorSha256||!Array.isArray(manifest.instances)||manifest.instances.length!==24
  ||!Array.isArray(files)||files.length!==24||![manifestSha256,generatorSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))fail();
 const studies=[];let index=0;
 for(const modality of ['CT','MR']){
  const instances=[];let studyInstanceUid,seriesInstanceUid;
  for(let slice=1;slice<=12;slice++,index++){
   const expected=createPhantomInstance(modality,slice),row=manifest.instances[index],file=files[index];
   const filename=modality.toLowerCase()+'-'+String(slice).padStart(2,'0')+'.dcm';
   if(!row||row.file!==filename||row.modality!==modality||row.slice!==slice||row.studyUid!==expected.studyUid
    ||row.seriesUid!==expected.seriesUid||row.sopUid!==expected.sopUid||row.rows!==256||row.columns!==256
    ||row.bytes!==expected.dicom.length||row.sha256!==hash(expected.dicom)||!Buffer.isBuffer(file)||!file.equals(expected.dicom))fail();
   studyInstanceUid=expected.studyUid;seriesInstanceUid=expected.seriesUid;
   instances.push({sopInstanceUid:expected.sopUid,sha256:row.sha256});
  }
  studies.push({studyInstanceUid,modality,series:[{seriesInstanceUid,instanceCount:12,instances}]});
 }
 const candidate={schemaVersion:1,scope:'CAPSTONE_SYNTHETIC_ONLY',dataset:'SYNTHETIC_PHANTOM_24_SLICE_V1',manifestSha256,generatorSha256,
  studies,instanceCount:24,clinicalUseAllowed:false,clinicalAuthorization:false,reviewStatus:'PENDING_HUMAN_REVIEW',
  sourceFreshness:'LOCAL_FILES_VERIFIED_LIVE_A_NOT_REVERIFIED',qualifier:'METADATA_CANDIDATE_ONLY_NOT_IDENTITY_VERIFICATION_CONSENT_OR_CLINICAL_ACCESS'};
 // Keep the validated catalog immutable; parsed cloud JSON is not this provenance.
 for(const study of studies){for(const series of study.series){for(const instance of series.instances)Object.freeze(instance);Object.freeze(series.instances);Object.freeze(series);}Object.freeze(study.series);Object.freeze(study);}
 Object.freeze(studies);Object.freeze(candidate);verifiedCandidates.add(candidate);return candidate;
}
/** Explicit local selection for the existing Session contract; never grants access. */
export function selectPhantomExchangeResources(candidate,selection){
 if(!verifiedCandidates.has(candidate))fail();
 const resources=parseExchangeResourceSelection(selection);
 for(const resource of resources){
  const study=candidate.studies.find(row=>row.studyInstanceUid===resource.studyInstanceUid);
  // Demo defaults must not silently expand to a whole Study.
  if(!study||!resource.seriesInstanceUids||resource.seriesInstanceUids.some(uid=>!study.series.some(series=>series.seriesInstanceUid===uid)))fail();
 }
 return resources;
}
export function loadPhantomMetadataCandidate(directory){
 const target=path.resolve(directory),allowed=realpathSync(path.join(root,'artifacts/synthetic-phantom'));
 const resolved=realpathSync(target),relative=path.relative(allowed,resolved);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||lstatSync(target).isSymbolicLink())fail();
 const read=name=>{
  const file=path.join(resolved,name),stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>200000)fail();
  return readFileSync(file);
 };
 const bytes=read('manifest.json'),manifest=JSON.parse(bytes);
 // Never use untrusted manifest paths to read files.
 const files=['CT','MR'].flatMap(modality=>Array.from({length:12},(_,i)=>read(modality.toLowerCase()+'-'+String(i+1).padStart(2,'0')+'.dcm')));
 const generator=readFileSync(new URL('./test-support/synthetic-phantom.js',import.meta.url));
 return buildPhantomMetadataCandidate(manifest,files,{manifestSha256:hash(bytes),generatorSha256:hash(generator)});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(!process.argv[2])fail();const candidate=loadPhantomMetadataCandidate(process.argv[2]);
  if(process.argv[3]!==undefined){
   if(process.argv[3]!=='--session-resources'||!process.argv[4]||process.argv.length!==5)fail();
   console.log(JSON.stringify({resources:selectPhantomExchangeResources(candidate,JSON.parse(process.argv[4])),
    manifestSha256:candidate.manifestSha256,clinicalAuthorization:false}));
  }else console.log(JSON.stringify(candidate));
 }
 catch{console.error('CAPSTONE_PHANTOM_METADATA_INVALID');process.exitCode=1;}
}
