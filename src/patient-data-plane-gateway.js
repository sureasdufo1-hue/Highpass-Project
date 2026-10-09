import { boundedHttps, requireHttpsOrigin } from './data-plane-gateway.js';
import { parsePatientDataPlaneRequest } from './patient-self-view-authorization.js';

const uid=value=>typeof value==='string' && value.length<=64 && /^[0-9]+(?:\.[0-9]+)+$/.test(value)
  && value.split('.').every(part=>part==='0'||!part.startsWith('0'));
const metadataTags=new Set(['00080016','00080018','00080060','0020000D','0020000E','00200011','00200013',
  '00200032','00200037','00201041','00280002','00280004','00280008','00280010','00280011','00280030',
  '00280100','00280101','00280102','00280103','00281050','00281051','00281052','00281053','00201206','00201208']);

// Dedicated patient authority, never doctor credentials/consents. Runtime callers
// must provide the patient Key Vault adapter before enabling any pixel route.
export function createPatientDataPlaneHandler({publicBaseUrl,controlOrigin,orthancOrigin,serviceToken,
  sourceHospitalId,viewingGatewayId='hospital-b-portal',controlTls,orthancTls,transport=boundedHttps,patientImageEncryption,patientImageEncryptionFactory,encryptionTimeoutMs=25000}) {
  publicBaseUrl=requireHttpsOrigin(publicBaseUrl);controlOrigin=requireHttpsOrigin(controlOrigin);orthancOrigin=requireHttpsOrigin(orthancOrigin);
  if(typeof serviceToken!=='string' || Buffer.byteLength(serviceToken)<32 || /[\r\n]/.test(serviceToken)
    || typeof sourceHospitalId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceHospitalId)
    || !Number.isSafeInteger(encryptionTimeoutMs) || encryptionTimeoutMs<1 || encryptionTimeoutMs>25000)throw new Error('PATIENT_GATEWAY_CONFIGURATION_REQUIRED');
  const control=async(path,input)=>{
    const result=await transport(controlOrigin,path,{method:'POST',tls:controlTls,headers:{'content-type':'application/json',
      'x-hipass-service-token':serviceToken},body:JSON.stringify(input),maxBytes:32768,timeoutMs:5000});
    return {status:result.status,body:JSON.parse(result.body.toString('utf8'))};
  };
  patientImageEncryption=patientImageEncryptionFactory?.(control)??patientImageEncryption;
  return async(request,response)=>{
    const fail=(status,error)=>{if(!response.destroyed){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error}));}};
    let plaintext;
    try {
      let route;try{route=parsePatientDataPlaneRequest({method:request.method,path:request.url},publicBaseUrl);}catch{return fail(400,'PATIENT_ROUTE_INVALID');}
      const match=typeof request.headers.authorization==='string' && request.headers.authorization.length<=16390
        ?request.headers.authorization.match(/^DPoP ([A-Za-z0-9_.-]+)$/):null;
      if(!match || typeof request.headers.dpop!=='string' || request.headers.dpop.length>16384)return fail(401,'PATIENT_PROOF_REQUIRED');
      const decision=await control('/gateway/patient-self-view/authorize',{method:'GET',path:request.url,token:match[1],authorizationScheme:'DPoP',dpopProof:request.headers.dpop});
      if(decision.status!==200 || decision.body.active!==true)return fail(decision.status>=500?503:403,'PATIENT_ACCESS_DENIED');
      const {scope,receipt}=decision.body;
      if(scope?.authorityType!=='PATIENT_SELF_VIEW' || scope.actorType!=='PATIENT' || scope.permission!=='VIEW_ONLY'
        || scope.sourceHospitalId!==sourceHospitalId || scope.viewingGatewayId!==viewingGatewayId
        || scope.studyInstanceUid!==route.studyInstanceUid || !Array.isArray(scope.allowedSeriesUids) || scope.allowedSeriesUids.length!==1
        || !uid(scope.allowedSeriesUids[0]) || (route.seriesInstanceUid && route.seriesInstanceUid!==scope.allowedSeriesUids[0])
        || typeof receipt!=='string' || !receipt.length || receipt.length>8192 || !Number.isFinite(Date.parse(scope.expiresAt))
        || Date.now()>=Date.parse(scope.expiresAt))return fail(403,'PATIENT_SCOPE_INVALID');
      const metadata=['studies','series','instances'].includes(route.kind) || request.url.endsWith('/metadata');
      // No plaintext fallback, and no unnecessary PACS pixel read before crypto is ready.
      if(!metadata && typeof patientImageEncryption?.sealPatient!=='function')return fail(503,'PATIENT_ENCRYPTION_NOT_READY');
      const path=route.kind==='studies'?`/dicom-web/studies?StudyInstanceUID=${scope.studyInstanceUid}`
        :new URL(route.externalUrl).pathname.replace(/^\/patient-dicomweb\//,'/dicom-web/');
      const upstream=await transport(orthancOrigin,path,{tls:orthancTls,headers:{accept:metadata?'application/dicom+json'
        :request.url.endsWith('/rendered')?'image/png':'multipart/related; type=application/octet-stream'},maxBytes:33554432,timeoutMs:10000});
      if(upstream.status!==200){await control('/gateway/patient-self-view/ready',{receipt,bytesPrepared:0,outcome:'UPSTREAM_FAILURE'});return fail(upstream.status===404?404:502,'PATIENT_DICOM_UPSTREAM_FAILURE');}
      if(!Buffer.isBuffer(upstream.body))throw new Error('INVALID_BODY');
      let output;
      if(metadata){
        if(!/^application\/(?:dicom\+json|json)(?:\s*;|$)/i.test(upstream.contentType))throw new Error('INVALID_METADATA');
        const rows=JSON.parse(upstream.body.toString('utf8'));if(!Array.isArray(rows))throw new Error('INVALID_METADATA');
        const filtered=rows.filter(row=>{
          const study=row?.['0020000D']?.Value?.[0],series=row?.['0020000E']?.Value?.[0],sop=row?.['00080018']?.Value?.[0];
          if(study!==scope.studyInstanceUid)return false;
          if(route.kind!=='studies' && series!==scope.allowedSeriesUids[0])return false;
          if(['instances','instance'].includes(route.kind) && (!uid(sop) || (route.sopInstanceUid && sop!==route.sopInstanceUid)))return false;
          return true;
        }).map(row=>Object.fromEntries(Object.entries(row).filter(([tag,value])=>metadataTags.has(tag)
          && /^(?:UI|US|SS|UL|SL|FL|FD|DS|IS|CS)$/.test(value?.vr) && Array.isArray(value.Value)
          && value.Value.length<=1024 && value.Value.every(item=>typeof item==='number' || (typeof item==='string' && item.length<=256)))
          .map(([tag,value])=>[tag,{vr:value.vr,Value:value.Value}])));
        output={body:Buffer.from(JSON.stringify(filtered)),contentType:'application/dicom+json'};
      }else{
        plaintext=upstream.body;
        if(!/^(?:image\/(?:png|jpeg)|multipart\/related)(?:\s*;|$)/i.test(upstream.contentType))throw new Error('INVALID_PIXELS');
        const abort=new AbortController();let timer;
        try {
          const sealing=Promise.resolve().then(()=>patientImageEncryption.sealPatient({body:plaintext,contentType:upstream.contentType,route,scope,receipt,signal:abort.signal}));
          sealing.then(result=>{if(abort.signal.aborted)result?.body?.fill?.(0);},()=>{});
          output=await Promise.race([sealing,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('ENCRYPTION_DEADLINE'));},encryptionTimeoutMs);})]);
        }finally{clearTimeout(timer);}
        if(output?.contentType!=='application/vnd.highpass.encrypted-dicom+json' || !Buffer.isBuffer(output.body)
          || output.body.equals(plaintext) || output.body.length>33554432)throw new Error('PATIENT_ENCRYPTION_REQUIRED');
      }
      const ready=await control('/gateway/patient-self-view/ready',{receipt,bytesPrepared:output.body.length,outcome:'READY'});
      if(ready.status!==200 || ready.body.accepted!==true)return fail(ready.status>=500?503:403,'PATIENT_AUTHORIZATION_OR_AUDIT_UNAVAILABLE');
      if(Date.now()>=Date.parse(scope.expiresAt))return fail(403,'PATIENT_GRANT_EXPIRED');
      if(!response.destroyed){response.writeHead(200,{'content-type':output.contentType,'cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'inline'});response.end(output.body);}
    }catch{return fail(503,'PATIENT_DATA_PLANE_UNAVAILABLE');}
    finally{plaintext?.fill(0);}
  };
}
