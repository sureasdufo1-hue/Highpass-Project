import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { MemoryDPoPReplayStore, PostgresDPoPReplayStore, ReplayStoreError } from "../src/dpop-replay-store.js";
import { HipassService } from "../src/services.js";
import { JsonStore } from "../src/store.js";

const hash = createHash("sha256").update("synthetic-replay-contract").digest("hex");

test("replay memory adapter is atomic, bounded and explicitly non-persistent", async () => {
  const store = new MemoryDPoPReplayStore();
  assert.equal(store.persistent, false);
  assert.equal((await Promise.all(Array.from({ length: 32 }, () => store.consume(hash, 1000)))).filter(Boolean).length, 1);
  assert.equal(await store.consume(hash, 200999), false);
  assert.equal(await store.consume(hash, 201000), true);
  for (let i = 0; i < 9999; i++) store.entries.set(String(i), 999999);
  await assert.rejects(store.consume("new", 1000), { code: "DPOP_REPLAY_STORE_FULL" });
});

test("Postgres replay uses parameterized atomic conflict/clock guard and bounded TTL cleanup", async () => {
  const calls = [];
  const pool = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [{ accepted: true, clock_ok: true }] }; }, end: async () => {} };
  const store = new PostgresDPoPReplayStore(undefined, { pool });
  assert.equal(store.scope, "SHARED_POSTGRES");
  assert.equal(await store.consume(hash), true);
  assert.match(calls[0].sql, /ON CONFLICT \(proof_hash\) DO UPDATE/);
  assert.match(calls[0].sql, /expires_at <= statement_timestamp/);
  assert.match(calls[0].sql, /interval '200 seconds'/);
  assert.deepEqual(calls[0].values.slice(0, 1), [hash]);
  assert.equal(calls[0].sql.includes(hash), false);
  store.attempts = 255; await store.consume(hash);
  assert.match(calls[1].sql, /LIMIT 512 FOR UPDATE SKIP LOCKED/);
  await store.close();
});

test("Postgres replay never falls back on unavailable storage, malformed result or clock skew", async () => {
  for (const result of [new Error("database credential must not escape"), { rows: [] }, { rows: [{ clock_ok: true, accepted: null }] }, { rows: [{ clock_ok: false, accepted: false }] }]) {
    const pool = { query: async () => { if (result instanceof Error) throw result; return result; } };
    const store = new PostgresDPoPReplayStore(undefined, { pool });
    await assert.rejects(store.consume(hash), error => error instanceof ReplayStoreError && !error.message.includes("credential"));
  }
  const replay = new PostgresDPoPReplayStore(undefined, { pool: { query: async () => ({ rows: [{ clock_ok: true, accepted: false }] }) } });
  assert.equal(await replay.consume(hash), false);
});

test("replay migration has no clinical FK and cannot be erased by legacy bulk saves", async () => {
  const sql = await readFile("db/migrations/005_dpop_replay_store.sql", "utf8");
  const source = await readFile("src/postgres-store.js", "utf8");
  assert.match(sql, /proof_hash char\(64\) PRIMARY KEY/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /REFERENCES|DROP |TRUNCATE/i);
  const truncate = source.slice(source.indexOf("TRUNCATE"), source.indexOf("RESTART IDENTITY"));
  assert.equal(truncate.includes("dpop_replay"), false);
  assert.match(source, /text: dpopReplaySchemaSql, query_timeout: 60000/);
  assert.match(source, /statement_timeout: 25000, query_timeout: 30000/);
});

test("proof store outage denies token issuance and Gateway with 503 even when audit persistence fails", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "hp-replay-fault-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new JsonStore(path.join(dir, "db.json")); await store.load();
  const now = "2026-06-25T10:00:00.000Z";
  const service = new HipassService(store, () => now, { tokenSecret: randomBytes(32).toString("hex") });
  const key = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = key.publicKey.export({ format: "jwk" });
  const origin = "https://localhost:3443";
  function context(method, route, token) {
    const payload = { jti: randomBytes(12).toString("hex"), htm: method, htu: origin + route, iat: Date.parse(now) / 1000, ...(token ? { ath: createHash("sha256").update(token).digest("base64url") } : {}) };
    const input = [{ typ: "dpop+jwt", alg: "ES256", jwk }, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    const signature = sign("sha256", Buffer.from(input), { key: key.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
    return { method, externalUrl: origin + route, dpopProof: `${input}.${signature}`, ingressTrusted: true, authorizationScheme: "DPoP" };
  }
  const input = { consentId: "CONSENT-DEMO-ACTIVE", doctorId: "DOC-B-01", requestingHospitalId: "HOSP-B", purpose: "TREATMENT", requestedAction: "VIEW", studyInstanceUid: "1.2.410.100.1.20260620.001" };
  const issued = await service.requestDicomAccessToken(input, context("POST", "/api/dicom-access/request"));
  assert.equal(issued.decision, "ALLOWED");
  service.dpopReplayStore = { consume: async () => { throw new ReplayStoreError(); } };
  store.save = async () => { throw new Error("simulated audit outage"); };
  const denied = await service.requestDicomAccessToken(input, context("POST", "/api/dicom-access/request"));
  assert.equal(denied.statusCode, 503); assert.equal(denied.auditStatus, "NOT_RECORDED");
  assert.equal(denied.accessToken, undefined);
  const gateway = await service.gatewayListStudies(issued.accessToken, context("GET", "/dicomweb/studies", issued.accessToken));
  assert.equal(gateway.status, 503); assert.equal(gateway.body.error, "DPOP_REPLAY_STORE_UNAVAILABLE");
});
