// Actual owned PG lock/termination + real TLS; no fake query results or clock.
export async function checkPreauthOutages({admin,publisher,reader,observer,table,check,send,outcomes,getCallbacks,setSink,normalSink,trustedClient}){
 const baseline=(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
 async function denied(){let code;try{await send(null);}catch(error){code=error.code;}
  return ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED','ECONNRESET'].includes(code);}
 async function blockedPid(){
  const until=Date.now()+1500;
  while(Date.now()<until){
   const row=(await admin.query(`SELECT pid FROM pg_stat_activity WHERE usename='hp_v3_preauth_test_publisher'
    AND wait_event_type='Lock' AND query LIKE 'INSERT INTO highpass_v3.preauth_security_events%' LIMIT 1`)).rows[0];
   if(row)return row.pid;await new Promise(resolve=>setTimeout(resolve,10));
  }
  return null;
 }
 for(const kind of ['timeout','terminate']){
  const lock=await admin.connect();let pid;
  const slow=observer.createDurableSink({publisherPool:publisher,reconciliationPool:reader,deadlineMs:1000,maxConcurrent:1});
  setSink(slow);
  try{
   await lock.query('BEGIN');await lock.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
   const before=outcomes.length,callbacks=getCallbacks();
   check(`actual TLS DENY starts ${kind} PG insert`,await denied());
   pid=await blockedPid();check(`actual ${kind} witness is owned PG INSERT waiting on lock`,Number.isInteger(pid));
   if(kind==='timeout'){
    const burst=await Promise.all([denied(),denied(),denied()]);
    check('actual TLS flood stays DENY without HTTP callbacks',burst.every(Boolean)&&getCallbacks()===callbacks);
    check('actual blocked PG sink rejects burst at capacity',outcomes.length===before+4
     &&(await Promise.all(outcomes.slice(before+1))).every(value=>value==='OVERFLOW'));
    check('actual trusted health remains responsive during blocked PG insertion',await send(trustedClient)===200);
    check('actual dispatched PG timeout is OUTCOME_UNKNOWN',await outcomes[before]==='OUTCOME_UNKNOWN');
   }else{
    check('actual owned blocked publisher backend terminated',(await admin.query('SELECT pg_terminate_backend($1) done',[pid])).rows[0].done===true);
    pid=null;
    check('actual PG backend disconnect keeps delivery unknown and TLS denied',await outcomes[before]==='OUTCOME_UNKNOWN'&&getCallbacks()===callbacks);
   }
  }finally{
   // Kill only the witnessed backend in this owned DB before unlocking; a lost
   // client reply alone does not prove the blocked INSERT cannot later commit.
   if(pid)await admin.query('SELECT pg_terminate_backend($1)',[pid]);
   await lock.query('ROLLBACK');lock.release();setSink(normalSink);
  }
 }
 check('actual terminated blocked operations left no committed event',(await reader.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n===baseline);
 let connections=0;
 const countedPool={async connect(){connections++;return publisher.connect();}};
 const expirySink=observer.createDurableSink({publisherPool:countedPool,reconciliationPool:reader});
 const expiredInput=observer.captureIngressFailure({remoteAddress:'127.0.0.1'}),start=performance.now();
 while(performance.now()-start<10050)await new Promise(resolve=>setTimeout(resolve,50));
 const expired=await expirySink.record(expiredInput).then(()=>false,error=>error.message==='PREAUTH_ADMISSION_EXPIRED');
 check('actual wall and monotonic clock expiry rejects before PG acquisition',expired&&connections===0);
}
