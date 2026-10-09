// Executed only via anonymous stdin inside the pinned B container. The caller
// defines presenterKey in memory; no token/receipt/DEK/plaintext is emitted.
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import https from "node:https";
import { boundedHttps } from "/app/src/data-plane-gateway.js";
import { createCapstoneImageDecryptor, encryptedDicomType } from "/app/src/capstone-encrypted-transfer.js";
import { keyVaultHttpsRequest } from "/app/src/azure-key-vault-data-plane.js";
import { hospitalKeyConfig } from "/app/scripts/capstone-hospital-key-config.js";

const origin = "https://192.168.111.149:9443";
const ca = readFileSync(process.env.CAPSTONE_B_CA_FILE);
const serviceToken = readFileSync(process.env.CAPSTONE_B_KEY_RELEASE_TOKEN_FILE, "utf8").trim();
const keyConfig = hospitalKeyConfig("B");
const study = "1.2.410.100.1.20260620.001", series = study + ".1";
const imagePath = `/dicomweb/studies/${study}/series/${series}/instances/${series}.1/rendered`;
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = keys.publicKey.export({ format: "jwk" });
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
let profiles, consentId, token;
const checks = [];
const payloadBuffers = [];
let stage = "MOCK_IDP_LOGIN";
const transportDiagnostics = [];
function makeDiagnosticAgent() {
  // Disposable probe only: preserve default pooling options and strict TLS.
  return new class extends https.Agent {
    addRequest(request, options) {
      const started = performance.now();
      const row = { operation: /^[A-Z_]{1,64}$/.test(stage) ? stage : "OTHER",
        startedAt: new Date().toISOString(), phase: "REQUEST_CREATED", reusedSocket: false,
        tlsVerified: false, responseStatus: null, errorCode: null };
      const listeners = [];
      const mark = phase => { row.phase = phase; };
      request.once("socket", socket => {
        row.reusedSocket = request.reusedSocket === true;
        row.tlsVerified = socket.authorized === true;
        mark("SOCKET_ASSIGNED");
        for (const [event, phase] of [["lookup", "DNS_COMPLETE"], ["connect", "TCP_CONNECTED"], ["secureConnect", "TLS_CONNECTED"]]) {
          const handler = () => { mark(phase); if (event === "secureConnect") row.tlsVerified = socket.authorized === true; };
          socket.once(event, handler); listeners.push([socket, event, handler]);
        }
      });
      request.once("response", response => {
        mark("RESPONSE_HEADERS"); row.responseStatus = response.statusCode;
        response.once("end", () => mark("RESPONSE_COMPLETE"));
        response.once("aborted", () => mark("RESPONSE_ABORTED"));
      });
      request.once("error", error => {
        const allowed = ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UPSTREAM_ABORTED", "RESPONSE_LIMIT", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
        row.errorCode = allowed.includes(error?.code) ? error.code : "OTHER";
      });
      request.once("close", () => {
        for (const [socket, event, handler] of listeners) socket.removeListener(event, handler);
        row.elapsedMs = Math.max(0, Math.round(performance.now() - started));
        transportDiagnostics.push(row);
        if (transportDiagnostics.length > 64) transportDiagnostics.shift();
      });
      super.addRequest(request, options);
    }
  }(https.globalAgent.options);
}
const diagnosticAgent = makeDiagnosticAgent();
const safeCodes = new Set(["KV_POLICY_DENIED", "KV_AUTH_DENIED", "KV_TIMEOUT", "KV_OPERATION_FAILED", "ENCRYPTED_TRANSFER_INVALID", "ENCRYPTED_TRANSFER_SCOPE_MISMATCH", "ENCRYPTED_TRANSFER_REQUIRED", "ENCRYPTED_TRANSFER_EXPIRED", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "PACKAGE_FIXTURE_UNAVAILABLE", "LOGIN_NOT_VERIFIED", "CONSENT_NOT_VERIFIED", "TOKEN_NOT_VERIFIED", "INFLIGHT_REVOKE_NOT_VERIFIED", "RECEIPT_DEADLINE_NOT_VERIFIED"]);
const safeCode = error => safeCodes.has(error?.code ?? error?.message) ? (error.code ?? error.message) : "UNCLASSIFIED_FAILURE";
function proof(method, path, accessToken) {
  const input = encode({ typ: "dpop+jwt", alg: "ES256", jwk }) + "." + encode({ jti: randomUUID(), htm: method, htu: origin + path, iat: Math.floor(Date.now() / 1000), ...(accessToken ? { ath: createHash("sha256").update(accessToken).digest("base64url") } : {}) });
  return input + "." + sign("sha256", Buffer.from(input), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
}
async function api(method, path, role, body, withProof = false) {
  const result = await boundedHttps(origin, path, { tls: { ca, agent: diagnosticAgent }, method, headers: { origin, "content-type": "application/json", ...(role ? { Authorization: "Bearer " + profiles[role] } : {}), ...(withProof ? { DPoP: proof(method, path) } : {}) }, body: body ? JSON.stringify(body) : undefined, maxBytes: 32768, timeoutMs: 10000 });
  return { status: result.status, body: JSON.parse(result.body.toString("utf8")) };
}
async function freshPackage() {
  const result = await boundedHttps("https://10.90.88.2:9443", imagePath, { tls: { ca, agent: diagnosticAgent }, headers: { Authorization: "DPoP " + token, DPoP: proof("GET", imagePath, token) }, timeoutMs: 10000, maxBytes: 12 * 1024 * 1024 });
  if (result.status !== 200 || result.contentType !== encryptedDicomType) throw new Error("PACKAGE_FIXTURE_UNAVAILABLE");
  payloadBuffers.push(result.body);
  return result;
}
function decryptor(options = {}) {
  const observed = { vaultCalls: 0, controlStatuses: [], revokedHttpStatus: null };
  const control = async (path, body) => {
    if (path !== "/gateway/data-plane/package/authorize") throw new Error("CONTROL_ROUTE_INVALID");
    const result = await boundedHttps("https://10.90.88.1", path, { tls: { ca, agent: diagnosticAgent }, method: "POST", headers: { "content-type": "application/json", "x-hipass-service-token": serviceToken }, body: JSON.stringify(body), maxBytes: 32768, timeoutMs: 8000 });
    observed.controlStatuses.push({ phase: body.phase, status: result.status });
    return { status: result.status, body: JSON.parse(result.body.toString("utf8")) };
  };
  const keyTransport = async request => {
    observed.vaultCalls += 1;
    // Explicit disposable-probe fault, never a deployed identity/config change.
    const response = await keyVaultHttpsRequest(options.invalidProviderToken ? { ...request, token: "invalid-probe-token" } : request);
    if (options.revokeAfterActualUnwrap) {
      const revoked = await api("POST", `/api/consents/${consentId}/revoke`, "PATIENT", {});
      observed.revokedHttpStatus = revoked.status;
      if (revoked.status !== 200 || revoked.body.status !== "REVOKED") throw new Error("INFLIGHT_REVOKE_NOT_VERIFIED");
    }
    return response;
  };
  return { observed, instance: createCapstoneImageDecryptor({ ...keyConfig, control, keyTransport, publicBaseUrl: origin, recipientHospitalId: "HOSP-B" }) };
}
async function rejected(test, result, path, expectedCode, options = {}, expectedVaultCalls = 0) {
  stage = test;
  const { observed, instance } = decryptor(options);
  let returned;
  try {
    returned = await instance.open(result, path);
    checks.push({ test, status: "FAIL", plaintextReturned: true, vaultCalls: observed.vaultCalls });
  } catch (error) {
    const code = safeCode(error);
    const controlDeny = observed.controlStatuses.some(row => row.status === 403);
    const pass = code === expectedCode && observed.vaultCalls === expectedVaultCalls && (code !== "KV_POLICY_DENIED" || controlDeny) && (!options.revokeAfterActualUnwrap || observed.revokedHttpStatus === 200);
    checks.push({ test, status: pass ? "PASS" : ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "KV_TIMEOUT", "UNCLASSIFIED_FAILURE"].includes(code) ? "NOT VERIFIED" : "FAIL", reason: code, plaintextReturned: false, ...observed, ...(options.invalidProviderToken ? { faultScope: "INJECTED_INVALID_TOKEN_IN_DISPOSABLE_HELPER_REAL_PRIVATE_VAULT_401_NOT_GLOBAL_OUTAGE" } : {}) });
  } finally { returned?.body?.fill(0); }
}
const mutateBytes = value => { const bytes = Buffer.from(value, "base64url"); bytes[0] ^= 1; return bytes.toString("base64url"); };
try {
  const login = await api("POST", "/api/capstone-demo/login", null, { key: presenterKey });
  if (login.status !== 200 || !login.body.profiles?.PATIENT || !login.body.profiles?.DOCTOR) throw new Error("LOGIN_NOT_VERIFIED");
  profiles = login.body.profiles;
  stage = "OWNED_SYNTHETIC_CONSENT";
  const created = await api("POST", "/api/consents", "PATIENT", { patientId: "P-1001", sourceHospitalId: "HOSP-A", targetHospitalId: "HOSP-B", purpose: "TREATMENT", permission: "VIEW_ONLY", validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: new Date(Date.now() + 900000).toISOString(), scopes: [{ studyInstanceUid: study, seriesInstanceUid: series }] });
  if (created.status !== 201 || created.body.status !== "ACTIVE") throw new Error("CONSENT_NOT_VERIFIED");
  consentId = created.body.consentId;
  stage = "BOUND_DPOP_TOKEN";
  const issued = await api("POST", "/api/dicom-access/request", "DOCTOR", { consentId, doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", studyInstanceUid: study, seriesInstanceUid: series, purpose: "TREATMENT", requestedAction: "VIEW" }, true);
  if (issued.status !== 200 || issued.body.decision !== "ALLOWED") throw new Error("TOKEN_NOT_VERIFIED");
  token = issued.body.accessToken;
  stage = "ACTUAL_ENCRYPTED_NORMAL";
  const normalPackage = await freshPackage();
  const normal = decryptor();
  const plain = await normal.instance.open(normalPackage, imagePath);
  const png = plain.contentType === "image/png" && plain.body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  checks.push({ test: stage, status: png && normal.observed.vaultCalls === 1 && normal.observed.controlStatuses.length === 2 && normal.observed.controlStatuses.every(row => row.status === 200) ? "PASS" : "FAIL", decryptedSyntheticPng: png, plaintextBytes: plain.body.length, ...normal.observed });
  plain.body.fill(0);
  await rejected("CONSUMED_PACKAGE_REPLAY", normalPackage, imagePath, "KV_POLICY_DENIED");
  for (const [test, mutate, expected] of [
    ["CIPHERTEXT_SUBSTITUTION", p => { p.chunks[0].ciphertext = mutateBytes(p.chunks[0].ciphertext); }, "KV_POLICY_DENIED"],
    ["GCM_TAG_SUBSTITUTION", p => { p.chunks[0].tag = mutateBytes(p.chunks[0].tag); }, "KV_POLICY_DENIED"],
    ["WRAPPED_KEY_SUBSTITUTION", p => { p.wrapped.wrappedKey = mutateBytes(p.wrapped.wrappedKey); }, "KV_POLICY_DENIED"],
    ["MANIFEST_MIME_SUBSTITUTION", p => { p.contentType = "image/jpeg"; }, "KV_POLICY_DENIED"],
    ["KEY_VERSION_SUBSTITUTION", p => { p.wrapped.keyId = p.wrapped.keyId.replace(/.$/, p.wrapped.keyId.endsWith("0") ? "1" : "0"); }, "ENCRYPTED_TRANSFER_INVALID"],
    ["RECIPIENT_SUBSTITUTION", p => { p.envelope.destinationInstitutionRef = "HOSP-C"; }, "ENCRYPTED_TRANSFER_INVALID"],
    ["RELEASE_ID_SUBSTITUTION", p => { p.releaseId = randomUUID(); }, "KV_POLICY_DENIED"],
  ]) {
    stage = "PREPARE_" + test;
    const result = await freshPackage();
    const payload = JSON.parse(result.body.toString("utf8"));
    mutate(payload);
    const modified = Buffer.from(JSON.stringify(payload));
    payloadBuffers.push(modified);
    await rejected(test, { ...result, body: modified }, imagePath, expected);
  }
  stage = "PREPARE_ROUTE_SUBSTITUTION";
  await rejected("INSTANCE_ROUTE_SUBSTITUTION", await freshPackage(), imagePath.replace(series + ".1/rendered", series + ".2/rendered"), "ENCRYPTED_TRANSFER_SCOPE_MISMATCH");
  stage = "PREPARE_PROVIDER_FAILURE";
  await rejected("REAL_VAULT_INVALID_PROVIDER_TOKEN", await freshPackage(), imagePath, "KV_AUTH_DENIED", { invalidProviderToken: true }, 1);
  stage = "PREPARE_ELAPSED_RELEASE_EXPIRY";
  const expired = await freshPackage();
  const receipt = JSON.parse(expired.body.toString("utf8")).receipt;
  const deadline = JSON.parse(Buffer.from(receipt.split(".")[0], "base64url").toString("utf8")).deadline;
  const wait = deadline - Date.now() + 1500;
  if (!Number.isSafeInteger(deadline) || wait < 0 || wait > 32000) throw new Error("RECEIPT_DEADLINE_NOT_VERIFIED");
  await new Promise(resolve => setTimeout(resolve, wait));
  await rejected("ELAPSED_RELEASE_RECEIPT_EXPIRY", expired, imagePath, "KV_POLICY_DENIED");
  stage = "PREPARE_INFLIGHT_REVOKE";
  await rejected("PATIENT_REVOKE_AFTER_REAL_UNWRAP_BEFORE_PLAINTEXT", await freshPackage(), imagePath, "KV_POLICY_DENIED", { revokeAfterActualUnwrap: true }, 1);
} catch (error) {
  checks.push({ test: stage, status: "NOT VERIFIED", reason: safeCode(error) });
} finally {
  for (const buffer of payloadBuffers) buffer.fill(0);
  if (consentId && profiles) {
    try {
      let state = await api("GET", `/api/consents/${consentId}`, "PATIENT");
      if (state.status === 200 && state.body.status === "ACTIVE") {
        await api("POST", `/api/consents/${consentId}/revoke`, "PATIENT", {});
        state = await api("GET", `/api/consents/${consentId}`, "PATIENT");
      }
      const inactive = state.status === 200 && state.body.consentId === consentId && ["REVOKED", "EXPIRED"].includes(state.body.status);
      checks.push({ test: "OWNED_SYNTHETIC_CONSENT_INACTIVE", status: inactive ? "PASS" : "NOT VERIFIED", effectiveStatus: inactive ? state.body.status : "UNVERIFIED", recordsDeleted: 0 });
    } catch { checks.push({ test: "OWNED_SYNTHETIC_CONSENT_INACTIVE", status: "NOT VERIFIED" }); }
  }
  token = null; profiles = null;
  diagnosticAgent.destroy();
}
const result = { scope: "PINNED_B_RUNTIME_CRYPTO_MODULE_ACTUAL_A_CLOUD_PRIVATE_VAULT_NOT_BROWSER_FAULT_INJECTION", review: "DRAFT / UNASSIGNED", checks, secretsOrPlaintextExported: false, runtimeConfigurationChanged: false, providerGlobalOutage: "NOT VERIFIED", status: checks.length === 14 && checks.every(row => row.status === "PASS") ? "PASS" : checks.some(row => row.status === "FAIL") ? "FAIL" : "NOT VERIFIED" };
await new Promise(resolve => setImmediate(resolve));
result.transportDiagnostics = transportDiagnostics;
console.log(JSON.stringify(result));
process.exitCode = result.status === "PASS" ? 0 : 1;
