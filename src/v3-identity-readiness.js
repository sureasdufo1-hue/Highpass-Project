import {v3BindingExpiry} from './v3-principal-registry.js';
import {v3TenantRoleSafetySql} from './v3-tenant-transaction.js';
import {v3MappingReadPolicy} from './v3-mapping-read-service.js';

const state=new WeakMap();
const clients=new WeakSet();
export function assertV3IdentityReadiness(value){if(!state.has(value))failure('V3_IDENTITY_READINESS_REQUIRED');}
const tables=['tenants','hospitals','principal_bindings','patient_refs','patient_ref_registrations','patient_mappings',
 'identity_write_results','identity_audit_outbox','identity_network_audit'];
const triggers=['mapping_transition_guard','mapping_audit_required','identity_audit_immutable','identity_results_immutable','identity_network_immutable'];
const networkColumns=['event_id','tenant_id','hospital_id','actor_id','audit_session_id','trace_id','source_ip','ingress_mode','proxy_certificate_sha256','observed_at'];
const preauthColumns=['event_id','observed_at','scope','stage','reason_code','result','source_kind','source_ip'];
const unsafe=['rolsuper','rolbypassrls','can_bypass','owns_schema_tables','owns_schema'];
const failure=code=>{throw Error(code);};

/** Read-only point-in-time readiness. Never issues identities, migrates, writes or grants access. */
export class V3IdentityReadiness{
 constructor({mode,clinicalPool,publisherPool,readerPool,deadlineMs=3000}={}){
  const pools=[clinicalPool,publisherPool,readerPool];
  if(mode!=='CAPSTONE_SYNTHETIC_ONLY'||pools.some(pool=>!pool||typeof pool.connect!=='function')||new Set(pools).size!==3
   ||!Number.isInteger(deadlineMs)||deadlineMs<50||deadlineMs>3000)failure('V3_IDENTITY_READINESS_CONFIGURATION_REQUIRED');
  state.set(this,{pools,deadlineMs,disposed:false});
 }
 async check(binding){
  const own=state.get(this);if(!own||own.disposed)return {status:'NOT VERIFIED',reason:'READINESS_DISPOSED'};
  try{v3BindingExpiry(binding);if(!v3MappingReadPolicy.allowedRoles.includes(binding.role)||!binding.scopes.includes('mapping:read'))throw Error();}
  catch{return {status:'FAIL',reason:'VERIFIED_MAPPING_BINDING_REQUIRED'};}
  const checks=[];
  for(let index=0;index<3;index++){
   const name=['clinical','preauth-publisher','preauth-reader'][index];
   try{
    await this.#probe(own.pools[index],own.deadlineMs,async query=>{
     const role=(await query(v3TenantRoleSafetySql)).rows;
     if(role.length!==1||unsafe.some(key=>role[0][key]!==false))failure('UNSAFE_DATABASE_ROLE');
     if(index===0){
      await query("SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),set_config('app.actor_id',$3,true)",
       [binding.tenantId,binding.hospitalId,binding.actorId]);
      const active=(await query(`SELECT p.actor_id FROM highpass_v3.principal_bindings p
       JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
       WHERE p.actor_id=$1 AND p.tenant_id=$2 AND p.hospital_id=$3 AND p.role=$4 AND p.patient_ref IS NOT DISTINCT FROM $5::uuid
       AND 'mapping:read'=ANY(p.scopes) AND p.service_purpose IS NOT DISTINCT FROM $6::text
       AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'`,
       [binding.actorId,binding.tenantId,binding.hospitalId,binding.role,binding.patientRefId,binding.servicePurpose??null])).rows;
      if(active.length!==1)failure('REGISTERED_PRINCIPAL_INACTIVE');
      const schema=(await query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,has_table_privilege(current_user,c.oid,'SELECT') readable
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND c.relname=ANY($1::text[]) AND c.relkind='r'`,[tables])).rows;
      if(schema.length!==tables.length||schema.some(row=>!row.relrowsecurity||!row.relforcerowsecurity||!row.readable))failure('IDENTITY_SCHEMA_OR_READ_GRANT_MISSING');
      const guards=(await query(`SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='highpass_v3' AND t.tgname=ANY($1::text[]) AND t.tgenabled IN ('O','A')`,[triggers])).rows;
      if(new Set(guards.map(row=>row.tgname)).size!==triggers.length)failure('IDENTITY_GUARD_MISSING');
      const tuple=networkColumns.slice(0,6);
      const foreignKeys=(await query(`SELECT
       ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) source_columns,
       ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) target_columns
       FROM pg_constraint c WHERE c.conrelid=to_regclass('highpass_v3.identity_network_audit')
       AND c.confrelid=to_regclass('highpass_v3.identity_audit_outbox') AND c.contype='f' AND c.convalidated`)).rows;
      if(!foreignKeys.some(row=>JSON.stringify(row.source_columns)===JSON.stringify(tuple)&&JSON.stringify(row.target_columns)===JSON.stringify(tuple)))failure('IDENTITY_PAIR_CONSTRAINT_MISSING');
      const privileges=(await query(`SELECT bool_and(has_column_privilege(current_user,'highpass_v3.identity_network_audit',col,'INSERT')) allowed
       FROM unnest($1::text[]) col`,[networkColumns])).rows[0];
      if(privileges?.allowed!==true)failure('IDENTITY_NETWORK_GRANT_MISSING');
     }else{
      const ownRole=index===1?'hp_v3_preauth_publisher_policy':'hp_v3_preauth_reader_policy';
      const otherRole=index===1?'hp_v3_preauth_reader_policy':'hp_v3_preauth_publisher_policy';
      const separate=(await query(`SELECT pg_has_role(current_user,$1,'MEMBER') AND NOT pg_has_role(current_user,$2,'MEMBER')
       AND NOT pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AND NOT pg_has_role(current_user,'hp_v3_pending_policy','MEMBER') allowed`,[ownRole,otherRole])).rows[0];
      if(separate?.allowed!==true)failure('PREAUTH_ROLE_SEPARATION_INVALID');
      const storage=(await query(`SELECT c.relrowsecurity AND c.relforcerowsecurity
       AND NOT has_table_privilege(current_user,c.oid,'UPDATE,DELETE,TRUNCATE') guarded
       FROM pg_class c WHERE c.oid=to_regclass('highpass_v3.preauth_security_events')`)).rows;
      if(storage.length!==1||storage[0].guarded!==true)failure('PREAUTH_STORAGE_UNSAFE');
      const access=(await query(`SELECT bool_and(has_column_privilege(current_user,'highpass_v3.preauth_security_events',col,$2))
       AND NOT bool_or(has_column_privilege(current_user,'highpass_v3.preauth_security_events',col,$3)) allowed
       FROM unnest($1::text[]) col`,[preauthColumns,index===1?'INSERT':'SELECT',index===1?'SELECT':'INSERT'])).rows[0];
      if(access?.allowed!==true)failure('PREAUTH_GRANT_MISSING_OR_EXCESSIVE');
     }
    },()=>own.disposed);
    checks.push({name,result:'PASS'});
   }catch(error){
    const safe=new Set(['UNSAFE_DATABASE_ROLE','REGISTERED_PRINCIPAL_INACTIVE','IDENTITY_SCHEMA_OR_READ_GRANT_MISSING','IDENTITY_GUARD_MISSING',
     'IDENTITY_NETWORK_GRANT_MISSING','IDENTITY_PAIR_CONSTRAINT_MISSING','PREAUTH_ROLE_SEPARATION_INVALID','PREAUTH_STORAGE_UNSAFE','PREAUTH_GRANT_MISSING_OR_EXCESSIVE',
     'READINESS_DEADLINE','READINESS_DISPOSED','READINESS_CONNECTION_NOT_IDLE','READ_ONLY_REQUIRED']);
    checks.push({name,result:'FAIL',reason:safe.has(error.message)?error.message:'DATABASE_NOT_VERIFIED'});
   }
  }
  try{v3BindingExpiry(binding);}catch{checks.push({name:'fresh-binding',result:'FAIL',reason:'BINDING_EXPIRED'});}
  return {status:checks.every(row=>row.result==='PASS')?'PASS':'FAIL',checks,
   qualifier:'READ_ONLY POINT_IN_TIME CONFIGURATION CHECK — NOT WRITE DELIVERY, CLINICAL AUTHORITY OR DEPLOYMENT APPROVAL'};
 }
 async #probe(pool,deadlineMs,operation,disposed){
  let client,released=false,live=true,timer;
  const release=destroy=>{if(client&&!released){released=true;client.release(destroy);}};
  const query=(text,values=[])=>{if(!live||disposed())failure('READINESS_DISPOSED');return client.query({text,values,query_timeout:deadlineMs});};
  const work=(async()=>{
   client=await pool.connect();if(!clients.has(client)){client.on?.('error',()=>{});clients.add(client);}
   if(!live||disposed()){release(true);failure('READINESS_DISPOSED');}
   if(typeof client.getTransactionStatus!=='function'||client.getTransactionStatus()!=='I'){release(true);failure('READINESS_CONNECTION_NOT_IDLE');}
   try{
    await query('BEGIN READ ONLY');
    await query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[deadlineMs+'ms']);
    const ro=(await query('SHOW transaction_read_only')).rows[0];if(ro?.transaction_read_only!=='on')failure('READ_ONLY_REQUIRED');
    await operation(query);await query('ROLLBACK');
   }catch(error){release(true);throw error;}
  })();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{live=false;release(true);reject(Error('READINESS_DEADLINE'));},deadlineMs);});
  try{await Promise.race([work,timeout]);}finally{live=false;clearTimeout(timer);release(false);}
 }
 dispose(){const own=state.get(this);if(own)own.disposed=true;}
}
