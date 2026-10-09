// Explicit operator-only preparation. Default is nonmutating preflight.
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {preparePatientDatabase} from './lib/patient-database-preparation.js';
let client;
try{
  if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw new Error('INVALID_ARGUMENT');
  if(process.env.HIPASS_CONTROL_PLANE_ONLY!=='1' || process.env.AUTH_MODE!=='TEST')throw new Error('INVALID_PROFILE');
  const read=name=>{
    const value=readFileSync(process.env[name],'utf8').trim();
    if(value.length<32 || value.length>256 || /[\r\n\0]/.test(value))throw new Error('INVALID_SECRET');
    return value;
  };
  const adminPassword=read('CAPSTONE_ADMIN_PASSWORD_FILE'),password=read('HIPASS_PATIENT_AUTHORITY_PASSWORD_FILE');
  if(adminPassword===password)throw new Error('DUPLICATE_SECRET');
  client=new pg.Client({host:'postgres',port:5432,database:'hipass',user:'hipass_bootstrap',password:adminPassword,
    connectionTimeoutMillis:5000,query_timeout:6000,statement_timeout:5000});
  client.on('error',()=>{});await client.connect();
  console.log(JSON.stringify(await preparePatientDatabase(client,{password,apply:process.argv.includes('--apply')})));
}catch{
  // PostgreSQL errors can include secret-bearing DDL. Never print them.
  console.error('PATIENT_DATABASE_PREPARATION=FAIL');process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
