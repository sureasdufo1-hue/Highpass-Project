import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {TLSSocket} from 'node:tls';

// Injection-only synthetic observer. No production listener or durable sink wiring.
const admitted = new WeakMap();
const sinkOwners=new WeakMap(),edgeObservers=new WeakSet();
const guardedClients=new WeakSet();
export function assertPreauthEdgeObserver(value){
 if(!edgeObservers.has(value))throw Error('PREAUTH_EDGE_OBSERVER_REQUIRED');
}
const tlsReasons = new Map([
 ['ERR_SSL_PEER_DID_NOT_RETURN_A_CERTIFICATE', 'TLS_CERTIFICATE_REQUIRED'],
 ['CERT_HAS_EXPIRED', 'TLS_CERTIFICATE_EXPIRED'],
 ['CERT_NOT_YET_VALID', 'TLS_CERTIFICATE_NOT_YET_VALID'],
 ['SELF_SIGNED_CERT_IN_CHAIN', 'TLS_CERTIFICATE_UNTRUSTED'],
 ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_CERTIFICATE_UNTRUSTED'],
 ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'TLS_CERTIFICATE_UNTRUSTED'],
]);
const outcomes = Object.freeze({recorded:'RECORDED_TEST_ONLY',failed:'NOT_RECORDED',overflow:'OVERFLOW',timeout:'TIMEOUT'});

export function createSyntheticPreauthObserver({mode}={}) {
 if(mode!=='CAPSTONE_SYNTHETIC_ONLY')throw Error('PREAUTH_SYNTHETIC_CONFIGURATION_REQUIRED');
 const owner=Object.freeze({});
 const registerSink=value=>{sinkOwners.set(value,owner);return value;};
 function capture(socket,stage,reasonCode) {
  const address=socket?.remoteAddress;
  const sourceIp=typeof address==='string'&&isIP(address)?address:null;
  const event=Object.freeze({eventId:randomUUID(),observedAt:new Date().toISOString(),
   scope:mode,stage,reasonCode,result:'DENY',sourceKind:'IMMEDIATE_SOCKET',sourceIp});
  const capability=Object.freeze(Object.create(null));
  admitted.set(capability,{owner,event,observedMs:Date.now(),observedMono:performance.now()});
  return capability;
 }
 function captureTlsFailure(socket,error){
  const reason=tlsReasons.get(error?.code)
   ||(error?.code==='ERR_SSL_CERTIFICATE_VERIFY_FAILED'?tlsReasons.get(socket?.authorizationError):null)
   ||'UNKNOWN_TLS';
  return capture(socket,'TLS',reason);
 }
 return Object.freeze({
  captureTlsFailure,
  captureIngressFailure(socket){return capture(socket,'INGRESS','INGRESS_REJECTED');},
  captureHumanAuthFailure(socket){return capture(socket,'HUMAN_AUTH','HUMAN_AUTH_REJECTED');},
  captureMockAssuranceFailure(socket){return capture(socket,'MOCK_ASSURANCE','MOCK_ASSURANCE_REQUIRED');},
  createEdgeObserver({sink}={}){
   if(sinkOwners.get(sink)!==owner)throw Error('PREAUTH_EDGE_SINK_PAIR_REQUIRED');
   let disposed=false;const history=[];
   const stages={INGRESS:'INGRESS_REJECTED',HUMAN_AUTH:'HUMAN_AUTH_REJECTED',MOCK_ASSURANCE:'MOCK_ASSURANCE_REQUIRED'};
   const authority=Object.freeze({
    async observeTlsFailure(socket,error){
     if(!(socket instanceof TLSSocket))throw Error('PREAUTH_TLS_SOCKET_REQUIRED');
     let outcome='NOT_RECORDED';
     if(!disposed){try{outcome=await sink.record(captureTlsFailure(socket,error));}catch{outcome='OUTCOME_UNKNOWN';}}
     history.push(Object.freeze({stage:'TLS',outcome}));if(history.length>16)history.shift();
     return outcome;
    },
    async observe(request,stage){
     if(!Object.hasOwn(stages,stage))throw Error('PREAUTH_EDGE_STAGE_INVALID');
     let outcome='NOT_RECORDED';
     if(!disposed){try{outcome=await sink.record(capture(request?.socket,stage,stages[stage]));}
      catch{outcome='OUTCOME_UNKNOWN';}}
     history.push(Object.freeze({stage,outcome}));if(history.length>16)history.shift();
     return outcome;
    },
    observations(){return Object.freeze([...history]);},
    dispose(){disposed=true;edgeObservers.delete(authority);},
   });
   edgeObservers.add(authority);return authority;
  },
  createDurableSink({publisherPool,reconciliationPool,deadlineMs=1000,maxConcurrent=2}={}) {
   if(!publisherPool||typeof publisherPool.connect!=='function'||!reconciliationPool||typeof reconciliationPool.connect!=='function'
    ||publisherPool===reconciliationPool||!Number.isInteger(deadlineMs)||deadlineMs<10||deadlineMs>5000
    ||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>16)
    throw Error('PREAUTH_DURABLE_CONFIGURATION_REQUIRED');
   let active=0;
   const read=input=>{
    const entry=admitted.get(input);
    if(!entry||entry.owner!==owner)throw Error('PREAUTH_ADMISSION_REQUIRED');
    if(Date.now()<entry.observedMs||Date.now()-entry.observedMs>=10000||performance.now()-entry.observedMono>=10000)
     throw Error('PREAUTH_ADMISSION_EXPIRED');
    return entry.event;
   };
   const parameters=event=>[event.eventId,event.observedAt,event.scope,event.stage,event.reasonCode,event.result,event.sourceKind,event.sourceIp];
   const guardSql=`SELECT NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
    OR EXISTS(SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls OR x.rolcreaterole OR x.rolcreatedb OR x.rolreplication
     OR x.rolname IN ('pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend'))
     AND pg_has_role(current_user,x.oid,'MEMBER'))
    OR has_schema_privilege(current_user,'highpass_v3','CREATE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='highpass_v3' AND pg_has_role(current_user,c.relowner,'MEMBER'))) AS safe,
    pg_has_role(current_user,$1,'MEMBER') AND NOT pg_has_role(current_user,$2,'MEMBER')
     AND NOT pg_has_role(current_user,'hp_v3_clinical_policy','MEMBER')
     AND NOT pg_has_role(current_user,'hp_v3_pending_policy','MEMBER') AS permitted
    FROM pg_roles r WHERE r.rolname=current_user`;
   async function run(input,confirm){
    const event=read(input); // Admission must precede capacity and pool access.
    if(active>=maxConcurrent)return 'OVERFLOW';
    active++;
    let client,released=false,live=true,dispatched=false,discard=false,timer;
    const release=destroy=>{if(client&&!released){released=true;client.release(destroy);}};
    const before=confirm?'NOT_CONFIRMED':'NOT_RECORDED';
    const query=(text,values)=>client.query({text,values,query_timeout:deadlineMs});
    const work=(async()=>{
     try{
      client=await (confirm?reconciliationPool:publisherPool).connect();
      // Retain an error listener when destroying a client; never surface raw PG errors.
      if(!guardedClients.has(client)){
       client.on?.('error',()=>{});guardedClients.add(client);
      }
      if(!live){release(true);return before;}
      if(typeof client.getTransactionStatus!=='function'||client.getTransactionStatus()!=='I'){discard=true;return before;}
      read(input);
      const own=confirm?'hp_v3_preauth_reader_policy':'hp_v3_preauth_publisher_policy';
      const other=confirm?'hp_v3_preauth_publisher_policy':'hp_v3_preauth_reader_policy';
      const guard=await query(guardSql,[own,other]);
      if(!live)return before;
      if(guard.rows.length!==1||guard.rows[0].safe!==true||guard.rows[0].permitted!==true)return before;
      if(client.getTransactionStatus()!=='I'){discard=true;return before;}
      read(input);dispatched=true;
      if(confirm){
       const result=await query(`SELECT (observed_at=$2::timestamptz AND scope=$3 AND stage=$4 AND reason_code=$5
        AND result=$6 AND source_kind=$7 AND source_ip IS NOT DISTINCT FROM $8::inet) AS matches
       FROM highpass_v3.preauth_security_events WHERE event_id=$1`,parameters(event));
       if(client.getTransactionStatus()!=='I'){discard=true;return 'OUTCOME_UNKNOWN';}
       if(result.rows.length===0)return 'NOT_CONFIRMED';
       if(result.rows.length!==1||typeof result.rows[0].matches!=='boolean')return 'OUTCOME_UNKNOWN';
       return result.rows[0].matches?'RECORDED_DURABLE':'EVENT_CONFLICT';
      }
      const result=await query(`INSERT INTO highpass_v3.preauth_security_events
       (event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,parameters(event));
      if(client.getTransactionStatus()!=='I'){discard=true;return 'OUTCOME_UNKNOWN';}
      return result.rowCount===1?'RECORDED_DURABLE':'OUTCOME_UNKNOWN';
     }catch(error){
      if(!dispatched)return before;
      if(!confirm&&error.code==='23505')return 'NOT_CONFIRMED';
      if(!confirm&&['23514','42501','22P02','22007','22008'].includes(error.code))return 'NOT_RECORDED';
      discard=true;return 'OUTCOME_UNKNOWN';
     }finally{release(!live||discard);active--;}
    })();
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{
     live=false;release(true);resolve(dispatched?'OUTCOME_UNKNOWN':before);
    },deadlineMs);});
    try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);}
   }
   return registerSink(Object.freeze({record:input=>run(input,false),confirm:input=>run(input,true)}));
  },
  createTestSink({send,deadlineMs=100,maxConcurrent=2,maxEventBytes=1024}={}) {
   if(typeof send!=='function'||!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>1000
    ||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>16
    ||!Number.isInteger(maxEventBytes)||maxEventBytes<1||maxEventBytes>1024)
    throw Error('PREAUTH_TEST_SINK_CONFIGURATION_REQUIRED');
   let active=0;
   return registerSink(Object.freeze({async record(capability){
    const entry=admitted.get(capability);
    if(!entry||entry.owner!==owner)throw Error('PREAUTH_ADMISSION_REQUIRED');
    if(Buffer.byteLength(JSON.stringify(entry.event),'utf8')>maxEventBytes)return outcomes.failed;
    if(active>=maxConcurrent)return outcomes.overflow;
    active++;
    const controller=new AbortController();
    // A non-cooperative send still occupies capacity after its caller times out.
    const operation=Promise.resolve().then(()=>send(entry.event,{signal:controller.signal}))
     .then(()=>outcomes.recorded,()=>outcomes.failed).finally(()=>{active--;});
    let timer;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{
     controller.abort();resolve(outcomes.timeout);
    },deadlineMs);});
    try{return await Promise.race([operation,timeout]);}finally{clearTimeout(timer);}
   }}));
  },
 });
}
