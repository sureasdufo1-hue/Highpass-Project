-- Internal safe retry/denial audit. No public read or runtime grants.
ALTER TABLE highpass_v3.consent_lifecycle_events ADD CONSTRAINT withdrawal_outcome_event_context
 UNIQUE(event_id,tenant_id,hospital_id,patient_ref,actor_id);
CREATE TABLE highpass_v3.consent_withdrawal_outcomes (
 outcome_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_ref uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES highpass_v3.principal_bindings(actor_id),
 selector_digest bytea NOT NULL CHECK(octet_length(selector_digest)=32),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
 result text NOT NULL CHECK(result IN ('HISTORICAL_RESULT','DENY')),
 reason_code text NOT NULL CHECK(reason_code IN ('ORIGINAL_RECEIPT_RECOVERED','IDEMPOTENCY_CONFLICT',
  'CONSENT_TERMINAL','CONSENT_EXPIRED','CONSENT_NOT_ACTIVE','CONSENT_RESOURCE_UNAVAILABLE')),
 receipt_event_id uuid,audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 CHECK((result='HISTORICAL_RESULT' AND reason_code='ORIGINAL_RECEIPT_RECOVERED' AND receipt_event_id IS NOT NULL)
  OR (result='DENY' AND reason_code<>'ORIGINAL_RECEIPT_RECOVERED' AND receipt_event_id IS NULL)),
 FOREIGN KEY(receipt_event_id,tenant_id,hospital_id,patient_ref,actor_id)
 REFERENCES highpass_v3.consent_lifecycle_events(event_id,tenant_id,hospital_id,patient_ref,actor_id)
);
ALTER TABLE highpass_v3.consent_withdrawal_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.consent_withdrawal_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_outcome_own ON highpass_v3.consent_withdrawal_outcomes FOR ALL TO hp_v3_consent_withdraw_policy
 USING(actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_WITHDRAW'))
 WITH CHECK(actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_WITHDRAW'));
CREATE TRIGGER withdrawal_outcome_immutable BEFORE UPDATE OR DELETE ON highpass_v3.consent_withdrawal_outcomes
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON highpass_v3.consent_withdrawal_outcomes FROM PUBLIC;
