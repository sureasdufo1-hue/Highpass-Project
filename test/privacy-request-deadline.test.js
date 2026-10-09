import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PrivacyRequestBudget } from "../src/privacy-request-budget.js";
import { PrivacyTextInspectionService } from "../src/privacy-service.js";
import { ApprovedUseRegistry, PrivacyRuleRegistry } from "../src/privacy-policy.js";
import { OpfLocalAdapter } from "../src/privacy-adapter.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timedOut = (error) => error.code === "MODEL_TIMEOUT" && error.statusCode === 504;
const input = { mediaType: "text/plain", content: "SYNTHETIC-ONLY", approvedUseRef: "use_research_synthetic_001",
  purpose: "RESEARCH", recipientRef: "HOSP-B-RESEARCH-SANDBOX", sourceOrganizationId: "HOSP-A",
  sourceArtifactRef: "synthetic-report-c001", sourceArtifactVersion: 1 };
const principal = { role: "INTERNAL_SERVICE", userId: "internal-service", scopes: ["privacy:inspect"] };
const make = (adapter, requestTimeoutMs) => new PrivacyTextInspectionService({ adapter, requestTimeoutMs,
  approvedUses: ApprovedUseRegistry.fromFile(undefined, { clock: () => new Date("2026-10-08T00:00:00Z") }),
  rules: PrivacyRuleRegistry.fromFile() });

test("one budget covers count and detect; late completion cannot return a preview", { timeout: 3000 }, async () => {
  let aborted = false;
  let detectStarted = false;
  const adapter = {
    countTokens: async () => { await delay(100); return 1; },
    detect: async (_, { signal }) => {
      detectStarted = true;
      signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await delay(650);
      return { findings: [] };
    },
  };
  await assert.rejects(make(adapter, 500).inspect(input, principal), timedOut);
  assert.ok(detectStarted);
  assert.ok(aborted);
  await delay(700); // Observe the deliberately late underlying completion.
});

test("expired or externally aborted budget never starts later operations", async () => {
  const budget = new PrivacyRequestBudget(1000);
  budget.abort();
  let calls = 0;
  try { await assert.rejects(budget.run(() => calls++), timedOut); }
  finally { budget.dispose(); }
  assert.equal(calls, 0);
});

test("readiness also has a finite total budget when adapter ignores cancellation", { timeout: 1000 }, async () => {
  await assert.rejects(make({ readiness: () => new Promise(() => {}) }, 50).readiness(), timedOut);
});

test("queued abort removes work and active abort waits for child close before slot reuse", { timeout: 8000 }, async () => {
  const adapter = new OpfLocalAdapter({
    checkpointPath: fileURLToPath(new URL("./fixtures/privacy/fake-checkpoint", import.meta.url)),
    bridgePath: fileURLToPath(new URL("./fixtures/privacy/fake-opf-bridge.py", import.meta.url)),
    pythonCommand: "python", timeoutMs: 3000, maxConcurrency: 1, maxQueue: 2,
  });
  const active = new AbortController();
  const queued = new AbortController();
  const running = adapter.detect("long-timeout", { signal: active.signal });
  await delay(100); // Allow #start's microtask to spawn the real owned child.
  assert.equal(adapter.active, 1);
  const queuedWork = adapter.detect("ok", { signal: queued.signal });
  const queuedAssertion = assert.rejects(queuedWork, timedOut);
  assert.equal(adapter.queue.length, 1);
  queued.abort();
  await queuedAssertion;
  assert.equal(adapter.queue.length, 0);
  const runningAssertion = assert.rejects(running, timedOut);
  active.abort();
  await runningAssertion;
  const deadline = Date.now() + 3000;
  while (adapter.active && Date.now() < deadline) await delay(20);
  assert.equal(adapter.active, 0);
  assert.deepEqual((await adapter.detect("ok")).findings, []);
  assert.equal(adapter.active, 0);
});
