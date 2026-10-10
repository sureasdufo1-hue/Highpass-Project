import { createHash } from 'node:crypto';
import { AuthError, PrincipalRole } from './auth.js';
import { ServiceValidationError } from './services.js';

// Pinned, fixed synthetic dataset. The canonical source manifest lives in the
// ignored generated artifact directory and its SHA is recorded in the report.
// No patient names, UIDs, endpoints, or DICOM bytes are accepted from requests.
export const HCC_DATASET_ID = 'SYNTHETIC_HONG_GILDONG_56_CT_20261010_V1';
export const HCC_PATIENT_ID = 'MEDIQ-SYN-HCC-001';
export const HCC_PATIENT_NAME = 'SYNTHETIC^HCC_TEST_001';
export const HCC_PATIENT_SUBJECT = 'synthetic-hcc-account';
export const HCC_STUDY_UID = '2.25.38106223936879966147659064930718777634';
export const HCC_MANIFEST_SHA256 = 'b10cf668a6c659a680810904db08ecf8b525faf2ab7af9d849c6f4849567a345';
export const HCC_PRESENTATION = Object.freeze({ id: 'HONG_GILDONG_SYNTHETIC_56', patientName: '홍길동', age: 56,
  sourceHospitalName: 'A대학병원', targetHospitalName: 'B대학병원', examName: '다중시기 복부 CT',
  referralSummary: 'A대학병원에서 CT 촬영과 간암 진단을 받은 후 B대학병원으로 전원합니다.',
  diagnosisOrigin: '발표용 가상 설정', synthetic: true });

const fixedSeries = Object.freeze([
  Object.freeze({ seriesInstanceUid: '2.25.32969304778252121706756386019212570354', modality: 'CT', description: '01_SYNTH_NONCONTRAST', instanceCount: 180, bytes: 94668690, previewImageUrl: null }),
  Object.freeze({ seriesInstanceUid: '2.25.167780987260483359521907385468275146899', modality: 'CT', description: '02_SYNTH_ARTERIAL', instanceCount: 180, bytes: 94668322, previewImageUrl: null }),
  Object.freeze({ seriesInstanceUid: '2.25.2662954792064114093284338729050880958', modality: 'CT', description: '03_SYNTH_PORTAL', instanceCount: 180, bytes: 94667594, previewImageUrl: null }),
  Object.freeze({ seriesInstanceUid: '2.25.310701589337309478503237835611655286208', modality: 'CT', description: '04_SYNTH_DELAYED', instanceCount: 180, bytes: 94667970, previewImageUrl: null }),
]);

const tag = (row, id) => row?.[id]?.Value?.[0];
const equalSeries = (actual = [], expected = fixedSeries) => actual.length === expected.length
  && expected.every(wanted => {
    const found = actual.find(row => row.seriesInstanceUid === wanted.seriesInstanceUid);
    return Boolean(found && ['modality', 'description', 'instanceCount', 'bytes', 'previewImageUrl'].every(key => found[key] === wanted[key]));
  });

export function hccCatalog(createdAt) {
  const patient = { patientId: HCC_PATIENT_ID, name: '홍길동 (합성 환자)', birthDate: '1970-01-01', phone: null, createdAt };
  const study = {
    studyId: 'HP-SYN-HCC-CT-20261010-001', patientId: patient.patientId, sourceHospitalId: 'HOSP-A',
    studyInstanceUid: HCC_STUDY_UID, modality: 'CT', bodyPart: 'ABDOMEN', studyDate: '2026-10-10',
    description: '다중시기 복부 CT · 합성 영상', metadataOnly: false,
    series: fixedSeries.map(row => ({ ...row })),
  };
  const catalogSha256 = createHash('sha256').update(JSON.stringify({ manifestSha256: HCC_MANIFEST_SHA256, patient, study })).digest('hex');
  return { patient, studies: [study], catalogSha256, manifestSha256: HCC_MANIFEST_SHA256 };
}

function sameStudy(actual, expected) {
  const studyFields = ['studyId', 'patientId', 'sourceHospitalId', 'studyInstanceUid', 'modality', 'bodyPart', 'studyDate', 'description', 'metadataOnly'];
  return studyFields.every(key => actual[key] === expected[key]) && equalSeries(actual.series, expected.series);
}

export function isHccCatalogCommitted(store) {
  const data = store.persistedData;
  if (!data?.patients?.some(row => row.patientId === HCC_PATIENT_ID)) return false;
  const expected = hccCatalog('2026-10-10T00:00:00.000Z');
  return Boolean(data.patients.some(row => row.patientId === HCC_PATIENT_ID
    && row.name === expected.patient.name && row.birthDate === expected.patient.birthDate && row.phone === null)
    && expected.studies.every(study => data.imagingStudies?.some(row => sameStudy(row, study))));
}

export async function verifyHccSourceStudy(orthanc) {
  if (typeof orthanc?.qidoStudies !== 'function' || typeof orthanc?.qidoSeries !== 'function' || typeof orthanc?.qidoInstances !== 'function') {
    throw new ServiceValidationError('SOURCE_DATASET_NOT_READY', 'The fixed synthetic source dataset is unavailable', [], 409);
  }
  let studies;
  try {
    const result = await orthanc.qidoStudies(HCC_STUDY_UID);
    studies = result?.status === 200 ? result.body : null;
  } catch { studies = null; }
  if (!Array.isArray(studies) || studies.length !== 1 || tag(studies[0], '0020000D') !== HCC_STUDY_UID
    || tag(studies[0], '00100020') !== HCC_PATIENT_ID || tag(studies[0], '00100010') !== HCC_PATIENT_NAME
    || tag(studies[0], '00080020') !== '20261010'
    || tag(studies[0], '00081030') !== 'SYNTHETIC HCC MIMIC - NOT FOR CLINICAL USE') {
    throw new ServiceValidationError('SOURCE_DATASET_NOT_READY', 'The fixed synthetic source dataset is unavailable', [], 409);
  }
  let series;
  try {
    const result = await orthanc.qidoSeries(HCC_STUDY_UID);
    series = result?.status === 200 ? result.body : null;
  } catch { series = null; }
  const expectedUids = new Set(fixedSeries.map(row => row.seriesInstanceUid));
  if (!Array.isArray(series) || series.length !== fixedSeries.length
    || series.some(row => {
      const expected = fixedSeries.find(item => item.seriesInstanceUid === tag(row, '0020000E'));
      return tag(row, '0020000D') !== HCC_STUDY_UID || !expected || !expectedUids.has(tag(row, '0020000E'))
        || tag(row, '00080060') !== 'CT' || tag(row, '0008103E') !== expected.description;
    })
    || new Set(series.map(row => tag(row, '0020000E'))).size !== fixedSeries.length) {
    throw new ServiceValidationError('SOURCE_DATASET_NOT_READY', 'The fixed synthetic source dataset is unavailable', [], 409);
  }
  for (const row of fixedSeries) {
    let instances;
    try {
      const result = await orthanc.qidoInstances(HCC_STUDY_UID, row.seriesInstanceUid);
      instances = result?.status === 200 ? result.body : null;
    } catch { instances = null; }
    const instanceUids = Array.isArray(instances) ? instances.map(item => tag(item, '00080018')) : [];
    if (!Array.isArray(instances) || instances.length !== row.instanceCount || new Set(instanceUids).size !== row.instanceCount
      || instances.some(item => tag(item, '0020000D') !== HCC_STUDY_UID || tag(item, '0020000E') !== row.seriesInstanceUid
        || typeof tag(item, '00080018') !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/.test(tag(item, '00080018')))) {
      throw new ServiceValidationError('SOURCE_DATASET_NOT_READY', 'The fixed synthetic source dataset is unavailable', [], 409);
    }
  }
  return { studyCount: 1, seriesCount: fixedSeries.length, instanceCount: fixedSeries.reduce((sum, row) => sum + row.instanceCount, 0), verification: 'ORTHANC_QIDO_COUNTS_ONLY' };
}

export async function registerHccCatalog({ service, principal, input, env, meta = {} }) {
  if (env.HIPASS_CAPSTONE_HCC_CATALOG !== '1' || env.HIPASS_CAPSTONE_MOCK_IDP !== '1' || env.HIPASS_CONTROL_PLANE_ONLY !== '1'
    || env.HIPASS_STORE !== 'postgres' || env.NODE_ENV !== 'production' || env.AUTH_MODE !== 'TEST') {
    throw new AuthError(404, 'CAPSTONE_HCC_CATALOG_DISABLED');
  }
  if (principal?.role !== PrincipalRole.SECURITY_ADMIN || principal.hospitalId !== 'HOSP-A') throw new AuthError(403, 'SOURCE_CATALOG_ADMIN_REQUIRED');
  if (!input || Object.keys(input).length !== 1 || input.datasetId !== HCC_DATASET_ID) {
    throw new ServiceValidationError('SYNTHETIC_DATASET_REQUIRED', 'Select the predefined synthetic dataset');
  }
  const source = await verifyHccSourceStudy(service.orthanc);
  const store = service.store;
  if (typeof store.appendOnlyChanges !== 'function' || store.appendOnlyChanges() === null) {
    throw new ServiceValidationError('CATALOG_APPEND_BASELINE_REQUIRED', 'Catalog registration requires an unchanged persisted baseline', [], 409);
  }
  if (!store.get('hospitals').some(row => row.hospitalId === 'HOSP-A' && row.status === 'ACTIVE')) {
    throw new ServiceValidationError('SOURCE_HOSPITAL_INACTIVE', 'Source institution is unavailable', [], 409);
  }
  const { patient, studies, catalogSha256 } = hccCatalog(service.clock());
  const existingPatient = store.get('patients').find(row => row.patientId === patient.patientId);
  if (existingPatient && ['name', 'birthDate', 'phone'].some(key => existingPatient[key] !== patient[key])) {
    throw new ServiceValidationError('SYNTHETIC_CATALOG_COLLISION', 'Synthetic catalog conflicts with an existing record', [], 409);
  }
  const expected = studies[0];
  const existing = store.get('imagingStudies').filter(row => row.studyId === expected.studyId || row.studyInstanceUid === expected.studyInstanceUid
    || row.series?.some(series => expected.series.some(wanted => wanted.seriesInstanceUid === series.seriesInstanceUid)));
  if (existing.length && (existing.length !== 1 || !sameStudy(existing[0], expected))) {
    throw new ServiceValidationError('SYNTHETIC_CATALOG_COLLISION', 'Synthetic catalog conflicts with an existing record', [], 409);
  }
  const additions = existing.length ? [] : studies;
  const auditSessionId = `synthetic-hcc-catalog-${catalogSha256.slice(0, 16)}`;
  if (!existingPatient) store.get('patients').push(patient);
  store.get('imagingStudies').push(...additions);
  try {
    await service.writeAudit({ actorType: 'SYSTEM', actorId: principal.actorId ?? meta.actorId, hospitalId: 'HOSP-A', patientId: patient.patientId,
      auditSessionId, action: 'SYNTHETIC_CATALOG_REGISTRATION_REQUESTED', result: 'REQUESTED', reasonCode: existingPatient && !additions.length
        ? 'CAPSTONE_HCC_CATALOG_ALREADY_REGISTERED' : 'CAPSTONE_FIXED_HCC_SYNTHETIC_METADATA', ipAddress: meta.ipAddress,
      userAgent: meta.userAgent, ja3Fingerprint: meta.ja3Fingerprint });
    if (store.appendOnlyChanges() === null) throw new ServiceValidationError('CATALOG_APPEND_BASELINE_REQUIRED', 'Catalog registration cannot rewrite existing data', [], 409);
    await store.save();
  } catch (error) {
    if (!isHccCatalogCommitted(store)) {
      const ownedIds = new Set(additions.map(row => row.studyId));
      store.set('imagingStudies', store.get('imagingStudies').filter(row => !ownedIds.has(row.studyId)));
      if (!existingPatient) store.set('patients', store.get('patients').filter(row => row.patientId !== HCC_PATIENT_ID));
    }
    throw error;
  }
  return { datasetId: HCC_DATASET_ID, patientId: patient.patientId, sourceHospitalId: 'HOSP-A', studyCount: 1,
    seriesCount: source.seriesCount, instanceCount: source.instanceCount, addedStudies: additions.length, catalogSha256,
    sourceVerification: source.verification, manifestSha256: HCC_MANIFEST_SHA256, auditSessionId,
    registrationCommitAcknowledged: true, review: 'DRAFT / UNASSIGNED', clinicalUseAllowed: false,
    clinicalDiagnosis: 'NOT CLAIMED', consentIssued: false, patientOwnership: 'NOT VERIFIED' };
}
