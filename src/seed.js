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
        trustedEgressCidrs: ["127.0.0.1/32", "::1/128", "203.250.10.0/24", "10.10.0.0/16"],
        allowIpQuarantine: false,
        emergencyBreakGlassEnabled: true,
      },
      {
        hospitalId: "HOSP-B",
        hospitalName: "가상 병원 B",
        gatewayUrl: "http://localhost:3300/dicomweb",
        status: HospitalStatus.ACTIVE,
        publicKey: "demo-public-key-b",
        trustedEgressCidrs: ["127.0.0.1/32", "::1/128", "203.250.20.0/24", "10.20.0.0/16"],
        allowIpQuarantine: false,
        emergencyBreakGlassEnabled: true,
      },
      {
        hospitalId: "HOSP-C",
        hospitalName: "가상 병원 C",
        gatewayUrl: "http://localhost:3300/dicomweb",
        status: HospitalStatus.ACTIVE,
        publicKey: "demo-public-key-c",
        trustedEgressCidrs: ["127.0.0.1/32", "::1/128", "203.250.30.0/24", "10.30.0.0/16"],
        allowIpQuarantine: false,
        emergencyBreakGlassEnabled: true,
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
        studyId: "STUDY-PHR-A-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.826.0.1.3680043.10.5432.20260908.1001.1",
        modality: "CT",
        bodyPart: "CHEST",
        studyDate: "2026-09-08",
        description: "Synthetic PHR Chest CT",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.826.0.1.3680043.10.5432.20260908.1001.1.1",
            modality: "CT",
            description: "Synthetic PHR Lung Window",
            instanceCount: 1,
            bytes: 4,
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
      {
        studyId: "STUDY-CD-CR-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.200003.1037.1.0.1357867.20070207.152300.80981.1",
        modality: "CR",
        bodyPart: "CHEST",
        studyDate: "2007-02-07",
        description: "Chest PA X-ray (흉부 단순촬영)",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.3.51.5146.12528.20070207.1070304",
            modality: "CR",
            description: "Chest PA 1 (흉부 정면 X-ray)",
            instanceCount: 1,
            bytes: 13_129_286,
            previewImageUrl: "/assets/clinical/cr_chest.jpg",
          },
        ],
      },
      {
        studyId: "STUDY-CD-CT-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.200003.1037.1.0.1357867.20070207.132600.80505.1",
        modality: "CT",
        bodyPart: "ABDOMEN",
        studyDate: "2007-02-07",
        description: "Abdomen Routine CT (복부 3상 단층)",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.3.12.2.1107.5.1.4.50511.30000007020708010365600000031",
            modality: "CT",
            description: "Topogram 1.0 (스카우트 조영)",
            instanceCount: 4,
            bytes: 2_179_120,
            previewImageUrl: "/assets/clinical/ct_abdomen.jpg",
          },
          {
            seriesInstanceUid: "1.3.12.2.1107.5.1.4.50511.30000007020707372101500001681",
            modality: "CT",
            description: "Abd_pre 5.0 (복부 단층 연속스캔)",
            instanceCount: 26,
            bytes: 14_164_320,
            previewImageUrl: "/assets/clinical/ct_abdomen.jpg",
          },
        ],
      },
      {
        studyId: "STUDY-CD-ES-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.200003.77.4.5.20070207.143302",
        modality: "ES",
        bodyPart: "ERCP",
        studyDate: "2007-02-07",
        description: "ERCP Endoscopy (역행성 담췌관 내시경)",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.2.410.200003.77.4.5.20070207.143302.1",
            modality: "ES",
            description: "ERCP Scope (담도 내시경 진단)",
            instanceCount: 10,
            bytes: 8_830_000,
            previewImageUrl: "/assets/clinical/es_ercp.jpg",
          },
        ],
      },
      {
        studyId: "STUDY-CD-US-001",
        patientId: "P-1001",
        sourceHospitalId: "HOSP-A",
        studyInstanceUid: "1.2.410.200003.1037.1.0.1357867.20071129.85500.725157.1",
        modality: "US",
        bodyPart: "ABDOMEN",
        studyDate: "2007-11-29",
        description: "Abdomen Ultrasound (복부 정밀 초음파)",
        metadataOnly: true,
        series: [
          {
            seriesInstanceUid: "1.3.12.2.1107.5.5.2.111491.2.0.4574782022592261",
            modality: "US",
            description: "Abdomen Survey US (복부 초음파 연속프레임)",
            instanceCount: 11,
            bytes: 16_130_000,
            previewImageUrl: "/assets/clinical/us_abdomen.jpg",
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
    ],
    dicomAccessTokenLogs: [],
    transferRequests: [],
    transferTickets: [],
    auditLogs: [],
    transferUsageLogs: [],
    researchExportRequests: [],
    pseudonymMappings: [],
    quarantineRecords: [],
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
