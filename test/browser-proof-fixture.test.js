import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("browser replay fixture is bound to the same successful 200 image response, never pending or denied requests", () => {
  const source = readFileSync(new URL("../scripts/browser-authorization-trace.js", import.meta.url), "utf8");
  const start = source.indexOf('cdp.on("Network.requestWillBeSent"');
  const end = source.indexOf('await cdp.send("Page.navigate"', start);
  const handlers = new Map();
  const context = vm.createContext({ URL, Map, Set, pendingProtectedImageRequests: new Map(),
    protectedImageRequest: null, observedUrls: [], observedTokens: new Set(), trace: { dicomwebRequests: [] },
    responses: new Map(), revokeResponses: new Map(), consentCreateResponses: new Set(), tokenIssueResponses: new Set(), loginResponseId: null,
    safeApiRequests: new Map(), safeApiRequestTimes: new Map(), apiOperation: () => null,
    normalizeHeaders: headers => Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])),
    redactUrl: value => value, cdp: { on: (name, callback) => handlers.set(name, callback) } });
  vm.runInContext(source.slice(start, end), context);
  const request = id => handlers.get("Network.requestWillBeSent")({ requestId: id, request: {
    url: "https://synthetic.invalid/dicomweb/studies/1/series/2/instances/3/rendered", method: "GET",
    headers: { Authorization: "DPoP test-only", DPoP: "proof-test-only" } } });
  const response = (id, status, mimeType = "image/png") => handlers.get("Network.responseReceived")({ requestId: id,
    response: { url: "https://synthetic.invalid/dicomweb/studies/1/series/2/instances/3/rendered", status, mimeType } });
  request("denied");
  assert.equal(context.protectedImageRequest, null);
  response("denied", 403);
  assert.equal(context.protectedImageRequest, null);
  request("json"); response("json", 200, "application/json");
  assert.equal(context.protectedImageRequest, null);
  request("success"); response("different", 200);
  assert.equal(context.protectedImageRequest, null);
  response("success", 200);
  assert.equal(context.protectedImageRequest.proof, "proof-test-only");
  assert.equal(context.pendingProtectedImageRequests.has("success"), false);
});
