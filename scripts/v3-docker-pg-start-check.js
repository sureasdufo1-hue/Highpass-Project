import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {Pool} from 'pg';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture,observeOwnedFixtureAbsence} from './test-support/owned-postgres-start.js';

const sources=['scripts/v3-docker-pg-start-check.js','scripts/test-support/owned-postgres-start.js',
 'test/owned-postgres-start.test.js','docs/implementation/highpass-v3-docker-pg-start-diagnostics-prompt.md'];
const hash=()=>Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const initial=hash(),began=Date.now(),profiles=[];
function docker(args,timeout=15000){return spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});}
let failed=false,imageId=null;
try{
 const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);
 if(image.status!==0||!/^sha256:[a-f0-9]{64}$/.test(image.stdout.trim()))throw Error('POSTGRES_IMAGE_UNAVAILABLE');
 imageId=image.stdout.trim();
 for(const mode of ['none','bridge','published']){
  const opts={name:`hp-v3-start-${mode}-${randomUUID()}`,owner:randomUUID(),label:'highpass.validation.startup',
   password:randomBytes(32).toString('hex'),mode,docker};
  const phaseStarted=Date.now();let pool,profile={mode,fixture:{name:opts.name,owner:opts.owner,label:opts.label},result:'NOT VERIFIED',ready:false,sql:false};
  try{
   const startup=startOwnedPostgresFixture(opts);profile.startup=startup;
   console.log(JSON.stringify({phase:'STARTUP_OBSERVED',mode,owned:startup.owned,running:startup.running,
    observations:startup.observations}));
   if(!startup.owned)throw Error('POSTGRES_OWNERSHIP_UNCONFIRMED');
   // Same fixture after an uncertain ACK; no second start/run/replacement.
   const until=Date.now()+60000;
   while(Date.now()<until){
    const r=docker(['exec',opts.name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','2'],4000);
    if(r.status===0){profile.ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!profile.ready)throw Error('POSTGRES_READINESS_UNAVAILABLE');
   if(mode==='published'){
    const port=docker(['port',opts.name,'5432/tcp']),match=port.status===0&&port.stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
    if(!match)throw Error('POSTGRES_PORT_UNAVAILABLE');
    pool=new Pool({host:'127.0.0.1',port:Number(match[1]),user:'postgres',password:opts.password,
     database:'postgres',connectionTimeoutMillis:3000,query_timeout:5000,statement_timeout:4000,max:1});
    pool.on('error',()=>{});
    const result=await pool.query('SELECT 1 AS synthetic_probe');
    profile.sql=result.rows.length===1&&result.rows[0].synthetic_probe===1;
    profile.transport='LOCALHOST_RANDOM_PORT';
   }else{
    const result=docker(['exec',opts.name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1',
     '-c',"SET statement_timeout='4s';SELECT 1;"]);
    profile.sql=result.status===0&&result.stdout.trim()==='1';profile.transport='CONTAINER_EXEC';
   }
   if(!profile.sql)throw Error('POSTGRES_SQL_UNCONFIRMED');
   profile.result='PASS';
  }catch(error){
   profile.reason=['POSTGRES_OWNERSHIP_UNCONFIRMED','POSTGRES_READINESS_UNAVAILABLE','POSTGRES_PORT_UNAVAILABLE',
    'POSTGRES_SQL_UNCONFIRMED'].includes(error.message)?error.message:'POSTGRES_OR_TRANSPORT_UNAVAILABLE';
  }finally{
   await pool?.end();
   const removal=removeOwnedPostgresFixture(opts);
   const followup=!removal.absent&&removal.owned?await observeOwnedFixtureAbsence(opts):null;
   profile.cleanup=removal.absent||followup?.absent?'PASS':'NOT VERIFIED';
   profile.cleanupObservations=[...removal.observations,...(followup?.observations??[])];
   if(profile.cleanup!=='PASS')profile.result='NOT VERIFIED';
   profile.durationMs=Date.now()-phaseStarted;profiles.push(profile);
   if(profile.result!=='PASS')failed=true;
   console.log(JSON.stringify({phase:'PROFILE_COMPLETE',mode,result:profile.result,ready:profile.ready,sql:profile.sql,cleanup:profile.cleanup}));
  }
  if(profile.cleanup!=='PASS')break; // Do not leave an uncertain object and launch replacements.
 }
}catch(error){failed=true;console.log(JSON.stringify({phase:'ENVIRONMENT',result:'NOT VERIFIED',reason:
 error.message==='POSTGRES_IMAGE_UNAVAILABLE'?error.message:'STARTUP_CHECK_UNAVAILABLE'}));}
const finalHashes=hash(),sourceUnchanged=JSON.stringify(initial)===JSON.stringify(finalHashes);
if(!sourceUnchanged)failed=true;
const summary={result:!failed&&profiles.length===3?'PASS':'NOT VERIFIED',scope:'OWNED SYNTHETIC PG STARTUP ONLY',
 imageId,profiles,durationMs:Date.now()-began,sourceHashes:finalHashes,sourceUnchanged,nodeVersion:process.version,
 generatedAt:new Date().toISOString(),notVerified:['root cause of prior combined run ACK failure','complete PG regression',
  'clinical RLS/approval','production TLS/HA/operations']};
const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:5000});
const repositorySha=git.status===0&&/^[a-f0-9]{40}$/.test(git.stdout.trim())?git.stdout.trim():null;
if(!repositorySha){failed=true;summary.result='NOT VERIFIED';}
const directory=path.join('evidence','generated',`hp-v3-docker-start-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
mkdirSync(directory,{recursive:true});const sourcePath=path.join(directory,'startup-check.json').replaceAll('\\','/');
writeFileSync(sourcePath,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({repositorySha,workingTreeDirty:true,containsSecrets:false,
 containsPersonalData:false,evidence:[{evidenceId:'v3-docker-pg-start',sourcePath,repositorySha,
  sha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED',
  containsSecrets:false,containsPersonalData:false}]},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({result:summary.result,durationMs:summary.durationMs,profiles:profiles.map(p=>({mode:p.mode,result:p.result})),
 evidenceDirectory:directory.replaceAll('\\','/'),sourceUnchanged,reviewStatus:'DRAFT',reviewer:'UNASSIGNED'}));
process.exitCode=failed||profiles.length!==3?1:0;
