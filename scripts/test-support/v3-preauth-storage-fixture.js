import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {createServer,request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {createSyntheticPreauthObserver} from '../../src/v3-preauth-security-events.js';
import {checkPreauthOutages} from './v3-preauth-outage-fixture.js';

// Owned nonowner SQL integrity tests. Not TLS-to-durable sink provenance evidence.
export async function checkPreauthStorage({admin,base,clinicalPool,check}){
 const table='highpass_v3.preauth_security_events';
 const publisherPassword=randomBytes(32).toString('hex'),readerPassword=randomBytes(32).toString('hex');
 await admin.query(`CREATE ROLE hp_v3_preauth_test_publisher LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${publisherPassword}';
  CREATE ROLE hp_v3_preauth_test_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${readerPassword}';
  GRANT hp_v3_preauth_publisher_policy TO hp_v3_preauth_test_publisher;
  GRANT hp_v3_preauth_reader_policy TO hp_v3_preauth_test_reader;`);
 const publisher=new Pool({...base,user:'hp_v3_preauth_test_publisher',password:publisherPassword});
 const reader=new Pool({...base,user:'hp_v3_preauth_test_reader',password:readerPassword});
 publisher.on('error',()=>{});reader.on('error',()=>{});
 const insert=`INSERT INTO ${table}(event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8)`;
 const args=()=>[randomUUID(),new Date().toISOString(),'CAPSTONE_SYNTHETIC_ONLY','TLS','UNKNOWN_TLS','DENY','IMMEDIATE_SOCKET','127.0.0.1'];
 async function denied(name,pool,sql,parameters,code){let actual;try{await pool.query(sql,parameters);}catch(error){actual=error.code;}check(name,actual===code);}
 try{
  const first=args();check('actual preauth publisher inserts minimal actorless row',(await publisher.query(insert,first)).rowCount===1);
  const row=(await reader.query(`SELECT event_id,host(source_ip) ip,recorded_at FROM ${table}`)).rows;
  check('actual separate security reader sees inserted event',row.length===1&&row[0].event_id===first[0]&&row[0].ip==='127.0.0.1');
  await denied('preauth publisher cannot SELECT',publisher,`SELECT * FROM ${table}`,[], '42501');
  await denied('preauth reader cannot INSERT',reader,insert,args(),'42501');
  await denied('clinical credential has no preauth table privilege',clinicalPool,`SELECT * FROM ${table}`,[],'42501');
  for(const [name,index,value] of [['wrong scope',2,'PRODUCTION'],['stage reason mismatch',3,'INGRESS'],['raw reason',4,'RAW_SECRET'],
   ['ALLOW result',5,'ALLOW'],['forwarded source',6,'FORWARDED_HEADER'],['subnet',7,'127.0.0.1/24'],
   ['infinite observed time',1,'infinity'],['stale observation',1,new Date(Date.now()-60000).toISOString()]]){
   const bad=args();bad[index]=value;await denied(`preauth constraint rejects ${name}`,publisher,insert,bad,'23514');
  }
  await denied('preauth duplicate UUID rejected',publisher,insert,first,'23505');
  const nullable=args();nullable[7]=null;check('preauth missing socket observation stores null not invented IP',(await publisher.query(insert,nullable)).rowCount===1);
  for(const pool of [publisher,reader]){
   await denied('preauth nonowner UPDATE denied',pool,`UPDATE ${table} SET source_ip='127.0.0.2'`,[],'42501');
   await denied('preauth nonowner DELETE denied',pool,`DELETE FROM ${table}`,[],'42501');
  }
  await denied('preauth privileged UPDATE rejected by immutable trigger',admin,`UPDATE ${table} SET source_ip='127.0.0.2'`,[],'42501');
  await denied('preauth privileged DELETE rejected by immutable trigger',admin,`DELETE FROM ${table}`,[],'42501');
  await denied('publisher cannot override DB recorded time',publisher,`INSERT INTO ${table}(event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip,recorded_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,statement_timestamp())`,args(),'42501');
  check('preauth table FORCE RLS and PUBLIC has no grants',(await admin.query(`SELECT relrowsecurity AND relforcerowsecurity enabled FROM pg_class WHERE oid=$1::regclass`,[table])).rows[0].enabled
   &&(await admin.query("SELECT count(*)::int n FROM information_schema.table_privileges WHERE table_schema='highpass_v3' AND table_name='preauth_security_events' AND grantee='PUBLIC'")).rows[0].n===0);
  check('preauth rejection attempts leave exactly two immutable rows',(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n===2);
  await checkDurable({admin,publisher,reader,check,table});
 }finally{await Promise.all([publisher.end(),reader.end()]);}
}

async function checkDurable({admin,publisher,reader,check,table}){
 const observer=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 const sink=observer.createDurableSink({publisherPool:publisher,reconciliationPool:reader});
 // Explicit socket test double for SQL/ack tests; actual TLS follows separately.
 const input=observer.captureIngressFailure({remoteAddress:'127.0.0.1'});
 check('actual durable adapter commits admitted event',await sink.record(input)==='RECORDED_DURABLE');
 check('actual duplicate event requires confirmation without publisher read',await sink.record(input)==='NOT_CONFIRMED');
 check('actual separate reader confirms exact original committed event',await sink.confirm(input)==='RECORDED_DURABLE');
 const lostPool={async connect(){const client=await publisher.connect();return {
  on:(...args)=>client.on(...args),release:(...args)=>client.release(...args),getTransactionStatus:()=>client.getTransactionStatus(),
  async query(q){const result=await client.query(q);if(q.text.startsWith('INSERT INTO highpass_v3.preauth_security_events'))throw Error('SYNTHETIC_LOST_ACK');return result;}
 };}};
 const lost=observer.createDurableSink({publisherPool:lostPool,reconciliationPool:reader});
 const ackInput=observer.captureHumanAuthFailure({remoteAddress:'127.0.0.1'});
 check('actual insert commit then injected lost ACK is OUTCOME_UNKNOWN',await lost.record(ackInput)==='OUTCOME_UNKNOWN');
 check('actual lost ACK resolved by separate reader without another event',await sink.confirm(ackInput)==='RECORDED_DURABLE');
 check('actual unknown input confirmation remains not confirmed',await sink.confirm(observer.captureMockAssuranceFailure({}))==='NOT_CONFIRMED');
 const forged=await sink.record({}).then(()=>false,error=>error.message==='PREAUTH_ADMISSION_REQUIRED');
 check('actual durable adapter rejects forged admission',forged);
 const conflictInput=observer.captureIngressFailure({remoteAddress:'127.0.0.1'});let conflictEvent;
 await observer.createTestSink({send:async event=>{conflictEvent=event;}}).record(conflictInput);
 await publisher.query(`INSERT INTO ${table}(event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[conflictEvent.eventId,conflictEvent.observedAt,conflictEvent.scope,conflictEvent.stage,
   conflictEvent.reasonCode,conflictEvent.result,conflictEvent.sourceKind,'127.0.0.2']);
 check('actual same UUID different socket facts are conflict not durable confirmation',await sink.record(conflictInput)==='NOT_CONFIRMED'
  &&await sink.confirm(conflictInput)==='EVENT_CONFLICT');
 const beforeGuardRows=(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
 const openPool={async connect(){const client=await publisher.connect();await client.query('BEGIN');return client;}};
 check('actual borrowed open PG transaction rejected before insert',await observer.createDurableSink({publisherPool:openPool,reconciliationPool:reader})
  .record(observer.captureHumanAuthFailure({}))==='NOT_RECORDED');
 check('actual swapped publisher and reader profiles cannot insert',await observer.createDurableSink({publisherPool:reader,reconciliationPool:publisher})
  .record(observer.captureHumanAuthFailure({}))==='NOT_RECORDED');
 await admin.query('GRANT hp_v3_preauth_reader_policy TO hp_v3_preauth_test_publisher');
 try{check('actual mixed preauth role membership denied',await sink.record(observer.captureIngressFailure({}))==='NOT_RECORDED');}
 finally{await admin.query('REVOKE hp_v3_preauth_reader_policy FROM hp_v3_preauth_test_publisher');}
 check('actual role and open transaction rejection create no extra row',(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n===beforeGuardRows);
 const read=name=>readFileSync(`tmp/certs/${name}`);
 const previousIds=(await reader.query(`SELECT event_id FROM ${table}`)).rows.map(row=>row.event_id);
 let callbacks=0;const outcomes=[];let activeSink=sink;
 const server=createServer({key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt'),
  requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2',handshakeTimeout:1500},(_,res)=>{callbacks++;res.end('synthetic-ready');});
 server.requestTimeout=2000;server.headersTimeout=1500;server.setTimeout(3000,socket=>socket.destroy());
 server.on('tlsClientError',(error,socket)=>outcomes.push(activeSink.record(observer.captureTlsFailure(socket,error))));
 async function send(client){return new Promise((resolve,reject)=>{
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,
   ca:read('mtls/ca.crt'),rejectUnauthorized:true,agent:false,...(client??{})},res=>{
    res.resume();res.on('error',reject);res.once('end',()=>{clearTimeout(timer);resolve(res.statusCode);});
   });
  const timer=setTimeout(()=>req.destroy(Object.assign(Error('SYNTHETIC_TIMEOUT'),{code:'SYNTHETIC_TIMEOUT'})),3000);
  req.on('error',error=>{clearTimeout(timer);reject(error);});req.end();
 });}
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening',{signal:AbortSignal.timeout(2000)});
  for(const [name,client] of [['no certificate',null],['untrusted certificate',{cert:read('generated-fixtures/untrusted-client/untrusted-client.crt'),key:read('generated-fixtures/untrusted-client/untrusted-client.key')}],
   ['expired certificate',{cert:read('bad/bad.crt'),key:read('bad/bad.key')}]] ){
   const before=outcomes.length,beforeCallbacks=callbacks;let code;
   try{await send(client);}catch(error){code=error.code;}
   const until=Date.now()+2000;while(outcomes.length===before&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
   check(`actual TLS ${name} denial reaches durable PG without HTTP callback`,outcomes.length===before+1&&callbacks===beforeCallbacks
    &&['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA','ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE',
      'ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED','ECONNRESET','ERR_SSL_TLSV1_ALERT_ACCESS_DENIED'].includes(code)
    &&await outcomes.at(-1)==='RECORDED_DURABLE');
  }
  const tls=(await reader.query(`SELECT stage,result,reason_code,source_kind,host(source_ip) ip
   FROM ${table} WHERE NOT(event_id=ANY($1::uuid[]))`,[previousIds])).rows;
  check('actual new TLS rows contain fixed minimal DENY and immediate socket facts',tls.length===3&&tls.every(row=>
   row.stage==='TLS'&&row.result==='DENY'&&row.source_kind==='IMMEDIATE_SOCKET'&&(row.ip===null||row.ip==='127.0.0.1')
   &&['TLS_CERTIFICATE_REQUIRED','TLS_CERTIFICATE_EXPIRED','TLS_CERTIFICATE_UNTRUSTED','UNKNOWN_TLS'].includes(row.reason_code)));
  const columns='event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip';
  await admin.query(`REVOKE INSERT(${columns}) ON ${table} FROM hp_v3_preauth_publisher_policy`);
  try{
   const before=outcomes.length,beforeCallbacks=callbacks;let code;
   try{await send(null);}catch(error){code=error.code;}
   const until=Date.now()+2000;while(outcomes.length===before&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
   check('actual TLS DENY survives real publisher privilege revocation with NOT_RECORDED',outcomes.length===before+1
    &&callbacks===beforeCallbacks&&['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ECONNRESET'].includes(code)
    &&await outcomes.at(-1)==='NOT_RECORDED');
   check('actual authenticated synthetic health responsive during PG sink rejection',await send({cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')})===200);
  }finally{await admin.query(`GRANT INSERT(${columns}) ON ${table} TO hp_v3_preauth_publisher_policy`);}
  await admin.query(`REVOKE SELECT ON ${table} FROM hp_v3_preauth_reader_policy`);
  try{check('actual reader privilege outage cannot claim resolved delivery',await sink.confirm(observer.captureHumanAuthFailure({}))==='OUTCOME_UNKNOWN');}
  finally{await admin.query(`GRANT SELECT ON ${table} TO hp_v3_preauth_reader_policy`);}
  // Read fixed actorless fields only. No TLS client raw errors or request headers.
  const count=(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
  check('actual durable store retains schema ack conflict and TLS rows only',count===8);
  await checkPreauthOutages({admin,publisher,reader,observer,table,check,send,outcomes,
   getCallbacks:()=>callbacks,setSink:value=>{activeSink=value;},normalSink:sink,
   trustedClient:{cert:read('pending-edge/pending-proxy-dev.crt'),key:read('pending-edge/pending-proxy-dev.key')}});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
