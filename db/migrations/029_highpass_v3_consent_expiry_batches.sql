-- Internal additive ledger only. No runtime grants or scheduler activation.
CREATE FUNCTION highpass_v3.consent_expiry_batch_receipts(tenant uuid,hospital uuid,actor uuid,request bytea)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
 SET TimeZone='UTC' SET DateStyle='ISO, YMD' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('consentId',e.consent_id,'contentVersion',e.content_version,
  'eventId',e.event_id,'eventSequence',e.event_sequence,'state',e.state,'effectiveAt',e.effective_at::text,
  'recordedAt',e.recorded_at::text,'evidenceDigest',encode(e.evidence_digest,'hex'),'cascadeStatus','REQUESTED')
  ORDER BY e.consent_id),'[]'::jsonb)
 FROM highpass_v3.consent_lifecycle_results r JOIN highpass_v3.consent_lifecycle_events e USING(event_id)
 WHERE r.tenant_id=tenant AND r.hospital_id=hospital AND r.actor_id=actor
  AND r.operation='CONSENT_EXPIRE' AND r.request_digest=request
$$;
CREATE TABLE highpass_v3.consent_expiry_batches (
 batch_id uuid NOT NULL UNIQUE,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES highpass_v3.principal_bindings(actor_id),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 batch_limit integer NOT NULL CHECK(batch_limit BETWEEN 1 AND 100),
 processed integer NOT NULL CHECK(processed BETWEEN 0 AND batch_limit),
 receipts jsonb NOT NULL CHECK(jsonb_typeof(receipts)='array' AND jsonb_array_length(receipts)=processed),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,hospital_id,actor_id,key_digest),
 UNIQUE(tenant_id,hospital_id,actor_id,request_digest)
);
ALTER TABLE highpass_v3.consent_expiry_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.consent_expiry_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON highpass_v3.consent_expiry_batches FROM PUBLIC;
CREATE POLICY expiry_batch_own ON highpass_v3.consent_expiry_batches FOR ALL TO hp_v3_consent_expiry_policy
 USING(actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,NULL,'CONSENT_EXPIRE'))
 WITH CHECK(actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,NULL,'CONSENT_EXPIRE'));
CREATE TRIGGER expiry_batch_immutable BEFORE UPDATE OR DELETE ON highpass_v3.consent_expiry_batches
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE FUNCTION highpass_v3.require_consent_expiry_batch() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::uuid
  OR highpass_v3.consent_lifecycle_context(NEW.tenant_id,NEW.hospital_id,NULL,'CONSENT_EXPIRE') IS NOT TRUE
  OR NEW.recorded_at>clock_timestamp()
  OR NEW.receipts IS DISTINCT FROM highpass_v3.consent_expiry_batch_receipts(NEW.tenant_id,NEW.hospital_id,NEW.actor_id,NEW.request_digest)
 THEN RAISE EXCEPTION 'V3_CONSENT_EXPIRY_BATCH_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expiry_batch_assembly_required AFTER INSERT ON highpass_v3.consent_expiry_batches
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_consent_expiry_batch();
REVOKE ALL ON FUNCTION highpass_v3.consent_expiry_batch_receipts(uuid,uuid,uuid,bytea),
 highpass_v3.require_consent_expiry_batch() FROM PUBLIC;
