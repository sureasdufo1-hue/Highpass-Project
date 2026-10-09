import pg from "pg";

// 2*60s proof window + 2*30s allowed node/DB skew + rounding/latency margin.
export const DPOP_REPLAY_TTL_SECONDS = 200;
export const dpopReplaySchemaSql = `
CREATE TABLE IF NOT EXISTS dpop_replay_entries (
  proof_hash char(64) PRIMARY KEY CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS dpop_replay_expiry_idx ON dpop_replay_entries(expires_at);
`;

const consumeSql = `
WITH clock_guard AS (
  SELECT statement_timestamp() AS db_now
  WHERE abs(extract(epoch FROM (statement_timestamp() - $2::timestamptz))) <= 30
), claimed AS (
  INSERT INTO dpop_replay_entries (proof_hash, expires_at)
  SELECT $1, db_now + interval '200 seconds' FROM clock_guard
  ON CONFLICT (proof_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at
    WHERE dpop_replay_entries.expires_at <= statement_timestamp()
  RETURNING proof_hash
)
SELECT EXISTS(SELECT 1 FROM clock_guard) AS clock_ok,
       EXISTS(SELECT 1 FROM claimed) AS accepted
`;

export class ReplayStoreError extends Error {
  constructor(code = "DPOP_REPLAY_STORE_UNAVAILABLE") { super(code); this.code = code; }
}

// Explicit JSON/test compatibility adapter, not restart/cross-process storage.
export class MemoryDPoPReplayStore {
  persistent = false;
  scope = "SINGLE_PROCESS";
  entries = new Map();
  async consume(proofHash, nowMs = Date.now()) {
    for (const [key, expiresAt] of this.entries) if (expiresAt <= nowMs) this.entries.delete(key);
    if (this.entries.has(proofHash)) return false;
    if (this.entries.size >= 10000) throw new ReplayStoreError("DPOP_REPLAY_STORE_FULL");
    this.entries.set(proofHash, nowMs + DPOP_REPLAY_TTL_SECONDS * 1000);
    return true;
  }
}

export class PostgresDPoPReplayStore {
  persistent = true;
  scope = "SHARED_POSTGRES";
  attempts = 0;
  constructor(connectionString, { pool } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000, statement_timeout: 4000, query_timeout: 5000,
      options: "-c lock_timeout=3000" });
    this.pool.on?.("error", () => console.warn("DPOP_REPLAY_POOL_UNAVAILABLE"));
  }
  async consume(proofHash, nowMs = Date.now()) {
    if (!/^[a-f0-9]{64}$/.test(proofHash) || !Number.isFinite(nowMs)) throw new ReplayStoreError();
    try {
      // Bounded maintenance of expired proof hashes only, never clinical/audit rows.
      if (++this.attempts % 256 === 0) await this.pruneExpired();
      const { rows } = await this.pool.query(consumeSql, [proofHash, new Date(nowMs).toISOString()]);
      if (typeof rows[0]?.clock_ok !== "boolean" || typeof rows[0]?.accepted !== "boolean") throw new ReplayStoreError();
      if (!rows[0].clock_ok) throw new ReplayStoreError("DPOP_REPLAY_CLOCK_SKEW");
      return rows[0].accepted;
    } catch (error) {
      throw error instanceof ReplayStoreError ? error : new ReplayStoreError();
    }
  }
  async pruneExpired() {
    return this.pool.query(`DELETE FROM dpop_replay_entries WHERE proof_hash IN
      (SELECT proof_hash FROM dpop_replay_entries WHERE expires_at <= statement_timestamp()
       ORDER BY expires_at LIMIT 512 FOR UPDATE SKIP LOCKED)`);
  }
  async close() { await this.pool.end(); }
}
