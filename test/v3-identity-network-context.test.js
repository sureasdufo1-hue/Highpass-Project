import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createServer,request} from 'node:https';
import {once} from 'node:events';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {signIngress} from '../src/ingress.js';
import {createIdentityNetworkAuthority,assertIdentityNetworkAuthority,readIdentityNetworkAuditInput} from '../src/v3-identity-network-context.js';
import {appendPairedExchangeAudit} from '../src/v3-exchange-network-audit.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';

test('identity network authority requires internal opt-in and rejects invented capabilities',()=>{
  assert.throws(()=>createIdentityNetworkAuthority());assert.throws(()=>assertIdentityNetworkAuthority({}));
  assert.throws(()=>readIdentityNetworkAuditInput({},{}));
  const a=createIdentityNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:randomBytes(32)});
  assert.doesNotThrow(()=>assertIdentityNetworkAuthority(a));
  assert.throws(()=>a.capture({socket:{encrypted:true,authorized:true},headers:{},method:'GET',url:'/'}));a.dispose();
});

test('actual identity mTLS capability binds request, actor, correlation and finite lifetime',async()=>{
  const read=n=>readFileSync('tmp/certs/'+n),secret=randomBytes(32),jwtSecret=randomBytes(32).toString('hex');
  const authority=createIdentityNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret});
  const common={issuer:'network-test',tenantId:randomUUID(),hospitalId:randomUUID(),role:'HOSPITAL_ADMIN',authHospitalId:'SYNTH-A',scopes:['mapping:read'],status:'ACTIVE'};
  const records=[0,1].map(i=>({...common,actorId:randomUUID(),subject:'actor-'+i}));
  const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:'network-test',JWT_AUDIENCE:'test',TEST_JWT_SECRET:jwtSecret}),records});
  const token=i=>{const input=[{alg:'HS256'},{iss:'network-test',aud:'test',sub:'actor-'+i,role:common.role,hospitalId:'SYNTH-A',scope:'mapping:read',exp:Math.floor(Date.now()/1000)+60}]
    .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return input+'.'+createHmac('sha256',jwtSecret).update(input).digest('base64url');};
  const policy={requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']};
  const errors=[];
  const server=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt'),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},async(req,res)=>{
    try {
      const cap=authority.capture(req),binding=registry.resolve(req,policy),context={auditSessionId:req.headers['x-audit-session-id'],traceId:req.headers['x-trace-id']};
      const input=authority.auditInputForRequest(req,context,binding),facts=readIdentityNetworkAuditInput(input,binding,context);
      assert.equal(facts.sourceIp,'127.0.0.1');assert.equal(Object.isFrozen(facts),true);assert.equal(facts.proxyCertificateSha256.length,64);
      const event={...context,action:'SESSION_DENIED',reasonCode:'SESSION_NOT_FOUND'},writes=[];
      const eventId=await appendPairedExchangeAudit({async query(sql,values){writes.push({sql,values});return {rowCount:1};}},binding,event,input);
      assert.equal(writes.length,2);assert.match(writes[0].sql,/exchange_audit_outbox/);assert.match(writes[1].sql,/exchange_network_audit/);
      assert.equal(writes[0].values[0],eventId);assert.equal(writes[1].values[0],eventId);
      assert.equal(writes[1].values[4],context.auditSessionId.toLowerCase());assert.equal(writes[1].values[6],'127.0.0.1');
      assert.equal(writes[1].values[8].length,32);
      await assert.rejects(appendPairedExchangeAudit({async query(sql){return {rowCount:sql.includes('exchange_network_audit')?0:1};}},binding,event,input),
        e=>e.code==='V3_SESSION_NETWORK_AUDIT_NOT_RECORDED');
      for(const failNetwork of [false,true]){
        const queries=[],client={async query(q){queries.push(q.text);
          if(q.text.includes('FROM pg_roles r'))return {rows:[{rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false}]};
          if(q.text.includes('FROM highpass_v3.principal_bindings p'))return {rows:[{}]};
          if(failNetwork&&q.text.includes('INSERT INTO highpass_v3.exchange_network_audit'))throw Error('SYNTHETIC_AUDIT_FAILURE');
          return {rows:[],rowCount:1};},release(){}};
        const transactions=new V3TenantTransaction({pool:{async connect(){return client;}},deadlineMs:3000});
        const work=()=>transactions.runWithIdentityNetwork(binding,'mapping:read',tx=>appendPairedExchangeAudit(tx,binding,event,input),input);
        if(failNetwork){await assert.rejects(work(),e=>e.code==='V3_DATABASE_UNAVAILABLE');assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.includes('COMMIT'));}
        else{await work();assert.equal(queries.at(-1),'COMMIT');}
        // This is a transaction-adapter fixture, not live PostgreSQL/RLS evidence.
        assert.ok(queries.findIndex(q=>q.includes('exchange_audit_outbox'))<queries.findIndex(q=>q.includes('exchange_network_audit')));
      }
      assert.throws(()=>authority.read(JSON.parse(JSON.stringify(cap)),req));
      assert.throws(()=>authority.read(cap,{...req}));
      assert.throws(()=>readIdentityNetworkAuditInput(JSON.parse(JSON.stringify(input)),binding,context));
      const other=registry.resolve({headers:{authorization:'Bearer '+token(1)}},policy);
      const separatelyResolved=registry.resolve(req,policy);
      assert.throws(()=>readIdentityNetworkAuditInput(input,separatelyResolved,context));
      assert.throws(()=>authority.auditInputForRequest(req,context,separatelyResolved));
      assert.throws(()=>readIdentityNetworkAuditInput(input,other,context));
      assert.throws(()=>readIdentityNetworkAuditInput(input,binding,{...context,traceId:'SYNTHETIC_OTHER_TRACE'}));
      assert.throws(()=>authority.auditInputForRequest(req,context,other));
      if(req.url==='/expiry') {
        await new Promise(resolve=>setTimeout(resolve,1200));assert.throws(()=>readIdentityNetworkAuditInput(input,binding,context));
      }else if(req.url==='/mutate') {
        req.headers.dpop='SYNTHETIC_CHANGED';assert.throws(()=>authority.read(cap,req));
      }else if(req.url==='/replace') {
        authority.capture(req);assert.throws(()=>authority.read(cap,req));assert.throws(()=>readIdentityNetworkAuditInput(input,binding,context));
      }else if(req.url==='/dispose') {
        authority.dispose();assert.throws(()=>readIdentityNetworkAuditInput(input,binding,context));
      }
      res.end('{}');
    }catch(error){errors.push(error.code??'TEST_FAILURE');res.statusCode=500;res.end('{}');}
  });
  server.setTimeout(4000,socket=>socket.destroy());server.listen(0,'127.0.0.1');await once(server,'listening');
  const call=path=>new Promise((resolve,reject)=>{
    const headers={authorization:'Bearer '+token(0),'x-audit-session-id':randomUUID(),'x-trace-id':randomUUID()};
    const signed=signIngress({method:'GET',url:path,headers},'127.0.0.1',secret,Date.now()-(path==='/expiry'?9000:0));
    Object.assign(headers,{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https','x-hipass-ingress-time':signed.timestamp,'x-hipass-ingress-signature':signed.signature});
    const req=request({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path,headers,ca:read('mtls/ca.crt'),
      cert:read('identity-edge/identity-proxy-dev.crt'),key:read('identity-edge/identity-proxy-dev.key'),rejectUnauthorized:true,agent:false,timeout:4000},res=>{
        res.resume();res.on('error',reject);res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TEST_TIMEOUT')));req.end();
  });
  try {for(const path of ['/valid','/mutate','/replace','/expiry','/dispose'])assert.equal(await call(path),200);assert.deepEqual(errors,[]);}
  finally {authority.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
