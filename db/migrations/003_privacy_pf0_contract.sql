-- PF-0 contract baseline. PostgreSQL 16 target; apply only through a privileged migration role.
-- Runtime access must use a distinct non-owner role and SET LOCAL app.institution_id.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE privacy_purpose AS ENUM ('RESEARCH','TEACHING','DEMO','AI_LOCAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_job_status AS ENUM ('PENDING','PROCESSING','SUCCEEDED','FAILED','UNSUPPORTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_current_stage AS ENUM ('RESOLVE','EXTRACT','DETECT','TRANSFORM','VALIDATE','FINALIZE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_policy_decision AS ENUM ('UNDECIDED','TRANSFORM_REQUIRED','REVIEW_REQUIRED','ALLOW','DENY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_review_status AS ENUM ('PENDING','APPROVED','REJECTED','STALE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_release_status AS ENUM ('NOT_READY','READY','SENDING','SENT','UNKNOWN','REVOKED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_artifact_state AS ENUM ('QUARANTINED','VALIDATED','EXPIRED','PURGED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS privacy_approved_uses (
  approved_use_ref text PRIMARY KEY,
  source_institution_id uuid NOT NULL REFERENCES institutions(institution_id),
  requester_ref text NOT NULL,
  allowed_actions text[] NOT NULL CHECK (cardinality(allowed_actions) > 0),
  source_artifact_ref text NOT NULL,
  source_artifact_version integer NOT NULL CHECK (source_artifact_version > 0),
  purpose privacy_purpose NOT NULL,
  recipient_ref text NOT NULL,
  consent_or_basis_version text NOT NULL,
  policy_version text NOT NULL,
  rules_profile text NOT NULL,
  mapping_scope text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS privacy_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_institution_id uuid NOT NULL REFERENCES institutions(institution_id),
  approved_use_ref text NOT NULL REFERENCES privacy_approved_uses(approved_use_ref),
  source_artifact_ref text NOT NULL,
  source_artifact_version integer NOT NULL CHECK (source_artifact_version > 0),
  purpose privacy_purpose NOT NULL,
  recipient_ref text NOT NULL,
  job_status privacy_job_status NOT NULL DEFAULT 'PENDING',
  current_stage privacy_current_stage NOT NULL DEFAULT 'RESOLVE',
  policy_decision privacy_policy_decision NOT NULL DEFAULT 'UNDECIDED',
  input_digest bytea NOT NULL,
  policy_digest bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_institution_id, approved_use_ref, source_artifact_ref, source_artifact_version, input_digest)
);

CREATE TABLE IF NOT EXISTS privacy_artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES privacy_jobs(job_id),
  source_institution_id uuid NOT NULL REFERENCES institutions(institution_id),
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  artifact_state privacy_artifact_state NOT NULL DEFAULT 'QUARANTINED',
  manifest_digest bytea NOT NULL,
  content_digest bytea NOT NULL,
  storage_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, artifact_version)
);

CREATE TABLE IF NOT EXISTS privacy_reviews (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES privacy_artifacts(artifact_id),
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  manifest_digest bytea NOT NULL,
  policy_version text NOT NULL,
  purpose privacy_purpose NOT NULL,
  recipient_ref text NOT NULL,
  approved_use_ref text NOT NULL REFERENCES privacy_approved_uses(approved_use_ref),
  review_status privacy_review_status NOT NULL DEFAULT 'PENDING',
  reviewer_ref text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_releases (
  release_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES privacy_artifacts(artifact_id),
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  manifest_digest bytea NOT NULL,
  policy_version text NOT NULL,
  purpose privacy_purpose NOT NULL,
  recipient_ref text NOT NULL,
  approved_use_ref text NOT NULL REFERENCES privacy_approved_uses(approved_use_ref),
  release_status privacy_release_status NOT NULL DEFAULT 'NOT_READY',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_pseudonym_mappings (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_institution_id uuid NOT NULL REFERENCES institutions(institution_id),
  purpose privacy_purpose NOT NULL,
  recipient_ref text NOT NULL,
  mapping_scope text NOT NULL,
  source_value_digest bytea NOT NULL,
  pseudonym_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (source_institution_id, purpose, recipient_ref, mapping_scope, source_value_digest)
);

CREATE OR REPLACE FUNCTION privacy_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_privacy_jobs_updated ON privacy_jobs;
CREATE TRIGGER trg_privacy_jobs_updated BEFORE UPDATE ON privacy_jobs FOR EACH ROW EXECUTE FUNCTION privacy_set_updated_at();

ALTER TABLE privacy_approved_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_pseudonym_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_approved_uses FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_pseudonym_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS privacy_approved_use_tenant ON privacy_approved_uses;
CREATE POLICY privacy_approved_use_tenant ON privacy_approved_uses USING (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid) WITH CHECK (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid);
DROP POLICY IF EXISTS privacy_job_tenant ON privacy_jobs;
CREATE POLICY privacy_job_tenant ON privacy_jobs USING (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid) WITH CHECK (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid);
DROP POLICY IF EXISTS privacy_artifact_tenant ON privacy_artifacts;
CREATE POLICY privacy_artifact_tenant ON privacy_artifacts USING (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid) WITH CHECK (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid);
DROP POLICY IF EXISTS privacy_review_tenant ON privacy_reviews;
CREATE POLICY privacy_review_tenant ON privacy_reviews USING (EXISTS (SELECT 1 FROM privacy_artifacts a WHERE a.artifact_id = privacy_reviews.artifact_id AND a.source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid));
DROP POLICY IF EXISTS privacy_release_tenant ON privacy_releases;
CREATE POLICY privacy_release_tenant ON privacy_releases USING (EXISTS (SELECT 1 FROM privacy_artifacts a WHERE a.artifact_id = privacy_releases.artifact_id AND a.source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid));
DROP POLICY IF EXISTS privacy_mapping_tenant ON privacy_pseudonym_mappings;
CREATE POLICY privacy_mapping_tenant ON privacy_pseudonym_mappings USING (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid) WITH CHECK (source_institution_id = nullif(current_setting('app.institution_id', true), '')::uuid);

REVOKE ALL ON privacy_approved_uses, privacy_jobs, privacy_artifacts, privacy_reviews, privacy_releases, privacy_pseudonym_mappings FROM PUBLIC;
COMMIT;
