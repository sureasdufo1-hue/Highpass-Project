import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("Phase 1 OpenAPI, JSON fixture, QR and CDDL contract gate passes", () => {
  const output = execFileSync("python", ["scripts/phase1-contract-gate.py"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.result, "PASS");
  assert.ok(result.openapiPaths >= 50);
  assert.ok(result.operationIds >= 50);
  assert.equal(result.jsonFixtures, 8);
  assert.equal(result.cddlFiles, 4);
});
