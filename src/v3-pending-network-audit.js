import {readPendingNetworkAuditInput} from './v3-pending-network-context.js';
import {exchangeCorrelation} from './v3-exchange-audit.js';
import {V3TransactionError} from './v3-tenant-transaction.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function appendPendingNetworkAudit(tx,binding,eventId,correlation,input){
 const facts=readPendingNetworkAuditInput(input,binding,correlation),c=exchangeCorrelation(correlation);
 if(typeof eventId!=='string'||!uuid.test(eventId)||!tx||typeof tx.query!=='function')throw new V3TransactionError('V3_PENDING_NETWORK_AUDIT_INVALID');
 const out=await tx.query(`INSERT INTO highpass_v3.consent_preparation_network_audit
  (event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[eventId,binding.tenantId,binding.hospitalId,binding.actorId,c.auditSessionId,c.traceId,
   facts.sourceIp,facts.ingressMode,Buffer.from(facts.proxyCertificateSha256,'hex'),facts.observedAt]);
 if(out.rowCount!==1)throw new V3TransactionError('V3_PENDING_NETWORK_AUDIT_NOT_RECORDED');
 readPendingNetworkAuditInput(input,binding,correlation);
}
