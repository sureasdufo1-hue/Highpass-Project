-- Phase 1 expand/backfill migration. Review and dry-run before any environment use.
-- Existing issued tokens become invalid because legacy JWTs lack mandatory iss/aud claims.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS token_hash varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS jti varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS issuer varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS audience varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS scope jsonb;

UPDATE dicom_access_token_logs
SET token_hash = 'sha256:' || encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

UPDATE dicom_access_token_logs SET jti = token_id WHERE jti IS NULL;
UPDATE dicom_access_token_logs SET issuer = 'highpass-control-plane' WHERE issuer IS NULL;
UPDATE dicom_access_token_logs SET audience = 'highpass-dicomweb-gateway' WHERE audience IS NULL;
UPDATE dicom_access_token_logs
SET scope = jsonb_build_object(
  'studyInstanceUid', study_instance_uid,
  'allowedSeriesUids', COALESCE(allowed_series_uids, '[]'::jsonb),
  'actions', CASE WHEN permission = 'DOWNLOAD_ALLOWED' THEN '["VIEW","DOWNLOAD"]'::jsonb ELSE '["VIEW"]'::jsonb END
)
WHERE scope IS NULL;

ALTER TABLE dicom_access_token_logs ALTER COLUMN token DROP NOT NULL;
ALTER TABLE dicom_access_token_logs ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE dicom_access_token_logs ALTER COLUMN jti SET NOT NULL;
ALTER TABLE dicom_access_token_logs ALTER COLUMN issuer SET NOT NULL;
ALTER TABLE dicom_access_token_logs ALTER COLUMN audience SET NOT NULL;
ALTER TABLE dicom_access_token_logs ALTER COLUMN scope SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token_hash ON dicom_access_token_logs(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_jti ON dicom_access_token_logs(jti);

-- Deliberately retain the nullable legacy token column for rollback compatibility.
-- A later reviewed contract migration must verify zero readers before dropping it.
COMMIT;
