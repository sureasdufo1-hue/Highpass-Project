import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeHelper,probeHelper} from '../src/security-helper-monitor.js';
import {eventCategory} from '../src/security-console.js';
const row=(id,reason,result='SUCCESS',time='2026-10-19T01:00:00Z')=>({action:'HEALTH_HELPER_REQUEST',auditSessionId:id,reasonCode:reason,result,time});
test('helper groups requests, separates safety responses and never treats start as completion',()=>{
 const data=summarizeHelper([row('a','HELPER_TRANSLATION_RAG_STARTED'),row('a','HELPER_TRANSLATION_ANSWER_GENERATED','SUCCESS','2026-10-19T01:00:02Z'),row('b','HELPER_CLINICAL_REQUEST_REFUSED'),row('c','HELPER_MODEL_TIMEOUT','FAIL'),row('d','HELPER_TRANSLATION_RAG_STARTED'),row('UNKNOWN','HELPER_INPUT_INVALID','FAIL')]);
 assert.equal(data.requestCount,4);assert.equal(data.logCount,6);assert.equal(data.unlinked,1);assert.deepEqual(data.counts,{generated:1,evidence:0,safe:1,failed:1,unknown:1});assert.equal(data.medianMs,2000);assert.equal(data.pairedCount,1);
});
test('missing paired logs do not invent timing and monitor events are not requests',()=>{
 const result=summarizeHelper([{...row('a','HELPER_CONNECTION_UNAVAILABLE'),action:'HEALTH_HELPER_CONNECTION_CHECK'},row('b','HELPER_TRANSLATION_EVIDENCE_DELIVERED')]);assert.equal(result.requestCount,1);assert.equal(result.medianMs,null);assert.equal(result.counts.evidence,1);assert.equal(eventCategory('HEALTH_HELPER_REQUEST'),'건강도우미');
});
test('unconfigured monitor cannot accept arbitrary destination',async()=>{
 const result=await probeHelper({HIPASS_HEALTH_HELPER_MODEL:'ollama',HIPASS_HELPER_SOCKET:'http://example.com'});assert.equal(result.transport,'NOT_CONFIGURED');assert.equal(result.model,'UNKNOWN');
});
