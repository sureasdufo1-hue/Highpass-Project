import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import vm from "node:vm";

function fixture(stage = "PREPARE_INFLIGHT_REVOKE") {
  const source = readFileSync(new URL("../scripts/capstone-encrypted-negatives-probe.js", import.meta.url), "utf8");
  const start = source.indexOf("function makeDiagnosticAgent()");
  const end = source.indexOf("const diagnosticAgent =", start);
  const options = { keepAlive: true, timeout: 5000, scheduling: "lifo" };
  class Agent {
    constructor(value) { this.options = value; }
    addRequest(request, passed) { request.originalOptions = passed; }
  }
  const context = vm.createContext({ https: { Agent, globalAgent: { options } },
    stage, transportDiagnostics: [], performance });
  vm.runInContext(source.slice(start, end) + "\nagent = makeDiagnosticAgent();", context);
  return { context, options };
}

test("probe phase telemetry preserves agent/request options, removes socket listeners and emits no request content", () => {
  const { context, options } = fixture();
  assert.equal(context.agent.options, options);
  const request = new EventEmitter(), socket = new EventEmitter(), response = new EventEmitter();
  const passed = { headers: { authorization: "test-only-sensitive" }, rejectUnauthorized: true, minVersion: "TLSv1.2" };
  context.agent.addRequest(request, passed);
  assert.equal(request.originalOptions, passed);
  request.emit("socket", socket);
  socket.emit("lookup"); socket.emit("connect");
  socket.authorized = true; socket.emit("secureConnect");
  response.statusCode = 200; request.emit("response", response);
  response.emit("end"); request.emit("close");
  const row = context.transportDiagnostics[0];
  assert.equal(row.phase, "RESPONSE_COMPLETE");
  assert.equal(row.tlsVerified, true);
  assert.equal(row.responseStatus, 200);
  assert.equal(socket.listenerCount("lookup") + socket.listenerCount("connect") + socket.listenerCount("secureConnect"), 0);
  assert.equal(JSON.stringify(row).includes("test-only-sensitive"), false);
});

test("timeout retains last phase, sanitizes errors/operation and bounds diagnostic rows", () => {
  const { context } = fixture("private-secret-not-an-operation");
  for (let index = 0; index < 70; index++) {
    const request = new EventEmitter(), socket = new EventEmitter();
    request.reusedSocket = true; socket.authorized = true;
    context.agent.addRequest(request, {});
    request.emit("socket", socket);
    request.emit("error", { code: index === 69 ? "ETIMEDOUT" : "private-secret", message: "private-message" });
    request.emit("close");
  }
  assert.equal(context.transportDiagnostics.length, 64);
  const row = context.transportDiagnostics.at(-1);
  assert.equal(row.operation, "OTHER");
  assert.equal(row.phase, "SOCKET_ASSIGNED");
  assert.equal(row.errorCode, "ETIMEDOUT");
  assert.equal(row.reusedSocket, true);
  assert.equal(row.tlsVerified, true);
  assert.equal(JSON.stringify(context.transportDiagnostics).includes("private-"), false);
});
