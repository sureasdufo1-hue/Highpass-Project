import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendIdentityNetworkAudit,appendPairedIdentityAudit} from '../src/v3-identity-network-audit.js';

test('identity network audit never queries for fabricated JSON or borrowed unknown inputs',async()=>{
  let calls=0;const tx={async query(){calls++;throw Error('UNEXPECTED_QUERY');}};
  for(const input of [undefined,{},Object.freeze({sourceIp:'127.0.0.1',ingressMode:'CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'})]){
    await assert.rejects(appendIdentityNetworkAudit(tx,{},'00000000-0000-4000-8000-000000000000',{},input),error=>error.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
    await assert.rejects(appendPairedIdentityAudit(tx,{}, {},input),error=>error.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
  }
  assert.equal(calls,0);
});

test('identity network schema preserves append-only scoped tuple and grants no deployment authority',()=>{
  const sql=readFileSync(new URL('../db/migrations/031_highpass_v3_identity_network_audit.sql',import.meta.url),'utf8');
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);assert.match(sql,/REVOKE ALL .* FROM PUBLIC/);
  assert.match(sql,/BEFORE UPDATE OR DELETE/);assert.match(sql,/FOREIGN KEY\(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id\)/);
  assert.match(sql,/masklen\(source_ip\)/);assert.match(sql,/isfinite\(observed_at\)/);assert.match(sql,/octet_length\(proxy_certificate_sha256\)=32/);
  assert.doesNotMatch(sql,/^\s*GRANT\s/mi);assert.doesNotMatch(sql,/SECURITY DEFINER/i);
});
