-- Typed reason expansion and read/lock authority; no recipient activation or grants.
ALTER TABLE highpass_v3.exchange_audit_outbox
 DROP CONSTRAINT exchange_audit_outbox_reason_code_check,
 DROP CONSTRAINT exchange_audit_outbox_check1,
 ADD CONSTRAINT exchange_audit_reason CHECK(reason_code IN
 ('SESSION_REQUESTED','METADATA_READ','SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED',
  'IDEMPOTENCY_CONFLICT','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE')),
 ADD CONSTRAINT exchange_audit_action_result CHECK
 ((action='SESSION_CREATED' AND result='ALLOW' AND reason_code='SESSION_REQUESTED' AND session_id IS NOT NULL AND session_version=1)
 OR (action='SESSION_READ' AND result='ALLOW' AND reason_code='METADATA_READ' AND session_id IS NOT NULL AND session_version=1)
 OR (action='SESSION_DENIED' AND result='DENY' AND reason_code IN
  ('SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED','IDEMPOTENCY_CONFLICT','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE')));
CREATE POLICY exchange_read_lock ON highpass_v3.exchange_sessions FOR UPDATE USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants p WHERE p.session_id=exchange_sessions.session_id
  AND p.status='ACTIVE')) WITH CHECK(false);
CREATE POLICY exchange_read_audit_insert ON highpass_v3.exchange_audit_outbox FOR INSERT WITH CHECK
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
 AND action IN ('SESSION_READ','SESSION_DENIED')
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=exchange_audit_outbox.actor_id AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
   AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') AND 'exchange:read'=ANY(p.scopes))
 AND (session_id IS NULL OR EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_audit_outbox.session_id)));
