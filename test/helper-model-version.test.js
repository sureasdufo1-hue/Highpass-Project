import test from 'node:test';import assert from 'node:assert/strict';
import {modelSnapshot,verifyModelVersion,HELPER_MODEL} from '../src/helper-model-version.js';
import {helperResultMetadata} from '../src/helper-audit-metadata.js';
import {buildAuditLog} from '../src/services.js';
import {HealthHelperRag} from '../src/health-helper-rag.js';
const digest='a'.repeat(64);
test('model snapshot reads only the fixed local model and validates digest',async()=>{
 assert.equal(await modelSnapshot(async(url,options)=>{assert.equal(url,'http://127.0.0.1:11434/api/ps');assert.equal(options.redirect,'error');return new Response(JSON.stringify({models:[{name:HELPER_MODEL,digest}]}));},{loaded:true}),digest);
 await assert.rejects(()=>modelSnapshot(async()=>new Response(JSON.stringify({models:[{name:HELPER_MODEL,digest:'private text'}]}))),/MODEL_VERSION_UNVERIFIED/);
});
test('changed tags, unverified loaded weights and wrong response model are rejected',()=>{
 assert.equal(verifyModelVersion(digest,digest,digest,{model:HELPER_MODEL}),digest);
 for(const args of [[digest,'b'.repeat(64),digest,{model:HELPER_MODEL}],[digest,digest,null,{model:HELPER_MODEL}],[digest,digest,digest,{model:'other'}]])assert.throws(()=>verifyModelVersion(...args),/MODEL_VERSION_CHANGED/);
});
test('actual weights digest participates in metadata without prompts',()=>{
 const m=helperResultMetadata({modelVersion:digest,generationUsed:true,sources:[{id:'source'}],question:'secret'},HELPER_MODEL);
 assert.equal(m.modelVersion,digest);assert.equal(m.sourceCount,1);assert.ok(!JSON.stringify(m).includes('secret'));
});
test('weights version changes audit record hash',()=>{
 const input={action:'HEALTH_HELPER_REQUEST',actorId:'synthetic',actorType:'PATIENT',auditSessionId:'r',result:'SUCCESS',reasonCode:'HELPER_TRANSLATION_ANSWER_GENERATED'};
 const make=v=>buildAuditLog({...input,helperMetadata:{modelVersion:v,generationUsed:true}},null,'2026-10-20T00:00:00Z','a');
 assert.notEqual(make(digest).recordHash,make('b'.repeat(64)).recordHash);
});
test('actual translation completion preserves verified version in audit metadata',async()=>{
 const logs=[];const helper=new HealthHelperRag({audit:async x=>logs.push(x),translationRag:async()=>({generationUsed:true,modelVersion:digest,sources:[{id:'s'}]})});
 await helper.ask({role:'PATIENT',subject:'synthetic',patientId:'synthetic'},{question:'AFP 목적'});
 assert.equal(logs.at(-1).helperMetadata.modelVersion,digest);
});
