import { applyDemoDataMigrations, createSeedData } from "./seed.js";

const tableOrder = [
  "patients",
  "hospitals",
  "gateways",
  "doctors",
  "imagingStudies",
  "series",
  "consents",
  "consentScopes",
  "transferRequests",
  "transferTickets",
  "dicomAccessTokenLogs",
  "auditLogs",
  "transferUsageLogs",
  "researchExportRequests",
  "pseudonymMappings",
];

export class PostgresStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when HIPASS_STORE=postgres");
    }
    this.connectionString = connectionString;
    this.client = null;
    this.data = null;
    this.persistedData = null;
    this.saveQueue = Promise.resolve();
  }

  async load() {
    const { Client } = await import("pg");
    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();
    await this.ensureSchema();

    this.data = await this.readAll();
    this.persistedData = structuredClone(this.data);
    if (this.data.patients.length === 0) {
      this.data = createSeedData();
      this.persistedData = null;
      await this.save();
    } else if (applyDemoDataMigrations(this.data)) {
      await this.save();
    }
    return this.data;
  }

  get collectionNames() {
    return Object.keys(this.data ?? {});
  }

  get(name) {
    if (!this.data) throw new Error("Store is not loaded");
    return this.data[name];
  }

  set(name, value) {
    if (!this.data) throw new Error("Store is not loaded");
    this.data[name] = value;
  }

  async health() {
    await this.client.query("SELECT 1");
    return { database: "UP" };
  }

  async save() {
    this.saveQueue = this.saveQueue.then(() => this.saveNow(), () => this.saveNow());
    return this.saveQueue;
  }

  async saveNow() {
    normalizeStoreData(this.data);
    const appendChanges = this.appendOnlyChanges();
    if (appendChanges) {
      await this.saveAppendOnly(appendChanges);
      this.persistedData = structuredClone(this.data);
      return;
    }
    await this.client.query("BEGIN");
    try {
      await this.client.query(`
        TRUNCATE
          transfer_tickets,
          transfer_requests,
          pseudonym_mappings,
          research_export_requests,
          transfer_usage_logs,
          audit_logs,
          dicom_access_token_logs,
          consent_scopes,
          consents,
          imaging_series,
          imaging_studies,
          gateways,
          doctors,
          hospitals,
          patients
        RESTART IDENTITY
        CASCADE
      `);

      await this.insertPatients(this.data.patients);
      await this.insertHospitals(this.data.hospitals);
      await this.insertGateways(this.data.gateways);
      await this.insertDoctors(this.data.doctors);
      await this.insertStudies(this.data.imagingStudies);
      await this.insertConsents(this.data.consents);
      await this.insertConsentScopes(this.data.consentScopes);
      await this.insertTransferRequests(this.data.transferRequests);
      await this.insertTransferTickets(this.data.transferTickets);
      await this.insertTokenLogs(this.data.dicomAccessTokenLogs);
      await this.insertAuditLogs(this.data.auditLogs);
      await this.insertTransferUsageLogs(this.data.transferUsageLogs);
      await this.insertResearchExportRequests(this.data.researchExportRequests);
      await this.insertPseudonymMappings(this.data.pseudonymMappings);
      await this.client.query("COMMIT");
      this.persistedData = structuredClone(this.data);
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  appendOnlyChanges() {
    if (!this.persistedData) return null;
    const appendable = new Map([
      ["consents", "consentId"],
      ["consentScopes", "scopeId"],
      ["transferTickets", "ticketId"],
      ["transferRequests", "requestId"],
      ["dicomAccessTokenLogs", "tokenId"],
      ["auditLogs", "auditId"],
      ["transferUsageLogs", "usageId"],
      ["researchExportRequests", "requestId"],
      ["pseudonymMappings", "mappingId"],
    ]);
    const changes = {};
    for (const name of this.collectionNames) {
      const current = this.data[name] ?? [];
      const previous = this.persistedData[name] ?? [];
      if (!appendable.has(name)) {
        if (JSON.stringify(current) !== JSON.stringify(previous)) return null;
        continue;
      }
      if (current.length < previous.length) return null;
      const key = appendable.get(name);
      for (let index = 0; index < previous.length; index += 1) {
        if (current[index]?.[key] !== previous[index]?.[key] || JSON.stringify(current[index]) !== JSON.stringify(previous[index])) return null;
      }
      changes[name] = current.slice(previous.length);
    }
    return changes;
  }

  async saveAppendOnly(changes) {
    await this.client.query("BEGIN");
    try {
      await this.insertConsents(changes.consents);
      await this.insertConsentScopes(changes.consentScopes);
      await this.insertTransferRequests(changes.transferRequests);
      await this.insertTransferTickets(changes.transferTickets);
      await this.insertTokenLogs(changes.dicomAccessTokenLogs);
      await this.insertAuditLogs(changes.auditLogs);
      await this.insertTransferUsageLogs(changes.transferUsageLogs);
      await this.insertResearchExportRequests(changes.researchExportRequests);
      await this.insertPseudonymMappings(changes.pseudonymMappings);
      await this.client.query("COMMIT");
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async close() {
    await this.client?.end();
  }

  async ensureSchema() {
    await this.client.query(schemaSql);
  }

  async readAll() {
    const patients = await this.readTable("patients");
    const hospitals = await this.readTable("hospitals");
    const gateways = await this.readTable("gateways");
    const doctors = await this.readTable("doctors");
    const studies = await this.readTable("imagingStudies");
    const seriesRows = await this.readTable("series");
    const consents = await this.readTable("consents");
    const consentScopes = await this.readTable("consentScopes");
    const transferRequests = await this.readTable("transferRequests");
    const transferTickets = await this.readTable("transferTickets");
    const tokenLogs = await this.readTable("dicomAccessTokenLogs");
    const auditLogs = await this.readTable("auditLogs");
    const transferUsageLogs = await this.readTable("transferUsageLogs");
    const researchExportRequests = await this.readTable("researchExportRequests");
    const pseudonymMappings = await this.readTable("pseudonymMappings");

    const seriesByStudyUid = groupBy(seriesRows, "studyInstanceUid");
    return {
      patients,
      hospitals,
      gateways,
      doctors,
      imagingStudies: studies.map((study) => ({
        ...study,
        series: seriesByStudyUid.get(study.studyInstanceUid) ?? [],
      })),
      consents,
      consentScopes,
      transferRequests,
      transferTickets,
      dicomAccessTokenLogs: tokenLogs,
      auditLogs,
      transferUsageLogs,
      researchExportRequests,
      pseudonymMappings,
    };
  }

  async readTable(name) {
    const readers = {
      patients: () => this.client.query("SELECT * FROM patients ORDER BY patient_id"),
      hospitals: () => this.client.query("SELECT * FROM hospitals ORDER BY hospital_id"),
      gateways: () => this.client.query("SELECT * FROM gateways ORDER BY gateway_id"),
      doctors: () => this.client.query("SELECT * FROM doctors ORDER BY doctor_id"),
      imagingStudies: () => this.client.query("SELECT * FROM imaging_studies ORDER BY study_id"),
      series: () => this.client.query("SELECT * FROM imaging_series ORDER BY series_instance_uid"),
      consents: () => this.client.query("SELECT * FROM consents ORDER BY created_at, consent_id"),
      consentScopes: () => this.client.query("SELECT * FROM consent_scopes ORDER BY scope_id"),
      transferRequests: () => this.client.query("SELECT * FROM transfer_requests ORDER BY created_at, request_id"),
      transferTickets: () => this.client.query("SELECT * FROM transfer_tickets ORDER BY issued_at, ticket_id"),
      dicomAccessTokenLogs: () => this.client.query("SELECT * FROM dicom_access_token_logs ORDER BY issued_at, token_id"),
      auditLogs: () => this.client.query("SELECT * FROM audit_logs ORDER BY created_at, audit_id"),
      transferUsageLogs: () => this.client.query("SELECT * FROM transfer_usage_logs ORDER BY transfer_started_at, usage_id"),
      researchExportRequests: () => this.client.query("SELECT * FROM research_export_requests ORDER BY requested_at, request_id"),
      pseudonymMappings: () => this.client.query("SELECT * FROM pseudonym_mappings ORDER BY created_at, mapping_id"),
    };
    const result = await readers[name]();
    return result.rows.map((row) => rowMappers[name](row));
  }

  async insertPatients(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO patients (patient_id, name, birth_date, phone, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.patientId, row.name, row.birthDate, row.phone, row.createdAt],
      );
    }
  }

  async insertHospitals(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO hospitals (hospital_id, hospital_name, gateway_url, status, public_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.hospitalId, row.hospitalName, row.gatewayUrl, row.status, row.publicKey],
      );
    }
  }

  async insertGateways(rows) {
    for (const row of rows ?? []) {
      await this.client.query(
        `INSERT INTO gateways (
           gateway_id, hospital_id, gateway_name, dicomweb_endpoint, status,
           supports_qido, supports_wado, supports_stow, last_health_checked_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.gatewayId,
          row.hospitalId,
          row.gatewayName,
          row.dicomwebEndpoint,
          row.status,
          row.supportsQido,
          row.supportsWado,
          row.supportsStow,
          row.lastHealthCheckedAt,
        ],
      );
    }
  }

  async insertDoctors(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO doctors (doctor_id, name, hospital_id, roles, approved_purposes)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.doctorId, row.name, row.hospitalId, row.roles, row.approvedPurposes],
      );
    }
  }

  async insertStudies(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO imaging_studies (
           study_id, patient_id, source_hospital_id, study_instance_uid, modality,
           body_part, study_date, description, metadata_only
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.studyId,
          row.patientId,
          row.sourceHospitalId,
          row.studyInstanceUid,
          row.modality,
          row.bodyPart,
          row.studyDate,
          row.description,
          row.metadataOnly,
        ],
      );

      for (const series of row.series ?? []) {
        await this.client.query(
          `INSERT INTO imaging_series (
             study_instance_uid, series_instance_uid, modality, description, instance_count, bytes, preview_image_url
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            row.studyInstanceUid,
            series.seriesInstanceUid,
            series.modality,
            series.description,
            series.instanceCount,
            series.bytes,
            series.previewImageUrl ?? null,
          ],
        );
      }
    }
  }

  async insertConsents(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO consents (
           consent_id, patient_id, source_hospital_id, target_hospital_id, purpose,
           permission, valid_from, valid_until, status, created_at, updated_at, revoked_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.consentId,
          row.patientId,
          row.sourceHospitalId ?? null,
          row.targetHospitalId ?? null,
          row.purpose,
          row.permission,
          row.validFrom,
          row.validUntil,
          row.status,
          row.createdAt,
          row.updatedAt ?? row.createdAt,
          row.revokedAt ?? null,
        ],
      );
    }
  }

  async insertConsentScopes(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO consent_scopes (
           scope_id, consent_id, study_instance_uid, series_instance_uid, allowed, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.scopeId, row.consentId, row.studyInstanceUid, row.seriesInstanceUid, row.allowed, row.createdAt],
      );
    }
  }

  async insertTransferRequests(rows) {
    for (const row of rows ?? []) {
      await this.client.query(
        `INSERT INTO transfer_requests (
           request_id, requester_doctor_id, patient_id, source_hospital_id, target_hospital_id,
           purpose, permission, scopes, status, consent_id, ticket_id, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
        [
          row.requestId,
          row.requesterDoctorId,
          row.patientId,
          row.sourceHospitalId,
          row.targetHospitalId,
          row.purpose,
          row.permission,
          JSON.stringify(row.scopes ?? []),
          row.status,
          row.consentId ?? null,
          row.ticketId ?? null,
          row.createdAt,
          row.updatedAt ?? row.createdAt,
        ],
      );
    }
  }

  async insertTransferTickets(rows) {
    for (const row of rows ?? []) {
      await this.client.query(
        `INSERT INTO transfer_tickets (
           ticket_id, request_id, consent_id, patient_id, source_hospital_id, target_hospital_id,
           purpose, permission, allowed_study_uids, allowed_series_uids, nonce_hash, status,
           audit_session_id, issued_at, expires_at, used_at, revoked_at, redeemed_doctor_id, redeemed_hospital_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          row.ticketId,
          row.requestId,
          row.consentId,
          row.patientId,
          row.sourceHospitalId,
          row.targetHospitalId,
          row.purpose,
          row.permission,
          JSON.stringify(row.allowedStudyUids ?? []),
          JSON.stringify(row.allowedSeriesUids ?? []),
          row.nonceHash,
          row.status,
          row.auditSessionId,
          row.issuedAt,
          row.expiresAt,
          row.usedAt ?? null,
          row.revokedAt ?? null,
          row.redeemedDoctorId ?? null,
          row.redeemedHospitalId ?? null,
        ],
      );
    }
  }

  async insertTokenLogs(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO dicom_access_token_logs (
           token_id, token_hash, jti, issuer, audience, scope, audit_session_id, consent_id, doctor_id, target_hospital_id,
           study_instance_uid, series_instance_uid, allowed_series_uids, permission, purpose,
           issued_at, expires_at, status
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, $18)`,
        [
          row.tokenId,
          row.tokenHash,
          row.jti ?? row.tokenId,
          row.issuer,
          row.audience,
          JSON.stringify(row.scope ?? {}),
          row.auditSessionId ?? null,
          row.consentId,
          row.doctorId,
          row.targetHospitalId,
          row.studyInstanceUid ?? null,
          row.seriesInstanceUid ?? null,
          JSON.stringify(row.allowedSeriesUids ?? []),
          row.permission ?? null,
          row.purpose ?? null,
          row.issuedAt,
          row.expiresAt,
          row.status,
        ],
      );
    }
  }

  async insertAuditLogs(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO audit_logs (
           audit_id, audit_session_id, actor_type, actor_id, hospital_id, patient_id, consent_id, ticket_id,
           source_hospital_id, target_hospital_id, action, study_instance_uid, series_instance_uid,
           sop_instance_uid, ip_address, user_agent, created_at, result, reason, reason_code,
           previous_hash, record_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          row.auditId,
          row.auditSessionId,
          row.actorType,
          row.actorId,
          row.hospitalId ?? null,
          row.patientId ?? null,
          row.consentId ?? null,
          row.ticketId ?? null,
          row.sourceHospitalId,
          row.targetHospitalId,
          row.action,
          row.studyInstanceUid,
          row.seriesInstanceUid,
          row.sopInstanceUid ?? null,
          row.ipAddress ?? null,
          row.userAgent ?? null,
          row.createdAt,
          row.result,
          row.reason ?? null,
          row.reasonCode ?? row.reason ?? null,
          row.previousHash ?? null,
          row.recordHash ?? null,
        ],
      );
    }
  }

  async insertTransferUsageLogs(rows) {
    for (const row of rows) {
      await this.client.query(
        `INSERT INTO transfer_usage_logs (
           usage_id, audit_session_id, source_hospital_id, target_hospital_id,
           study_instance_uid, series_instance_uid, sop_instance_uid, bytes_transferred,
           transfer_started_at, transfer_finished_at, transfer_mode, estimated_cost
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.usageId,
          row.auditSessionId,
          row.sourceHospitalId,
          row.targetHospitalId,
          row.studyInstanceUid,
          row.seriesInstanceUid,
          row.sopInstanceUid ?? null,
          row.bytesTransferred,
          row.transferStartedAt,
          row.transferFinishedAt,
          row.transferMode,
          row.estimatedCost,
        ],
      );
    }
  }

  async insertResearchExportRequests(rows) {
    for (const row of rows ?? []) {
      await this.client.query(
        `INSERT INTO research_export_requests (
           request_id, requester_id, approver_id, dataset_id, study_instance_uid,
           series_instance_uid, purpose, status, high_risk_image, release_decision,
           release_reason, requested_at, decided_at, exported_at, decision_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          row.requestId,
          row.requesterId,
          row.approverId ?? null,
          row.datasetId,
          row.studyInstanceUid,
          row.seriesInstanceUid ?? null,
          row.purpose,
          row.status,
          row.highRiskImage ?? false,
          row.releaseDecision ?? null,
          row.releaseReason ?? null,
          row.requestedAt,
          row.decidedAt ?? null,
          row.exportedAt ?? null,
          row.decisionReason ?? null,
        ],
      );
    }
  }

  async insertPseudonymMappings(rows) {
    for (const row of rows ?? []) {
      await this.client.query(
        `INSERT INTO pseudonym_mappings (
           mapping_id, patient_id, study_instance_uid, pseudonym_id, protected_patient_ref, key_provider, key_id, created_at, protection
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.mappingId,
          row.patientId,
          row.studyInstanceUid,
          row.pseudonymId,
          row.protectedPatientRef ?? null,
          row.keyProvider ?? null,
          row.keyId ?? null,
          row.createdAt,
          row.protection,
        ],
      );
    }
  }
}

const rowMappers = {
  patients: (row) => ({
    patientId: row.patient_id,
    name: row.name,
    birthDate: toDateString(row.birth_date),
    phone: row.phone,
    createdAt: toIsoString(row.created_at),
  }),
  hospitals: (row) => ({
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name,
    gatewayUrl: row.gateway_url,
    status: row.status,
    publicKey: row.public_key,
  }),
  gateways: (row) => ({
    gatewayId: row.gateway_id,
    hospitalId: row.hospital_id,
    gatewayName: row.gateway_name,
    dicomwebEndpoint: row.dicomweb_endpoint,
    status: row.status,
    supportsQido: row.supports_qido,
    supportsWado: row.supports_wado,
    supportsStow: row.supports_stow,
    lastHealthCheckedAt: toIsoString(row.last_health_checked_at),
  }),
  doctors: (row) => ({
    doctorId: row.doctor_id,
    name: row.name,
    hospitalId: row.hospital_id,
    roles: row.roles,
    approvedPurposes: row.approved_purposes,
  }),
  imagingStudies: (row) => ({
    studyId: row.study_id,
    patientId: row.patient_id,
    sourceHospitalId: row.source_hospital_id,
    studyInstanceUid: row.study_instance_uid,
    modality: row.modality,
    bodyPart: row.body_part,
    studyDate: toDateString(row.study_date),
    description: row.description,
    metadataOnly: row.metadata_only,
  }),
  series: (row) => ({
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    modality: row.modality,
    description: row.description,
    instanceCount: Number(row.instance_count),
    bytes: Number(row.bytes),
    previewImageUrl: row.preview_image_url,
  }),
  consents: (row) => ({
    consentId: row.consent_id,
    patientId: row.patient_id,
    sourceHospitalId: row.source_hospital_id,
    targetHospitalId: row.target_hospital_id,
    purpose: row.purpose,
    permission: row.permission,
    validFrom: toIsoString(row.valid_from),
    validUntil: toIsoString(row.valid_until),
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    revokedAt: toIsoString(row.revoked_at),
  }),
  consentScopes: (row) => ({
    scopeId: row.scope_id,
    consentId: row.consent_id,
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    allowed: row.allowed,
    createdAt: toIsoString(row.created_at),
  }),
  transferRequests: (row) => ({
    requestId: row.request_id,
    requesterDoctorId: row.requester_doctor_id,
    patientId: row.patient_id,
    sourceHospitalId: row.source_hospital_id,
    targetHospitalId: row.target_hospital_id,
    purpose: row.purpose,
    permission: row.permission,
    scopes: row.scopes ?? [],
    status: row.status,
    consentId: row.consent_id,
    ticketId: row.ticket_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }),
  transferTickets: (row) => ({
    ticketId: row.ticket_id,
    requestId: row.request_id,
    consentId: row.consent_id,
    patientId: row.patient_id,
    sourceHospitalId: row.source_hospital_id,
    targetHospitalId: row.target_hospital_id,
    purpose: row.purpose,
    permission: row.permission,
    allowedStudyUids: row.allowed_study_uids ?? [],
    allowedSeriesUids: row.allowed_series_uids ?? [],
    nonceHash: row.nonce_hash,
    status: row.status,
    auditSessionId: row.audit_session_id,
    issuedAt: toIsoString(row.issued_at),
    expiresAt: toIsoString(row.expires_at),
    usedAt: toIsoString(row.used_at),
    revokedAt: toIsoString(row.revoked_at),
    redeemedDoctorId: row.redeemed_doctor_id,
    redeemedHospitalId: row.redeemed_hospital_id,
  }),
  dicomAccessTokenLogs: (row) => ({
    tokenId: row.token_id,
    tokenHash: row.token_hash,
    jti: row.jti,
    issuer: row.issuer,
    audience: row.audience,
    scope: row.scope ?? {},
    auditSessionId: row.audit_session_id,
    consentId: row.consent_id,
    doctorId: row.doctor_id,
    targetHospitalId: row.target_hospital_id,
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    allowedSeriesUids: row.allowed_series_uids ?? [],
    permission: row.permission,
    purpose: row.purpose,
    issuedAt: toIsoString(row.issued_at),
    expiresAt: toIsoString(row.expires_at),
    status: row.status,
  }),
  auditLogs: (row) => ({
    auditId: row.audit_id,
    auditSessionId: row.audit_session_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    consentId: row.consent_id,
    ticketId: row.ticket_id,
    sourceHospitalId: row.source_hospital_id,
    targetHospitalId: row.target_hospital_id,
    action: row.action,
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    sopInstanceUid: row.sop_instance_uid,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: toIsoString(row.created_at),
    result: row.result,
    reason: row.reason,
    reasonCode: row.reason_code ?? row.reason,
    previousHash: row.previous_hash,
    recordHash: row.record_hash,
  }),
  transferUsageLogs: (row) => ({
    usageId: row.usage_id,
    auditSessionId: row.audit_session_id,
    sourceHospitalId: row.source_hospital_id,
    targetHospitalId: row.target_hospital_id,
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    sopInstanceUid: row.sop_instance_uid,
    bytesTransferred: Number(row.bytes_transferred),
    transferStartedAt: toIsoString(row.transfer_started_at),
    transferFinishedAt: toIsoString(row.transfer_finished_at),
    transferMode: row.transfer_mode,
    estimatedCost: Number(row.estimated_cost),
  }),
  researchExportRequests: (row) => ({
    requestId: row.request_id,
    requesterId: row.requester_id,
    approverId: row.approver_id,
    datasetId: row.dataset_id,
    studyInstanceUid: row.study_instance_uid,
    seriesInstanceUid: row.series_instance_uid,
    purpose: row.purpose,
    status: row.status,
    highRiskImage: row.high_risk_image,
    releaseDecision: row.release_decision,
    releaseReason: row.release_reason,
    requestedAt: toIsoString(row.requested_at),
    decidedAt: toIsoString(row.decided_at),
    exportedAt: toIsoString(row.exported_at),
    decisionReason: row.decision_reason,
  }),
  pseudonymMappings: (row) => ({
    mappingId: row.mapping_id,
    patientId: row.patient_id,
    studyInstanceUid: row.study_instance_uid,
    pseudonymId: row.pseudonym_id,
    protectedPatientRef: row.protected_patient_ref,
    keyProvider: row.key_provider,
    keyId: row.key_id,
    createdAt: toIsoString(row.created_at),
    protection: row.protection,
  }),
};

function groupBy(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const group = result.get(row[key]) ?? [];
    group.push(row);
    result.set(row[key], group);
  }
  return result;
}

function normalizeStoreData(data) {
  if (!data) return;
  data.patients = uniqueBy(data.patients, "patientId");
  data.hospitals = uniqueBy(data.hospitals, "hospitalId");
  data.gateways = uniqueBy(data.gateways ?? [], "gatewayId");
  data.doctors = uniqueBy(data.doctors, "doctorId");
  data.consents = uniqueBy(data.consents, "consentId");
  data.consentScopes = uniqueBy(data.consentScopes, "scopeId");
  data.transferRequests = uniqueBy(data.transferRequests ?? [], "requestId");
  data.transferTickets = uniqueBy(data.transferTickets ?? [], "ticketId");
  data.dicomAccessTokenLogs = uniqueBy(data.dicomAccessTokenLogs, "tokenId");
  data.auditLogs = uniqueBy(data.auditLogs, "auditId");
  data.transferUsageLogs = uniqueBy(data.transferUsageLogs, "usageId");
  data.researchExportRequests = uniqueBy(data.researchExportRequests ?? [], "requestId");
  data.pseudonymMappings = uniqueBy(data.pseudonymMappings ?? [], "mappingId");
  data.imagingStudies = uniqueBy(data.imagingStudies, "studyId").map((study) => ({
    ...study,
    series: uniqueBy(study.series ?? [], "seriesInstanceUid"),
  }));
}

function uniqueBy(rows = [], key) {
  const seen = new Map();
  for (const row of rows) {
    if (!row?.[key]) continue;
    seen.set(row[key], row);
  }
  return [...seen.values()];
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS patients (
  patient_id varchar PRIMARY KEY,
  name varchar NOT NULL,
  birth_date date NOT NULL,
  phone varchar,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS hospitals (
  hospital_id varchar PRIMARY KEY,
  hospital_name varchar NOT NULL,
  gateway_url varchar NOT NULL,
  status varchar NOT NULL,
  public_key text
);

CREATE TABLE IF NOT EXISTS gateways (
  gateway_id varchar PRIMARY KEY,
  hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  gateway_name varchar NOT NULL,
  dicomweb_endpoint varchar NOT NULL,
  status varchar NOT NULL,
  supports_qido boolean NOT NULL DEFAULT true,
  supports_wado boolean NOT NULL DEFAULT true,
  supports_stow boolean NOT NULL DEFAULT false,
  last_health_checked_at timestamptz
);

CREATE TABLE IF NOT EXISTS doctors (
  doctor_id varchar PRIMARY KEY,
  name varchar NOT NULL,
  hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  roles text[] NOT NULL,
  approved_purposes text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS imaging_studies (
  study_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  study_instance_uid varchar NOT NULL UNIQUE,
  modality varchar NOT NULL,
  body_part varchar NOT NULL,
  study_date date NOT NULL,
  description varchar NOT NULL,
  metadata_only boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS imaging_series (
  series_instance_uid varchar PRIMARY KEY,
  study_instance_uid varchar NOT NULL REFERENCES imaging_studies(study_instance_uid) ON DELETE CASCADE,
  modality varchar NOT NULL,
  description varchar NOT NULL,
  instance_count integer NOT NULL,
  bytes bigint NOT NULL,
  preview_image_url varchar
);

ALTER TABLE imaging_series ADD COLUMN IF NOT EXISTS preview_image_url varchar;

CREATE TABLE IF NOT EXISTS consents (
  consent_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  target_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  purpose varchar NOT NULL,
  permission varchar NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status varchar NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz
);

ALTER TABLE consents ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
UPDATE consents SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE consents ALTER COLUMN updated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS consent_scopes (
  scope_id varchar PRIMARY KEY,
  consent_id varchar NOT NULL REFERENCES consents(consent_id) ON DELETE CASCADE,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE consent_scopes ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE consent_scopes SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE consent_scopes ALTER COLUMN created_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS transfer_requests (
  request_id varchar PRIMARY KEY,
  requester_doctor_id varchar NOT NULL,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  target_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  purpose varchar NOT NULL,
  permission varchar NOT NULL,
  scopes jsonb NOT NULL,
  status varchar NOT NULL,
  consent_id varchar REFERENCES consents(consent_id),
  ticket_id varchar,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer_tickets (
  ticket_id varchar PRIMARY KEY,
  request_id varchar NOT NULL REFERENCES transfer_requests(request_id),
  consent_id varchar NOT NULL REFERENCES consents(consent_id),
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL,
  target_hospital_id varchar NOT NULL,
  purpose varchar NOT NULL,
  permission varchar NOT NULL,
  allowed_study_uids jsonb NOT NULL,
  allowed_series_uids jsonb NOT NULL,
  nonce_hash varchar NOT NULL UNIQUE,
  status varchar NOT NULL,
  audit_session_id varchar NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  redeemed_doctor_id varchar,
  redeemed_hospital_id varchar
);

CREATE TABLE IF NOT EXISTS dicom_access_token_logs (
  token_id varchar PRIMARY KEY,
  token varchar UNIQUE,
  token_hash varchar UNIQUE,
  jti varchar UNIQUE,
  issuer varchar,
  audience varchar,
  scope jsonb,
  audit_session_id varchar,
  consent_id varchar NOT NULL REFERENCES consents(consent_id),
  doctor_id varchar NOT NULL,
  target_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  allowed_series_uids jsonb,
  permission varchar,
  purpose varchar,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status varchar NOT NULL
);

ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS audit_session_id varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS allowed_series_uids jsonb;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS permission varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS purpose varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS token_hash varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS jti varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS issuer varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS audience varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS scope jsonb;
ALTER TABLE dicom_access_token_logs ALTER COLUMN token DROP NOT NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id varchar PRIMARY KEY,
  audit_session_id varchar NOT NULL,
  actor_type varchar NOT NULL,
  actor_id varchar NOT NULL,
  hospital_id varchar,
  patient_id varchar,
  consent_id varchar,
  source_hospital_id varchar,
  target_hospital_id varchar,
  action varchar NOT NULL,
  study_instance_uid varchar,
  series_instance_uid varchar,
  sop_instance_uid varchar,
  ip_address varchar,
  user_agent varchar,
  created_at timestamptz NOT NULL,
  result varchar NOT NULL,
  reason varchar,
  reason_code varchar,
  previous_hash varchar,
  record_hash varchar
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hospital_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS patient_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS consent_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ticket_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS sop_instance_uid varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason_code varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_hash varchar;

CREATE TABLE IF NOT EXISTS transfer_usage_logs (
  usage_id varchar PRIMARY KEY,
  audit_session_id varchar NOT NULL,
  source_hospital_id varchar NOT NULL,
  target_hospital_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  sop_instance_uid varchar,
  bytes_transferred bigint NOT NULL,
  transfer_started_at timestamptz NOT NULL,
  transfer_finished_at timestamptz NOT NULL,
  transfer_mode varchar NOT NULL,
  estimated_cost numeric(12, 4) NOT NULL
);

ALTER TABLE transfer_usage_logs ADD COLUMN IF NOT EXISTS sop_instance_uid varchar;

CREATE TABLE IF NOT EXISTS research_export_requests (
  request_id varchar PRIMARY KEY,
  requester_id varchar NOT NULL,
  approver_id varchar,
  dataset_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  purpose varchar NOT NULL,
  status varchar NOT NULL,
  high_risk_image boolean NOT NULL DEFAULT false,
  release_decision varchar,
  release_reason varchar,
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  exported_at timestamptz,
  decision_reason varchar
);

ALTER TABLE research_export_requests ADD COLUMN IF NOT EXISTS release_decision varchar;
ALTER TABLE research_export_requests ADD COLUMN IF NOT EXISTS release_reason varchar;

CREATE TABLE IF NOT EXISTS pseudonym_mappings (
  mapping_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  study_instance_uid varchar NOT NULL,
  pseudonym_id varchar NOT NULL UNIQUE,
  protected_patient_ref varchar,
  key_provider varchar,
  key_id varchar,
  created_at timestamptz NOT NULL,
  protection varchar NOT NULL
);

ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS protected_patient_ref varchar;
ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS key_provider varchar;
ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS key_id varchar;

CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient ON imaging_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_gateways_hospital ON gateways(hospital_id);
CREATE INDEX IF NOT EXISTS idx_consents_lookup ON consents(patient_id, source_hospital_id, target_hospital_id, purpose, status);
CREATE INDEX IF NOT EXISTS idx_consent_scopes_lookup ON consent_scopes(consent_id, study_instance_uid, series_instance_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_scopes_unique ON consent_scopes(consent_id, study_instance_uid, COALESCE(series_instance_uid, ''));
CREATE INDEX IF NOT EXISTS idx_tokens_token_hash ON dicom_access_token_logs(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_jti ON dicom_access_token_logs(jti) WHERE jti IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_requests_patient ON transfer_requests(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_tickets_consent ON transfer_tickets(consent_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_tickets_expiry ON transfer_tickets(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_ticket_id ON audit_logs(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created_at ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action_created_at ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_transfer_usage_study ON transfer_usage_logs(study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_transfer_usage_instance ON transfer_usage_logs(sop_instance_uid);
CREATE INDEX IF NOT EXISTS idx_research_export_status ON research_export_requests(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pseudonym_mapping_patient_study ON pseudonym_mappings(patient_id, study_instance_uid);
`;
