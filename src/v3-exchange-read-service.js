import {createHash,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {exchangeCorrelation,appendExchangeAudit} from './v3-exchange-audit.js';
import {appendPairedExchangeAudit} from './v3-exchange-network-audit.js';
import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';

const roles=Object.freeze(['PATIENT','DOCTOR','HOSPITAL_ADMIN']);
export const v3ExchangeReadPolicy=Object.freeze({requiredScope:'exchange:read',allowedRoles:roles});
const privateState=new WeakMap();
export class V3ExchangeReadService {
 constructor({transactions,requireNetworkAudit=false}={}){
  if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000||typeof requireNetworkAudit!=='boolean')throw new V3TransactionError('V3_SESSION_READ_CONFIGURATION_INVALID');
  privateState.set(this,{transactions,requireNetworkAudit});
 }
 get requireNetworkAudit(){return privateState.get(this).requireNetworkAudit;}
 async get(binding,id,options={},network){
  v3BindingExpiry(binding);
  if(!roles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
  if(!binding.scopes.includes('exchange:read'))throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
  if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new AuthError(422,'V3_SESSION_REQUEST_INVALID');
  const context=exchangeCorrelation(options);
  const state=privateState.get(this);
  if(state.requireNetworkAudit)readIdentityNetworkAuditInput(network?.input,binding,context);
  else if(network!==undefined)throw new V3TransactionError('V3_SESSION_NETWORK_MODE_MISMATCH');
  const operation=async tx=>{
   const audit=event=>state.requireNetworkAudit?appendPairedExchangeAudit(tx,binding,event,network.input):appendExchangeAudit(tx,binding,event);
   const selected=await tx.query(`SELECT session_id,patient_ref,owner_tenant_id,source_hospital_id,target_hospital_id,requester_id,
    purpose,initiation_type,state,version,valid_from,valid_until,created_at,updated_at,resource_snapshot_digest,resource_count,requested_actions,
    valid_until>clock_timestamp() AS live FROM highpass_v3.exchange_sessions WHERE session_id=$1 FOR SHARE`,[id]);
   let reason='SESSION_NOT_FOUND';const row=selected.rows[0];
   if(row&&!row.live)reason='SESSION_EXPIRED';
   const ref=row?.live?await tx.query('SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1 AND deleted_at IS NULL FOR SHARE',[row.patient_ref]):{rows:[]};
   if(row?.live&&ref.rows.length!==1)reason='SOURCE_REF_UNAVAILABLE';
   if(!row||!row.live||ref.rows.length!==1){await audit({...context,action:'SESSION_DENIED',reasonCode:reason});return {denied:true};}
   const scopes=await tx.query(`SELECT study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.exchange_resource_scopes WHERE session_id=$1 ORDER BY ordinal`,[id]);
   const resources=scopes.rows.map(r=>r.whole_study?{studyInstanceUid:r.study_instance_uid}:{studyInstanceUid:r.study_instance_uid,seriesInstanceUids:r.series_instance_uids});
   const digest=createHash('sha256').update(JSON.stringify(resources)).digest();
   if(!Buffer.isBuffer(row.resource_snapshot_digest)||row.resource_snapshot_digest.length!==32||resources.length!==row.resource_count
    ||!timingSafeEqual(digest,row.resource_snapshot_digest))throw new V3TransactionError('V3_SESSION_RESULT_INVALID');
   await audit({...context,sessionId:row.session_id,sessionVersion:row.version,action:'SESSION_READ',reasonCode:'METADATA_READ'});
   return {sessionId:row.session_id,patientRefId:row.patient_ref,ownerTenantId:row.owner_tenant_id,sourceHospitalId:row.source_hospital_id,
    targetHospitalId:row.target_hospital_id,requesterId:row.requester_id,purpose:row.purpose,initiationType:row.initiation_type,state:row.state,
    version:row.version,requestedActions:[...row.requested_actions],validFrom:new Date(row.valid_from).toISOString(),validUntil:new Date(row.valid_until).toISOString(),resources,
    createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};
  };
  const outcome=await(state.requireNetworkAudit?state.transactions.runWithIdentityNetwork(binding,'exchange:read',operation,network.input):state.transactions.run(binding,'exchange:read',operation));
  if(outcome.denied)throw new AuthError(404,'V3_SESSION_RESOURCE_UNAVAILABLE');return outcome;
 }
}
