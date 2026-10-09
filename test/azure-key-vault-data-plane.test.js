import test from "node:test";
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, publicEncrypt, privateDecrypt, randomBytes } from "node:crypto";
import { AzureKeyVaultDataPlane, AzureKeyVaultError } from "../src/azure-key-vault-data-plane.js";
import { buildEncryptedImagingPackage, decryptAndVerifyImagingPackage } from "../src/mobile-package-crypto.js";

const keyId = `https://highpass-synthetic.vault.azure.net/keys/demo/${"a".repeat(32)}`;
const packageId = "pkg_abcdefghijklmnop";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
function fixture(options = {}) {
  const calls = [];
  const client = new AzureKeyVaultDataPlane({ keyId, tokenProvider: async () => "synthetic-token", authorizeOperation: async () => true, transport: async (request) => {
    calls.push(request);
    assert.equal(request.body.alg, "RSA-OAEP-256");
    const input = Buffer.from(request.body.value, "base64url");
    const operation = request.url.includes("/unwrapkey?") ? privateDecrypt : publicEncrypt;
    return { kid: keyId, value: operation({ key: operation === privateDecrypt ? privateKey : publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, input).toString("base64url") };
  }, ...options });
  return { client, calls };
}
const code = (expected) => (error) => error instanceof AzureKeyVaultError && error.code === expected;

test("local RSA protocol fixture protects AES-GCM package and clears transient DEK", async () => {
  const { client } = fixture();
  const dek = randomBytes(32);
  const encrypted = buildEncryptedImagingPackage({ packageId, transferId: "trf_abcdefghijklmnop", consentId: "consent_synthetic", patientRef: "pat_abcdefghijklmnop", sourceInstitution: "inst_a", destinationInstitution: "inst_b", purpose: "TREATMENT", scope: { studyRefs: ["study-synthetic"], actions: ["VIEW"] }, objects: [{ studyRef: "study-synthetic", seriesRef: "series-synthetic", instanceRef: "instance-synthetic", data: Buffer.from("SYNTHETIC MEDICAL IMAGE") }], keyEnvelopeRefs: ["kenv_abcdefghijklmnop"], dek });
  const envelope = await client.wrapDek({ packageId, dek });
  let transient;
  const result = await client.consumeUnwrappedDek({ packageId, envelope, consume: (key) => {
    transient = key;
    const verified = decryptAndVerifyImagingPackage({ envelope: encrypted.envelope, chunks: encrypted.chunks, dek: key });
    try { assert.equal(Buffer.concat(verified.plaintextChunks).toString(), "SYNTHETIC MEDICAL IMAGE"); }
    finally { for (const chunk of verified.plaintextChunks) chunk.fill(0); }
    return key; // A consumer return value must never propagate into the result.
  } });
  assert.ok(transient.every((byte) => byte === 0));
  assert.equal(result.status, "CONSUMED");
  assert.ok(!JSON.stringify(result).includes(dek.toString("base64url")));
  dek.fill(0);
});

test("rejects unversioned, foreign, HTTP, query and credential-bearing key IDs", () => {
  for (const candidate of [keyId.replace(`/${"a".repeat(32)}`, ""), keyId.replace("https", "http"), keyId.replace("vault.azure.net", "evil.example"), `${keyId}?redirect=1`, keyId.replace("https://", "https://user@")]) assert.throws(() => fixture({ keyId: candidate }), code("KV_VERSIONED_KEY_REQUIRED"));
});

test("policy denial prevents token acquisition and all Key Vault requests", async () => {
  let tokenCalls = 0;
  const { client, calls } = fixture({ authorizeOperation: async () => false, tokenProvider: async () => { tokenCalls++; return "synthetic-token"; } });
  await assert.rejects(client.wrapDek({ packageId, dek: randomBytes(32) }), code("KV_POLICY_DENIED"));
  assert.equal(tokenCalls, 0); assert.equal(calls.length, 0);
});

test("rechecks live authority after unwrap and denies revoked access before consumption", async () => {
  let authorized = true;
  const { client } = fixture({ authorizeOperation: async () => authorized });
  const envelope = await client.wrapDek({ packageId, dek: randomBytes(32) });
  // Provider response succeeds but revocation occurs during the network operation.
  const denied = fixture({ authorizeOperation: async () => authorized, transport: async () => { authorized = false; return { kid: keyId, value: randomBytes(32).toString("base64url") }; } }).client;
  let consumed = false;
  await assert.rejects(denied.consumeUnwrappedDek({ packageId, envelope, consume: () => { consumed = true; } }), code("KV_POLICY_DENIED"));
  assert.equal(consumed, false);
});

test("foreign package binding, wrong returned key version and malformed encoding fail closed", async () => {
  const { client } = fixture();
  const envelope = await client.wrapDek({ packageId, dek: randomBytes(32) });
  await assert.rejects(client.consumeUnwrappedDek({ packageId: "pkg_qrstuvwxyzabcdef", envelope, consume: () => {} }), code("KV_ENVELOPE_BINDING_INVALID"));
  const wrongVersion = fixture({ transport: async () => ({ kid: keyId.replace(/a$/u, "b"), value: envelope.wrappedKey }) }).client;
  await assert.rejects(wrongVersion.wrapDek({ packageId, dek: randomBytes(32) }), code("KV_RESPONSE_BINDING_INVALID"));
  await assert.rejects(client.consumeUnwrappedDek({ packageId, envelope: { ...envelope, wrappedKey: "invalid==" }, consume: () => {} }), code("KV_ENCODING_INVALID"));
});

test("provider timeout is bounded and no late callback can use plaintext", async () => {
  let release;
  const { client, calls } = fixture({ timeoutMs: 10, tokenProvider: async () => new Promise((resolve) => { release = resolve; }) });
  await assert.rejects(client.wrapDek({ packageId, dek: randomBytes(32) }), code("KV_TIMEOUT"));
  release("synthetic-late-token");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);
});

test("consumer errors zero the transient key and suppress sensitive diagnostics", async () => {
  const { client } = fixture();
  const envelope = await client.wrapDek({ packageId, dek: randomBytes(32) });
  let transient;
  await assert.rejects(client.consumeUnwrappedDek({ packageId, envelope, consume: (dek) => { transient = dek; throw new Error("sensitive diagnostic"); } }), code("KV_OPERATION_FAILED"));
  assert.ok(transient.every((byte) => byte === 0));
  await assert.rejects(client.consumeUnwrappedDek({ packageId, envelope, consume: async () => {} }), code("KV_ENVELOPE_BINDING_INVALID"));
});
