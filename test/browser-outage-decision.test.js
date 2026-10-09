import test from "node:test";
import assert from "node:assert/strict";
import { outageDecision } from "../scripts/browser-outage-gate.js";

test("outage PASS requires actual 503, no image response and hidden prior image", () => {
  const baseline = { status: 503, imageReturned: false, imageHidden: true, requested: true };
  assert.equal(outageDecision(baseline), "PASS");
  for (const changed of [{ status: 200 }, { status: 403 }, { status: undefined }, { imageReturned: true }, { imageHidden: false }, { requested: false }]) {
    assert.equal(outageDecision({ ...baseline, ...changed }), "FAIL");
  }
});
