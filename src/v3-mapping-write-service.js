import {randomUUID,createHash} from 'node:crypto';
import {AuthError} from './auth.js';
import {V3IdentifierProtection} from './v3-identifier-protection.js';
import {V3IdentityIdempotency,V3IdentityDenial} from './v3-identity-idempotency.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
import {prepareMappingReconcile,prepareMappingReview} from './v3-mapping-write-contract.js';
import {appendIdentityAudit as appendLegacyIdentityAudit} from './v3-identity-audit.js';
function appendIdentityAudit(tx,binding,event){return tx.appendIdentityAudit?tx.appendIdentityAudit(event):appendLegacyIdentityAudit(tx,binding,event);}

const privateState=new WeakMap();
const columns='mapping_id,patient_ref,tenant_id,hospital_id,status,version,created_at,updated_at,verified_at,registered_by';
function dto(row){
  const result={mappingId:row.mapping_id,patientRefId:row.patient_ref,tenantId:row.tenant_id,hospitalId:row.hospital_id,
    state:row.status,version:row.version,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};
  if(row.verified_at)result.verifiedAt=new Date(row.verified_at).toISOString();return result;
}
function correlation(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options))
    ||Reflect.ownKeys(options).some(k=>!['auditSessionId','traceId'].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')))
    throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');
  const {auditSessionId=randomUUID(),traceId=randomUUID()}=options;
  if(typeof auditSessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auditSessionId)
    ||typeof traceId!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(traceId))throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');
  return {auditSessionId,traceId};
}
async function ownedRef(tx,binding,id){return (await tx.query(`SELECT patient_ref FROM highpass_v3.patient_refs
  WHERE patient_ref=$1 AND owner_tenant_id=$2 AND owner_hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,[id,binding.tenantId,binding.hospitalId])).rows.length===1;}
async function deny(tx,binding,context,code,row){
  await appendIdentityAudit(tx,binding,{...context,action:'MAPPING_DENIED',result:'DENY',reasonCode:code.replace(/^V3_/,''),
    ...(row?{mappingId:row.mapping_id,mappingVersion:row.version,newState:row.status}:{})});
  return new V3IdentityDenial(code);
}
export class V3MappingWriteService {
  constructor({idempotency,protection}={}){
    if(!(idempotency instanceof V3IdentityIdempotency)||!(protection instanceof V3IdentifierProtection))
      throw new V3TransactionError('V3_MAPPING_CONFIGURATION_INVALID');
    privateState.set(this,{idempotency,protection});
  }
  get requireNetworkAudit(){return privateState.get(this).idempotency.requireNetworkAudit;}
  async reconcile(binding,key,request,options={},input){
    const {idempotency,protection}=privateState.get(this),command=prepareMappingReconcile(binding,request,protection),context=correlation(options);
    const fingerprint={...command,protectedLocalRef:command.protectedLocalRef.toString('base64url'),localRefDigest:command.localRefDigest.toString('base64url')};
    return idempotency.run(binding,'MAPPING_RECONCILE',key,fingerprint,async tx=>{
      const lock=createHash('sha256').update(JSON.stringify(['HPV3-MAPPING-LOOKUP',binding.tenantId,binding.hospitalId,fingerprint.localRefDigest])).digest();
      await tx.query('SELECT pg_advisory_xact_lock($1::bigint)',[lock.readBigInt64BE().toString()]);
      if(!await ownedRef(tx,binding,command.patientRefId))return deny(tx,binding,context,'V3_PATIENT_REF_NOT_FOUND');
      const found=await tx.query(`SELECT ${columns} FROM highpass_v3.patient_mappings
        WHERE tenant_id=$1 AND hospital_id=$2 AND local_ref_digest=$3 AND deleted_at IS NULL FOR UPDATE`,[binding.tenantId,binding.hospitalId,command.localRefDigest]);
      let row=found.rows[0];
      if(row){
        if(row.patient_ref!==command.patientRefId){
          const oldState=row.status,evidenceDigest=createHash('sha256').update(command.protectedLocalRef).digest();
          if(row.status!=='IDENTITY_CONFLICT'){
            row=(await tx.query(`UPDATE highpass_v3.patient_mappings SET status='IDENTITY_CONFLICT',version=version+1,
              evidence_digest=$2,verified_by=NULL,verified_at=NULL,updated_at=statement_timestamp()
              WHERE mapping_id=$1 RETURNING ${columns}`,[row.mapping_id,evidenceDigest])).rows[0];
            await appendIdentityAudit(tx,binding,{...context,mappingId:row.mapping_id,mappingVersion:row.version,oldState,newState:row.status,
              action:'MAPPING_CONFLICT',result:'DENY',reasonCode:'MAPPING_IDENTITY_CONFLICT',evidenceDigest});
          }else await appendIdentityAudit(tx,binding,{...context,mappingId:row.mapping_id,mappingVersion:row.version,newState:row.status,
            action:'MAPPING_CONFLICT',result:'DENY',reasonCode:'MAPPING_IDENTITY_CONFLICT',evidenceDigest});
          return new V3IdentityDenial('V3_MAPPING_IDENTITY_CONFLICT');
        }
        await appendIdentityAudit(tx,binding,{...context,mappingId:row.mapping_id,mappingVersion:row.version,newState:row.status,
          action:'MAPPING_READ',result:'ALLOW',reasonCode:'MAPPING_METADATA_READ'});
        return dto(row);
      }
      const evidenceDigest=createHash('sha256').update(command.protectedLocalRef).digest();
      row=(await tx.query(`INSERT INTO highpass_v3.patient_mappings
        (mapping_id,tenant_id,hospital_id,patient_ref,protected_local_ref,local_ref_digest,status,registered_by,evidence_digest)
        VALUES($1,$2,$3,$4,$5,$6,'UNVERIFIED',$7,$8) RETURNING ${columns}`,
      [randomUUID(),binding.tenantId,binding.hospitalId,command.patientRefId,command.protectedLocalRef,command.localRefDigest,binding.actorId,evidenceDigest])).rows[0];
      await appendIdentityAudit(tx,binding,{...context,mappingId:row.mapping_id,mappingVersion:row.version,newState:row.status,
        action:'MAPPING_CREATED',result:'ALLOW',reasonCode:'MAPPING_REGISTERED',evidenceDigest});
      return dto(row);
    },this.requireNetworkAudit?{context,input}:undefined);
  }
  async review(binding,key,mappingId,request,options={},input){
    const command=prepareMappingReview(binding,mappingId,request),context=correlation(options);
    return privateState.get(this).idempotency.run(binding,'MAPPING_REVIEW',key,{...command,evidenceDigest:command.evidenceDigest.toString('base64url')},async tx=>{
      let row=(await tx.query(`SELECT ${columns} FROM highpass_v3.patient_mappings
        WHERE mapping_id=$1 AND tenant_id=$2 AND hospital_id=$3 AND deleted_at IS NULL FOR UPDATE`,[command.mappingId,binding.tenantId,binding.hospitalId])).rows[0];
      if(!row||!await ownedRef(tx,binding,row.patient_ref))return deny(tx,binding,context,'V3_MAPPING_NOT_FOUND');
      if(!row.registered_by)return deny(tx,binding,context,'V3_MAPPING_REGISTRATION_REQUIRED',row);
      if(row.registered_by===binding.actorId)return deny(tx,binding,context,'V3_MAPPING_SELF_REVIEW',row);
      if(row.version!==command.expectedVersion)return deny(tx,binding,context,'V3_MAPPING_VERSION_CONFLICT',row);
      const oldState=row.status;
      row=(await tx.query(`UPDATE highpass_v3.patient_mappings SET status=$2,evidence_digest=$3,version=version+1,
        updated_at=statement_timestamp(),verified_by=CASE WHEN $2='VERIFIED' THEN $4::uuid ELSE NULL END,
        verified_at=CASE WHEN $2='VERIFIED' THEN statement_timestamp() ELSE NULL END
        WHERE mapping_id=$1 AND version=$5 RETURNING ${columns}`,[row.mapping_id,command.state,command.evidenceDigest,binding.actorId,command.expectedVersion])).rows[0];
      if(!row)throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');
      await appendIdentityAudit(tx,binding,{...context,mappingId:row.mapping_id,mappingVersion:row.version,oldState,newState:row.status,
        action:'MAPPING_REVIEWED',result:'ALLOW',reasonCode:row.status==='VERIFIED'?'MAPPING_VERIFIED':'MAPPING_REVIEW_REQUIRED',evidenceDigest:command.evidenceDigest});
      return dto(row);
    },this.requireNetworkAudit?{context,input}:undefined);
  }
}
