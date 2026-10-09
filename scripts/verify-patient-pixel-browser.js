// Actual Chrome/HTTPS UI test with a synthetic protocol fixture, not PACS/Vault E2E.
import {createServer,request as httpsRequest} from 'node:https';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,createHmac,createHash,createPublicKey,verify,X509Certificate,createPrivateKey} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createServer as createPortReservation} from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

const runId=randomBytes(6).toString('hex'),root=path.resolve('tmp','patient-pixel-browser-'+runId);
const out=path.resolve('artifacts/workstation','patient-pixel-browser-'+runId);
const checks=[],start=Date.now(),authentication=randomBytes(32).toString('hex'),signingKey=randomBytes(32);
let server,browser,cdp,origin,mode='NORMAL',imageReads=0,imagePending=false,security=false,cleanup=false,stage='setup',failureCode;
const networkErrors=[],scriptErrors=[];
let pageRequests=0,moduleRequests=0,grantRequests=0,navigationError,observe,uiState,browserStopConfirmed=false;
const pendingTimers=new Set(),proofs=new Set();
const encode=object=>Buffer.from(JSON.stringify(object)).toString('base64url');
const mac=value=>createHmac('sha256',signingKey).update(value).digest('base64url');
function crc(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function png(level){const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,level,255-level,0,level,255-level]))),chunk('IEND',Buffer.alloc(0))]);}
const pictures=[png(30),png(180)];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,timeout=8000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await read())return;await delay(80);}throw new Error('OBSERVATION_TIMEOUT');}
function connect(url){const socket=new WebSocket(url),waiting=new Map();let id=0;
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&waiting.has(m.id)){const p=waiting.get(m.id);waiting.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('CDP_ERROR')):p.resolve(m.result);}
    if(m.method==='Network.responseReceived'&&m.params.response.url===origin+'/')security=m.params.response.securityDetails?.protocol?.startsWith('TLS')===true;
    if(m.method==='Network.loadingFailed')networkErrors.push(/^net::ERR_[A-Z_]+$/.test(m.params.errorText)?m.params.errorText:'OTHER');
    if(m.method==='Runtime.exceptionThrown')scriptErrors.push({name:m.params.exceptionDetails?.exception?.className??'OTHER',line:m.params.exceptionDetails?.lineNumber});});
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(new Error('CDP_CONNECT_TIMEOUT'));},10000);
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP_CONNECT_FAILED'));});
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve({close:()=>socket.close(),send(method,params={}){return new Promise((resolve,reject)=>{
      const n=++id,timer=setTimeout(()=>{waiting.delete(n);reject(new Error('CDP_TIMEOUT'));},10000);waiting.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});}});});});}
const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error('BROWSER_SCRIPT_FAILED');return result.result.value;};
const json=(response,status,value)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
function proofValid(request,token){try{
  const encoded=request.headers.dpop.split('.'),header=JSON.parse(Buffer.from(encoded[0],'base64url')),body=JSON.parse(Buffer.from(encoded[1],'base64url'));
  if(header.alg!=='ES256'||body.htm!==request.method||body.htu!==origin+request.url||proofs.has(body.jti)||Math.abs(Date.now()/1000-body.iat)>60)return false;
  if(token&&body.ath!==createHash('sha256').update(token).digest('base64url'))return false;
  const good=verify('sha256',Buffer.from(encoded[0]+'.'+encoded[1]),{key:createPublicKey({key:header.jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(encoded[2],'base64url'));
  if(good)proofs.add(body.jti);return good;
}catch{return false;}}
try{
  assert.equal(path.dirname(root),path.resolve('tmp'));await mkdir(root,{recursive:false});await mkdir(out,{recursive:true});
  const cert=await readFile('tmp/certs/edge/localhost.crt'),key=await readFile('tmp/certs/edge/localhost.key'),x509=new X509Certificate(cert);
  assert.ok(Date.parse(x509.validTo)>Date.now());assert.ok(x509.checkPrivateKey(createPrivateKey(key)));
  server=createServer({cert,key},async(request,response)=>{
    response.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'");
    response.setHeader('cache-control','no-store');
    if(request.url==='/'){pageRequests++;response.setHeader('content-type','text/html');response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patient viewer synthetic fixture</title><button id="launch">본인 합성 영상 열람</button><script type="module">import{openPatientPixelViewer}from'/patient-pixel-viewer.js';let urls=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);urls.add(u);return u};URL.revokeObjectURL=u=>{urls.delete(u);revoke(u)};window.fixtureUrls=()=>urls.size;document.querySelector('#launch').onclick=()=>openPatientPixelViewer({patientId:'SYNTHETIC',study:{studyInstanceUid:'1.2.3',series:[{seriesInstanceUid:'1.2.3.1'}],modality:'CT'},headers:{authorization:'Bearer ${authentication}'}});window.fixtureReady=true;</script>`);return;}
    if(request.url==='/patient-pixel-viewer.js'){moduleRequests++;response.setHeader('content-type','application/javascript');response.end(await readFile('public/patient-pixel-viewer.js'));return;}
    if(request.url.endsWith('/self-view-grants')){
      grantRequests++;
      request.resume();if(request.headers.authorization!=='Bearer '+authentication||!proofValid(request))return json(response,403,{error:'DENIED'});
      if(mode==='DENY')return json(response,403,{error:'DENIED'});
      const iat=Math.floor(Date.now()/1000),exp=iat+(mode==='EXPIRED'?3:60),unsigned=encode({alg:'HS256'})+'.'+encode({iat,exp});
      return json(response,201,{accessToken:unsigned+'.'+mac(unsigned),tokenType:'DPoP',permission:'VIEW_ONLY',expiresAt:new Date(exp*1000).toISOString()});
    }
    if(request.url.startsWith('/patient-dicomweb/')){
      const token=request.headers.authorization?.match(/^DPoP (.+)$/)?.[1];let claims;
      try{const p=token.split('.');assert.equal(p[2],mac(p[0]+'.'+p[1]));claims=JSON.parse(Buffer.from(p[1],'base64url'));}catch{return json(response,403,{error:'DENIED'});}
      if(claims.exp*1000<=Date.now()||!proofValid(request,token))return json(response,403,{error:'DENIED'});
      if(request.url.endsWith('/instances'))return json(response,200,[1,2].map(n=>({'0020000D':{Value:[mode==='WRONG_SCOPE'?'1.2.4':'1.2.3']},'0020000E':{Value:['1.2.3.1']},'00080018':{Value:['1.2.3.1.'+n]}})));
      if(request.url.endsWith('/rendered')){imageReads++;imagePending=true;const send=()=>{imagePending=false;if(response.destroyed)return;response.writeHead(200,{'content-type':'image/png'});response.end(mode==='CORRUPT'?Buffer.from('INVALID'):pictures[request.url.includes('/1.2.3.1.2/')?1:0]);};
        if(mode==='LATE'){const timer=setTimeout(()=>{pendingTimers.delete(timer);send();},1200);pendingTimers.add(timer);}else send();return;}
    }
    request.resume();json(response,404,{error:'NOT_FOUND'});
  });server.requestTimeout=5000;server.headersTimeout=6000;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;
  stage='node-tls';
  const ca=await readFile('tmp/certs/mtls/ca.crt');
  await new Promise((resolve,reject)=>{const r=httpsRequest(origin+'/',{ca,timeout:3000},response=>{
    response.resume();response.on('end',()=>response.statusCode===200?resolve():reject(new Error('TLS_HTTP_FAILED')));
  });r.on('timeout',()=>r.destroy(new Error('TLS_TIMEOUT')));r.on('error',reject);r.end();});
  checks.push('NODE_TLS_CHAIN_AND_HOSTNAME_VERIFIED');
  const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);assert.ok(exe);
  const reservation=createPortReservation();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  stage='chrome-start';
  browser=spawn(exe,['--headless=new','--disable-gpu','--no-proxy-server','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+root,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
  await until(async()=>{if(browser.exitCode!==null)throw new Error('CHROME_EXITED');try{return(await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},15000);
  stage='chrome-connect';
  const tab=await(await fetch('http://127.0.0.1:'+port+'/json/new?about%3Ablank',{method:'PUT',signal:AbortSignal.timeout(3000)})).json();
  cdp=await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Network.enable');await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:840,height:860,deviceScaleFactor:1,mobile:false});
  stage='https-page';const navigation=await cdp.send('Page.navigate',{url:origin+'/'});navigationError=navigation.errorText;
  await until(()=>evaluate('window.fixtureReady===true'),20000);
  assert.ok(security);checks.push('TRUSTED_HTTPS_NO_CERTIFICATE_BYPASS');
  await cdp.send('DOM.getDocument'); // Fresh DOM snapshot before interacting.
  const clickAt=async selector=>{await cdp.send('DOM.getDocument');
    const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const click=()=>clickAt('#launch');
  const snapshot=()=>evaluate("(()=>{const d=document.querySelector('#patient-pixel-viewer'),i=d?.querySelector('img');return {open:!!d?.open,visible:!!i&&!i.hidden,decoded:i?.naturalWidth??0,status:d?.querySelector('[role=status]')?.textContent,urls:window.fixtureUrls(),focused:document.activeElement?.id}})()");
  observe=snapshot;
  const close=()=>clickAt('#patient-pixel-viewer button:last-child');
  stage='normal';await click();await until(async()=>{const s=await snapshot();return s.visible&&s.decoded===2;});
  assert.match((await snapshot()).status,/1 \/ 2/);
  const first=await evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=2;const x=c.getContext('2d');x.drawImage(document.querySelector('#patient-pixel-viewer img'),0,0);return Array.from(x.getImageData(0,0,2,2).data).join(',')})()");
  await clickAt('#patient-pixel-viewer button:nth-child(2)');await until(async()=>/2 \/ 2/.test((await snapshot()).status));
  const second=await evaluate("(()=>{const c=document.createElement('canvas');c.width=c.height=2;const x=c.getContext('2d');x.drawImage(document.querySelector('#patient-pixel-viewer img'),0,0);return Array.from(x.getImageData(0,0,2,2).data).join(',')})()");assert.notEqual(first,second);
  checks.push('DECODED_SYNTHETIC_FIXTURE_TWO_DIFFERENT_PIXELS_AND_NEXT_SLICE');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'viewer.png'),Buffer.from(shot.data,'base64'));
  await close();assert.equal((await snapshot()).urls,0);assert.equal((await snapshot()).focused,'launch');checks.push('CLOSE_REVOKES_OBJECT_URL_AND_RESTORES_FOCUS');
  await click();await until(async()=>(await snapshot()).visible);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until(async()=>!(await snapshot()).open);assert.equal((await snapshot()).urls,0);checks.push('ESCAPE_CLEARS_PIXELS');
  for(const scenario of ['DENY','WRONG_SCOPE','CORRUPT','EXPIRED']){stage=scenario;mode=scenario;const before=imageReads;await click();
    await until(async()=>{const s=await snapshot();return !s.visible&&/열람할 수 없습니다|불러오지 못했습니다|만료/.test(s.status??'');});
    if(['DENY','WRONG_SCOPE'].includes(scenario))assert.equal(imageReads,before);
    assert.equal((await snapshot()).urls,0);await close();checks.push(scenario+'_NO_VISIBLE_PIXELS_OR_FALLBACK');
  }
  stage='late-close';mode='LATE';await click();await until(()=>imagePending);await close();await delay(1500);
  assert.equal((await snapshot()).open,false);assert.equal((await snapshot()).urls,0);checks.push('CLOSED_VIEWER_NEVER_DISPLAYS_LATE_RESPONSE');
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"),0);checks.push('NO_BROWSER_STORAGE_TOKENS');
}catch(error){process.exitCode=1;failureCode=['CHROME_EXITED','OBSERVATION_TIMEOUT','CDP_TIMEOUT','CDP_CONNECT_FAILED','CDP_CONNECT_TIMEOUT','BROWSER_SCRIPT_FAILED'].includes(error.message)?error.message:'CHECK_FAILED';checks.push('FAIL_OR_NOT_VERIFIED:'+stage);
  if(observe){uiState=await observe().catch(()=>undefined);try{const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}}
}
finally{
  cdp?.close();if(browser&&browser.exitCode===null){try{execFileSync('taskkill',['/PID',String(browser.pid),'/T','/F'],{stdio:'ignore',timeout:10000});}catch{}
    // taskkill can report already-exited children while its root termination
    // succeeded. Confirm the specific spawned process, not command wording.
    try{await until(()=>browser.exitCode!==null,3000);browserStopConfirmed=true;}catch{process.exitCode=1;checks.push('OWNED_BROWSER_STOP_NOT_VERIFIED');}
  }else browserStopConfirmed=!!browser;
  for(const timer of pendingTimers)clearTimeout(timer);server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  try{assert.equal(path.dirname(root),path.resolve('tmp'));await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});cleanup=true;}catch{process.exitCode=1;}
  const result={status:process.exitCode?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',checks,cleanup,failureCode,networkErrors,scriptErrors,pageRequests,moduleRequests,grantRequests,imageReads,uiState,
    navigationError:/^net::ERR_[A-Z_]+$/.test(navigationError??'')?navigationError:undefined,browserExitCode:browser?.exitCode,browserStopConfirmed,elapsedMs:Date.now()-start,
    scope:'actual Chrome with trusted local HTTPS and 2x2 PNG protocol fixture; not actual PACS, Azure, SQL authority, web/mobile full application or deployment'};
  await mkdir(out,{recursive:true});await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
