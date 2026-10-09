import {randomUUID,X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createPendingTransactions} from '../../src/v3-pending-projection.js';

// SQL integrity/RLS tests only. Does NOT claim application context admission/storage.
export async function checkPendingNetworkSchema({admin,pool,binding,check}){
 const table='highpass_v3.consent_preparation_network_audit';
 await admin.query(`GRANT SELECT ON ${table} TO hp_v3_pending_app;
  GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at) ON ${table} TO hp_v3_pending_app;`);
 const txs=createPendingTransactions({pool});
 const events=await txs.run(binding,'consent:write',tx=>tx.query(`SELECT e.event_id,e.tenant_id,e.hospital_id,e.actor_id,e.audit_session_id,e.trace_id
  FROM highpass_v3.consent_preparation_audit_outbox e WHERE NOT EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_network_audit n WHERE n.event_id=e.event_id) ORDER BY e.event_id LIMIT 2`));
 check('network schema fixture uses existing authenticated domain events',events.rows.length===2);
 const event=events.rows[0],fingerprint=Buffer.from(new X509Certificate(readFileSync('tmp/certs/pending-edge/pending-proxy-dev.crt')).fingerprint256.replaceAll(':',''),'hex');
 const values=[event.event_id,event.tenant_id,event.hospital_id,event.actor_id,event.audit_session_id,event.trace_id,'127.0.0.1','CAPSTONE_MTLS_SIGNED_PROXY',fingerprint];
 const insert=`INSERT INTO ${table}(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,statement_timestamp())`;
 const wrongTuple=[...values];wrongTuple[5]='synthetic_wrong_trace_001';let fkDenied=false;
 try{await admin.query(insert,wrongTuple);}catch(error){fkDenied=error.code==='23503';}
 check('privileged network wrong correlation tuple fails actual FK independent of RLS',fkDenied);
 async function denied(name,sql,parameters,codes){
  const client=await pool.connect();let code;
  try{
   await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",[binding.tenantId,binding.hospitalId,binding.actorId]);
   try{await client.query(sql,parameters);}catch(error){code=error.code;}
  }finally{await client.query('ROLLBACK');client.release();}
  check(name,codes.includes(code));
 }
 for(const [name,index,value,codes] of [['foreign tenant',1,randomUUID(),['42501']],['wrong audit correlation',5,'synthetic_wrong_trace_001',['42501','23503']],
  ['missing domain event',0,randomUUID(),['42501','23503']],['IP subnet instead of host',6,'127.0.0.1/24',['23514']],
  ['wrong ingress mode',7,'UNTRUSTED',['23514']],['wrong fingerprint length',8,Buffer.alloc(31),['23514']]]){
  const args=[...values];args[index]=value;await denied(`nonowner network audit ${name} rejected`,insert,args,codes);
 }
 const out=await txs.run(binding,'consent:write',async tx=>{
  const inserted=await tx.query(insert,values),read=await tx.query(`SELECT event_id,host(source_ip) source_ip FROM ${table} WHERE event_id=$1`,[event.event_id]);
  return inserted.rowCount===1&&read.rows[0]?.source_ip==='127.0.0.1';
 });
 check('nonowner network schema inserts matching domain tuple and reads own row',out);
 check('network schema forces RLS and has no PUBLIC table grants',(await admin.query(`SELECT relrowsecurity AND relforcerowsecurity active FROM pg_class WHERE oid=$1::regclass`,[table])).rows[0].active===true
  &&(await admin.query("SELECT count(*)::int n FROM information_schema.table_privileges WHERE table_schema='highpass_v3' AND table_name='consent_preparation_network_audit' AND grantee='PUBLIC'")).rows[0].n===0);
 check('no-context nonowner network rows are invisible',(await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n===0);
 await denied('network row update is not a pending capability',`UPDATE ${table} SET source_ip='127.0.0.2' WHERE event_id=$1`,[event.event_id],['42501']);
 await denied('network row deletion is not a pending capability',`DELETE FROM ${table} WHERE event_id=$1`,[event.event_id],['42501']);
 let ownerDenied=false;try{await admin.query(`UPDATE ${table} SET source_ip='127.0.0.2' WHERE event_id=$1`,[event.event_id]);}catch(error){ownerDenied=error.code==='42501';}
 check('append-only network trigger denies privileged mutation too',ownerDenied);
}
