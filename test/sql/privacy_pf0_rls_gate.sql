\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE privacy_pf0_runtime NOLOGIN;
GRANT SELECT, INSERT, UPDATE ON privacy_approved_uses, privacy_jobs, privacy_artifacts, privacy_reviews, privacy_releases, privacy_pseudonym_mappings TO privacy_pf0_runtime;

INSERT INTO institutions(institution_id, code, display_name, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'PF0-A', 'Synthetic PF0 A', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000002', 'PF0-B', 'Synthetic PF0 B', 'ACTIVE');
INSERT INTO privacy_approved_uses(approved_use_ref, source_institution_id, requester_ref, allowed_actions, source_artifact_ref, source_artifact_version, purpose, recipient_ref, consent_or_basis_version, policy_version, rules_profile, mapping_scope, issued_at, expires_at) VALUES
  ('pf0-a', '10000000-0000-0000-0000-000000000001', 'synthetic', ARRAY['privacy:inspect'], 'artifact-a', 1, 'RESEARCH', 'recipient-a', 'basis-v1', 'policy-v1', 'rules-v1', 'scope-a', now(), now() + interval '1 day'),
  ('pf0-b', '20000000-0000-0000-0000-000000000002', 'synthetic', ARRAY['privacy:inspect'], 'artifact-b', 1, 'RESEARCH', 'recipient-b', 'basis-v1', 'policy-v1', 'rules-v1', 'scope-b', now(), now() + interval '1 day');

SET LOCAL ROLE privacy_pf0_runtime;
SET LOCAL app.institution_id = '10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM privacy_approved_uses) <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
