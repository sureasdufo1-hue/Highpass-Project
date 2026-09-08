import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrincipalRole } from "./auth.js";
import { PhrProviderError, PhrProviderErrorCode } from "./health-data-provider.js";

export const PhrAuditAction = Object.freeze({
  ACCESS_REQUESTED: "PHR_ACCESS_REQUESTED",
  ACCESS_ALLOWED: "PHR_ACCESS_ALLOWED",
  ACCESS_DENIED: "PHR_ACCESS_DENIED",
  PROVIDER_FAILED: "PHR_PROVIDER_FAILED",
  IMAGING_MAPPING_CHECKED: "PHR_IMAGING_MAPPING_CHECKED",
  VIEWER_LAUNCH_REQUESTED: "PHR_VIEWER_LAUNCH_REQUESTED",
  SHARE_INTENT_CREATED: "PHR_SHARE_INTENT_CREATED",
  SHARE_INTENT_DENIED: "PHR_SHARE_INTENT_DENIED",
});

const DEFAULT_MAPPING_PATH = path.resolve("test/fixtures/phr/r4/v1/imaging-map.synthetic.json");
const RESOURCE_METHODS = Object.freeze({
  encounters: "listEncounters",
  conditions: "listConditions",
  medications: "listMedications",
  observations: "listObservations",
  "diagnostic-reports": "listDiagnosticReports",
  "imaging-studies": "listImagingStudies",
});

export class PhrService {
  constructor(options) {
    if (!options?.provider || !options.auditService || !options.store) throw new Error("PHR service dependencies are required");
    this.provider = options.provider;
    this.auditService = options.auditService;
    this.consentService = options.consentService ?? null;
    this.store = options.store;
    this.referenceSecret = requireReferenceSecret(options.referenceSecret);
    this.imagingMappings = loadImagingMappings(options.imagingMappingPath ?? DEFAULT_MAPPING_PATH);
  }

  async getSummary(principal, requestContext) {
    return this.#execute(principal, requestContext, "summary", async (providerContext) => {
      const record = this.provider.getPatientRecord(providerContext);
      return {
        data: {
          patient: normalizePatient(record.data.patients[0], principal.patientId, this.#reference.bind(this)),
          counts: Object.freeze({
            encounters: record.data.encounters.length,
            conditions: record.data.conditions.length,
            medications: record.data.medications.length,
            observations: record.data.observations.length,
            diagnosticReports: record.data.diagnosticReports.length,
            imagingStudies: record.data.imagingStudies.length,
          }),
        },
        meta: record.meta,
      };
    });
  }

  async list(resourceName, principal, query, requestContext) {
    const providerMethod = RESOURCE_METHODS[resourceName];
    if (!providerMethod) throw new PhrProviderError(422, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
    return this.#execute(principal, requestContext, resourceName, async (providerContext) => {
      const result = this.provider[providerMethod](providerContext, query);
      const data = result.data.map((resource) => this.#normalizeResource(resource, principal.patientId));
      if (resourceName === "imaging-studies") {
        for (const item of data) {
          await this.#writeAudit(principal, requestContext, PhrAuditAction.IMAGING_MAPPING_CHECKED, "SUCCESS", item.mappingStatus, {
            hospitalId: item.sourceOrganizationRef,
          });
        }
      }
      return { data, meta: result.meta };
    });
  }

  async getImagingStudy(imagingStudyRef, principal, requestContext) {
    return this.#execute(principal, requestContext, "imaging-study-detail", async (providerContext) => {
      const result = this.provider.listImagingStudies(providerContext, { limit: 50 });
      const normalized = result.data.map((resource) => this.#normalizeImagingStudy(resource, principal.patientId));
      const item = normalized.find((candidate) => candidate.imagingStudyRef === imagingStudyRef);
      if (!item) throw new PhrProviderError(404, PhrProviderErrorCode.RESOURCE_UNSUPPORTED, "Imaging study not found");
      await this.#writeAudit(principal, requestContext, PhrAuditAction.IMAGING_MAPPING_CHECKED, "SUCCESS", item.mappingStatus, {
        hospitalId: item.sourceOrganizationRef,
      });
      return { data: item, meta: result.meta };
    });
  }

  async createConsentFromImagingStudy(imagingStudyRef, principal, body, requestContext) {
    return this.#execute(principal, requestContext, "imaging-study-consent", async () => {
      const context = normalizeRequestContext(requestContext);
      if (!this.consentService) throw new PhrProviderError(503, PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED, "Consent service is not wired");
      const mapping = this.#resolveMapping(principal.patientId, imagingStudyRef);
      if (!mapping) throw new PhrProviderError(404, PhrProviderErrorCode.RESOURCE_UNSUPPORTED, "Imaging study not found");
      if (mapping.mappingStatus !== "MAPPED") {
        await this.#writeAudit(principal, context, PhrAuditAction.SHARE_INTENT_DENIED, "FAIL", PhrProviderErrorCode.IMAGING_NOT_MAPPED, {
          hospitalId: mapping.sourceOrganizationRef,
        });
        throw new PhrProviderError(403, PhrProviderErrorCode.IMAGING_NOT_MAPPED);
      }
      const missing = ["targetHospitalId", "purpose", "permission", "validUntil"].filter((field) => !body?.[field]);
      if (missing.length > 0) throw new PhrProviderError(422, PhrProviderErrorCode.CONSENT_REQUEST_INVALID, "Consent request fields are missing");
      const scopes = (mapping.allowedSeriesUids?.length ? mapping.allowedSeriesUids : [null]).map((seriesInstanceUid) => ({
        studyInstanceUid: mapping.studyInstanceUid,
        seriesInstanceUid,
      }));
      let consent;
      try {
        consent = await this.consentService.createConsent({
          patientId: principal.patientId,
          sourceHospitalId: mapping.sourceOrganizationRef,
          targetHospitalId: body.targetHospitalId,
          purpose: body.purpose,
          permission: body.permission,
          validFrom: body.validFrom ?? undefined,
          validUntil: body.validUntil,
          scopes,
        });
      } catch (error) {
        if (error?.name === "ServiceValidationError") {
          await this.#writeAudit(principal, context, PhrAuditAction.SHARE_INTENT_DENIED, "FAIL", error.code, {
            hospitalId: mapping.sourceOrganizationRef,
          });
          throw new PhrProviderError(400, PhrProviderErrorCode.CONSENT_REQUEST_INVALID, "Consent request was rejected");
        }
        throw error;
      }
      await this.#writeAudit(principal, context, PhrAuditAction.SHARE_INTENT_CREATED, "SUCCESS", null, {
        hospitalId: mapping.sourceOrganizationRef,
        consentId: consent.consentId,
      });
      return {
        data: {
          consentId: consent.consentId,
          imagingStudyRef,
          status: consent.status,
          permission: consent.permission,
          purpose: consent.purpose,
          targetHospitalId: consent.targetHospitalId,
          validFrom: consent.validFrom,
          validUntil: consent.validUntil,
          scopeCount: scopes.length,
        },
        meta: { correlationId: context.correlationId, requestedAt: context.requestedAt },
      };
    });
  }

  #resolveMapping(patientRef, imagingStudyRef) {
    const candidate = Buffer.from(String(imagingStudyRef));
    for (const mapping of this.imagingMappings) {
      if (mapping.patientRef !== patientRef) continue;
      const expected = Buffer.from(this.#reference(patientRef, "ImagingStudy", mapping.fhirImagingStudyId));
      if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) return mapping;
    }
    return null;
  }

  async #execute(principal, requestContext, resourceName, operation) {
    const context = normalizeRequestContext(requestContext);
    await this.#writeAudit(principal, context, PhrAuditAction.ACCESS_REQUESTED, "SUCCESS", null);
    try {
      validatePhrPrincipal(principal);
      const response = await operation({
        principalSubject: principal.subject,
        patientRef: principal.patientId,
        correlationId: context.correlationId,
        requestedAt: context.requestedAt,
      });
      await this.#writeAudit(principal, context, PhrAuditAction.ACCESS_ALLOWED, "SUCCESS", null);
      await this.store.save();
      return response;
    } catch (error) {
      const providerFailure = error instanceof PhrProviderError
        && [PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED].includes(error.code);
      await this.#writeAudit(
        principal,
        context,
        providerFailure ? PhrAuditAction.PROVIDER_FAILED : PhrAuditAction.ACCESS_DENIED,
        "FAIL",
        safeReasonCode(error),
      );
      await this.store.save();
      throw error;
    }
  }

  async #writeAudit(principal, context, action, result, reasonCode, extra = {}) {
    await this.auditService.writeAudit({
      auditSessionId: context.correlationId,
      actorType: principal?.role ?? principal?.actorType ?? "UNKNOWN",
      actorId: principal?.subject ?? "UNKNOWN",
      patientId: principal?.role === PrincipalRole.PATIENT ? principal.patientId : null,
      hospitalId: extra.hospitalId ?? null,
      consentId: extra.consentId ?? null,
      action,
      result,
      reasonCode,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  #normalizeResource(resource, patientRef) {
    if (resource.resourceType === "ImagingStudy") return this.#normalizeImagingStudy(resource, patientRef);
    const resourceRef = this.#reference(patientRef, resource.resourceType, resource.id);
    if (resource.resourceType === "Encounter") return {
      resourceRef, status: resource.status, class: clone(resource.class), period: clone(resource.period),
      sourceOrganization: resource.serviceProvider?.display ?? "NOT_PROVIDED",
    };
    if (resource.resourceType === "Condition") return {
      resourceRef, clinicalStatus: clone(resource.clinicalStatus), verificationStatus: clone(resource.verificationStatus),
      code: clone(resource.code), recordedDate: resource.recordedDate ?? "NOT_PROVIDED",
    };
    if (resource.resourceType === "MedicationRequest") return {
      resourceRef, status: resource.status, intent: resource.intent, medication: clone(resource.medicationCodeableConcept),
      authoredOn: resource.authoredOn ?? "NOT_PROVIDED", dosageInstruction: clone(resource.dosageInstruction ?? []),
    };
    if (resource.resourceType === "Observation") return {
      resourceRef, status: resource.status, category: clone(resource.category ?? []), code: clone(resource.code),
      effectiveDateTime: resource.effectiveDateTime ?? "NOT_PROVIDED", valueQuantity: clone(resource.valueQuantity ?? null),
      referenceRange: clone(resource.referenceRange ?? []),
    };
    if (resource.resourceType === "DiagnosticReport") return {
      resourceRef, status: resource.status, code: clone(resource.code),
      effectiveDateTime: resource.effectiveDateTime ?? "NOT_PROVIDED", issued: resource.issued ?? "NOT_PROVIDED",
      conclusion: resource.conclusion ?? "NOT_PROVIDED",
    };
    throw new PhrProviderError(422, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
  }

  #normalizeImagingStudy(resource, patientRef) {
    const mapping = this.imagingMappings.find((candidate) => (
      candidate.patientRef === patientRef && candidate.fhirImagingStudyId === resource.id
    ));
    const mappingStatus = mapping?.mappingStatus ?? "NOT_MAPPED";
    return {
      imagingStudyRef: this.#reference(patientRef, "ImagingStudy", resource.id),
      metadataStatus: "AVAILABLE",
      mappingStatus,
      accessStatus: mappingStatus === "MAPPED" ? "CONSENT_REQUIRED" : mappingStatus === "SOURCE_UNAVAILABLE" ? "SOURCE_UNAVAILABLE" : "ACCESS_DENIED",
      status: resource.status,
      started: resource.started ?? "NOT_PROVIDED",
      modality: clone(resource.modality ?? []),
      description: resource.description ?? "NOT_PROVIDED",
      numberOfSeries: resource.numberOfSeries ?? null,
      numberOfInstances: resource.numberOfInstances ?? null,
      sourceOrganizationRef: mapping?.sourceOrganizationRef ?? "NOT_AVAILABLE",
      synthetic: true,
    };
  }

  #reference(patientRef, resourceType, resourceId) {
    return `phr_${createHmac("sha256", this.referenceSecret)
      .update(`${patientRef}\u001f${resourceType}\u001f${resourceId}`)
      .digest("base64url")}`;
  }
}

function normalizeRequestContext(requestContext) {
  if (!requestContext?.correlationId) {
    throw new PhrProviderError(401, PhrProviderErrorCode.AUTHENTICATION_REQUIRED);
  }
  return {
    correlationId: requestContext.correlationId,
    requestedAt: requestContext.requestedAt ?? new Date().toISOString(),
    ipAddress: requestContext.ipAddress ?? null,
    userAgent: requestContext.userAgent ?? null,
  };
}

function validatePhrPrincipal(principal) {
  if (!principal?.subject) throw new PhrProviderError(401, PhrProviderErrorCode.AUTHENTICATION_REQUIRED);
  if (principal.role !== PrincipalRole.PATIENT || !principal.patientId) {
    throw new PhrProviderError(403, PhrProviderErrorCode.PATIENT_BINDING_MISMATCH);
  }
}

function requireReferenceSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("A 32-byte PHR reference secret is required");
  return secret;
}

function loadImagingMappings(filePath) {
  const parsed = JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
  if (!Array.isArray(parsed.mappings)) throw new Error("Invalid PHR imaging mapping fixture");
  return parsed.mappings;
}

function normalizePatient(resource, patientRef, reference) {
  return {
    patientRef: reference(patientRef, "Patient", resource.id),
    displayName: resource.name?.[0]?.text ?? "NOT_PROVIDED",
    active: resource.active ?? null,
    synthetic: true,
  };
}

function safeReasonCode(error) {
  return typeof error?.code === "string" && /^PHR_[A-Z0-9_]+$/.test(error.code) ? error.code : "PHR_REQUEST_FAILED";
}

function clone(value) { return structuredClone(value); }
