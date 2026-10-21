import {createHash} from 'node:crypto';
import {safeHelperMetadata} from './helper-audit-metadata.js';
export function helperRequestDetails(events){
 const groups=new Map();for(const e of events){if(e.action!=='HEALTH_HELPER_REQUEST'||!e.auditSessionId||e.auditSessionId==='UNKNOWN')continue;if(!groups.has(e.auditSessionId))groups.set(e.auditSessionId,[]);groups.get(e.auditSessionId).push(e);}
 const rows=[...groups].map(([requestId,logs])=>{logs.sort((a,b)=>a.time.localeCompare(b.time));const start=logs.find(e=>e.reasonCode.endsWith('_STARTED')),end=logs.filter(e=>!e.reasonCode.endsWith('_STARTED')).at(-1),ms=start&&end?Date.parse(end.time)-Date.parse(start.time):null;
 return {requestId,startedAt:start?.time??null,endedAt:end?.time??null,lastAt:logs.at(-1).time,durationMs:ms!==null&&ms>=0?ms:null,result:end?.result??'PENDING',reasonCode:end?.reasonCode??'TERMINAL_EVENT_MISSING',metadata:safeHelperMetadata(end?.helperMetadata),stages:logs.map(e=>({time:e.time,reasonCode:e.reasonCode,result:e.result,eventRef:e.eventRef}))};}).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));
 return {total:rows.length,rows:rows.slice(0,100),truncated:rows.length>100};
}
export const QR_STAGES={TICKET_ISSUED:'ISSUED',TICKET_STATUS_VIEWED:'VIEWED',TICKET_REDEEMED:'USED',TICKET_REVOKED:'REVOKED',TICKET_DENIED:'DENIED'};
export function qrLifecycle(events){
 const logs=events.filter(e=>e.action.startsWith('TICKET_')),counts={ISSUED:0,VIEWED:0,USED:0,REVOKED:0,DENIED:0,OTHER:0},groups=new Map();let unlinked=0;
 for(const e of logs){const stage=QR_STAGES[e.action]??'OTHER';counts[stage]++;if(!e.ticketRef){unlinked++;continue;}if(!groups.has(e.ticketRef))groups.set(e.ticketRef,[]);groups.get(e.ticketRef).push({...e,stage});}
 return {counts,logCount:logs.length,unlinked,groups:[...groups].map(([ticketRef,rows])=>{rows.sort((a,b)=>a.time.localeCompare(b.time));return {ticketRef,lastAt:rows.at(-1).time,steps:rows.map(e=>({stage:e.stage,time:e.time,reasonCode:e.reasonCode,result:e.result,eventRef:e.eventRef}))};}).sort((a,b)=>b.lastAt.localeCompare(a.lastAt)).slice(0,30)};
}
export const ticketReference=v=>typeof v==='string'&&v.length<=160?'QR-'+createHash('sha256').update(v).digest('hex').slice(0,16):null;
