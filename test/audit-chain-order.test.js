import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createSeedData } from "../src/seed.js";
import { HipassService } from "../src/services.js";
import { PostgresStore } from "../src/postgres-store.js";
import { orderStoredAuditChain } from "../src/audit-chain-order.js";
const hash = digit => "sha256:" + digit.repeat(64);

test("stored links determine audit order, preserving each record exactly", () => {
  const head = Object.freeze({ recordHash: hash("a"), previousHash: null, createdAt: "same", auditId: "Z" });
  const tail = Object.freeze({ recordHash: hash("b"), previousHash: hash("a"), createdAt: "same", auditId: "A" });
  assert.deepEqual(orderStoredAuditChain([tail, head]), [head, tail]);
  assert.deepEqual(orderStoredAuditChain([]), []);
});

test("missing, duplicate, forked, unsigned and cyclic audit links fail closed", () => {
  const head = { recordHash: hash("a"), previousHash: null }, tail = { recordHash: hash("b"), previousHash: hash("a") };
  for (const rows of [[tail], [head, head], [head, tail, { recordHash: hash("c"), previousHash: hash("a") }],
    [{ auditId: "unsigned" }], [{ recordHash: hash("a"), previousHash: hash("b") }, { recordHash: hash("b"), previousHash: hash("a") }]]) assert.throws(() => orderStoredAuditChain(rows), /LINK_INVALID/);
});

test("service restart checks existing content hashes and never silently repairs tampering", async () => {
  const data = createSeedData(), store = { get: name => data[name], async save() {} };
  const options = { tokenSecret: randomBytes(32).toString("hex") };
  const service = new HipassService(store, () => "2026-10-08T17:00:00.000Z", options);
  await service.writeAudit({ actorType: "SYSTEM", actorId: "synthetic", action: "FIRST", result: "SUCCESS", reason: "FIRST" });
  await service.writeAudit({ actorType: "SYSTEM", actorId: "synthetic", action: "SECOND", result: "SUCCESS", reason: "SECOND" });
  const original = structuredClone(data.auditLogs);
  data.auditLogs.reverse();
  const restarted = new HipassService(store, service.clock, options);
  assert.equal(restarted.verifyAuditIntegrity().ok, true);
  assert.deepEqual(data.auditLogs, original);
  data.auditLogs[1].reasonCode = "TAMPERED";
  const persistedHashes = data.auditLogs.map(row => [row.previousHash, row.recordHash]);
  assert.throws(() => new HipassService(store, service.clock, options), /INTEGRITY_REQUIRED/);
  assert.deepEqual(data.auditLogs.map(row => [row.previousHash, row.recordHash]), persistedHashes);
});

test("Postgres reader orders mapped audits by stored links, not tied timestamp/UUID sort", async () => {
  const rows = [{ audit_id: "A", created_at: "2026-10-08T17:00:00Z", previous_hash: hash("a"), record_hash: hash("b") },
    { audit_id: "Z", created_at: "2026-10-08T17:00:00Z", previous_hash: null, record_hash: hash("a") }];
  const result = await PostgresStore.prototype.readTable.call({ client: { async query() { return { rows }; } } }, "auditLogs");
  assert.deepEqual(result.map(row => row.auditId), ["Z", "A"]);
});
