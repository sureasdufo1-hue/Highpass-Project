// Test-only synthetic workflow. Never return nonce, QR payload or access token.
export async function verifySyntheticTicketReplay(request, checkpoint = () => {}) {
  const require = (condition, code) => { if (!condition) throw new Error(code); };
  let consentId;
  let ticketId;
  let nonce;
  let primaryError;
  let cleanup = 'NOT VERIFIED';
  let result;
  try {
    const studies = await request('/api/imaging-studies?patientId=P-1001', 'PATIENT');
    require(studies.status === 200 && Array.isArray(studies.body) && studies.body.some(study => study.studyInstanceUid === '1.2.410.100.1.20260620.001' && study.sourceHospitalId === 'HOSP-A'), 'SYNTHETIC_STUDY_NOT_CONFIRMED');
    const created = await request('/api/consents', 'PATIENT', {
      patientId: 'P-1001', sourceHospitalId: 'HOSP-A', targetHospitalId: 'HOSP-B',
      purpose: 'TREATMENT', permission: 'VIEW_ONLY',
      validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: [{ studyInstanceUid: '1.2.410.100.1.20260620.001' }],
    });
    require(created.status === 201 && /^consent_[a-f0-9]{16}$/.test(created.body.consentId ?? ''), 'CREATED_CONSENT_RECEIPT_REQUIRED');
    // Only the exact ID returned by our creation request may ever be revoked.
    consentId = created.body.consentId;
    checkpoint({ consentId, phase: 'CONSENT_CREATED' });
    require(created.body.patientId === 'P-1001' && created.body.targetHospitalId === 'HOSP-B' && created.body.permission === 'VIEW_ONLY' && created.body.status === 'ACTIVE', 'CREATED_CONSENT_BINDING_REQUIRED');
    const handoff = await request(`/api/consents/${consentId}/handoff-ticket`, 'PATIENT', {});
    require(handoff.status === 201 && handoff.body.consentId === consentId && /^ticket_[a-f0-9]{16}$/.test(handoff.body.ticketId ?? ''), 'HANDOFF_RECEIPT_REQUIRED');
    ticketId = handoff.body.ticketId;
    checkpoint({ consentId, ticketId, phase: 'TICKET_ISSUED' });
    const qr = new URL(handoff.body.qr?.payload);
    require(qr.protocol === 'https:' && !qr.username && !qr.password && !qr.search && !qr.hash && /^\/t\/[A-Za-z0-9_-]{43}$/.test(qr.pathname), 'OPAQUE_QR_REQUIRED');
    nonce = qr.pathname.slice(3);
    const path = '/api/transfers/tickets/redeem-viewer';
    const first = await request(path, 'DOCTOR', { nonce });
    require(first.status === 200 && first.body.decision === 'ALLOWED' && first.body.ticketId === ticketId && typeof first.body.accessToken === 'string' && first.body.viewerContext?.studyInstanceUid === '1.2.410.100.1.20260620.001' && first.body.viewerContext?.targetHospitalId === 'HOSP-B' && first.body.viewerContext?.permission === 'VIEW_ONLY', 'FIRST_REDEMPTION_NOT_CONFIRMED');
    const second = await request(path, 'DOCTOR', { nonce });
    // A new DPoP proof is generated per request by the caller. This checks QR
    // nonce reuse, not reuse of the DPoP proof's jti.
    require([403, 409].includes(second.status) && second.body.decision === 'DENIED' && second.body.reasonCode === 'TICKET_ALREADY_USED' && !second.body.accessToken, 'SAME_NONCE_REPLAY_DENY_NOT_CONFIRMED');
    const integrity = await request('/api/audit-integrity', 'SECURITY_ADMIN');
    require(integrity.status === 200 && integrity.body.ok === true, 'AUDIT_CHAIN_NOT_CONFIRMED');
    result = { firstRedemption: 'PASS', sameNonceReplayDenied: 'PASS', auditChain: 'PASS' };
  } catch (error) { primaryError = error; }
  finally {
    nonce = null;
    if (consentId) {
      try {
        const revoked = await request(`/api/consents/${consentId}/revoke`, 'PATIENT', {});
        if (revoked.status === 200 && revoked.body.consentId === consentId && revoked.body.status === 'REVOKED') cleanup = 'PASS';
      } catch {} // Preserve test failure and mark cleanup incomplete; no blind retry.
    }
  }
  return {
    review: 'DRAFT / UNASSIGNED', environment: 'CAPSTONE_SYNTHETIC_ONLY',
    scope: 'API_ONLY_NEW_SYNTHETIC_CONSENT', consentId, ticketId,
    status: !primaryError && cleanup === 'PASS' ? 'PASS' : 'NOT VERIFIED',
    ...result, cleanup,
    ...(primaryError ? { reason: /^[A-Z_]+$/.test(primaryError.message) ? primaryError.message : 'REQUEST_FAILED_RECONCILE_BEFORE_RETRY' } : {}),
    browserCameraScan: 'NOT VERIFIED', viewerPixels: 'NOT VERIFIED',
  };
}
