import {AuthError} from './auth.js';
import {v3BindingExpiry,assertV3SyntheticPatientReauthentication} from './v3-principal-registry.js';
import {assertPatientConsentWithdrawalCommand} from './v3-patient-consent-withdraw-command.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';

const factories=new WeakSet(),factoryPolicies=new WeakMap(),transactions=new WeakMap(),projections=new WeakMap();
const guardSql=`SELECT pg_has_role(current_user,'hp_v3_consent_withdraw_policy','MEMBER') AS withdrawal,
 EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname NOT IN (current_user,'hp_v3_consent_withdraw_policy')
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS mixed,
 r.rolsuper,r.rolbypassrls,
 EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
  OR x.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_signal_backend'))
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS bypass,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3'
  AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owner,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS schema_owner
 FROM pg_roles r WHERE r.rolname=current_user`;
const invalid=()=>{throw new V3TransactionError('V3_PATIENT_WITHDRAW_PROJECTION_INVALID');};
async function clock(tx){
 const r=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows;
 const now=r.length===1?Number(r[0].now_ms):NaN;if(!Number.isSafeInteger(now)||now<0)invalid();return now;
}
function state(tx,binding,command){
 const s=transactions.get(tx);
 if(!s||s.binding!==binding||s.command!==command)throw new V3TransactionError('V3_PATIENT_WITHDRAW_TRANSACTION_REQUIRED');
 assertPatientConsentWithdrawalCommand(binding,command,{nowMs:Date.now(),maxReauthAgeMs:s.maxReauthAgeMs});return s;
}
export function guardPatientWithdrawalPool(pool){
 if(!pool||typeof pool.connect!=='function')throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
 return Object.freeze({async connect(){
  let c;const onFault=()=>{};
  try{
   c=await pool.connect();c.on?.('error',onFault);
   const r=(await c.query({text:guardSql,values:[],query_timeout:3000})).rows;
   if(r.length!==1||r[0].withdrawal!==true||['mixed','rolsuper','rolbypassrls','bypass','owner','schema_owner'].some(k=>r[0][k]!==false))
    throw new V3TransactionError('V3_PATIENT_WITHDRAW_DATABASE_ROLE_UNSAFE');
   c.removeListener?.('error',onFault);return c;
  }catch(e){c?.release(true);if(e instanceof V3TransactionError)throw e;throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');}
 }});
}
export function createPatientWithdrawalTransactions({pool,maxReauthAgeMs,deadlineMs=8000,queryMs=5000}={}){
 if(!Number.isInteger(maxReauthAgeMs)||maxReauthAgeMs<1000||maxReauthAgeMs>300000||deadlineMs>10000)
  throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
 const runner=new V3TenantTransaction({pool:guardPatientWithdrawalPool(pool),deadlineMs,queryMs});
 const factory=Object.freeze({async run(binding,command,operation){
  assertPatientConsentWithdrawalCommand(binding,command,{nowMs:Date.now(),maxReauthAgeMs});
  if(typeof operation!=='function')throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
  return runner.run(binding,'consent:withdraw',async tx=>{
   const s={binding,command,maxReauthAgeMs,deadlines:[]};transactions.set(tx,s);
   try{
    // Stable exact historical DTO and PG JSON evidence across pooled session locales.
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    await tx.query("SET LOCAL DateStyle TO 'ISO, YMD'");
    assertPatientConsentWithdrawalCommand(binding,command,{nowMs:await clock(tx),maxReauthAgeMs});
    const result=await operation(tx),now=await clock(tx);
    assertPatientConsentWithdrawalCommand(binding,command,{nowMs:now,maxReauthAgeMs});
    if(now>=v3BindingExpiry(binding))throw new AuthError(401,'JWT_EXPIRED');
    if(s.deadlines.some(until=>until<=now))throw new AuthError(409,'V3_CONSENT_EXPIRED');
    return result;
   }finally{transactions.delete(tx);}
  });
 }});factories.add(factory);factoryPolicies.set(factory,maxReauthAgeMs);return factory;
}
export function assertPatientWithdrawalTransactions(factory){
 if(!factories.has(factory))throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');return factory;
}
export function patientWithdrawalCommandPolicy(factory){
 assertPatientWithdrawalTransactions(factory);return {nowMs:Date.now(),maxReauthAgeMs:factoryPolicies.get(factory)};
}
export function patientWithdrawalTransactionAssurance(tx,binding,command){
 const s=state(tx,binding,command),fact=assertV3SyntheticPatientReauthentication(binding,{nowMs:Date.now(),maxAgeMs:s.maxReauthAgeMs});
 return Object.freeze({authTimeMs:fact.authTimeMs,maxReauthAgeMs:s.maxReauthAgeMs});
}
/** Internal locked projection only. Not audited public read or completed withdrawal. */
export async function selectPatientWithdrawalContext(tx,binding,command){
 const s=state(tx,binding,command),deny=reasonCode=>Object.freeze({denied:true,reasonCode});
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
  [JSON.stringify(['HP-V3-CONSENT-LIFECYCLE',binding.tenantId,binding.hospitalId,command.consentId,command.contentVersion])]);
 const ref=(await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1
  AND owner_tenant_id=$2 AND owner_hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,
  [binding.patientRefId,binding.tenantId,binding.hospitalId])).rows;
 if(ref.length===0)return deny('CONSENT_RESOURCE_UNAVAILABLE');if(ref.length!==1)invalid();
 const rows=(await tx.query(`SELECT v.consent_id,v.content_version,v.patient_ref,v.owner_tenant_id,v.source_hospital_id,
  v.valid_until::text,v.policy_version,v.patient_actor_id AS subject_actor_id,encode(v.content_digest,'hex') AS content_digest,
  e.event_id AS predecessor_id,e.state AS initial_state,e.event_sequence,e.occurred_at::text AS predecessor_at,
  l.state AS terminal_state,l.event_id AS terminal_id FROM highpass_v3.consent_content_versions v
  JOIN highpass_v3.consent_state_events e USING(consent_id,content_version)
  LEFT JOIN highpass_v3.consent_lifecycle_events l USING(consent_id,content_version)
  WHERE v.consent_id=$1 AND v.content_version=$2 AND v.patient_ref=$3 AND v.owner_tenant_id=$4 AND v.source_hospital_id=$5
  AND e.event_sequence=2`,[command.consentId,command.contentVersion,binding.patientRefId,binding.tenantId,binding.hospitalId])).rows;
 if(rows.length===0)return deny('CONSENT_RESOURCE_UNAVAILABLE');if(rows.length!==1)invalid();
 const row=rows[0],until=Date.parse(row.valid_until),now=await clock(tx);
 if(!Number.isFinite(until)||row.event_sequence!==command.expectedEventSequence||!/^[a-f0-9]{64}$/.test(row.content_digest))invalid();
 const projection=Object.freeze({kind:'WITHDRAWAL_CONTEXT_ONLY',denied:false,consentId:row.consent_id,contentVersion:row.content_version,
  predecessorId:row.predecessor_id,predecessorAt:row.predecessor_at,validUntil:row.valid_until,
  subjectActorId:row.subject_actor_id,initialState:row.initial_state,terminalState:row.terminal_state,terminalId:row.terminal_id,
  expired:until<=now,contentDigest:row.content_digest,policyVersion:row.policy_version});
 projections.set(projection,{tx,binding,command});return projection;
}
export async function selectPatientWithdrawalProjection(tx,binding,command,selected){
 const s=state(tx,binding,command),p=selected??await selectPatientWithdrawalContext(tx,binding,command);
 if(p.denied)return p;
 assertPatientWithdrawalContext(tx,binding,command,p);
 const deny=reasonCode=>Object.freeze({denied:true,reasonCode});
 if(p.terminalState!==null)return deny('CONSENT_TERMINAL');
 if(p.initialState!=='ACTIVE')return deny('CONSENT_NOT_ACTIVE');
 if(Date.parse(p.validUntil)<=await clock(tx))return deny('CONSENT_EXPIRED');
 const live=Object.freeze({...p,kind:'LIVE_WITHDRAWAL_PROJECTION_ONLY'});
 s.deadlines.push(Date.parse(p.validUntil));projections.set(live,{tx,binding,command});return live;
}
export function assertPatientWithdrawalContext(tx,binding,command,projection){
 state(tx,binding,command);const p=projections.get(projection);
 if(!p||p.tx!==tx||p.binding!==binding||p.command!==command||projection.kind!=='WITHDRAWAL_CONTEXT_ONLY')
  throw new V3TransactionError('V3_PATIENT_WITHDRAW_CONTEXT_REQUIRED');return projection;
}
export function assertLivePatientWithdrawalProjection(tx,binding,command,projection){
 state(tx,binding,command);
 const p=projections.get(projection);
 if(!p||p.tx!==tx||p.binding!==binding||p.command!==command||projection.kind!=='LIVE_WITHDRAWAL_PROJECTION_ONLY')
  throw new V3TransactionError('V3_PATIENT_WITHDRAW_PROJECTION_REQUIRED');return projection;
}
