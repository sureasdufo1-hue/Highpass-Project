import { KeyReleaseDecision } from "./mobile-key-release.js";

export class KeyReleaseFlowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "KeyReleaseFlowError";
    this.code = code;
  }
}

/**
 * Coordinates policy authorization, KMS rewrap and envelope metadata state.
 * The injected adapter may be a test adapter or a future external KMS
 * implementation; no key material is handled by this orchestrator.
 */
export class MobileKeyReleaseFlow {
  constructor({ authorizationService, kmsAdapter, envelopeStore, audit = () => {} } = {}) {
    if (!authorizationService || typeof authorizationService.authorize !== "function") throw new KeyReleaseFlowError("AUTHORIZER_REQUIRED", "authorization service is required");
    if (!kmsAdapter || typeof kmsAdapter.rewrapEnvelope !== "function") throw new KeyReleaseFlowError("KMS_ADAPTER_REQUIRED", "KMS adapter is required");
    if (!envelopeStore || typeof envelopeStore.createRewrapped !== "function") throw new KeyReleaseFlowError("ENVELOPE_STORE_REQUIRED", "envelope store is required");
    this.authorizationService = authorizationService;
    this.kmsAdapter = kmsAdapter;
    this.envelopeStore = envelopeStore;
    this.audit = audit;
  }

  async execute(input) {
    const authorization = this.authorizationService.authorize(input);
    if (authorization.decision !== KeyReleaseDecision.ALLOW) return authorization;
    try {
      const rewrapped = await this.kmsAdapter.rewrapEnvelope(authorization.rewrapRequest);
      validateRewrapResult(rewrapped, authorization);
      const envelope = this.envelopeStore.createRewrapped({
        sourceEnvelopeId: input.envelopeId,
        recipientEnvelopeRef: rewrapped.recipientEnvelopeRef,
        packageId: input.packageId,
        recipientType: rewrapped.recipientType,
        recipientRef: rewrapped.recipientRef,
        keyRef: rewrapped.keyRef,
        keyVersion: rewrapped.keyVersion,
        expiresAt: rewrapped.expiresAt,
      });
      const result = { decision: KeyReleaseDecision.ALLOW, reasonCode: "KEY_RELEASE_REWRAPPED", authorizationId: authorization.authorizationId, packageId: input.packageId, envelope };
      this.audit({ eventType: "KEY_RELEASE_COMPLETED", decision: "ALLOW", authorizationId: authorization.authorizationId, packageId: input.packageId, envelopeId: envelope.envelopeId, occurredAt: new Date().toISOString() });
      return result;
    } catch (error) {
      const reasonCode = error?.code ?? "KMS_REWRAP_FAILED";
      const result = { decision: KeyReleaseDecision.DENY, reasonCode };
      this.audit({ eventType: "KEY_RELEASE_COMPLETED", decision: "DENY", reasonCode, authorizationId: authorization.authorizationId, packageId: input.packageId, occurredAt: new Date().toISOString() });
      return result;
    }
  }
}

function validateRewrapResult(result, authorization) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new KeyReleaseFlowError("KMS_RESPONSE_INVALID", "KMS rewrap response is invalid");
  rejectKeyMaterial(result);
  for (const name of ["recipientEnvelopeRef", "recipientType", "recipientRef", "keyRef", "packageId", "authorizationId", "expiresAt"]) {
    if (typeof result[name] !== "string" || result[name].length === 0) throw new KeyReleaseFlowError("KMS_RESPONSE_INVALID", `${name} is missing`);
  }
  if (result.recipientType !== "B_GATEWAY" || result.packageId !== authorization.packageId || result.authorizationId !== authorization.authorizationId || result.recipientRef !== authorization.rewrapRequest.recipientRef || result.manifestHash !== authorization.rewrapRequest.manifestHash) {
    throw new KeyReleaseFlowError("KMS_RESPONSE_BINDING_MISMATCH", "KMS response is not bound to authorization");
  }
  if (!Number.isInteger(result.keyVersion) || result.keyVersion < 1) throw new KeyReleaseFlowError("KMS_RESPONSE_INVALID", "key version is invalid");
  if (!Number.isFinite(new Date(result.expiresAt).getTime())) throw new KeyReleaseFlowError("KMS_RESPONSE_INVALID", "expiry is invalid");
}

function rejectKeyMaterial(value, path = "response") {
  for (const [key, child] of Object.entries(value)) {
    if (/^(dek|plaintextdek|rawdek|keymaterial|privatekey|secret|plaintext)$/iu.test(key)) throw new KeyReleaseFlowError("KEY_MATERIAL_REJECTED", `${path}.${key} is not accepted`);
    if (child && typeof child === "object") rejectKeyMaterial(child, `${path}.${key}`);
  }
}
