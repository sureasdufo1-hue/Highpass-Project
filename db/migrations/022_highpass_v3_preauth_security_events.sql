-- Isolated capstone foundation only. No runtime login enrollment or retention job.
CREATE ROLE hp_v3_preauth_publisher_policy NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE hp_v3_preauth_reader_policy NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE TABLE highpass_v3.preauth_security_events (
 event_id uuid PRIMARY KEY,
 observed_at timestamptz NOT NULL CHECK(isfinite(observed_at)),
 scope text NOT NULL CHECK(scope='CAPSTONE_SYNTHETIC_ONLY'),
 stage text NOT NULL CHECK(stage IN ('TLS','INGRESS','HUMAN_AUTH','MOCK_ASSURANCE')),
 reason_code text NOT NULL,
 result text NOT NULL CHECK(result='DENY'),
 source_kind text NOT NULL CHECK(source_kind='IMMEDIATE_SOCKET'),
 source_ip inet CHECK(source_ip IS NULL OR masklen(source_ip)=CASE family(source_ip) WHEN 4 THEN 32 ELSE 128 END),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(recorded_at)),
 CHECK(observed_at BETWEEN recorded_at-interval '10 seconds' AND recorded_at+interval '10 seconds'),
 CHECK((stage='TLS' AND reason_code IN ('TLS_CERTIFICATE_REQUIRED','TLS_CERTIFICATE_EXPIRED',
  'TLS_CERTIFICATE_NOT_YET_VALID','TLS_CERTIFICATE_UNTRUSTED','UNKNOWN_TLS'))
  OR (stage='INGRESS' AND reason_code='INGRESS_REJECTED')
  OR (stage='HUMAN_AUTH' AND reason_code='HUMAN_AUTH_REJECTED')
  OR (stage='MOCK_ASSURANCE' AND reason_code='MOCK_ASSURANCE_REQUIRED'))
);
ALTER TABLE highpass_v3.preauth_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.preauth_security_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON highpass_v3.preauth_security_events FROM PUBLIC;
CREATE TRIGGER preauth_immutable BEFORE UPDATE OR DELETE ON highpass_v3.preauth_security_events
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE POLICY preauth_publish ON highpass_v3.preauth_security_events FOR INSERT TO hp_v3_preauth_publisher_policy
 WITH CHECK(recorded_at=statement_timestamp());
CREATE POLICY preauth_read ON highpass_v3.preauth_security_events FOR SELECT TO hp_v3_preauth_reader_policy USING(true);
GRANT USAGE ON SCHEMA highpass_v3 TO hp_v3_preauth_publisher_policy,hp_v3_preauth_reader_policy;
GRANT INSERT(event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip)
 ON highpass_v3.preauth_security_events TO hp_v3_preauth_publisher_policy;
GRANT SELECT ON highpass_v3.preauth_security_events TO hp_v3_preauth_reader_policy;
-- SQL credential proves publisher authority, NOT socket provenance. No clinical IDs,
-- broad JSON, UPDATE/DELETE policy, SECURITY DEFINER, production reader or backfill.
