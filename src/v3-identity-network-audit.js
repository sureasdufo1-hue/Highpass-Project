import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';
import {appendIdentityAudit} from './v3-identity-audit.js';
import {V3TransactionError} from './v3-tenant-transaction.js';

export async function appendIdentityNetworkAudit(tx,binding,eventId,context,input){
  const facts=readIdentityNetworkAuditInput(input,binding,context);
  if(typeof eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)
    ||!tx||typeof tx.query!=='function')throw new V3TransactionError('V3_IDENTITY_NETWORK_AUDIT_INVALID');
  const inserted=await tx.query(`INSERT INTO highpass_v3.identity_network_audit
    (event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[eventId,binding.tenantId,binding.hospitalId,binding.actorId,
    context.auditSessionId.toLowerCase(),context.traceId,facts.sourceIp,facts.ingressMode,
    Buffer.from(facts.proxyCertificateSha256,'hex'),facts.observedAt]);
  if(inserted.rowCount!==1)throw new V3TransactionError('V3_IDENTITY_NETWORK_AUDIT_NOT_RECORDED');
  readIdentityNetworkAuditInput(input,binding,context);
}

/** Caller must use runWithIdentityNetwork on this same transaction. No independent
 * connection, plaintext credential, JSON capability or best-effort audit fallback. */
export async function appendPairedIdentityAudit(tx,binding,event,input){
  readIdentityNetworkAuditInput(input,binding,event);
  const id=await appendIdentityAudit(tx,binding,event);
  await appendIdentityNetworkAudit(tx,binding,id,event,input);
  return id;
}
