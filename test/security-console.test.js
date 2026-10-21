import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventIndex, parseEventQuery, createSecurityReport } from '../src/security-console.js';
import { reportCsv } from '../public/ui/security-console.js';
import { startIsolatedServer, boundedFetch } from '../scripts/test-support/isolated-server.js';
const now = new Date('2026-10-14T08:00:00Z');
const logs = Array.from({length: 250},(_,i)=>({auditId:`AUD-${i}`,auditSessionId:'run-1',actorId:'test-operator',actorType:'DOCTOR',hospitalId:'HOSP-B',action:'TOKEN_ISSUED',result:i%2?'DENIED':'SUCCESS',reasonCode:i%2?'TOKEN_EXPIRED':'OK',createdAt:'2026-10-14T07:00:00Z',token:'must-never-export'}));
const azure = {status:'unavailable',reason:'AUDIT_RELAY_UNAVAILABLE',events:[]};
test('charts aggregate all 250 stored events before pagination or search',()=>{
  const index=buildEventIndex(logs,azure,[],parseEventQuery(new URLSearchParams('result=DENIED&page=1'),now));
  assert.equal(index.chart.total,250);assert.equal(index.chart.denied,125);assert.equal(index.total,125);assert.equal(index.events.length,30);
  assert.equal(index.sources.azure.status,'unavailable');assert.equal(JSON.stringify(index).includes('must-never-export'),false);
});
test('bounded fixed queries reject duplicate filters, future timestamps, arbitrary sources and long input',()=>{
  for(const query of ['q=a&q=b','until=2027-01-01','source=OTHER','page=-1','sql=select','q='+ 'a'.repeat(121)])assert.throws(()=>parseEventQuery(new URLSearchParams(query),now));
});
test('reports resolve only real safe references and include source limits and content fingerprint',()=>{
  const index=buildEventIndex(logs,azure,[],parseEventQuery(new URLSearchParams(),now));
  const body={format:'CSV',events:[{source:'APP',eventRef:'AUD-1'}]};
  const report=createSecurityReport(index,body,'operator');assert.equal(report.status,'DRAFT');assert.equal(report.fingerprint.length,64);assert.equal(report.events[0].reasonCode,'TOKEN_EXPIRED');
  assert.throws(()=>createSecurityReport(index,{...body,events:[{source:'APP',eventRef:'forged'}]},'operator'));
  assert.throws(()=>createSecurityReport(index,{...body,events:[body.events[0],body.events[0]]},'operator'));
  report.events[0].action='=HYPERLINK("https://invalid")';assert.match(reportCsv(report),/'=HYPERLINK/);
});
test('search sessions and review filters retain causal boundaries',()=>{
  const reviews=[{source:'APP',eventRef:'AUD-1',status:'REVIEWED',note:'확인 완료'}];
  const index=buildEventIndex(logs,azure,reviews,parseEventQuery(new URLSearchParams('session=run-1&review=REVIEWED'),now));
  assert.equal(index.total,1);assert.equal(index.chart.unreviewed,124);assert.equal(index.events[0].review.note,'확인 완료');
  assert.equal(buildEventIndex(logs,azure,[],parseEventQuery(new URLSearchParams('session=another'),now)).total,0);
});
test('events and report endpoints enforce roles and record report generation without altering evidence', {timeout:20000},async t=>{
  const base=await startIsolatedServer(t);const admin={'x-hipass-role':'SECURITY_ADMIN','x-hipass-user-id':'synthetic-security-auditor'};
  for(const path of ['/api/security/events','/api/security/reports','/api/security/protection']){
    const options=path.endsWith('reports')?{method:'POST',headers:{'content-type':'application/json'},body:'{}'}:{};
    assert.equal((await boundedFetch(base+path,options)).status,401);
    assert.equal((await boundedFetch(base+path,{...options,headers:{...options.headers,'x-hipass-role':'PATIENT','x-hipass-user-id':'test-patient','x-hipass-patient-id':'SYNTHETIC-P1'}})).status,403);
    assert.equal((await boundedFetch(base+path,{...options,headers:{...options.headers,'x-hipass-role':'DOCTOR','x-hipass-user-id':'test-doctor','x-hipass-doctor-id':'DOC-B-01','x-hipass-hospital-id':'HOSP-B'}})).status,403);
  }
  assert.equal((await boundedFetch(base+'/api/security/events?q=a&q=b',{headers:admin})).status,400);
  const protection=await boundedFetch(base+'/api/security/protection',{headers:admin});assert.equal(protection.status,200);assert.equal(protection.headers.get('cache-control'),'no-store');assert.equal((await boundedFetch(base+'/api/security/protection?path=arbitrary',{headers:admin})).status,400);
  const response=await boundedFetch(base+'/api/security/events',{headers:admin});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const index=await response.json();assert.ok(index.events.length);assert.equal(index.allEvents,undefined);
  const event=index.events[0];const request={method:'POST',headers:{...admin,'content-type':'application/json'},body:JSON.stringify({format:'JSON',events:[{source:'APP',eventRef:event.eventRef}]})};
  const exported=await boundedFetch(base+'/api/security/reports?until='+encodeURIComponent(index.until),request);assert.equal(exported.status,201);const report=await exported.json();assert.equal(report.events[0].eventRef,event.eventRef);assert.equal(report.status,'DRAFT');
  const after=await(await boundedFetch(base+'/api/security/events',{headers:admin})).json();assert.ok(after.events.some(event=>event.action==='SECURITY_REPORT_GENERATED'));assert.ok(after.events.some(item=>item.eventRef===event.eventRef));
  request.body=JSON.stringify({format:'JSON',events:[{source:'APP',eventRef:'forged'}]});assert.equal((await boundedFetch(base+'/api/security/reports',request)).status,409);
});
