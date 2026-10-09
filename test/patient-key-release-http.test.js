import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {InternalServiceProvider} from '../src/auth.js';
import {createPatientKeyReleaseHttpHandler} from '../src/patient-key-release-http-handler.js';

const credentials=()=>({HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN:randomBytes(32).toString('hex'),HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN:randomBytes(32).toString('hex'),
  HIPASS_DATA_PLANE_SERVICE_TOKEN:randomBytes(32).toString('hex'),HIPASS_KEY_RELEASE_SERVICE_TOKEN:randomBytes(32).toString('hex'),
  HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID:'H-A',HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID:'H-B'});
test('patient B credential has one scope and fixed Gateway; all cross-key collisions deny',()=>{
  const env=credentials(),provider=new InternalServiceProvider(env),principal=provider.authenticate({headers:{'x-hipass-service-token':env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN,'x-viewing-gateway':'spoof'}});
  assert.equal(principal.subject,'patient-key-release-gateway');assert.equal(principal.viewingGatewayId,'hospital-b-portal');
  assert.deepEqual(principal.scopes,['gateway:patient-package-key-release']);
  for(const name of ['HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN','HIPASS_DATA_PLANE_SERVICE_TOKEN','HIPASS_KEY_RELEASE_SERVICE_TOKEN','HIPASS_INTERNAL_SERVICE_TOKEN'])
    assert.throws(()=>new InternalServiceProvider({...env,[name]:env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN}).authenticate({headers:{'x-hipass-service-token':env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN}}));
});
test('real loopback patient release HTTP separates A/B callers and rejects caller identity injection',async t=>{
  const env=credentials(),provider=new InternalServiceProvider(env),seen=[],audits=[];
  const policy={prepare:async body=>{seen.push(body);return {releaseId:'synthetic'};},authorizeWrap:async body=>{seen.push(body);return true;},
    authorize:async body=>{seen.push(body);assert.equal(body.authenticatedViewingGatewayId,'hospital-b-portal');return true;}};
  const handler=createPatientKeyReleaseHttpHandler({policy,sourceHospitalId:'H-A',service:{writeAudit:async e=>audits.push(e),store:{save:async()=>{}}}});
  const server=http.createServer(async(req,res)=>{
    try{await handler(req,res,new URL(req.url,'http://synthetic.invalid'),provider.authenticate(req));}
    catch{res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"AUTHENTICATION_REQUIRED"}');}
  });server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const call=async(path,key,body)=>{const result=await fetch(`http://127.0.0.1:${server.address().port}/gateway/patient-self-view/package/${path}`,{
    method:'POST',headers:{'content-type':'application/json',...(key?{'x-hipass-service-token':key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
    return {status:result.status,body:await result.json(),cache:result.headers.get('cache-control')};};
  const prepare={receipt:'fixture',packageBinding:{}},authorize={...prepare,releaseId:'fixture',phase:'BEFORE_UNWRAP'};
  assert.equal((await call('prepare',env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN,prepare)).status,200);
  const allowed=await call('authorize',env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN,authorize);assert.equal(allowed.status,200);assert.equal(allowed.cache,'no-store');
  assert.equal((await call('authorize',env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN,authorize)).status,403);
  assert.equal((await call('prepare',env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN,prepare)).status,403);
  assert.equal((await call('authorize',env.HIPASS_KEY_RELEASE_SERVICE_TOKEN,authorize)).status,403);
  assert.equal((await call('authorize',null,authorize)).status,403);
  assert.equal((await call('authorize',env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN,{...authorize,authenticatedViewingGatewayId:'spoof'})).status,400);
  assert.equal(seen.length,2);assert.equal(audits.length,5);
});
