import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PrivacyErrorCode,
  PrivacyProcessingError,
  isPrivacyPurpose,
} from "./privacy-contracts.js";

export class ApprovedUseRegistry {
  constructor(records, options = {}) {
    if (new Set(records.map((record) => record.approvedUseRef)).size !== records.length) {
      throw new Error("Approved-use registry contains duplicate references");
    }
    this.records = new Map(records.map((record) => [record.approvedUseRef, freezeRecord(record)]));
    this.clock = options.clock ?? (() => new Date());
    this.digest = options.digest ?? digestJson(records);
  }

  static fromFile(filePath = path.join(process.cwd(), "config", "privacy", "approved-uses.synthetic.json"), options = {}) {
    const contents = readFileSync(filePath, "utf8");
    const payload = JSON.parse(contents);
    if (!Array.isArray(payload.records)) throw new Error("Approved-use registry requires records[]");
    return new ApprovedUseRegistry(payload.records, { ...options, digest: createHash("sha256").update(contents).digest("hex") });
  }

  resolve(input, action = "privacy:inspect", requesterRef = null) {
    if (!isPrivacyPurpose(input?.purpose)) throw denied();
    const record = this.records.get(input?.approvedUseRef);
    if (!record) throw denied();
    const now = this.clock().getTime();
    const issuedAt = Date.parse(record.issuedAt);
    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || now < issuedAt || now >= expiresAt || record.revokedAt) throw denied();
    if (!record.allowedActions.includes(action)) throw denied();
    if (!requesterRef || record.requesterRef !== requesterRef) throw denied();
    for (const field of ["purpose", "recipientRef", "sourceOrganizationId", "sourceArtifactRef", "sourceArtifactVersion"]) {
      if (input[field] !== record[field]) throw denied();
    }
    return record;
  }
}

export class PrivacyRuleRegistry {
  constructor(bundle, digest = digestJson(bundle)) {
    this.bundle = deepFreeze(structuredClone(bundle));
    this.digest = digest;
  }

  static fromFile(filePath = path.join(process.cwd(), "config", "privacy", "rules.synthetic.json")) {
    const contents = readFileSync(filePath, "utf8");
    return new PrivacyRuleRegistry(JSON.parse(contents), createHash("sha256").update(contents).digest("hex"));
  }

  profile(profileId) {
    const profile = this.bundle.profiles?.[profileId];
    if (!profile || profile.enabled !== true) throw new PrivacyProcessingError(403, PrivacyErrorCode.POLICY_DENIED, "Privacy policy profile is not active");
    return profile;
  }
}

function freezeRecord(record) {
  const required = [
    "approvedUseRef", "sourceOrganizationId", "sourceArtifactRef", "sourceArtifactVersion",
    "purpose", "recipientRef", "consentOrBasisVersion", "policyVersion", "rulesProfile",
    "issuedAt", "expiresAt", "allowedActions",
  ];
  if (required.some((field) => record[field] === undefined || record[field] === null)) {
    throw new Error("Approved-use record is incomplete");
  }
  if (!isPrivacyPurpose(record.purpose) || !Array.isArray(record.allowedActions)) throw new Error("Approved-use record is invalid");
  return deepFreeze(structuredClone(record));
}

function denied() {
  return new PrivacyProcessingError(403, PrivacyErrorCode.POLICY_DENIED, "The registered privacy use does not authorize this request");
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
