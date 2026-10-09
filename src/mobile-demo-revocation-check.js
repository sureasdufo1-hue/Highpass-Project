// API evidence only; never represents a browser confirmation or native device test.
export async function verifyOwnedDemoRevocation(request, proof) {
  const require = (condition, code) => { if (!condition) throw new Error(code); };
  require(proof.environment === 'CAPSTONE_SYNTHETIC_ONLY' && /^consent_[a-f0-9]{16}$/.test(proof.consentId ?? '') && /^ticket_[a-f0-9]{16}$/.test(proof.ticketId ?? ''), 'OWNED_PROOF_REQUIRED');
  const logs = await request('/api/audit-logs?action=TICKET_ISSUED&limit=128', 'SECURITY_ADMIN');
  require(logs.status === 200 && Array.isArray(logs.body), 'AUDIT_READ_NOT_CONFIRMED');
  require(logs.body.some(log => log.ticketId === proof.ticketId && log.consentId === proof.consentId && log.actorId === 'P-1001' && log.result === 'SUCCESS'), 'OWNED_TICKET_BINDING_NOT_CONFIRMED');
  const path = `/api/consents/${proof.consentId}`;
  const initial = await request(path, 'PATIENT');
  const consent = initial.body;
  require(initial.status === 200 && consent.consentId === proof.consentId && consent.patientId === 'P-1001' && consent.sourceHospitalId === 'HOSP-A' && consent.targetHospitalId === 'HOSP-B' && consent.permission === 'VIEW_ONLY' && consent.purpose === 'TREATMENT' && consent.status === 'ACTIVE', 'OWNED_CONSENT_NOT_CONFIRMED');
  require(consent.scopes?.length === 1 && consent.scopes[0].studyInstanceUid === '1.2.410.100.1.20260620.001', 'SYNTHETIC_STUDY_SCOPE_REQUIRED');
  const input = { consentId: proof.consentId, doctorId: 'DOC-B-01', requestingHospitalId: 'HOSP-B', studyInstanceUid: consent.scopes[0].studyInstanceUid, purpose: 'TREATMENT', requestedAction: 'VIEW' };
  const before = await request('/api/dicom-access/request', 'DOCTOR', input);
  require(before.status === 200 && before.body.decision === 'ALLOWED' && typeof before.body.accessToken === 'string', 'PRE_REVOCATION_TOKEN_NOT_CONFIRMED');
  const metadataPath = `/dicomweb/studies/${input.studyInstanceUid}/series`;
  const metadata = await request(metadataPath, before.body.accessToken);
  require(metadata.status === 200 && Array.isArray(metadata.body) && metadata.body.length > 0, 'PRE_REVOCATION_GATEWAY_NOT_CONFIRMED');
  const revoked = await request(path + '/revoke', 'PATIENT', {});
  require(revoked.status === 200 && revoked.body.consentId === proof.consentId && revoked.body.status === 'REVOKED', 'REVOCATION_NOT_CONFIRMED');
  const after = await request('/api/dicom-access/request', 'DOCTOR', input);
  require(after.status === 403 && after.body.decision === 'DENIED' && /CONSENT_REVOKED/.test(after.body.reasonCode ?? ''), 'POST_REVOCATION_NEW_TOKEN_DENY_NOT_CONFIRMED');
  const denied = await request(metadataPath, before.body.accessToken);
  require([401, 403].includes(denied.status) && ['ACCESS_DENIED', 'TOKEN_REVOKED', 'ACCESS_DENIED_CONSENT_REVOKED'].includes(denied.body.error ?? denied.body.reason), 'POST_REVOCATION_EXISTING_TOKEN_DENY_NOT_CONFIRMED');
  const integrity = await request('/api/audit-integrity', 'SECURITY_ADMIN');
  require(integrity.status === 200 && integrity.body.ok === true, 'AUDIT_CHAIN_NOT_CONFIRMED');
  return { review: 'DRAFT / UNASSIGNED', environment: proof.environment, consentId: proof.consentId, ticketId: proof.ticketId, scope: 'API_ONLY_OWNED_SYNTHETIC_CONSENT', status: 'PASS', preRevocationGateway: 'PASS', revocation: 'PASS', newTokenDenied: 'PASS', existingTokenDenied: 'PASS', auditChain: 'PASS', browserConfirmation: 'NOT VERIFIED', ticketReplay: 'NOT VERIFIED' };
}
