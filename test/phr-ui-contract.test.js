import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/index.html", "utf8");
const app = readFileSync("public/app.js", "utf8");
const openapi = readFileSync("docs/api/highpass-phr.openapi.yaml", "utf8");
const edgeProxy = readFileSync("scripts/edge-proxy.js", "utf8");

test("PHR-W05 patient UI exposes loading, empty/error, mapping, and consent states", () => {
  for (const marker of [
    'id="patient-phr"',
    'id="phr-load-state"',
    'id="phr-imaging-list"',
    'data-view-target="patient-phr"',
    "Viewer 연결 불가",
    "data-phr-consent-ref",
  ]) assert.ok(`${html}\n${app}`.includes(marker), `missing ${marker}`);
});

test("PHR-W05 client uses /me endpoints and keeps access tokens out of URL storage", () => {
  assert.ok(app.includes('fetchJson("/api/v1/me/phr/summary")'));
  assert.ok(app.includes('fetchJson("/api/v1/me/phr/imaging-studies?limit=20")'));
  assert.ok(app.includes("encodeURIComponent(imagingStudyRef)"));
  assert.ok(app.includes('"x-hipass-user-id": "synthetic-account-a"'));
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
  assert.doesNotMatch(app, /[?&](?:access_)?token=/i);
});

test("PHR-W08 handoff consumes an opaque route and removes it before Viewer redemption", () => {
  assert.ok(html.includes('id="phr-handoff-link"'));
  assert.ok(app.includes('history.replaceState(null, "", "/hipass/#DOCTOR")'));
  assert.ok(app.includes('postJson("/api/transfers/tickets/redeem-viewer", { nonce })'));
  assert.ok(app.includes('path === "/api/transfers/tickets/redeem-viewer"'));
  assert.ok(edgeProxy.includes('^\\/t\\/[A-Za-z0-9_-]{22,128}$'));
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
});

test("PHR OpenAPI documents opaque patient-bound reads and consent creation without DICOM UID fields", () => {
  assert.match(openapi, /\/api\/v1\/me\/phr\/summary:/);
  assert.match(openapi, /\/api\/v1\/me\/phr\/imaging-studies:\s*\n/);
  assert.match(openapi, /\/api\/v1\/me\/phr\/imaging-studies\/\{imagingStudyRef\}\/consents:/);
  assert.match(openapi, /Server-issued opaque reference/);
  assert.match(openapi, /\/api\/consents\/\{consentId\}\/handoff-ticket:/);
  assert.match(openapi, /\/api\/transfers\/tickets\/redeem-viewer:/);
  assert.doesNotMatch(openapi, /StudyInstanceUID|SeriesInstanceUID|SOPInstanceUID/);
});
