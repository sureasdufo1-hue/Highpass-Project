import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {AzureKeyVaultDataPlane} from './azure-key-vault-data-plane.js';
import {encryptAesGcm,decryptAesGcm,canonicalJson} from './mobile-package-crypto.js';
import {parsePatientDataPlaneRequest} from './patient-self-view-authorization.js';
import {encryptedDicomType} from './capstone-encrypted-transfer.js';

const limit=8*1024*1024,hash=value=>createHash('sha256').update(value).digest('hex');
const types=/^(?:image\/(?:png|jpeg)|multipart\/related)(?:\s*;[^\r\n]*)?$/i;
const opaque=()=> 'pkg_'+randomUUID().replaceAll('-','');
function decode(value,max){
  if(typeof value!=='string' || value.length>max*2 || !/^[A-Za-z0-9_-]+$/.test(value))throw new Error('PATIENT_PACKAGE_INVALID');
  const buffer=Buffer.from(value,'base64url');if(buffer.length>max || buffer.toString('base64url')!==value)throw new Error('PATIENT_PACKAGE_INVALID');return buffer;
}
function context(receipt){
  if(typeof receipt!=='string' || receipt.length>8192 || receipt.split('.').length!==2)throw new Error('PATIENT_PACKAGE_INVALID');
  // Parsing is not authentication. The Control policy validates original MAC,
  // current grant/owner/key/deadline before wrap and both unwrap phases.
  const result=JSON.parse(Buffer.from(receipt.split('.')[0],'base64url'));
  if(result.type!=='PATIENT_RESPONSE_PREPARATION' || result.claims?.authorityType!=='PATIENT_SELF_VIEW'
    || result.claims.actorType!=='PATIENT' || result.claims.permission!=='VIEW_ONLY')throw new Error('PATIENT_PACKAGE_AUTHORITY_INVALID');
  return result;
}
function authority(c){return {type:'PATIENT_SELF_VIEW',grantId:c.claims.jti,
  actorHash:hash(canonicalJson([c.claims.sub,c.claims.patientId])),sourceHospitalId:c.claims.sourceHospitalId,
  viewingGatewayId:c.claims.viewingGatewayId,auditSessionId:c.claims.auditSessionId,path:c.path,expiresAt:c.deadline};}
function binding(payload){return {packageId:payload.manifest.packageId,keyId:payload.wrapped.keyId,viewingGatewayId:payload.manifest.authority.viewingGatewayId,
  wrappedKeyHash:hash(decode(payload.wrapped.wrappedKey,512)),ciphertextHash:hash(canonicalJson(payload.cipher)),manifestHash:hash(canonicalJson(payload.manifest))};}
export function createPatientImageEncryptor({keyId,tokenProvider,control,keyTransport,now=Date.now}){
  return {async sealPatient({body,contentType,route,scope,receipt,signal}){
    if(!Buffer.isBuffer(body) || !body.length || body.length>limit || !types.test(contentType) || !route.sopInstanceUid
      || scope?.authorityType!=='PATIENT_SELF_VIEW' || scope.permission!=='VIEW_ONLY' || signal?.aborted)throw new Error('PATIENT_PACKAGE_INVALID');
    const c=context(receipt),packageId=opaque();
    if(c.path!==new URL(route.externalUrl).pathname || c.claims.jti!==scope.tokenId || c.claims.sub!==scope.subject
      || c.claims.patientId!==scope.patientId || c.claims.studyInstanceUid!==route.studyInstanceUid
      || c.claims.allowedSeriesUids?.[0]!==route.seriesInstanceUid || c.deadline<=now() || c.deadline-now()>30000)throw new Error('PATIENT_PACKAGE_SCOPE_INVALID');
    const manifest={version:1,packageId,authority:authority(c),studyInstanceUid:route.studyInstanceUid,seriesInstanceUid:route.seriesInstanceUid,
      sopInstanceUid:route.sopInstanceUid,contentType,plainSha256:hash(body),plainBytes:body.length};
    const client=new AzureKeyVaultDataPlane({keyId,tokenProvider,timeoutMs:25000,...(keyTransport?{transport:keyTransport}:{}),authorizeOperation:async operation=>{
      if(signal?.aborted || operation.operation!=='wrapkey' || operation.packageId!==packageId)return false;
      const result=await control('/gateway/patient-self-view/package/wrap-authorize',{receipt,packageId,keyId});
      return !signal?.aborted && result.status===200 && result.body.authorized===true;
    }});
    const dek=randomBytes(32);
    try{
      const encrypted=encryptAesGcm(body,dek,Buffer.from(canonicalJson(manifest)));
      const cipher=Object.fromEntries(Object.entries(encrypted).map(([name,value])=>[name,value.toString('base64url')]));
      const wrapped=await client.wrapDek({packageId,dek});
      if(signal?.aborted || now()>=c.deadline)throw new Error('PATIENT_PACKAGE_EXPIRED');
      const payload={version:1,type:'PATIENT_IMAGE',receipt,manifest,cipher,wrapped};
      const prepared=await control('/gateway/patient-self-view/package/prepare',{receipt,packageBinding:binding(payload)});
      if(signal?.aborted || prepared.status!==200 || typeof prepared.body.releaseId!=='string' || now()>=c.deadline)throw new Error('PATIENT_PACKAGE_RELEASE_DENIED');
      return {contentType:encryptedDicomType,body:Buffer.from(JSON.stringify({...payload,releaseId:prepared.body.releaseId}))};
    }finally{dek.fill(0);}
  }};
}
export function createPatientImageDecryptor({keyId,tokenProvider,control,publicBaseUrl,keyTransport,now=Date.now}){
  return {async openPatient(result,requestPath,{token}={}){
    if(result.contentType!==encryptedDicomType || !Buffer.isBuffer(result.body) || result.body.length>12*1024*1024)throw new Error('PATIENT_PACKAGE_REQUIRED');
    const payload=JSON.parse(result.body.toString('utf8'));
    if(Object.keys(payload).sort().join()!==['version','type','receipt','manifest','cipher','wrapped','releaseId'].sort().join()
      || payload.version!==1 || payload.type!=='PATIENT_IMAGE' || payload.wrapped?.keyId!==keyId || payload.manifest?.version!==1
      || payload.wrapped.packageId!==payload.manifest.packageId || !types.test(payload.manifest.contentType)
      || Object.keys(payload.cipher??{}).sort().join()!=='ciphertext,nonce,tag')throw new Error('PATIENT_PACKAGE_INVALID');
    const c=context(payload.receipt),route=parsePatientDataPlaneRequest({method:'GET',path:requestPath},publicBaseUrl);
    if(typeof token!=='string' || token.length>16384 || hash(token)!==c.tokenHash || c.path!==requestPath || c.deadline<=now()
      || canonicalJson(payload.manifest.authority)!==canonicalJson(authority(c)) || c.claims.viewingGatewayId!=='hospital-b-portal'
      || payload.manifest.studyInstanceUid!==route.studyInstanceUid || payload.manifest.seriesInstanceUid!==route.seriesInstanceUid
      || payload.manifest.sopInstanceUid!==route.sopInstanceUid)throw new Error('PATIENT_PACKAGE_SCOPE_INVALID');
    const cipher={ciphertext:decode(payload.cipher.ciphertext,limit),nonce:decode(payload.cipher.nonce,12),tag:decode(payload.cipher.tag,16)};
    if(cipher.nonce.length!==12 || cipher.tag.length!==16)throw new Error('PATIENT_PACKAGE_INVALID');
    const packageBinding=binding(payload);let phase=0,plaintext;
    const client=new AzureKeyVaultDataPlane({keyId,tokenProvider,timeoutMs:25000,...(keyTransport?{transport:keyTransport}:{}),authorizeOperation:async operation=>{
      if(operation.operation!=='unwrapkey' || operation.packageId!==packageBinding.packageId
        || Buffer.from(operation.wrappedKeyHash,'base64url').toString('hex')!==packageBinding.wrappedKeyHash)return false;
      const decision=await control('/gateway/patient-self-view/package/authorize',{receipt:payload.receipt,releaseId:payload.releaseId,packageBinding,
        phase:phase++===0?'BEFORE_UNWRAP':'AFTER_UNWRAP'});
      return decision.status===200 && decision.body.authorized===true;
    }});
    try{
      await client.consumeUnwrappedDek({packageId:packageBinding.packageId,envelope:payload.wrapped,consume:dek=>{
        if(now()>=c.deadline)throw new Error('PATIENT_PACKAGE_EXPIRED');
        plaintext=decryptAesGcm(cipher,dek,Buffer.from(canonicalJson(payload.manifest)));
        if(plaintext.length!==payload.manifest.plainBytes || hash(plaintext)!==payload.manifest.plainSha256)throw new Error('PATIENT_PACKAGE_INTEGRITY_INVALID');
      }});
      return {contentType:payload.manifest.contentType,body:plaintext};
    }catch(error){plaintext?.fill(0);throw error;}
  }};
}
