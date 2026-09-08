import { createHash } from "node:crypto";
import { ConsentPurpose, ConsentStatus, GatewayStatus, HospitalStatus, Permission, Role } from "./domain.js";

export function createSeedData() {
  return {
    patients: [
      {
        patientId: "P-1001",
        name: "가상환자-1001",
        birthDate: "1984-03-12",
        phone: null,
        createdAt: "2026-06-01T09:00:00.000Z",
      },
      {
        patientId: "P-1002",
        name: "가상환자-1002",
        birthDate: "1991-11-04",
        phone: null,
        createdAt: "2026-06-01T09:05:00.000Z",
      },
      {
        patientId: "P-1003",
        name: "가상환자-1003",
        birthDate: "1976-08-21",
        phone: null,
        createdAt: "2026-06-01T09:10:00.000Z",
      },
    ],
    hospitals: [
      {
        hospitalId: "HOSP-A",
        hospitalName: "가상 병원 A",
        gatewayUrl: "http://localhost:8042/dicom-web",
        status: HospitalStatus.ACTIVE,
        publicKey: "demo-public-key-a",
      },
      {
        hospitalId: "HOSP-B",
        hospitalName: "가상 병원 B",
        gatewayUrl: "http://localhost:3300/dicomweb",
        status: HospitalStatus.ACTIVE,
        publicKey: "demo-public-key-b",
      },
      {
        hospitalId: "HOSP-C",
        hospitalName: "가상 병원 C",
        gatewayUrl: "http://localhost:3300/dicomweb",
        status: HospitalStatus.ACTIVE,
        publicKey: "demo-public-key-c",
      },
    ],
    gateways: [
      {
        gatewayId: "GW-HOSP-A",
        hospitalId: "HOSP-A",
        gatewayName: "가상 병원 A Gateway",
        dicomwebEndpoint: "http://localhost:8042/dicom-web",
        status: GatewayStatus.ONLINE,
        supportsQido: true,
        supportsWado: true,
        supportsStow: false,
        lastHealthCheckedAt: "2026-06-01T09:20:00.000Z",
      },
      {
        gatewayId: "GW-HOSP-B",
        hospitalId: "HOSP-B",
        gatewayName: "가상 병원 B Gateway",
        dicomwebEndpoint: "http://localhost:3300/dicomweb",
        status: GatewayStatus.ONLINE,
        supportsQido: true,
        supportsWado: true,
        supportsStow: false,
        lastHealthCheckedAt: "2026-06-01T09:20:00.000Z",
      },
      {
        gatewayId: "GW-HOSP-C",
        hospitalId: "HOSP-C",
        gatewayName: "가상 병원 C Gateway",
        dicomwebEndpoint: "http://localhost:3300/dicomweb",
        status: GatewayStatus.DEGRADED,
        supportsQido: true,
        supportsWado: true,
        supportsStow: false,
        lastHealthCheckedAt: "2026-06-01T09:20:00.000Z",
      },
    ],
    doctors: [
      {
        doctorId: "DOC-A-01",
        name: "가상의사-A-01",
        hospitalId: "HOSP-A",
        roles: [Role.DOCTOR],
        approvedPurposes: [ConsentPurpose.TREATMENT, ConsentPurpose.TRANSFER],
      },
      {
        doctorId: "DOC-B-01",
        name: "가상의사-B-01",
        hospitalId: "HOSP-B",
        roles: [Role.DOCTOR],
        approvedPurposes: [ConsentPurpose.TREATMENT, ConsentPurpose.TRANSFER, ConsentPurpose.CONSULTATION],
      },
      {
        doctorId: "DOC-C-01",
        name: "가상의사-C-01",
        hospitalId: "HOSP-C",
        roles: [Role.DOCTOR],
        approvedPurposes: [ConsentPurpose.TREATMENT, ConsentPurpose.CONSULTATION, ConsentPurpose.RESEARCH],
      },
    ],
    imagingStudies: [
      {
        studyId: "STUDY-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.100.1.20260620.001",
        modality: "MR",
        bodyPart: "BRAIN",
        studyDate: "2026-06-20",
        description: "Brain MRI",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
            modality: "MR",
            description: "T1 Axial",
            instanceCount: 64,
            bytes: 76_800_000,
            previewImageUrl: "/assets/demo-mri.png",
          },
          {
            seriesInstanceUid: "1.2.410.100.1.20260620.001.2",
            modality: "MR",
            description: "T2 FLAIR",
            instanceCount: 80,
            bytes: 92_400_000,
            previewImageUrl: "/assets/demo-mri.png",
          },
        ],
      },
      {
        studyId: "STUDY-002",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.100.1.20260518.002",
        modality: "CT",
        bodyPart: "CHEST",
        studyDate: "2026-05-18",
        description: "Chest CT",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.410.100.1.20260518.002.1",
            modality: "CT",
            description: "Lung window",
            instanceCount: 128,
            bytes: 134_217_728,
            previewImageUrl: "/assets/demo-ct.png",
          },
        ],
      },
      {
        studyId: "STUDY-003",
        patientId: "P-1002",
        sourceHospitalId: "HOSP-B",
        studyInstanceUid: "1.2.410.100.2.20260622.003",
        modality: "CR",
        bodyPart: "KNEE",
        studyDate: "2026-06-22",
        description: "Knee X-ray",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.410.100.2.20260622.003.1",
            modality: "CR",
            description: "AP and lateral",
            instanceCount: 2,
            bytes: 18_000_000,
            previewImageUrl: null,
          },
        ],
      },
      {
        studyId: "STUDY-004",
        patientId: "P-1003",
        sourceHospitalId: "HOSP-C",
        studyInstanceUid: "1.2.410.100.3.20260624.004",
        modality: "US",
        bodyPart: "ABDOMEN",
        studyDate: "2026-06-24",
        description: "Abdomen ultrasound",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.410.100.3.20260624.004.1",
            modality: "US",
            description: "Survey",
            instanceCount: 24,
            bytes: 42_000_000,
            previewImageUrl: null,
          },
        ],
      },
    ],
    consents: [
      {
        consentId: "CONSENT-DEMO-ACTIVE",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        targetHospitalId: "HOSP-B",
        purpose: ConsentPurpose.TREATMENT,
        permission: Permission.VIEW_ONLY,
        validFrom: "2026-06-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.000Z",
        status: ConsentStatus.ACTIVE,
        createdAt: "2026-06-01T09:10:00.000Z",
        updatedAt: "2026-06-01T09:10:00.000Z",
        revokedAt: null,
      },
    ],
    consentScopes: [
      {
        scopeId: "SCOPE-DEMO-001",
        consentId: "CONSENT-DEMO-ACTIVE",
        studyInstanceUid: "1.2.410.100.1.20260620.001",
        seriesInstanceUid: null,
        allowed: true,
        createdAt: "2026-06-01T09:10:00.000Z",
      },
      {
        scopeId: "SCOPE-DEMO-002",
        consentId: "CONSENT-DEMO-ACTIVE",
        studyInstanceUid: "1.2.410.100.1.20260518.002",
        seriesInstanceUid: null,
        allowed: true,
        createdAt: "2026-06-01T09:10:00.000Z",
      },
    ],
    dicomAccessTokenLogs: [],
    auditLogs: [],
    transferUsageLogs: [],
    researchExportRequests: [],
    pseudonymMappings: [],
  };
}

export function applyDemoDataMigrations(data) {
  let changed = false;
  const seed = createSeedData();

  for (const key of Object.keys(seed)) {
    if (!Array.isArray(data[key])) {
      data[key] = [];
      changed = true;
    }
  }

  changed = mergeById(data.patients, seed.patients, "patientId") || changed;
  changed = mergeById(data.hospitals, seed.hospitals, "hospitalId") || changed;
  changed = mergeById(data.gateways, seed.gateways, "gatewayId") || changed;
  changed = mergeById(data.doctors, seed.doctors, "doctorId") || changed;
  changed = mergeStudies(data.imagingStudies, seed.imagingStudies) || changed;
  changed = mergeById(data.consents, seed.consents, "consentId") || changed;
  changed = mergeById(data.consentScopes, seed.consentScopes, "scopeId") || changed;

  for (const token of data.dicomAccessTokenLogs) {
    if (!token.tokenHash && token.token) {
      token.tokenHash = token.token.startsWith("sha256:")
        ? token.token
        : `sha256:${createHash("sha256").update(token.token).digest("hex")}`;
      changed = true;
    }
    if (Object.hasOwn(token, "token")) {
      delete token.token;
      changed = true;
    }
    if (!token.jti) {
      token.jti = token.tokenId;
      changed = true;
    }
    if (!token.issuer) {
      token.issuer = "highpass-control-plane";
      changed = true;
    }
    if (!token.audience) {
      token.audience = "highpass-dicomweb-gateway";
      changed = true;
    }
  }

  return changed;
}

function mergeById(target, seedRows, key) {
  let changed = false;
  for (const seedRow of seedRows) {
    const existing = target.find((item) => item[key] === seedRow[key]);
    if (!existing) {
      target.push(seedRow);
      changed = true;
      continue;
    }

    for (const [field, value] of Object.entries(seedRow)) {
      if (field === key) continue;
      if (JSON.stringify(existing[field]) !== JSON.stringify(value)) {
        existing[field] = value;
        changed = true;
      }
    }
  }
  return changed;
}

function mergeStudies(target, seedStudies) {
  let changed = false;
  for (const seedStudy of seedStudies) {
    const existing = target.find((study) => study.studyId === seedStudy.studyId);
    if (!existing) {
      target.push(seedStudy);
      changed = true;
      continue;
    }

    const { series: seedSeries, ...seedMetadata } = seedStudy;
    for (const [field, value] of Object.entries(seedMetadata)) {
      if (JSON.stringify(existing[field]) !== JSON.stringify(value)) {
        existing[field] = value;
        changed = true;
      }
    }

    existing.series ??= [];
    changed = mergeById(existing.series, seedSeries, "seriesInstanceUid") || changed;
  }
  return changed;
}
