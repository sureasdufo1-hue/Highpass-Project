import {createHmac,timingSafeEqual} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {v3MappingWritePolicy} from './v3-mapping-write-contract.js';
import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';
import {appendPairedIdentityAudit} from './v3-identity-network-audit.js';

const privateState=new WeakMap(),UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const operations=new Set(['PATIENT_REF_REGISTER','MAPPING_RECONCILE','MAPPING_REVIEW']);
const states=new Set(['NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED']);
const denialCodes=new Map([['V3_MAPPING_NOT_FOUND',404],['V3_PATIENT_REF_NOT_FOUND',404],
  ['V3_MAPPING_IDENTITY_CONFLICT',409],['V3_MAPPING_VERSION_CONFLICT',409],
  ['V3_MAPPING_SELF_REVIEW',403],['V3_MAPPING_REGISTRATION_REQUIRED',403],['V3_IDEMPOTENCY_CONFLICT',409],['V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE',404]]);
/** Explicit internal signal: policy DENY audit commits before the caller gets an error. */
export class V3IdentityDenial {
  constructor(code){if(!denialCodes.has(code))throw new V3TransactionError('V3_IDEMPOTENCY_RESULT_INVALID');
    this.code=code;this.statusCode=denialCodes.get(code);Object.freeze(this);}
}
function invalid(){throw new AuthError(422,'V3_IDEMPOTENCY_REQUEST_INVALID');}
function canonical(value,depth=0,budget={nodes:0}){
  if(depth>8||++budget.nodes>256)invalid();
  if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isSafeInteger(value))return JSON.stringify(value);
  if(typeof value==='string'){if(value.length>4096)invalid();return JSON.stringify(value);}
  if(Array.isArray(value)){if(value.length>128)invalid();return '['+value.map(v=>canonical(v,depth+1,budget)).join(',')+']';}
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
  const names=Reflect.ownKeys(value);
  if(names.some(k=>typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))invalid();
  return '{'+names.sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1,budget)).join(',')+'}';
}
function metadata(value,operation,binding){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new V3TransactionError('V3_IDEMPOTENCY_RESULT_INVALID');
  const required=operation==='PATIENT_REF_REGISTER'?['patientRefId','createdAt']:['patientRefId','createdAt','mappingId','tenantId','hospitalId','state','version','updatedAt'];
  const allowed=new Set([...required,...(operation==='PATIENT_REF_REGISTER'?[]:['verifiedAt'])]);
  if(Reflect.ownKeys(value).some(k=>!allowed.has(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))
    ||required.some(k=>!Object.hasOwn(value,k))||typeof value.patientRefId!=='string'||!UUID.test(value.patientRefId)
    ||['createdAt',...(operation==='PATIENT_REF_REGISTER'?[]:['updatedAt']),...(Object.hasOwn(value,'verifiedAt')?['verifiedAt']:[])].some(k=>
      typeof value[k]!=='string'||!Number.isFinite(Date.parse(value[k]))||new Date(value[k]).toISOString()!==value[k])
    ||(operation!=='PATIENT_REF_REGISTER'&&(!UUID.test(value.mappingId)||value.tenantId!==binding.tenantId||value.hospitalId!==binding.hospitalId
      ||!states.has(value.state)||!Number.isSafeInteger(value.version)||value.version<1||value.version>2147483647)))throw new V3TransactionError('V3_IDEMPOTENCY_RESULT_INVALID');
  return Object.fromEntries(Object.keys(value).map(k=>[k,value[k]]));
}
async function resourceVisible(tx,binding,operation,result){
  const q=operation==='PATIENT_REF_REGISTER'
    ?await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref=$1 AND owner_tenant_id=$2 AND owner_hospital_id=$3 AND registered_by=$4 AND deleted_at IS NULL FOR SHARE`,[result.patientRefId,binding.tenantId,binding.hospitalId,binding.actorId])
    :await tx.query(`SELECT m.mapping_id,m.version,m.status FROM highpass_v3.patient_mappings m JOIN highpass_v3.patient_refs r ON r.patient_ref=m.patient_ref
      WHERE m.mapping_id=$1 AND m.patient_ref=$2 AND m.tenant_id=$3 AND m.hospital_id=$4 AND m.deleted_at IS NULL AND r.deleted_at IS NULL FOR SHARE OF m,r`,[result.mappingId,result.patientRefId,binding.tenantId,binding.hospitalId]);
  if(q.rows.length!==1)throw new AuthError(404,'V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE');
  return q.rows[0];
}

/** Trusted internal operations; caller must pass a validated, normalized command. */
export class V3IdentityIdempotency {
  constructor({transactions,hmacKey,requireNetworkAudit=false}={}){
    if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000||!Buffer.isBuffer(hmacKey)||hmacKey.length!==32)
      throw new V3TransactionError('V3_IDEMPOTENCY_CONFIGURATION_INVALID');
    if(typeof requireNetworkAudit!=='boolean')throw new V3TransactionError('V3_IDEMPOTENCY_CONFIGURATION_INVALID');
    privateState.set(this,{transactions,key:Buffer.from(hmacKey),requireNetworkAudit});
  }
  get requireNetworkAudit(){return privateState.get(this).requireNetworkAudit;}
  async run(binding,operation,key,payload,execute,network){
    v3BindingExpiry(binding);
    if(!v3MappingWritePolicy.allowedRoles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
    if(!operations.has(operation)||typeof key!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(key)||typeof execute!=='function')invalid();
    const state=privateState.get(this);if(!state.key)throw new V3TransactionError('V3_IDEMPOTENCY_PROVIDER_UNAVAILABLE');
    if(state.requireNetworkAudit){
      if(operation==='PATIENT_REF_REGISTER')throw new V3TransactionError('V3_IDENTITY_NETWORK_OPERATION_NOT_SUPPORTED');
      readIdentityNetworkAuditInput(network?.input,binding,network?.context);
    }else if(network!==undefined)throw new V3TransactionError('V3_IDENTITY_NETWORK_MODE_MISMATCH');
    const command=canonical(payload);if(Buffer.byteLength(command)>16384)invalid();
    const scope=JSON.stringify([binding.tenantId,binding.hospitalId,binding.actorId,operation]);
    const hash=(domain,value)=>createHmac('sha256',state.key).update(JSON.stringify([domain,scope,value])).digest();
    const keyDigest=hash('HPV3-IDEMPOTENCY-KEY',key),requestDigest=hash('HPV3-IDEMPOTENCY-COMMAND',command);
    const executeTransaction=async tx=>{
      const paired=event=>appendPairedIdentityAudit(tx,binding,{...network.context,...event},network.input);
      const denied=async(code,reasonCode)=>{await paired({action:'MAPPING_DENIED',result:'DENY',reasonCode});return new V3IdentityDenial(code);};
      await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[keyDigest.readBigInt64BE().toString()]);
      const found=await tx.query(`SELECT request_digest,response_metadata FROM highpass_v3.identity_write_results
        WHERE tenant_id=$1 AND hospital_id=$2 AND actor_id=$3 AND operation=$4 AND key_digest=$5`,
      [binding.tenantId,binding.hospitalId,binding.actorId,operation,keyDigest]);
      if(found.rows.length>1)throw new V3TransactionError('V3_IDEMPOTENCY_RESULT_INVALID');
      if(found.rows.length){
        const row=found.rows[0];
        if(!Buffer.isBuffer(row.request_digest)||row.request_digest.length!==32)throw new V3TransactionError('V3_IDEMPOTENCY_RESULT_INVALID');
        if(!timingSafeEqual(row.request_digest,requestDigest)){
          if(state.requireNetworkAudit)return denied('V3_IDEMPOTENCY_CONFLICT','MAPPING_IDEMPOTENCY_CONFLICT');
          throw new AuthError(409,'V3_IDEMPOTENCY_CONFLICT');
        }
        const result=metadata(row.response_metadata,operation,binding);
        let current;try{current=await resourceVisible(tx,binding,operation,result);}catch(error){
          if(state.requireNetworkAudit&&error.code==='V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE')return denied(error.code,'MAPPING_REPLAY_RESOURCE_UNAVAILABLE');throw error;
        }
        if(state.requireNetworkAudit)await paired({mappingId:current.mapping_id,mappingVersion:current.version,newState:current.status,
          action:'MAPPING_READ',result:'ALLOW',reasonCode:'MAPPING_METADATA_READ'});
        return result;
      }
      const candidate=await execute(state.requireNetworkAudit?Object.freeze({query:tx.query,appendIdentityAudit:paired}):tx);
      if(candidate instanceof V3IdentityDenial)return candidate;
      const result=metadata(candidate,operation,binding);await resourceVisible(tx,binding,operation,result);
      await tx.query(`INSERT INTO highpass_v3.identity_write_results
        (tenant_id,hospital_id,actor_id,operation,key_digest,request_digest,patient_ref,mapping_id,response_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[binding.tenantId,binding.hospitalId,binding.actorId,operation,keyDigest,requestDigest,
        result.patientRefId,result.mappingId??null,JSON.stringify(result)]);
      return result;
    };
    const required=operation==='MAPPING_REVIEW'?'mapping:review':'mapping:write';
    const outcome=await (state.requireNetworkAudit?state.transactions.runWithIdentityNetwork(binding,required,executeTransaction,network.input):state.transactions.run(binding,required,executeTransaction));
    if(outcome instanceof V3IdentityDenial)throw new AuthError(outcome.statusCode,outcome.code);
    return outcome;
  }
  dispose(){const state=privateState.get(this);state.key?.fill(0);state.key=null;}
}
