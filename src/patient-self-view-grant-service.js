import { createHash, createHmac, randomUUID } from 'node:crypto';
import { AuditAction } from './domain.js';

export class PatientGrantError extends Error {
  constructor(code, statusCode = 503) { super(code); this.code = code; this.statusCode = statusCode; }
}

// Server-only capability issuer. No runtime route is mounted by this module.
// Uses the existing verified DPoP implementation, never caller-provided jkt.
export class PatientSelfViewGrantService {
  constructor({ authority, persistence, proofService, keyProvider, allowedOrigin, enabled = false,
    viewingGatewayId = 'hospital-b-portal', clock = Date.now, deadlineMs = 20000 }) {
    const origin = new URL(allowedOrigin);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
      || origin.pathname !== '/' || typeof authority?.authorize !== 'function' || typeof persistence?.create !== 'function'
      || typeof proofService?.verifyIssuanceProof !== 'function' || typeof proofService?.writeAudit !== 'function'
      || typeof proofService?.store?.save !== 'function' || !['hospital-a-gateway','hospital-b-portal'].includes(viewingGatewayId)
      || !Number.isInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 20000) throw new PatientGrantError('PATIENT_GRANT_CONFIGURATION_INVALID');
    Object.assign(this,{authority,persistence,proofService,keyProvider,enabled:enabled===true,
      viewingGatewayId,clock,deadlineMs,allowedOrigin:origin.origin});
  }

  async issue(input, body, requestMeta) {
    input=structuredClone(input); body=structuredClone(body); requestMeta=structuredClone(requestMeta);
    if (!this.enabled) throw new PatientGrantError('PATIENT_GRANT_DISABLED');
    let timer, expired=false;
    const check=()=>{if(expired)throw new PatientGrantError('PATIENT_GRANT_DEADLINE');};
    const reject=async(code,statusCode=403)=>{
      check();
      const principal=input?.principal;
      await this.proofService.writeAudit({action:AuditAction.PATIENT_SELF_VIEW_GRANT_DENIED,result:'FAIL',reasonCode:code,
        actorType:['PATIENT','DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN'].includes(principal?.role)?principal.role:'SYSTEM',
        actorId:typeof principal?.subject==='string'&&principal.subject.length<=128?principal.subject:'UNKNOWN',
        patientId:principal?.role==='PATIENT'?principal.patientId:null,skipAnomalyDetection:true});
      await this.proofService.store.save();
      throw new PatientGrantError(code,statusCode);
    };
    const work=(async()=>{
      if (this.proofService.dpopReplayStore?.persistent !== true) return reject('DPOP_REPLAY_STORE_UNAVAILABLE',503);
      if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1
        || !Array.isArray(body.seriesInstanceUids) || body.seriesInstanceUids.length!==1
        || typeof body.seriesInstanceUids[0]!=='string') return reject('INVALID_REQUEST',400);
      const authorizedInput={...input,seriesInstanceUid:body.seriesInstanceUids[0],requestedAction:'VIEW'};
      let url;
      try {url=new URL(requestMeta.externalUrl);}catch {return reject('TRUSTED_INGRESS_REQUIRED');}
      const path=`/api/patients/${encodeURIComponent(input.patientId)}/studies/${encodeURIComponent(input.studyInstanceUid)}/self-view-grants`;
      if (requestMeta.ingressTrusted!==true || requestMeta.method!=='POST' || url.origin!==this.allowedOrigin
        || url.pathname!==path || url.username || url.password || url.search || url.hash) return reject('TRUSTED_INGRESS_REQUIRED');
      const decision=await this.authority.authorize(authorizedInput);check();
      if (decision.decision!=='ALLOWED') return reject(decision.reasonCode,decision.statusCode);
      const proof=await this.proofService.verifyIssuanceProof({...requestMeta,actorType:'PATIENT',actorId:input.principal.subject});check();
      if (proof.valid!==true || !/^[A-Za-z0-9_-]{43}$/.test(proof.publicKeyThumbprint??''))
        return reject(/^[A-Z0-9_]{1,80}$/.test(proof.reason??'')?proof.reason:'DPOP_SIGNATURE_INVALID',proof.statusCode??403);
      const key=typeof this.keyProvider?.currentKeyAsync==='function'?await this.keyProvider.currentKeyAsync():this.keyProvider?.currentKey();check();
      if (key?.status!=='ACTIVE' || key.retiredAt || typeof key.kid!=='string' || !key.kid
        || typeof key.material!=='string' || Buffer.byteLength(key.material)<32) return reject('PATIENT_GRANT_SIGNING_UNAVAILABLE',503);
      const issuedAtMs=Math.floor(this.clock()/1000)*1000;
      const expiresAtMs=Math.floor(Math.min(issuedAtMs+300000,input.principal.expiresAtMs)/1000)*1000;
      if (!Number.isFinite(expiresAtMs) || expiresAtMs<=this.clock()) return reject('PATIENT_SUBJECT_MISMATCH');
      const grantId=randomUUID(),auditSessionId=randomUUID(),scope=decision.scope;
      const claims={iss:'highpass-control-plane',aud:'mediq-patient-self-view-gateway',jti:grantId,sub:scope.subject,
        authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',patientId:scope.patientId,sourceHospitalId:scope.sourceHospitalId,
        viewingGatewayId:this.viewingGatewayId,studyInstanceUid:scope.studyInstanceUid,allowedSeriesUids:scope.allowedSeriesUids,
        permission:'VIEW_ONLY',purpose:'PATIENT_SELF_VIEW',iat:issuedAtMs/1000,exp:expiresAtMs/1000,auditSessionId,
        cnf:{jkt:proof.publicKeyThumbprint}};
      const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT',kid:key.kid})).toString('base64url');
      const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
      const accessToken=`${header}.${payload}.${createHmac('sha256',key.material).update(`${header}.${payload}`).digest('base64url')}`;
      check();
      const receipt=await this.persistence.create(authorizedInput,{grantId,auditSessionId,
        tokenHash:createHash('sha256').update(accessToken).digest('hex'),ownershipRevision:scope.ownershipRevision,
        proofKeyThumbprint:proof.publicKeyThumbprint,viewingGatewayId:this.viewingGatewayId,issuedAtMs,expiresAtMs});
      check();
      if(receipt.grantId!==grantId || receipt.auditSessionId!==auditSessionId || this.clock()>=expiresAtMs)
        throw new PatientGrantError('AUTHORITY_PERSISTENCE_UNAVAILABLE');
      return {accessToken,tokenType:'DPoP',expiresAt:new Date(expiresAtMs).toISOString(),permission:'VIEW_ONLY',auditSessionId};
    })();
    const deadline=new Promise((_,rejectDeadline)=>{timer=setTimeout(()=>{expired=true;rejectDeadline(new PatientGrantError('PATIENT_GRANT_DEADLINE'));},this.deadlineMs);});
    try{return await Promise.race([work,deadline]);}
    catch(error){if(error instanceof PatientGrantError)throw error;throw new PatientGrantError('AUTHORITY_PERSISTENCE_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  }
}
