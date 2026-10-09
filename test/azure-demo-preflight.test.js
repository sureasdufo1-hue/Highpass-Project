import test from "node:test";
import assert from "node:assert/strict";
import { azureDemoPreflight, runAzureJson, azureInvocation } from "../scripts/azure-demo-preflight.js";

const id = "11111111-2222-3333-4444-555555555555";
const env = { HIPASS_AZURE_SUBSCRIPTION_ID: id, HIPASS_AZURE_BUDGET_USD: "100" };
const successfulRead = async (args) => args[0] === "version" ? { "azure-cli": "synthetic-version" } : args[0] === "account" ? { id, state: "Enabled", user: { name: "must-not-be-output" } } : { namespace: args[3], registrationState: "Registered" };

test("Windows Azure REST URLs and queries remain literal native arguments, without cmd/powershell", () => {
  const args = ["rest", "--url", "https://management.azure.com/example?api-version=2021-07-01&%24filter=x", "--query", "value[?name=='Standard_B2s']", "--body", '{"value":"$(); & echo no"}'];
  const command = "C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe";
  const result = azureInvocation(args, { platform: "win32", exists: (candidate) => candidate === command });
  assert.equal(result.command, command);
  assert.deepEqual(result.args, ["-IBm", "azure.cli", ...args]);
  assert.throws(() => azureInvocation(args, { platform: "win32", exists: () => false }), /AZURE_CLI_RUNTIME_UNAVAILABLE/u);
  assert.throws(() => azureInvocation(["rest", "bad\0arg"]), /AZURE_READ_ARGUMENTS_INVALID/u);
});

test("CLI invocation rejects unbounded timeout and output settings before spawning", async () => {
  for (const options of [{ timeoutMs: Infinity }, { timeoutMs: 0 }, { timeoutMs: 30001 }, { maxOutputBytes: Infinity }, { maxOutputBytes: 0 }]) {
    await assert.rejects(runAzureJson(["version"], options), /AZURE_READ_LIMITS_INVALID/u);
  }
});

test("explicit subscription and providers do not imply deployed crypto or overall PASS", async () => {
  const calls = [];
  const result = await azureDemoPreflight({ env, run: async (args) => { calls.push(args); return successfulRead(args); } });
  assert.equal(result.status, "NOT VERIFIED");
  assert.equal(result.deploymentVerified, false);
  assert.equal(result.reviewStatus, "DRAFT / UNASSIGNED");
  assert.equal(result.checks.filter((item) => item.status === "PASS").length, 7);
  assert.ok(calls.slice(1).every((args) => args.includes("--subscription") && args.includes(id)));
  assert.ok(calls.every((args) => ["version", "account", "provider"].includes(args[0])));
  assert.ok(calls.filter((args) => args[0] === "provider").every((args) => args.includes("{namespace:namespace,registrationState:registrationState}")));
  assert.ok(!JSON.stringify(result).includes(id));
  assert.ok(!JSON.stringify(result).includes("must-not-be-output"));
});

test("missing CLI is environment blocked and raw diagnostic secrets are suppressed", async () => {
  const result = await azureDemoPreflight({ env, run: async () => { throw new Error("token-secret-example"); } });
  assert.equal(result.status, "ENVIRONMENT BLOCKED");
  assert.ok(!JSON.stringify(result).includes("token-secret-example"));
});

test("never fall back to default subscription or pass unvalidated targets", async () => {
  for (const subscription of [undefined, "name", "';Remove-Item"] ) {
    const calls = [];
    const result = await azureDemoPreflight({ env: { ...env, HIPASS_AZURE_SUBSCRIPTION_ID: subscription }, run: async (args) => { calls.push(args); return successfulRead(args); } });
    assert.equal(calls.length, 1);
    assert.equal(result.checks.find((item) => item.name === "explicit-subscription").status, "NOT VERIFIED");
  }
});

test("mismatched or disabled subscription fails and prevents provider reads", async () => {
  for (const account of [{ id: "different", state: "Enabled" }, { id, state: "Disabled" }]) {
    let calls = 0;
    const result = await azureDemoPreflight({ env, run: async (args) => { calls++; return args[0] === "version" ? { "azure-cli": "test" } : account; } });
    assert.equal(result.status, "FAIL");
    assert.equal(calls, 2);
  }
});

test("account/network failures remain blocked, not policy denial or PASS", async () => {
  const result = await azureDemoPreflight({ env, run: async (args) => { if (args[0] === "version") return { "azure-cli": "test" }; throw new Error("sensitive account output"); } });
  assert.equal(result.status, "ENVIRONMENT BLOCKED");
});

test("unregistered providers and invalid budgets are not silently approved", async () => {
  for (const budget of ["0", "101", "not-number", undefined]) {
    const result = await azureDemoPreflight({ env: { ...env, HIPASS_AZURE_BUDGET_USD: budget }, run: async (args) => args[0] === "provider" ? { namespace: args[3], registrationState: "NotRegistered" } : successfulRead(args) });
    assert.equal(result.checks.find((item) => item.name === "declared-budget").status, "NOT VERIFIED");
    assert.equal(result.status, "NOT VERIFIED");
    assert.equal(result.checks.find((item) => item.name === "Microsoft.Compute").status, "NOT VERIFIED");
  }
});
