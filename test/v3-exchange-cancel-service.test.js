import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3ExchangeCancelService} from '../src/v3-exchange-cancel-service.js';
import {appendExchangeAudit} from '../src/v3-exchange-audit.js';
function fixture(){
 const secret=randomBytes(32).toString('hex'),r={issuer:'synthetic-cancel-service',subject:'synthetic-admin',role:'HOSPITAL_ADMIN',
  tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),authHospitalId:'SYNTHETIC-A',scopes:['exchange:cancel'],status:'ACTIVE'};
 const input=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic-api',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'exchange:cancel',exp:Math.floor(Date.now()/1000)+60}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[r]});
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
  {requiredScope:'exchange:cancel',allowedRoles:['HOSPITAL_ADMIN']});
 let calls=0;const transactions=new V3TenantTransaction({pool:{connect(){calls++;throw Error('MUST NOT CONNECT');}},deadlineMs:8000});
 return {binding,transactions,calls:()=>calls};
}
test('cancellation requires bounded transaction and injected 256-bit HMAC provider',()=>{
 const f=fixture();for(const config of [undefined,{transactions:f.transactions},{transactions:f.transactions,hmacKey:randomBytes(31)},
  {transactions:new V3TenantTransaction({pool:{connect(){}}}),hmacKey:randomBytes(32)}])
  assert.throws(()=>new V3ExchangeCancelService(config),e=>e.code==='V3_SESSION_CANCEL_CONFIGURATION_INVALID');
});
test('invalid or disposed cancel commands fail before pool acquisition',async()=>{
 const f=fixture(),service=new V3ExchangeCancelService({transactions:f.transactions,hmacKey:randomBytes(32)}),id=randomUUID();
 try{
  for(const [key,match,body,options] of [['short','"1"',{reasonCode:'REQUESTER_CANCELLED'},{}],['synthetic.cancel:001','*',{reasonCode:'REQUESTER_CANCELLED'},{}],
   ['synthetic.cancel:001','"1"',{reasonCode:'POLICY_REVOKED'},{}],['synthetic.cancel:001','"1"',{reasonCode:'REQUESTER_CANCELLED'},{token:'SYNTHETIC'}]])
   await assert.rejects(service.cancel(f.binding,key,id,match,body,options));
  await assert.rejects(service.cancel({...f.binding},'synthetic.cancel:001',id,'"1"',{reasonCode:'REQUESTER_CANCELLED'}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  service.dispose();await assert.rejects(service.cancel(f.binding,'synthetic.cancel:001',id,'"1"',{reasonCode:'REQUESTER_CANCELLED'}),e=>e.code==='V3_SESSION_PROVIDER_UNAVAILABLE');
  assert.equal(f.calls(),0);
 }finally{service.dispose();}
});
test('versioned cancellation audit has typed fixed fields, no comments or raw command',async()=>{
 const f=fixture(),id=randomUUID(),eventId=randomUUID(),context={auditSessionId:randomUUID(),traceId:'synthetic_cancel_trace_001',sessionId:id,
  sessionVersion:2,eventId,action:'SESSION_CANCELLED',reasonCode:'REQUESTER_CANCELLED'};
 let values;await appendExchangeAudit({async query(sql,args){assert.match(sql,/INSERT INTO/);values=args;}},f.binding,context);
 assert.equal(values[0],eventId);assert.equal(values[4],f.binding.actorId);assert.equal(values[10],2);
 for(const patch of [{sessionVersion:1},{reasonCode:'POLICY_REVOKED'},{comment:'SYNTHETIC'},{token:'SYNTHETIC'}])
  await assert.rejects(appendExchangeAudit({query(){throw Error('MUST NOT QUERY');}},f.binding,{...context,...patch}),e=>e.statusCode===422);
});
