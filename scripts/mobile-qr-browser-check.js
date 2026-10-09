// Fresh synthetic mobile UI receipts only. Never export QR payloads or JWTs.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import {spawnSync} from 'node:child_process';
import { createCapstoneProofClient } from '../src/capstone-dpop-client.js';
import { verifyPhantomPixels } from './phantom-browser-evidence.js';

const origin = 'https://192.168.111.149:9443';
const patientId = 'HP-TEST-PHANTOM-001';
const modality=process.env.HIPASS_BROWSER_PHANTOM_MODALITY || 'CT';
if(!['CT','MR'].includes(modality)) throw new Error('FIXED_PHANTOM_MODALITY_REQUIRED');
const studyUid = `1.2.826.0.1.3680043.10.5432.20261009.${modality==='CT'?'1':'2'}`;
const foreignStudyUid = `1.2.826.0.1.3680043.10.5432.20261009.${modality==='CT'?'2':'1'}`;
const ca = readFileSync(new URL('../tmp/certs/mtls/ca.crt', import.meta.url));
const proof = createCapstoneProofClient(origin);
const owned = [];
const runStarted=performance.now();
const expiryMode=process.env.HIPASS_BROWSER_MOBILE_QR_EXPIRY==='1';
const verticalMode=process.env.HIPASS_BROWSER_VERTICAL_FLOW==='1';
const result = { result: 'NOT VERIFIED', scope: 'FRESH_PHANTOM_MOBILE_UI_QR_USED_REVOKED',
  cameraScan: 'NOT VERIFIED', nativeBiometrics: 'NOT VERIFIED', expiration: 'NOT VERIFIED', checks: [] };
result.recipientRedemption='AUTHENTICATED_API_WITH_FRESH_DPOP';
result.viewerPixels='NOT VERIFIED';
result.modality=modality;
let key = '', profiles, cdp;
let doctorCdp;
const doctorReceipts={redeem:null,instances:null};
let renewalKey='';
if(expiryMode) result.scope='FRESH_PHANTOM_MOBILE_UI_REAL_TIME_EXPIRY';
if(verticalMode) { result.scope='MOBILE_APPROVAL_TO_CLINICIAN_UI_VIEWER_REVOCATION'; result.recipientRedemption='CLINICIAN_BROWSER_BUTTON'; }
const deadline = setTimeout(() => { console.log(JSON.stringify({...result, reason:'GLOBAL_DEADLINE_RECONCILE_OWNED_RECEIPTS'})); process.exit(2); }, expiryMode?1020000:verticalMode?300000:180000);
function requireCheck(ok, code) { if (!ok) throw new Error(code); }
function request(path, role, body, accessToken, headersOverride) {
  const method = body === undefined ? 'GET' : 'POST';
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(origin + path, {ca, rejectUnauthorized:true, method, signal:AbortSignal.timeout(10000),
      headers:{...(headersOverride ?? proof({path,method,token:accessToken ?? profiles?.[role],issuance:path.endsWith('/redeem-viewer') || path==='/api/dicom-access/request'})),
        ...(payload ? {origin,'content-type':'application/json'} : {})}}, res => {
      let text=''; res.setEncoding('utf8');
      res.on('data', chunk => { text+=chunk; if(text.length>2000000) res.destroy(new Error('RESPONSE_LIMIT')); });
      res.on('error',reject); res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),contentType:res.headers['content-type']??'',bodyBytes:Buffer.byteLength(text),serverDateMs:Date.parse(res.headers.date)});}catch{reject(new Error('INVALID_RECEIPT'));}});
    });
    req.on('error',reject); req.end(payload);
  });
}
async function evaluate(expression) {
  const response = await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},20000);
  requireCheck(!response.exceptionDetails,'UI_EXPRESSION_FAILED'); return response.result.value;
}
async function until(expression, budget=20000) {
  const end=Date.now()+budget;
  while(Date.now()<end) { if(await evaluate(expression)) return; await new Promise(r=>setTimeout(r,250)); }
  throw new Error('UI_STATE_TIMEOUT');
}
async function body(id) {
  const data=await cdp.send('Network.getResponseBody',{requestId:id});
  return JSON.parse(data.base64Encoded ? Buffer.from(data.body,'base64').toString('utf8') : data.body);
}
const receipts={login:null,created:[],ticket:[]};
async function issue() {
  const createCount=receipts.created.length, ticketCount=receipts.ticket.length;
  await evaluate(`document.querySelector('#btn-home-quick-share').click()`);
  await until(`!!document.querySelector('[data-share-check="${studyUid}"]')`);
  await evaluate(`(() => {
    for(const checkbox of document.querySelectorAll('[data-share-check]')) {
      checkbox.checked=checkbox.dataset.shareCheck===${JSON.stringify(studyUid)};
      checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    }
    document.querySelector('#btn-wizard-to-2').click();
    const hospital=document.querySelector('#select-target-hospital'); hospital.value='HOSP-B'; hospital.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#select-validity-duration').value='1h';
    document.querySelector('#btn-wizard-to-3').click();
  })()`);
  requireCheck(await evaluate(`document.querySelector('#wizard-step-3').classList.contains('active') && document.querySelector('#confirm-items-count').textContent==='1건의 기록'`),'REVIEW_NOT_CONFIRMED');
  await evaluate(`document.querySelector('#btn-wizard-confirm-submit').click()`);
  const end=Date.now()+20000;
  while(receipts.created.length===createCount && Date.now()<end) await new Promise(r=>setTimeout(r,100));
  requireCheck(receipts.created.length===createCount+1,'UNIQUE_CREATION_RECEIPT_REQUIRED');
  const consent=await body(receipts.created[createCount]);
  requireCheck(/^consent_[a-f0-9]{16}$/.test(consent.consentId??'') && consent.patientId===patientId && consent.sourceHospitalId==='HOSP-A' && consent.targetHospitalId==='HOSP-B' && consent.status==='ACTIVE' && consent.permission==='VIEW_ONLY' && consent.scopes?.length===1 && consent.scopes[0].studyInstanceUid===studyUid,'CONSENT_BINDING_REQUIRED');
  owned.push(consent);
  result.ownedReceipts = owned.map(row => ({consentId:row.consentId,patientId:row.patientId,sourceHospitalId:row.sourceHospitalId,targetHospitalId:row.targetHospitalId}));
  while(receipts.ticket.length===ticketCount && Date.now()<end) await new Promise(r=>setTimeout(r,100));
  requireCheck(receipts.ticket.length===ticketCount+1,'UNIQUE_TICKET_RECEIPT_REQUIRED');
  const ticket=await body(receipts.ticket[ticketCount]);
  requireCheck(ticket.consentId===consent.consentId && /^ticket_[a-f0-9]{16}$/.test(ticket.ticketId??''),'TICKET_BINDING_REQUIRED');
  result.ownedReceipts[result.ownedReceipts.length-1].ticketId=ticket.ticketId;
  const url=new URL(ticket.qr?.payload);
  requireCheck(url.protocol==='https:' && !url.search && !url.hash && !url.username && !url.password && /^\/t\/[A-Za-z0-9_-]{43}$/.test(url.pathname),'OPAQUE_QR_REQUIRED');
  await until(`document.querySelector('#wizard-step-4').classList.contains('active') && !!document.querySelector('#qr-box-wrap svg')`);
  return {consent,ticket,nonce:url.pathname.slice(3)};
}
try {
  for await (const chunk of process.stdin) {key+=chunk; requireCheck(key.length<=129,'CREDENTIAL_LIMIT');}
  if(expiryMode) renewalKey=key.trim();
  const port=Number(process.env.HIPASS_CHROME_DEBUG_PORT??9222);
  const tabResponse=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/mobile/')}`,{method:'PUT',signal:AbortSignal.timeout(10000)});
  requireCheck(tabResponse.ok,'TAB_OPEN_FAILED');
  const tab=await tabResponse.json(); cdp=await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Network.enable'); await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  cdp.on('Network.responseReceived', event => {
    const path=new URL(event.response.url).pathname;
    if(path==='/api/capstone-demo/login' && event.response.status===200) receipts.login=event.requestId;
    if(path==='/api/consents' && event.response.status===201) receipts.created.push(event.requestId);
    if(/^\/api\/consents\/consent_[a-f0-9]{16}\/handoff-ticket$/.test(path) && event.response.status===201) receipts.ticket.push(event.requestId);
  });
  await until(`!!document.querySelector('#capstone-login-key')`);
  if(verticalMode) {
    const opened=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/hipass/#DOCTOR')}`,{method:'PUT',signal:AbortSignal.timeout(10000)});
    requireCheck(opened.ok,'CLINICIAN_TAB_OPEN_FAILED');
    doctorCdp=await connect((await opened.json()).webSocketDebuggerUrl);
    await doctorCdp.send('Network.enable'); await doctorCdp.send('Runtime.enable');
    doctorCdp.on('Network.responseReceived',event=>{
      const path=new URL(event.response.url).pathname;
      if(path==='/api/transfers/tickets/redeem-viewer' && event.response.status===200) doctorReceipts.redeem=event.requestId;
      if(path===`/dicomweb/studies/${studyUid}/series/${studyUid}.1/instances` && event.response.status===200) doctorReceipts.instances=event.requestId;
    });
    const end=Date.now()+20000;
    while(Date.now()<end) {
      const ready=await doctorCdp.send('Runtime.evaluate',{expression:`!!document.querySelector('#capstone-login-key')`,returnByValue:true});
      if(ready.result.value) break;
      await new Promise(r=>setTimeout(r,250));
    }
    await doctorCdp.send('Runtime.evaluate',{expression:`(() => {document.querySelector('#capstone-patient-profile').value='PHANTOM'; document.querySelector('#capstone-login-key').value=${JSON.stringify(key.trim())}; document.querySelector('#capstone-login').requestSubmit();})()`,returnByValue:true});
    // Observe normal page bootstrap before the patient's real broadcast.
    const readyEnd=Date.now()+20000;
    let ready=false;
    while(Date.now()<readyEnd) {
      const snapshot=await doctorCdp.send('Runtime.evaluate',{expression:`!document.querySelector('#capstone-login') && !!document.querySelector('#btn-simulate-qr-scan') && document.querySelectorAll('#patient-study-select option').length>1`,returnByValue:true});
      if(snapshot.result.value) {ready=true;break;} await new Promise(r=>setTimeout(r,250));
    }
    requireCheck(ready,'CLINICIAN_BOOTSTRAP_NOT_READY');
    result.checks.push({test:'CLINICIAN_REAL_UI_LOGIN',status:'PASS'});
  }
  await evaluate(`(() => {document.querySelector('#capstone-patient-profile').value='PHANTOM'; document.querySelector('#capstone-login-key').value=${JSON.stringify(key.trim())}; document.querySelector('#capstone-login').requestSubmit();})()`);
  key=''; await until(`!document.querySelector('#capstone-login') && !!document.querySelector('#btn-auth-pin')`);
  requireCheck(receipts.login,'LOGIN_RECEIPT_REQUIRED'); const login=await body(receipts.login);
  requireCheck(login.demoContext?.patientId===patientId && login.profiles?.PATIENT && login.profiles?.DOCTOR,'PROFILE_BINDING_REQUIRED'); profiles=login.profiles;
  await evaluate(`document.querySelector('#btn-auth-pin').click()`);
  await until(`document.querySelector('#auth-overlay')?.classList.contains('unlocked')`);
  await until(`!!document.querySelector('[data-action-cine="${studyUid}"]')`);
  result.checks.push({test:'SERVER_BOUND_MOBILE_DEVELOPMENT_LOGIN',status:'PASS'});
  const first=await issue();
  result.checks.push({test:`PHANTOM_${modality}_REVIEW_CONSENT_QR`,status:'PASS'});
  if(verticalMode) {
    result.stage='CLINICIAN_TICKET_RECEPTION';
    const end=Date.now()+15000;
    let received=false;
    while(Date.now()<end) {
      const snapshot=await doctorCdp.send('Runtime.evaluate',{expression:`document.querySelector('#qr-scanned-ref')?.textContent.includes(${JSON.stringify(first.ticket.ticketId)})`,returnByValue:true});
      if(snapshot.result.value) {received=true;break;} await new Promise(r=>setTimeout(r,250));
    }
    requireCheck(received,'CLINICIAN_TICKET_NOT_RECEIVED');
    result.checks.push({test:'SAME_TICKET_RECEIVED_IN_CLINICIAN_UI',status:'PASS'});
    result.stage='CLINICIAN_VIEWER';
    await doctorCdp.send('Runtime.evaluate',{expression:`document.querySelector('#btn-simulate-qr-scan').click()`,returnByValue:true});
    const pixelEnd=Date.now()+100000;
    let pixels=false;
    while(Date.now()<pixelEnd) {
      const state=await doctorCdp.send('Runtime.evaluate',{expression:`(() => {const i=document.querySelector('#viewer-image'); return {allowed:document.querySelector('#qr-handoff-status')?.textContent.includes('ALLOWED'),width:i?.naturalWidth,height:i?.naturalHeight,blob:i?.src.startsWith('blob:'),slices:document.querySelector('#viewer-slice-slider')?.max};})()`,returnByValue:true});
      if(state.result.value.allowed && state.result.value.width===256 && state.result.value.height===256 && state.result.value.blob && state.result.value.slices==='12') {pixels=true;break;}
      await new Promise(r=>setTimeout(r,250));
    }
    requireCheck(pixels,'CLINICIAN_QR_VIEWER_PIXELS_NOT_CONFIRMED');
    requireCheck(doctorReceipts.redeem && doctorReceipts.instances,'CLINICIAN_NETWORK_RECEIPTS_REQUIRED');
    const readDoctorBody=async id=>{
      const response=await doctorCdp.send('Network.getResponseBody',{requestId:id});
      return JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString('utf8'):response.body);
    };
    const redeemed=await readDoctorBody(doctorReceipts.redeem);
    requireCheck(redeemed.ticketId===first.ticket.ticketId && redeemed.viewerContext?.studyInstanceUid===studyUid && redeemed.viewerContext?.permission==='VIEW_ONLY' && redeemed.viewerContext?.targetHospitalId==='HOSP-B' && typeof redeemed.accessToken==='string','CLINICIAN_TICKET_SCOPE_MISMATCH');
    const claims=JSON.parse(Buffer.from(redeemed.accessToken.split('.')[1],'base64url').toString('utf8'));
    requireCheck(claims.consentId===first.consent.consentId && typeof claims.jti==='string','CLINICIAN_TOKEN_BINDING_MISMATCH');
    await doctorCdp.send('Runtime.evaluate',{expression:`globalThis.__verticalFirstBlob=document.querySelector('#viewer-image').src; const slider=document.querySelector('#viewer-slice-slider'); slider.value='2'; slider.dispatchEvent(new Event('input',{bubbles:true}));`,returnByValue:true});
    const nextEnd=Date.now()+45000;
    let next=false;
    while(Date.now()<nextEnd) {
      const state=await doctorCdp.send('Runtime.evaluate',{expression:`(() => {const i=document.querySelector('#viewer-image');return i.complete && i.naturalWidth===256 && i.src.startsWith('blob:') && i.src!==globalThis.__verticalFirstBlob;})()`,returnByValue:true});
      if(state.result.value) {next=true;break;} await new Promise(r=>setTimeout(r,250));
    }
    result.phantom=verifyPhantomPixels({studyUid,rows:await readDoctorBody(doctorReceipts.instances),width:256,height:256,nextSlice:next});
    result.phantom.auditReference={consentId:first.consent.consentId,auditSessionId:redeemed.auditSessionId??claims.auditSessionId,tokenId:claims.jti};
    requireCheck(result.phantom.result==='PASS','EXACT_PHANTOM_NEXT_SLICE_NOT_CONFIRMED');
    result.viewerPixels='PASS';
    result.checks.push({test:'SAME_TICKET_CLINICIAN_VIEWER_256PX_12_SLICES',status:'PASS'});
    const replay=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:first.nonce});
    requireCheck([403,409].includes(replay.status) && replay.body.reasonCode==='TICKET_ALREADY_USED' && !replay.body.accessToken,'NONCE_REPLAY_NOT_DENIED');
    // Separate API negative-probe token bound to this verifier's own key.
    // Never sign with a different key for the UI token and call its 403 a scope
    // or revocation success. The UI token remains bound to the clinician tab.
    const input={consentId:first.consent.consentId,doctorId:'DOC-B-01',requestingHospitalId:'HOSP-B',studyInstanceUid:studyUid,seriesInstanceUid:studyUid+'.1',purpose:'TREATMENT',requestedAction:'VIEW'};
    const issued=await request('/api/dicom-access/request','DOCTOR',input);
    requireCheck(issued.status===200 && issued.body.decision==='ALLOWED' && typeof issued.body.accessToken==='string','NEGATIVE_PROBE_BOUND_TOKEN_REQUIRED');
    const probeToken=issued.body.accessToken;
    result.apiNegativeProbe='SEPARATE_BOUND_TOKEN_SAME_CONSENT_NOT_UI_REPLACEMENT';
    result.phantom.auditReference.negativeAuditSessionId=issued.body.auditSessionId;
    result.phantom.auditReference.identityDenialAuditRequired=true;
    const control=await request(`/dicomweb/studies/${studyUid}/series`,'DOCTOR',undefined,probeToken);
    requireCheck(control.status===200,'NEGATIVE_PROBE_AUTH_CONTROL_FAILED');
    const probeClaims=JSON.parse(Buffer.from(probeToken.split('.')[1],'base64url').toString('utf8'));
    const snapshotRef={consentId:first.consent.consentId,auditSessionId:issued.body.auditSessionId,tokenId:probeClaims.jti};
    const snapshot=()=>{
      const run=spawnSync('C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe',['scripts/capstone-phantom-audit-check.py','--negative-snapshot',JSON.stringify(snapshotRef)],{encoding:'utf8',timeout:35000,maxBuffer:1048576,windowsHide:true});
      requireCheck(run.status===0,'NEGATIVE_SNAPSHOT_UNAVAILABLE');
      const value=JSON.parse(run.stdout); requireCheck(value.status==='PASS','NEGATIVE_SNAPSHOT_UNAVAILABLE'); return value;
    };
    result.negativeCases=[];
    const deny=async(test,send,reason,expectedStatus=403)=>{
      const before=snapshot(), response=await send(), after=snapshot();
      const unchanged=JSON.stringify(before.counters)===JSON.stringify(after.counters) && before.consentScopeSha256===after.consentScopeSha256;
      const publicReason=response.body.reasonCode??response.body.error;
      const auditDelta=(after.denialCounts[reason]??0)-(before.denialCounts[reason]??0);
      const safeBody=response.contentType.startsWith('application/json') && !response.body.accessToken && !response.body.encryptedDek && !response.body.keyEnvelope && !response.body.ciphertext;
      const auditRecorded=auditDelta>0;
      const passed=response.status===expectedStatus && safeBody && unchanged && auditRecorded;
      result.negativeCases.push({test,httpStatus:response.status,publicReason:/^[A-Z0-9_]{1,80}$/.test(publicReason??'')?publicReason:'SAFE_GENERIC',expectedReason:reason,auditDelta,denialAudit:auditRecorded?'PASS':'FAIL',noForbiddenSideEffects:unchanged,noPayloadOrToken:safeBody,before:before.counters,after:after.counters,status:passed?'PASS':'FAIL'});
      requireCheck(passed,'NEGATIVE_CONTRACT_OR_SIDE_EFFECT_FAILURE');
    };
    // The normal UI is allowed to finish prefetch before serialized DB windows.
    await new Promise(r=>setTimeout(r,4000));
    const seriesPath=`/dicomweb/studies/${studyUid}/series/${studyUid}.999/instances`;
    await deny('FOREIGN_SERIES',()=>request(seriesPath,'DOCTOR',undefined,probeToken),'TOKEN_SERIES_MISMATCH');
    await deny('WRONG_HOSPITAL',()=>request('/api/dicom-access/request','DOCTOR',{...input,requestingHospitalId:'HOSP-A'}),'HOSPITAL_IDENTITY_MISMATCH');
    await deny('PATIENT_CANNOT_ISSUE_CLINICIAN_TOKEN',()=>request('/api/dicom-access/request','PATIENT',input),'ROLE_NOT_ALLOWED');
    await deny('SPOOFED_DOCTOR_ID',()=>request('/api/dicom-access/request','DOCTOR',{...input,doctorId:'DOC-A-01'}),'DOCTOR_IDENTITY_MISMATCH');
    const {consentId:omitted,...noConsent}=input;
    await deny('MISSING_CONSENT_ID_INPUT',()=>request('/api/dicom-access/request','DOCTOR',noConsent),'INVALID_REQUEST');
    await deny('NONEXISTENT_CONSENT',()=>request('/api/dicom-access/request','DOCTOR',{...input,consentId:'consent_0000000000000000'}),'ACCESS_DENIED_NO_CONSENT');
    const parts=probeToken.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
    const normalPath=`/dicomweb/studies/${studyUid}/series`;
    await deny('TAMPERED_TOKEN',()=>request(normalPath,'DOCTOR',undefined,parts.join('.')),'TOKEN_INVALID');
    await deny('MISSING_DPOP',()=>request(normalPath,'DOCTOR',undefined,probeToken,{authorization:'DPoP '+probeToken}),'DPOP_PROOF_REQUIRED');
    const replayHeaders=proof({path:normalPath,token:probeToken});
    const firstProof=await request(normalPath,'DOCTOR',undefined,probeToken,replayHeaders);
    requireCheck(firstProof.status===200,'DPOP_REPLAY_NORMAL_CONTROL_FAILED');
    await deny('REUSED_DPOP',()=>request(normalPath,'DOCTOR',undefined,probeToken,replayHeaders),'DPOP_NONCE_REPLAYED');
    const foreign=await request(`/dicomweb/studies/${foreignStudyUid}/series`,'DOCTOR',undefined,probeToken);
    requireCheck(foreign.status===403 && foreign.body.error==='ACCESS_DENIED','FOREIGN_STUDY_NOT_DENIED');
    const download=await request(`/dicomweb/studies/${studyUid}/series/${studyUid}.1/instances/${studyUid}.1.1/download`,'DOCTOR',undefined,probeToken);
    requireCheck(download.status===403,'VIEW_ONLY_DOWNLOAD_NOT_DENIED');
    result.checks.push({test:'USED_TICKET_AND_FOREIGN_STUDY_SERVER_DENY',status:'PASS'});
    // Do not fall back to a direct redemption API or create another consent.
    result.stage='MOBILE_REVOCATION';
    await evaluate(`document.querySelector('#btn-revoke-qr').click()`);
    await until(`document.querySelector('#mobile-action-confirm')?.open===true`);
    await evaluate(`[...document.querySelectorAll('#mobile-action-confirm button')].find(b=>b.textContent==='확인 후 실행').click()`);
    await until(`document.querySelector('#qr-status-pill').textContent.includes('REVOKED') && !document.querySelector('#qr-box-wrap svg')`);
    const revoked=await request(`/api/consents/${first.consent.consentId}`,'PATIENT');
    requireCheck(revoked.status===200 && revoked.body.status==='REVOKED','REVOCATION_NOT_CONFIRMED');
    const denied=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:first.nonce});
    requireCheck([403,409].includes(denied.status) && denied.body.decision==='DENIED' && !denied.body.accessToken,'REVOKED_TICKET_NOT_DENIED');
    const imagePath=`/dicomweb/studies/${studyUid}/series/${studyUid}.1/instances/${studyUid}.1.1/rendered`;
    const revokedImage=await request(imagePath,'DOCTOR',undefined,probeToken);
    requireCheck(revokedImage.status===403 && revokedImage.body.error==='ACCESS_DENIED','REVOKED_IMAGE_NOT_DENIED');
    result.negativeReasonAudit='REQUIRED_SEPARATE_PG_CHECK_NOT_INFERRED_FROM_GENERIC_403';
    const clearedEnd=Date.now()+15000; let cleared=false;
    while(Date.now()<clearedEnd) {
      const state=await doctorCdp.send('Runtime.evaluate',{expression:`document.querySelector('#viewer-image')?.hidden===true`,returnByValue:true});
      if(state.result.value) {cleared=true;break;} await new Promise(r=>setTimeout(r,250));
    }
    requireCheck(cleared,'CLINICIAN_PIXELS_NOT_CLEARED_AFTER_REVOCATION');
    const exposure=await doctorCdp.send('Runtime.evaluate',{expression:`(() => {const values=${JSON.stringify([...Object.values(profiles),redeemed.accessToken,first.nonce,first.ticket.qr.payload])};return !values.some(v=>document.body.innerText.includes(v)||location.href.includes(v)||JSON.stringify(localStorage).includes(v)||JSON.stringify(sessionStorage).includes(v));})()`,returnByValue:true});
    requireCheck(exposure.result.value,'CLINICIAN_CAPABILITY_EXPOSURE');
    result.checks.push({test:'SAME_CONSENT_MOBILE_REVOCATION_SERVER_DENY',status:'PASS'});
  } else if(expiryMode) {
    const started=Date.now(), expiresAt=Date.parse(first.ticket.qr.expiresAt);
    requireCheck(Number.isFinite(expiresAt) && expiresAt>started && expiresAt-started<=900000,'BOUNDED_REAL_TICKET_DEADLINE_REQUIRED');
    await until(`Date.now()>=${expiresAt} && document.querySelector('#qr-status-pill').textContent.includes('EXPIRED') && !document.querySelector('#qr-box-wrap svg')`,expiresAt-started+20000);
    result.checks.push({test:'REAL_CLIENT_DEADLINE_QR_REMOVED',status:'PASS'});
    result.expiryWaitMs=Date.now()-started;
    // Renew verifier identities after actual five-minute session expiry. The
    // mobile page's session/clock/TTL are never replaced or extended.
    const renewed=await request('/api/capstone-demo/login',null,{key:renewalKey,patientProfile:'PHANTOM'});
    requireCheck(renewed.status===200 && renewed.body.demoContext?.patientId===patientId && renewed.body.profiles?.PATIENT && renewed.body.profiles?.DOCTOR,'EXPIRY_VERIFIER_REAUTH_REQUIRED');
    profiles=renewed.body.profiles; renewalKey='';
    // Browser wall time is not the authority clock. Read-only polling observes
    // the exact server ticket; never retry a mutating redemption or change TTL.
    const serverObservationStarted=performance.now();
    let status;
    do {
      status=await request(`/api/consents/${first.consent.consentId}/handoff-tickets/${first.ticket.ticketId}`,'PATIENT');
      requireCheck(status.status===200 && status.body.consentId===first.consent.consentId && status.body.ticketId===first.ticket.ticketId && status.body.expiresAt===first.ticket.qr.expiresAt,'SERVER_EXPIRY_RECEIPT_BINDING_REQUIRED');
      if(status.body.status!=='ISSUED') break;
      if(performance.now()-serverObservationStarted>=90000) break;
      await new Promise(r=>setTimeout(r,1000));
    } while(performance.now()-serverObservationStarted<90000);
    result.serverExpiryObservationMs=Math.round(performance.now()-serverObservationStarted);
    result.expiryStatusReceipt={httpStatus:status.status,
      status:['ISSUED','USED','REVOKED','EXPIRED'].includes(status.body.status)?status.body.status:'UNKNOWN',
      consentMatches:status.body.consentId===first.consent.consentId,ticketMatches:status.body.ticketId===first.ticket.ticketId,
      expiryMatches:status.body.expiresAt===first.ticket.qr.expiresAt,
      serverClockBeforeDeadline:Number.isFinite(status.serverDateMs)?status.serverDateMs<expiresAt:null};
    requireCheck(status.status===200 && status.body.consentId===first.consent.consentId && status.body.ticketId===first.ticket.ticketId && status.body.expiresAt===first.ticket.qr.expiresAt && status.body.status==='EXPIRED','SERVER_EXPIRY_NOT_CONFIRMED');
    const expired=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:first.nonce});
    requireCheck([403,409].includes(expired.status) && expired.body.decision==='DENIED' && expired.body.reasonCode==='TICKET_EXPIRED' && !expired.body.accessToken,'EXPIRED_TICKET_NOT_DENIED');
    result.expiration='PASS'; result.expiryWaitMs=Date.now()-started;
    result.checks.push({test:'REAL_DEADLINE_QR_REMOVAL_EXACT_SERVER_EXPIRY_AND_REDEMPTION_DENY',status:'PASS'});
  } else {
  const redeem=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:first.nonce});
  requireCheck(redeem.status===200 && redeem.body.decision==='ALLOWED' && redeem.body.ticketId===first.ticket.ticketId && redeem.body.viewerContext?.studyInstanceUid===studyUid && redeem.body.viewerContext?.targetHospitalId==='HOSP-B' && typeof redeem.body.accessToken==='string','REDEMPTION_FAILED');
  await until(`document.querySelector('#qr-status-pill').textContent.includes('(USED)') && !document.querySelector('#qr-box-wrap svg')`,15000);
  const replay=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:first.nonce});
  requireCheck([403,409].includes(replay.status) && replay.body.reasonCode==='TICKET_ALREADY_USED' && !replay.body.accessToken,'NONCE_REPLAY_NOT_DENIED');
  result.checks.push({test:'REDEEM_USED_POLL_QR_REMOVAL_AND_NONCE_REPLAY',status:'PASS'});
  const second=await issue();
  await evaluate(`document.querySelector('#btn-revoke-qr').click()`);
  await until(`document.querySelector('#mobile-action-confirm')?.open===true`);
  await evaluate(`[...document.querySelectorAll('#mobile-action-confirm button')].find(b=>b.textContent==='확인 후 실행').click()`);
  await until(`document.querySelector('#qr-status-pill').textContent.includes('REVOKED') && !document.querySelector('#qr-box-wrap svg')`);
  const revoked=await request(`/api/consents/${second.consent.consentId}`,'PATIENT');
  requireCheck(revoked.status===200 && revoked.body.status==='REVOKED','REVOCATION_NOT_CONFIRMED');
  const denied=await request('/api/transfers/tickets/redeem-viewer','DOCTOR',{nonce:second.nonce});
  requireCheck([403,409].includes(denied.status) && denied.body.decision==='DENIED' && !denied.body.accessToken,'REVOKED_TICKET_NOT_DENIED');
  result.checks.push({test:'MOBILE_EXPLICIT_REVOCATION_QR_REMOVAL_SERVER_DENY',status:'PASS'});
  const exposure=await evaluate(`(() => {const values=${JSON.stringify([...Object.values(profiles),first.nonce,first.ticket.qr.payload,second.nonce,second.ticket.qr.payload])}; return !values.some(v=>document.body.innerText.includes(v)||location.href.includes(v)||JSON.stringify(localStorage).includes(v)||JSON.stringify(sessionStorage).includes(v));})()`);
  requireCheck(exposure,'CAPABILITY_EXPOSURE');
  result.checks.push({test:'NO_TEXT_LOCATION_OR_WEB_STORAGE_CAPABILITY_EXPOSURE',status:'PASS'});
  }
  result.result='PASS';
} catch(error) {result.result=error.cause?.code==='ECONNREFUSED'?'ENVIRONMENT BLOCKED':'FAIL'; result.reason=error.cause?.code==='ECONNREFUSED'?'BROWSER_DEBUG_ENDPOINT_UNAVAILABLE':/^[A-Z_]+$/.test(error.message??'') ? error.message : 'CHECK_FAILED';}
finally {
  result.ownedConsentCleanup=[];
  for(const consent of owned) {
    try {
      const current=await request(`/api/consents/${consent.consentId}`,'PATIENT');
      requireCheck(current.status===200 && current.body.consentId===consent.consentId && current.body.patientId===patientId,'CLEANUP_OWNER_MISMATCH');
      if(current.body.status==='ACTIVE') {
        const revoked=await request(`/api/consents/${consent.consentId}/revoke`,'PATIENT',{});
        requireCheck(revoked.status===200 && revoked.body.consentId===consent.consentId && revoked.body.status==='REVOKED','CLEANUP_REVOKE_FAILED');
      } else requireCheck(['REVOKED','EXPIRED'].includes(current.body.status),'CLEANUP_STATE_UNKNOWN');
      result.ownedConsentCleanup.push({status:'PASS'});
    } catch { result.ownedConsentCleanup.push({status:'NOT VERIFIED'}); result.result='FAIL'; }
  }
  key=''; renewalKey=''; profiles=null; cdp?.close(); doctorCdp?.close(); clearTimeout(deadline);
  result.elapsedMs=Math.round(performance.now()-runStarted);
}
console.log(JSON.stringify(result)); process.exitCode=result.result==='PASS'?0:1;

function connect(url) {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url), pending=new Map(), handlers=new Map(); let id=0;
    const opening=setTimeout(()=>{socket.close(); reject(new Error('CDP_OPEN_TIMEOUT'));},10000);
    socket.addEventListener('message',event=>{const data=JSON.parse(event.data); if(data.id && pending.has(data.id)){const p=pending.get(data.id);pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error('CDP_ERROR')):p.resolve(data.result??{});} else for(const callback of handlers.get(data.method)??[]) callback(data.params??{});});
    socket.addEventListener('open',()=>{clearTimeout(opening);resolve({send(method,params={},timeout=15000){return new Promise((res,rej)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);rej(new Error('CDP_TIMEOUT'));},timeout);pending.set(next,{resolve:res,reject:rej,timer});socket.send(JSON.stringify({id:next,method,params}));});},on(method,callback){handlers.set(method,[...(handlers.get(method)??[]),callback]);},close(){socket.close();}});});
    socket.addEventListener('error',()=>{clearTimeout(opening);reject(new Error('CDP_OPEN_FAILED'));});
  });
}
