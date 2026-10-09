import {AuthError} from './auth.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {assertConsentExpiryBatch} from './v3-consent-expiry-command.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';

const factories=new WeakSet(),transactions=new WeakMap();
const guardSql=`SELECT pg_has_role(current_user,'hp_v3_consent_expiry_policy','MEMBER') AS expiry,
 EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname NOT IN (current_user,'hp_v3_consent_expiry_policy')
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS mixed,
 r.rolsuper,r.rolbypassrls,
 EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
  OR x.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_signal_backend'))
  AND pg_has_role(current_user,x.oid,'MEMBER')) AS bypass,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3'
  AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owner,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS schema_owner
 FROM pg_roles r WHERE r.rolname=current_user`;

/** Dedicated nonowner capability; never add patient reference or clinical grants. */
export function guardConsentExpiryPool(pool){
 if(!pool||typeof pool.connect!=='function')throw new V3TransactionError('V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
 return Object.freeze({async connect(){
  let client,fault=false;const onFault=()=>{fault=true;};
  try{
   client=await pool.connect();client.on?.('error',onFault);
   const rows=(await client.query({text:guardSql,values:[],query_timeout:3000})).rows;
   if(fault)throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
   if(rows.length!==1||rows[0].expiry!==true||['mixed','rolsuper','rolbypassrls','bypass','owner','schema_owner'].some(k=>rows[0][k]!==false))
    throw new V3TransactionError('V3_CONSENT_EXPIRY_DATABASE_ROLE_UNSAFE');
   client.removeListener?.('error',onFault);return client;
  }catch(error){
   client?.release(true);
   if(error instanceof V3TransactionError)throw error;
   throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
  }
 }});
}

export function assertConsentExpiryTransaction(tx,binding,command){
 const state=transactions.get(tx);
 if(!state||state.binding!==binding||state.command!==command)
  throw new V3TransactionError('V3_CONSENT_EXPIRY_TRANSACTION_REQUIRED');
 assertConsentExpiryBatch(binding,command);
 if(Date.now()>=state.deadlineAt)throw new V3TransactionError('V3_TRANSACTION_DEADLINE');
 return tx;
}

/** Private callback lifetime only; not an expiry event, receipt or access authority. */
export function createConsentExpiryTransactions({pool,deadlineMs=8000,queryMs=5000}={}){
 if(!Number.isInteger(deadlineMs)||deadlineMs<50||deadlineMs>10000)
  throw new V3TransactionError('V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
 const runner=new V3TenantTransaction({pool:guardConsentExpiryPool(pool),deadlineMs,queryMs});
 const factory=Object.freeze({async run(binding,command,operation){
  assertConsentExpiryBatch(binding,command);
  if(typeof operation!=='function')throw new V3TransactionError('V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
  const deadlineAt=Date.now()+deadlineMs;
  return runner.run(binding,'consent:expire',async underlying=>{
   const tx=Object.freeze({async query(text,values=[]){
    assertConsentExpiryTransaction(tx,binding,command);
    return underlying.query(text,values);
   }});
   transactions.set(tx,{binding,command,deadlineAt});
   const checkClock=async()=>{
    const rows=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows;
    const now=rows.length===1?Number(rows[0].now_ms):NaN;
    if(!Number.isSafeInteger(now)||now<0)throw new V3TransactionError('V3_CONSENT_EXPIRY_CLOCK_INVALID');
    if(now>=v3BindingExpiry(binding))throw new AuthError(401,'JWT_EXPIRED');
   };
   try{
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    await tx.query("SET LOCAL DateStyle TO 'ISO, YMD'");
    await checkClock();
    const result=await operation(tx);
    await checkClock();
    return result;
   }finally{transactions.delete(tx);}
  });
 }});
 factories.add(factory);return factory;
}

export function assertConsentExpiryTransactions(factory){
 if(!factories.has(factory))throw new V3TransactionError('V3_CONSENT_EXPIRY_CONFIGURATION_INVALID');
 return factory;
}
