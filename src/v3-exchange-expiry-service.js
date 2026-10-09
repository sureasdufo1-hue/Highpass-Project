import {randomUUID} from 'node:crypto';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {prepareExchangeExpiryBatch} from './v3-exchange-expiry-contract.js';
import {exchangeCorrelation,appendExchangeAudit} from './v3-exchange-audit.js';

const privateState=new WeakMap();
/** Bounded batches and admission/drain; external scheduling remains separate. */
export class V3ExchangeExpiryService {
 constructor({transactions}={}){
  if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000)throw new V3TransactionError('V3_EXPIRY_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,closed:false,inflight:new Set(),drain:null});
 }
 async expireBatch(binding,options={},correlation={}){
  const command=prepareExchangeExpiryBatch(binding,options),context=exchangeCorrelation(correlation),state=privateState.get(this);
  if(state.closed)throw new V3TransactionError('V3_EXPIRY_SERVICE_CLOSED');
  const pending=state.transactions.run(binding,'exchange:expire',async tx=>{
   const role=(await tx.query("SELECT pg_has_role(current_user,'hp_v3_expiry_policy','MEMBER') AS maintenance,pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER') AS clinical")).rows[0];
   if(role?.maintenance!==true||role.clinical!==false)throw new V3TransactionError('V3_EXPIRY_DATABASE_ROLE_UNSAFE');
   const candidates=await tx.query(`SELECT session_id FROM highpass_v3.exchange_sessions
    WHERE owner_tenant_id=$1 AND source_hospital_id=$2 AND state='REQUESTED' AND version=1 AND valid_until<=clock_timestamp()
    ORDER BY valid_until,session_id LIMIT $3 FOR UPDATE SKIP LOCKED`,[command.tenantId,command.hospitalId,command.limit]);
   const receipts=[];
   for(const candidate of candidates.rows){
    const row=(await tx.query(`UPDATE highpass_v3.exchange_sessions SET state='EXPIRED',version=2,updated_at=clock_timestamp()
     WHERE session_id=$1 AND state='REQUESTED' AND version=1 AND valid_until<=clock_timestamp()
     RETURNING session_id,version,updated_at`,[candidate.session_id])).rows[0];
    if(!row)throw new V3TransactionError('V3_EXPIRY_RESULT_INVALID');
    const eventId=randomUUID();
    await tx.query(`INSERT INTO highpass_v3.exchange_state_events(event_id,session_id,patient_ref,tenant_id,hospital_id,requester_id,actor_id,
     from_state,to_state,from_version,to_version,reason_code,audit_session_id,trace_id,action,occurred_at)
     SELECT $1,session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id,$2,'REQUESTED','EXPIRED',1,2,'SESSION_EXPIRED',$3,$4,'SESSION_EXPIRED',updated_at
     FROM highpass_v3.exchange_sessions WHERE session_id=$5`,[eventId,command.actorId,context.auditSessionId,context.traceId,row.session_id]);
    await appendExchangeAudit(tx,binding,{...context,eventId,sessionId:row.session_id,sessionVersion:2,action:'SESSION_EXPIRED',reasonCode:'SESSION_EXPIRED'});
    await tx.query("INSERT INTO highpass_v3.exchange_cascade_outbox(event_id,kind) VALUES($1,'EXPIRY_REQUESTED')",[eventId]);
    receipts.push({sessionId:row.session_id,eventId,state:'EXPIRED',version:2,recordedAt:new Date(row.updated_at).toISOString(),cascadeStatus:'REQUESTED'});
   }
   return {processed:receipts.length,receipts};
  });
  state.inflight.add(pending);
  try{return await pending;}finally{state.inflight.delete(pending);}
 }
 close(){
  const state=privateState.get(this);state.closed=true;
  // All admitted transactions have finite deadlines. Observe every rejection but
  // leave its original outcome with its caller; closing is not a success override.
  state.drain??=Promise.allSettled([...state.inflight]).then(()=>undefined);
  return state.drain;
 }
}
