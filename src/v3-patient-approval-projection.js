import {createHash} from 'node:crypto';
import {AuthError} from './auth.js';
import {v3BindingExpiry,assertV3SyntheticPatientReauthentication} from './v3-principal-registry.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {parseExchangeResourceSelection,parseExchangeActionSelection} from './v3-exchange-session-contract.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transactionFactories=new WeakSet(),activeTransactions=new WeakMap(),projections=new WeakMap();
const guardSql=`SELECT pg_has_role(current_user,'hp_v3_consent_approval_policy','MEMBER') AS approval,
 EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname NOT IN (current_user,'hp_v3_consent_approval_policy')
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS mixed_capability,
 r.rolsuper,r.rolbypassrls,
 EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
  OR x.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_signal_backend'))
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS can_bypass,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_schema_tables,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS owns_schema
 FROM pg_roles r WHERE r.rolname=current_user`;
function assertRole(rows){
 if(rows.length!==1||rows[0].approval!==true
  ||['mixed_capability','rolsuper','rolbypassrls','can_bypass','owns_schema_tables','owns_schema'].some(k=>rows[0][k]!==false))
  throw new V3TransactionError('V3_PATIENT_APPROVAL_DATABASE_ROLE_UNSAFE');
}
function patient(binding,maxAgeMs,nowMs=Date.now()){
 v3BindingExpiry(binding);
 if(binding.role!=='PATIENT')throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
 if(!binding.scopes.includes('consent:approve'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
 return assertV3SyntheticPatientReauthentication(binding,{nowMs,maxAgeMs});
}
function invalid(){throw new V3TransactionError('V3_PATIENT_APPROVAL_PROJECTION_INVALID');}
async function clock(tx){
 const rows=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows;
 const value=rows.length===1?Number(rows[0].now_ms):NaN;
 if(!Number.isSafeInteger(value)||value<0)invalid();return value;
}
function context(tx,binding){
 const c=activeTransactions.get(tx);
 if(!c||c.binding!==binding)throw new V3TransactionError('V3_PATIENT_APPROVAL_TRANSACTION_REQUIRED');
 patient(binding,c.maxReauthAgeMs);return c;
}
export function guardPatientApprovalPool(pool){
 if(!pool||typeof pool.connect!=='function')throw new V3TransactionError('V3_PATIENT_APPROVAL_CONFIGURATION_INVALID');
 return Object.freeze({async connect(){
  let client;const onFault=()=>{};
  try{
   client=await pool.connect();client.on?.('error',onFault);
   assertRole((await client.query({text:guardSql,values:[],query_timeout:3000})).rows);
   client.removeListener?.('error',onFault);return client;
  }catch(error){
   client?.release(true);
   if(error instanceof V3TransactionError)throw error;
   throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
  }
 }});
}
/** Private same-transaction helper factory, not an audited public read API. */
export function createPatientApprovalTransactions({pool,maxReauthAgeMs,deadlineMs=8000,queryMs=5000}={}){
 if(!Number.isInteger(maxReauthAgeMs)||maxReauthAgeMs<1000||maxReauthAgeMs>300000||deadlineMs>10000)
  throw new V3TransactionError('V3_PATIENT_APPROVAL_CONFIGURATION_INVALID');
 const transactions=new V3TenantTransaction({pool:guardPatientApprovalPool(pool),deadlineMs,queryMs});
 const factory=Object.freeze({async run(binding,operation){
  patient(binding,maxReauthAgeMs); // No DB acquisition for copied/old/unassured bindings.
  if(typeof operation!=='function')throw new V3TransactionError('V3_PATIENT_APPROVAL_CONFIGURATION_INVALID');
  let liveTx;
  try{return await transactions.run(binding,'consent:approve',async tx=>{
   liveTx=tx;
   const state={binding,maxReauthAgeMs,deadlines:[]};activeTransactions.set(tx,state);
   try{
    patient(binding,maxReauthAgeMs,await clock(tx));
    const result=await operation(tx),now=await clock(tx);
    patient(binding,maxReauthAgeMs,now);
    if(state.deadlines.some(until=>until<=now))throw new AuthError(409,'V3_PATIENT_CONSENT_EXPIRED');
    return result;
   }finally{activeTransactions.delete(tx);}
  });}finally{if(liveTx)activeTransactions.delete(liveTx);}
 }});
 transactionFactories.add(factory);return factory;
}
export function assertPatientApprovalTransactions(factory){
 if(!transactionFactories.has(factory))throw new V3TransactionError('V3_PATIENT_APPROVAL_CONFIGURATION_INVALID');
 return factory;
}
function clausePolicy(policy){
 if(!policy||![Object.prototype,null].includes(Object.getPrototypeOf(policy)))invalid();
 const keys=Reflect.ownKeys(policy),expected=['clauseVersion','clauseText'];
 if(keys.length!==2||keys.some(k=>!expected.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(policy,k),'value'))
  ||typeof policy.clauseVersion!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(policy.clauseVersion)
  ||typeof policy.clauseText!=='string'||policy.clauseText.includes('\0')||Buffer.byteLength(policy.clauseText)<1
  ||Buffer.byteLength(policy.clauseText)>8192)throw new AuthError(500,'V3_PATIENT_CONSENT_POLICY_REQUIRED');
 return Object.freeze({...policy});
}
/** Must be called inside the branded factory's currently live callback. */
export async function selectPatientApprovalProjection(tx,binding,id,expectedVersion,policy){
 const c=context(tx,binding),clause=clausePolicy(policy);
 if(typeof id!=='string'||!uuid.test(id)||!Number.isInteger(expectedVersion)||expectedVersion<1||expectedVersion>2147483646)
  throw new AuthError(422,'V3_PATIENT_CONSENT_COMMAND_INVALID');
 const deny=reasonCode=>Object.freeze({denied:true,reasonCode});
 const rows=(await tx.query(`SELECT preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,
  target_tenant_id,target_hospital_id,state,evidence_status,purpose,valid_from,valid_until,policy_version,resource_count,action_count
  FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1 AND owner_tenant_id=$2 AND source_hospital_id=$3 AND patient_ref=$4`,
 [id.toLowerCase(),binding.tenantId,binding.hospitalId,binding.patientRefId])).rows;
 if(rows.length===0)return deny('PREPARATION_NOT_FOUND');if(rows.length!==1)invalid();
 const p=rows[0];
 if(p.preparation_id!==id.toLowerCase()||!uuid.test(p.session_id??'')||p.patient_ref!==binding.patientRefId
  ||p.owner_tenant_id!==binding.tenantId||p.source_hospital_id!==binding.hospitalId||!uuid.test(p.target_tenant_id??'')
  ||!uuid.test(p.target_hospital_id??'')||p.target_hospital_id===binding.hospitalId||p.target_tenant_id===binding.tenantId)invalid();
 if(p.session_version!==expectedVersion)return deny('VERSION_MISMATCH');
 if(p.state!=='PENDING'||p.evidence_status!=='UNVERIFIED')invalid();
 const sessions=(await tx.query(`SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,state,version,valid_from,valid_until,
  valid_until>clock_timestamp() AS live FROM highpass_v3.exchange_sessions
  WHERE session_id=$1 AND owner_tenant_id=$2 AND source_hospital_id=$3 AND patient_ref=$4 FOR SHARE`,
 [p.session_id,binding.tenantId,binding.hospitalId,binding.patientRefId])).rows;
 if(sessions.length===0)return deny('SESSION_NOT_FOUND');if(sessions.length!==1)invalid();
 const s=sessions[0];
 if(s.session_id!==p.session_id||s.patient_ref!==p.patient_ref||s.owner_tenant_id!==p.owner_tenant_id||s.source_hospital_id!==p.source_hospital_id)invalid();
 if(s.version!==expectedVersion)return deny('VERSION_MISMATCH');
 if(s.state!=='REQUESTED')return deny('SESSION_TERMINAL');
 if(typeof s.live!=='boolean')invalid();if(!s.live)return deny('SESSION_EXPIRED');
 const ref=(await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1 AND owner_tenant_id=$2
  AND owner_hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,[p.patient_ref,binding.tenantId,binding.hospitalId])).rows;
 if(ref.length===0)return deny('SOURCE_REF_UNAVAILABLE');if(ref.length!==1||ref[0].patient_ref!==p.patient_ref)invalid();
 const part=(await tx.query(`SELECT session_id FROM highpass_v3.exchange_session_participants WHERE session_id=$1 AND patient_ref=$2
  AND tenant_id=$3 AND hospital_id=$4 AND participant_role='SOURCE' AND status='ACTIVE'`,
 [p.session_id,p.patient_ref,binding.tenantId,binding.hospitalId])).rows;
 if(part.length===0)return deny('SOURCE_REF_UNAVAILABLE');if(part.length!==1||part[0].session_id!==p.session_id)invalid();
 await tx.query(`SELECT set_config('app.approval_target_hospital',$1,true),set_config('app.approval_target_tenant',$2,true)`,
 [p.target_hospital_id,p.target_tenant_id]);
 const hospitals=(await tx.query(`SELECT hospital_id FROM highpass_v3.hospitals WHERE hospital_id=$1 AND tenant_id=$2 AND status='ACTIVE' FOR SHARE`,
 [p.target_hospital_id,p.target_tenant_id])).rows;
 if(hospitals.length===0)return deny('TARGET_UNAVAILABLE');if(hospitals.length!==1||hospitals[0].hospital_id!==p.target_hospital_id)invalid();
 const tenants=(await tx.query(`SELECT tenant_id FROM highpass_v3.tenants WHERE tenant_id=$1 AND status='ACTIVE' FOR SHARE`,[p.target_tenant_id])).rows;
 if(tenants.length===0)return deny('TARGET_UNAVAILABLE');if(tenants.length!==1||tenants[0].tenant_id!==p.target_tenant_id)invalid();
 const from=new Date(p.valid_from).getTime(),until=new Date(p.valid_until).getTime(),parentFrom=new Date(s.valid_from).getTime(),parentUntil=new Date(s.valid_until).getTime();
 if(![from,until,parentFrom,parentUntil].every(Number.isSafeInteger)||until<=from||from<parentFrom||until>parentUntil
  ||typeof p.purpose!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(p.purpose)
  ||typeof p.policy_version!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(p.policy_version))invalid();
 const scopes=(await tx.query(`SELECT ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes
  WHERE preparation_id=$1 ORDER BY ordinal`,[p.preparation_id])).rows;
 const actionRows=(await tx.query(`SELECT ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=$1 ORDER BY ordinal`,[p.preparation_id])).rows;
 let resources,allowedActions;
 try{
  if(scopes.length!==p.resource_count||actionRows.length!==p.action_count
   ||scopes.some((r,i)=>r.ordinal!==i+1||typeof r.whole_study!=='boolean'||r.whole_study&&r.series_instance_uids!==null)
   ||actionRows.some((r,i)=>r.ordinal!==i+1))invalid();
  const raw=scopes.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
  const actions=actionRows.map(r=>r.action);resources=parseExchangeResourceSelection(raw);allowedActions=parseExchangeActionSelection(actions);
  if(JSON.stringify(raw)!==JSON.stringify(resources)||JSON.stringify(actions)!==JSON.stringify(allowedActions))invalid();
 }catch{invalid();}
 const clauseDigest=createHash('sha256').update(clause.clauseText,'utf8').digest();
 // Use exact DB timestamptz values in SQL, not JS millisecond-roundtripped windows.
 const digests=(await tx.query(`SELECT highpass_v3.patient_consent_content_digest(preparation_id,$2,$3,'PATIENT_IDENTITY_LINK',valid_from,valid_until) AS content_digest
  FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1`,[p.preparation_id,clause.clauseVersion,clauseDigest])).rows;
 if(digests.length!==1||!Buffer.isBuffer(digests[0].content_digest)||digests[0].content_digest.length!==32)invalid();
 const now=await clock(tx);patient(binding,c.maxReauthAgeMs,now);
 if(until<=now||parentUntil<=now)return deny('PREPARATION_EXPIRED');
 const selection=Object.freeze({preparationId:p.preparation_id,sessionId:p.session_id,expectedSessionVersion:p.session_version,
  patientRefId:p.patient_ref,ownerTenantId:p.owner_tenant_id,sourceHospitalId:p.source_hospital_id,targetHospitalId:p.target_hospital_id,
  purpose:p.purpose,policyVersion:p.policy_version,state:'PENDING',evidenceStatus:'UNVERIFIED',validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString(),
  resources,allowedActions,contentDigest:digests[0].content_digest.toString('hex'),
  identityLink:Object.freeze({clauseVersion:clause.clauseVersion,clauseText:clause.clauseText,clauseDigest:clauseDigest.toString('hex'),
   purpose:'PATIENT_IDENTITY_LINK',validFrom:new Date(from).toISOString(),validUntil:new Date(until).toISOString()})});
 const out=Object.freeze({denied:false,nowMs:now,selection});
 projections.set(out,{tx,binding});c.deadlines.push(until,parentUntil);return out;
}
export function assertLivePatientApprovalProjection(tx,binding,projection){
 context(tx,binding);const proof=projections.get(projection);
 if(!proof||proof.tx!==tx||proof.binding!==binding)throw new V3TransactionError('V3_PATIENT_APPROVAL_PROJECTION_REQUIRED');
 return projection;
}
/** Internal issuance uses the factory's actual policy, never a second body/config age. */
export function patientApprovalTransactionAssurance(tx,binding){
 const c=context(tx,binding),fact=patient(binding,c.maxReauthAgeMs);
 return Object.freeze({authTimeMs:fact.authTimeMs,maxReauthAgeMs:c.maxReauthAgeMs});
}
export function registerPatientApprovalDeadline(tx,binding,untilMs){
 const c=context(tx,binding),fact=patient(binding,c.maxReauthAgeMs);
 if(!Number.isSafeInteger(untilMs)||untilMs<=Date.now()||untilMs>v3BindingExpiry(binding)
  ||untilMs>fact.authTimeMs+c.maxReauthAgeMs)throw new AuthError(409,'V3_PATIENT_CONSENT_EXPIRED');
 c.deadlines.push(untilMs);
}
