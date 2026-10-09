import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireInternalServiceScope, verifyJwt } from './auth.js';
import { parseDataPlaneRequest } from './data-plane-authorization.js';
import { AuditAction } from './domain.js';

const validUid=value=>typeof value==='string' && value.length<=64 && /^[0-9]+(?:\.[0-9]+)+$/.test(value)
  && value.split('.').every(part=>part==='0'||!part.startsWith('0'));
export function parsePatientDataPlaneRequest(input,origin) {
  if(typeof input?.path!=='string' || !input.path.startsWith('/patient-dicomweb/'))throw new Error('PATIENT_ROUTE_INVALID');
  const route=parseDataPlaneRequest({...input,path:input.path.replace(/^\/patient-dicomweb\//,'/dicomweb/')},origin);
  if(route.requestedAction!=='VIEW' || !route.studyInstanceUid
    || [route.studyInstanceUid,route.seriesInstanceUid,route.sopInstanceUid].filter(Boolean).some(v=>!validUid(v))
    || (route.kind==='instance' && !/\/(?:metadata|rendered)$/.test(input.path)))throw new Error('PATIENT_ROUTE_INVALID');
  return {...route,externalUrl:new URL(input.path,origin).href};
}

// Control-plane metadata only: no PACS requests or clinical bytes. The dedicated
// Gateway service must authenticate before it can submit this context.
export class PatientSelfViewAuthorization {
  constructor({pool,authority,service,keyProvider,publicBaseUrl,sourceHospitalId,viewingGatewayId='hospital-b-portal',enabled=false,clock=Date.now}) {
    Object.assign(this,{pool,authority,service,keyProvider,publicBaseUrl,sourceHospitalId,viewingGatewayId,enabled:enabled===true,clock});
    // Process-local receipt key: restart invalidates in-flight preparation. Not a
    // patient token, durable key release, or an API-HA/exactly-once guarantee.
    this.receiptKey=randomBytes(32);
  }
  async readLive(claims,tokenHash) {
    const result=await this.pool.query({text:'SELECT * FROM capstone_patient_self_view_grants WHERE grant_id=$1 AND token_hash=$2',
      values:[claims.jti,tokenHash],query_timeout:5000});
    if(result.rows.length!==1)return null;
    const row=result.rows[0];
    if(row.status!=='ACTIVE' || row.subject!==claims.sub || row.patient_id!==claims.patientId
      || row.authority_type!=='PATIENT_SELF_VIEW' || row.permission!=='VIEW_ONLY' || row.source_hospital_id!==this.sourceHospitalId
      || row.viewing_gateway_id!==this.viewingGatewayId || row.study_instance_uid!==claims.studyInstanceUid
      || row.series_instance_uid!==claims.allowedSeriesUids[0] || row.proof_key_thumbprint!==claims.cnf.jkt
      || row.audit_session_id!==claims.auditSessionId || new Date(row.issued_at).getTime()!==claims.iat*1000
      || new Date(row.expires_at).getTime()!==claims.exp*1000 || this.clock()>=claims.exp*1000)return null;
    const current=await this.authority.authorize({patientId:claims.patientId,studyInstanceUid:claims.studyInstanceUid,
      seriesInstanceUid:claims.allowedSeriesUids[0],requestedAction:'VIEW',principal:{role:'PATIENT',subject:claims.sub,patientId:claims.patientId,
        authMethod:'PATIENT_SELF_VIEW_GRANT',authorityType:'PATIENT_SELF_VIEW',issuer:claims.iss,audience:claims.aud,expiresAtMs:claims.exp*1000}});
    if(current.statusCode===503)throw new Error('AUTHORITY_DATABASE_UNAVAILABLE');
    return current.decision==='ALLOWED' && current.scope.refId===row.ref_id && current.scope.ownershipRevision===row.ownership_revision ? current : null;
  }
  async revalidatePreparationReceipt(value) {
    if(!this.enabled || typeof value!=='string' || value.length>8192)throw new Error('PATIENT_RECEIPT_INVALID');
    const parts=value.split('.');if(parts.length!==2)throw new Error('PATIENT_RECEIPT_INVALID');
    const expected=Buffer.from(createHmac('sha256',this.receiptKey).update(parts[0]).digest('base64url')),supplied=Buffer.from(parts[1]);
    if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))throw new Error('PATIENT_RECEIPT_INVALID');
    const receipt=JSON.parse(Buffer.from(parts[0],'base64url'));
    if(receipt.type!=='PATIENT_RESPONSE_PREPARATION' || !Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.deadline)
      || receipt.deadline<=receipt.issuedAt || receipt.deadline-receipt.issuedAt>30000 || receipt.issuedAt>this.clock()
      || this.clock()>=receipt.deadline || receipt.deadline>receipt.claims.exp*1000)throw new Error('PATIENT_RECEIPT_EXPIRED');
    const route=parsePatientDataPlaneRequest({method:'GET',path:receipt.path},this.publicBaseUrl);
    const key=typeof this.keyProvider?.getKeyAsync==='function'?await this.keyProvider.getKeyAsync(receipt.kid):this.keyProvider?.getKey(receipt.kid);
    if(!key || !['ACTIVE','VERIFY_ONLY'].includes(key.status) || key.retiredAt)throw new Error('PATIENT_SIGNING_KEY_INACTIVE');
    if(!await this.readLive(receipt.claims,receipt.tokenHash) || this.clock()>=receipt.deadline)throw new Error('PATIENT_GRANT_INACTIVE');
    return {...receipt,route};
  }
  async ready(input,caller) {
    if(!this.enabled)return {accepted:false,statusCode:503,reason:'PATIENT_GRANT_DISABLED'};
    let receipt;
    const deny=async(reason,statusCode=403)=>{
      try {
        await this.service.writeAudit({actorType:receipt?'PATIENT':'SYSTEM',actorId:receipt?.claims?.sub??'patient-receipt-verifier',
          auditSessionId:receipt?.claims?.auditSessionId,action:AuditAction.ACCESS_DENIED,result:'FAIL',reasonCode:reason,skipAnomalyDetection:true});
        await this.service.store.save();
      }catch{return {accepted:false,statusCode:503,reason:'AUTHORITY_PERSISTENCE_UNAVAILABLE'};}
      return {accepted:false,statusCode,reason};
    };
    try {
      requireInternalServiceScope(caller,'gateway:patient-self-view-authorize');
      if(caller.authMethod!=='INTERNAL_SERVICE_TOKEN' || caller.subject!=='patient-self-view-gateway'
        || caller.hospitalId!==this.sourceHospitalId)throw new Error('INVALID');
      if(typeof input?.receipt!=='string' || input.receipt.length>8192 || !Number.isSafeInteger(input.bytesPrepared)
        || input.bytesPrepared<0 || input.bytesPrepared>33554432 || !['READY','UPSTREAM_FAILURE'].includes(input.outcome))throw new Error('INVALID');
      const parts=input.receipt.split('.');if(parts.length!==2)throw new Error('INVALID');
      const expected=createHmac('sha256',this.receiptKey).update(parts[0]).digest('base64url');
      const supplied=Buffer.from(parts[1]);const calculated=Buffer.from(expected);
      if(supplied.length!==calculated.length || !timingSafeEqual(supplied,calculated))throw new Error('INVALID');
      receipt=JSON.parse(Buffer.from(parts[0],'base64url'));
      if(receipt.type!=='PATIENT_RESPONSE_PREPARATION' || !Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.deadline)
        || receipt.deadline<=receipt.issuedAt || receipt.deadline-receipt.issuedAt>30000 || receipt.issuedAt>this.clock()
        || this.clock()>=receipt.deadline || receipt.deadline>receipt.claims.exp*1000)throw new Error('INVALID');
      parsePatientDataPlaneRequest({method:'GET',path:receipt.path},this.publicBaseUrl);
    }catch{return deny('PATIENT_RECEIPT_INVALID');}
    try {
      const key=typeof this.keyProvider?.getKeyAsync==='function'?await this.keyProvider.getKeyAsync(receipt.kid):this.keyProvider?.getKey(receipt.kid);
      if(!key || !['ACTIVE','VERIFY_ONLY'].includes(key.status) || key.retiredAt)return deny('PATIENT_SIGNING_KEY_INACTIVE');
      if(!await this.readLive(receipt.claims,receipt.tokenHash))return deny('PATIENT_GRANT_INACTIVE');
      const route=parsePatientDataPlaneRequest({method:'GET',path:receipt.path},this.publicBaseUrl);
      await this.service.writeAudit({actorType:'PATIENT',actorId:receipt.claims.sub,patientId:receipt.claims.patientId,
        auditSessionId:receipt.claims.auditSessionId,sourceHospitalId:receipt.claims.sourceHospitalId,
        studyInstanceUid:route.studyInstanceUid,seriesInstanceUid:route.seriesInstanceUid,sopInstanceUid:route.sopInstanceUid,
        action:input.outcome==='READY'?AuditAction.PATIENT_SELF_VIEW_RESPONSE_PREPARED:AuditAction.PATIENT_SELF_VIEW_UPSTREAM_FAILED,
        result:input.outcome==='READY'?'SUCCESS':'FAIL',skipAnomalyDetection:true});
      await this.service.store.save();
      if(this.clock()>=receipt.deadline || !await this.readLive(receipt.claims,receipt.tokenHash))return deny('PATIENT_GRANT_INACTIVE');
      return {accepted:true,statusCode:200,delivery:'NOT VERIFIED'};
    }catch{return deny('AUTHORITY_PERSISTENCE_UNAVAILABLE',503);}
  }
  async authorize(input,caller) {
    let claims,kid;
    const denied=async(reason,statusCode=403)=>{
      try {
        await this.service.writeAudit({actorType:claims?'PATIENT':'SYSTEM',actorId:claims?.sub??'patient-grant-verifier',
          patientId:claims?.patientId??null,auditSessionId:claims?.auditSessionId,
          sourceHospitalId:claims?.sourceHospitalId??null,studyInstanceUid:claims?.studyInstanceUid??null,
          action:AuditAction.ACCESS_DENIED,result:'FAIL',reasonCode:reason,skipAnomalyDetection:true});
        await this.service.store.save();
      }catch{return {active:false,statusCode:503,reason:'AUTHORITY_PERSISTENCE_UNAVAILABLE'};}
      return {active:false,statusCode,reason};
    };
    if(!this.enabled)return {active:false,statusCode:503,reason:'PATIENT_GRANT_DISABLED'};
    try{requireInternalServiceScope(caller,'gateway:patient-self-view-authorize');}
    catch{return denied('PATIENT_GATEWAY_PRINCIPAL_REQUIRED');}
    if(caller.authMethod!=='INTERNAL_SERVICE_TOKEN' || caller.subject!=='patient-self-view-gateway')return denied('PATIENT_GATEWAY_PRINCIPAL_REQUIRED');
    if(caller.hospitalId!==this.sourceHospitalId)return denied('PATIENT_GATEWAY_SOURCE_MISMATCH');
    let route;
    try{route=parsePatientDataPlaneRequest(input,this.publicBaseUrl);}catch{return denied('PATIENT_DATA_PLANE_REQUEST_INVALID',400);}
    if(input.authorizationScheme!=='DPoP' || typeof input.token!=='string' || input.token.length>16384
      || typeof input.dpopProof!=='string' || input.dpopProof.length>16384)return denied('DPOP_PROOF_REQUIRED');
    try {
      const parts=input.token.split('.');if(parts.length!==3)throw new Error('INVALID');
      const header=JSON.parse(Buffer.from(parts[0],'base64url'));
      if(header.alg!=='HS256' || header.typ!=='JWT' || header.crit || typeof header.kid!=='string' || header.kid.length>128)throw new Error('INVALID');
      let key;
      try{key=typeof this.keyProvider?.getKeyAsync==='function'?await this.keyProvider.getKeyAsync(header.kid):this.keyProvider?.getKey(header.kid);}
      catch{throw {unavailable:true};}
      if(!key || !['ACTIVE','VERIFY_ONLY'].includes(key.status) || key.retiredAt || typeof key.material!=='string' || Buffer.byteLength(key.material)<32)throw new Error('INVALID');
      const verified=verifyJwt(input.token,{issuer:'highpass-control-plane',audience:'mediq-patient-self-view-gateway',hmacSecret:key.material});
      if(verified.authorityType!=='PATIENT_SELF_VIEW' || verified.actorType!=='PATIENT' || verified.permission!=='VIEW_ONLY'
        || verified.purpose!=='PATIENT_SELF_VIEW' || verified.doctorId!==undefined || verified.consentId!==undefined
        || !/^[0-9a-f-]{36}$/i.test(verified.jti??'') || !/^[0-9a-f-]{36}$/i.test(verified.auditSessionId??'')
        || typeof verified.sub!=='string' || verified.sub.length>128 || typeof verified.patientId!=='string'
        || !Array.isArray(verified.allowedSeriesUids) || verified.allowedSeriesUids.length!==1
        || !validUid(verified.studyInstanceUid) || !validUid(verified.allowedSeriesUids[0])
        || !Number.isSafeInteger(verified.iat) || !Number.isSafeInteger(verified.exp) || verified.iat*1000>this.clock()
        || verified.exp<=verified.iat || verified.exp-verified.iat>300 || verified.exp*1000<=this.clock()
        || !/^[A-Za-z0-9_-]{43}$/.test(verified.cnf?.jkt??''))throw new Error('INVALID');
      claims=verified;
      kid=header.kid;
    }catch(error){return denied(error?.unavailable?'PATIENT_SIGNING_KEY_UNAVAILABLE':'PATIENT_TOKEN_INVALID',error?.unavailable?503:403);}
    if(claims.sourceHospitalId!==this.sourceHospitalId || claims.viewingGatewayId!==this.viewingGatewayId
      || route.studyInstanceUid!==claims.studyInstanceUid || (route.seriesInstanceUid && route.seriesInstanceUid!==claims.allowedSeriesUids[0]))
      return denied('SCOPE_MISMATCH');
    const tokenHash=createHash('sha256').update(input.token).digest('hex');
    const readLive=()=>this.readLive(claims,tokenHash);
    try {
      if(!await readLive())return denied('PATIENT_GRANT_INACTIVE');
      if(this.service.dpopReplayStore?.persistent!==true)return denied('DPOP_REPLAY_STORE_UNAVAILABLE',503);
      const proof=await this.service.verifyDPoPProof(input.dpopProof,{method:input.method,url:route.externalUrl,requireAbsoluteUrl:true,
        expectedPublicKeyThumbprint:claims.cnf.jkt,accessToken:input.token,
        requestMeta:{actorType:'PATIENT',actorId:claims.sub,auditSessionId:claims.auditSessionId}});
      if(proof.valid!==true)return denied(proof.reason??'DPOP_SIGNATURE_INVALID',proof.statusCode??403);
      if(!await readLive())return denied('PATIENT_GRANT_INACTIVE');
      await this.service.writeAudit({actorType:'PATIENT',actorId:claims.sub,patientId:claims.patientId,auditSessionId:claims.auditSessionId,
        sourceHospitalId:claims.sourceHospitalId,studyInstanceUid:claims.studyInstanceUid,seriesInstanceUid:route.seriesInstanceUid??null,
        sopInstanceUid:route.sopInstanceUid??null,action:AuditAction.PATIENT_SELF_VIEW_ACCESS_ALLOWED,result:'SUCCESS',skipAnomalyDetection:true});
      await this.service.store.save();
      if(!await readLive())return denied('PATIENT_GRANT_INACTIVE');
      const issuedAt=this.clock();
      const encoded=Buffer.from(JSON.stringify({type:'PATIENT_RESPONSE_PREPARATION',claims,kid,tokenHash,path:input.path,issuedAt,
        deadline:Math.min(issuedAt+30000,claims.exp*1000)})).toString('base64url');
      const receipt=`${encoded}.${createHmac('sha256',this.receiptKey).update(encoded).digest('base64url')}`;
      return {active:true,statusCode:200,receipt,scope:{authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',subject:claims.sub,
        patientId:claims.patientId,tokenId:claims.jti,auditSessionId:claims.auditSessionId,sourceHospitalId:claims.sourceHospitalId,
        viewingGatewayId:claims.viewingGatewayId,studyInstanceUid:claims.studyInstanceUid,allowedSeriesUids:claims.allowedSeriesUids,
        permission:'VIEW_ONLY',expiresAt:new Date(claims.exp*1000).toISOString()}};
    }catch{return denied('AUTHORITY_PERSISTENCE_UNAVAILABLE',503);}
  }
}
