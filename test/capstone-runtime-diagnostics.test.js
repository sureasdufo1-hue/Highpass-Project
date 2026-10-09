import test from "node:test";
import assert from "node:assert/strict";
import { beginRuntimeDiagnostic, createRuntimeDiagnosticFactory } from "../src/capstone-runtime-diagnostics.js";
import { createDataPlaneHandler } from "../src/data-plane-gateway.js";

test("runtime metrics are opt-in, fixed-schema, idempotent and never include arbitrary exception/request content",()=>{
  const records=[], write=record=>records.push(record);
  createRuntimeDiagnosticFactory({},write)().finish(503,new Error("secret token patient fixture"));
  assert.equal(records.length,0);
  const diagnostic=createRuntimeDiagnosticFactory({CAPSTONE_RUNTIME_DIAGNOSTICS:"1"},write)();
  diagnostic.stage("unsafe secret path");
  diagnostic.finish(503,new Error("secret token patient fixture"));
  diagnostic.finish(200);
  assert.equal(records.length,1);
  assert.deepEqual(Object.keys(records[0]).sort(),["code","elapsedMs","event","httpStatus","stage","traceId"].sort());
  assert.equal(records[0].stage,"REQUEST");
  assert.equal(records[0].code,"UNCLASSIFIED_FAILURE");
  assert.equal(JSON.stringify(records).includes("secret"),false);
  assert.ok(records[0].elapsedMs>=0);
  assert.doesNotThrow(()=>createRuntimeDiagnosticFactory({CAPSTONE_RUNTIME_DIAGNOSTICS:"1"},()=>{throw new Error();})().finish(503));
  assert.doesNotThrow(()=>beginRuntimeDiagnostic(()=>{throw new Error();}).finish(503));
});

test("Gateway timeout diagnostics preserve generic fail-closed HTTP response and never fetch PACS",async()=>{
  const records=[];
  const handler=createDataPlaneHandler({publicBaseUrl:"https://a.test",controlOrigin:"https://control.test",orthancOrigin:"https://pacs.test",serviceToken:"test-only-service-credential-of-at-least-32-chars",diagnosticFactory:createRuntimeDiagnosticFactory({CAPSTONE_RUNTIME_DIAGNOSTICS:"1"},record=>records.push(record)),transport:async origin=>{
    assert.equal(origin,"https://control.test");
    throw Object.assign(new Error("raw secret-bearing upstream exception"),{code:"ETIMEDOUT"});
  }});
  const response={destroyed:false,writeHead(status){this.status=status;},end(body){this.body=body;}};
  await handler({method:"GET",url:"/dicomweb/studies",headers:{authorization:"DPoP test.token.signature"},socket:{remoteAddress:"192.0.2.1"}},response);
  assert.equal(response.status,503);
  assert.equal(JSON.parse(response.body).error,"DATA_PLANE_UNAVAILABLE");
  assert.equal(records[0].stage,"CONTROL_AUTHORIZATION");
  assert.equal(records[0].code,"ETIMEDOUT");
  assert.equal(JSON.stringify(records).includes("raw secret"),false);
});
