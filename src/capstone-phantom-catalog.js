import { createHash } from 'node:crypto';
import { AuthError, PrincipalRole } from './auth.js';
import { ServiceValidationError } from './services.js';
import { createPhantomInstance } from '../scripts/test-support/synthetic-phantom.js';

export const PHANTOM_PATIENT_ID = 'HP-TEST-PHANTOM-001';
export const PHANTOM_DATASET_ID = 'SYNTHETIC_PHANTOM_24_SLICE_V1';

// Fixed synthetic fixture catalog; never accepts names, identifiers, UIDs,
// arbitrary URLs or clinical bytes from the caller.
export function phantomCatalog(createdAt) {
  const patient = { patientId: PHANTOM_PATIENT_ID, name: '합성 팬텀 환자', birthDate: '1970-01-01', phone: null, createdAt };
  const studies = ['CT', 'MR'].map(modality => {
    const objects = Array.from({ length: 12 }, (_, i) => createPhantomInstance(modality, i + 1));
    return { studyId: `HP-PHANTOM-${modality}-001`, patientId: patient.patientId, sourceHospitalId: 'HOSP-A', studyInstanceUid: objects[0].studyUid,
      modality, bodyPart: 'GEOMETRIC_PHANTOM', studyDate: '2026-10-09', description: `SYNTHETIC ${modality} PHANTOM — NOT DIAGNOSTIC`, metadataOnly: true,
      series: [{ seriesInstanceUid: objects[0].seriesUid, modality, description: 'SYNTHETIC DEMO 12 SLICES', instanceCount: 12, bytes: objects.reduce((sum, row) => sum + row.dicom.length, 0), previewImageUrl: null }] };
  });
  return { patient, studies, catalogSha256: createHash('sha256').update(JSON.stringify(studies)).digest('hex') };
}

function sameStudy(actual, expected) {
  const studyFields = ['studyId', 'patientId', 'sourceHospitalId', 'studyInstanceUid', 'modality', 'bodyPart', 'studyDate', 'description', 'metadataOnly'];
  const seriesFields = ['seriesInstanceUid', 'modality', 'description', 'instanceCount', 'bytes', 'previewImageUrl'];
  return studyFields.every(key => actual[key] === expected[key]) && actual.series?.length === 1 && seriesFields.every(key => actual.series[0][key] === expected.series[0][key]);
}

export function isPhantomCatalogCommitted(store) {
  const data = store.persistedData;
  if (!data?.patients?.some(row => row.patientId === PHANTOM_PATIENT_ID)) return false;
  const expected = phantomCatalog('2026-10-09T00:00:00.000Z');
  return Boolean(data?.patients?.some(row => row.patientId === PHANTOM_PATIENT_ID && row.name === expected.patient.name && row.birthDate === expected.patient.birthDate && row.phone === null) && expected.studies.every(study => data.imagingStudies?.some(row => sameStudy(row, study))));
}

export async function registerPhantomCatalog({ service, principal, input, env, meta = {} }) {
  if (env.HIPASS_CAPSTONE_PHANTOM_CATALOG !== '1' || env.HIPASS_CAPSTONE_MOCK_IDP !== '1' || env.HIPASS_CONTROL_PLANE_ONLY !== '1' || env.HIPASS_STORE !== 'postgres' || env.NODE_ENV !== 'production' || env.AUTH_MODE !== 'TEST') {
    throw new AuthError(404, 'CAPSTONE_PHANTOM_CATALOG_DISABLED');
  }
  if (principal?.role !== PrincipalRole.SECURITY_ADMIN || principal.hospitalId !== 'HOSP-A') throw new AuthError(403, 'SOURCE_CATALOG_ADMIN_REQUIRED');
  if (!input || Object.keys(input).length !== 1 || input.datasetId !== PHANTOM_DATASET_ID) throw new ServiceValidationError('SYNTHETIC_DATASET_REQUIRED', 'Select the predefined synthetic dataset');
  const store = service.store;
  if (typeof store.appendOnlyChanges !== 'function' || store.appendOnlyChanges() === null) throw new ServiceValidationError('CATALOG_APPEND_BASELINE_REQUIRED', 'Catalog registration requires an unchanged persisted baseline', [], 409);
  if (!store.get('hospitals').some(row => row.hospitalId === 'HOSP-A' && row.status === 'ACTIVE')) throw new ServiceValidationError('SOURCE_HOSPITAL_INACTIVE', 'Source institution is unavailable', [], 409);
  const { patient, studies, catalogSha256 } = phantomCatalog(service.clock());
  const existingPatient = store.get('patients').find(row => row.patientId === patient.patientId);
  if (existingPatient && ['name', 'birthDate', 'phone'].some(key => existingPatient[key] !== patient[key])) throw new ServiceValidationError('SYNTHETIC_CATALOG_COLLISION', 'Synthetic catalog conflicts with an existing record', [], 409);
  const additions = [];
  for (const study of studies) {
    const existing = store.get('imagingStudies').filter(row => row.studyId === study.studyId || row.studyInstanceUid === study.studyInstanceUid || row.series?.some(series => series.seriesInstanceUid === study.series[0].seriesInstanceUid));
    if (existing.length && (existing.length !== 1 || !sameStudy(existing[0], study))) throw new ServiceValidationError('SYNTHETIC_CATALOG_COLLISION', 'Synthetic catalog conflicts with an existing record', [], 409);
    if (!existing.length) additions.push(study);
  }
  const auditSessionId = `phantom-catalog-${catalogSha256.slice(0, 16)}`;
  if (!existingPatient) store.get('patients').push(patient);
  store.get('imagingStudies').push(...additions);
  try {
    // The immutable event describes the attempt; transaction acknowledgement
    // below is the registration receipt. A failed save must not leave a false
    // SUCCESS event that a later request could persist.
    await service.writeAudit({ actorType: 'SYSTEM', actorId: principal.actorId ?? meta.actorId, hospitalId: 'HOSP-A', patientId: patient.patientId, auditSessionId, action: 'SYNTHETIC_CATALOG_REGISTRATION_REQUESTED', result: 'REQUESTED', reasonCode: existingPatient && !additions.length ? 'CAPSTONE_CATALOG_ALREADY_REGISTERED' : 'CAPSTONE_FIXED_PHANTOM_METADATA_ONLY', ipAddress: meta.ipAddress, userAgent: meta.userAgent, ja3Fingerprint: meta.ja3Fingerprint });
    // Never let this operator path invoke the legacy full-table rewrite.
    if (store.appendOnlyChanges() === null) throw new ServiceValidationError('CATALOG_APPEND_BASELINE_REQUIRED', 'Catalog registration cannot rewrite existing data', [], 409);
    await store.save();
  } catch (error) {
    if (!isPhantomCatalogCommitted(store)) {
      const ownedIds = new Set(additions.map(row => row.studyId));
      store.set('imagingStudies', store.get('imagingStudies').filter(row => !ownedIds.has(row.studyId)));
      if (!existingPatient) store.set('patients', store.get('patients').filter(row => row.patientId !== PHANTOM_PATIENT_ID));
    }
    // Retain append-only attempt events and any later chain links for diagnosis.
    throw error;
  }
  return { datasetId: PHANTOM_DATASET_ID, patientId: patient.patientId, sourceHospitalId: 'HOSP-A', studyCount: 2, instanceCount: 24, addedStudies: additions.length, catalogSha256, auditSessionId, registrationCommitAcknowledged: true,
    review: 'DRAFT / UNASSIGNED', clinicalUseAllowed: false, consentIssued: false, sourceLiveVerification: 'NOT VERIFIED', v3PatientMapping: 'NOT VERIFIED', dateOfBirth: 'SYNTHETIC_REQUIRED_SCHEMA_PLACEHOLDER' };
}
