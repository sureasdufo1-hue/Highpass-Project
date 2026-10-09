import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createPatientDataPlaneHandler} from '../src/patient-data-plane-gateway.js';

const prefix='/patient-dicomweb/studies/1.2.3/series/1.2.3.1/instances';
const row=(sop='1.2.3.1.1')=>({'0020000D':{vr:'UI',Value:['1.2.3']},'0020000E':{vr:'UI',Value:['1.2.3.1']},
  '00080018':{vr:'UI',Value:[sop]},'00100010':{vr:'PN',Value:[{Alphabetic:'SYNTHETIC^ONLY'}]},
  '00280010':{vr:'US',Value:[256],BulkDataURI:'https://forbidden.invalid/private'},'77770001':{vr:'UT',Value:['private']}});
function setup({decision,ready,upstream,seal,encryptionTimeoutMs}={}){
  const calls=[],raw=Buffer.from('synthetic pixels');
  const authority={active:true,receipt:'synthetic-receipt-double',scope:{authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',permission:'VIEW_ONLY',
    sourceHospitalId:'H-A',viewingGatewayId:'hospital-b-portal',studyInstanceUid:'1.2.3',allowedSeriesUids:['1.2.3.1'],expiresAt:new Date(Date.now()+120000).toISOString()}};
  const transport=async(origin,path,options)=>{
    calls.push({origin,path,options});
    if(origin==='https://control.invalid')return {status:200,body:Buffer.from(JSON.stringify(path.endsWith('/authorize')?(decision??authority):(ready??{accepted:true})))};
    assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.dpop,undefined);
    return upstream??{status:200,contentType:path.endsWith('/rendered')?'image/png':'application/dicom+json',body:path.endsWith('/rendered')?raw:Buffer.from(JSON.stringify([row(),row('1.2.3.1.2'),{...row(),'0020000E':{vr:'UI',Value:['1.2.3.2']}}]))};
  };
  const handler=createPatientDataPlaneHandler({publicBaseUrl:'https://portal.invalid',controlOrigin:'https://control.invalid',orthancOrigin:'https://pacs.invalid',
    serviceToken:randomBytes(32).toString('hex'),sourceHospitalId:'H-A',transport,patientImageEncryption:seal?{sealPatient:seal}:undefined,...(encryptionTimeoutMs?{encryptionTimeoutMs}:{})});
  const run=async(path=prefix,extra={})=>{
    const response={destroyed:false,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=Buffer.from(body);}};
    await handler({method:'GET',url:path,headers:{authorization:'DPoP synthetic.patient.token',dpop:'proof-double'},...extra},response);return response;
  };
  return {run,calls,raw};
}
test('patient metadata uses separate control paths and filters identifiers, PHI/private tags and BulkDataURI',async()=>{
  const f=setup(),result=await f.run();assert.equal(result.status,200);
  const rows=JSON.parse(result.body);assert.equal(rows.length,2);assert.equal(rows[0]['00100010'],undefined);assert.equal(rows[0]['77770001'],undefined);
  assert.equal(rows[0]['00280010'].BulkDataURI,undefined);assert.equal(f.calls.at(-1).path,'/gateway/patient-self-view/ready');
  assert.equal(JSON.parse(f.calls.at(-1).options.body).bytesPrepared,result.body.length);
  assert.ok(!result.body.includes(Buffer.from('synthetic.patient.token')));
});
test('patient route, proof and foreign authority deny before PACS read',async()=>{
  for(const path of [prefix+'/1.2.3.1.1/download','/patient-dicomweb/studies',prefix.replace('1.2.3.1','1.2.3.2')]){
    const f=setup(),response=await f.run(path);assert.ok([400,403].includes(response.status));assert.ok(!f.calls.some(c=>c.origin==='https://pacs.invalid'));
  }
  const f=setup({decision:{active:false}});assert.equal((await f.run()).status,403);assert.equal(f.calls.length,1);
  const missing=setup();assert.equal((await missing.run(prefix,{headers:{authorization:'Bearer synthetic.patient.token'}})).status,401);assert.equal(missing.calls.length,0);
});
test('patient pixels without patient Key Vault adapter are denied before PACS read',async()=>{
  const f=setup(),response=await f.run(prefix+'/1.2.3.1.1/rendered');assert.equal(response.status,503);
  assert.ok(!f.calls.some(c=>c.origin==='https://pacs.invalid'));
});
test('injected patient encryption contract emits encrypted envelope only and clears plaintext; not live crypto evidence',async()=>{
  const f=setup({seal:async({body,scope,receipt,signal})=>{
    assert.equal(scope.authorityType,'PATIENT_SELF_VIEW');assert.equal(receipt,'synthetic-receipt-double');assert.equal(signal.aborted,false);
    return {body:Buffer.from('{"ciphertext":"fixture-only"}'),contentType:'application/vnd.highpass.encrypted-dicom+json'};
  }});
  const response=await f.run(prefix+'/1.2.3.1.1/rendered');assert.equal(response.status,200);assert.ok(f.raw.every(v=>v===0));
  assert.ok(!response.body.includes(Buffer.from('synthetic pixels')));
});
test('patient encryption failure/plaintext substitution/readiness denial never returns image bytes',async()=>{
  for(const mode of ['crypto-failure','plaintext','ready']){
    const f=setup({ready:mode==='ready'?{accepted:false}:undefined,seal:async({body})=>{
      if(mode==='crypto-failure')throw new Error('sensitive internal detail');
      return {body:mode==='plaintext'?body:Buffer.from('{"ciphertext":"fixture"}'),contentType:'application/vnd.highpass.encrypted-dicom+json'};
    }});
    const response=await f.run(prefix+'/1.2.3.1.1/rendered');assert.ok([403,503].includes(response.status));assert.ok(f.raw.every(v=>v===0));
    assert.ok(!response.body.includes(Buffer.from('synthetic pixels')));assert.ok(!response.body.includes(Buffer.from('sensitive')));
  }
});
test('upstream failure is not policy DENY and is reported to patient readiness audit',async()=>{
  const f=setup({upstream:{status:404,contentType:'application/json',body:Buffer.from('{}')}}),response=await f.run();
  assert.equal(response.status,404);assert.equal(JSON.parse(f.calls.at(-1).options.body).outcome,'UPSTREAM_FAILURE');
});
test('nonsettling patient crypto reaches finite deadline, aborts and clears input without readiness success',async()=>{
  let signal;
  const f=setup({encryptionTimeoutMs:20,seal:async input=>{signal=input.signal;return new Promise(()=>{});}});
  assert.equal((await f.run(prefix+'/1.2.3.1.1/rendered')).status,503);assert.equal(signal.aborted,true);
  assert.ok(f.raw.every(v=>v===0));assert.ok(!f.calls.some(c=>c.path.endsWith('/ready')));
});
