import {randomUUID} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3TenantTransaction,V3TransactionError} from './v3-tenant-transaction.js';
import {appendIdentityAudit} from './v3-identity-audit.js';
import {v3BindingExpiry} from './v3-principal-registry.js';
import {v3MappingWritePolicy} from './v3-mapping-write-contract.js';
import {V3IdentityIdempotency} from './v3-identity-idempotency.js';

const privateState=new WeakMap();
/** Internal bootstrap only. No identity matching, auto verification or retry. */
export class V3PatientRefService {
  constructor({transactions,idempotency}={}){
    if(!(transactions instanceof V3TenantTransaction)||transactions.deadlineMs>10000)
      throw new V3TransactionError('V3_TRANSACTION_CONFIGURATION_INVALID');
    if(idempotency!==undefined&&!(idempotency instanceof V3IdentityIdempotency))throw new V3TransactionError('V3_IDEMPOTENCY_CONFIGURATION_INVALID');
    privateState.set(this,{transactions,idempotency});
  }
  async register(binding,options={}){
    const context=this.#context(binding,options);
    return privateState.get(this).transactions.run(binding,'mapping:write',tx=>this.#create(tx,binding,context));
  }
  async registerIdempotent(binding,key,options={}){
    const context=this.#context(binding,options);
    const {idempotency}=privateState.get(this);
    if(!idempotency)throw new V3TransactionError('V3_IDEMPOTENCY_CONFIGURATION_INVALID');
    // Correlation IDs are per request, not the immutable business command.
    return idempotency.run(binding,'PATIENT_REF_REGISTER',key,{},tx=>this.#create(tx,binding,context));
  }
  #context(binding,options){
    v3BindingExpiry(binding);
    if(!v3MappingWritePolicy.allowedRoles.includes(binding.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
    if(!options||typeof options!=='object'||Array.isArray(options)
      ||![Object.prototype,null].includes(Object.getPrototypeOf(options))
      ||Reflect.ownKeys(options).some(key=>!['auditSessionId','traceId'].includes(key)
        ||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');
    const {auditSessionId=randomUUID(),traceId=randomUUID()}=options;
    if(typeof auditSessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auditSessionId)
      ||typeof traceId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(traceId))throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');
    return {auditSessionId,traceId};
  }
  async #create(tx,binding,{auditSessionId,traceId}){
      const patientRefId=randomUUID();
      const result=await tx.query(`INSERT INTO highpass_v3.patient_refs(patient_ref,owner_tenant_id,owner_hospital_id,registered_by)
        VALUES($1,$2,$3,$4) RETURNING patient_ref,created_at`,[patientRefId,binding.tenantId,binding.hospitalId,binding.actorId]);
      const row=result.rows[0],date=new Date(row?.created_at);
      if(result.rows.length!==1||row.patient_ref!==patientRefId||row.created_at==null||!Number.isFinite(date.getTime()))
        throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
      await tx.query(`INSERT INTO highpass_v3.patient_ref_registrations(patient_ref,tenant_id,hospital_id,registered_by)
        VALUES($1,$2,$3,$4)`,[patientRefId,binding.tenantId,binding.hospitalId,binding.actorId]);
      await appendIdentityAudit(tx,binding,{patientRefId,auditSessionId,traceId,
        action:'PATIENT_REF_CREATED',result:'ALLOW',reasonCode:'PATIENT_REF_REGISTERED'});
      return {patientRefId,createdAt:date.toISOString()};
  
  }
}
