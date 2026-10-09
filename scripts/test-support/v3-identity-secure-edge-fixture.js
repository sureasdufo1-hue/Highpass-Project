import { randomBytes, randomUUID, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { createV3IdentityCapstoneEdge } from '../../src/v3-identity-secure-edge.js';
import { createV3IdentityCapstoneProxy } from '../../src/v3-identity-capstone-proxy.js';
import { signIngress } from '../../src/ingress.js';
import {createIdentityNetworkAuthority} from '../../src/v3-identity-network-context.js';
import {appendPairedIdentityAudit} from '../../src/v3-identity-network-audit.js';
import {V3IdentityIdempotency} from '../../src/v3-identity-idempotency.js';
import {V3MappingReadService} from '../../src/v3-mapping-read-service.js';
import {V3MappingWriteService} from '../../src/v3-mapping-write-service.js';
import {V3TenantTransaction} from '../../src/v3-tenant-transaction.js';
import {createIdentityPreauthFixture} from './v3-identity-preauth-fixture.js';
import {createV3IdentityCapstoneHost} from '../../src/v3-identity-capstone-host.js';

/** Actual local TLS/mTLS + nonowner PG. No deployed route, real MFA or DPoP claim. */
export async function checkIdentitySecureEdge({ admin, base, registry, protection, transactions, pool, issueToken, mappingId, command, check }) {
  const read = name => readFileSync('tmp/certs/' + name), secret = randomBytes(32);
  let loseCommitAck=false,commitAckLosses=0;
  const strictBackends=new Set();
  const strictTransactions=new V3TenantTransaction({deadlineMs:8000,pool:{async connect(){
    const client=await pool.connect();strictBackends.add(client.processID);
    return {
      async query(statement){
        const result=await client.query(statement);
        // Only the throwaway fixture: loss occurs AFTER real PG COMMIT succeeds.
        if(statement.text==='COMMIT'&&loseCommitAck){loseCommitAck=false;commitAckLosses++;throw Error('SYNTHETIC_COMMIT_ACK_LOSS');}
        return result;
      },
      on:(...args)=>client.on(...args),removeListener:(...args)=>client.removeListener(...args),release:destroy=>client.release(destroy)
    };
  }}});
  const idempotency=new V3IdentityIdempotency({transactions:strictTransactions,hmacKey:randomBytes(32),requireNetworkAudit:true});
  const readService=new V3MappingReadService({transactions:strictTransactions,requireNetworkAudit:true}),writeService=new V3MappingWriteService({idempotency,protection});
  let edge = createV3IdentityCapstoneEdge({ mode: 'CAPSTONE_SYNTHETIC_ONLY', registry, readService, writeService, ingressSecret: secret });
  let preauth,host,readiness,runtime;
  const failures = [];
  const network=createIdentityNetworkAuthority({mode:'CAPSTONE_SYNTHETIC_ONLY',ingressSecret:secret});
  let front,proxy;
  let callbacks = 0;
  const server = createServer({ key: read('edge/localhost.key'), cert: read('edge/localhost.crt'), ca: read('mtls/ca.crt'),
    requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2', handshakeTimeout: 2000 }, (req, res) => {
      callbacks++;
      if(req.url.startsWith('/synthetic-identity-network-')) {
        void (async()=>{
          try {
            network.capture(req);const binding=registry.resolve(req,{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']});
            const context={auditSessionId:randomUUID(),traceId:randomUUID()},input=network.auditInputForRequest(req,context,binding);
            let visible;
            await transactions.runWithIdentityNetwork(binding,'mapping:read',async tx=>{
              if(req.url.endsWith('read')){visible=(await tx.query('SELECT count(*)::int n FROM highpass_v3.identity_network_audit')).rows[0].n;return;}
              await appendPairedIdentityAudit(tx,binding,{...context,action:'MAPPING_DENIED',result:'DENY',reasonCode:'MAPPING_NOT_FOUND'},input);
              if(req.url.endsWith('expire'))await tx.query('SELECT pg_sleep(1.2)');
            },input);
            res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(visible===undefined?{}:{visible}));
          }catch(error){res.writeHead(error.statusCode??503,{'content-type':'application/json'});res.end(JSON.stringify({code:error.code??'SYNTHETIC_CHECK_FAILURE'}));}
        })();return;
      }
      void edge.handle(req, res);
    });
  server.on('tlsClientError', error => failures.push(error.code));
  server.requestTimeout = 5000; server.headersTimeout = 3000; server.setTimeout(10000, socket => socket.destroy());
  const counts = async () => (await admin.query(`SELECT (SELECT count(*)::int FROM highpass_v3.patient_mappings) mappings,
    (SELECT count(*)::int FROM highpass_v3.identity_write_results) ledger,(SELECT count(*)::int FROM highpass_v3.identity_audit_outbox) audits,
    (SELECT count(*)::int FROM highpass_v3.identity_network_audit) network`)).rows[0];
  const send = (options = {}) => new Promise((resolve, reject) => {
    const method = options.method ?? 'GET', path = options.path ?? '/api/v3/patient-mappings/' + mappingId;
    const headers = { authorization: 'Bearer ' + issueToken(options.actor ?? 0), ...(method === 'POST' ? {
      'content-type': 'application/json', 'idempotency-key': options.key, 'x-audit-session-id': randomUUID() } : {}), ...options.beforeSign };
    const signed = signIngress({ method, url: path, headers }, '127.0.0.1', secret, options.time ?? Date.now());
    Object.assign(headers, { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-proto': 'https', 'x-hipass-ingress-time': signed.timestamp, 'x-hipass-ingress-signature': signed.signature }, options.afterSign);
    for (const name of options.omit ?? []) delete headers[name];
    const client = options.frontend || options.client === null ? {} : options.client ?? { cert: read('identity-edge/identity-proxy-dev.crt'), key: read('identity-edge/identity-proxy-dev.key') };
    const request = httpsRequest({ hostname: '127.0.0.1', servername: options.servername ?? 'localhost', port: options.frontend?front.address().port:host?host.address().port:server.address().port,
      path, method, headers, ...client, ca: read('mtls/ca.crt'), rejectUnauthorized: true, minVersion: 'TLSv1.2', agent: false }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; if (body.length > 16384) request.destroy(Error('TEST_RESPONSE_LIMIT')); });
      response.on('error', reject); response.on('aborted', () => reject(Error('TEST_RESPONSE_ABORTED')));
      response.on('end', () => { try { resolve({ status: response.statusCode, cache: response.headers['cache-control'], body: JSON.parse(body) }); } catch (error) { reject(error); } });
    });
    request.on('error', reject);
    const timer = setTimeout(() => request.destroy(Error('TEST_REQUEST_TIMEOUT')), 10000);
    request.once('close', () => clearTimeout(timer));
    request.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const priorNetwork=await counts();
    const guarded=await send({path:'/synthetic-identity-network-valid'}),afterGuard=await counts();
    check('actual identity network capability admits nonowner PG with atomically paired audit',guarded.status===200&&afterGuard.audits===priorNetwork.audits+1&&afterGuard.network===priorNetwork.network+1);
    const paired=(await admin.query(`SELECT n.*,host(n.source_ip) ip FROM highpass_v3.identity_network_audit n
      JOIN highpass_v3.identity_audit_outbox e USING(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)`)).rows;
    check('actual paired identity network facts contain socket IP and dedicated public certificate digest',paired.length===1&&paired[0].ip==='127.0.0.1'
      &&paired[0].ingress_mode==='CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY'&&paired[0].proxy_certificate_sha256.toString('hex')===new X509Certificate(read('identity-edge/identity-proxy-dev.crt')).fingerprint256.replaceAll(':','').toLowerCase());
    const ownNetwork=await send({path:'/synthetic-identity-network-read'}),foreignNetwork=await send({path:'/synthetic-identity-network-read',actor:1});
    check('actual identity network RLS exposes own row but no foreign hospital row',ownNetwork.status===200&&ownNetwork.body.visible===1&&foreignNetwork.status===200&&foreignNetwork.body.visible===0);
    const networkColumns='event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at';
    await admin.query('REVOKE INSERT('+networkColumns+') ON highpass_v3.identity_network_audit FROM hp_v3_app');
    try {
      const failed=await send({path:'/synthetic-identity-network-valid'});
      check('actual identity network privilege outage rolls back audit and network together',failed.status===503&&failed.body.code==='V3_DATABASE_UNAVAILABLE'&&isDeepStrictEqual(afterGuard,await counts()));
    }finally{await admin.query('GRANT INSERT('+networkColumns+') ON highpass_v3.identity_network_audit TO hp_v3_app');}
    for(const verb of ['UPDATE','DELETE']) {
      let code;try{await admin.query(verb==='UPDATE'?'UPDATE highpass_v3.identity_network_audit SET source_ip=source_ip':'DELETE FROM highpass_v3.identity_network_audit');}catch(error){code=error.code;}
      check('identity network privileged '+verb+' is rejected by immutable trigger',code==='42501');
    }
    const prototype=paired[0];
    for(const [name,patch,expected] of [
      ['subnet',{sourceIp:'192.0.2.0/24'},'23514'],['wrong mode',{mode:'CAPSTONE_MTLS_SIGNED_PROXY'},'23514'],
      ['short public digest',{fingerprint:Buffer.alloc(31)},'23514'],['infinite observation',{observed:'infinity'},'23514'],
      ['stale observation',{observed:'2000-01-01T00:00:00Z'},'23514'],['wrong correlation',{trace:'SYNTHETIC_OTHER_TRACE'},'23503'],
      ['missing audit',{missingAudit:true},'23503']
    ]) {
      const client=await admin.connect();let code;
      try {
        await client.query('BEGIN');const id=randomUUID();
        if(!patch.missingAudit)await client.query(`INSERT INTO highpass_v3.identity_audit_outbox
          (event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code)
          VALUES($1,$2,$3,$4,$5,$6,'MAPPING_DENIED','DENY','MAPPING_NOT_FOUND')`,[id,prototype.tenant_id,prototype.hospital_id,prototype.actor_id,prototype.audit_session_id,prototype.trace_id]);
        await client.query('INSERT INTO highpass_v3.identity_network_audit ('+networkColumns+') VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [id,prototype.tenant_id,prototype.hospital_id,prototype.actor_id,prototype.audit_session_id,patch.trace??prototype.trace_id,
            patch.sourceIp??'127.0.0.1',patch.mode??prototype.ingress_mode,patch.fingerprint??prototype.proxy_certificate_sha256,patch.observed??new Date().toISOString()]);
      }catch(error){code=error.code;}finally{await client.query('ROLLBACK');client.release();}
      check('identity network schema rejects '+name+' with exact constraint class',code===expected);
    }
    check('identity schema negative attempts leave original paired rows unchanged',isDeepStrictEqual(afterGuard,await counts()));
    const expired=await send({path:'/synthetic-identity-network-expire',time:Date.now()-9000});
    check('actual identity network expiry before COMMIT rolls back own audit insertion',expired.status===503&&expired.body.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID'&&isDeepStrictEqual(afterGuard,await counts()));
    const own = await send();
    check('actual identity dedicated mTLS signed ingress reads safe own mapping metadata', own.status === 200 && own.cache === 'no-store' && own.body.mappingId === mappingId && !('protectedLocalRef' in own.body));
    const foreign = await send({ actor: 1 });
    check('actual identity TLS foreign hospital still denies404 through RLS', foreign.status === 404 && foreign.body.code === 'V3_MAPPING_NOT_FOUND');
    const created = await send({ method: 'POST', path: '/api/v3/patient-mappings/reconcile', body: command, key: 'synthetic.identity-tls:reconcile-001' });
    const retry = await send({ method: 'POST', path: '/api/v3/patient-mappings/reconcile', body: command, key: 'synthetic.identity-tls:reconcile-001' });
    check('actual identity TLS reconcile and durable retry preserve original metadata', created.status === 201 && created.body.mappingId === mappingId && retry.status === 201 && isDeepStrictEqual(created.body, retry.body));
    const review = { expectedVersion: created.body.version, state: 'VERIFIED', evidenceDigest: randomBytes(32).toString('base64url') };
    const reviewPath = '/api/v3/patient-mappings/' + mappingId + '/reviews';
    const self = await send({ method: 'POST', path: reviewPath, body: review, key: 'synthetic.identity-tls:self-001' });
    const reviewer = await send({ method: 'POST', path: reviewPath, body: review, key: 'synthetic.identity-tls:review-001', actor: 2 });
    check('actual identity TLS self-review denies403 and separate synthetic reviewer succeeds200', self.status === 403 && self.body.code === 'V3_MAPPING_SELF_REVIEW' && reviewer.status === 200 && reviewer.body.version === review.expectedVersion + 1);
    const beforeReplay=await counts();
    const replayOld=await send({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001'});
    const afterReplay=await counts();
    check('strict durable replay retains original response after newer mapping review but appends current access pair',replayOld.status===201&&isDeepStrictEqual(replayOld.body,created.body)
      &&afterReplay.ledger===beforeReplay.ledger&&afterReplay.audits===beforeReplay.audits+1&&afterReplay.network===beforeReplay.network+1);
    const currentAccess=(await admin.query(`SELECT e.mapping_version,e.new_state FROM highpass_v3.identity_audit_outbox e
      JOIN highpass_v3.identity_network_audit n USING(event_id) WHERE e.mapping_id=$1 ORDER BY e.occurred_at DESC LIMIT 1`,[mappingId])).rows[0];
    check('strict replay audit uses current version without rewriting historical receipt',currentAccess?.mapping_version===reviewer.body.version&&currentAccess.new_state===reviewer.body.state);
    const beforeStrictFault=await counts();
    const rollbackCommand={...command,...protection.protect('HP-TEST-STRICT-ROLLBACK-ONLY',{tenantId:command.tenantId,hospitalId:command.hospitalId,patientRefId:command.patientRefId})};
    await admin.query('REVOKE INSERT('+networkColumns+') ON highpass_v3.identity_network_audit FROM hp_v3_app');
    try {
      const blockedRead=await send();
      const blockedReplay=await send({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001'});
      const blockedWrite=await send({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:rollbackCommand,key:'synthetic.identity-tls:write-outage-001'});
      const blockedReview=await send({method:'POST',path:reviewPath,body:{...review,expectedVersion:reviewer.body.version},key:'synthetic.identity-tls:review-outage-001',actor:2});
      const current=(await admin.query('SELECT version FROM highpass_v3.patient_mappings WHERE mapping_id=$1',[mappingId])).rows[0];
      check('strict read write replay and review return503 without metadata on paired network outage',
        [blockedRead,blockedReplay,blockedWrite,blockedReview].every(out=>out.status===503&&!('mappingId' in out.body)));
      check('strict network outage rolls back audit ledger and review mutation',isDeepStrictEqual(beforeStrictFault,await counts())&&current.version===reviewer.body.version);
    }finally{await admin.query('GRANT INSERT('+networkColumns+') ON highpass_v3.identity_network_audit TO hp_v3_app');}
    const beforeConflict=await counts();
    const conflict=await send({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:rollbackCommand,key:'synthetic.identity-tls:reconcile-001'});
    const afterConflict=await counts();
    check('strict idempotency conflict commits one DENY network pair without a mapping or receipt mutation',conflict.status===409&&conflict.body.code==='V3_IDEMPOTENCY_CONFLICT'
      &&afterConflict.mappings===beforeConflict.mappings&&afterConflict.ledger===beforeConflict.ledger&&afterConflict.audits===beforeConflict.audits+1&&afterConflict.network===beforeConflict.network+1);
    const lockClient=await admin.connect();let unlockTimer,unlockError;
    try {
      const rows=(await lockClient.query(`SELECT key_digest FROM highpass_v3.identity_write_results WHERE operation='MAPPING_RECONCILE' AND mapping_id=$1
        AND (response_metadata->>'version')::integer=$2`,[mappingId,created.body.version])).rows;
      check('strict replay wait targets exactly the strict original receipt not legacy reconciliation',rows.length===1);
      const digest=rows[0].key_digest;
      const lock=digest.readBigInt64BE().toString();await lockClient.query('SELECT pg_advisory_lock($1::bigint)',[lock]);
      const beforeWait=await counts();
      const releaseLock=new Promise(resolve=>{unlockTimer=setTimeout(()=>{lockClient.query('SELECT pg_advisory_unlock($1::bigint)',[lock]).then(resolve,error=>{unlockError=error.code;resolve();});},2300);});
      const elapsed=await send({method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001',time:Date.now()-8000});
      await releaseLock;
      check('strict replay context expiring during actual advisory wait returns503 with no receipt or audit pair',!unlockError&&elapsed.status===503&&elapsed.body.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID'&&isDeepStrictEqual(beforeWait,await counts()));
    }finally{clearTimeout(unlockTimer);await lockClient.query('SELECT pg_advisory_unlock_all()');lockClient.release();}
    proxy=createV3IdentityCapstoneProxy({mode:'CAPSTONE_SYNTHETIC_ONLY',port:server.address().port,ca:read('mtls/ca.crt'),
      cert:read('identity-edge/identity-proxy-dev.crt'),key:read('identity-edge/identity-proxy-dev.key'),ingressSecret:secret});
    front=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),minVersion:'TLSv1.2',handshakeTimeout:2000},(req,res)=>proxy.handle(req,res));
    front.requestTimeout=5000;front.headersTimeout=3000;front.setTimeout(12000,socket=>socket.destroy());
    front.listen(0,'127.0.0.1');await once(front,'listening');
    const proxied=await send({frontend:true,afterSign:{'x-forwarded-for':'192.0.2.99','x-forwarded-proto':'http','x-hipass-ingress-signature':'SYNTHETIC_SPOOF',
      'x-hipass-service-token':'SYNTHETIC_NOT_FORWARDED','x-user-id':'SYNTHETIC_NOT_FORWARDED'}});
    check('actual HTTPS frontend rebuilds signed ingress and dedicated backend mTLS despite spoofed headers',proxied.status===200&&proxied.cache==='no-store'&&proxied.body.mappingId===mappingId);
    const frontCommand={frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-proxy:reconcile-001'};
    const frontCreated=await send(frontCommand),frontRetry=await send(frontCommand);
    check('actual HTTPS proxy preserves atomic mapping write and durable retry',frontCreated.status===201&&frontRetry.status===201&&isDeepStrictEqual(frontCreated.body,frontRetry.body)&&frontCreated.body.mappingId===mappingId);
    check('actual HTTPS proxy foreign hospital denies through JWT registry and RLS',(await send({frontend:true,actor:1})).status===404);
    const beforeRoutes=callbacks;
    for(const path of ['/api/consents','/api/v3/exchange-sessions','/api/v3/patient-mappings/'+mappingId+'?token=SYNTHETIC',
      '/api/v3/patient-mappings/%2fsecret','/api/v3/patient-mappings/'+mappingId+'/'])
      check('identity proxy exact route denies unapproved path before backend',(await send({frontend:true,path})).status===404);
    check('identity proxy rejected route aliases never reach backend',callbacks===beforeRoutes);
    const before = await counts();
    for (const [name, options] of [
      ['missing signature', { omit: ['x-hipass-ingress-signature'] }],
      ['forged signature', { afterSign: { 'x-hipass-ingress-signature': 'SYNTHETIC_FORGERY' } }],
      ['stale signature', { time: Date.now() - 11000 }],
      ['spoofed forwarded IP', { afterSign: { 'x-forwarded-for': '192.0.2.123' } }],
      ['changed authorization', { afterSign: { authorization: 'Bearer SYNTHETIC_CHANGED' } }],
      ['wrong trusted proxy role', { client: { cert: read('pending-edge/pending-proxy-dev.crt'), key: read('pending-edge/pending-proxy-dev.key') } }],
    ]) check('actual identity edge ' + name + ' denies403 before persistence', (await send(options)).status === 403);
    const invalidJwt = await send({ beforeSign: { authorization: 'Bearer SYNTHETIC_INVALID' } });
    check('actual identity edge valid channel never replaces JWT authentication', invalidJwt.status === 401);
    for (const [name, client] of [
      ['no certificate', null],
      ['untrusted certificate', { cert: read('identity-edge/untrusted-dev.crt'), key: read('identity-edge/untrusted-dev.key') }],
      ['expired certificate', { cert: read('generated-fixtures/expired/client.crt'), key: read('generated-fixtures/expired/client.key') }],
    ]) {
      if (client) {
        const cert=new X509Certificate(client.cert),trusted=cert.verify(new X509Certificate(read('mtls/ca.crt')).publicKey);
        check('identity negative fixture isolates ' + name, name==='untrusted certificate' ? !trusted && Date.parse(cert.validTo)>Date.now() : trusted && Date.parse(cert.validTo)<Date.now());
      }
      const priorCallbacks = callbacks, priorFailures = failures.length;
      let code; try { await send({ client }); } catch (error) { code = error.code; }
      const until = Date.now() + 2000; while (failures.length === priorFailures && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
      check('actual identity ' + name + ` TLS denies before HTTP callback not environment error (server ${failures.at(-1) ?? 'NONE'}; client ${code ?? 'NONE'})`, callbacks === priorCallbacks && failures.length > priorFailures &&
        ['ERR_SSL_PEER_DID_NOT_RETURN_A_CERTIFICATE', 'ERR_SSL_CERTIFICATE_VERIFY_FAILED', 'ECONNRESET'].includes(failures.at(-1)) &&
        ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED', 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA', 'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE', 'ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED', 'ERR_SSL_TLSV1_ALERT_ACCESS_DENIED', 'ECONNRESET'].includes(code));
    }
    let hostnameCode; try { await send({ servername: 'wrong.invalid' }); } catch (error) { hostnameCode = error.code; }
    check('identity TLS client enforces server hostname', hostnameCode === 'ERR_TLS_CERT_ALTNAME_INVALID');
    check('identity channel and authentication negatives leave mapping ledger audit unchanged', JSON.stringify(before) === JSON.stringify(await counts()));
    const unpaired=(await admin.query(`SELECT count(*)::int n FROM highpass_v3.identity_audit_outbox e LEFT JOIN highpass_v3.identity_network_audit n USING(event_id)
      WHERE e.mapping_id=$1 AND e.occurred_at > (SELECT min(recorded_at) FROM highpass_v3.identity_network_audit) AND n.event_id IS NULL`,[mappingId])).rows[0].n;
    check('strict mapping path emits no unpaired Identity audit events',unpaired===0);
    // Soft-delete only this independent synthetic fixture's existing row. Never
    // mutate deployed data or delete immutable audit/receipt history.
    const receiptSnapshot=async()=>(await admin.query(`SELECT operation,key_digest,request_digest,response_metadata,recorded_at
      FROM highpass_v3.identity_write_results WHERE mapping_id=$1 ORDER BY actor_id,operation,key_digest`,[mappingId])).rows;
    const setFixtureDeletion=async(table,column,id,deletedAt)=>{
      if(table==='patient_refs')return admin.query('UPDATE highpass_v3.patient_refs SET deleted_at=$2 WHERE patient_ref=$1 RETURNING patient_ref',[id,deletedAt]);
      // Administrative fixture preparation still obeys the mapping guard and
      // deferred audit constraint. No trigger disable, backdating or version reset.
      const setup=await admin.connect();
      try {
        await setup.query('BEGIN');
        const selected=(await setup.query('SELECT status,verified_by FROM highpass_v3.patient_mappings WHERE mapping_id=$1 FOR UPDATE',[id])).rows;
        if(selected.length!==1||selected[0].status!=='VERIFIED'||!selected[0].verified_by)throw Error('CHECK_FAILED');
        await setup.query("SELECT set_config('app.actor_id',$1,true)",[selected[0].verified_by]);
        const changed=await setup.query(`UPDATE highpass_v3.patient_mappings SET deleted_at=$2,version=version+1,updated_at=statement_timestamp()
          WHERE mapping_id=$1 RETURNING *`,[id,deletedAt]);
        const row=changed.rows[0];
        await setup.query(`INSERT INTO highpass_v3.identity_audit_outbox
          (event_id,tenant_id,hospital_id,actor_id,mapping_id,audit_session_id,trace_id,action,result,reason_code,old_state,new_state,mapping_version,evidence_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,'MAPPING_REVIEWED','ALLOW','MAPPING_VERIFIED','VERIFIED','VERIFIED',$8,$9)`,
          [randomUUID(),row.tenant_id,row.hospital_id,row.verified_by,id,randomUUID(),randomUUID(),row.version,row.evidence_digest]);
        await setup.query('COMMIT');return changed;
      }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
    };
    for(const resource of ['mapping','patient ref']) {
      const table=resource==='mapping'?'patient_mappings':'patient_refs';
      const column=resource==='mapping'?'mapping_id':'patient_ref';
      const id=resource==='mapping'?mappingId:command.patientRefId;
      const original=(await admin.query('SELECT deleted_at FROM highpass_v3.'+table+' WHERE '+column+'=$1',[id])).rows;
      check('unavailable replay '+resource+' selects one live synthetic fixture row',original.length===1&&original[0].deleted_at===null);
      const receipts=await receiptSnapshot();
      try {
        const deletion=await setFixtureDeletion(table,column,id,new Date());
        check('unavailable replay '+resource+' fixture applies actual soft deletion',deletion.rowCount===1);
        const beforeUnavailable=await counts();
        const unavailable=await send({frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001'});
        const afterUnavailable=await counts();
        check('actual HTTPS unavailable '+resource+' replay returns safe404 not historical success',unavailable.status===404&&unavailable.cache==='no-store'
          &&unavailable.body.code==='V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE'
          &&Object.keys(unavailable.body).every(key=>['type','title','status','code','traceId'].includes(key)));
        const deniedRows=(await admin.query(`SELECT e.mapping_id,e.patient_ref,e.mapping_version,e.new_state,e.action,e.result,e.reason_code
          FROM highpass_v3.identity_audit_outbox e JOIN highpass_v3.identity_network_audit n
          USING(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id) WHERE e.trace_id=$1`,[unavailable.body.traceId])).rows;
        check('unavailable '+resource+' replay commits one minimal exact correlated DENY network pair',
          afterUnavailable.mappings===beforeUnavailable.mappings&&afterUnavailable.ledger===beforeUnavailable.ledger
          &&afterUnavailable.audits===beforeUnavailable.audits+1&&afterUnavailable.network===beforeUnavailable.network+1
          &&deniedRows.length===1&&deniedRows[0].action==='MAPPING_DENIED'&&deniedRows[0].result==='DENY'
          &&deniedRows[0].reason_code==='MAPPING_REPLAY_RESOURCE_UNAVAILABLE'
          &&['mapping_id','patient_ref','mapping_version','new_state'].every(key=>deniedRows[0][key]===null));
        check('unavailable '+resource+' replay preserves immutable original receipts and digests',isDeepStrictEqual(receipts,await receiptSnapshot()));
        await admin.query('REVOKE INSERT('+networkColumns+') ON highpass_v3.identity_network_audit FROM hp_v3_app');
        try {
          const beforeOutage=await counts();
          const outage=await send({frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001'});
          check('unavailable '+resource+' replay network audit outage fails503 and rolls back entire DENY pair',
            outage.status===503&&!('mappingId' in outage.body)&&isDeepStrictEqual(beforeOutage,await counts())
            &&isDeepStrictEqual(receipts,await receiptSnapshot()));
        }finally{await admin.query('GRANT INSERT('+networkColumns+') ON highpass_v3.identity_network_audit TO hp_v3_app');}
      }finally{
        await setFixtureDeletion(table,column,id,original[0].deleted_at);
      }
      const recovered=await send({frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:command,key:'synthetic.identity-tls:reconcile-001'});
      check('restored synthetic '+resource+' replay returns original receipt without ledger rewrite',recovered.status===201
        &&isDeepStrictEqual(recovered.body,created.body)&&isDeepStrictEqual(receipts,await receiptSnapshot()));
    }
    const freshCommand=label=>({...command,...protection.protect(label,{tenantId:command.tenantId,hospitalId:command.hospitalId,patientRefId:command.patientRefId})});
    const ackCommand=freshCommand('HP-TEST-STRICT-COMMIT-ACK-LOSS');
    const ackRequest={frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:ackCommand,key:'synthetic.identity:ack-loss-001'};
    const beforeAck=await counts();loseCommitAck=true;
    const lostAck=await send(ackRequest),afterAck=await counts();
    check('strict actual COMMIT then injected lost ACK returns safe503 outcome unknown',lostAck.status===503&&lostAck.cache==='no-store'
      &&lostAck.body.code==='V3_COMMIT_OUTCOME_UNKNOWN'&&!('mappingId' in lostAck.body)&&commitAckLosses===1);
    const committed=(await admin.query(`SELECT r.response_metadata,r.key_digest,r.request_digest,r.recorded_at,m.registered_by
      FROM highpass_v3.identity_write_results r JOIN highpass_v3.patient_mappings m ON m.mapping_id=r.mapping_id
      WHERE m.local_ref_digest=$1 AND m.patient_ref=$2 AND r.operation='MAPPING_RECONCILE'`,
      [Buffer.from(ackCommand.localRefDigest,'base64url'),command.patientRefId])).rows;
    check('strict unknown response still has one committed mapping receipt business audit and network pair',committed.length===1
      &&afterAck.mappings===beforeAck.mappings+1&&afterAck.ledger===beforeAck.ledger+1
      &&afterAck.audits===beforeAck.audits+1&&afterAck.network===beforeAck.network+1);
    const originalAck=committed[0].response_metadata;
    const ackRetry=await send(ackRequest),afterAckRetry=await counts();
    check('strict lost ACK fresh HTTPS retry returns exact committed receipt with one new access pair',ackRetry.status===201
      &&isDeepStrictEqual(ackRetry.body,originalAck)&&afterAckRetry.mappings===afterAck.mappings&&afterAckRetry.ledger===afterAck.ledger
      &&afterAckRetry.audits===afterAck.audits+1&&afterAckRetry.network===afterAck.network+1);
    const ackPairs=(await admin.query(`SELECT e.action,e.trace_id,n.proxy_certificate_sha256 FROM highpass_v3.identity_audit_outbox e
      JOIN highpass_v3.identity_network_audit n USING(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
      WHERE e.mapping_id=$1`,[originalAck.mappingId])).rows;
    check('strict lost ACK preserves one business event and distinct fresh retry network correlation',ackPairs.length===2
      &&ackPairs.filter(row=>row.action==='MAPPING_CREATED').length===1&&ackPairs.filter(row=>row.action==='MAPPING_READ').length===1
      &&new Set(ackPairs.map(row=>row.trace_id)).size===2&&ackPairs.every(row=>row.proxy_certificate_sha256.length===32));
    const concurrentCommand=freshCommand('HP-TEST-STRICT-CONCURRENT-REPLAY');
    const concurrentRequest={frontend:true,method:'POST',path:'/api/v3/patient-mappings/reconcile',body:concurrentCommand,key:'synthetic.identity:concurrent-001'};
    const beforeConcurrent=await counts();strictBackends.clear();
    const concurrentResponses=await Promise.all([send(concurrentRequest),send(concurrentRequest)]);
    const afterConcurrent=await counts();
    check('strict concurrent same-key HTTPS requests use two actual PG backends and one original receipt',strictBackends.size===2
      &&concurrentResponses.every(row=>row.status===201)&&isDeepStrictEqual(concurrentResponses[0].body,concurrentResponses[1].body));
    check('strict concurrent same-key requests perform one mutation and preserve each authorized access pair',
      afterConcurrent.mappings===beforeConcurrent.mappings+1&&afterConcurrent.ledger===beforeConcurrent.ledger+1
      &&afterConcurrent.audits===beforeConcurrent.audits+2&&afterConcurrent.network===beforeConcurrent.network+2);
    const concurrentPairs=(await admin.query(`SELECT e.action,e.trace_id FROM highpass_v3.identity_audit_outbox e
      JOIN highpass_v3.identity_network_audit n USING(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id)
      WHERE e.mapping_id=$1`,[concurrentResponses[0].body.mappingId])).rows;
    check('strict concurrent replay has exactly one CREATED and one READ with distinct paired traces',concurrentPairs.length===2
      &&concurrentPairs.filter(row=>row.action==='MAPPING_CREATED').length===1&&concurrentPairs.filter(row=>row.action==='MAPPING_READ').length===1
      &&new Set(concurrentPairs.map(row=>row.trace_id)).size===2);
    const actor=committed[0].registered_by;
    const beforeRevocation=await counts();
    await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[actor]);
    try {
      const revoked=await send(ackRequest);
      check('strict same-key retry after durable principal revocation denies403 without old receipt or new domain pair',
        revoked.status===403&&revoked.body.code==='V3_DB_PRINCIPAL_INACTIVE'&&!('mappingId' in revoked.body)
        &&isDeepStrictEqual(beforeRevocation,await counts()));
    }finally{await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[actor]);}
    const staleRetry=await send({...ackRequest,frontend:false,time:Date.now()-11000});
    check('strict stale signed-ingress retry cannot borrow a previously successful capability',staleRetry.status===403
      &&staleRetry.body.code==='V3_IDENTITY_EDGE_DENIED'&&isDeepStrictEqual(beforeRevocation,await counts()));
    const finalReceipt=(await admin.query(`SELECT r.response_metadata,r.key_digest,r.request_digest,r.recorded_at,m.registered_by
      FROM highpass_v3.identity_write_results r JOIN highpass_v3.patient_mappings m ON m.mapping_id=r.mapping_id
      WHERE m.mapping_id=$1 AND r.operation='MAPPING_RECONCILE'`,[originalAck.mappingId])).rows;
    check('strict commit-loss replay and denied retries never overwrite original receipt digests or recorded time',isDeepStrictEqual(committed,finalReceipt));
    preauth=await createIdentityPreauthFixture({admin,base,check});
    readiness=preauth.createReadiness(pool);
    edge.dispose();
    host=createV3IdentityCapstoneHost({mode:'CAPSTONE_SYNTHETIC_ONLY',registry,readService,writeService,ingressSecret:secret,preauthObserver:preauth.observer,readiness,
      tls:{key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt')}});
    await host.start();
    check('actual identity lifecycle binds loopback mTLS without claiming DB deployment readiness',host.state().phase==='LISTENING'
      &&host.state().readiness==='NOT VERIFIED'&&host.address().host==='127.0.0.1');
    proxy.dispose();proxy=createV3IdentityCapstoneProxy({mode:'CAPSTONE_SYNTHETIC_ONLY',port:host.address().port,ca:read('mtls/ca.crt'),
      cert:read('identity-edge/identity-proxy-dev.crt'),key:read('identity-edge/identity-proxy-dev.key'),ingressSecret:secret});
    const hosted=await send({frontend:true});
    check('actual identity lifecycle strict proxy host mTLS and nonowner PG returns own mapping',hosted.status===200&&hosted.body.mappingId===mappingId);
    const readinessBinding=()=>registry.resolve({headers:{authorization:'Bearer '+issueToken(0)}},{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']});
    const beforeReadiness=await counts(),beforeReadyEvents=(await preauth.rows()).length;
    const ready=await host.checkReadiness(readinessBinding());
    check('actual host read-only readiness verifies registered principal schema guards and three separated nonowner roles',ready.status==='PASS'
      &&ready.checks.length===3&&ready.checks.every(row=>row.result==='PASS'));
    check('actual readiness stores no domain or manufactured preauth health event',isDeepStrictEqual(beforeReadiness,await counts())&&(await preauth.rows()).length===beforeReadyEvents);
    const registeredActor=readinessBinding().actorId;
    await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[registeredActor]);
    try{
      const revokedReady=await host.checkReadiness(readinessBinding());
      check('actual read-only readiness rejects durable principal revocation',revokedReady.status==='FAIL'
        &&revokedReady.checks.some(row=>row.reason==='REGISTERED_PRINCIPAL_INACTIVE'));
    }finally{await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[registeredActor]);}
    await admin.query('ALTER TABLE highpass_v3.identity_network_audit RENAME TO identity_network_audit_readiness_missing');
    try{
      const missingReady=await host.checkReadiness(readinessBinding());
      check('actual read-only readiness rejects missing required schema without migrating',missingReady.status==='FAIL'
        &&missingReady.checks.some(row=>row.reason==='IDENTITY_SCHEMA_OR_READ_GRANT_MISSING'));
    }finally{await admin.query('ALTER TABLE highpass_v3.identity_network_audit_readiness_missing RENAME TO identity_network_audit');}
    await preauth.withInsertOutage(async()=>{
      const publisherReady=await host.checkReadiness(readinessBinding());
      check('actual readiness catches preauth publisher grant outage without health insertion',publisherReady.status==='FAIL'
        &&publisherReady.checks.some(row=>row.name==='preauth-publisher'&&row.reason==='PREAUTH_GRANT_MISSING_OR_EXCESSIVE'));
    });
    const networkInsert='event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at';
    await admin.query('REVOKE INSERT('+networkInsert+') ON highpass_v3.identity_network_audit FROM hp_v3_app');
    try{
      const networkReady=await host.checkReadiness(readinessBinding());
      check('actual readiness catches paired identity network grant outage',networkReady.status==='FAIL'
        &&networkReady.checks.some(row=>row.reason==='IDENTITY_NETWORK_GRANT_MISSING'));
    }finally{await admin.query('GRANT INSERT('+networkInsert+') ON highpass_v3.identity_network_audit TO hp_v3_app');}
    check('actual host readiness recovers after exact fixture restoration',(await host.checkReadiness(readinessBinding())).status==='PASS'
      &&isDeepStrictEqual(beforeReadiness,await counts())&&(await preauth.rows()).length===beforeReadyEvents);
    const beforePreauthDomain=await counts();
    for(const [name,stage,status,options] of [
      ['missing signature','INGRESS',403,{omit:['x-hipass-ingress-signature']}],
      ['wrong proxy role with spoofed IP','INGRESS',403,{client:{cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')},afterSign:{'x-forwarded-for':'192.0.2.199'}}],
      ['invalid read JWT','HUMAN_AUTH',401,{beforeSign:{authorization:'Bearer SYNTHETIC_INVALID'}}],
      ['invalid write JWT','HUMAN_AUTH',401,{...ackRequest,beforeSign:{authorization:'Bearer SYNTHETIC_INVALID'}}],
      ['missing JWT','HUMAN_AUTH',401,{beforeSign:{authorization:''}}]
    ]){
      const rejected=await send(options);
      check('actual identity observed '+name+' preserves safe status without metadata',rejected.status===status&&rejected.cache==='no-store'&&!('mappingId' in rejected.body));
      await preauth.settleNext(stage);
    }
    const preauthRows=await preauth.rows();
    check('actual identity preauth stores exact minimal actorless immediate-socket facts ignoring spoofed headers',preauthRows.length===5
      &&preauthRows.every(row=>row.ip==='127.0.0.1'&&row.source_kind==='IMMEDIATE_SOCKET'&&row.result==='DENY'
        &&({INGRESS:'INGRESS_REJECTED',HUMAN_AUTH:'HUMAN_AUTH_REJECTED'})[row.stage]===row.reason_code)
      &&preauthRows.filter(row=>row.stage==='INGRESS').length===2&&preauthRows.filter(row=>row.stage==='HUMAN_AUTH').length===3);
    check('actual preauth admission rejection never mutates domain ledger or paired identity rows',isDeepStrictEqual(beforePreauthDomain,await counts()));
    const beforePolicy=preauth.observer.observations().length;
    check('authenticated foreign mapping retains domain404 not preauth classification',(await send({actor:1})).status===404);
    check('authenticated domain denial does not double-publish actorless rejection',preauth.observer.observations().length===beforePolicy&&(await preauth.rows()).length===5);
    const beforeTlsDomain=await counts();
    for(const [name,client] of [
      ['no certificate',null],
      ['untrusted certificate',{cert:read('identity-edge/untrusted-dev.crt'),key:read('identity-edge/untrusted-dev.key')}],
      ['expired certificate',{cert:read('generated-fixtures/expired/client.crt'),key:read('generated-fixtures/expired/client.key')}]
    ]){
      let code;try{await send({client});}catch(error){code=error.code;}
      check('actual hosted identity '+name+' is TLS DENY not DNS or connection failure',
        ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA','ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE',
          'ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED','ERR_SSL_TLSV1_ALERT_ACCESS_DENIED','ECONNRESET'].includes(code));
      await preauth.settleNext('TLS');
    }
    const hostedTls=(await preauth.rows()).filter(row=>row.stage==='TLS');
    const tlsFacts=hostedTls.map(({reason_code,ip,result,source_kind})=>({reason:reason_code,ip,result,sourceKind:source_kind}));
    check('actual listener-owned TLS rejection persists minimal native facts without inventing missing IP or reason '+JSON.stringify(tlsFacts),hostedTls.length===3
      &&hostedTls.every(row=>(row.ip==='127.0.0.1'||row.ip===null)&&row.result==='DENY'&&row.source_kind==='IMMEDIATE_SOCKET'
        &&['TLS_CERTIFICATE_REQUIRED','TLS_CERTIFICATE_UNTRUSTED','TLS_CERTIFICATE_EXPIRED','UNKNOWN_TLS'].includes(row.reason_code))
      &&hostedTls.some(row=>row.reason_code==='TLS_CERTIFICATE_REQUIRED')&&isDeepStrictEqual(beforeTlsDomain,await counts()));
    const beforeOutageDomain=await counts();
    await preauth.withInsertOutage(async()=>{
      const outage=await send({...ackRequest,beforeSign:{authorization:'Bearer SYNTHETIC_INVALID'}});
      check('identity real preauth INSERT outage preserves authentication401 without metadata',outage.status===401&&!('mappingId' in outage.body));
      await preauth.settleNext('HUMAN_AUTH','NOT_RECORDED');
      check('identity preauth outage stores no fabricated success and changes no domain rows',(await preauth.rows()).length===8&&isDeepStrictEqual(beforeOutageDomain,await counts()));
    });
    await send({beforeSign:{authorization:'Bearer SYNTHETIC_INVALID'}});await preauth.settleNext('HUMAN_AUTH');
    check('identity preauth publisher recovers after privilege restoration',(await preauth.rows()).length===9);
    preauth.observer.dispose();
    const disposedObservation=await send({omit:['x-hipass-ingress-signature']});
    check('disposed identity observer never opens access or fabricates durable delivery',disposedObservation.status===403);
    await preauth.settleNext('INGRESS','NOT_RECORDED');
    check('disposed identity observer stores no new actorless event',(await preauth.rows()).length===9);
    await host.stop();
    check('stopped host does not reuse a previously successful readiness result',(await host.checkReadiness(readinessBinding())).status==='NOT VERIFIED');
    check('actual identity host stops owned listener and cannot reopen after disposal',host.state().phase==='CLOSED'&&host.address()===null
      &&await host.start().then(()=>false,error=>error.message==='V3_IDENTITY_HOST_CLOSED'));
    host=undefined;
    const runtimeConfig={mode:'CAPSTONE_SYNTHETIC_ONLY',registry,protection,clinicalPool:pool,ingressSecret:secret,idempotencyKey:randomBytes(32),
      tls:{key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt')}};
    runtime=preauth.createRuntime(runtimeConfig);
    await admin.query("UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id=$1",[registeredActor]);
    try{
      const notStarted=await runtime.start(readinessBinding()).then(()=>false,error=>error.message==='V3_IDENTITY_RUNTIME_NOT_STARTED');
      check('runtime preflight refuses revoked actual PG principal before listener bind',notStarted&&runtime.address()===null&&runtime.state().phase==='FAILED');
    }finally{await admin.query("UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id=$1",[registeredActor]);await runtime.stop();}
    runtime=preauth.createRuntime(runtimeConfig);
    const beforeStart=await counts(),beforeStartEvents=(await preauth.rows()).length;
    const started=await runtime.start(readinessBinding());
    check('runtime composes separated nonowner PG dependencies and binds only after actual read-only preflight',started.status==='PASS'
      &&runtime.state().phase==='LISTENING'&&runtime.address().host==='127.0.0.1');
    check('runtime startup issues no principal grant or domain/preauth health mutation',isDeepStrictEqual(beforeStart,await counts())&&(await preauth.rows()).length===beforeStartEvents);
    proxy.dispose();proxy=createV3IdentityCapstoneProxy({mode:'CAPSTONE_SYNTHETIC_ONLY',port:runtime.address().port,ca:read('mtls/ca.crt'),
      cert:read('identity-edge/identity-proxy-dev.crt'),key:read('identity-edge/identity-proxy-dev.key'),ingressSecret:secret});
    const composedRead=await send({frontend:true});
    check('composed runtime strict proxy mTLS and registered RLS mapping read returns original scoped mapping',composedRead.status===200&&composedRead.body.mappingId===mappingId);
    check('composed runtime repeats fresh read-only readiness independently of transport state',(await runtime.checkReadiness(readinessBinding())).status==='PASS'
      &&runtime.state().readiness==='NOT VERIFIED');
    await runtime.stop();
    check('composed runtime stops idempotently and cannot reuse readiness or listener after shutdown',runtime.state().phase==='CLOSED'&&runtime.address()===null
      &&(await runtime.checkReadiness(readinessBinding())).status==='NOT VERIFIED');
    edge.dispose();
    check('disposed identity edge fails closed403', (await send()).status === 403);
    proxy.dispose();check('disposed identity frontend fails closed503',(await send({frontend:true})).status===503);
  } finally {
    await runtime?.stop();
    readiness?.dispose();
    await host?.stop();
    await preauth?.close();
    idempotency.dispose();
    network.dispose();
    proxy?.dispose();if(front){front.closeAllConnections();await new Promise(resolve=>front.close(resolve));}
    edge.dispose(); secret.fill(0); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
