import { createHash } from 'node:crypto';
import { evaluatePatientSelfViewPolicy } from './patient-self-view-policy.js';

const uid = value => typeof value === 'string' && value.length <= 64 && /^[0-9]+(?:\.[0-9]+)+$/.test(value)
  && value.split('.').every(part => part === '0' || !part.startsWith('0'));
const unverified = reasonCode => ({ decision: 'DENIED', reasonCode, statusCode: 503 });
const syntheticPatients = Object.freeze({ 'synthetic-phantom-account': 'HP-TEST-PHANTOM-001', 'synthetic-account-a': 'P-1001', 'synthetic-hcc-account': 'MEDIQ-SYN-HCC-001' });

// Called only with an authenticated server principal. HTTP body/status/owner
// fields never supply evidence. One bounded, current DB snapshot on every read.
export class PatientSelfViewAuthorityReader {
  constructor({ pool, enabled = false, clock = Date.now, lockRows = false, allowIssuedGrant = false }) {
    if (typeof pool?.query !== 'function') throw new Error('AUTHORITY_DATABASE_REQUIRED');
    this.pool = pool; this.enabled = enabled === true; this.clock = clock; this.lockRows = lockRows === true;
    this.allowIssuedGrant = allowIssuedGrant === true;
  }

  async authorize(input) {
    if (!this.enabled) return unverified('PATIENT_ACCOUNT_UNVERIFIED');
    const principal = input?.principal;
    const session = principal?.authMethod === 'TEST_JWT' && principal.authMode === 'TEST'
      && principal.issuer === 'highpass-capstone-test-idp' && principal.audience === 'highpass-capstone-api';
    // Only the internal signature+ledger verifier constructs this principal.
    // Never label a Grant as an original TEST JWT authentication session.
    const grant = this.allowIssuedGrant && principal?.authMethod === 'PATIENT_SELF_VIEW_GRANT'
      && principal.authorityType === 'PATIENT_SELF_VIEW' && principal.issuer === 'highpass-control-plane'
      && principal.audience === 'mediq-patient-self-view-gateway';
    if (principal?.role !== 'PATIENT' || !(session || grant)
      || !Number.isFinite(principal.expiresAtMs) || principal.expiresAtMs <= this.clock()
      || !Object.hasOwn(syntheticPatients, principal.subject) || syntheticPatients[principal.subject] !== principal.patientId
      || principal.patientId !== input?.patientId) return { decision: 'DENIED', reasonCode: 'PATIENT_SUBJECT_MISMATCH', statusCode: 403 };
    if (!uid(input.studyInstanceUid) || !uid(input.seriesInstanceUid) || input.requestedAction !== 'VIEW')
      return { decision: 'DENIED', reasonCode: 'SCOPE_MISMATCH', statusCode: 403 };
    try {
      const result = await this.pool.query({ text: `SELECT a.subject,a.patient_id,a.status AS account_status,a.evidence_kind,a.revision AS account_revision,
        r.ref_id,r.version,r.status AS ref_status,s.study_instance_uid,s.source_hospital_id,h.status AS hospital_status,
        se.series_instance_uid
        FROM capstone_patient_accounts a
        JOIN patients p ON p.patient_id=a.patient_id
        JOIN capstone_patient_ownership_refs r ON r.subject=a.subject AND r.patient_id=a.patient_id
        JOIN imaging_studies s ON s.study_instance_uid=r.study_instance_uid AND s.patient_id=r.patient_id AND s.source_hospital_id=r.source_hospital_id
        JOIN hospitals h ON h.hospital_id=s.source_hospital_id
        JOIN imaging_series se ON se.study_instance_uid=s.study_instance_uid
        WHERE a.subject=$1 AND a.patient_id=$2 AND s.study_instance_uid=$3 AND se.series_instance_uid=$4${this.lockRows ? ' FOR SHARE OF a,p,r,s,h,se' : ''}`,
        values: [principal.subject, input.patientId, input.studyInstanceUid, input.seriesInstanceUid], query_timeout: 5000 });
      if (principal.expiresAtMs <= this.clock()) return { decision: 'DENIED', reasonCode: 'PATIENT_SUBJECT_MISMATCH', statusCode: 403 };
      if (result.rows.length !== 1) return unverified('PATIENT_OWNERSHIP_UNVERIFIED');
      const row = result.rows[0];
      if (!row.account_revision || !row.ref_id || !Number.isInteger(row.version) || row.version < 1)
        return unverified('PATIENT_OWNERSHIP_UNVERIFIED');
      const revision = createHash('sha256').update(JSON.stringify([row.account_revision,row.ref_id,row.version,row.patient_id,row.study_instance_uid,row.source_hospital_id,row.series_instance_uid])).digest('hex');
      const decision = evaluatePatientSelfViewPolicy(input, {
        account: { verified: true, evidenceKind: row.evidence_kind, subject: row.subject, patientId: row.patient_id, status: row.account_status },
        ownership: { verified: true, revision, patientId: row.patient_id, studyInstanceUid: row.study_instance_uid, sourceHospitalId: row.source_hospital_id, status: row.ref_status },
        sourceHospital: { hospitalId: row.source_hospital_id, status: row.hospital_status },
        series: [{ studyInstanceUid: row.study_instance_uid, seriesInstanceUid: row.series_instance_uid }],
      });
      if (decision.decision === 'ALLOWED') decision.scope.refId = row.ref_id;
      return decision;
    } catch { return unverified('PATIENT_OWNERSHIP_UNVERIFIED'); }
  }
}
