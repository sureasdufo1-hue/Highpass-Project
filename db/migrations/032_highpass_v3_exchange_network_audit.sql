-- Additive Session provenance foundation; requires 011/013/031.
-- No backfill, enrollment, SQL grants or clinical authorization.
ALTER TABLE highpass_v3.exchange_audit_outbox ADD CONSTRAINT exchange_audit_network_tuple
 UNIQUE(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id);
CREATE TABLE highpass_v3.exchange_network_audit (
 event_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL,
 source_ip inet NOT NULL CHECK(masklen(source_ip)=CASE family(source_ip) WHEN 4 THEN 32 ELSE 128 END),
 ingress_mode text NOT NULL CHECK(ingress_mode='CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'),
 proxy_certificate_sha256 bytea NOT NULL CHECK(octet_length(proxy_certificate_sha256)=32),
 observed_at timestamptz NOT NULL CHECK(isfinite(observed_at)),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(recorded_at)),
 CHECK(observed_at BETWEEN recorded_at-interval '10 seconds' AND recorded_at+interval '10 seconds'),
 FOREIGN KEY(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
 REFERENCES highpass_v3.exchange_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
);
ALTER TABLE highpass_v3.exchange_network_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_network_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON highpass_v3.exchange_network_audit FROM PUBLIC;
CREATE TRIGGER exchange_network_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_network_audit
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE POLICY exchange_network_read ON highpass_v3.exchange_network_audit FOR SELECT TO hp_v3_clinical_policy
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
   JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=exchange_network_audit.actor_id
   AND p.tenant_id=exchange_network_audit.tenant_id AND p.hospital_id=exchange_network_audit.hospital_id
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'audit:read'=ANY(p.scopes)));
CREATE POLICY exchange_network_insert ON highpass_v3.exchange_network_audit FOR INSERT TO hp_v3_clinical_policy
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
 AND recorded_at=statement_timestamp()
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
   JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=exchange_network_audit.actor_id
   AND p.tenant_id=exchange_network_audit.tenant_id AND p.hospital_id=exchange_network_audit.hospital_id
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN')
   AND p.scopes && ARRAY['exchange:create','exchange:read']::text[]));
-- Composite FK binds provenance to the exact domain event without granting its
-- writer audit:read. INSERT authority alone is not proof of a trusted network.
-- No UPDATE/DELETE policies; strict branded capability service is mandatory.
