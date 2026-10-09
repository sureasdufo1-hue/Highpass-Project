// Ephemeral VM-local worker. Private identity and raw DEK never leave this VM.
// Control HTTP is loopback inside an authenticated SSH reverse tunnel, not public TLS evidence.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {createAzureCertificateCredential} from '../src/azure-certificate-credential.js';
import {createPatientImageEncryptor,createPatientImageDecryptor} from '../src/patient-encrypted-transfer.js';
import {boundedHttps} from '../src/data-plane-gateway.js';

const [role,keyId]=process.argv.slice(2);
const identity=JSON.parse(readFileSync('/run/key-identity/identity.json','utf8'));
if(!['A','B'].includes(role) || identity.role!==role)throw new Error('VM_ROLE_INVALID');
const tokenProvider=createAzureCertificateCredential({tenantId:identity.tenantId,clientId:identity.clientId,
  certificate:readFileSync('/run/key-identity/identity.crt'),privateKey:readFileSync('/run/key-identity/identity.key')});
const paths=['src/patient-encrypted-transfer.js','src/azure-key-vault-data-plane.js','src/azure-certificate-credential.js'];
const sourceFiles=[...readdirSync('/app/src').filter(p=>p.endsWith('.js')).map(p=>'src/'+p),'scripts/patient-vault-worker.js'].sort();
const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')]));
console.log(JSON.stringify({ready:true,role,clientId:identity.clientId,tenantId:identity.tenantId,
  nowMs:Date.now(),
  sourceFiles:sourceFiles.length,sourceDigest:createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex'),
  hashes:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync('/app/'+p)).digest('hex')]))}));
let pacsReads=0;
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  let plain;
  const controlResults=[];
  let scopeChecks;
  let pacsEvidence;
  let phase='INPUT';
  try{
    if(line.length>16*1024*1024)throw new Error('INPUT_LIMIT');
    const input=JSON.parse(line);
    if(!Number.isInteger(input.controlPort) || input.controlPort<1024 || input.controlPort>65535
      || typeof input.serviceKey!=='string' || !/^[a-f0-9]{64}$/.test(input.serviceKey))throw new Error('CONTROL_CONFIG_INVALID');
    const control=async(path,body)=>{
      if(!/^\/gateway\/patient-self-view\/package\/(?:wrap-authorize|prepare|authorize)$/.test(path))throw new Error('CONTROL_PATH_INVALID');
      const response=await fetch(`http://127.0.0.1:${input.controlPort}${path}`,{method:'POST',
        headers:{'content-type':'application/json','x-hipass-service-token':input.serviceKey},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      controlResults.push({operation:path.split('/').at(-1),status:response.status});
      return {status:response.status,body:await response.json()};
    };
    let result;
    if(role==='A' && input.operation==='stats'){
      console.log(JSON.stringify({ok:true,pacsReads}));continue;
    }
    if(role==='A' && input.operation==='metadata'){
      const modality=input.params.pacs;
      if(!['CT','MR'].includes(modality))throw new Error('PATIENT_PACS_SCOPE_INVALID');
      const study='1.2.826.0.1.3680043.10.5432.20261009.'+(modality==='CT'?'1':'2'),series=study+'.1';
      if(input.params.path!==`/dicom-web/studies/${study}/series/${series}/instances`)throw new Error('PATIENT_PACS_SCOPE_INVALID');
      const origin=process.env.HIPASS_PROBE_PACS_ORIGIN;
      if(!/^https:\/\/(?:10\.[0-9.]+|172\.(?:1[6-9]|2[0-9]|3[01])\.[0-9.]+|192\.168\.[0-9.]+):8443$/.test(origin??''))throw new Error('PATIENT_PRIVATE_PACS_REQUIRED');
      phase='PACS_QIDO';const metadata=await boundedHttps(origin,input.params.path,{tls:{ca:readFileSync('/run/pacs/ca.crt'),cert:readFileSync('/run/pacs/gateway-client.crt'),key:readFileSync('/run/pacs/gateway-client.key'),servername:'hospital-a-orthanc-mtls'},timeoutMs:5000,maxBytes:1024*1024,headers:{accept:'application/dicom+json'}});
      plain=metadata.body;if(metadata.status!==200)throw new Error('PATIENT_PACS_QIDO_FAILED');
      const rows=JSON.parse(plain.toString()),expected=new Set(Array.from({length:12},(_,i)=>series+'.'+(i+1)));
      if(rows.length!==12 || rows.some(row=>!expected.delete(row['00080018']?.Value?.[0])) || expected.size)throw new Error('PATIENT_PACS_UID_INVALID');
      console.log(JSON.stringify({ok:true,contentType:'application/dicom+json',body:plain.toString('base64'),pacsEvidence:{modality,study,series,instances:12},pacsReads}));continue;
    }
    if(role==='A' && input.operation==='seal'){
      const c=JSON.parse(Buffer.from(input.params.receipt.split('.')[0],'base64url'));
      scopeChecks={path:c.path===new URL(input.params.route.externalUrl).pathname,grant:c.claims.jti===input.params.scope.tokenId,
        subject:c.claims.sub===input.params.scope.subject,patient:c.claims.patientId===input.params.scope.patientId,
        study:c.claims.studyInstanceUid===input.params.route.studyInstanceUid,series:c.claims.allowedSeriesUids?.[0]===input.params.route.seriesInstanceUid,
        remainingMs:c.deadline-Date.now()};
      plain=Buffer.from(input.params.body,'base64');
      if(input.params.pacs){
        if(!['CT','MR'].includes(input.params.pacs) || Object.entries(scopeChecks).some(([key,value])=>key!=='remainingMs' && value!==true))throw new Error('PATIENT_PACS_SCOPE_INVALID');
        const study='1.2.826.0.1.3680043.10.5432.20261009.'+(input.params.pacs==='CT'?'1':'2');
        const series=study+'.1',sop=input.params.route.sopInstanceUid;
        if(input.params.route.studyInstanceUid!==study || input.params.route.seriesInstanceUid!==series || !Array.from({length:12},(_,i)=>series+'.'+(i+1)).includes(sop))throw new Error('PATIENT_PACS_SCOPE_INVALID');
        const options={tls:{ca:readFileSync('/run/pacs/ca.crt'),cert:readFileSync('/run/pacs/gateway-client.crt'),key:readFileSync('/run/pacs/gateway-client.key'),servername:'hospital-a-orthanc-mtls'},
          timeoutMs:5000,maxBytes:1024*1024,headers:{accept:'application/dicom+json'}};
        const path=`/dicom-web/studies/${study}/series/${series}/instances`;
        const origin=process.env.HIPASS_PROBE_PACS_ORIGIN;
        if(!/^https:\/\/(?:10\.[0-9.]+|172\.(?:1[6-9]|2[0-9]|3[01])\.[0-9.]+|192\.168\.[0-9.]+):8443$/.test(origin??''))throw new Error('PATIENT_PRIVATE_PACS_REQUIRED');
        phase='PACS_QIDO';
        const metadata=await boundedHttps(origin,path,options);
        let rows;
        try{if(metadata.status!==200)throw new Error('PATIENT_PACS_QIDO_FAILED');rows=JSON.parse(metadata.body.toString());}finally{metadata.body.fill(0);}
        const expected=new Set(Array.from({length:12},(_,i)=>series+'.'+(i+1)));
        if(rows.length!==12 || rows.some(row=>!expected.delete(row['00080018']?.Value?.[0])) || expected.size)throw new Error('PATIENT_PACS_UID_INVALID');
        phase='PACS_RENDERED';
        const rendered=await boundedHttps(origin,path+'/'+sop+'/rendered',{...options,headers:{accept:'image/png'}});
        pacsReads++;
        plain.fill(0);plain=rendered.body;
        if(rendered.status!==200 || plain.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || plain.readUInt32BE(16)!==256 || plain.readUInt32BE(20)!==256)throw new Error('PATIENT_PACS_PIXEL_INVALID');
        input.params.contentType=rendered.contentType;
        pacsEvidence={modality:input.params.pacs,study,series,sop,instances:rows.length,width:256,height:256,pacsReads,
          plainSha256:createHash('sha256').update(plain).digest('hex')};
      }
      phase='PATIENT_SEAL';
      result=await createPatientImageEncryptor({keyId,tokenProvider,control}).sealPatient({...input.params,body:plain});
    }else if(role==='B' && input.operation==='open'){
      result=await createPatientImageDecryptor({keyId,tokenProvider,control,publicBaseUrl:'https://synthetic.invalid'})
        .openPatient({...input.params.result,body:Buffer.from(input.params.result.body,'base64')},input.params.path,{token:input.params.token});
      plain=result.body;
    }else throw new Error('OPERATION_DENIED');
    console.log(JSON.stringify({ok:true,contentType:result.contentType,body:result.body.toString('base64'),controlResults,pacsEvidence}));
  }catch(error){const reason=error.code??error.message;
    console.log(JSON.stringify({ok:false,reason:/^(?:(?:PATIENT|KV|ENTRA|ERR_TLS|ERR_SSL|UPSTREAM)_[A-Z_]+|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|ENOENT)$/.test(reason??'')?reason:'PATIENT_VM_OPERATION_DENIED',phase,controlResults,scopeChecks}));}
  finally{plain?.fill(0);}
}
