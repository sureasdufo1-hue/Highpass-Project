import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { HipassService } from "../src/services.js";
import { authorizeDataPlane, revalidateDataPlaneReceipt } from "../src/data-plane-authorization.js";
import { ConsentBoundKeyRelease, PostgresKeyReleaseRepository } from "../src/consent-bound-key-release.js";

const study = "1.2.410.100.1.20260620.001";
const series = `${study}.1`;
const config = { sourceHospitalId: "HOSP-A", recipientHospitalId: "HOSP-B", publicBaseUrl: "https://demo.test",
  keyId: `https://capstone-demo.vault.azure.net/keys/demo/${"a".repeat(32)}` };
const packageBinding = { packageId: "synthetic-package-1", keyId: config.keyId, recipientHospitalId: "HOSP-B",
  wrappedKeyHash: "1".repeat(64), ciphertextHash: "2".repeat(64), manifestHash: "3".repeat(64) };

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "hp-key-policy-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const store = new JsonStore(path.join(directory, "db.json"));
  await store.load();
  const service = new HipassService(store, () => "2026-10-08T14:00:00.000Z", { tokenSecret: randomBytes(32).toString("hex") });
  const issued = await service.requestDicomAccessToken({ consentId: "CONSENT-DEMO-ACTIVE", doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: study, seriesInstanceUid: series });
  const authorized = await authorizeDataPlane(service, { method: "GET", path: `/dicomweb/studies/${study}/series/${series}/instances/${series}.1/rendered`, clientIp: "192.0.2.1", authorizationScheme: "Bearer", token: issued.accessToken }, config);
  assert.equal(authorized.status, 200);
  // Test double only. No PostgreSQL persistence or deployment claim.
  const records = new Map();
  const repository = { persistent: true, async create(value) { records.set(value.releaseId, structuredClone(value)); },
    async read(id) { return structuredClone(records.get(id)); }, async consume(id) {
      const value = records.get(id);
      if (!value || value.consumed) return false;
      value.consumed = true;
      return true;
    } };
  const policy = new ConsentBoundKeyRelease({ service, repository, configuration: config });
  const receipt = authorized.body.receipt;
  const prepared = await policy.prepare({ receipt, packageBinding });
  const input = { receipt, packageBinding, releaseId: prepared.releaseId, authenticatedHospitalId: "HOSP-B", phase: "BEFORE_UNWRAP" };
  return { policy, service, store, records, input };
}

test("key release binds metadata and audits both unwrap phases; consumes exactly once", async t => {
  const { policy, store, records, input } = await fixture(t);
  assert.equal(await policy.authorize(input), true);
  assert.equal(await policy.authorize({ ...input, phase: "AFTER_UNWRAP" }), true);
  await assert.rejects(policy.authorize(input), /BINDING_INACTIVE/);
  const metadata = JSON.stringify([...records.values()]);
  assert.ok(!metadata.includes(input.receipt));
  assert.ok(!metadata.includes("wrappedKey\""));
  for (const action of ["KEY_RELEASE_PREPARED", "KEY_RELEASE_PRECHECKED", "KEY_RELEASE_CONSUMED"]) {
    assert.ok(store.get("auditLogs").some(row => row.action === action && row.actorId === `key-release:${input.releaseId}` && row.sopInstanceUid === `${series}.1`));
  }
});

test("recipient, ciphertext, manifest, wrapped key, key version and receipt substitution deny", async t => {
  const { policy, input } = await fixture(t);
  await assert.rejects(policy.authorize({ ...input, authenticatedHospitalId: "HOSP-A" }), /PRINCIPAL_INVALID/);
  for (const field of ["ciphertextHash", "manifestHash", "wrappedKeyHash"]) await assert.rejects(policy.authorize({ ...input, packageBinding: { ...packageBinding, [field]: "4".repeat(64) } }), /BINDING_INACTIVE/);
  for (const [field, value] of [["recipientHospitalId", "HOSP-C"], ["keyId", config.keyId.replace(/a$/u, "b")], ["rawDek", "forbidden"]]) await assert.rejects(policy.authorize({ ...input, packageBinding: { ...packageBinding, [field]: value } }), /BINDING_INVALID/);
  for (const [field, value] of [["packageId", 123], ["wrappedKeyHash", [packageBinding.wrappedKeyHash]]]) await assert.rejects(policy.authorize({ ...input, packageBinding: { ...packageBinding, [field]: value } }), /BINDING_INVALID/);
  await assert.rejects(policy.authorize({ ...input, receipt: input.receipt + "changed" }), /BINDING_INACTIVE/);
});

test("revocation during Key Vault latency denies after-unwrap; no consume or plaintext authorization", async t => {
  const { policy, store, input, records } = await fixture(t);
  await policy.authorize(input);
  store.get("consents").find(row => row.consentId === "CONSENT-DEMO-ACTIVE").status = "REVOKED";
  await assert.rejects(policy.authorize({ ...input, phase: "AFTER_UNWRAP" }), /POLICY_DENIED/);
  assert.ok(!records.get(input.releaseId).consumed);
});

test("expiry, invalid clock, hospital suspension and changed durable token binding deny", async t => {
  const { policy, service, store, input } = await fixture(t);
  service.clock = () => "2026-10-08T14:00:30.000Z";
  await assert.rejects(policy.authorize(input), /BINDING_INACTIVE/);
  service.clock = () => "not-a-time";
  assert.equal((await revalidateDataPlaneReceipt(service, input.receipt, config)).status, 403);
  service.clock = () => "2026-10-08T14:00:00.000Z";
  const hospital = store.get("hospitals").find(row => row.hospitalId === "HOSP-B");
  hospital.status = "SUSPENDED";
  await assert.rejects(policy.authorize(input), /POLICY_DENIED/);
  hospital.status = "ACTIVE";
  store.get("dicomAccessTokenLogs").find(row => row.consentId === "CONSENT-DEMO-ACTIVE").doctorId = "OTHER-DOCTOR";
  assert.equal((await revalidateDataPlaneReceipt(service, input.receipt, config)).body.reason, "DATA_PLANE_TOKEN_BINDING_CHANGED");
});

test("concurrent after-unwrap claims authorize only one consumer; audit failure fails closed", async t => {
  const { policy, service, records, input } = await fixture(t);
  const result = await Promise.allSettled([1, 2].map(() => policy.authorize({ ...input, phase: "AFTER_UNWRAP" })));
  assert.equal(result.filter(value => value.status === "fulfilled").length, 1);
  const next = await policy.prepare({ receipt: input.receipt, packageBinding: { ...packageBinding, packageId: "next" } });
  const originalAudit = service.writeAudit.bind(service);
  service.writeAudit = async value => {
    if (value.action === "KEY_RELEASE_CONSUMED") throw new Error("AUDIT_UNAVAILABLE");
    return originalAudit(value);
  };
  await assert.rejects(policy.authorize({ ...input, releaseId: next.releaseId, packageBinding: { ...packageBinding, packageId: "next" }, phase: "AFTER_UNWRAP" }), /AUDIT_UNAVAILABLE/);
  assert.equal(records.get(next.releaseId).consumed, true);
});

test("Postgres ledger uses parameters and atomic unconsumed/unexpired update; memory production dependency rejected", async () => {
  const calls = [];
  const repository = new PostgresKeyReleaseRepository({ async query(sql, args) { calls.push({ sql, args }); return { rows: [], rowCount: 0 }; } });
  assert.equal(await repository.consume("untrusted-input"), false);
  assert.deepEqual(calls[0].args, ["untrusted-input"]);
  assert.ok(!calls[0].sql.includes("untrusted-input"));
  assert.match(calls[0].sql, /consumed_at IS NULL AND expires_at > clock_timestamp\(\)/);
  assert.throws(() => new ConsentBoundKeyRelease({ service: {}, repository: { persistent: false }, configuration: config }), /DEPENDENCIES_REQUIRED/);
});
