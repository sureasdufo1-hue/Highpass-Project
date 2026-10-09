import { AuthError } from './auth.js';
import { readJson, RequestBodyError, sendJson } from './http-utils.js';
import { PatientGrantError } from './patient-self-view-grant-service.js';
import { AuditAction } from './domain.js';

export function createPatientGrantAuthenticationAudit(service) {
  return async reasonCode => {
    await service.writeAudit({actorType:'SYSTEM',actorId:'patient-grant-http',action:AuditAction.PATIENT_SELF_VIEW_GRANT_DENIED,
      result:'FAIL',reasonCode,skipAnomalyDetection:true});
    await service.store.save();
  };
}

export function createPatientSelfViewGrantHttpHandler({ issuer, authenticate, requestMeta, auditAuthenticationDenied, bodyTimeoutMs = 5000 }) {
  if (!Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 50 || bodyTimeoutMs > 5000) throw new Error('PATIENT_GRANT_CONFIGURATION_INVALID');
  if(issuer && typeof auditAuthenticationDenied!=='function')throw new Error('PATIENT_GRANT_AUTH_AUDIT_REQUIRED');
  return async (request,response,url) => {
    const match=/^\/api\/patients\/([^/]+)\/studies\/([^/]+)\/self-view-grants$/.exec(url.pathname);
    if(!match)return false;
    response.setHeader('cache-control','no-store');response.setHeader('pragma','no-cache');
    response.setHeader('referrer-policy','no-referrer');response.setHeader('x-content-type-options','nosniff');
    if(!issuer){request.resume();sendJson(response,404,{error:'NOT_FOUND'});return true;}
    if(request.method!=='POST'){request.resume();response.setHeader('allow','POST');sendJson(response,405,{error:'METHOD_NOT_ALLOWED'});return true;}
    if(url.search || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??'')){
      request.resume();sendJson(response,400,{error:'INVALID_REQUEST'});return true;
    }
    let timer;
    try {
      const principal=await authenticate(request);
      let patientId,studyInstanceUid;
      try {patientId=decodeURIComponent(match[1]);studyInstanceUid=decodeURIComponent(match[2]);}
      catch {throw new RequestBodyError(400,'INVALID_REQUEST');}
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new RequestBodyError(408,'REQUEST_BODY_TIMEOUT')),bodyTimeoutMs);});
      const body=await Promise.race([readJson(request,{maxBytes:2048,strictUtf8:true}),timeout]);
      clearTimeout(timer);
      const result=await issuer.issue({principal,patientId,studyInstanceUid},body,requestMeta(request,principal));
      if(!response.destroyed)sendJson(response,201,result);
    } catch(error) {
      if(response.destroyed)return true;
      if(error instanceof AuthError){
        try{await auditAuthenticationDenied(/^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'AUTHENTICATION_REQUIRED');}
        catch{error=new PatientGrantError('AUTHORITY_PERSISTENCE_UNAVAILABLE');}
      }
      const known=error instanceof AuthError || error instanceof RequestBodyError || error instanceof PatientGrantError;
      const code=known && /^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'PATIENT_GRANT_UNAVAILABLE';
      const status=known && [400,401,403,408,413,422,503].includes(error.statusCode)?error.statusCode:503;
      sendJson(response,status,{error:code});
      if(status===408)response.once('finish',()=>request.destroy());else request.resume();
    } finally {clearTimeout(timer);}
    return true;
  };
}
