import {createHash,randomUUID} from 'node:crypto';
import {AuditAction} from './domain.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fields=['packageId','keyId','wrappedKeyHash','ciphertextHash','manifestHash','viewingGatewayId'];
const keyPattern=/^https:\/\/[a-z0-9][a-z0-9-]{1,22}[a-z0-9]\.vault\.azure\.net\/keys\/[A-Za-z0-9-]{1,127}\/[a-f0-9]{32}$/;
// Injected internal policy, not a public unwrap API. A and B callers must be
// authenticated independently by HTTP adapters before these operations are used.
export class PatientBoundKeyRelease {
  constructor({authorizer,service,repository,keyId,viewingGatewayId='hospital-b-portal'}) {
    if(typeof authorizer?.revalidatePreparationReceipt!=='function' || !service || repository?.persistent!==true
      || !['create','activate','read','precheck','consume'].every(method=>typeof repository[method]==='function')
      || !keyPattern.test(keyId))throw new Error('PATIENT_RELEASE_DEPENDENCIES_REQUIRED');
    Object.assign(this,{authorizer,service,repository,keyId,viewingGatewayId});
  }
  snapshot(input){
    if(!input || Object.keys(input).sort().join()!==[...fields].sort().join() || !/^pkg_[A-Za-z0-9_-]{16,80}$/.test(input.packageId??'')
      || input.keyId!==this.keyId || input.viewingGatewayId!==this.viewingGatewayId
      || !fields.slice(2,5).every(field=>/^[a-f0-9]{64}$/.test(input[field]??'')))throw new Error('PATIENT_RELEASE_BINDING_INVALID');
    return Object.freeze(Object.fromEntries(fields.map(field=>[field,input[field]])));
  }
  async authority(receipt){
    const context=await this.authorizer.revalidatePreparationReceipt(receipt);
    if(context.claims.authorityType!=='PATIENT_SELF_VIEW' || context.claims.actorType!=='PATIENT' || context.claims.permission!=='VIEW_ONLY'
      || context.claims.viewingGatewayId!==this.viewingGatewayId || !context.route.sopInstanceUid
      || !['instance','frame'].includes(context.route.kind) || context.path.endsWith('/metadata'))throw new Error('PATIENT_RELEASE_INSTANCE_REQUIRED');
    return context;
  }
  async audit(context,action){
    await this.service.writeAudit({actorType:'PATIENT',actorId:context.claims.sub,patientId:context.claims.patientId,
      auditSessionId:context.claims.auditSessionId,sourceHospitalId:context.claims.sourceHospitalId,
      studyInstanceUid:context.route.studyInstanceUid,seriesInstanceUid:context.route.seriesInstanceUid,sopInstanceUid:context.route.sopInstanceUid,
      action,result:'SUCCESS',reasonCode:action,tokenId:context.claims.jti,skipAnomalyDetection:true});
    await this.service.store.save();
  }
  async guarded(operation){
    try{return await operation();}catch(error){
      await this.service.writeAudit({actorType:'SYSTEM',actorId:'patient-key-release',action:'ACCESS_DENIED',result:'FAIL',
        reasonCode:'PATIENT_KEY_RELEASE_DENIED',skipAnomalyDetection:true});await this.service.store.save();throw error;
    }
  }
  async authorizeWrap({receipt,packageId,keyId}){
    return this.guarded(async()=>{
      if(keyId!==this.keyId || !/^pkg_[A-Za-z0-9_-]{16,80}$/.test(packageId??''))throw new Error('PATIENT_RELEASE_BINDING_INVALID');
      const context=await this.authority(receipt);await this.audit(context,AuditAction.PATIENT_KEY_WRAP_AUTHORIZED);
      await this.authority(receipt);return true;
    });
  }
  async prepare({receipt,packageBinding}){
    return this.guarded(async()=>{
      const binding=this.snapshot(packageBinding),context=await this.authority(receipt),releaseId=randomUUID();
      const record={releaseId,grantId:context.claims.jti,receiptHash:hash(receipt),binding,subject:context.claims.sub,patientId:context.claims.patientId,
        sourceHospitalId:context.claims.sourceHospitalId,viewingGatewayId:context.claims.viewingGatewayId,auditSessionId:context.claims.auditSessionId,
        path:context.path,expiresAt:context.deadline};
      await this.repository.create(record);
      // Pending rows cannot authorize unwrap if audit persistence fails.
      await this.audit(context,AuditAction.PATIENT_KEY_RELEASE_PREPARED);await this.authority(receipt);
      if(!await this.repository.activate(releaseId))throw new Error('PATIENT_RELEASE_INACTIVE');
      await this.authority(receipt);return {releaseId,expiresAt:context.deadline};
    });
  }
  async authorize({releaseId,receipt,packageBinding,phase,authenticatedViewingGatewayId}){
    return this.guarded(async()=>{
      if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(releaseId??'')
        || authenticatedViewingGatewayId!==this.viewingGatewayId || !['BEFORE_UNWRAP','AFTER_UNWRAP'].includes(phase))throw new Error('PATIENT_RELEASE_PRINCIPAL_INVALID');
      const binding=this.snapshot(packageBinding),record=await this.repository.read(releaseId),context=await this.authority(receipt);
      if(!record || !['PREPARED','PRECHECKED'].includes(record.status) || record.receiptHash!==hash(receipt)
        || fields.some(field=>record.binding[field]!==binding[field]) || record.grantId!==context.claims.jti
        || record.subject!==context.claims.sub || record.patientId!==context.claims.patientId || record.path!==context.path
        || record.sourceHospitalId!==context.claims.sourceHospitalId || record.viewingGatewayId!==context.claims.viewingGatewayId
        || record.auditSessionId!==context.claims.auditSessionId || record.expiresAt!==context.deadline)throw new Error('PATIENT_RELEASE_BINDING_INACTIVE');
      const consumed=phase==='AFTER_UNWRAP';
      if(!await this.repository[consumed?'consume':'precheck'](releaseId))throw new Error('PATIENT_RELEASE_INACTIVE');
      await this.audit(context,consumed?AuditAction.PATIENT_KEY_RELEASE_CONSUMED:AuditAction.PATIENT_KEY_RELEASE_PRECHECKED);
      await this.authority(receipt);return true;
    });
  }
}

export class PostgresPatientKeyReleaseRepository {
  persistent=true;
  constructor(pool){this.pool=pool;}
  query(text,values){return this.pool.query({text,values,query_timeout:5000});}
  async create(record){await this.query("INSERT INTO capstone_patient_key_releases(release_id,grant_id,package_id,metadata,status,expires_at) VALUES($1,$2,$3,$4::jsonb,'PENDING',to_timestamp($5/1000.0))",[record.releaseId,record.grantId,record.binding.packageId,JSON.stringify(record),record.expiresAt]);}
  async read(id){const result=await this.query('SELECT metadata,status FROM capstone_patient_key_releases WHERE release_id=$1',[id]);return result.rows[0]?{...result.rows[0].metadata,status:result.rows[0].status}:null;}
  async activate(id){return (await this.query("UPDATE capstone_patient_key_releases SET status='PREPARED' WHERE release_id=$1 AND status='PENDING' AND expires_at>clock_timestamp() RETURNING release_id",[id])).rowCount===1;}
  async precheck(id){return (await this.query("UPDATE capstone_patient_key_releases SET status='PRECHECKED' WHERE release_id=$1 AND status IN ('PREPARED','PRECHECKED') AND expires_at>clock_timestamp() RETURNING release_id",[id])).rowCount===1;}
  async consume(id){return (await this.query("UPDATE capstone_patient_key_releases SET status='CONSUMED',consumed_at=clock_timestamp() WHERE release_id=$1 AND status='PRECHECKED' AND expires_at>clock_timestamp() RETURNING release_id",[id])).rowCount===1;}
}
