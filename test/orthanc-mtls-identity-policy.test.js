import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxy = readFileSync("scripts/orthanc-mtls-proxy.js", "utf8");

test("mTLS proxy requires exactly one explicit client identity policy", () => {
  assert.match(proxy, /exactly one client certificate identity policy is required/);
  assert.match(proxy, /ORTHANC_MTLS_ALLOWED_CLIENT_SAN/);
  assert.match(proxy, /ORTHANC_MTLS_ALLOWED_CLIENT_SUBJECT_CN/);
});

test("legacy rollback identity remains pinned to subject CN", () => {
  assert.match(proxy, /peer\.subject\?\.CN === allowedClientSubjectCn/);
  assert.doesNotMatch(proxy, /rejectUnauthorized:\s*false/);
  assert.match(proxy, /rejectUnauthorized:\s*true/);
});
