import test from "node:test";
import assert from "node:assert/strict";
import { runBrowserLivePolicyGate } from "../scripts/browser-live-policy-gate.js";

const origin = "https://192.168.111.149:9443";
const profiles = { PATIENT: "synthetic-patient-fixture", DOCTOR: "synthetic-doctor-fixture" };
const clientFor = values => ({
  calls: [],
  async send(method, params) {
    this.calls.push({method, params});
    const value = values.shift();
    if (value instanceof Error) throw value;
    return value?.exceptionDetails ? value : {result:{value}};
  }
});

test("live policy orchestrator returns only safe checks and renews expired Mock IdP for owned cleanup", async () => {
  const client=clientFor([
    {checks:[{test:"INITIAL",status:"PASS"}],consentWaitMs:0},
    {checks:[{test:"CONSENT_EXPIRY",status:"PASS"}],tokenWaitMs:0},
    {test:"REAL_TOKEN_EXPIRY",status:"PASS"},
    {ok:true},
    {status:"PASS"}
  ]);
  let renewed=false;
  const result=await runBrowserLivePolicyGate(client,profiles,origin,async()=>{renewed=true;return profiles;});
  assert.equal(result.result,"PASS");
  assert.equal(renewed,true);
  assert.equal(result.checks.length,4);
  assert.equal(JSON.stringify(result).includes(profiles.PATIENT),false);
  assert.match(client.calls.at(-1).params.expression,/delete window/);
  assert.match(client.calls[0].params.expression,/generateKey.+false/);
});

test("live policy network/evaluation failure is not accepted as a DENY and still removes owned memory", async () => {
  const client=clientFor([new Error("secret-bearing upstream failure"),{status:"NOT VERIFIED"}]);
  const result=await runBrowserLivePolicyGate(client,profiles,origin);
  assert.equal(result.result,"NOT VERIFIED");
  assert.equal(result.checks[0].status,"NOT VERIFIED");
  assert.equal(JSON.stringify(result).includes("secret-bearing"),false);
  assert.match(client.calls.at(-1).params.expression,/delete window/);
});

test("unbounded wait or unknown origin does not proceed as successful expiry evidence", async () => {
  const client=clientFor([{checks:[],consentWaitMs:Infinity},{status:"PASS"}]);
  const result=await runBrowserLivePolicyGate(client,profiles,origin);
  assert.equal(result.result,"NOT VERIFIED");
  await assert.rejects(runBrowserLivePolicyGate(client,profiles,"https://unapproved.invalid"),/CONTEXT_REQUIRED/);
});
