// Real Control API + actual public patient app, isolated SQL and VM crypto bridge.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createServer as reservePort} from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {PostgresStore} from '../src/postgres-store.js';
import {HipassService} from '../src/services.js';
import {registerPhantomCatalog,PHANTOM_DATASET_ID} from '../src/capstone-phantom-catalog.js';
import {preparePatientDatabase} from './lib/patient-database-preparation.js';
import {registerPatientPhantom} from './lib/patient-phantom-registration.js';
import {createPatientBrowserProbe} from './lib/patient-browser-integration.js';
import {createPatientDataPlaneHandler} from '../src/patient-data-plane-gateway.js';
import {createCapstoneBPortal} from '../src/capstone-b-portal.js';
import {signIngress} from '../src/ingress.js';

const secret=()=>randomBytes(32).toString('hex'),name='hp-patient-full-app-'+randomBytes(6).toString('hex');
const checks=[],start=Date.now(),password=secret(),appPassword=secret(),patientPassword=secret(),aKey=secret(),bKey=secret(),ingressSecret=secret(),loginKey=secret();
let ownedId,admin,store,child,probe,aHttp,bHttp,controlPort,browserEvidence,grantHash,grantRevoked=false,deniedAccess,cleanup=false,phase='preflight';
const modality=process.env.HIPASS_PATIENT_PROBE_PHANTOM,studyUid='1.2.826.0.1.3680043.10.5432.20261009.'+(modality==='CT'?'1':'2'),seriesUid=studyUid+'.1';
const mobile=process.env.HIPASS_PATIENT_PROBE_MOBILE==='1';
const docker=args=>new Promise((resolve,reject)=>{const process=spawn('docker',args,{env:{...globalThis.process.env,POSTGRES_PASSWORD:password},windowsHide:true,stdio:['ignore','pipe','pipe']});let text='',done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(text.trim());},timer=setTimeout(()=>{process.kill();finish(new Error('DOCKER_TIMEOUT'));},30000);
  process.stdout.on('data',data=>{text+=data;if(text.length>1024*1024){process.kill();finish(new Error('DOCKER_OUTPUT_LIMIT'));}});process.stderr.resume();process.on('error',finish);process.on('close',code=>finish(code===0?undefined:new Error('DOCKER_COMMAND_FAILED')));});
const until=async(read,ms=30000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){if(await read())return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('READINESS_TIMEOUT');};
const reserve=async()=>{const server=reservePort();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
const bridge=async(operation,key,params)=>{const endpoint=process.env.HIPASS_PATIENT_PROBE_BRIDGE;assert.match(endpoint,/^http:\/\/127\.0\.0\.1:[0-9]+$/);
  const response=await fetch(endpoint+'/'+operation,{method:'POST',headers:{'content-type':'application/json','x-probe-key':process.env.HIPASS_PATIENT_PROBE_SECRET},body:JSON.stringify({controlPort,serviceKey:key,params}),signal:AbortSignal.timeout(25000)});
  const result=await response.json();if(response.status!==200||result.ok!==true)throw new Error('VM_CRYPTO_NOT_VERIFIED');return operation==='stats'?result:{status:200,contentType:result.contentType,body:Buffer.from(result.body,'base64')};};
try{
  assert.ok(['CT','MR'].includes(modality)&&process.env.HIPASS_PATIENT_PROBE_BRIDGE&&process.env.HIPASS_PATIENT_PROBE_KEY_ID,'ACTUAL_RESOURCES_REQUIRED');
  probe=await createPatientBrowserProbe({forward:async(req,res)=>{
    const api=req.url.startsWith('/api/'),chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<=32768);chunks.push(chunk);}
    const headers={};for(const key of ['authorization','dpop','content-type','accept'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
    if(api){const signed=signIngress({method:req.method,url:req.url,headers},'192.0.2.1',ingressSecret);Object.assign(headers,{'x-forwarded-for':'192.0.2.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});}
    const upstream=await fetch(`http://127.0.0.1:${api?controlPort:bHttp.address().port}${req.url}`,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,signal:AbortSignal.timeout(35000)});
    const body=Buffer.from(await upstream.arrayBuffer());assert.ok(body.length<=33554432);
    if(req.url.endsWith('/self-view-grants')&&upstream.status===201)grantHash=createHash('sha256').update(JSON.parse(body).accessToken).digest('hex');
    if(grantRevoked&&req.url.startsWith('/patient-dicomweb/')&&req.url.endsWith('/rendered')){
      let code;try{code=JSON.parse(body).error;}catch{}
      deniedAccess={status:upstream.status,error:typeof code==='string'&&/^PATIENT_[A-Z_]{1,96}$/.test(code)?code:'NOT_VERIFIED'};
    }
    res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json','cache-control':'no-store'});res.end(body);
  }});
  phase='owned-db-start';const image=await docker(['inspect','hipass-postgres','--format','{{.Image}}']);assert.match(image,/^sha256:[a-f0-9]{64}$/);
  ownedId=await docker(['run','--rm','-d','--name',name,'--label','highpass.purpose=isolated-patient-full-app','--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e','POSTGRES_PASSWORD','-p','127.0.0.1::5432',image]);
  const port=Number(await docker(['inspect',ownedId,'--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}']));
  const connection={host:'127.0.0.1',port,database:'postgres',user:'postgres',password,connectionTimeoutMillis:1500,query_timeout:6000,statement_timeout:5000};
  await until(async()=>{const candidate=new pg.Client(connection);candidate.on('error',()=>{});try{await candidate.connect();await candidate.query('SELECT 1');admin=candidate;return true;}catch{await candidate.end().catch(()=>{});return false;}},45000);
  phase='app-role-and-catalog';
  const ddl=(await admin.query("SELECT format('CREATE ROLE hipass_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',$1::text) AS statement",[appPassword])).rows[0].statement;await admin.query(ddl);
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO hipass_app');
  const uri=(user,value)=>`postgresql://${user}:${value}@127.0.0.1:${port}/postgres`;
  store=new PostgresStore(uri('hipass_app',appPassword));await store.load();
  const service=new HipassService(store);
  await registerPhantomCatalog({service,principal:{role:'SECURITY_ADMIN',hospitalId:'HOSP-A',actorId:'synthetic-source-admin'},input:{datasetId:PHANTOM_DATASET_ID},env:{HIPASS_CAPSTONE_PHANTOM_CATALOG:'1',HIPASS_CAPSTONE_MOCK_IDP:'1',HIPASS_CONTROL_PLANE_ONLY:'1',HIPASS_STORE:'postgres',NODE_ENV:'production',AUTH_MODE:'TEST'}});
  assert.equal(service.verifyAuditIntegrity().ok,true);await store.close();store=undefined;
  await preparePatientDatabase(admin,{password:patientPassword,apply:true});
  assert.equal((await registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID})).applied,false);
  assert.equal((await registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true})).applied,true);
  await assert.rejects(registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true}),/EXISTING_STATE_PRESERVED/);
  checks.push('FULL_NON_SUPERUSER_STORE_FIXED_CATALOG_AND_EXPLICIT_OWNERSHIP');
  controlPort=await reserve();
  const environment={...process.env,NODE_ENV:'production',AUTH_MODE:'TEST',HIPASS_STORE:'postgres',DATABASE_URL:uri('hipass_app',appPassword),PORT:String(controlPort),HIPASS_LISTEN_HOST:'127.0.0.1',HIPASS_CONTROL_PLANE_ONLY:'1',HIPASS_DPOP_REQUIRED:'1',HIPASS_CAPSTONE_SINGLE_WRITER:'1',HIPASS_CAPSTONE_PATIENT_GRANTS:'1',HIPASS_CAPSTONE_PATIENT_KEY_RELEASE:'1',HIPASS_CAPSTONE_MOCK_IDP:'1',HIPASS_CAPSTONE_PHANTOM_CATALOG:'1',HIPASS_PATIENT_AUTHORITY_DATABASE_URL:uri('hipass_patient_authority',patientPassword),HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN:aKey,HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN:bKey,HIPASS_PATIENT_KEY_VAULT_KEY_ID:process.env.HIPASS_PATIENT_PROBE_KEY_ID,HIPASS_DATA_PLANE_SOURCE_HOSPITAL_ID:'HOSP-A',HIPASS_PUBLIC_BASE_URL:probe.origin,HIPASS_DATA_PLANE_PUBLIC_BASE_URL:probe.origin,DICOM_TOKEN_SECRET:secret(),TEST_JWT_SECRET:secret(),HIPASS_CAPSTONE_LOGIN_KEY:loginKey,HIPASS_INGRESS_SECRET:ingressSecret,HIPASS_DATA_PLANE_SERVICE_TOKEN:secret(),JWT_ISSUER:'highpass-capstone-test-idp',JWT_AUDIENCE:'highpass-capstone-api',HIPASS_ENABLE_CURATED_DICOM:'0'};
  phase='real-control-readiness';child=spawn(process.execPath,['src/server.js'],{env:environment,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.resume();
  await until(async()=>{if(child.exitCode!==null)throw new Error('CONTROL_EXITED');try{return(await fetch('http://127.0.0.1:'+controlPort+'/api/health',{signal:AbortSignal.timeout(1500)})).status===200;}catch{return false;}},60000);
  checks.push('REAL_CONTROL_API_PRODUCTION_TEST_AUTH_SINGLE_WRITER_READY');
  const loopbackControl=async(path,body,key)=>{const r=await fetch('http://127.0.0.1:'+controlPort+path,{method:'POST',headers:{'content-type':'application/json','x-hipass-service-token':key},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,contentType:'application/json',body:Buffer.from(await r.arrayBuffer())};};
  const gateway=createPatientDataPlaneHandler({publicBaseUrl:probe.origin,controlOrigin:'https://synthetic-control.invalid',orthancOrigin:'https://synthetic-pacs.invalid',serviceToken:aKey,sourceHospitalId:'HOSP-A',patientImageEncryptionFactory:()=>({sealPatient:({body,signal,...params})=>bridge('seal',aKey,{...params,body:body.toString('base64'),pacs:modality})}),transport:async(origin,path,options)=>{
    if(origin==='https://synthetic-control.invalid')return loopbackControl(path,JSON.parse(options.body),aKey);
    assert.equal(origin,'https://synthetic-pacs.invalid');if(path.endsWith('/instances'))return bridge('metadata',aKey,{path,pacs:modality});
    // Actual pixel retrieval is done in the A worker after receipt checks.
    // This placeholder is never displayed or sealed as a successful pixel.
    return {status:200,contentType:'image/png',body:Buffer.alloc(0)};
  }});
  aHttp=createServer(gateway);aHttp.requestTimeout=35000;aHttp.headersTimeout=10000;await new Promise(resolve=>aHttp.listen(0,'127.0.0.1',resolve));
  bHttp=createServer(createCapstoneBPortal({root:fileURLToPath(new URL('../public/',import.meta.url)),ca:Buffer.from('local-bridge-adapter-only'),patientSelfViewEnabled:true,patientImageDecryption:{openPatient:(result,path,{token})=>bridge('open',bKey,{result:{...result,body:result.body.toString('base64')},path,token})},transport:async(origin,path,options)=>{
    assert.equal(origin,'https://10.90.88.2:9443');const r=await fetch('http://127.0.0.1:'+aHttp.address().port+path,{headers:options.headers,signal:AbortSignal.timeout(35000)});return {status:r.status,contentType:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};
  }}));bHttp.requestTimeout=40000;bHttp.headersTimeout=10000;await new Promise(resolve=>bHttp.listen(0,'127.0.0.1',resolve));
  phase='full-web-browser';
  browserEvidence=await probe.verify({fullApp:true,mobile,patientId:'HP-TEST-PHANTOM-001',study:{studyInstanceUid:studyUid},loginKey,stats:()=>bridge('stats',aKey,{}),denial:()=>deniedAccess,revoke:async()=>{
    assert.match(grantHash,/^[a-f0-9]{64}$/);const rows=(await admin.query("UPDATE capstone_patient_self_view_grants SET status='REVOKED' WHERE token_hash=$1 AND status='ACTIVE' RETURNING grant_id",[grantHash])).rows;assert.equal(rows.length,1);
    grantRevoked=true;
  }});assert.equal(browserEvidence.status,'PASS');
  checks.push(mobile?'REAL_MOBILE_PWA_LOGIN_SELECTION_PACS_VAULT_AND_SQL_REVOCATION':'REAL_PATIENT_WEB_LOGIN_SELECTION_PACS_VAULT_AND_SQL_REVOCATION');
  phase='final-audit';child.kill();await until(()=>child.exitCode!==null || child.signalCode!==null,5000);child=undefined;
  store=new PostgresStore(uri('hipass_app',appPassword));await store.load();assert.equal(new HipassService(store).verifyAuditIntegrity().ok,true);
  const released=(await admin.query("SELECT count(*)::int AS n FROM capstone_patient_key_releases r JOIN capstone_patient_self_view_grants g ON r.grant_id=g.grant_id WHERE g.token_hash=$1 AND g.status='REVOKED' AND r.status='CONSUMED'",[grantHash])).rows[0].n;assert.equal(released,2);assert.equal((await bridge('stats',aKey,{})).pacsReads,2);
  checks.push('PERSISTED_HASH_CHAIN_REVOKED_GRANT_TWO_RELEASES_AND_READ_COUNT');
}catch(error){process.exitCode=1;checks.push('FAIL_OR_NOT_VERIFIED:'+phase+':'+(/^[A-Z_]+$/.test(error.message)?error.message:error.code??error.name));}
finally{
  if(child){child.kill();try{await until(()=>child.exitCode!==null || child.signalCode!==null,5000);}catch{process.exitCode=1;}}
  await probe?.stop().catch(()=>{process.exitCode=1;});for(const server of [bHttp,aHttp])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await store?.close().catch(()=>{process.exitCode=1;});await admin?.end().catch(()=>{process.exitCode=1;});
  try{const rows=JSON.parse(await docker(['inspect',name]));assert.equal(rows.length,1);assert.equal(rows[0].Name,'/'+name);assert.equal(rows[0].Config.Labels['highpass.purpose'],'isolated-patient-full-app');assert.equal(rows[0].HostConfig.AutoRemove,true);assert.equal(rows[0].Mounts.length,0);
    await docker(['stop','--timeout','3',rows[0].Id]).catch(()=>{});await until(async()=>await docker(['ps','-aq','--filter','name=^'+name+'$'])==='',10000);cleanup=true;
  }catch{process.exitCode=1;checks.push('OWNED_DATABASE_CLEANUP_NOT_VERIFIED');}
  console.log(JSON.stringify({status:process.exitCode?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',crypto:'VM_LOCAL_ACTUAL_AZURE_KEY_VAULT',data:'ACTUAL_A_SYNTHETIC_PACS_'+modality,scope:(mobile?'actual mobile PWA, development unlock; not native hardware':'real patient web; not mobile')+', full Control API, isolated synthetic SQL, trusted local HTTPS, VM-local PACS/Vault; not deployed public ingress, production or full MVP',checks,browser:browserEvidence,cleanup,elapsedMs:Date.now()-start}));
}
