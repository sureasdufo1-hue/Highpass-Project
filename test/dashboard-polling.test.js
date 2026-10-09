import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function fixture(fetchDashboardSnapshot) {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function loadDashboard(options = {})");
  const end = source.indexOf("async function fetchDashboardSnapshot", start);
  assert.ok(end > start, "dashboard polling needs a tracked bounded snapshot wrapper");
  const context = vm.createContext({ dashboardLoadsInFlight: 0, consentMutationPending: false, tokenRequestPending: false, fetchDashboardSnapshot });
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("background ticks cannot stack snapshot requests while a prior refresh is pending", async () => {
  let release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const context = fixture(async () => { calls++; await pending; });
  const first = vm.runInContext("loadDashboard({background:true})", context);
  await vm.runInContext("loadDashboard({background:true})", context);
  await vm.runInContext("loadDashboard({background:true})", context);
  assert.equal(calls, 1);
  release(); await first;
  assert.equal(context.dashboardLoadsInFlight, 0);
});

test("post-mutation foreground refresh is not replaced by an old background response", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const context = fixture(async options => { calls.push(options.background === true); if (options.background) await pending; });
  const old = vm.runInContext("loadDashboard({background:true})", context);
  await vm.runInContext("loadDashboard()", context);
  assert.deepEqual(calls, [true, false]);
  release(); await old;
  assert.equal(context.dashboardLoadsInFlight, 0);
});

test("failed snapshot releases the polling guard and never converts error into success", async () => {
  const context = fixture(async () => { throw new Error("fixed synthetic failure"); });
  await assert.rejects(vm.runInContext("loadDashboard({background:true})", context), /fixed synthetic failure/);
  assert.equal(context.dashboardLoadsInFlight, 0);
});

test("background ticks yield to consent mutations and token issuance", async () => {
  let calls = 0;
  const context = fixture(async () => { calls++; });
  for (const flag of ["consentMutationPending", "tokenRequestPending"]) {
    context[flag] = true;
    await vm.runInContext("loadDashboard({background:true})", context);
    context[flag] = false;
  }
  assert.equal(calls, 0);
  await vm.runInContext("loadDashboard()", context);
  assert.equal(calls, 1);
});

function readsFixture(fetchJson) {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function fetchDashboardReads(");
  assert.ok(start > 0);
  const end = source.indexOf("// FHIR R4", start);
  const context = vm.createContext({ fetchJson, consentMutationPending: false, tokenRequestPending: false });
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test("background metadata reads cap concurrency at two and preserve response order", async () => {
  let active = 0, maximum = 0;
  const context = readsFixture(async path => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, path === "a" ? 12 : 2));
    active--; return path;
  });
  const result = await vm.runInContext("fetchDashboardReads(['a','b','c','d','e','f','g'],true)", context);
  assert.deepEqual([...result], ["a", "b", "c", "d", "e", "f", "g"]);
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});

test("interactive operations interrupt queued background reads but drain started reads", async () => {
  const releases = [], calls = [];
  const context = readsFixture(path => { calls.push(path); return new Promise(resolve => releases.push(resolve)); });
  const pending = vm.runInContext("fetchDashboardReads(['a','b','c','d'],true)", context);
  let finished = false;
  const checked = assert.rejects(pending, /DASHBOARD_BACKGROUND_INTERRUPTED/).then(() => { finished = true; });
  assert.deepEqual(calls, ["a", "b"]);
  context.tokenRequestPending = true;
  releases[0]("a"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  assert.deepEqual(calls, ["a", "b"]);
  releases[1]("b"); await checked;
  assert.equal(finished, true);
});

test("failed background reads stop queued launches and drain peers without partial success", async () => {
  let release, reject, finished = false;
  const calls = [];
  const context = readsFixture(path => {
    calls.push(path);
    return new Promise((resolve, fail) => { if (path === "a") reject = fail; else release = resolve; });
  });
  const pending = vm.runInContext("fetchDashboardReads(['a','b','c'],true)", context);
  const checked = assert.rejects(pending, /synthetic failure/).then(() => { finished = true; });
  reject(new Error("synthetic failure")); await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  assert.deepEqual(calls, ["a", "b"]);
  release("b"); await checked;
});

test("foreground snapshot performs independent reads even while an interactive flag is set", async () => {
  const calls = [];
  const context = readsFixture(async path => { calls.push(path); return path; });
  context.consentMutationPending = true;
  const result = await vm.runInContext("fetchDashboardReads(['a','b','c'],false)", context);
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.deepEqual([...result], calls);
});

test("even a falsy rejection cannot be converted into a successful partial snapshot", async () => {
  const context = readsFixture(async () => { throw undefined; });
  await assert.rejects(vm.runInContext("fetchDashboardReads(['a','b','c'],true)", context));
});
