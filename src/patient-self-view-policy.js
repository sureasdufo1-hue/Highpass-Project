// Preliminary policy only. Snapshot MUST come from an authenticated server-side
// authority reader, never HTTP body. This does not issue a grant, validate DPoP,
// persist/audit authority or authorize a Gateway/key release by itself.
const uid = value => typeof value === 'string' && value.length <= 64 && /^[0-9]+(?:\.[0-9]+)+$/.test(value)
  && value.split('.').every(part => part === '0' || !part.startsWith('0'));
const deny = (reasonCode, statusCode = 403) => ({decision:'DENIED', reasonCode, statusCode});

export function evaluatePatientSelfViewPolicy(input, snapshot) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('SCOPE_MISMATCH',400);
  const {principal, patientId, studyInstanceUid, seriesInstanceUid, requestedAction} = input;
  if (principal?.role !== 'PATIENT' || typeof principal.subject !== 'string' || !principal.subject || principal.patientId !== patientId) return deny('PATIENT_SUBJECT_MISMATCH');
  if (!patientId || !uid(studyInstanceUid) || !uid(seriesInstanceUid) || requestedAction !== 'VIEW') return deny('SCOPE_MISMATCH');
  if (!snapshot || snapshot.account?.verified !== true || !['CAPSTONE_MOCK_IDP','V3_PATIENT_ACCOUNT'].includes(snapshot.account?.evidenceKind)) return deny('PATIENT_ACCOUNT_UNVERIFIED',503);
  const {account,ownership,sourceHospital,series} = snapshot;
  if (account.subject !== principal.subject || account.patientId !== patientId || account.status !== 'ACTIVE') return deny('PATIENT_ACCOUNT_INACTIVE');
  if (ownership?.verified !== true || typeof ownership.revision !== 'string' || !ownership.revision) return deny('PATIENT_OWNERSHIP_UNVERIFIED',503);
  if (ownership.patientId !== patientId || ownership.studyInstanceUid !== studyInstanceUid || ownership.status !== 'ACTIVE') return deny('PATIENT_OWNERSHIP_CHANGED');
  if (!sourceHospital?.hospitalId || sourceHospital.hospitalId !== ownership.sourceHospitalId || sourceHospital.status !== 'ACTIVE') return deny('SOURCE_HOSPITAL_INACTIVE');
  if (!Array.isArray(series) || series.some(row=>!row || !uid(row.studyInstanceUid) || !uid(row.seriesInstanceUid)) || series.filter(row => row.studyInstanceUid===studyInstanceUid && row.seriesInstanceUid===seriesInstanceUid).length !== 1) return deny('SCOPE_MISMATCH');
  return {decision:'ALLOWED',reasonCode:'PATIENT_SELF_VIEW_POLICY_ALLOWED',statusCode:200,
    scope:{authorityType:'PATIENT_SELF_VIEW',actorType:'PATIENT',subject:principal.subject,patientId,
      sourceHospitalId:sourceHospital.hospitalId,studyInstanceUid,allowedSeriesUids:[seriesInstanceUid],
      permission:'VIEW_ONLY',purpose:'PATIENT_SELF_VIEW',ownershipRevision:ownership.revision}};
}
