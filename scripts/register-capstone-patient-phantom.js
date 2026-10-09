// Offline reviewed operator. Default rollback-only; never invoked by HTTP/startup.
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {registerPatientPhantom} from './lib/patient-phantom-registration.js';
import {PHANTOM_DATASET_ID} from '../src/capstone-phantom-catalog.js';
let client;
try{
  if(process.argv.slice(2).some(arg=>arg!=='--apply') || process.env.HIPASS_CONTROL_PLANE_ONLY!=='1' || process.env.AUTH_MODE!=='TEST')throw new Error('INVALID_PROFILE');
  const password=readFileSync(process.env.CAPSTONE_ADMIN_PASSWORD_FILE,'utf8').trim();
  if(password.length<32 || password.length>256 || /[\r\n\0]/.test(password))throw new Error('INVALID_SECRET');
  client=new pg.Client({host:'postgres',port:5432,database:'hipass',user:'hipass_bootstrap',password,
    connectionTimeoutMillis:5000,query_timeout:6000,statement_timeout:5000});
  client.on('error',()=>{});await client.connect();
  console.log(JSON.stringify(await registerPatientPhantom(client,{datasetId:PHANTOM_DATASET_ID,apply:process.argv.includes('--apply')})));
}catch(error){
  console.error(/^PATIENT_REGISTRATION_[A-Z_]+$/.test(error.message)?error.message:'PATIENT_REGISTRATION_FAIL');process.exitCode=1;
}finally{await client?.end().catch(()=>{});}
