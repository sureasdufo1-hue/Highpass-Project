import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {appendPendingAudit} from '../src/v3-pending-audit.js';
function fixture(){
 const secret=randomBytes(32).toString('hex'),r={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),role:'HOSPITAL_ADMIN',
  issuer:'synthetic-pending-audit',subject:'source',authHospitalId:'SYNTH-A',scopes:['consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[r]});
 const data=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'consent:write',exp:Math.floor(Date.now()/1000)+60}]
 .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
 {requiredScope:'consent:write',allowedRoles:['HOSPITAL_ADMIN']});
 const event={eventId:randomUUID(),auditSessionId:randomUUID(),traceId:'synthetic_pending_audit_001',action:'PREPARATION_DENIED',reasonCode:'SCOPE_DENIED'};
 return {binding,event};
}
test('pending DENY audit binds actor/source and omits all inaccessible identifiers',async()=>{
 const f=fixture(),queries=[];const id=await appendPendingAudit({async query(text,values){queries.push({text,values});return {rowCount:1};}},f.binding,f.event);
 assert.equal(id,f.event.eventId);assert.deepEqual(queries[0].values.slice(1,4),[f.binding.tenantId,f.binding.hospitalId,f.binding.actorId]);
 assert.ok(queries[0].text.includes('NULL,NULL,NULL'));assert.ok(!queries[0].text.includes('exchange_audit_outbox'));
});
test('allow audit derives exact creation timestamp and source tuple from immutable preparation',async()=>{
 const f=fixture(),queries=[];
 for(const action of ['PREPARATION_CREATED','PREPARATION_REPLAYED'])
  await appendPendingAudit({async query(text,values){queries.push({text,values});return {rowCount:1};}},f.binding,
   {...f.event,action,reasonCode:'PENDING_UNVERIFIED',preparationId:randomUUID(),sessionId:randomUUID(),sessionVersion:1});
 assert.ok(queries.every(q=>q.text.includes('creation_event_id=$1')&&q.text.includes('THEN created_at ELSE statement_timestamp()')));
 assert.ok(queries.every(q=>q.values[7]===f.binding.tenantId&&q.values[8]===f.binding.hospitalId));
});
test('unknown action/reason, raw evidence and unsafe identifiers are rejected before query',async()=>{
 const f=fixture(),bad=[{reasonCode:'RAW_REASON'},{action:'SESSION_DENIED'},{sessionId:randomUUID()},
 {preparationId:randomUUID()},{token:'SYNTHETIC-SECRET'},{timestamp:'2026-10-08'},{evidenceDigest:'SYNTHETIC-RAW'},
 {action:'PREPARATION_CREATED',reasonCode:'PENDING_UNVERIFIED'},{eventId:'invalid'},{sessionVersion:1}];
 for(const override of bad)await assert.rejects(appendPendingAudit({query(){throw Error('MUST NOT QUERY');}},f.binding,{...f.event,...override}),
  e=>e.code==='V3_CONSENT_PENDING_AUDIT_INVALID');
 const accessor={...f.event};Object.defineProperty(accessor,'reasonCode',{get(){throw Error('MUST NOT ACCESS');}});
 await assert.rejects(appendPendingAudit({},f.binding,accessor),e=>e.code==='V3_CONSENT_PENDING_AUDIT_INVALID');
 await assert.rejects(appendPendingAudit({}, {...f.binding},f.event),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
});
test('missing or multiple affected rows never imply recorded audit',async()=>{
 const f=fixture();for(const rowCount of [0,2,undefined])await assert.rejects(
  appendPendingAudit({async query(){return {rowCount};}},f.binding,f.event),e=>e.code==='V3_PENDING_AUDIT_NOT_RECORDED');
});
