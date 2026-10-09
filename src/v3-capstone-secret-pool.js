import {openSync,closeSync,readFileSync,fstatSync,constants} from 'node:fs';
import {X509Certificate} from 'node:crypto';
import {Pool} from 'pg';
import {capstoneIdentityLoginRoles} from './v3-capstone-identity-grants.js';

const fail=()=>{throw Error('V3_MOUNTED_SECRET_OR_TLS_CONFIGURATION_INVALID');};
const roles=new Set(capstoneIdentityLoginRoles);
export function validateCapstoneRoleSecret(raw,{role,uid,gid,mode,nlink,size}={}){
 if(!roles.has(role)||uid!==0||gid!==65532||mode!==0o640||nlink!==1||!Number.isInteger(size)||size<100||size>2048
 ||typeof raw!=='string'||Buffer.byteLength(raw)!==size)fail();
 let value;try{value=JSON.parse(raw);}catch{fail();}
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='database,password,scope,user'
 ||value.scope!=='CAPSTONE_SYNTHETIC_ONLY'||value.database!=='highpass_v3_capstone'||value.user!==role
 ||typeof value.password!=='string'||!/^[a-f0-9]{64}$/.test(value.password))fail();
 return value;
}
function readMounted(path,secret,maxBytes=secret?2048:8192){
 let fd;try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maxBytes||stat.nlink!==1)fail();
  const raw=readFileSync(fd,'utf8');
  return {raw,meta:{uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777,nlink:stat.nlink,size:stat.size}};
 }catch{fail();}finally{if(fd!==undefined)closeSync(fd);}
}

/** Fixed root-controlled authority mounts, never caller/body/header paths. */
export function readCapstoneAuthorityMount(name){
 if(!['registry','authority-keys'].includes(name)||process.platform!=='linux'||process.getuid?.()!==65532)fail();
 const material=readMounted('/run/secrets/highpass-v3-'+name+'.json',true,name==='registry'?16384:2048);
 if(material.meta.uid!==0||material.meta.gid!==65532||material.meta.mode!==0o640)fail();
 let value;try{value=JSON.parse(material.raw);}catch{fail();}return value;
}

/** Dedicated API TLS files only; no reuse of DB keys or environment paths. */
export function readCapstoneIdentityTls({mode}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||process.platform!=='linux'||process.getuid?.()!==65532)fail();
 const result={};let complete=false;
 try{
 for(const [name,file] of [['key','api-server.key'],['cert','api-server.crt'],['ca','api-ca.crt']]){
  const material=readMounted('/run/secrets/highpass-v3-'+file,name==='key',8192);
  if(material.meta.uid!==0||material.meta.gid!==65532||material.meta.mode!==0o640||material.meta.size<100)fail();
  result[name]=Buffer.from(material.raw,'utf8');
 }
 // Host factory validates CA signature, key match, localhost SAN, serverAuth and dates.
 complete=true;return result;
 }finally{if(!complete)for(const value of Object.values(result))value.fill(0);}
}

/** One role-specific mount only. No connection URL/env password/TLS escape hatch. */
export function createCapstoneMountedSecretPool({mode,role}={}){
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||!roles.has(role)||process.platform!=='linux'||process.getuid?.()!==65532)fail();
 const secret=readMounted('/run/secrets/highpass-v3-'+role+'.json',true);
 const credential=validateCapstoneRoleSecret(secret.raw,{role,...secret.meta});
 const authority=readMounted('/run/secrets/highpass-v3-db-ca.crt',false);
 let ca;try{ca=new X509Certificate(authority.raw);}catch{fail();}
 if(!ca.ca||Date.parse(ca.validFrom)>Date.now()||Date.parse(ca.validTo)<=Date.now()
 ||authority.meta.uid!==0||(authority.meta.mode&0o022)!==0)fail();
 return new Pool({host:'highpass-v3-postgres.invalid',port:5432,database:credential.database,user:credential.user,password:credential.password,
  ssl:{ca:authority.raw,rejectUnauthorized:true,servername:'highpass-v3-postgres.invalid',minVersion:'TLSv1.2'},
  max:4,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,query_timeout:4000,statement_timeout:3000,idle_in_transaction_session_timeout:8000});
}
