import {requireInternalServiceScope} from './auth.js';
import {readJson,sendJson} from './http-utils.js';

export const patientKeyReleasePaths=Object.freeze(['/gateway/patient-self-view/package/wrap-authorize',
  '/gateway/patient-self-view/package/prepare','/gateway/patient-self-view/package/authorize']);
export function createPatientKeyReleaseHttpHandler({policy,service,sourceHospitalId}) {
  return async(request,response,url,principal)=>{
    if(!patientKeyReleasePaths.includes(url.pathname))return false;
    const preparing=url.pathname.endsWith('/prepare'),wrapping=url.pathname.endsWith('/wrap-authorize');
    const deny=async(status=403)=>{
      try{await service.writeAudit({actorType:'SYSTEM',actorId:'patient-release-http',action:'ACCESS_DENIED',result:'FAIL',
        reasonCode:'PATIENT_RELEASE_HTTP_DENIED',skipAnomalyDetection:true});await service.store.save();}
      catch{status=503;}
      sendJson(response,status,{error:status>=500?'PATIENT_RELEASE_UNAVAILABLE':'PATIENT_RELEASE_DENIED'});return true;
    };
    try {
      requireInternalServiceScope(principal,preparing||wrapping?'gateway:patient-self-view-authorize':'gateway:patient-package-key-release');
      if(principal.authMethod!=='INTERNAL_SERVICE_TOKEN' || principal.subject!==(preparing||wrapping?'patient-self-view-gateway':'patient-key-release-gateway')
        || (preparing||wrapping?principal.hospitalId!==sourceHospitalId:principal.viewingGatewayId!=='hospital-b-portal'))throw new Error('INVALID_PRINCIPAL');
    }catch{request.resume();return deny();}
    if(request.method!=='POST' || url.search){request.resume();return deny(400);}
    let body,timer;
    try {
      body=await Promise.race([readJson(request,{maxBytes:32768,strictUtf8:true}),new Promise((_,reject)=>{
        timer=setTimeout(()=>{request.destroy();reject(new Error('BODY_TIMEOUT'));},5000);
      })]);
    }catch{if(!response.destroyed)return deny(400);return true;}finally{clearTimeout(timer);}
    const expected=preparing?['receipt','packageBinding']:wrapping?['receipt','packageId','keyId']:['receipt','packageBinding','releaseId','phase'];
    if(!body || Object.keys(body).sort().join()!==expected.sort().join())return deny(400);
    try {
      const result=preparing?await policy.prepare(body):wrapping?{authorized:await policy.authorizeWrap(body)}
        :{authorized:await policy.authorize({...body,authenticatedViewingGatewayId:principal.viewingGatewayId})};
      sendJson(response,200,result);
    }catch(error){
      const reason=/^PATIENT_(?:RELEASE_(?:BINDING_INVALID|INSTANCE_REQUIRED|PRINCIPAL_INVALID|BINDING_INACTIVE|INACTIVE)|RECEIPT_(?:INVALID|EXPIRED)|GRANT_INACTIVE|SIGNING_KEY_INACTIVE)$/.test(error.message??'');
      sendJson(response,reason?403:503,{error:reason?'PATIENT_RELEASE_DENIED':'PATIENT_RELEASE_UNAVAILABLE'});
    }
    return true;
  };
}
