// Read-only actual DB verification. Never instantiate a service that normalizes
// audit hashes: verify the stored chain, not a repaired in-memory copy.
import { readFileSync } from "node:fs";
import pg from "/app/node_modules/pg/lib/index.js";
import { PostgresStore } from "/app/src/postgres-store.js";
import { HipassService } from "/app/src/services.js";
const since = "2026-10-08T17:34:24.264772Z";
const keyId = "https://kv-hp-demo-4869edd9.vault.azure.net/keys/capstone-b-kek-20261009/9c03b2560a3240418d33d92a165b6806";
let client;
const checks = [];
let recentSafeAuditCounts = {};
let storedLinkDiagnostics = {};
let probeStage = "CONNECT";
try {
  client = new pg.Client({ host: process.env.POSTGRES_HOST, database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER,
    password: readFileSync(process.env.POSTGRES_PASSWORD_FILE, "utf8").trim(), connectionTimeoutMillis: 5000,
    statement_timeout: 5000, query_timeout: 6000, options: "-c lock_timeout=3000" });
  client.on("error", () => {});
  await client.connect();
  probeStage = "BEGIN_READ_ONLY";
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const records = (await client.query("SELECT metadata, consumed_at FROM capstone_key_releases WHERE created_at >= $1 ORDER BY created_at LIMIT 1000", [since])).rows;
  probeStage = "READ_STORED_AUDIT_LINKS";
  // Counts only: never export clinical identifiers, record contents or hashes.
  const rawLinks = (await client.query("SELECT previous_hash, record_hash FROM audit_logs")).rows;
  const hashCounts = new Map(), previousCounts = new Map();
  for (const row of rawLinks) {
    hashCounts.set(row.record_hash, (hashCounts.get(row.record_hash) ?? 0) + 1);
    previousCounts.set(row.previous_hash, (previousCounts.get(row.previous_hash) ?? 0) + 1);
  }
  storedLinkDiagnostics = {
    recordCount: rawLinks.length,
    genesisCount: previousCounts.get(null) ?? 0,
    malformedHashCount: rawLinks.filter(row => !/^sha256:[a-f0-9]{64}$/.test(row.record_hash ?? "") || (row.previous_hash !== null && !/^sha256:[a-f0-9]{64}$/.test(row.previous_hash ?? ""))).length,
    duplicateHashGroups: [...hashCounts.values()].filter(count => count > 1).length,
    forkGroups: [...previousCounts.values()].filter(count => count > 1).length,
    missingPredecessorCount: rawLinks.filter(row => row.previous_hash !== null && !hashCounts.has(row.previous_hash)).length,
    terminalCount: rawLinks.filter(row => !previousCounts.has(row.record_hash)).length,
    modifiedRecordCount: 0,
  };
  const audits = await PostgresStore.prototype.readTable.call({ client }, "auditLogs");
  for (const row of audits.filter(row => Date.parse(row.createdAt) >= Date.now() - 300000)) {
    const action = /^[A-Z0-9_]{1,80}$/.test(row.action ?? "") ? row.action : "OTHER";
    const reason = /^[A-Z0-9_]{1,80}$/.test(row.reasonCode ?? row.reason ?? "") ? (row.reasonCode ?? row.reason) : "OTHER";
    const key = `${action}:${reason}`;
    recentSafeAuditCounts[key] = (recentSafeAuditCounts[key] ?? 0) + 1;
  }
  const integrity = HipassService.prototype.verifyAuditIntegrity.call({ store: { get: name => { if (name !== "auditLogs") throw new Error(); return audits; } } });
  checks.push({ test: "ACTUAL_STORED_POSTGRES_AUDIT_CHAIN_NO_NORMALIZATION", status: integrity.ok ? "PASS" : "FAIL", checked: integrity.checked ?? audits.length, reason: integrity.reason ?? null });
  // Diagnose ordering without mutating any persisted hash or repairing content.
  const next = new Map();
  let ambiguous = false;
  for (const row of audits) {
    const previous = row.previousHash ?? null;
    if (next.has(previous)) ambiguous = true;
    next.set(previous, row);
  }
  const ordered = [], visited = new Set();
  let previous = null;
  while (!ambiguous && next.has(previous)) {
    const row = next.get(previous);
    if (visited.has(row.recordHash)) { ambiguous = true; break; }
    visited.add(row.recordHash); ordered.push(row); previous = row.recordHash;
  }
  const linked = !ambiguous && ordered.length === audits.length
    ? HipassService.prototype.verifyAuditIntegrity.call({ store: { get: () => ordered } }) : { ok: false, reason: "AMBIGUOUS_OR_INCOMPLETE_LINKS" };
  const diagnostics = { activeReaderOrderValid: integrity.ok, storedLinkOrderValid: linked.ok, checked: audits.length,
    ambiguousLinks: ambiguous, completeStoredLinks: ordered.length === audits.length, modifiedRecordCount: 0 };
  checks.push({ test: "DIAGNOSE_STORED_LINK_ORDER_WITHOUT_REPAIR", status: linked.ok ? "PASS" : "FAIL", ...diagnostics, reason: linked.reason ?? null });
  const consumed = records.filter(row => row.consumed_at !== null);
  const metadataOnly = records.length > 0 && records.every(({ metadata }) => Object.keys(metadata).sort().join() === ["releaseId", "receiptHash", "binding", "tokenId", "consentId", "doctorId", "auditSessionId", "sourceHospitalId", "expiresAt"].sort().join()
    && Object.keys(metadata.binding).sort().join() === ["packageId", "keyId", "wrappedKeyHash", "ciphertextHash", "manifestHash", "recipientHospitalId"].sort().join()
    && ["wrappedKeyHash", "ciphertextHash", "manifestHash"].every(field => /^[a-f0-9]{64}$/u.test(metadata.binding[field])));
  checks.push({ test: "ACTUAL_METADATA_ONLY_KEY_RELEASE_LEDGER", status: metadataOnly ? "PASS" : "FAIL", recordCount: records.length });
  const pinned = consumed.length >= 1 && consumed.every(({ metadata }) => metadata.binding.keyId === keyId
    && metadata.binding.recipientHospitalId === "HOSP-B" && metadata.sourceHospitalId === "HOSP-A");
  checks.push({ test: "ACTUAL_PINNED_KEY_RECIPIENT_ONE_TIME_CONSUMPTION", status: pinned ? "PASS" : "FAIL", consumedCount: consumed.length });
  const correlated = consumed.length > 0 && consumed.every(({ metadata }) => {
    const matches = audits.filter(row => row.auditSessionId === metadata.auditSessionId && row.consentId === metadata.consentId);
    return ["KEY_RELEASE_PREPARED", "KEY_RELEASE_PRECHECKED", "KEY_RELEASE_CONSUMED"].every(action => matches.some(row => row.action === action && row.actorId === `key-release:${metadata.releaseId}` && row.sourceHospitalId === "HOSP-A" && row.targetHospitalId === "HOSP-B"))
      && matches.some(row => row.action === "KEY_WRAP_AUTHORIZED" && row.actorId === `key-release:${metadata.binding.packageId}`)
      && matches.some(row => row.action === "DATA_PLANE_RESPONSE_PREPARED");
  });
  checks.push({ test: "ACTUAL_WRAP_PRE_POST_CONSUME_AND_RESPONSE_AUDIT_CORRELATION", status: correlated ? "PASS" : "FAIL" });
  await client.query("ROLLBACK");
} catch (error) {
  const integrityFailure = ["AUDIT_CHAIN_LINK_INVALID", "AUDIT_CHAIN_INTEGRITY_REQUIRED"].includes(error.message);
  checks.push({ test: "READ_ONLY_ENCRYPTION_LEDGER_PROBE", status: integrityFailure ? "FAIL" : "NOT VERIFIED", reason: integrityFailure ? error.message : "DATABASE_OR_SCHEMA_UNAVAILABLE", stage: probeStage, errorType: error.name });
} finally { await client?.end().catch(() => {}); }
const result = { scope: "ACTUAL_POSTGRES_ENCRYPTED_BROWSER_SUPPORTING_EVIDENCE", review: "DRAFT / UNASSIGNED", since, checks,
  recentSafeAuditCounts, storedLinkDiagnostics,
  status: checks.length === 5 && checks.every(row => row.status === "PASS") ? "PASS" : checks.some(row => row.status === "FAIL") ? "FAIL" : "NOT VERIFIED" };
console.log(JSON.stringify(result));
process.exitCode = result.status === "PASS" ? 0 : 1;
