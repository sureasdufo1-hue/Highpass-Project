// Isolated actual-browser adapter. No fabricated pixel/authority response.
import {createServer,request as tlsRequest} from 'node:https';
import {createServer as reservePort} from 'node:net';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,X509Certificate,createPrivateKey} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const until=async(read,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read())return;await new Promise(r=>setTimeout(r,80));}throw new Error('PATIENT_BROWSER_TIMEOUT');};
export function requirePatientPolicyDenial(response){
  assert.equal(response?.status,403,'Expected policy DENY, not transport/service failure');
  assert.equal(response?.error,'PATIENT_ACCESS_DENIED','Expected dedicated patient policy error');
  return {status:response.status,error:response.error};
}
async function connect(url){
  const socket=new WebSocket(url),pending=new Map();let id=0;
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('PATIENT_BROWSER_CDP_ERROR')):p.resolve(m.result);}});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(new Error('PATIENT_BROWSER_CDP_TIMEOUT'));},10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('PATIENT_BROWSER_CDP_ERROR'));});});
  return {close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('PATIENT_BROWSER_CLOSED'));}pending.clear();socket.close();},
    send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(new Error('PATIENT_BROWSER_CDP_TIMEOUT_'+method.replaceAll('.','_').toUpperCase()));},10000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}};
}

export async function createPatientBrowserProbe({forward}){
  const id=randomBytes(6).toString('hex'),profile=path.resolve('tmp','patient-real-browser-'+id),out=path.resolve('artifacts/workstation','patient-real-browser-'+id);
  const cert=await readFile('tmp/certs/edge/localhost.crt'),key=await readFile('tmp/certs/edge/localhost.key'),ca=await readFile('tmp/certs/mtls/ca.crt');
  const x509=new X509Certificate(cert);assert.ok(Date.parse(x509.validTo)>Date.now());assert.ok(x509.checkPrivateKey(createPrivateKey(key)));
  let setup,browser,cdp,origin,profileCreated=false,fullAppMode=false;
  const server=createServer({cert,key},async(req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-content-type-options','nosniff');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    try{
      if(fullAppMode){await forward(req,res);return;}
      if(req.method==='GET'&&req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>합성 PACS 본인 영상 검증</title><button id="launch">합성 PACS 본인 영상 열람</button><script type="module" src="/probe.js"></script></html>');return;}
      if(req.method==='GET'&&req.url==='/probe.js'&&setup){res.setHeader('content-type','application/javascript; charset=utf-8');res.end(`import{openPatientPixelViewer}from'/patient-pixel-viewer.js';const setup=${JSON.stringify(setup)};document.querySelector('#launch').onclick=()=>openPatientPixelViewer(setup);window.probeReady=true;`);return;}
      if(req.method==='GET'&&req.url==='/patient-pixel-viewer.js'){res.setHeader('content-type','application/javascript; charset=utf-8');res.end(await readFile(new URL('../../public/patient-pixel-viewer.js',import.meta.url)));return;}
      if(req.url?.startsWith('/api/patients/')||req.url?.startsWith('/patient-dicomweb/')){await forward(req,res);return;}
      req.resume();res.writeHead(404);res.end();
    }catch{if(!res.headersSent){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"ISOLATED_BROWSER_UPSTREAM_UNAVAILABLE"}');}else res.destroy();}
  });server.requestTimeout=40000;server.headersTimeout=10000;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;
  const stop=async()=>{
    setup=undefined;cdp?.close();cdp=undefined;
    if(browser&&browser.exitCode===null){try{execFileSync('taskkill',['/PID',String(browser.pid),'/T','/F'],{stdio:'ignore',timeout:10000});}catch{}await until(()=>browser.exitCode!==null,3000);}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    if(profileCreated){assert.equal(path.dirname(profile),path.resolve('tmp'));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});profileCreated=false;}
  };
  return {origin,stop,async verify({patientId,study,authentication,revoke,stats,denial,fullApp=false,mobile=false,loginKey}){
    const checks=[],start=Date.now();let failure=false,cleanup=false,policyDenial;
    fullAppMode=fullApp;setup=fullApp?undefined:{patientId,study,headers:{authorization:'Bearer '+authentication}};
    try{
      if(fullApp)assert.equal(typeof denial,'function','Actual response observation required');
      await mkdir(profile,{recursive:false});profileCreated=true;await mkdir(out,{recursive:true});
      await new Promise((resolve,reject)=>{const r=tlsRequest(origin+'/',{ca,timeout:3000},response=>{response.resume();response.on('end',()=>response.statusCode===200?resolve():reject(new Error('PATIENT_BROWSER_TLS_HTTP_FAILED')));});r.on('timeout',()=>r.destroy(new Error('PATIENT_BROWSER_TLS_TIMEOUT')));r.on('error',reject);r.end();});checks.push('TLS_CHAIN_HOSTNAME_VERIFIED');
      const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);assert.ok(executable);
      const reservation=reservePort();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
      browser=spawn(executable,['--headless=new','--disable-gpu','--no-proxy-server','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
      await until(async()=>{if(browser.exitCode!==null)throw new Error('PATIENT_BROWSER_EXITED');try{return(await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},15000);
      const tab=await(await fetch('http://127.0.0.1:'+port+'/json/new?about%3Ablank',{method:'PUT',signal:AbortSignal.timeout(3000)})).json();cdp=await connect(tab.webSocketDebuggerUrl);
      const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('PATIENT_BROWSER_SCRIPT_ERROR');return r.result.value;};
      try{await cdp.send('Page.enable');}
      catch(error){
        if(error.message!=='PATIENT_BROWSER_CDP_TIMEOUT_PAGE_ENABLE')throw error;
        // Inspect the same live target; a command response deadline does not
        // establish renderer termination. These are diagnostics, not a retry.
        try{await cdp.send('Page.getFrameTree');checks.push('PAGE_ENABLE_TIMEOUT_SAME_TAB_FRAME_TREE_RESPONDED');}
        catch{checks.push('PAGE_ENABLE_TIMEOUT_SAME_TAB_FRAME_TREE_NOT_VERIFIED');}
        throw error;
      }
      await cdp.send('Runtime.enable');await cdp.send('Page.bringToFront');await cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?375:840,height:860,deviceScaleFactor:1,mobile});
      const destination=origin+(fullApp?(mobile?'/mobile/':'/hipass/'):'/');let navigationObservationExpired=false;
      try{const navigation=await cdp.send('Page.navigate',{url:destination});assert.equal(navigation.errorText,undefined);}
      catch(error){if(error.message!=='PATIENT_BROWSER_CDP_TIMEOUT_PAGE_NAVIGATE')throw error;navigationObservationExpired=true;}
      // A timed-out command observation does not prove the owned browser stopped.
      // Inspect that same tab, without reissuing navigation or relaxing TLS.
      await until(()=>evaluate(`location.href===${JSON.stringify(destination)}&&(${fullApp?"!!document.querySelector('#capstone-login-key')":'window.probeReady===true'})`));
      if(navigationObservationExpired)checks.push('NAVIGATION_COMMAND_TIMEOUT_SAME_TAB_READY_CONFIRMED');
      const click=async selector=>{await cdp.send('DOM.getDocument');await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);await cdp.send('DOM.getDocument');const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
      const snapshot=()=>evaluate("(()=>{const d=document.querySelector('#patient-pixel-viewer'),i=d?.querySelector('img');return{open:!!d?.open,visible:!!i&&!i.hidden,width:i?.naturalWidth??0,height:i?.naturalHeight??0,status:d?.querySelector('[role=status]')?.textContent,focused:document.activeElement?.id}})()");
      const pixels=()=>evaluate("(()=>{const i=document.querySelector('#patient-pixel-viewer img'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);let sum=0;for(const p of x.getImageData(0,0,c.width,c.height).data)sum=(sum*31+p)>>>0;return sum})()");
      let launch='#launch';
      if(fullApp){
        await cdp.send('DOM.getDocument');await evaluate("(()=>{const s=document.querySelector('#capstone-patient-profile');s.value='PHANTOM';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await click('#capstone-login-key');await cdp.send('Input.insertText',{text:loginKey});await click('#capstone-login button[type=submit]');
        if(mobile){
          await until(()=>evaluate("!document.querySelector('#capstone-login')&&!!document.querySelector('#btn-auth-pin')"));
          await click('#btn-auth-pin');
          await until(()=>evaluate("document.querySelector('#auth-overlay')?.classList.contains('unlocked')&&!!document.querySelector('[data-action-cine]')"));
          checks.push('ACTUAL_MOBILE_PWA_SIGNED_LOGIN_DEVELOPMENT_UNLOCK_SERVER_STUDIES');
          await click('[data-tab="studies"]');launch=`[data-action-cine="${study.studyInstanceUid}"]`;
        }else{
          await until(()=>evaluate("!document.querySelector('#capstone-login')&&document.querySelector('#patient-read-state')?.dataset.state==='ready'"));
          checks.push('ACTUAL_PATIENT_WEB_LOGIN_AND_SERVER_STUDY_LIST');
          await click('#patient-portal-app .nav-button[data-route="images"]');launch=`[data-patient-view="${study.studyInstanceUid}"]`;
        }
      }
      await click(launch);await until(async()=>{const s=await snapshot();if(!s.visible&&/못했습니다|열람할 수 없습니다/.test(s.status??''))throw new Error('PATIENT_BROWSER_NORMAL_DENIED');return s.visible&&s.width===256&&s.height===256;},35000);
      assert.match((await snapshot()).status,/1 \/ 12/);const first=await pixels();
      await click('#patient-pixel-viewer button:nth-child(2)');await until(async()=>{const s=await snapshot();if(!s.visible&&/못했습니다|열람할 수 없습니다/.test(s.status??''))throw new Error('PATIENT_BROWSER_NEXT_SLICE_DENIED');return /2 \/ 12/.test(s.status);},35000);assert.notEqual(await pixels(),first);checks.push('ACTUAL_256_PACS_TWO_DISTINCT_SLICES_DECODED');
      await writeFile(path.join(out,'viewer.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      const before=await stats();await revoke();await click('#patient-pixel-viewer button:nth-child(2)');
      await until(async()=>{const s=await snapshot();return !s.visible&&/열람할 수 없습니다/.test(s.status??'');});
      if(fullApp){policyDenial=requirePatientPolicyDenial(await denial());checks.push('REVOKED_GRANT_ACTUAL_HTTP_403_PATIENT_ACCESS_DENIED');}
      assert.equal((await stats()).pacsReads,before.pacsReads);checks.push('SQL_REVOKED_GRANT_BROWSER_DENY_NO_ADDITIONAL_PACS_READ');
      await click('#patient-pixel-viewer button:last-child');assert.equal((await snapshot()).open,false);
      assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(launch)})`),true);checks.push('CLOSED_PIXELS_REMOVED_FOCUS_RESTORED');
      assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0);checks.push('BROWSER_STORAGE_NO_TOKENS');
    }catch(error){failure=true;checks.push('FAIL_OR_NOT_VERIFIED:'+(/^[A-Z_]+$/.test(error.message)?error.message:'ASSERTION_FAILED'));
      if(cdp)try{await writeFile(path.join(out,'failure.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));}catch{}
    }
    finally{try{await stop();cleanup=true;}catch{failure=true;checks.push('OWNED_BROWSER_CLEANUP_NOT_VERIFIED');}
      const result={status:failure?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',checks,cleanup,elapsedMs:Date.now()-start,evidence:path.relative(process.cwd(),path.join(out,'result.json')).replaceAll('\\','/'),scope:fullApp?(mobile?'actual mobile PWA signed login/development unlock/study selection/common Viewer at375px; not native hardware':'actual patient web login/study selection/common Viewer; not mobile')+' with isolated full Control API and trusted local HTTPS; not public deployed ingress or production':'actual Chrome common Viewer, trusted local HTTPS, isolated SQL and configured A/B crypto; not full patient app/login, deployed ingress or production'};
      if(fullApp)result.policyDenial=policyDenial??{status:'NOT VERIFIED'};
      await mkdir(out,{recursive:true});await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));return result;
    }
  }};
}
