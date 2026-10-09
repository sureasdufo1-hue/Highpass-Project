import { randomUUID } from 'node:crypto';
import { buildAuditLog } from './services.js';
import { orderStoredAuditChain } from './audit-chain-order.js';
import { PatientSelfViewGrantRepository } from './patient-self-view-grant-repository.js';

// Explicit single-writer capstone adapter, not API HA. Shares the legacy save
// queue and audit construction; publishes memory only after confirmed COMMIT.
export function createPatientSelfViewPersistence({ store, pool, enabled = false, singleWriter = false, clock = Date.now }) {
  if (typeof store?.runExclusive !== 'function' || typeof store?.insertAuditLogs !== 'function')
    throw new Error('AUTHORITY_PERSISTENCE_UNAVAILABLE');
  return Object.freeze({
    async create(input, grant) {
      if (!enabled || singleWriter !== true) throw new Error('AUTHORITY_PERSISTENCE_UNAVAILABLE');
      return store.runExclusive(async () => {
        await store.saveNow(); // Flush earlier mutations before reading the head.
        let committedAudit;
        const repository = new PatientSelfViewGrantRepository({ pool, enabled: true, clock,
          appendAudit: async (tx, event) => {
            await tx.query({text:'SELECT public.capstone_patient_lock_audit()'});
            const result = await tx.query({text:'SELECT audit_id,previous_hash,record_hash FROM audit_logs'});
            const chain = orderStoredAuditChain(result.rows.map(row => ({
              auditId:row.audit_id, previousHash:row.previous_hash, recordHash:row.record_hash,
            })));
            const memory = store.get('auditLogs');
            if (chain.length !== memory.length || chain.at(-1)?.recordHash !== memory.at(-1)?.recordHash)
              throw new Error('AUDIT_HEAD_MISMATCH');
            committedAudit = buildAuditLog({...event,reasonCode:'PATIENT_SELF_VIEW_POLICY_ALLOWED'},
              memory.at(-1)?.recordHash ?? null,new Date(clock()).toISOString(),randomUUID());
            await store.insertAuditLogs([committedAudit],{query:(text,values)=>tx.query({text,values})});
            return {auditId:committedAudit.auditId,auditSessionId:committedAudit.auditSessionId,recordHash:committedAudit.recordHash};
          } });
        let result;
        try { result = await repository.create(input,grant); }
        catch (error) {
          // COMMIT can succeed on the server before a socket fault. Never let a
          // stale snapshot overwrite that committed audit: restart/reload first.
          if (error.code === 'AUTHORITY_COMMIT_OUTCOME_UNKNOWN') store.persistenceBlocked = true;
          throw error;
        }
        store.get('auditLogs').push(committedAudit);
        store.persistedData.auditLogs.push(structuredClone(committedAudit));
        return result;
      });
    },
  });
}
