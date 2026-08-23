import { createHmac } from "node:crypto";
import { hmacWithKey } from "./key-provider.js";

export class LocalDevelopmentPseudonymKeyProvider {
  constructor(secret, keyProvider = null) {
    this.secret = secret;
    this.keyProvider = keyProvider;
    this.provider = "LOCAL_DEVELOPMENT_HMAC";
  }

  protectPatientReference(patientId, studyInstanceUid) {
    const key = this.keyProvider?.currentKey?.();
    if (key) return `protected:${hmacWithKey(key, `${patientId}:${studyInstanceUid}:pseudonym-mapping`)}`;
    return `protected:${createHmac("sha256", this.secret)
      .update(`${patientId}:${studyInstanceUid}:pseudonym-mapping`)
      .digest("hex")}`;
  }

  currentKeyId() {
    return this.keyProvider?.currentKey?.()?.kid ?? "local-development-secret";
  }
}

export class ProductionKmsPseudonymKeyProvider {
  constructor() {
    this.provider = "PRODUCTION_KMS_INTERFACE";
  }

  protectPatientReference() {
    throw new Error("Production KMS integration is NOT VERIFIED in local MVP");
  }
}
