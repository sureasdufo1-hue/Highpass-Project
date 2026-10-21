// Public synthetic-demo edge. No PACS, DICOM, admin or service-token forwarding.
import http from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {isIP} from 'node:net';
import {signIngress} from '../src/ingress.js';
const origin='https://highpass-demo.japaneast.cloudapp.azure.com';
const secret=readFileSync(process.env.HIPASS_INGRESS_SECRET_FILE,'utf8').trim();
if(secret.length<32)throw new Error('INGRESS_SECRET_REQUIRED');
const root='/app/public';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.glb':'model/gltf-binary'};
const routes=[
 ['POST',/^\/api\/pacs-transfer-jobs$/],
 ['GET',/^\/api\/pacs-transfer-jobs\/(active|history)$/],
 ['GET',/^\/api\/pacs-transfer-jobs\/[0-9a-f-]{36}$/i],
 ['POST',/^\/api\/pacs-transfer-jobs\/[0-9a-f-]{36}\/claim$/i],
 ['GET',/^\/api\/v1\/clinician\/health-records$/],
 ['POST',/^\/api\/dicom-access\/request$/],
 ['GET',/^\/api\/clinician\/receptions$/],
 ['POST',/^\/api\/consents\/[A-Za-z0-9_-]{1,128}\/handoff-ticket$/],
 ['GET',/^\/api\/consents\/[A-Za-z0-9_-]{1,128}\/handoff-tickets\/[A-Za-z0-9_-]{1,128}$/],
 ['POST',/^\/api\/demo\/qr\/redeem$/],
 ['GET',/^\/api\/capstone-demo\/(auth-config|identity)$/],
 ['GET',/^\/api\/(imaging-studies|hospitals|consents|transfers\/requests)$/],
 ['GET',/^\/api\/patients\/[A-Za-z0-9_-]{1,128}\/consents$/],
 ['POST',/^\/api\/patients\/[A-Za-z0-9_-]{1,128}\/studies\/[0-9.]{1,64}\/self-view-grants$/],
 ['POST',/^\/api\/(consents|transfers\/requests|policies\/access-check)$/],
 ['GET',/^\/api\/consents\/[A-Za-z0-9_-]+$/],
 ['POST',/^\/api\/consents\/[A-Za-z0-9_-]+\/revoke$/],
 ['GET',/^\/api\/transfers\/requests\/[A-Za-z0-9_-]+$/],
 ['POST',/^\/api\/transfers\/requests\/[A-Za-z0-9_-]+\/(approve|reject)$/],
 ['GET',/^\/api\/v1\/me\/(health-records|health-records\/[A-Za-z0-9_-]+|health-helper\/sources|health-helper\/topics)$/],
 ['POST',/^\/api\/v1\/me\/health-helper\/questions$/],
 ['GET',/^\/api\/security\/proof-policy$/],
  ['GET',/^\/api\/security\/overview$/],
  ['GET',/^\/api\/security\/events$/],
  ['GET',/^\/api\/security\/protection$/],
  ['POST',/^\/api\/security\/reports$/],
 ['POST',/^\/api\/security\/reviews$/],
];
const server=http.createServer(async(req,res)=>{
 const reply=(status,body)=>{if(!res.headersSent&&!res.destroyed){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}};
 res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
 res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://login.microsoftonline.com https://highpass-images-b.japaneast.cloudapp.azure.com; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
 try{
  const raw=req.url??'';
  if(raw.length>4096||!/^\/[A-Za-z0-9_./?=&%+:-]*$/.test(raw)||raw.startsWith('//')||raw.includes('..')||/%(?:2e|2f|5c|00)/i.test(raw)||/[?&](?:token|access_token|key|jwt)=/i.test(raw))return reply(400,{error:'UNSAFE_URL'});
  const url=new URL(raw,origin);
  if(url.pathname.startsWith('/api/')){
   if(!routes.some(([method,re])=>req.method===method&&re.test(url.pathname)))return reply(403,{error:'PUBLIC_ROUTE_NOT_ENABLED'});
   if(req.method!=='GET'&&req.headers.origin!==origin)return reply(403,{error:'ORIGIN_REQUIRED'});
   if(url.pathname!=='/api/capstone-demo/auth-config'&&!/^Bearer [A-Za-z0-9_.-]+$/.test(req.headers.authorization??''))return reply(401,{error:'AUTHENTICATION_REQUIRED'});
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>(req.method==='POST'&&url.pathname==='/api/pacs-transfer-jobs'?4194304:32768))return reply(413,{error:'REQUEST_TOO_LARGE'});chunks.push(c);}
   const headers={'content-type':'application/json','accept':'application/json','x-forwarded-proto':'https'};
   for(const h of ['authorization','dpop','idempotency-key'])if(typeof req.headers[h]==='string')headers[h]=req.headers[h];
   const ip=isIP(req.headers['x-highpass-client-ip']??'')?req.headers['x-highpass-client-ip']:req.socket.remoteAddress;
   const envelope=signIngress({method:req.method,url:raw,headers},ip,secret);
   headers['x-forwarded-for']=ip;headers['x-hipass-ingress-time']=envelope.timestamp;headers['x-hipass-ingress-signature']=envelope.signature;
   const upstream=await fetch('http://control:3000'+raw,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});
   const reader=upstream.body.getReader();const output=[];size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152)throw new Error('RESPONSE_TOO_LARGE');output.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   let body=Buffer.concat(output);
   if(url.pathname==='/api/capstone-demo/auth-config'&&upstream.ok){const config=JSON.parse(body);if(config.provider!=='ENTRA_OIDC')return reply(503,{error:'ENTRA_REQUIRED'});config.redirectUri=origin+'/entra-redirect.html';body=Buffer.from(JSON.stringify(config));}
   res.writeHead(upstream.status,{'content-type':'application/json'});res.end(body);return;
  }
  if(!['GET','HEAD'].includes(req.method))return reply(405,{error:'METHOD_NOT_ALLOWED'});
  let file=url.pathname;
  if(file==='/'||file==='/hipass/'||file==='/hipass')file='/index.html';
  if(file==='/mobile'||file==='/mobile/')file='/mobile/index.html';
  if(/^\/(api|dicomweb|patient-dicomweb|gateway|internal|assets\/clinical|previews|fixtures)(\/|$)/.test(file))return reply(403,{error:'PUBLIC_ROUTE_NOT_ENABLED'});
  const full=path.resolve(root,'.'+file);const type=mime[path.extname(file)];
  if(!type||!full.startsWith(root+'/')||!statSync(full).isFile())return reply(404,{error:'NOT_FOUND'});
  if(statSync(full).size>16*1024*1024)return reply(413,{error:'ASSET_TOO_LARGE'});
  let bytes=readFileSync(full);
  if(['/index.html','/mobile/index.html'].includes(file))bytes=Buffer.from(bytes.toString().replace('<html lang="ko">','<html lang="ko" data-capstone="1">'));
  res.writeHead(200,{'content-type':type});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){reply(error.code==='ENOENT'?404:502,{error:error.code==='ENOENT'?'NOT_FOUND':'PUBLIC_UPSTREAM_UNAVAILABLE'});}
});
server.requestTimeout=50000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
server.listen(8080,'0.0.0.0');
