import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendPairedExchangeAudit} from '../src/v3-exchange-network-audit.js';

test('Session paired audit rejects JSON provenance before writing either event',async()=>{
 let calls=0;const tx={async query(){calls++;throw Error('UNEXPECTED_QUERY');}};
 for(const input of [undefined,{},Object.freeze({sourceIp:'127.0.0.1',ingressMode:'CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'})])
  await assert.rejects(appendPairedExchangeAudit(tx,{}, {},input),e=>e.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
 assert.equal(calls,0);
});

test('Session schema pairs exact event tuple without granting requester audit visibility',()=>{
 const sql=readFileSync(new URL('../db/migrations/032_highpass_v3_exchange_network_audit.sql',import.meta.url),'utf8');
 assert.match(sql,/FOREIGN KEY\(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id\)/);
 assert.match(sql,/REFERENCES highpass_v3\.exchange_audit_outbox/);
 assert.doesNotMatch(sql,/REFERENCES highpass_v3\.identity_audit_outbox/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);assert.match(sql,/BEFORE UPDATE OR DELETE/);
 assert.match(sql,/'audit:read'=ANY\(p.scopes\)/);
 assert.match(sql,/masklen\(source_ip\)/);assert.match(sql,/isfinite\(observed_at\)/);
 assert.match(sql,/octet_length\(proxy_certificate_sha256\)=32/);
 assert.doesNotMatch(sql,/^\s*GRANT\s/mi);assert.doesNotMatch(sql,/SECURITY DEFINER/i);
});
