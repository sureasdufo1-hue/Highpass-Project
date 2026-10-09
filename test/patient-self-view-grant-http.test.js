import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AuthError } from '../src/auth.js';
import { createPatientSelfViewGrantHttpHandler } from '../src/patient-self-view-grant-http-handler.js';
import { createPatientSelfViewGrantRuntime } from '../src/patient-self-view-grant-runtime.js';

const path='/api/patients/HP-TEST-PHANTOM-001/studies/1.2.3/self-view-grants';
async function fixture(t,options={}) {
  const calls=[],audits=[];
  const handler=createPatientSelfViewGrantHttpHandler({issuer:options.disabled?null:{issue:async(...args)=>{
    calls.push(args);if(options.providerFail)throw new Error('private provider diagnostic');return {accessToken:'test-response-only',tokenType:'DPoP'};}},
    authenticate:async()=>{if(options.authFail)throw new AuthError(401,'AUTHENTICATION_REQUIRED');return {role:'PATIENT'};},
    auditAuthenticationDenied:async code=>{audits.push(code);if(options.auditFail)throw new Error('private database diagnostic');},
    requestMeta:()=>({ingressTrusted:true}),bodyTimeoutMs:50});
  const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end('{}');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const call=async({method='POST',route=path,body='{"seriesInstanceUids":["1.2.3.1"]}',type='application/json'}={})=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:{'content-type':type},
      body:method==='GET'?undefined:body,signal:AbortSignal.timeout(2000)});
    return {status:r.status,body:await r.json(),headers:r.headers};
  };
  return {call,calls,audits};
}
test('HTTP grant response forbids cache/referrer/redirect and passes exact path/body to issuer',async t=>{
  const f=await fixture(t),r=await f.call();assert.equal(r.status,201);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('location'),null);
  assert.deepEqual(f.calls[0][1],{seriesInstanceUids:['1.2.3.1']});assert.equal(f.calls[0][0].patientId,'HP-TEST-PHANTOM-001');
});
test('disabled/method/query/content/JSON/size conditions cannot invoke issuance',async t=>{
  const f=await fixture(t);
  for(const [options,status]of [[{method:'GET'},405],[{route:path+'?token=unsafe'},400],[{type:'text/plain'},400],
    [{body:'{'},422],[{body:'x'.repeat(2049)},413]])assert.equal((await f.call(options)).status,status);
  assert.equal(f.calls.length,0);const disabled=await fixture(t,{disabled:true});assert.equal((await disabled.call()).status,404);
});
test('authentication denial is audited; audit failure returns safe 503 and no issuer call',async t=>{
  for(const auditFail of [false,true]){
    const f=await fixture(t,{authFail:true,auditFail}),r=await f.call();
    assert.equal(r.status,auditFail?503:401);assert.equal(f.calls.length,0);assert.deepEqual(f.audits,['AUTHENTICATION_REQUIRED']);
    assert.ok(!JSON.stringify(r.body).includes('private'));
  }
});
test('untyped provider failure never exposes internal diagnostics',async t=>{
  const f=await fixture(t,{providerFail:true}),r=await f.call();assert.equal(r.status,503);
  assert.deepEqual(r.body,{error:'PATIENT_GRANT_UNAVAILABLE'});
});
test('runtime is off by default and rejects partial activation before any database connection',async()=>{
  assert.equal(await createPatientSelfViewGrantRuntime({env:{}}),null);
  await assert.rejects(createPatientSelfViewGrantRuntime({env:{HIPASS_CAPSTONE_PATIENT_GRANTS:'1'}}),/PATIENT_GRANT_PROFILE_REQUIRED/);
});
