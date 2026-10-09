-- Additive shared replay ledger: no token, proof JWT, JWK, jti or patient data.
-- Deliberately no FK: independent of legacy save/TRUNCATE transactions.
BEGIN;
CREATE TABLE IF NOT EXISTS dpop_replay_entries (
  proof_hash char(64) PRIMARY KEY CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS dpop_replay_expiry_idx ON dpop_replay_entries(expires_at);
COMMIT;
