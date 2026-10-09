-- Additive identity network-audit foundation, requires 007/008 and 011.
-- No runtime enrollment, historical backfill or clinical authority grant.
ALTER TABLE highpass_v3.identity_audit_outbox ADD CONSTRAINT identity_audit_network_tuple
 UNIQUE(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id);
CREATE TABLE highpass_v3.identity_network_audit (
 event_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL,
 source_ip inet NOT NULL CHECK(masklen(source_ip)=CASE family(source_ip) WHEN 4 THEN 32 ELSE 128 END),
 ingress_mode text NOT NULL CHECK(ingress_mode='CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'),
 proxy_certificate_sha256 bytea NOT NULL CHECK(octet_length(proxy_certificate_sha256)=32),
 observed_at timestamptz NOT NULL CHECK(isfinite(observed_at)),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(recorded_at)),
 CHECK(observed_at BETWEEN recorded_at-interval '10 seconds' AND recorded_at+interval '10 seconds'),
 FOREIGN KEY(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
 REFERENCES highpass_v3.identity_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
);
ALTER TABLE highpass_v3.identity_network_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.identity_network_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON highpass_v3.identity_network_audit FROM PUBLIC;
CREATE TRIGGER identity_network_immutable BEFORE UPDATE OR DELETE ON highpass_v3.identity_network_audit
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE POLICY identity_network_read ON highpass_v3.identity_network_audit FOR SELECT TO hp_v3_clinical_policy
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid);
CREATE POLICY identity_network_insert ON highpass_v3.identity_network_audit FOR INSERT TO hp_v3_clinical_policy
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
 AND recorded_at=statement_timestamp()
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=identity_network_audit.actor_id
   AND p.tenant_id=identity_network_audit.tenant_id AND p.hospital_id=identity_network_audit.hospital_id
   AND p.status='ACTIVE' AND p.role IN ('DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN')
   AND p.scopes && ARRAY['mapping:read','mapping:write','mapping:review']::text[])
 AND EXISTS(SELECT 1 FROM highpass_v3.identity_audit_outbox e WHERE e.event_id=identity_network_audit.event_id
   AND e.tenant_id=identity_network_audit.tenant_id AND e.hospital_id=identity_network_audit.hospital_id
   AND e.actor_id=identity_network_audit.actor_id AND e.audit_session_id=identity_network_audit.audit_session_id
   AND e.trace_id=identity_network_audit.trace_id));
-- SQL rights alone never prove network origin. Trusted capability writer and
-- strict service transaction guards remain required. No UPDATE/DELETE policies.
