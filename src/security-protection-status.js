import {readFile} from 'node:fs/promises';
const KEYS=new Set(['storage','disk','fields','vault','roles','diagnostics']);
export function validateProtectionSnapshot(value,now=Date.now()){
 if(!value||value.schemaVersion!==1||!Array.isArray(value.checks))return {status:'UNAVAILABLE',checks:[]};
 const checks=value.checks.filter(x=>KEYS.has(x.id)&&['PASS','REVIEW','UNKNOWN'].includes(x.status)&&Number.isFinite(Date.parse(x.observedAt)))
  .map(x=>({id:x.id,status:x.status,observedAt:x.observedAt,stale:now-Date.parse(x.observedAt)>86400000,
   // Operator-produced metadata only, no identities or secrets in the schema.
   summary:typeof x.summary==='string'?x.summary.slice(0,600):'확인 내용 없음',source:typeof x.source==='string'?x.source.slice(0,120):'운영 조회'}));
 return {status:checks.length?'AVAILABLE':'UNAVAILABLE',checks};
}
export async function protectionStatus(store,{load=()=>readFile('/run/security-protection/status.json','utf8'),now=Date.now}={}){
 let snapshot;try{snapshot=validateProtectionSnapshot(JSON.parse(await load()),now());}catch{snapshot={status:'UNAVAILABLE',checks:[]};}
 let database={status:'UNKNOWN',observedAt:new Date(now()).toISOString()};
 if(store.client)try{
  const result=await store.client.query("SELECT s.ssl,s.version,current_setting('ssl') AS server_ssl FROM pg_stat_ssl s WHERE s.pid=pg_backend_pid()");
  const row=result.rows[0];database={...database,status:row?.ssl===true?'PASS':'REVIEW',tls:row?.ssl??null,version:row?.version??null,serverSsl:row?.server_ssl??null,scope:'현재 Control API DB 연결'};
 }catch{database.status='UNAVAILABLE';}
 return {observedAt:new Date(now()).toISOString(),snapshot,database};
}
