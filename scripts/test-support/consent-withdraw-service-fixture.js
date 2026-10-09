import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPatientWithdrawalTransactions} from '../../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../../src/v3-patient-consent-withdraw-service.js';

export async function checkConsentWithdrawalService({admin,patientPool,expiryPool,patientBinding,record,consent,operation,assertion}){
 const key=randomBytes(32),faults=[],migration=readFileSync('db/migrations/028_highpass_v3_withdrawal_outcomes.sql','utf8');
 const tables=['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'];
 const counts=async()=>JSON.stringify((await admin.query('SELECT '+tables.map(t=>`(SELECT count(*) FROM highpass_v3.${t}) AS ${t}`).join(','))).rows);
 const outcomes=async()=>Number((await admin.query('SELECT count(*) AS n FROM highpass_v3.consent_withdrawal_outcomes')).rows[0].n);
 const wrapped=intercept=>({async connect(){const c=await patientPool.connect();return {on:(...args)=>c.on(...args),removeListener:(...args)=>c.removeListener(...args),
  release:destroy=>c.release(destroy),query:async q=>{try{return await (intercept?intercept(q,c):c.query(q));}catch(e){if(/^[0-9A-Z]{5}$/.test(e.code??''))faults.push(e.code);throw e;}}};}});
 const make=intercept=>new V3PatientConsentWithdrawalService({transactions:createPatientWithdrawalTransactions({pool:wrapped(intercept),maxReauthAgeMs:300000}),hmacKey:key});
 const selector=out=>({consentId:out.consentId,contentVersion:1,expectedEventSequence:2});
 const fresh=()=>`synthetic-withdraw-${randomUUID()}`;
 const run=(out,k=fresh(),provider=service)=>provider.withdraw(patientBinding(),k,selector(out));
 const waitExpiry=async(c,out)=>c.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM (valid_until-clock_timestamp())))+0.04) FROM highpass_v3.consent_content_versions WHERE consent_id=$1',[out.consentId]);
 let service;
 try{
  await assertion('withdraw service PG: 028 rollback and owned apply with FORCE RLS outcome audit',async()=>{
   const c=await admin.connect();
   try{await c.query('BEGIN');await c.query(migration);await c.query('ROLLBACK');assert.equal((await c.query("SELECT to_regclass('highpass_v3.consent_withdrawal_outcomes') IS NULL AS absent")).rows[0].absent,true);
    await c.query('BEGIN');await c.query(migration);await c.query('COMMIT');
   }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
   await admin.query('GRANT SELECT,INSERT ON highpass_v3.consent_withdrawal_outcomes TO hp_lifecycle_patient_test');
   assert.equal((await admin.query("SELECT relrowsecurity AND relforcerowsecurity AS safe FROM pg_class WHERE oid='highpass_v3.consent_withdrawal_outcomes'::regclass")).rows[0].safe,true);
  });
  service=make();let original;
  await assertion('withdraw service PG: actual signed private patient atomically withdraws and preserves initial receipt',async()=>{
   const out=await consent(),k=fresh(),before=(await admin.query('SELECT to_jsonb(r) AS receipt FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[out.consentId])).rows[0];
   let result;try{result=await run(out,k);}catch(e){if(faults.length)throw Object.assign(Error('SAFE_PG_ENUM_ONLY'),{code:faults.at(-1)});throw e;}
   assert.equal(result.state,'WITHDRAWN');assert.equal(result.eventSequence,3);assert.equal(result.cascadeStatus,'REQUESTED');assert.ok(Object.isFrozen(result));
   for(const t of tables)assert.equal(Number((await admin.query(`SELECT count(*) AS n FROM highpass_v3.${t} WHERE event_id=$1`,[result.eventId])).rows[0].n),1);
   assert.deepEqual((await admin.query('SELECT to_jsonb(r) AS receipt FROM highpass_v3.consent_patient_decision_results r WHERE consent_id=$1',[out.consentId])).rows[0],before);
   original={out,k,result};
  });
  await assertion('withdraw service PG: exact retry restores historic result and adds correlated retry audit only',async()=>{
   const before=await counts(),audits=await outcomes();assert.deepEqual(await run(original.out,original.k),original.result);
   assert.equal(await counts(),before);assert.equal(await outcomes(),audits+1);
   const a=(await admin.query("SELECT result,reason_code,receipt_event_id FROM highpass_v3.consent_withdrawal_outcomes WHERE receipt_event_id=$1",[original.result.eventId])).rows;
   assert.deepEqual(a,[{result:'HISTORICAL_RESULT',reason_code:'ORIGINAL_RECEIPT_RECOVERED',receipt_event_id:original.result.eventId}]);
  });
  await assertion('withdraw service PG: pooled timezone and DateStyle cannot alter original receipt',async()=>{
   const changed=make(async(q,c)=>{
    if(q.text==='BEGIN'){await c.query("SET TIME ZONE 'Asia/Seoul'");await c.query("SET DateStyle TO 'SQL, DMY'");}
    return c.query(q);
   });
   try{assert.deepEqual(await run(original.out,original.k,changed),original.result);}finally{changed.dispose();}
  });
  await assertion('withdraw service PG: changed selector same key and new-key duplicate deny with no terminal mutation',async()=>{
   const other=await consent(),before=await counts(),audits=await outcomes();
   await assert.rejects(()=>run(other,original.k),e=>e.code==='V3_WITHDRAW_IDEMPOTENCY_CONFLICT');
   await assert.rejects(()=>run(original.out),e=>e.code==='V3_WITHDRAW_CONSENT_TERMINAL');
   assert.equal(await counts(),before);assert.equal(await outcomes(),audits+2);
  });
  await assertion('withdraw service PG: same-key concurrency returns one exact receipt',async()=>{
   const out=await consent(),k=fresh(),results=await Promise.all([run(out,k),run(out,k)]);assert.deepEqual(results[0],results[1]);
   assert.equal(Number((await admin.query('SELECT count(*) AS n FROM highpass_v3.consent_lifecycle_events WHERE consent_id=$1',[out.consentId])).rows[0].n),1);
  });
  await assertion('withdraw service PG: different-key concurrency creates exactly one terminal',async()=>{
   const out=await consent(),results=await Promise.allSettled([run(out),run(out)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'V3_WITHDRAW_CONSENT_TERMINAL');
  });
  for(const t of ['consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'])await assertion(`withdraw service PG: missing ${t} rolls back whole terminal assembly`,async()=>{
   const out=await consent(),before=await counts(),bad=make((q,c)=>q.text.startsWith('INSERT INTO highpass_v3.'+t)?Promise.resolve({rows:[],rowCount:0}):c.query(q));
   try{await assert.rejects(()=>run(out,fresh(),bad),e=>['V3_COMMIT_OUTCOME_UNKNOWN','V3_DATABASE_UNAVAILABLE'].includes(e.code));}
   finally{bad.dispose();}assert.equal(await counts(),before);
  });
  await assertion('withdraw service PG: lost COMMIT ACK restores original receipt without second terminal',async()=>{
   const out=await consent(),k=fresh(),bad=make(async(q,c)=>{const r=await c.query(q);if(q.text==='COMMIT')throw Object.assign(Error('SYNTHETIC_ACK_LOSS'),{code:'ECONNRESET'});return r;});
   try{await assert.rejects(()=>run(out,k,bad),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}finally{bad.dispose();}
   const before=await counts(),result=await run(out,k);assert.equal(result.state,'WITHDRAWN');assert.equal(await counts(),before);assert.deepEqual(await run(out,k),result);
  });
  await assertion('withdraw service PG: expired new command denied but expired historical retry safely restored and audited',async()=>{
   const old=await consent({short:true}),k=fresh(),result=await run(old,k);await waitExpiry(admin,old);
   const before=await counts(),audits=await outcomes();assert.deepEqual(await run(old,k),result);
   await assert.rejects(()=>run(old),e=>e.code==='V3_WITHDRAW_CONSENT_TERMINAL');assert.equal(await counts(),before);assert.equal(await outcomes(),audits+2);
   const expired=await consent({short:true});await waitExpiry(admin,expired);
   await assert.rejects(()=>run(expired),e=>e.code==='V3_WITHDRAW_CONSENT_EXPIRED');
  });
  await assertion('withdraw service PG: deadline crossed during actual COMMIT rolls back and reports unknown outcome',async()=>{
   const out=await consent({short:true}),before=await counts(),bad=make(async(q,c)=>{if(q.text==='COMMIT')await waitExpiry(c,out);return c.query(q);});
   try{await assert.rejects(()=>run(out,fresh(),bad),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');}finally{bad.dispose();}assert.equal(await counts(),before);
  });
  await assertion('withdraw service PG: existing maintenance terminal denies authenticated withdrawal',async()=>{
   const out=await consent({short:true});await waitExpiry(admin,out);await operation(expiryPool,out,{expiry:true});
   const before=await counts();await assert.rejects(()=>run(out),e=>e.code==='V3_WITHDRAW_CONSENT_TERMINAL');assert.equal(await counts(),before);
  });
  await assertion('withdraw service PG: unknown selector audited as safe DENY with no supplied raw identifier',async()=>{
   const out={consentId:randomUUID()},before=await counts(),audits=await outcomes();
   await assert.rejects(()=>run(out),e=>e.code==='V3_WITHDRAW_CONSENT_RESOURCE_UNAVAILABLE');assert.equal(await counts(),before);assert.equal(await outcomes(),audits+1);
  });
  await assertion('withdraw service PG: missing outcome audit cannot return historical receipt',async()=>{
   const bad=make((q,c)=>q.text.startsWith('INSERT INTO highpass_v3.consent_withdrawal_outcomes')?Promise.resolve({rows:[],rowCount:0}):c.query(q));
   const before=await outcomes();try{await assert.rejects(()=>run(original.out,original.k,bad),e=>e.code==='V3_PATIENT_WITHDRAW_RESULT_INVALID');}
   finally{bad.dispose();}assert.equal(await outcomes(),before);
  });
  await assertion('withdraw service PG: source stop/ref deletion prevents original result recovery',async()=>{
   const before=await counts();await admin.query("UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id=$1",[record.hospitalId]);
   try{await assert.rejects(()=>run(original.out,original.k),e=>e.code==='V3_DB_PRINCIPAL_INACTIVE');}
   finally{await admin.query("UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id=$1",[record.hospitalId]);}
   await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref=$1',[record.patientRefId]);
   try{await assert.rejects(()=>run(original.out,original.k),e=>e.code==='V3_WITHDRAW_CONSENT_RESOURCE_UNAVAILABLE');}
   finally{await admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=NULL WHERE patient_ref=$1',[record.patientRefId]);}
   assert.equal(await counts(),before);
  });
  await assertion('withdraw service PG: outcome audit is append-only even for owner',async()=>{
   await assert.rejects(()=>admin.query('UPDATE highpass_v3.consent_withdrawal_outcomes SET outcome_id=outcome_id'),e=>e.code==='42501');
   await assert.rejects(()=>admin.query('DELETE FROM highpass_v3.consent_withdrawal_outcomes'),e=>e.code==='42501');
  });
 }finally{service?.dispose();key.fill(0);}
}
