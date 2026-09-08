import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const HealthDataProviderStatus = Object.freeze({
  AVAILABLE: "AVAILABLE",
  NOT_CONFIGURED: "NOT_CONFIGURED",
});

export const PhrDataStatus = Object.freeze({
  AVAILABLE: "AVAILABLE",
  NOT_AVAILABLE: "NOT_AVAILABLE",
});

export const PhrProviderErrorCode = Object.freeze({
  AUTHENTICATION_REQUIRED: "PHR_AUTHENTICATION_REQUIRED",
  PATIENT_BINDING_MISMATCH: "PHR_PATIENT_BINDING_MISMATCH",
  PROVIDER_NOT_CONFIGURED: "PHR_PROVIDER_NOT_CONFIGURED",
  RESOURCE_UNSUPPORTED: "PHR_RESOURCE_UNSUPPORTED",
  PAYLOAD_LIMIT_EXCEEDED: "PHR_PAYLOAD_LIMIT_EXCEEDED",
  CURSOR_INVALID: "PHR_CURSOR_INVALID",
  FIXTURE_INTEGRITY_FAILED: "PHR_FIXTURE_INTEGRITY_FAILED",
  IMAGING_NOT_MAPPED: "PHR_IMAGING_NOT_MAPPED",
  CONSENT_REQUEST_INVALID: "PHR_CONSENT_REQUEST_INVALID",
});

const RESOURCE_METHODS = Object.freeze({
  Encounter: "listEncounters",
  Condition: "listConditions",
  MedicationRequest: "listMedications",
  Observation: "listObservations",
  DiagnosticReport: "listDiagnosticReports",
  ImagingStudy: "listImagingStudies",
});
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_QUERY_RANGE_MS = 5 * 366 * 24 * 60 * 60 * 1000;
const ALLOWED_PAGE_KEYS = new Set(["cursor", "limit", "from", "to", "status"]);
const DEFAULT_FIXTURE_ROOT = path.resolve("test/fixtures/phr/r4/v1");

export class PhrProviderError extends Error {
  constructor(statusCode, code, message = code) {
    super(message);
    this.name = "PhrProviderError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class HealthDataProvider {
  getCapabilities() {
    throw new PhrProviderError(501, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
  }

  getPatientRecord() {
    throw new PhrProviderError(501, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
  }
}

export class SyntheticFhirProvider extends HealthDataProvider {
  constructor(options = {}) {
    super();
    this.providerId = "synthetic-r4";
    this.fixtureRoot = path.resolve(options.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
    this.cursorSecret = requireCursorSecret(options.cursorSecret);
    this.clock = options.clock ?? (() => new Date());
    this.manifest = readJson(path.join(this.fixtureRoot, "manifest.json"));
    verifyFixtureIntegrity(this.fixtureRoot, this.manifest);
    this.identityMap = readJson(path.join(this.fixtureRoot, "identity-map.synthetic.json"));
    this.bundlesByPatientRef = loadBoundBundles(this.fixtureRoot, this.identityMap);
  }

  getCapabilities() {
    return {
      providerId: this.providerId,
      status: HealthDataProviderStatus.AVAILABLE,
      fhirVersion: this.manifest.fhirVersion,
      synthetic: true,
      resources: ["Patient", ...Object.keys(RESOURCE_METHODS)],
      maxPageSize: MAX_LIMIT,
      externalNetworkRequired: false,
    };
  }

  getPatientRecord(context) {
    const fixture = this.#authorizedFixture(context);
    return this.#response(
      Object.freeze(Object.fromEntries(
        ["Patient", ...Object.keys(RESOURCE_METHODS)].map((type) => [pluralKey(type), clone(fixture.resourcesByType.get(type) ?? [])]),
      )),
      context,
      null,
    );
  }

  listEncounters(context, page = {}) { return this.#list("Encounter", context, page); }
  listConditions(context, page = {}) { return this.#list("Condition", context, page); }
  listMedications(context, page = {}) { return this.#list("MedicationRequest", context, page); }
  listObservations(context, page = {}) { return this.#list("Observation", context, page); }
  listDiagnosticReports(context, page = {}) { return this.#list("DiagnosticReport", context, page); }
  listImagingStudies(context, page = {}) { return this.#list("ImagingStudy", context, page); }

  #list(resourceType, context, page) {
    const fixture = this.#authorizedFixture(context);
    const query = normalizePageQuery(page);
    const bindingKey = cursorBindingKey(this.providerId, context.patientRef, resourceType, query);
    const offset = query.cursor ? verifyCursor(query.cursor, bindingKey, this.cursorSecret) : 0;
    const filtered = (fixture.resourcesByType.get(resourceType) ?? [])
      .filter((resource) => matchesQuery(resource, query))
      .toSorted(compareClinicalResource);
    if (offset > filtered.length) throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
    const items = filtered.slice(offset, offset + query.limit).map(clone);
    const nextOffset = offset + items.length;
    const nextCursor = nextOffset < filtered.length ? issueCursor(nextOffset, bindingKey, this.cursorSecret) : null;
    return this.#response(items, context, { limit: query.limit, nextCursor });
  }

  #authorizedFixture(context) {
    validateContext(context);
    const binding = this.identityMap.bindings.find((candidate) => (
      candidate.providerId === this.providerId
      && candidate.accountSubject === context.principalSubject
    ));
    if (!binding || binding.patientRef !== context.patientRef) {
      throw providerError(403, PhrProviderErrorCode.PATIENT_BINDING_MISMATCH);
    }
    const fixture = this.bundlesByPatientRef.get(context.patientRef);
    if (!fixture) throw providerError(403, PhrProviderErrorCode.PATIENT_BINDING_MISMATCH);
    return fixture;
  }

  #response(data, context, page) {
    const meta = {
      sourceProvider: this.providerId,
      fhirVersion: this.manifest.fhirVersion,
      synthetic: true,
      retrievedAt: this.clock().toISOString(),
      dataStatus: dataLength(data) > 0 ? PhrDataStatus.AVAILABLE : PhrDataStatus.NOT_AVAILABLE,
      correlationId: context.correlationId,
    };
    if (page) meta.page = page;
    return { data, meta };
  }
}

export class MyHealthWayProvider extends HealthDataProvider {
  getCapabilities() {
    return {
      providerId: "my-health-way",
      status: HealthDataProviderStatus.NOT_CONFIGURED,
      fhirVersion: null,
      synthetic: false,
      resources: [],
      maxPageSize: 0,
      externalNetworkRequired: true,
    };
  }

  getPatientRecord() { throw notConfigured(); }
  listEncounters() { throw notConfigured(); }
  listConditions() { throw notConfigured(); }
  listMedications() { throw notConfigured(); }
  listObservations() { throw notConfigured(); }
  listDiagnosticReports() { throw notConfigured(); }
  listImagingStudies() { throw notConfigured(); }
}

function validateContext(context) {
  if (!context?.principalSubject || !context.patientRef || !context.correlationId) {
    throw providerError(401, PhrProviderErrorCode.AUTHENTICATION_REQUIRED);
  }
}

function requireCursorSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED, "A 32-byte cursor secret is required");
  }
  return secret;
}

function loadBoundBundles(fixtureRoot, identityMap) {
  const result = new Map();
  for (const binding of identityMap.bindings) {
    const suffix = binding.fhirPatientId.endsWith("-a") ? "a" : binding.fhirPatientId.endsWith("-b") ? "b" : null;
    if (!suffix) throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
    const bundle = readJson(path.join(fixtureRoot, `patient-${suffix}-bundle.json`));
    const resourcesByType = new Map();
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource;
      if (!resource?.resourceType || !resource.id) throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
      const bucket = resourcesByType.get(resource.resourceType) ?? [];
      bucket.push(resource);
      resourcesByType.set(resource.resourceType, bucket);
    }
    const patients = resourcesByType.get("Patient") ?? [];
    if (patients.length !== 1 || patients[0].id !== binding.fhirPatientId) {
      throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
    }
    result.set(binding.patientRef, { binding, bundle, resourcesByType });
  }
  return result;
}

function verifyFixtureIntegrity(fixtureRoot, manifest) {
  if (manifest.synthetic !== true || manifest.clinicalUseProhibited !== true || manifest.fhirVersion !== "4.0.1") {
    throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
  }
  for (const [relativePath, expectedHash] of Object.entries(manifest.files ?? {})) {
    const actualHash = createHash("sha256").update(readFileSync(path.join(fixtureRoot, relativePath))).digest("hex");
    if (!safeEqualText(actualHash, expectedHash)) throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
  }
}

function normalizePageQuery(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  }
  if (Object.keys(page).some((key) => !ALLOWED_PAGE_KEYS.has(key))) {
    throw providerError(422, PhrProviderErrorCode.RESOURCE_UNSUPPORTED);
  }
  const limit = page.limit === undefined ? DEFAULT_LIMIT : Number(page.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw providerError(413, PhrProviderErrorCode.PAYLOAD_LIMIT_EXCEEDED);
  }
  const from = optionalDate(page.from);
  const to = optionalDate(page.to);
  if (from && to && from > to) throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  if (from && to && to.getTime() - from.getTime() > MAX_QUERY_RANGE_MS) {
    throw providerError(413, PhrProviderErrorCode.PAYLOAD_LIMIT_EXCEEDED);
  }
  return {
    limit,
    cursor: page.cursor ?? null,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    status: page.status ?? null,
  };
}

function optionalDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  return date;
}

function matchesQuery(resource, query) {
  if (query.status && resource.status !== query.status) return false;
  const date = clinicalDate(resource);
  if (query.from && (!date || date < query.from)) return false;
  if (query.to && (!date || date > query.to)) return false;
  return true;
}

function clinicalDate(resource) {
  return resource.started
    ?? resource.effectiveDateTime
    ?? resource.recordedDate
    ?? resource.authoredOn
    ?? resource.period?.start
    ?? resource.meta?.lastUpdated
    ?? null;
}

function compareClinicalResource(left, right) {
  return String(clinicalDate(right) ?? "").localeCompare(String(clinicalDate(left) ?? ""))
    || resourceKey(left).localeCompare(resourceKey(right));
}

function cursorBindingKey(providerId, patientRef, resourceType, query) {
  return [providerId, patientRef, resourceType, query.from ?? "", query.to ?? "", query.status ?? "", query.limit].join("\u001f");
}

function issueCursor(offset, bindingKey, secret) {
  const value = String(offset);
  const signature = createHmac("sha256", secret).update(`${bindingKey}\u001f${value}`).digest("base64url");
  return `${value}.${signature}`;
}

function verifyCursor(cursor, bindingKey, secret) {
  if (typeof cursor !== "string") throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  const [value, signature, extra] = cursor.split(".");
  if (extra !== undefined || !/^(?:0|[1-9]\d*)$/.test(value) || !signature) {
    throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  }
  const expected = createHmac("sha256", secret).update(`${bindingKey}\u001f${value}`).digest("base64url");
  if (!safeEqualText(signature, expected)) throw providerError(400, PhrProviderErrorCode.CURSOR_INVALID);
  return Number(value);
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw providerError(500, PhrProviderErrorCode.FIXTURE_INTEGRITY_FAILED);
  }
}

function resourceKey(resource) { return `${resource.resourceType}/${resource.id}`; }
function clone(value) { return structuredClone(value); }
function pluralKey(type) {
  return ({
    Patient: "patients",
    Encounter: "encounters",
    Condition: "conditions",
    MedicationRequest: "medications",
    Observation: "observations",
    DiagnosticReport: "diagnosticReports",
    ImagingStudy: "imagingStudies",
  })[type];
}
function dataLength(data) { return Array.isArray(data) ? data.length : Object.values(data).reduce((sum, items) => sum + items.length, 0); }
function notConfigured() { return providerError(503, PhrProviderErrorCode.PROVIDER_NOT_CONFIGURED); }
function providerError(statusCode, code, message = code) { return new PhrProviderError(statusCode, code, message); }
