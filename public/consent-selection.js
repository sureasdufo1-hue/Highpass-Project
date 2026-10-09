// Display selection only. Server-side RBAC/ABAC/token checks remain authority.
export function selectConsentForStudy(consents, { studyUid, targetHospitalId, preferredConsentId }) {
  if (!studyUid || !targetHospitalId || !Array.isArray(consents)) return null;
  const eligible = consents.filter(consent => consent.targetHospitalId === targetHospitalId
    && Array.isArray(consent.scopes)
    && consent.scopes.some(scope => scope.allowed !== false && scope.studyInstanceUid === studyUid));
  // Preserve this flow's explicit consent even after revocation/expiry. Never
  // silently replace it with a different ACTIVE consent on dashboard refresh.
  return eligible.find(consent => consent.consentId === preferredConsentId)
    ?? eligible.find(consent => consent.status === "ACTIVE") ?? eligible[0] ?? null;
}

export function isRevocationAcknowledged(result, requestedConsentId) {
  return typeof requestedConsentId === "string" && requestedConsentId.length > 0
    && result?.consentId === requestedConsentId && result.status === "REVOKED" && !result.error;
}
