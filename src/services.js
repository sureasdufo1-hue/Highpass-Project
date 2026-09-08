import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createKeyProvider } from "./key-provider.js";
import { OrthancClient } from "./orthanc-client.js";
import { LocalDevelopmentPseudonymKeyProvider } from "./pseudonym-protection.js";
import { buildRetentionPolicies, executeRetentionPurge, planRetentionPurge } from "./retention.js";
import {
  AccessDecision,
  AccessDenyReason,
  AccessTokenStatus,
  ActorType,
  AuditAction,
  ConsentPurpose,
  ConsentStatus,
  DatePolicy,
  Permission,
  ReleaseDecision,
  ResearchExportStatus,
  ResearchRiskLevel,
  RequestedAction,
  Role,
  TransferMode,
  UidPolicy,
  addMinutesIso,
  isWithinWindow,
  makeId,
  nowIso,
  normalizePurpose,
  tokenTtlByPurposeMinutes,
} from "./domain.js";

export class ServiceValidationError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "ServiceValidationError";
    this.code = code;
    this.details = details;
    this.statusCode = 400;
  }
}

export class HipassService {
  constructor(store, clock = () => nowIso(), options = {}) {
    this.store = store;
    this.clock = clock;
    this.tokenSecret = options.tokenSecret ?? process.env.DICOM_TOKEN_SECRET ?? randomBytes(32).toString("hex");
    this.dicomTokenIssuer = options.dicomTokenIssuer ?? process.env.DICOM_TOKEN_ISSUER ?? "highpass-control-plane";
    this.dicomTokenAudience = options.dicomTokenAudience ?? process.env.DICOM_TOKEN_AUDIENCE ?? "highpass-dicomweb-gateway";
    this.dicomTokenKeyProvider = options.dicomTokenKeyProvider ?? createKeyProvider(this.tokenSecret, process.env);
    this.tokenTtlMinutes = normalizeTokenTtlMinutes(options.tokenTtlMinutes ?? process.env.DICOM_TOKEN_TTL_MINUTES);
    this.anomalyRules = normalizeAnomalyRules(options.anomalyRules);
    this.deIdentificationPolicy = normalizeDeIdentificationPolicy(options.deIdentificationPolicy);
    this.orthanc = options.orthancClient ?? new OrthancClient();
    this.pseudonymKeyProvider = options.pseudonymKeyProvider ?? new LocalDevelopmentPseudonymKeyProvider(this.tokenSecret, this.dicomTokenKeyProvider);
    this.normalizeAuditLogChain();
  }

  listStudies(patientId, options = {}) {
    return this.store
      .get("imagingStudies")
      .filter((study) => !patientId || study.patientId === patientId)
      .map(({ series, ...metadata }) => (options.includeSeries ? { ...metadata, series } : metadata));
  }

  listRetentionPolicies() {
    return buildRetentionPolicies();
  }

  planRetentionPurge(env = process.env) {
    return planRetentionPurge(this.store, this.clock, env);
  }

  executeRetentionPurge(env = process.env) {
    return executeRetentionPurge(this.store, this.clock, env);
  }

  prepareResearchDataset(input, requestMeta = {}) {
    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === input.studyInstanceUid);
    if (!study) {
      throw new ServiceValidationError("STUDY_NOT_FOUND", "Study not found");
    }
    const patient = this.store.get("patients").find((item) => item.patientId === study.patientId);
    if (!patient) {
      throw new ServiceValidationError("PATIENT_NOT_FOUND", "Patient not found");
    }

    const pseudonym = this.ensurePseudonymMapping(patient.patientId, study.studyInstanceUid);
    const requestedSeries = input.seriesInstanceUid
      ? study.series?.filter((series) => series.seriesInstanceUid === input.seriesInstanceUid)
      : study.series;
    if (input.seriesInstanceUid && !requestedSeries?.length) {
      throw new ServiceValidationError("SERIES_NOT_FOUND", "Series not found");
    }

    const riskLevel = isHighRiskImageStudy(study) ? ResearchRiskLevel.HIGH_RISK_IMAGE : ResearchRiskLevel.LOW;
    const reportText = input.reportText ?? sampleClinicalReport(patient);
    const sanitizedReport = maskClinicalReport(reportText, patient);
    const uidMap = buildResearchUidMap(study, input.seriesInstanceUid, input.sopInstanceUid, this.tokenSecret);
    const riskProfile = this.analyzeResearchReidentificationRisk(study, patient);
    return {
      datasetId: researchDatasetId(study.studyInstanceUid, input.seriesInstanceUid),
      purpose: ConsentPurpose.RESEARCH,
      source: "CONTROL_PLANE_METADATA_ONLY",
      originalDataPolicy: "ORIGINAL_DICOM_REMAINS_IN_ORTHANC_OR_SOURCE_PACS",
      pseudonymId: pseudonym.pseudonymId,
      studyInstanceUid: uidMap.studyInstanceUid,
      seriesInstanceUids: requestedSeries?.map((series) => uidMap.seriesInstanceUids[series.seriesInstanceUid]) ?? [],
      sopInstanceUid: input.sopInstanceUid ? uidMap.sopInstanceUids[input.sopInstanceUid] : null,
      uidPolicy: this.deIdentificationPolicy.uidPolicy,
      datePolicy: this.deIdentificationPolicy.datePolicy,
      riskLevel,
      highRiskImage: riskLevel === ResearchRiskLevel.HIGH_RISK_IMAGE,
      defacingStatus: riskLevel === ResearchRiskLevel.HIGH_RISK_IMAGE ? "NOT_IMPLEMENTED" : "NOT_REQUIRED_FOR_SAMPLE",
      exportRestriction: riskLevel === ResearchRiskLevel.HIGH_RISK_IMAGE ? "BLOCK_RESEARCH_EXPORT_UNTIL_DEFACING_VERIFIED" : "APPROVAL_REQUIRED",
      dicomHeader: sanitizeDicomHeader(study, patient, pseudonym.pseudonymId, uidMap, this.deIdentificationPolicy),
      report: sanitizedReport,
      riskProfile,
      headerActions: [
        "PatientName removed",
        "PatientID replaced with protected pseudonym",
        "PatientBirthDate removed",
        "PatientAddress removed",
        "PatientTelephoneNumbers removed",
        "OtherPatientIDs removed",
        "InstitutionName generalized",
        "StudyDate generalized",
        "StudyInstanceUID regenerated",
        "SeriesInstanceUID regenerated",
        "SOPInstanceUID regenerated when present",
        "BodyPartExamined generalized when needed",
      ],
      preparedAt: this.clock(),
      requestMeta: {
        ipAddress: requestMeta.ipAddress ?? null,
        userAgent: requestMeta.userAgent ?? null,
      },
    };
  }

  async requestResearchExport(input, requestMeta = {}) {
    const validation = requireResearchFields(input, ["requesterId", "studyInstanceUid", "purpose"]);
    if (validation) {
      throw new ServiceValidationError("INVALID_RESEARCH_EXPORT_REQUEST", validation);
    }
    const dataset = this.prepareResearchDataset(input, requestMeta);
    const requestId = makeId("research-export");
    const now = this.clock();
    const request = {
      requestId,
      requesterId: input.requesterId,
      approverId: null,
      datasetId: dataset.datasetId,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid ?? null,
      purpose: input.purpose,
      status: ResearchExportStatus.REQUESTED,
      highRiskImage: dataset.highRiskImage,
      releaseDecision: dataset.riskProfile.releaseDecision,
      releaseReason: dataset.riskProfile.releaseReason,
      requestedAt: now,
      decidedAt: null,
      exportedAt: null,
      decisionReason: null,
    };
    this.store.get("researchExportRequests").push(request);
    await this.writeAudit({
      actorType: ActorType.SYSTEM,
      actorId: input.requesterId,
      hospitalId: input.hospitalId ?? null,
      action: AuditAction.RESEARCH_EXPORT_REQUESTED,
      studyInstanceUid: dataset.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return { ...request, datasetPreview: dataset };
  }

  async decideResearchExport(requestId, input, requestMeta = {}) {
    const request = this.store.get("researchExportRequests").find((item) => item.requestId === requestId);
    if (!request) return null;
    const decision = input.decision;
    if (![ResearchExportStatus.APPROVED, ResearchExportStatus.REJECTED].includes(decision)) {
      throw new ServiceValidationError("INVALID_RESEARCH_EXPORT_DECISION", "Decision must be APPROVED or REJECTED");
    }
    request.status = decision;
    request.approverId = input.approverId ?? "UNKNOWN_APPROVER";
    request.decidedAt = this.clock();
    request.decisionReason = input.reason ?? null;
    await this.writeAudit({
      actorType: ActorType.SYSTEM,
      actorId: request.approverId,
      action: decision === ResearchExportStatus.APPROVED ? AuditAction.RESEARCH_EXPORT_APPROVED : AuditAction.RESEARCH_EXPORT_REJECTED,
      studyInstanceUid: request.studyInstanceUid,
      seriesInstanceUid: request.seriesInstanceUid,
      result: decision === ResearchExportStatus.APPROVED ? "SUCCESS" : "FAIL",
      reason: request.decisionReason,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return request;
  }

  async exportResearchDataset(requestId, requestMeta = {}) {
    const request = this.store.get("researchExportRequests").find((item) => item.requestId === requestId);
    if (!request) return null;
    const block = async (reasonCode) => {
      await this.writeAudit({
        actorType: ActorType.SYSTEM,
        actorId: request.requesterId,
        action: AuditAction.RESEARCH_EXPORT_BLOCKED,
        studyInstanceUid: request.studyInstanceUid,
        seriesInstanceUid: request.seriesInstanceUid,
        result: "FAIL",
        reason: reasonCode,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
      await this.store.save();
      return { decision: AccessDecision.DENIED, reasonCode, request };
    };

    if (request.status !== ResearchExportStatus.APPROVED) {
      return block(request.status === ResearchExportStatus.REJECTED ? "RESEARCH_EXPORT_REJECTED" : "RESEARCH_EXPORT_NOT_APPROVED");
    }
    if (request.highRiskImage) {
      return block("HIGH_RISK_IMAGE_EXPORT_BLOCKED");
    }
    if (request.releaseDecision !== ReleaseDecision.RELEASE_ALLOWED) {
      return block(request.releaseReason ?? request.releaseDecision);
    }

    const dataset = this.prepareResearchDataset({
      studyInstanceUid: request.studyInstanceUid,
      seriesInstanceUid: request.seriesInstanceUid,
      purpose: request.purpose,
    }, requestMeta);
    request.status = ResearchExportStatus.EXPORTED;
    request.exportedAt = this.clock();
    await this.writeAudit({
      actorType: ActorType.SYSTEM,
      actorId: request.requesterId,
      action: AuditAction.RESEARCH_EXPORT_COMPLETED,
      studyInstanceUid: request.studyInstanceUid,
      seriesInstanceUid: request.seriesInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return { decision: AccessDecision.ALLOWED, request, dataset };
  }

  listResearchExportRequests() {
    return this.store.get("researchExportRequests").slice().reverse();
  }

  analyzeResearchReidentificationRisk(study, patient) {
    const policy = this.deIdentificationPolicy;
    const records = this.store.get("imagingStudies").map((candidate) => {
      const candidatePatient = this.store.get("patients").find((item) => item.patientId === candidate.patientId);
      return researchQuasiIdentifier(candidate, candidatePatient, policy);
    });
    const target = researchQuasiIdentifier(study, patient, policy);
    const groupSize = records.filter((record) => record.key === target.key).length;
    const datasetSize = records.length;
    let releaseDecision = ReleaseDecision.RELEASE_ALLOWED;
    let releaseReason = "RELEASE_POLICY_SATISFIED";
    if (datasetSize < policy.minimumDatasetSize) {
      releaseDecision = ReleaseDecision.HUMAN_REVIEW_REQUIRED;
      releaseReason = "MIN_DATASET_SIZE_NOT_MET";
    }
    if (groupSize < policy.kAnonymityThreshold) {
      releaseDecision = ReleaseDecision.HUMAN_REVIEW_REQUIRED;
      releaseReason = "K_ANONYMITY_NOT_MET";
    }
    return {
      quasiIdentifiers: target.values,
      groupSize,
      datasetSize,
      kAnonymityThreshold: policy.kAnonymityThreshold,
      minimumDatasetSize: policy.minimumDatasetSize,
      releaseDecision,
      releaseReason,
      limitation: "MVP risk screen only; expert privacy impact review is still required before production release",
    };
  }

  getGateway(hospitalId) {
    const hospital = this.store.get("hospitals").find((item) => item.hospitalId === hospitalId);
    if (!hospital) return null;
    const gateway = this.store.get("gateways")?.find((item) => item.hospitalId === hospitalId);
    return {
      hospitalId: hospital.hospitalId,
      hospitalName: hospital.hospitalName,
      gatewayId: gateway?.gatewayId ?? null,
      gatewayName: gateway?.gatewayName ?? null,
      gatewayUrl: gateway?.dicomwebEndpoint ?? hospital.gatewayUrl,
      status: gateway?.status ?? hospital.status,
      supportsQido: gateway?.supportsQido ?? null,
      supportsWado: gateway?.supportsWado ?? null,
      supportsStow: gateway?.supportsStow ?? null,
    };
  }

  async createConsent(input) {
    const validation = await this.validateConsentInput(input);
    if (!validation.ok) {
      await this.writeAudit({
        actorType: ActorType.PATIENT,
        actorId: input.patientId ?? "UNKNOWN",
        patientId: input.patientId ?? null,
        sourceHospitalId: input.sourceHospitalId,
        targetHospitalId: input.targetHospitalId,
        action: AuditAction.CONSENT_CREATE_FAILED,
        result: "FAIL",
        reason: validation.errors[0],
      });
      await this.store.save();
      throw new ServiceValidationError(validation.errors[0], "Consent validation failed", validation.errors);
    }

    const consentId = makeId("consent");
    const now = this.clock();
    const consent = {
      consentId,
      patientId: input.patientId,
      sourceHospitalId: input.sourceHospitalId,
      targetHospitalId: input.targetHospitalId,
      purpose: normalizePurpose(input.purpose),
      permission: input.permission,
      validFrom: input.validFrom ?? now,
      validUntil: input.validUntil,
      status: ConsentStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };

    const scopes = validation.scopes.map((scope) => ({
      scopeId: makeId("scope"),
      consentId,
      studyInstanceUid: scope.studyInstanceUid,
      seriesInstanceUid: scope.seriesInstanceUid ?? null,
      allowed: scope.allowed ?? true,
      createdAt: now,
    }));

    this.store.get("consents").push(consent);
    this.store.get("consentScopes").push(...scopes);
    await this.writeAudit({
      actorType: ActorType.PATIENT,
      actorId: input.patientId,
      patientId: input.patientId,
      consentId,
      sourceHospitalId: input.sourceHospitalId,
      targetHospitalId: input.targetHospitalId,
      action: AuditAction.CONSENT_CREATED,
      studyInstanceUid: scopes[0]?.studyInstanceUid,
      seriesInstanceUid: scopes[0]?.seriesInstanceUid,
      result: "SUCCESS",
    });
    await this.store.save();
    return this.decorateConsent({ ...consent, scopes });
  }

  getConsent(consentId) {
    const consent = this.store.get("consents").find((item) => item.consentId === consentId);
    if (!consent) return null;
    return this.decorateConsent({
      ...consent,
      scopes: this.store.get("consentScopes").filter((scope) => scope.consentId === consentId),
    });
  }

  async viewConsent(consentId, actorId = "system", requestMeta = {}) {
    const consent = this.getConsent(consentId);
    if (!consent) return null;
    await this.writeAudit({
      actorType: ActorType.PATIENT,
      actorId,
      patientId: consent.patientId,
      consentId: consent.consentId,
      sourceHospitalId: consent.sourceHospitalId,
      targetHospitalId: consent.targetHospitalId,
      action: AuditAction.CONSENT_VIEWED,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return consent;
  }

  listConsentsByPatient(patientId) {
    return this.store
      .get("consents")
      .filter((consent) => consent.patientId === patientId)
      .map((consent) => this.getConsent(consent.consentId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async revokeConsent(consentId, actorId = "system") {
    const consent = this.store.get("consents").find((item) => item.consentId === consentId);
    if (!consent) return null;
    const effectiveStatus = this.effectiveConsentStatus(consent);
    if (effectiveStatus === ConsentStatus.REVOKED) {
      throw new ServiceValidationError("CONSENT_ALREADY_REVOKED", "Consent is already revoked");
    }
    if (effectiveStatus === ConsentStatus.EXPIRED) {
      throw new ServiceValidationError("CONSENT_ALREADY_EXPIRED", "Expired consent cannot be revoked");
    }
    const now = this.clock();
    consent.status = ConsentStatus.REVOKED;
    consent.updatedAt = now;
    consent.revokedAt = now;
    this.store
      .get("dicomAccessTokenLogs")
      .filter((token) => token.consentId === consentId && token.status === "ACTIVE")
      .forEach((token) => {
        token.status = "REVOKED";
      });
    await this.writeAudit({
      actorType: ActorType.PATIENT,
      actorId,
      patientId: consent.patientId,
      consentId,
      sourceHospitalId: consent.sourceHospitalId,
      targetHospitalId: consent.targetHospitalId,
      action: AuditAction.CONSENT_REVOKED,
      result: "SUCCESS",
    });
    await this.store.save();
    return this.getConsent(consentId);
  }

  checkAccess(input) {
    const now = this.clock();
    const consent = this.findMatchingConsent(input);
    if (!consent) return { allowed: false, reason: "ACCESS_DENIED_NO_CONSENT" };
    const effectiveStatus = this.effectiveConsentStatus(consent);
    if (effectiveStatus === ConsentStatus.REVOKED) return { allowed: false, reason: "ACCESS_DENIED_CONSENT_REVOKED" };
    if (effectiveStatus === ConsentStatus.EXPIRED) return { allowed: false, reason: "ACCESS_DENIED_EXPIRED" };
    if (effectiveStatus !== ConsentStatus.ACTIVE) return { allowed: false, reason: "ACCESS_DENIED_CONSENT_INACTIVE" };
    if (!isWithinWindow(now, consent.validFrom, consent.validUntil)) return { allowed: false, reason: "ACCESS_DENIED_EXPIRED" };
    if (!this.isScopeAllowed(consent.consentId, input.studyInstanceUid, input.seriesInstanceUid)) {
      return { allowed: false, reason: "ACCESS_DENIED_SCOPE_MISMATCH" };
    }
    if (input.permission === Permission.DOWNLOAD_ALLOWED && consent.permission !== Permission.DOWNLOAD_ALLOWED) {
      return { allowed: false, reason: "ACCESS_DENIED_PERMISSION_MISMATCH" };
    }
    return { allowed: true, reason: "ACCESS_GRANTED", consent };
  }

  async evaluateDicomAccessRequest(input, requestMeta = {}) {
    const auditSessionId = makeId("audit-session");
    const denied = async (reasonCode, context = {}) => {
      await this.writeAudit({
        auditSessionId,
        actorType: ActorType.DOCTOR,
        actorId: input.doctorId ?? "UNKNOWN",
        patientId: context.patientId ?? input.patientId ?? null,
        consentId: input.consentId ?? null,
        sourceHospitalId: context.sourceHospitalId ?? null,
        targetHospitalId: input.requestingHospitalId ?? context.targetHospitalId ?? null,
        action: AuditAction.ACCESS_DENIED,
        studyInstanceUid: input.studyInstanceUid,
        seriesInstanceUid: input.seriesInstanceUid,
        result: "FAIL",
        reason: reasonCode,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
      await this.store.save();
      return { decision: AccessDecision.DENIED, reasonCode, auditSessionId };
    };

    const requiredFields = ["consentId", "doctorId", "requestingHospitalId", "studyInstanceUid", "purpose", "requestedAction"];
    if (requiredFields.some((field) => input[field] === undefined || input[field] === null || input[field] === "")) {
      return denied(AccessDenyReason.INVALID_REQUEST);
    }

    const requestedAction = input.requestedAction;
    if (!Object.values(RequestedAction).includes(requestedAction)) {
      return denied(AccessDenyReason.INVALID_REQUEST);
    }

    const purpose = normalizePurpose(input.purpose);
    if (!Object.values(ConsentPurpose).includes(purpose)) {
      return denied(AccessDenyReason.INVALID_REQUEST);
    }

    const doctor = this.store.get("doctors").find((item) => item.doctorId === input.doctorId);
    if (!doctor || !doctor.roles?.includes(Role.DOCTOR)) {
      return denied(AccessDenyReason.INVALID_REQUEST);
    }

    const consent = this.store.get("consents").find((item) => item.consentId === input.consentId);
    if (!consent) {
      return denied(AccessDenyReason.ACCESS_DENIED_NO_CONSENT);
    }

    const context = {
      patientId: consent.patientId,
      sourceHospitalId: consent.sourceHospitalId,
      targetHospitalId: consent.targetHospitalId,
    };
    if (consent.status === ConsentStatus.REVOKED) {
      return denied(AccessDenyReason.CONSENT_REVOKED, context);
    }

    const nowMs = new Date(this.clock()).getTime();
    const validFromMs = new Date(consent.validFrom).getTime();
    const validUntilMs = new Date(consent.validUntil).getTime();
    if (Number.isNaN(validFromMs) || Number.isNaN(validUntilMs)) {
      return denied(AccessDenyReason.INVALID_REQUEST, context);
    }
    if (nowMs < validFromMs) {
      return denied(AccessDenyReason.CONSENT_NOT_YET_VALID, context);
    }
    if (consent.status === ConsentStatus.EXPIRED || nowMs > validUntilMs) {
      return denied(AccessDenyReason.CONSENT_EXPIRED, context);
    }

    if (input.requestingHospitalId !== consent.targetHospitalId) {
      return denied(AccessDenyReason.HOSPITAL_MISMATCH, context);
    }
    if (doctor.hospitalId !== input.requestingHospitalId) {
      return denied(AccessDenyReason.DOCTOR_HOSPITAL_MISMATCH, context);
    }

    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === input.studyInstanceUid);
    if (!study || study.patientId !== consent.patientId || study.sourceHospitalId !== consent.sourceHospitalId) {
      return denied(AccessDenyReason.STUDY_SCOPE_MISMATCH, context);
    }

    const matchingStudyScopes = this.store.get("consentScopes").filter((scope) => (
      scope.consentId === consent.consentId &&
      scope.allowed &&
      scope.studyInstanceUid === input.studyInstanceUid
    ));
    if (!matchingStudyScopes.length) {
      return denied(AccessDenyReason.STUDY_SCOPE_MISMATCH, context);
    }

    if (input.seriesInstanceUid) {
      const seriesExists = study.series?.some((series) => series.seriesInstanceUid === input.seriesInstanceUid);
      const seriesAllowed = matchingStudyScopes.some((scope) => (
        !scope.seriesInstanceUid || scope.seriesInstanceUid === input.seriesInstanceUid
      ));
      if (!seriesExists || !seriesAllowed) {
        return denied(AccessDenyReason.SERIES_SCOPE_MISMATCH, context);
      }
    }

    if (normalizePurpose(consent.purpose) !== purpose) {
      return denied(AccessDenyReason.PURPOSE_MISMATCH, context);
    }

    if (requestedAction === RequestedAction.DOWNLOAD && consent.permission !== Permission.DOWNLOAD_ALLOWED) {
      return denied(AccessDenyReason.DOWNLOAD_NOT_ALLOWED, context);
    }

    await this.writeAudit({
      auditSessionId,
      actorType: ActorType.DOCTOR,
      actorId: input.doctorId,
      patientId: consent.patientId,
      consentId: consent.consentId,
      sourceHospitalId: consent.sourceHospitalId,
      targetHospitalId: consent.targetHospitalId,
      action: AuditAction.ACCESS_ALLOWED,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return { decision: AccessDecision.ALLOWED, auditSessionId };
  }

  async requestDicomAccessToken(input, requestMeta = {}) {
    const policy = await this.evaluateDicomAccessRequest(input, requestMeta);
    if (policy.decision !== AccessDecision.ALLOWED) {
      await this.writeAudit({
        auditSessionId: policy.auditSessionId,
        actorType: ActorType.DOCTOR,
        actorId: input.doctorId ?? "UNKNOWN",
        consentId: input.consentId ?? null,
        targetHospitalId: input.requestingHospitalId ?? null,
        action: AuditAction.TOKEN_DENIED,
        studyInstanceUid: input.studyInstanceUid,
        seriesInstanceUid: input.seriesInstanceUid,
        result: "FAIL",
        reason: policy.reasonCode,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
      await this.store.save();
      return policy;
    }

    const consent = this.getConsent(input.consentId);
    const allowedSeriesUids = this.allowedSeriesUidsForToken(consent.consentId, input.studyInstanceUid, input.seriesInstanceUid);
    const issuedAt = this.clock();
    const expiresAt = addMinutesIso(this.tokenTtlMinutes, new Date(issuedAt));
    const tokenId = makeId("jti");
    const claims = {
      jti: tokenId,
      iss: this.dicomTokenIssuer,
      aud: this.dicomTokenAudience,
      kid: this.dicomTokenKeyProvider.currentKey()?.kid ?? null,
      consentId: consent.consentId,
      doctorId: input.doctorId,
      targetHospitalId: consent.targetHospitalId,
      studyInstanceUid: input.studyInstanceUid,
      allowedSeriesUids,
      permission: consent.permission,
      purpose: normalizePurpose(input.purpose),
      issuedAt,
      expiresAt,
      auditSessionId: policy.auditSessionId,
    };
    const accessToken = this.signAccessToken(claims);
    this.store.get("dicomAccessTokenLogs").push({
      tokenId,
      jti: tokenId,
      tokenHash: digestToken(accessToken),
      issuer: this.dicomTokenIssuer,
      audience: this.dicomTokenAudience,
      scope: buildDicomTokenScope(input.studyInstanceUid, allowedSeriesUids, consent.permission),
      auditSessionId: policy.auditSessionId,
      consentId: consent.consentId,
      doctorId: input.doctorId,
      targetHospitalId: consent.targetHospitalId,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid ?? null,
      allowedSeriesUids,
      permission: consent.permission,
      purpose: normalizePurpose(input.purpose),
      issuedAt,
      expiresAt,
      status: AccessTokenStatus.ACTIVE,
    });
    await this.writeAudit({
      auditSessionId: policy.auditSessionId,
      actorType: ActorType.DOCTOR,
      actorId: input.doctorId,
      patientId: consent.patientId,
      consentId: consent.consentId,
      sourceHospitalId: consent.sourceHospitalId,
      targetHospitalId: consent.targetHospitalId,
      action: AuditAction.TOKEN_ISSUED,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.store.save();
    return {
      decision: AccessDecision.ALLOWED,
      accessToken,
      expiresAt,
      allowedStudyUid: input.studyInstanceUid,
      allowedSeriesUids,
      permission: consent.permission,
      auditSessionId: policy.auditSessionId,
    };
  }

  async verifyDicomAccessToken(rawToken, input = {}, requestMeta = {}) {
    const invalid = async (reason, auditSessionId = makeId("audit-session"), claims = {}) => {
      await this.writeAudit({
        auditSessionId,
        actorType: ActorType.GATEWAY,
        actorId: "gateway",
        consentId: claims.consentId ?? null,
        targetHospitalId: input.targetHospitalId ?? claims.targetHospitalId ?? null,
        action: reason === "TOKEN_EXPIRED" ? AuditAction.TOKEN_EXPIRED : AuditAction.TOKEN_INVALID,
        studyInstanceUid: input.studyInstanceUid ?? claims.studyInstanceUid,
        seriesInstanceUid: input.seriesInstanceUid,
        result: "FAIL",
        reason,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
      await this.store.save();
      return { active: false, reason, auditSessionId };
    };

    const parsed = this.verifyAccessTokenSignature(rawToken);
    if (!parsed.ok) return invalid("TOKEN_INVALID");
    const claims = parsed.claims;
    const auditSessionId = claims.auditSessionId ?? makeId("audit-session");
    const tokenLog = this.store.get("dicomAccessTokenLogs").find((token) => token.tokenId === claims.jti);
    if (!tokenLog || !safeEqual(tokenLog.tokenHash ?? "", digestToken(rawToken))) {
      return invalid("TOKEN_INVALID", auditSessionId, claims);
    }
    if (claims.iss !== this.dicomTokenIssuer || tokenLog.issuer !== this.dicomTokenIssuer) {
      return invalid("TOKEN_ISSUER_MISMATCH", auditSessionId, claims);
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.dicomTokenAudience) || tokenLog.audience !== this.dicomTokenAudience) {
      return invalid("TOKEN_AUDIENCE_MISMATCH", auditSessionId, claims);
    }
    if (tokenLog.status === AccessTokenStatus.REVOKED) {
      return invalid("TOKEN_CONSENT_INACTIVE", auditSessionId, claims);
    }
    if (tokenLog.status !== AccessTokenStatus.ACTIVE) {
      return invalid("TOKEN_INVALID", auditSessionId, claims);
    }
    if (new Date(claims.expiresAt).getTime() < new Date(this.clock()).getTime()) {
      tokenLog.status = AccessTokenStatus.EXPIRED;
      return invalid("TOKEN_EXPIRED", auditSessionId, claims);
    }
    if (input.targetHospitalId && input.targetHospitalId !== claims.targetHospitalId) {
      return invalid("TOKEN_HOSPITAL_MISMATCH", auditSessionId, claims);
    }
    if (input.studyInstanceUid && input.studyInstanceUid !== claims.studyInstanceUid) {
      return invalid("TOKEN_STUDY_MISMATCH", auditSessionId, claims);
    }
    const allowedSeriesUids = Array.isArray(claims.allowedSeriesUids) ? claims.allowedSeriesUids : [];
    if (input.seriesInstanceUid && allowedSeriesUids.length && !allowedSeriesUids.includes(input.seriesInstanceUid)) {
      return invalid("TOKEN_SERIES_MISMATCH", auditSessionId, claims);
    }
    if (input.requestedAction === RequestedAction.DOWNLOAD && claims.permission !== Permission.DOWNLOAD_ALLOWED) {
      return invalid("TOKEN_PERMISSION_MISMATCH", auditSessionId, claims);
    }
    const consent = this.store.get("consents").find((item) => item.consentId === claims.consentId);
    if (!consent || this.effectiveConsentStatus(consent) !== ConsentStatus.ACTIVE) {
      return invalid("TOKEN_CONSENT_INACTIVE", auditSessionId, claims);
    }
    return { active: true, claims };
  }

  async requestDicomAccess(input) {
    const access = this.checkAccess(input);
    if (!access.allowed) {
      await this.writeAudit({
        actorType: ActorType.DOCTOR,
        actorId: input.doctorId,
        sourceHospitalId: input.sourceHospitalId,
        targetHospitalId: input.targetHospitalId,
        action: AuditAction.ACCESS_DENIED,
        studyInstanceUid: input.studyInstanceUid,
        seriesInstanceUid: input.seriesInstanceUid,
        result: "FAIL",
        reason: access.reason,
      });
      await this.store.save();
      return access;
    }

    const ttl = tokenTtlByPurposeMinutes[access.consent.purpose] ?? 5;
    const token = {
      tokenId: makeId("token"),
      jti: null,
      consentId: access.consent.consentId,
      doctorId: input.doctorId,
      targetHospitalId: input.targetHospitalId,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid ?? null,
      issuedAt: this.clock(),
      expiresAt: addMinutesIso(ttl, new Date(this.clock())),
      status: "ACTIVE",
    };
    token.jti = token.tokenId;
    const rawToken = makeId("dicom");
    token.tokenHash = digestToken(rawToken);
    token.issuer = this.dicomTokenIssuer;
    token.audience = this.dicomTokenAudience;
    token.scope = buildDicomTokenScope(input.studyInstanceUid, input.seriesInstanceUid ? [input.seriesInstanceUid] : [], "VIEW_ONLY");
    this.store.get("dicomAccessTokenLogs").push(token);
    await this.writeAudit({
      actorType: ActorType.DOCTOR,
      actorId: input.doctorId,
      sourceHospitalId: input.sourceHospitalId,
      targetHospitalId: input.targetHospitalId,
      action: AuditAction.TOKEN_ISSUE,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      result: "SUCCESS",
    });
    await this.store.save();
    return { allowed: true, reason: "TOKEN_ISSUED", token: { ...token, token: rawToken, tokenHash: undefined } };
  }

  introspectToken(rawToken, studyInstanceUid, seriesInstanceUid) {
    const presentedHash = digestToken(rawToken);
    const token = this.store.get("dicomAccessTokenLogs").find((item) => safeEqual(item.tokenHash ?? "", presentedHash));
    if (!token) return { active: false, reason: "TOKEN_NOT_FOUND" };
    if (token.status !== "ACTIVE") return { active: false, reason: `TOKEN_${token.status}` };
    if (new Date(token.expiresAt).getTime() < new Date(this.clock()).getTime()) {
      token.status = "EXPIRED";
      return { active: false, reason: "TOKEN_EXPIRED" };
    }
    if (studyInstanceUid && token.studyInstanceUid !== studyInstanceUid) {
      return { active: false, reason: "TOKEN_STUDY_MISMATCH" };
    }
    if (seriesInstanceUid && token.seriesInstanceUid && token.seriesInstanceUid !== seriesInstanceUid) {
      return { active: false, reason: "TOKEN_SERIES_MISMATCH" };
    }
    return { active: true, token };
  }

  allowedSeriesUidsForToken(consentId, studyInstanceUid, requestedSeriesUid) {
    if (requestedSeriesUid) return [requestedSeriesUid];
    return this.store
      .get("consentScopes")
      .filter((scope) => scope.consentId === consentId && scope.allowed && scope.studyInstanceUid === studyInstanceUid)
      .map((scope) => scope.seriesInstanceUid)
      .filter(Boolean);
  }

  signAccessToken(claims) {
    const currentKey = this.dicomTokenKeyProvider.currentKey();
    const header = { alg: "HS256", typ: "JWT", kid: currentKey?.kid ?? claims.kid ?? null };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify({ ...claims, kid: currentKey?.kid ?? claims.kid ?? null }));
    const signature = signTokenParts(encodedHeader, encodedPayload, currentKey?.material ?? this.tokenSecret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verifyAccessTokenSignature(rawToken) {
    if (!rawToken || typeof rawToken !== "string") return { ok: false };
    const parts = rawToken.split(".");
    if (parts.length !== 3) return { ok: false };
    const [encodedHeader, encodedPayload, signature] = parts;
    try {
      const header = JSON.parse(base64UrlDecode(encodedHeader));
      if (header.alg !== "HS256" || header.typ !== "JWT") return { ok: false };
      const key = header.kid
        ? this.dicomTokenKeyProvider.getKey(header.kid)
        : this.dicomTokenKeyProvider.currentKey();
      if (header.kid && !key) return { ok: false };
      const expected = signTokenParts(encodedHeader, encodedPayload, key?.material ?? this.tokenSecret);
      if (!safeEqual(signature, expected)) return { ok: false };
      const claims = JSON.parse(base64UrlDecode(encodedPayload));
      if (!claims.jti) return { ok: false };
      if (header.kid && claims.kid && claims.kid !== header.kid) return { ok: false };
      return { ok: true, claims };
    } catch {
      return { ok: false };
    }
  }

  listDicomStudies(patientId) {
    return this.store.get("imagingStudies").filter((study) => !patientId || study.patientId === patientId);
  }

  async gatewayListStudies(rawToken, requestMeta = {}) {
    const tokenStatus = await this.verifyDicomAccessToken(rawToken, {}, requestMeta);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const { claims } = tokenStatus;
    let result;
    try {
      result = await this.orthanc.qidoStudies(claims.studyInstanceUid);
    } catch {
      return this.recordGatewayUnavailable({ claims, studyInstanceUid: claims.studyInstanceUid, requestMeta });
    }
    await this.recordGatewayTransfer({
      claims,
      studyInstanceUid: claims.studyInstanceUid,
      result: result.status < 400 ? "SUCCESS" : "FAIL",
      reason: result.status < 400 ? null : "ORTHANC_QIDO_STUDY_FAILED",
      bytesTransferred: JSON.stringify(result.body).length,
      requestMeta,
    });
    return result;
  }

  async gatewayListSeries(rawToken, studyInstanceUid, requestMeta = {}) {
    const tokenStatus = await this.verifyDicomAccessToken(rawToken, {
      targetHospitalId: this.targetHospitalFromToken(rawToken),
      studyInstanceUid,
      requestedAction: RequestedAction.VIEW,
    }, requestMeta);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const { claims } = tokenStatus;
    let result;
    try {
      result = await this.orthanc.qidoSeries(studyInstanceUid);
    } catch {
      return this.recordGatewayUnavailable({ claims, studyInstanceUid, requestMeta });
    }
    const body = Array.isArray(result.body) && claims.allowedSeriesUids.length
      ? result.body.filter((series) => claims.allowedSeriesUids.includes(dicomValue(series, "0020000E")))
      : result.body;
    await this.recordGatewayTransfer({
      claims,
      studyInstanceUid,
      result: result.status < 400 ? "SUCCESS" : "FAIL",
      reason: result.status < 400 ? null : "ORTHANC_QIDO_SERIES_FAILED",
      bytesTransferred: JSON.stringify(body).length,
      requestMeta,
    });
    return { status: result.status, body };
  }

  async gatewayListInstances(rawToken, studyInstanceUid, seriesInstanceUid, requestMeta = {}) {
    const tokenStatus = await this.verifyDicomAccessToken(rawToken, {
      targetHospitalId: this.targetHospitalFromToken(rawToken),
      studyInstanceUid,
      seriesInstanceUid,
      requestedAction: RequestedAction.VIEW,
    }, requestMeta);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const { claims } = tokenStatus;
    let result;
    try {
      result = await this.orthanc.qidoInstances(studyInstanceUid, seriesInstanceUid);
    } catch {
      return this.recordGatewayUnavailable({ claims, studyInstanceUid, seriesInstanceUid, requestMeta });
    }
    await this.recordGatewayTransfer({
      claims,
      studyInstanceUid,
      seriesInstanceUid,
      result: result.status < 400 ? "SUCCESS" : "FAIL",
      reason: result.status < 400 ? null : "ORTHANC_QIDO_INSTANCE_FAILED",
      bytesTransferred: JSON.stringify(result.body).length,
      requestMeta,
    });
    return result;
  }

  async gatewayRetrieveInstance(rawToken, studyInstanceUid, seriesInstanceUid, sopInstanceUid, requestMeta = {}) {
    const tokenStatus = await this.verifyDicomAccessToken(rawToken, {
      targetHospitalId: this.targetHospitalFromToken(rawToken),
      studyInstanceUid,
      seriesInstanceUid,
      requestedAction: RequestedAction.VIEW,
    }, requestMeta);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason }, contentType: "application/json" };
    const { claims } = tokenStatus;
    let result;
    try {
      result = await this.orthanc.wadoInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    } catch {
      return {
        ...(await this.recordGatewayUnavailable({ claims, studyInstanceUid, seriesInstanceUid, sopInstanceUid, requestMeta })),
        contentType: "application/json",
      };
    }
    await this.recordGatewayTransfer({
      claims,
      studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      result: result.status < 400 ? "SUCCESS" : "FAIL",
      reason: result.status < 400 ? null : "ORTHANC_WADO_INSTANCE_FAILED",
      bytesTransferred: result.body.length,
      requestMeta,
    });
    return result;
  }

  async gatewayDownloadInstance(rawToken, studyInstanceUid, seriesInstanceUid, sopInstanceUid, requestMeta = {}) {
    const tokenStatus = await this.verifyDicomAccessToken(rawToken, {
      targetHospitalId: this.targetHospitalFromToken(rawToken),
      studyInstanceUid,
      seriesInstanceUid,
      requestedAction: RequestedAction.DOWNLOAD,
    }, requestMeta);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason }, contentType: "application/json" };
    const { claims } = tokenStatus;
    let result;
    try {
      result = await this.orthanc.wadoInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    } catch {
      return {
        ...(await this.recordGatewayUnavailable({
          claims,
          action: AuditAction.IMAGE_DOWNLOADED,
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          requestMeta,
        })),
        contentType: "application/json",
      };
    }
    await this.recordGatewayTransfer({
      claims,
      action: AuditAction.IMAGE_DOWNLOADED,
      studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      result: result.status < 400 ? "SUCCESS" : "FAIL",
      reason: result.status < 400 ? null : "ORTHANC_WADO_INSTANCE_FAILED",
      bytesTransferred: result.body.length,
      requestMeta,
    });
    return result;
  }

  targetHospitalFromToken(rawToken) {
    return this.verifyAccessTokenSignature(rawToken).claims?.targetHospitalId;
  }

  async recordGatewayTransfer(input) {
    await this.writeAudit({
      auditSessionId: input.claims.auditSessionId,
      actorType: ActorType.GATEWAY,
      actorId: "gateway",
      consentId: input.claims.consentId,
      targetHospitalId: input.claims.targetHospitalId,
      action: input.action ?? AuditAction.IMAGE_VIEWED,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      sopInstanceUid: input.sopInstanceUid,
      result: input.result,
      reason: input.reason,
      ipAddress: input.requestMeta.ipAddress,
      userAgent: input.requestMeta.userAgent,
    });
    await this.writeTransferUsage({
      auditSessionId: input.claims.auditSessionId,
      sourceHospitalId: "HOSP-A",
      targetHospitalId: input.claims.targetHospitalId,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid,
      sopInstanceUid: input.sopInstanceUid,
      bytesTransferred: input.bytesTransferred,
      transferMode: TransferMode.DIRECT,
    });
    await this.store.save();
  }

  async recordGatewayUnavailable(input) {
    await this.recordGatewayTransfer({
      ...input,
      result: "FAIL",
      reason: "ORTHANC_UNAVAILABLE",
      bytesTransferred: 0,
    });
    return { status: 503, body: { error: "ORTHANC_UNAVAILABLE" } };
  }

  async listSeries(rawToken, studyInstanceUid, auditSessionId, requestMeta = {}) {
    const tokenStatus = this.introspectToken(rawToken, studyInstanceUid);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === studyInstanceUid);
    if (!study) return { status: 404, body: { error: "STUDY_NOT_FOUND" } };

    await this.writeAudit({
      auditSessionId,
      actorType: ActorType.GATEWAY,
      actorId: "gateway",
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      action: AuditAction.IMAGE_VIEWED,
      studyInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.writeTransferUsage({
      auditSessionId,
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      studyInstanceUid,
      bytesTransferred: study.series.reduce((sum, series) => sum + series.bytes, 0),
      transferMode: TransferMode.DIRECT,
    });
    await this.store.save();
    return { status: 200, body: this.withPreviewImages(study.series) };
  }

  async retrieveStudy(rawToken, studyInstanceUid, auditSessionId, requestMeta = {}) {
    const tokenStatus = this.introspectToken(rawToken, studyInstanceUid);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === studyInstanceUid);
    if (!study) return { status: 404, body: { error: "STUDY_NOT_FOUND" } };

    await this.writeAudit({
      auditSessionId,
      actorType: ActorType.GATEWAY,
      actorId: "gateway",
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      action: AuditAction.IMAGE_VIEWED,
      studyInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.writeTransferUsage({
      auditSessionId,
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      studyInstanceUid,
      bytesTransferred: study.series.reduce((sum, series) => sum + series.bytes, 0),
      transferMode: TransferMode.DIRECT,
    });
    await this.store.save();
    return {
      status: 200,
      body: {
        ...study,
        retrievalMode: "WADO_RS_STUDY_SIMULATION",
      },
    };
  }

  async retrieveSeries(rawToken, studyInstanceUid, seriesInstanceUid, auditSessionId, requestMeta = {}) {
    const tokenStatus = this.introspectToken(rawToken, studyInstanceUid, seriesInstanceUid);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === studyInstanceUid);
    const series = study?.series.find((item) => item.seriesInstanceUid === seriesInstanceUid);
    if (!study) return { status: 404, body: { error: "STUDY_NOT_FOUND" } };
    if (!series) return { status: 404, body: { error: "SERIES_NOT_FOUND" } };

    await this.writeAudit({
      auditSessionId,
      actorType: ActorType.GATEWAY,
      actorId: "gateway",
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      action: AuditAction.IMAGE_VIEWED,
      studyInstanceUid,
      seriesInstanceUid,
      result: "SUCCESS",
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    await this.writeTransferUsage({
      auditSessionId,
      sourceHospitalId: study.sourceHospitalId,
      targetHospitalId: tokenStatus.token.targetHospitalId,
      studyInstanceUid,
      seriesInstanceUid,
      bytesTransferred: series.bytes,
      transferMode: TransferMode.DIRECT,
    });
    await this.store.save();
    return {
      status: 200,
      body: {
        ...series,
        studyInstanceUid,
        retrievalMode: "WADO_RS_SERIES_SIMULATION",
      },
    };
  }

  listInstances(rawToken, studyInstanceUid, seriesInstanceUid) {
    const tokenStatus = this.introspectToken(rawToken, studyInstanceUid, seriesInstanceUid);
    if (!tokenStatus.active) return { status: 403, body: { error: tokenStatus.reason } };
    const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === studyInstanceUid);
    const series = study?.series.find((item) => item.seriesInstanceUid === seriesInstanceUid);
    if (!series) return { status: 404, body: { error: "SERIES_NOT_FOUND" } };
    return {
      status: 200,
      body: Array.from({ length: Math.min(series.instanceCount, 16) }, (_, index) => ({
        sopInstanceUid: `${series.seriesInstanceUid}.${index + 1}`,
        instanceNumber: index + 1,
        transferSyntax: "1.2.840.10008.1.2.1",
      })),
    };
  }

  async writeAudit(input) {
    const auditLogs = this.store.get("auditLogs");
    const previousHash = auditLogs.at(-1)?.recordHash ?? null;
    const createdAt = input.createdAt ?? this.clock();
    const reasonCode = input.reasonCode ?? input.reason ?? null;
    const log = {
      auditId: makeId("audit"),
      auditSessionId: input.auditSessionId ?? makeId("session"),
      actorType: input.actorType,
      actorId: input.actorId,
      hospitalId: input.hospitalId ?? input.targetHospitalId ?? input.sourceHospitalId ?? null,
      patientId: input.patientId ?? null,
      consentId: input.consentId ?? null,
      sourceHospitalId: input.sourceHospitalId ?? null,
      targetHospitalId: input.targetHospitalId ?? null,
      action: input.action,
      studyInstanceUid: input.studyInstanceUid ?? null,
      seriesInstanceUid: input.seriesInstanceUid ?? null,
      sopInstanceUid: input.sopInstanceUid ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt,
      result: input.result,
      reason: reasonCode,
      reasonCode,
      previousHash,
      recordHash: null,
    };
    log.recordHash = auditRecordHash(log);
    auditLogs.push(log);
    if (!input.skipAnomalyDetection) {
      await this.detectAnomaliesFor(log);
    }
  }

  async recordAuditMutationDenied(input = {}) {
    await this.writeAudit({
      actorType: ActorType.GATEWAY,
      actorId: input.actorId ?? "system",
      hospitalId: input.hospitalId ?? null,
      action: AuditAction.AUDIT_LOG_MUTATION_DENIED,
      result: "FAIL",
      reason: "AUDIT_LOG_APPEND_ONLY",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await this.store.save();
  }

  normalizeAuditLogChain() {
    const auditLogs = this.store.get("auditLogs");
    let previousHash = null;
    for (const log of auditLogs) {
      log.hospitalId ??= log.targetHospitalId ?? log.sourceHospitalId ?? null;
      log.reasonCode ??= log.reason ?? null;
      log.previousHash = previousHash;
      log.recordHash = auditRecordHash({ ...log, recordHash: null });
      previousHash = log.recordHash;
    }
  }

  listAuditLogs(filters = {}) {
    const limit = Math.min(200, Math.max(1, Number.isFinite(filters.limit) ? filters.limit : 64));
    return this.store.get("auditLogs")
      .filter((log) => !filters.action || log.action === filters.action)
      .filter((log) => !filters.result || log.result === filters.result)
      .filter((log) => !filters.actorId || log.actorId === filters.actorId)
      .filter((log) => !filters.hospitalId || log.hospitalId === filters.hospitalId || log.targetHospitalId === filters.hospitalId || log.sourceHospitalId === filters.hospitalId)
      .filter((log) => !filters.reasonCode || log.reasonCode === filters.reasonCode || log.reason === filters.reasonCode)
      .slice(-limit)
      .reverse();
  }

  listAnomalyAlerts() {
    return this.store.get("auditLogs")
      .filter((log) => isAnomalyAction(log.action))
      .slice(-64)
      .reverse();
  }

  verifyAuditIntegrity() {
    let previousHash = null;
    for (const log of this.store.get("auditLogs")) {
      if ((log.previousHash ?? null) !== previousHash) {
        return { ok: false, failedAuditId: log.auditId, reason: "PREVIOUS_HASH_MISMATCH" };
      }
      if (log.recordHash !== auditRecordHash({ ...log, recordHash: null })) {
        return { ok: false, failedAuditId: log.auditId, reason: "RECORD_HASH_MISMATCH" };
      }
      previousHash = log.recordHash;
    }
    return { ok: true, checked: this.store.get("auditLogs").length };
  }

  async detectAnomaliesFor(log) {
    const rules = this.anomalyRules;
    if (log.action === AuditAction.IMAGE_VIEWED && log.result === "SUCCESS") {
      await this.detectThreshold({
        action: AuditAction.BULK_ACCESS_DETECTED,
        reason: "BULK_ACCESS_ALERT",
        sourceLog: log,
        windowMinutes: rules.bulkAccessWindowMinutes,
        threshold: rules.bulkAccessThreshold,
        predicate: (candidate) => candidate.actorId === log.actorId && candidate.action === AuditAction.IMAGE_VIEWED && candidate.result === "SUCCESS",
      });
    }

    if (log.result === "FAIL" && !isAnomalyAction(log.action)) {
      await this.detectThreshold({
        action: AuditAction.REPEATED_ACCESS_FAILURE,
        reason: "REPEATED_ACCESS_FAILURE",
        sourceLog: log,
        windowMinutes: rules.repeatedFailureWindowMinutes,
        threshold: rules.repeatedFailureThreshold,
        predicate: (candidate) => candidate.actorId === log.actorId && candidate.result === "FAIL" && !isAnomalyAction(candidate.action),
      });
    }

    if (log.action === AuditAction.TOKEN_EXPIRED || log.reasonCode === "TOKEN_EXPIRED") {
      await this.detectThreshold({
        action: AuditAction.EXPIRED_TOKEN_ABUSE,
        reason: "EXPIRED_TOKEN_ABUSE",
        sourceLog: log,
        windowMinutes: rules.expiredTokenWindowMinutes,
        threshold: rules.expiredTokenThreshold,
        predicate: (candidate) => candidate.actorId === log.actorId && (candidate.action === AuditAction.TOKEN_EXPIRED || candidate.reasonCode === "TOKEN_EXPIRED"),
      });
    }

    if (log.action === AuditAction.IMAGE_DOWNLOADED && log.result === "SUCCESS" && isUnusualDownloadHour(log.createdAt, rules)) {
      await this.detectThreshold({
        action: AuditAction.UNUSUAL_DOWNLOAD_PATTERN,
        reason: "UNUSUAL_DOWNLOAD_PATTERN",
        sourceLog: log,
        windowMinutes: rules.unusualDownloadWindowMinutes,
        threshold: rules.unusualDownloadThreshold,
        predicate: (candidate) => candidate.actorId === log.actorId && candidate.action === AuditAction.IMAGE_DOWNLOADED && candidate.result === "SUCCESS" && isUnusualDownloadHour(candidate.createdAt, rules),
      });
    }
  }

  async detectThreshold({ action, reason, sourceLog, windowMinutes, threshold, predicate }) {
    const since = new Date(new Date(sourceLog.createdAt).getTime() - windowMinutes * 60_000).getTime();
    const candidates = this.store.get("auditLogs").filter((candidate) => (
      new Date(candidate.createdAt).getTime() >= since &&
      !isAnomalyAction(candidate.action) &&
      predicate(candidate)
    ));
    if (candidates.length < threshold) return;

    const duplicate = this.store.get("auditLogs").some((candidate) => (
      candidate.action === action &&
      candidate.actorId === sourceLog.actorId &&
      candidate.reasonCode === reason &&
      new Date(candidate.createdAt).getTime() >= since
    ));
    if (duplicate) return;

    await this.writeAudit({
      auditSessionId: sourceLog.auditSessionId,
      actorType: ActorType.GATEWAY,
      actorId: sourceLog.actorId,
      hospitalId: sourceLog.hospitalId,
      consentId: sourceLog.consentId,
      sourceHospitalId: sourceLog.sourceHospitalId,
      targetHospitalId: sourceLog.targetHospitalId,
      action,
      studyInstanceUid: sourceLog.studyInstanceUid,
      seriesInstanceUid: sourceLog.seriesInstanceUid,
      sopInstanceUid: sourceLog.sopInstanceUid,
      result: "ALERT",
      reason,
      ipAddress: sourceLog.ipAddress,
      userAgent: sourceLog.userAgent,
      skipAnomalyDetection: true,
    });
  }

  async writeTransferUsage(input) {
    this.store.get("transferUsageLogs").push({
      usageId: makeId("usage"),
      auditSessionId: input.auditSessionId ?? makeId("session"),
      sourceHospitalId: input.sourceHospitalId,
      targetHospitalId: input.targetHospitalId,
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid: input.seriesInstanceUid ?? null,
      sopInstanceUid: input.sopInstanceUid ?? null,
      bytesTransferred: input.bytesTransferred,
      transferStartedAt: this.clock(),
      transferFinishedAt: this.clock(),
      transferMode: input.transferMode,
      estimatedCost: Number((input.bytesTransferred / 1024 / 1024 / 1024 * 0.09).toFixed(4)),
    });
  }

  findMatchingConsent(input) {
    return this.store.get("consents").find((consent) => (
      consent.patientId === input.patientId &&
      consent.sourceHospitalId === input.sourceHospitalId &&
      consent.targetHospitalId === input.targetHospitalId &&
      consent.purpose === normalizePurpose(input.purpose) &&
      this.isScopeAllowed(consent.consentId, input.studyInstanceUid, input.seriesInstanceUid)
    ));
  }

  isScopeAllowed(consentId, studyInstanceUid, seriesInstanceUid) {
    return this.store.get("consentScopes").some((scope) => (
      scope.consentId === consentId &&
      scope.allowed &&
      scope.studyInstanceUid === studyInstanceUid &&
      (!scope.seriesInstanceUid || !seriesInstanceUid || scope.seriesInstanceUid === seriesInstanceUid)
    ));
  }

  ensurePseudonymMapping(patientId, studyInstanceUid) {
    const mappings = this.store.get("pseudonymMappings");
    const existing = mappings.find((mapping) => mapping.patientId === patientId && mapping.studyInstanceUid === studyInstanceUid);
    if (existing) return existing;
    const pseudonymId = `R-PSEUDO-${createHmac("sha256", this.tokenSecret)
      .update(`${patientId}:${studyInstanceUid}`)
      .digest("hex")
      .slice(0, 12)
      .toUpperCase()}`;
    const mapping = {
      mappingId: makeId("pseudonym"),
      patientId,
      studyInstanceUid,
      pseudonymId,
      protectedPatientRef: this.pseudonymKeyProvider.protectPatientReference(patientId, studyInstanceUid),
      keyProvider: this.pseudonymKeyProvider.provider,
      keyId: this.pseudonymKeyProvider.currentKeyId?.() ?? null,
      createdAt: this.clock(),
      protection: "INTERNAL_CONTROL_PLANE_MAPPING_NOT_EXPOSED_TO_RESEARCH_API",
    };
    mappings.push(mapping);
    return mapping;
  }

  withPreviewImages(seriesRows) {
    return seriesRows.map((series) => ({
      ...series,
      previewImageUrl: series.previewImageUrl ?? this.defaultPreviewImage(series),
    }));
  }

  defaultPreviewImage(series) {
    const modality = (series.modality ?? "").toUpperCase();
    const label = `${series.description ?? ""}`.toUpperCase();
    if (modality.includes("MR") || label.includes("MRI") || label.includes("BRAIN")) return "/assets/demo-mri.png";
    if (modality.includes("CT") || label.includes("CHEST") || label.includes("LUNG")) return "/assets/demo-ct.png";
    return null;
  }

  async validateConsentInput(input) {
    const errors = [];
    const purpose = normalizePurpose(input.purpose);
    const validFrom = input.validFrom ?? this.clock();
    const scopes = input.scopes?.length ? input.scopes : (input.studyInstanceUid ? [{ studyInstanceUid: input.studyInstanceUid, seriesInstanceUid: input.seriesInstanceUid }] : []);

    if (!input.patientId) errors.push("PATIENT_REQUIRED");
    if (!input.sourceHospitalId) errors.push("SOURCE_HOSPITAL_REQUIRED");
    if (!input.targetHospitalId) errors.push("TARGET_HOSPITAL_REQUIRED");
    if (!input.validUntil) errors.push("VALID_UNTIL_REQUIRED");
    if (!input.permission) errors.push("PERMISSION_REQUIRED");
    if (!input.purpose) errors.push("PURPOSE_REQUIRED");
    if (!scopes.length) errors.push("CONSENT_SCOPE_REQUIRED");

    const patient = this.store.get("patients").find((item) => item.patientId === input.patientId);
    if (input.patientId && !patient) errors.push("PATIENT_NOT_FOUND");

    const sourceHospital = this.store.get("hospitals").find((item) => item.hospitalId === input.sourceHospitalId);
    if (input.sourceHospitalId && !sourceHospital) errors.push("SOURCE_HOSPITAL_NOT_FOUND");

    const targetHospital = this.store.get("hospitals").find((item) => item.hospitalId === input.targetHospitalId);
    if (input.targetHospitalId && !targetHospital) errors.push("TARGET_HOSPITAL_NOT_FOUND");

    if (input.sourceHospitalId && input.targetHospitalId && input.sourceHospitalId === input.targetHospitalId) {
      errors.push("HOSPITAL_RELATION_INVALID");
    }

    if (input.permission && !Object.values(Permission).includes(input.permission)) {
      errors.push("PERMISSION_INVALID");
    }

    if (input.purpose && !Object.values(ConsentPurpose).includes(purpose)) {
      errors.push("PURPOSE_INVALID");
    }

    const validFromMs = new Date(validFrom).getTime();
    const validUntilMs = input.validUntil ? new Date(input.validUntil).getTime() : null;

    if (Number.isNaN(validFromMs) || (validUntilMs !== null && Number.isNaN(validUntilMs))) {
      errors.push("VALID_PERIOD_INVALID");
    }

    if (validUntilMs !== null && !Number.isNaN(validFromMs) && !Number.isNaN(validUntilMs) && validFromMs >= validUntilMs) {
      errors.push("VALID_PERIOD_INVALID");
    }

    if (validUntilMs !== null && !Number.isNaN(validUntilMs) && validUntilMs <= new Date(this.clock()).getTime()) {
      errors.push("VALID_UNTIL_EXPIRED");
    }

    const seenScopes = new Set();
    for (const scope of scopes) {
      if (!scope.studyInstanceUid) {
        errors.push("STUDY_REQUIRED");
        continue;
      }
      const key = `${scope.studyInstanceUid}:${scope.seriesInstanceUid ?? ""}`;
      if (seenScopes.has(key)) {
        errors.push("CONSENT_SCOPE_DUPLICATED");
      }
      seenScopes.add(key);

      const study = this.store.get("imagingStudies").find((item) => item.studyInstanceUid === scope.studyInstanceUid);
      if (!study) {
        errors.push("STUDY_NOT_FOUND");
        continue;
      }
      if (study.patientId !== input.patientId) {
        errors.push("STUDY_PATIENT_MISMATCH");
      }
      if (study.sourceHospitalId !== input.sourceHospitalId) {
        errors.push("STUDY_SOURCE_HOSPITAL_MISMATCH");
      }
      if (scope.seriesInstanceUid) {
        const series = study.series?.find((item) => item.seriesInstanceUid === scope.seriesInstanceUid);
        if (!series) {
          errors.push("SERIES_NOT_FOUND");
        }
      }
    }

    return { ok: errors.length === 0, errors: [...new Set(errors)], scopes };
  }

  decorateConsent(consent) {
    return {
      ...consent,
      status: this.effectiveConsentStatus(consent),
      effectiveStatus: this.effectiveConsentStatus(consent),
    };
  }

  effectiveConsentStatus(consent) {
    if (consent.status === ConsentStatus.REVOKED) return ConsentStatus.REVOKED;
    if (new Date(consent.validUntil).getTime() < new Date(this.clock()).getTime()) return ConsentStatus.EXPIRED;
    return consent.status;
  }
}

function normalizeTokenTtlMinutes(value) {
  const parsed = Number(value ?? 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(10, Math.max(5, parsed));
}

function normalizeAnomalyRules(overrides = {}) {
  return {
    bulkAccessWindowMinutes: numberFromEnv("HIPASS_BULK_ACCESS_WINDOW_MINUTES", overrides.bulkAccessWindowMinutes, 5),
    bulkAccessThreshold: numberFromEnv("HIPASS_BULK_ACCESS_THRESHOLD", overrides.bulkAccessThreshold, 50),
    repeatedFailureWindowMinutes: numberFromEnv("HIPASS_REPEATED_FAILURE_WINDOW_MINUTES", overrides.repeatedFailureWindowMinutes, 10),
    repeatedFailureThreshold: numberFromEnv("HIPASS_REPEATED_FAILURE_THRESHOLD", overrides.repeatedFailureThreshold, 20),
    expiredTokenWindowMinutes: numberFromEnv("HIPASS_EXPIRED_TOKEN_WINDOW_MINUTES", overrides.expiredTokenWindowMinutes, 10),
    expiredTokenThreshold: numberFromEnv("HIPASS_EXPIRED_TOKEN_THRESHOLD", overrides.expiredTokenThreshold, 10),
    unusualDownloadWindowMinutes: numberFromEnv("HIPASS_UNUSUAL_DOWNLOAD_WINDOW_MINUTES", overrides.unusualDownloadWindowMinutes, 60),
    unusualDownloadThreshold: numberFromEnv("HIPASS_UNUSUAL_DOWNLOAD_THRESHOLD", overrides.unusualDownloadThreshold, 5),
    unusualDownloadStartHour: numberFromEnv("HIPASS_UNUSUAL_DOWNLOAD_START_HOUR", overrides.unusualDownloadStartHour, 0),
    unusualDownloadEndHour: numberFromEnv("HIPASS_UNUSUAL_DOWNLOAD_END_HOUR", overrides.unusualDownloadEndHour, 6),
  };
}

function normalizeDeIdentificationPolicy(overrides = {}) {
  return {
    datePolicy: enumFromEnv("HIPASS_DEID_DATE_POLICY", overrides.datePolicy, DatePolicy, DatePolicy.YEAR_ONLY),
    uidPolicy: enumFromEnv("HIPASS_DEID_UID_POLICY", overrides.uidPolicy, UidPolicy, UidPolicy.REGENERATE_UID),
    kAnonymityThreshold: numberFromEnv("HIPASS_DEID_K_ANONYMITY_THRESHOLD", overrides.kAnonymityThreshold, 5),
    minimumDatasetSize: numberFromEnv("HIPASS_DEID_MIN_DATASET_SIZE", overrides.minimumDatasetSize, 20),
    blockHighRiskPixelData: booleanFromEnv("HIPASS_DEID_BLOCK_HIGH_RISK_PIXEL_DATA", overrides.blockHighRiskPixelData, true),
  };
}

function enumFromEnv(name, override, enumObject, fallback) {
  const value = override ?? process.env[name] ?? fallback;
  return Object.values(enumObject).includes(value) ? value : fallback;
}

function numberFromEnv(name, override, fallback) {
  const parsed = Number(override ?? process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function booleanFromEnv(name, override, fallback) {
  const value = override ?? process.env[name] ?? fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function requireResearchFields(input, fields) {
  const missing = fields.filter((field) => input[field] === undefined || input[field] === null || input[field] === "");
  return missing.length ? `Missing required field(s): ${missing.join(", ")}` : null;
}

function researchDatasetId(studyInstanceUid, seriesInstanceUid) {
  const source = seriesInstanceUid ? `${studyInstanceUid}:${seriesInstanceUid}` : studyInstanceUid;
  return `research-dataset-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;
}

function sanitizeDicomHeader(study, patient, pseudonymId, uidMap, policy) {
  return {
    PatientName: "REMOVED",
    PatientID: pseudonymId,
    PatientBirthDate: "REMOVED",
    PatientAddress: "REMOVED",
    PatientTelephoneNumbers: "REMOVED",
    OtherPatientIDs: "REMOVED",
    InstitutionName: "VIRTUAL_HOSPITAL",
    StudyInstanceUID: uidMap.studyInstanceUid,
    SeriesInstanceUIDs: study.series?.map((series) => uidMap.seriesInstanceUids[series.seriesInstanceUid]) ?? [],
    SOPInstanceUIDs: Object.values(uidMap.sopInstanceUids),
    Modality: study.modality,
    BodyPartExamined: generalizeBodyPart(study.bodyPart),
    StudyDescription: study.description,
    StudyDate: generalizeDate(study.studyDate, policy.datePolicy),
    MedicalUtilityDecision: "Retained non-direct clinical metadata needed for research cohorting",
  };
}

function buildResearchUidMap(study, seriesInstanceUid, sopInstanceUid, secret) {
  const selectedSeries = seriesInstanceUid
    ? study.series?.filter((series) => series.seriesInstanceUid === seriesInstanceUid)
    : study.series;
  const seriesInstanceUids = {};
  for (const series of selectedSeries ?? []) {
    seriesInstanceUids[series.seriesInstanceUid] = pseudonymDicomUid(series.seriesInstanceUid, secret);
  }
  const sopInstanceUids = {};
  if (sopInstanceUid) {
    sopInstanceUids[sopInstanceUid] = pseudonymDicomUid(sopInstanceUid, secret);
  }
  return {
    studyInstanceUid: pseudonymDicomUid(study.studyInstanceUid, secret),
    seriesInstanceUids,
    sopInstanceUids,
  };
}

function pseudonymDicomUid(value, secret) {
  const hex = createHmac("sha256", secret).update(String(value)).digest("hex").slice(0, 30);
  return `2.25.${BigInt(`0x${hex}`).toString(10)}`;
}

function generalizeDate(value, policy) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (policy === DatePolicy.YEAR_MONTH) return digits.slice(0, 6);
  return digits.slice(0, 4);
}

function generalizeBodyPart(bodyPart) {
  const value = String(bodyPart ?? "").toUpperCase();
  if (["BRAIN", "HEAD", "SKULL", "FACE", "FACIAL"].some((token) => value.includes(token))) return "HEAD";
  if (["CHEST", "LUNG"].some((token) => value.includes(token))) return "CHEST";
  if (["ABDOMEN", "PELVIS"].some((token) => value.includes(token))) return "TRUNK";
  if (["KNEE", "ARM", "LEG", "HAND", "FOOT"].some((token) => value.includes(token))) return "EXTREMITY";
  return "OTHER";
}

function researchQuasiIdentifier(study, patient, policy) {
  const age = patient?.birthDate ? ageAtStudy(patient.birthDate, study.studyDate) : null;
  const values = {
    ageGroup: age === null ? "UNKNOWN" : `${Math.floor(age / 10) * 10}s`,
    studyDateGroup: generalizeDate(study.studyDate, policy.datePolicy),
    bodyPartCategory: generalizeBodyPart(study.bodyPart),
    modality: study.modality,
    hospitalCategory: "VIRTUAL_HOSPITAL",
  };
  return {
    values,
    key: Object.values(values).join("|"),
  };
}

function ageAtStudy(birthDate, studyDate) {
  const birthYear = Number(String(birthDate).slice(0, 4));
  const studyYear = Number(String(studyDate).slice(0, 4));
  if (!Number.isFinite(birthYear) || !Number.isFinite(studyYear)) return null;
  return Math.max(0, studyYear - birthYear);
}

function maskClinicalReport(reportText, patient) {
  let masked = String(reportText ?? "");
  const names = [patient?.name, "Virtual Patient", "Test Patient"].filter(Boolean);
  for (const name of names) {
    masked = masked.replaceAll(name, "[NAME]");
  }
  return masked
    .replace(/\bP-\d{3,}\b/g, "[PATIENT_ID]")
    .replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, "[PHONE]")
    .replace(/(Address|주소)\s*:\s*[^,\n]+/gi, "$1: [ADDRESS]")
    .replace(/(PatientName|Name|이름)\s*:\s*[^,\n]+/gi, "$1: [NAME]")
    .replace(/(PatientID|환자번호)\s*:\s*[A-Za-z0-9-]+/gi, "$1: [PATIENT_ID]");
}

function sampleClinicalReport(patient) {
  return `Name: ${patient.name}, PatientID: ${patient.patientId}, Address: Demo Research City, Phone: 010-0000-0000. Findings: sample report for MVP validation.`;
}

function isHighRiskImageStudy(study) {
  const haystack = `${study.modality ?? ""} ${study.bodyPart ?? ""} ${study.description ?? ""}`.toUpperCase();
  return /\b(FACE|FACIAL|MAXILLOFACIAL)\b/.test(haystack) || (haystack.includes("3D") && /\b(HEAD|SKULL|BRAIN)\b/.test(haystack));
}

function isAnomalyAction(action) {
  return [
    AuditAction.BULK_ACCESS_DETECTED,
    AuditAction.REPEATED_ACCESS_FAILURE,
    AuditAction.EXPIRED_TOKEN_ABUSE,
    AuditAction.UNUSUAL_DOWNLOAD_PATTERN,
  ].includes(action);
}

function isUnusualDownloadHour(iso, rules) {
  const hour = new Date(iso).getUTCHours();
  const start = rules.unusualDownloadStartHour;
  const end = rules.unusualDownloadEndHour;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

function auditRecordHash(log) {
  const payload = {
    auditId: log.auditId,
    auditSessionId: log.auditSessionId,
    actorType: log.actorType,
    actorId: log.actorId,
    hospitalId: log.hospitalId ?? null,
    patientId: log.patientId ?? null,
    consentId: log.consentId ?? null,
    sourceHospitalId: log.sourceHospitalId ?? null,
    targetHospitalId: log.targetHospitalId ?? null,
    action: log.action,
    studyInstanceUid: log.studyInstanceUid ?? null,
    seriesInstanceUid: log.seriesInstanceUid ?? null,
    sopInstanceUid: log.sopInstanceUid ?? null,
    ipAddress: log.ipAddress ?? null,
    userAgent: log.userAgent ?? null,
    createdAt: log.createdAt,
    result: log.result,
    reasonCode: log.reasonCode ?? log.reason ?? null,
    previousHash: log.previousHash ?? null,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function signTokenParts(encodedHeader, encodedPayload, secret) {
  return createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function digestToken(token) {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function buildDicomTokenScope(studyInstanceUid, allowedSeriesUids, permission) {
  return {
    studyInstanceUid,
    allowedSeriesUids: [...new Set(allowedSeriesUids ?? [])],
    actions: permission === Permission.DOWNLOAD_ALLOWED ? ["VIEW", "DOWNLOAD"] : ["VIEW"],
  };
}

function dicomValue(row, tag) {
  const value = row?.[tag]?.Value;
  return Array.isArray(value) ? value[0] : undefined;
}
