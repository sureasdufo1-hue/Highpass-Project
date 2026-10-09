import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {createSyntheticPreauthObserver} from '../../src/v3-preauth-security-events.js';

export async function createPreauthHttpFixture({admin,base,check}){
 const table='highpass_v3.preauth_security_events';
 const writePassword=randomBytes(32).toString('hex'),readPassword=randomBytes(32).toString('hex');
 await admin.query(`CREATE ROLE hp_v3_preauth_http_publisher LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${writePassword}';
  CREATE ROLE hp_v3_preauth_http_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${readPassword}';
  GRANT hp_v3_preauth_publisher_policy TO hp_v3_preauth_http_publisher;
  GRANT hp_v3_preauth_reader_policy TO hp_v3_preauth_http_reader;`);
 const writer=new Pool({...base,user:'hp_v3_preauth_http_publisher',password:writePassword});
 const reader=new Pool({...base,user:'hp_v3_preauth_http_reader',password:readPassword});
 writer.on('error',()=>{});reader.on('error',()=>{});
 const observer=createSyntheticPreauthObserver({mode:'CAPSTONE_SYNTHETIC_ONLY'});
 // Capacity1 is an explicit owned fault-test configuration, not a runtime change.
 const edgeObserver=observer.createEdgeObserver({sink:observer.createDurableSink({publisherPool:writer,reconciliationPool:reader,maxConcurrent:1})});
 let previous;
 try{previous=(await reader.query(`SELECT event_id FROM ${table}`)).rows.map(row=>row.event_id);}
 catch(error){edgeObserver.dispose();await Promise.all([writer.end(),reader.end()]);throw error;}
 async function waitCount(n){const until=Date.now()+2500;
  while(edgeObserver.observations().length<n&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
  return edgeObserver.observations();}
 const rows=async()=>(await reader.query(`SELECT stage,reason_code,result,source_kind,host(source_ip) ip
  FROM ${table} WHERE NOT(event_id=ANY($1::uuid[]))`,[previous])).rows;
 let expected=0;
 return {
  edgeObserver,
  async settleNext(){
   expected++;
   const history=await waitCount(expected);
   check(`actual sequential HTTP observation ${expected} settles with fixed outcome`,history.length===expected);
  },
  async checkRecorded(){
   const history=await waitCount(10),events=await rows();
   const counts=Object.fromEntries(['RECORDED_DURABLE','NOT_RECORDED','OUTCOME_UNKNOWN','OVERFLOW'].map(value=>[value,history.filter(row=>row.outcome===value).length]));
   check(`actual HTTP rejection branches each store one minimal preauth row (${events.length} rows / ${JSON.stringify(counts)})`,events.length===10&&history.length===10
    &&history.every(row=>row.outcome==='RECORDED_DURABLE'));
   check('actual HTTP preauth fixed stage reasons and immediate socket ignore spoofed forwarding',events.every(row=>
    row.result==='DENY'&&row.source_kind==='IMMEDIATE_SOCKET'&&row.ip==='127.0.0.1'
    &&({INGRESS:'INGRESS_REJECTED',HUMAN_AUTH:'HUMAN_AUTH_REJECTED',MOCK_ASSURANCE:'MOCK_ASSURANCE_REQUIRED'})[row.stage]===row.reason_code)
    &&events.filter(e=>e.stage==='INGRESS').length===5&&events.filter(e=>e.stage==='HUMAN_AUTH').length===2
    &&events.filter(e=>e.stage==='MOCK_ASSURANCE').length===3);
  },
  async checkFailure(send){
   const before=(await rows()).length,n=edgeObserver.observations().length;
   const columns='event_id,observed_at,scope,stage,reason_code,result,source_kind,source_ip';
   await admin.query(`REVOKE INSERT(${columns}) ON ${table} FROM hp_v3_preauth_publisher_policy`);
   try{
    check('actual HTTP safe403 survives real preauth PG write rejection',(await send()).status===403);
    const history=await waitCount(n+1);
    check('actual HTTP write rejection is explicitly NOT_RECORDED not durable success',history.length===n+1
     &&history.at(-1).outcome==='NOT_RECORDED'&&(await rows()).length===before);
   }finally{await admin.query(`GRANT INSERT(${columns}) ON ${table} TO hp_v3_preauth_publisher_policy`);}
  },
  async checkOutages({sendDenied,sendHealthy,domainCounts}){
   const domainBefore=JSON.stringify(await domainCounts()),baseline=(await rows()).length;
   const changed=async last=>{const until=Date.now()+2500;
    while(edgeObserver.observations().at(-1)===last&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    return edgeObserver.observations().at(-1);};
   const witness=async()=>{const until=Date.now()+1500;
    while(Date.now()<until){
     const row=(await admin.query(`SELECT pid FROM pg_stat_activity WHERE usename='hp_v3_preauth_http_publisher'
      AND wait_event_type='Lock' AND query LIKE 'INSERT INTO highpass_v3.preauth_security_events%' LIMIT 1`)).rows[0];
     if(row)return row.pid;await new Promise(resolve=>setTimeout(resolve,10));
    }return null;};
   for(const kind of ['timeout','terminate']){
    const lock=await admin.connect();let pid;
    try{
     await lock.query('BEGIN');await lock.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
     const last=edgeObserver.observations().at(-1);
     check(`actual HTTP ${kind} returns403 before PG storage completes`,(await sendDenied()).status===403
      &&edgeObserver.observations().at(-1)===last);
     pid=await witness();check(`actual HTTP ${kind} witnesses owned INSERT blocked on PG lock`,Number.isInteger(pid));
     if(kind==='timeout'){
      const burst=await Promise.all([sendDenied(),sendDenied(),sendDenied()]);
      check('actual HTTP blocked publisher burst remains403',burst.every(out=>out.status===403));
      check('actual HTTP blocked publisher burst explicitly OVERFLOW',edgeObserver.observations().slice(-3).every(row=>row.outcome==='OVERFLOW'));
      check('actual separate synthetic HTTPS health stays200 during PG event lock',(await sendHealthy()).status===200);
      const afterBurst=edgeObserver.observations().at(-1),outcome=await changed(afterBurst);
      check('actual HTTP dispatched timeout is OUTCOME_UNKNOWN',outcome?.outcome==='OUTCOME_UNKNOWN');
     }else{
      check('actual HTTP witnessed publisher backend termination succeeds',(await admin.query('SELECT pg_terminate_backend($1) done',[pid])).rows[0].done===true);
      pid=null;
      check('actual HTTP backend disconnect is OUTCOME_UNKNOWN',(await changed(last))?.outcome==='OUTCOME_UNKNOWN');
     }
    }finally{
     // Absence of a row is proven only after this owned intervention, not timeout.
     if(pid)await admin.query('SELECT pg_terminate_backend($1)',[pid]);
     await lock.query('ROLLBACK');lock.release();
    }
    check(`actual HTTP ${kind} explicit intervention leaves no extra committed row`,(await rows()).length===baseline);
   }
   const last=edgeObserver.observations().at(-1);
   check('actual HTTP fresh rejection after PG recovery remains403',(await sendDenied()).status===403);
   check('actual HTTP recovery durably stores fresh event',(await changed(last))?.outcome==='RECORDED_DURABLE'&&(await rows()).length===baseline+1);
   edgeObserver.dispose();const disposedLast=edgeObserver.observations().at(-1);
   check('actual HTTP disposed emitter still denies403',(await sendDenied()).status===403);
   check('actual HTTP disposed emitter records NOT_RECORDED without new row',(await changed(disposedLast))?.outcome==='NOT_RECORDED'&&(await rows()).length===baseline+1);
   check('actual HTTP outage matrix leaves domain and ledger unchanged',JSON.stringify(await domainCounts())===domainBefore);
   check('actual HTTP outage history bounded at16 safe entries',edgeObserver.observations().length===16
    &&edgeObserver.observations().every(row=>Object.keys(row).sort().join(',')==='outcome,stage'));
  },
  async dispose(){edgeObserver.dispose();await Promise.all([writer.end(),reader.end()]);},
 };
}
