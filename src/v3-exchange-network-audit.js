import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';
import {appendExchangeAudit} from './v3-exchange-audit.js';
import {V3TransactionError} from './v3-tenant-transaction.js';

/** Shared capstone proxy authority, not a separate Session ingress or DPoP proof.
 * Caller must use runWithIdentityNetwork on the same transaction. */
export async function appendPairedExchangeAudit(tx,binding,event,input){
  const facts=readIdentityNetworkAuditInput(input,binding,event);
  const eventId=await appendExchangeAudit(tx,binding,event);
  // Domain INSERT may have awaited locks: recheck before persisting provenance.
  readIdentityNetworkAuditInput(input,binding,event);
  const result=await tx.query(`INSERT INTO highpass_v3.exchange_network_audit
    (event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[eventId,binding.tenantId,binding.hospitalId,binding.actorId,
    event.auditSessionId.toLowerCase(),event.traceId,facts.sourceIp,facts.ingressMode,
    Buffer.from(facts.proxyCertificateSha256,'hex'),facts.observedAt]);
  if(result.rowCount!==1)throw new V3TransactionError('V3_SESSION_NETWORK_AUDIT_NOT_RECORDED');
  readIdentityNetworkAuditInput(input,binding,event);
  return eventId;
}
