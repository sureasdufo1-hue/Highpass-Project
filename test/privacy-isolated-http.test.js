import test from "node:test";
import assert from "node:assert/strict";
import { runPrivacyHttpFixture, privacyHttpFixturePassed, PRIVACY_HTTP_REQUIRED_CASES } from "../scripts/test-support/privacy-http-fixture.js";

test("shared Privacy handler: actual loopback HTTP normal negative and cleanup scenarios", { timeout: 40000 }, async () => {
  const result = await runPrivacyHttpFixture();
  assert.equal(result.cleanup, "PASS");
  assert.deepEqual(result.assertions.filter((entry) => entry.result !== "PASS").map((entry) => entry.id), []);
  assert.ok(privacyHttpFixturePassed(result));
});

test("Privacy local gate cannot hide missing duplicate unverified or unclean scenarios", () => {
  const result = { assertions: PRIVACY_HTTP_REQUIRED_CASES.map((id) => ({ id, result: "PASS" })), cleanup: "PASS",
    diagnostics: { active: 0, queued: 0, spawned: 1, closed: 1 } };
  assert.ok(privacyHttpFixturePassed(result));
  assert.equal(privacyHttpFixturePassed({ ...result, assertions: result.assertions.slice(1) }), false);
  assert.equal(privacyHttpFixturePassed({ ...result, assertions: result.assertions.map((entry, index) => index ? entry : result.assertions[1]) }), false);
  assert.equal(privacyHttpFixturePassed({ ...result, assertions: result.assertions.map((entry, index) => index ? entry : { ...entry, result: "NOT VERIFIED" }) }), false);
  assert.equal(privacyHttpFixturePassed({ ...result, cleanup: "FAIL" }), false);
  assert.equal(privacyHttpFixturePassed({ ...result, diagnostics: { ...result.diagnostics, active: 1 } }), false);
});
