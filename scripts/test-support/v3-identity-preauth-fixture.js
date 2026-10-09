import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {createSyntheticPreauthObserver} from '../../src/v3-preauth-security-events.js';
import {V3IdentityReadiness} from '../../src/v3-identity-readiness.js';
import {createV3IdentityCapstoneRuntime} from '../../src/v3-identity-capstone-runtime.js';

/** Separate actorless publisher/reader in the owned throwaway PG only. */
export async function createIdentityPreauthFixture({admin,base,check}){
 const writerPassword=randomBytes(32).toString('hex'),readerPassword=randomBytes(32).toString('hex');
 await admin.query(`CREATE ROLE hp_v3_identity_preauth_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${writerPassword}';
  CREATE ROLE hp_v3_identity_preauth_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${readerPassword}';
  GRANT hp_v3_preauth_publisher_policy TO hp_v3_identity_preauth_writer;
  GRANT hp_v3_preauth_reader_policy TO hp_v3_identity_preauth_reader;`);
 const writer=new Pool({...base,user:'hp_v3_identity_preauth_writer',password:writerPassword,max:1});
 const reader=new Pool({...base,user:'hp_v3_identity_preauth_reader',password:readerPassword,max:1});
 writer.on('error',()=>{});reader.on('error',()=>{});
 const factory=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 const observer=factory.createEdgeObserver({sink:factory.createDurableSink({publisherPool:writer,reconciliationPool:reader,deadlineMs:1000,maxConcurrent:2})});
 let prior;
 try{prior=(await reader.query('SELECT event_id FROM highpass_v3.preauth_security_events')).rows.map(row=>row.event_id);}
 catch(error){observer.dispose();await Promise.all([writer.end(),reader.end()]);throw error;}
 const rows=async()=>(await reader.query(`SELECT event_id,stage,reason_code,result,source_kind,host(source_ip) ip
   FROM highpass_v3.preauth_security_events WHERE NOT(event_id=ANY($1::uuid[]))`,[prior])).rows;
 return {
  createRuntime(config){return createV3IdentityCapstoneRuntime({...config,publisherPool:writer,readerPool:reader});},
  observer,rows,
  createReadiness(clinicalPool){return new V3IdentityReadiness({mode:'CAPSTONE_SYNTHETIC_ONLY',clinicalPool,publisherPool:writer,readerPool:reader});},
  async settleNext(stage,outcome='RECORDED_DURABLE'){
   const previous=this.observed??0,until=Date.now()+2500;
   while(observer.observations().length<=previous&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
   const history=observer.observations();this.observed=history.length;
   check('identity preauth '+stage+' delivery reports '+outcome,history.length===previous+1&&history.at(-1).stage===stage&&history.at(-1).outcome===outcome);
  },
  async withInsertOutage(operation){
   const columns='event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip';
   await admin.query('REVOKE INSERT('+columns+') ON highpass_v3.preauth_security_events FROM hp_v3_preauth_publisher_policy');
   try{return await operation();}finally{await admin.query('GRANT INSERT('+columns+') ON highpass_v3.preauth_security_events TO hp_v3_preauth_publisher_policy');}
  },
  async close(){observer.dispose();await Promise.all([writer.end(),reader.end()]);}
 };
}
