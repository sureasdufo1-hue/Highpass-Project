import { fork } from "node:child_process";
import { createHash, randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PostgresDPoPReplayStore } from "../../src/dpop-replay-store.js";

if (!/^hp-validation-[a-z0-9-]+$/.test(process.env.HIPASS_COMPOSE_PROJECT ?? "") || process.env.HIPASS_STORE !== "postgres") throw new Error("Independent synthetic Postgres required");
const deadline = setTimeout(() => { console.log(JSON.stringify({ result: "NOT VERIFIED", reason: "REPLAY_POSTGRES_DEADLINE" })); process.exit(2); }, 60000);
const stores = [new PostgresDPoPReplayStore(process.env.DATABASE_URL), new PostgresDPoPReplayStore(process.env.DATABASE_URL)];
const workers = [];
const results = [];
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
function check(name, ok) { results.push({ name, result: ok ? "PASS" : "FAIL" }); if (!ok) throw new Error("CHECK_FAILED"); }
async function worker() {
  const child = fork(fileURLToPath(new URL("dpop-replay-worker.js", import.meta.url)), [], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  workers.push(child);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WORKER_READY_TIMEOUT")), 10000);
    child.once("message", message => { clearTimeout(timer); message.ready ? resolve() : reject(new Error("WORKER_NOT_READY")); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("WORKER_EXIT")); });
  });
  return child;
}
async function ask(child, proof, url) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { child.off("message", listener); reject(new Error("WORKER_QUERY_TIMEOUT")); }, 10000);
    function listener(message) { if (message.id !== id) return; clearTimeout(timer); child.off("message", listener); resolve(message); }
    child.on("message", listener); child.send({ id, proof, url });
  });
}
async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send({ type: "stop" }); else child.kill();
  });
}
try {
  const atomicHash = hash();
  const race = await Promise.all(Array.from({ length: 32 }, (_, i) => stores[i % 2].consume(atomicHash)));
  check("32 concurrent claims / two independent pools: exactly one ALLOW", race.filter(Boolean).length === 1);
  const columns = await stores[0].pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dpop_replay_entries' ORDER BY column_name");
  check("ledger stores proof_hash + expires_at only", JSON.stringify(columns.rows.map(row => row.column_name)) === JSON.stringify(["expires_at", "proof_hash"]));
  const key = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = key.publicKey.export({ format: "jwk" });
  const url = `${new URL(process.env.HIPASS_PUBLIC_BASE_URL).origin}/api/dicom-access/request`;
  function proof() {
    const payload = { jti: randomUUID(), htm: "POST", htu: url, iat: Math.floor(Date.now() / 1000) };
    const input = [{ typ: "dpop+jwt", alg: "ES256", jwk }, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    return `${input}.${sign("sha256", Buffer.from(input), { key: key.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  }
  const [first, second] = await Promise.all([worker(), worker()]);
  const shared = proof();
  const verified = await Promise.all([ask(first, shared, url), ask(second, shared, url)]);
  check("same signed proof / two Node processes: one ALLOW, one replay DENY", verified.filter(result => result.valid).length === 1 && verified.some(result => result.reason === "DPOP_NONCE_REPLAYED"));
  const restartedProof = proof();
  check("before verifier process restart: ALLOW", (await ask(first, restartedProof, url)).valid);
  await stop(first);
  const restarted = await worker();
  check("after verifier process restart: same proof DENY", (await ask(restarted, restartedProof, url)).reason === "DPOP_NONCE_REPLAYED");
  const skewHash = hash(); let skewCode;
  try { await stores[0].consume(skewHash, Date.now() - 60000); } catch (error) { skewCode = error.code; }
  const skewRows = await stores[0].pool.query("SELECT count(*)::int AS count FROM dpop_replay_entries WHERE proof_hash = $1", [skewHash]);
  check("DB/application clock drift fails closed without inserting", skewCode === "DPOP_REPLAY_CLOCK_SKEW" && skewRows.rows[0].count === 0);
  // Own synthetic hash fixtures only; this is a timestamp fixture, not a 200s wait.
  const expiredHash = hash(); await stores[0].consume(expiredHash);
  await stores[0].pool.query("UPDATE dpop_replay_entries SET expires_at = statement_timestamp() - interval '1 second' WHERE proof_hash = $1", [expiredHash]);
  check("expired hash timestamp fixture can be claimed again", await stores[1].consume(expiredHash));
  const pruneHash = hash();
  await stores[0].pool.query("INSERT INTO dpop_replay_entries VALUES ($1, statement_timestamp() - interval '1 second')", [pruneHash]);
  await stores[1].pruneExpired();
  const pruned = await stores[0].pool.query("SELECT proof_hash FROM dpop_replay_entries WHERE proof_hash = ANY($1::text[])", [[pruneHash, atomicHash]]);
  check("bounded cleanup removes expired fixture and preserves live claim", pruned.rows.length === 1 && pruned.rows[0].proof_hash.trim() === atomicHash);
  const closed = new PostgresDPoPReplayStore(process.env.DATABASE_URL); await closed.close(); let failureCode;
  try { await closed.consume(hash()); } catch (error) { failureCode = error.code; }
  check("closed database pool fails closed, no memory fallback", failureCode === "DPOP_REPLAY_STORE_UNAVAILABLE");
  const result = results.every(item => item.result === "PASS") ? "PASS" : "FAIL";
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), result, scope: "SHARED REPLAY COMPONENT / NOT FULL API HA", results }, null, 2));
  process.exitCode = result === "PASS" ? 0 : 1;
} catch (error) {
  const safeCode = ["DPOP_REPLAY_STORE_UNAVAILABLE", "DPOP_REPLAY_CLOCK_SKEW"].includes(error.code) ? error.code
    : ["CHECK_FAILED", "WORKER_READY_TIMEOUT", "WORKER_NOT_READY", "WORKER_EXIT", "WORKER_QUERY_TIMEOUT"].includes(error.message) ? error.message : "CHECK_OR_ENVIRONMENT_FAILURE";
  console.log(JSON.stringify({ result: results.some(item => item.result === "FAIL") ? "FAIL" : "NOT VERIFIED", reason: safeCode, results }, null, 2));
  process.exitCode = results.some(item => item.result === "FAIL") ? 1 : 2;
} finally { await Promise.all(workers.map(stop)); await Promise.all(stores.map(store => store.close())); clearTimeout(deadline); }
