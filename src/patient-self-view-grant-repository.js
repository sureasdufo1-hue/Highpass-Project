import { PatientSelfViewAuthorityReader } from './patient-self-view-authority.js';
import { AuditAction } from './domain.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const failure = () => Object.assign(new Error('AUTHORITY_PERSISTENCE_UNAVAILABLE'), { statusCode: 503 });

// Internal persistence boundary, NOT an HTTP token issuer. appendAudit must write
// using this transaction and the existing chain's serialization discipline.
// No default in-memory audit fallback; not wired to runtime until that adapter
// and its interaction with legacy saveQueue have been independently verified.
export class PatientSelfViewGrantRepository {
  constructor({ pool, appendAudit, enabled = false, clock = Date.now, deadlineMs = 10000 }) {
    if (typeof pool?.connect !== 'function' || typeof appendAudit !== 'function'
      || !Number.isInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 10000) throw failure();
    this.pool = pool; this.appendAudit = appendAudit; this.enabled = enabled === true;
    this.clock = clock; this.deadlineMs = deadlineMs;
  }

  async create(input, grant) {
    input = structuredClone(input); grant = structuredClone(grant);
    const now = this.clock();
    if (!this.enabled || !uuid(grant?.grantId) || !uuid(grant?.auditSessionId)
      || !hash(grant?.tokenHash) || !hash(grant?.ownershipRevision)
      || typeof grant?.proofKeyThumbprint !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(grant.proofKeyThumbprint)
      || !['hospital-a-gateway', 'hospital-b-portal'].includes(grant?.viewingGatewayId)
      || !Number.isFinite(grant?.issuedAtMs) || !Number.isFinite(grant?.expiresAtMs)
      || grant.issuedAtMs > now || grant.expiresAtMs <= now
      || grant.expiresAtMs - grant.issuedAtMs <= 0 || grant.expiresAtMs - grant.issuedAtMs > 300000
      || !Number.isFinite(input?.principal?.expiresAtMs) || grant.expiresAtMs > input.principal.expiresAtMs) throw failure();

    let client, timer, closed = false, released = false, began = false, committing = false, rejectConnection;
    const connectionFailure = new Promise((_, reject) => { rejectConnection = reject; });
    const onError = () => { closed = true; rejectConnection(failure()); release(true); };
    const release = destroy => { if (client && !released) {
      released = true; if (!destroy) client.removeListener?.('error', onError); client.release(destroy);
    } };
    const query = async config => {
      if (closed || released) throw failure();
      return client.query(typeof config === 'string'
        ? { text: config, values: [], query_timeout: 5000 }
        : { ...config, query_timeout: 5000 });
    };
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { closed = true; reject(failure()); release(true); }, this.deadlineMs);
    });
    const work = (async () => {
      const acquired = await this.pool.connect();
      if (closed) { acquired.release(true); throw failure(); }
      client = acquired;
      client.on?.('error', onError);
      await query('BEGIN'); began = true;
      await query("SET LOCAL statement_timeout='5000ms'");
      await query("SET LOCAL lock_timeout='2000ms'");
      await query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
      const authority = new PatientSelfViewAuthorityReader({ pool: { query }, enabled: true, clock: this.clock, lockRows: true });
      const allowed = await authority.authorize(input);
      if (allowed.decision !== 'ALLOWED' || allowed.scope.ownershipRevision !== grant.ownershipRevision
        || !uuid(allowed.scope.refId)) throw failure();
      const scope = allowed.scope;
      await query({ text: `INSERT INTO capstone_patient_self_view_grants
        (grant_id,token_hash,subject,patient_id,ref_id,ownership_revision,source_hospital_id,viewing_gateway_id,
         study_instance_uid,series_instance_uid,proof_key_thumbprint,audit_session_id,permission,authority_type,status,issued_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'VIEW_ONLY','PATIENT_SELF_VIEW','ACTIVE',$13,$14)`,
        values: [grant.grantId,grant.tokenHash,scope.subject,scope.patientId,scope.refId,scope.ownershipRevision,
          scope.sourceHospitalId,grant.viewingGatewayId,scope.studyInstanceUid,scope.allowedSeriesUids[0],
          grant.proofKeyThumbprint,grant.auditSessionId,new Date(grant.issuedAtMs).toISOString(),new Date(grant.expiresAtMs).toISOString()] });
      const receipt = await this.appendAudit(Object.freeze({ query }), Object.freeze({
        action: AuditAction.PATIENT_SELF_VIEW_GRANT_ISSUED, result: 'SUCCESS', actorType: 'PATIENT',
        actorId: scope.subject, patientId: scope.patientId, sourceHospitalId: scope.sourceHospitalId,
        studyInstanceUid: scope.studyInstanceUid, seriesInstanceUid: scope.allowedSeriesUids[0],
        grantId: grant.grantId, auditSessionId: grant.auditSessionId,
      }));
      if (!uuid(receipt?.auditId) || receipt.auditSessionId !== grant.auditSessionId
        || !(hash(receipt.recordHash) || /^sha256:[a-f0-9]{64}$/.test(receipt.recordHash ?? '')) || this.clock() >= grant.expiresAtMs
        || this.clock() >= input.principal.expiresAtMs) throw failure();
      committing = true; await query('COMMIT'); committing = false; began = false;
      return Object.freeze({ grantId: grant.grantId, auditSessionId: grant.auditSessionId, auditId: receipt.auditId,
        expiresAt: new Date(grant.expiresAtMs).toISOString(), permission: 'VIEW_ONLY' });
    })();
    try { return await Promise.race([work, timeout, connectionFailure]); }
    catch {
      if (client && !closed && !released && began) { try { await query('ROLLBACK'); } catch { release(true); } }
      const error = failure();
      if (committing) error.code = 'AUTHORITY_COMMIT_OUTCOME_UNKNOWN';
      throw error; // Raw database errors may contain protected parameters.
    } finally { closed = true; clearTimeout(timer); release(false); }
  }
}
