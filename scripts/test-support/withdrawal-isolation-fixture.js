import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {TestProvider} from '../../src/auth.js';
import {V3PrincipalRegistry} from '../../src/v3-principal-registry.js';
import {parsePatientConsentWithdrawalCommand} from '../../src/v3-patient-consent-withdraw-command.js';
import {createPatientWithdrawalTransactions} from '../../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../../src/v3-patient-consent-withdraw-service.js';

// Registered owned synthetic bootstrap + actual authenticated nonowner service.
export async function checkWithdrawalIsolation({admin,base,record,doctor,identities,seed,resolve,decision,body,assertion}){
 const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),hmacKey=randomBytes(32);
 const people=[{...record,creator:doctor,foreign:false},...identities].map((p,i)=>({...p,issuer:'synthetic-withdraw-isolation',
  subject:`SYNTH-WITHDRAW-PATIENT-${i}`,authHospitalId:p.foreign?'SYNTH-C':'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:withdraw']}));
 for(const p of people)await admin.query("UPDATE highpass_v3.principal_bindings SET scopes=array_append(scopes,'consent:withdraw') WHERE actor_id=$1",[p.actorId]);
 await admin.query(`ALTER ROLE hp_lifecycle_patient_test PASSWORD '${password}'`);
 const pool=new Pool({...base,user:'hp_lifecycle_patient_test',password,max:2,application_name:'hp-withdrawal-isolation-fixture'});pool.on('error',()=>{});
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:people[0].issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:people});
 const binding=p=>{
  const now=Math.floor(Date.now()/1000),claims={iss:p.issuer,aud:'synthetic-v3',sub:p.subject,role:'PATIENT',hospitalId:p.authHospitalId,
   scope:'consent:withdraw',patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:now};
  const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
   {requiredScope:'consent:withdraw',allowedRoles:['PATIENT']});
 };
 const factory=createPatientWithdrawalTransactions({pool,maxReauthAgeMs:300000}),service=new V3PatientConsentWithdrawalService({transactions:factory,hmacKey});
 const key=()=>`synthetic-withdraw-isolation-${randomUUID()}`;
 const selector=p=>({consentId:p.receipt.consentId,contentVersion:1,expectedEventSequence:2});
 const tables=['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'];
 const count=async()=>JSON.stringify((await admin.query('SELECT '+tables.map(t=>`(SELECT count(*) FROM highpass_v3.${t}) AS ${t}`).join(','))).rows);
 const tx=(p,operation)=>{
  const b=binding(p),command=parsePatientConsentWithdrawalCommand(b,selector(p),{nowMs:Date.now(),maxReauthAgeMs:300000});return factory.run(b,command,operation);
 };
 try{
  // Use the existing approval registry identities for initial decision; do not reinterpret withdrawal scope as approval.
  for(let i=0;i<people.length;i++)await assertion(`withdraw isolation PG: registered actor ${i} own positive and historic retry`,async()=>{
   const p=people[i],initial=i===0?{...identities[0],...record,creator:doctor,foreign:false}:identities[i-1];
   // Original actor uses the existing primary approval binding passed by caller.
   const b=i===0?resolve(null):resolve(initial),c=await seed(initial,{},b);
   p.receipt=await decision.decide(b,key(),body(c));p.key=key();
   p.withdrawn=await service.withdraw(binding(p),p.key,selector(p));assert.equal(p.withdrawn.state,'WITHDRAWN');
   assert.deepEqual(await service.withdraw(binding(p),p.key,selector(p)),p.withdrawn);
  });
  for(let i=0;i<people.length;i++)for(let j=0;j<people.length;j++)if(i!==j)
   await assertion(`withdraw isolation PG: actor ${i} cannot withdraw or recover actor ${j} result`,async()=>{
    const a=people[i],b=people[j],before=await count();
    for(const k of [b.key,key()])await assert.rejects(()=>service.withdraw(binding(a),k,selector(b)),e=>e.code==='V3_WITHDRAW_CONSENT_RESOURCE_UNAVAILABLE');
    assert.equal(await count(),before);
    const outcome=(await admin.query('SELECT actor_id,patient_ref FROM highpass_v3.consent_withdrawal_outcomes WHERE actor_id=$1 ORDER BY recorded_at DESC LIMIT 1',[a.actorId])).rows[0];
    assert.equal(outcome.actor_id,a.actorId);assert.equal(outcome.patient_ref,a.patientRefId);
   });
  await assertion('withdraw isolation PG: all registered actors read own terminal/outcomes but no foreign rows',async()=>{
   for(const p of people){
    const own=await tx(p,async t=>(await t.query('SELECT '+tables.map(table=>`(SELECT count(*)::integer FROM highpass_v3.${table} WHERE event_id=$1) AS ${table}`).join(','),[p.withdrawn.eventId])).rows[0]);
    assert(Object.values(own).every(n=>n>0));
    for(const other of people.filter(o=>o!==p)){
     const rows=await tx(p,async t=>(await t.query('SELECT '+tables.map(table=>`(SELECT count(*)::integer FROM highpass_v3.${table} WHERE event_id=$1) AS ${table}`).join(',')+
      ',(SELECT count(*)::integer FROM highpass_v3.consent_withdrawal_outcomes WHERE actor_id=$2) AS outcomes',[other.withdrawn.eventId,other.actorId])).rows[0]);
     assert(Object.values(rows).every(n=>n===0));
    }
   }
  });
  for(const p of people.slice(1))await assertion(`withdraw isolation PG: ${p.foreign?'foreign tenant':'same hospital other patient'} five copied writes denied`,async()=>{
   const before=await count();
   for(const table of [...tables,'consent_withdrawal_outcomes']){
    const row=(await admin.query(`SELECT to_jsonb(t) AS row FROM highpass_v3.${table} t WHERE ${table==='consent_withdrawal_outcomes'?'actor_id':'event_id'}=$1 LIMIT 1`,
     [table==='consent_withdrawal_outcomes'?people[0].actorId:people[0].withdrawn.eventId])).rows[0].row;
    let sqlState;
    await assert.rejects(()=>tx(p,t=>t.query(`INSERT INTO highpass_v3.${table} SELECT (jsonb_populate_record(NULL::highpass_v3.${table},$1::jsonb)).*`,[JSON.stringify(row)]).catch(e=>{sqlState=e.code;throw e;})),e=>e.code==='V3_DATABASE_UNAVAILABLE');
    assert.equal(sqlState,'42501');assert.equal(await count(),before);
   }
  });
 }finally{service.dispose();hmacKey.fill(0);await pool.end();}
}
