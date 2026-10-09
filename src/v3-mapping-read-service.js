import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { appendIdentityAudit } from './v3-identity-audit.js';
import { V3TenantTransaction,V3TransactionError } from './v3-tenant-transaction.js';
import {appendPairedIdentityAudit} from './v3-identity-network-audit.js';
import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles=Object.freeze(['DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN']);
export const v3MappingReadPolicy=Object.freeze({requiredScope:'mapping:read',allowedRoles:roles});
const privateState=new WeakMap();
function timestamp(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new V3TransactionError('V3_DATABASE_UNAVAILABLE');return date.toISOString();}
export class V3MappingReadService {
  constructor({transactions,requireNetworkAudit=false}={}){
    if(!(transactions instanceof V3TenantTransaction) || transactions.deadlineMs>10000)throw new V3TransactionError('V3_TRANSACTION_CONFIGURATION_INVALID');
    if(typeof requireNetworkAudit!=='boolean')throw new V3TransactionError('V3_TRANSACTION_CONFIGURATION_INVALID');
    privateState.set(this,{transactions,requireNetworkAudit});
  }
  get requireNetworkAudit(){return privateState.get(this).requireNetworkAudit;}
  async get(binding,mappingId,traceId=randomUUID(),network){
    if(!roles.includes(binding?.role))throw new AuthError(403,'V3_ROLE_NOT_ALLOWED');
    if(typeof mappingId!=='string' || !UUID.test(mappingId) || typeof traceId!=='string' || !/^[A-Za-z0-9_-]{16,64}$/.test(traceId))throw new AuthError(422,'V3_MAPPING_REQUEST_INVALID');
    const state=privateState.get(this);
    if(state.requireNetworkAudit){readIdentityNetworkAuditInput(network?.input,binding,network?.context);
      if(network.context.traceId!==traceId)throw new V3TransactionError('V3_IDENTITY_NETWORK_CONTEXT_INVALID');
    }else if(network!==undefined)throw new V3TransactionError('V3_IDENTITY_NETWORK_MODE_MISMATCH');
    const auditSessionId=state.requireNetworkAudit?network.context.auditSessionId:randomUUID();
    const operation=async tx=>{
      const audit=event=>state.requireNetworkAudit?appendPairedIdentityAudit(tx,binding,event,network.input):appendIdentityAudit(tx,binding,event);
      const query=await tx.query(`SELECT mapping_id,patient_ref,tenant_id,hospital_id,status,version,created_at,updated_at,verified_at
        FROM highpass_v3.patient_mappings WHERE mapping_id=$1 AND tenant_id=$2 AND hospital_id=$3 AND deleted_at IS NULL FOR SHARE`,
      [mappingId.toLowerCase(),binding.tenantId,binding.hospitalId]);
      const row=query.rows[0];
      if(!row){
        await audit({auditSessionId,traceId,action:'MAPPING_DENIED',result:'DENY',reasonCode:'MAPPING_NOT_FOUND'});
        return null;
      }
      await audit({mappingId:row.mapping_id,auditSessionId,traceId,action:'MAPPING_READ',result:'ALLOW',
        reasonCode:'MAPPING_METADATA_READ',newState:row.status,mappingVersion:row.version});
      const metadata={mappingId:row.mapping_id,patientRefId:row.patient_ref,tenantId:row.tenant_id,hospitalId:row.hospital_id,
        state:row.status,version:row.version,createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at)};
      if(row.verified_at)metadata.verifiedAt=timestamp(row.verified_at);
      return metadata;
    };
    const result=await(state.requireNetworkAudit?state.transactions.runWithIdentityNetwork(binding,'mapping:read',operation,network.input):state.transactions.run(binding,'mapping:read',operation));
    // Throw only after the DENY event committed. No success metadata on audit failure.
    if(result===null)throw new AuthError(404,'V3_MAPPING_NOT_FOUND');
    return result;
  }
}
