// Pin source-to-image contents; no network, mounts, VM or DB writes.
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const files=['src/capstone-hcc-catalog.js','src/capstone-mock-idp.js','src/patient-self-view-authority.js','src/server.js','src/capstone-b-portal.js','src/http-utils.js','public/capstone-auth.js','public/app.js','public/patient-pixel-viewer.js','public/index.html','public/ui/patient.js','public/ui/capstone-login.css','public/ui/patient-home-premium.css','public/fonts/pretendard/PretendardVariable.woff2','public/mobile/app.js','public/mobile/sw.js','public/mobile/index.html','scripts/register-capstone-patient-hcc.js','scripts/reset-capstone-patient-scenario.js','scripts/lib/patient-hcc-registration.js','scripts/lib/retire-capstone-patients.js'];
files.push('public/ui/clinician.js','public/ui/clinician-desk.css');
files.push('public/ui/viewer-studio.js','public/ui/viewer-studio.css');
files.push('public/ui/mobile.css','public/ui/faq-assistant.js','public/ui/faq-assistant.css','public/ui/faq-catalog.js','src/services.js','src/capstone-control-ingress.js');
const sources=[];for(const file of files)sources.push({path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
const images=[];
for(const image of ['highpass-hcc-main-ui:20261010','highpass-hcc-main-control:20261010']){
  const inspected=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8',timeout:15000}))[0];
  const code=`const fs=require('node:fs'),crypto=require('node:crypto');const files=${JSON.stringify(files)};console.log(JSON.stringify(files.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync('/app/'+path)).digest('hex')}))))`;
  const actual=JSON.parse(execFileSync('docker',['run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',inspected.Id,'-e',code],{encoding:'utf8',timeout:30000}));
  assert.deepEqual(actual,sources);images.push({image,id:inspected.Id,sourceMatch:'PASS',files:actual.length});
}
const result={status:'PASS',scope:'EXACT_LOCAL_CANDIDATE_SOURCE_HASH_ONLY_NOT_DEPLOYMENT_OR_CLINICAL_FLOW',review:'DRAFT / UNASSIGNED',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:5000}).trim(),dirty:true,images,sources};
const directory=path.resolve('artifacts/workstation/hcc-main-candidates');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'manifest.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,sources:sources.length}));
