import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { startOwnedPostgresFixture, removeOwnedPostgresFixture } from "./test-support/owned-postgres-start.js";
import { PostgresKeyReleaseRepository } from "../src/consent-bound-key-release.js";

const owner = randomUUID();
const password = randomBytes(32).toString("hex"); // Disposable fixture only, not a VM/runtime credential.
const options = { name: `hp-v3-key-release-${owner}`, owner, label: "highpass.validation.key-release", password,
  docker: (args, timeout) => spawnSync("docker", args, { encoding: "utf8", timeout, windowsHide: true, maxBuffer: 1048576 }) };
const checks = [];
let pool;
const directory = new URL(`../artifacts/workstation/key-release-db-${Date.now()}/`, import.meta.url);
await mkdir(directory, { recursive: true });
try {
  assert.equal(startOwnedPostgresFixture(options).running, true);
  const endpoint = options.docker(["port", options.name, "5432/tcp"], 10000);
  assert.equal(endpoint.status, 0);
  const match = endpoint.stdout.trim().match(/^127\.0\.0\.1:(\d+)$/u);
  assert.ok(match);
  const settings = { host: "127.0.0.1", port: Number(match[1]), user: "postgres", database: "postgres", password,
    max: 8, connectionTimeoutMillis: 1500, statement_timeout: 4000, query_timeout: 5000 };
  const deadline = Date.now() + 30000;
  for (;;) {
    pool = new pg.Pool(settings);
    try { await pool.query("SELECT 1"); break; } catch {
      await pool.end(); pool = null;
      if (Date.now() >= deadline) throw new Error("READINESS_TIMEOUT");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  await pool.query(await readFile(new URL("../db/migrations/030_capstone_key_release_ledger.sql", import.meta.url), "utf8"));
  let repository = new PostgresKeyReleaseRepository(pool);
  const releaseId = randomUUID();
  const record = { releaseId, receiptHash: "a".repeat(64), binding: { packageId: "synthetic-only" }, expiresAt: Date.now() + 60000 };
  await repository.create(record);
  await pool.end();
  pool = new pg.Pool(settings);
  repository = new PostgresKeyReleaseRepository(pool);
  assert.deepEqual(await repository.read(releaseId), { ...record, consumed: false });
  checks.push({ test: "DURABLE_BINDING_AFTER_CONNECTION_RESTART", status: "PASS" });
  const claims = await Promise.all(Array.from({ length: 32 }, () => repository.consume(releaseId)));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal((await repository.read(releaseId)).consumed, true);
  checks.push({ test: "POSTGRES_32_CONCURRENT_CLAIMS_ONE_WINNER", status: "PASS" });
  const expiredId = randomUUID();
  await repository.create({ ...record, releaseId: expiredId, expiresAt: Date.now() - 1000 });
  assert.equal(await repository.consume(expiredId), false);
  checks.push({ test: "DATABASE_CLOCK_EXPIRED_RELEASE_DENIED", status: "PASS" });
} catch (error) {
  checks.push({ test: "POSTGRES_KEY_RELEASE_GATE", status: "FAIL", reason: error instanceof assert.AssertionError ? "ASSERTION_FAILED" : error.name });
} finally {
  if (pool) await pool.end();
  const cleanup = removeOwnedPostgresFixture(options);
  checks.push({ test: "EXACT_OWNED_FIXTURE_REMOVED", status: cleanup.absent ? "PASS" : "NOT VERIFIED" });
}
const result = { scope: "ISOLATED_POSTGRES_KEY_RELEASE_LEDGER_ONLY", review: "DRAFT / UNASSIGNED", checks,
  status: checks.length === 4 && checks.every(check => check.status === "PASS") ? "PASS" : "FAIL", encryptedViewer: "NOT VERIFIED" };
await writeFile(new URL("result.json", directory), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: new URL("result.json", directory).pathname }));
process.exitCode = result.status === "PASS" ? 0 : 1;
