import { AuthError } from './auth.js';
import { v3BindingExpiry } from './v3-principal-registry.js';
import {readPendingNetworkAuditInput} from './v3-pending-network-context.js';
import {readIdentityNetworkAuditInput} from './v3-identity-network-context.js';

export class V3TransactionError extends Error {
  constructor(code) { super(code); this.name = 'V3TransactionError'; this.code = code; this.statusCode = 503; }
}
const activePrincipalSql = `SELECT p.actor_id
  FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=$1 AND p.tenant_id=$2 AND p.hospital_id=$3 AND p.role=$4
    AND p.patient_ref IS NOT DISTINCT FROM $5::uuid AND $6=ANY(p.scopes)
    AND p.service_purpose IS NOT DISTINCT FROM $7::text
    AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
  FOR SHARE OF p,t,h`;
const configSql = `SELECT set_config('app.tenant_id',$1,true),set_config('app.hospital_id',$2,true),
  set_config('app.actor_id',$3,true),set_config('statement_timeout',$4,true),
  set_config('lock_timeout',$5,true),set_config('idle_in_transaction_session_timeout',$6,true)`;
const privateState = new WeakMap();
// Shared by read-only readiness; keep the same nonowner/bypass rejection rules.
export const v3TenantRoleSafetySql=`SELECT r.rolsuper,r.rolbypassrls,
 EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
 OR x.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_read_all_data','pg_write_all_data','pg_signal_backend'))
 AND pg_has_role(current_user,x.oid,'MEMBER')) AS can_bypass,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_schema_tables,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS owns_schema
 FROM pg_roles r WHERE r.rolname=current_user`;

/** Trusted repository callback only. Pool must be a dedicated nonowner app role. */
export class V3TenantTransaction {
  constructor({ pool, deadlineMs = 15000, queryMs = 5000 } = {}) {
    if (!pool || typeof pool.connect !== 'function' || !Number.isInteger(deadlineMs) || deadlineMs<50 || deadlineMs>15000
      || !Number.isInteger(queryMs) || queryMs<10 || queryMs>5000) throw new V3TransactionError('V3_TRANSACTION_CONFIGURATION_INVALID');
    privateState.set(this,{pool,deadlineMs,queryMs});
  }
  get deadlineMs(){return privateState.get(this).deadlineMs;}
  runWithIdentityNetwork(binding,requiredScope,operation,input){
    if(input===undefined)throw new V3TransactionError('V3_IDENTITY_NETWORK_CONTEXT_REQUIRED');
    return this.run(binding,requiredScope,operation,undefined,input);
  }
  async run(binding, requiredScope, operation, networkAuditInput, identityAuditInput) {
    const expiry = v3BindingExpiry(binding);
    if(networkAuditInput!==undefined&&identityAuditInput!==undefined)throw new V3TransactionError('V3_NETWORK_CONTEXT_AMBIGUOUS');
    if(identityAuditInput!==undefined)readIdentityNetworkAuditInput(identityAuditInput,binding);
    if(networkAuditInput!==undefined)readPendingNetworkAuditInput(networkAuditInput,binding);
    if (typeof requiredScope!=='string' || !binding.scopes.includes(requiredScope)) throw new AuthError(403,'V3_SCOPE_NOT_ALLOWED');
    if (typeof operation!=='function') throw new V3TransactionError('V3_TRANSACTION_CONFIGURATION_INVALID');
    const {pool,deadlineMs,queryMs} = privateState.get(this);
    let client, timer, live=true, released=false, began=false, committing=false,rejectConnectionFault;
    const connectionFault=new Promise((_,reject)=>{rejectConnectionFault=reject;});
    const onConnectionError=()=>{
      live=false;
      rejectConnectionFault(new V3TransactionError(committing?'V3_COMMIT_OUTCOME_UNKNOWN':'V3_DATABASE_UNAVAILABLE'));
      release(true);
    };
    const release = destroy => { if(client && !released){
      released=true;
      if(!destroy)client.removeListener?.('error',onConnectionError);
      // Keep the safe listener on a destroyed client until its socket is gone.
      client.release(destroy);
    } };
    const query = async (text, values=[]) => {
      if (!live || released) throw new V3TransactionError('V3_TRANSACTION_CLOSED');
      return client.query({text,values,query_timeout:queryMs});
    };
    const timeout = new Promise((_,reject) => {
      timer=setTimeout(() => { live=false;
        reject(committing ? new V3TransactionError('V3_COMMIT_OUTCOME_UNKNOWN')
          : Date.now()>=expiry ? new AuthError(401,'JWT_EXPIRED') : new V3TransactionError('V3_TRANSACTION_DEADLINE'));
        // Record the initiating timeout before teardown can synchronously emit
        // socket/query errors. Both paths still destroy the connection once.
        release(true);
      },Math.min(deadlineMs,expiry-Date.now()));
    });
    const work = (async () => {
      const acquired = await pool.connect();
      if (!live) { acquired.release(true); throw new V3TransactionError('V3_TRANSACTION_CLOSED'); }
      client=acquired;
      client.on?.('error',onConnectionError);
      // Reject superusers, BYPASSRLS, table owners and roles that can SET ROLE to them.
      const role = await query(v3TenantRoleSafetySql);
      if (role.rows.length!==1 || ['rolsuper','rolbypassrls','can_bypass','owns_schema_tables','owns_schema'].some(name=>role.rows[0][name]!==false)) {
        throw new V3TransactionError('V3_DATABASE_ROLE_UNSAFE');
      }
      await query('BEGIN'); began=true;
      await query(configSql,[binding.tenantId,binding.hospitalId,binding.actorId,
        `${Math.min(4000,queryMs)}ms`,`${Math.min(3000,queryMs)}ms`,`${deadlineMs+Math.min(queryMs,1000)}ms`]);
      const active = await query(activePrincipalSql,[binding.actorId,binding.tenantId,binding.hospitalId,binding.role,binding.patientRefId,requiredScope,binding.servicePurpose??null]);
      if(active.rows.length!==1) throw new AuthError(403,'V3_DB_PRINCIPAL_INACTIVE');
      // Pool acquisition and principal locks may consume the network capability.
      if(networkAuditInput!==undefined)readPendingNetworkAuditInput(networkAuditInput,binding);
      if(identityAuditInput!==undefined)readIdentityNetworkAuditInput(identityAuditInput,binding);
      const result = await operation(Object.freeze({query}));
      v3BindingExpiry(binding);
      if(!live) throw new V3TransactionError('V3_TRANSACTION_CLOSED');
      if(networkAuditInput!==undefined)readPendingNetworkAuditInput(networkAuditInput,binding);
      if(identityAuditInput!==undefined)readIdentityNetworkAuditInput(identityAuditInput,binding);
      committing=true; await query('COMMIT'); committing=false; began=false;
      return result;
    })();
    try { return await Promise.race([work,timeout,connectionFault]); }
    catch(error) {
      if(client && !released && began){
        try { await query('ROLLBACK'); began=false; } catch { release(true); }
      }
      // Raw PG errors may contain query parameters or protected values.
      if(error instanceof AuthError || error instanceof V3TransactionError) throw error;
      throw new V3TransactionError(committing ? 'V3_COMMIT_OUTCOME_UNKNOWN' : 'V3_DATABASE_UNAVAILABLE');
    } finally { live=false; clearTimeout(timer); release(false); }
  }
}
