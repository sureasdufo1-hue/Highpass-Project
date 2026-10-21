import {safeHelperMetadata} from './helper-audit-metadata.js';
import {ticketReference} from './security-detail-data.js';
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_REASON_CODE = /^[A-Z0-9][A-Z0-9_:-]{0,95}$/u;

export function toSecurityAuditView(log) {
  const rawReason = String(log.reasonCode ?? log.reason ?? 'NOT_PROVIDED');
  const reasonCode = rawReason.startsWith('SECURITY_REVIEW:')
    ? 'SECURITY_REVIEW_RECORDED'
    : SAFE_REASON_CODE.test(rawReason) ? rawReason : 'DETAILS_REDACTED';

  return {
    auditId: safeIdentifier(log.auditId),
    auditSessionId: safeIdentifier(log.auditSessionId),
    actorType: safeIdentifier(log.actorType, 'UNKNOWN'),
    actorId: safeIdentifier(log.actorId, 'REDACTED'),
    hospitalId: safeIdentifier(log.hospitalId ?? log.targetHospitalId ?? log.sourceHospitalId, 'UNKNOWN'),
    action: safeIdentifier(log.action, 'UNKNOWN'),
    result: safeIdentifier(log.result, 'UNKNOWN'),
    reasonCode,
    ...(log.action==='HEALTH_HELPER_REQUEST'&&log.helperMetadata?{helperMetadata:safeHelperMetadata(log.helperMetadata)}:{}),
    ...(log.action?.startsWith('TICKET_')?{ticketRef:ticketReference(log.ticketId)}:{}),
    createdAt: typeof log.createdAt === 'string' ? log.createdAt.slice(0, 40) : '',
  };
}

function safeIdentifier(value, fallback = 'UNKNOWN') {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) return fallback;
  return value;
}
