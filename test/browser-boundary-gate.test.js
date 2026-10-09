import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { PostgresStore } from "../src/postgres-store.js";

test("FR-025 debug UI redacts token/envelope and embedded handoff secrets", () => {
  const app = readFileSync("public/app.js", "utf8");
  const fn = app.slice(app.indexOf("function renderOutput(value)"), app.indexOf("// Modal Controls", app.indexOf("function renderOutput(value)")));
  const context = { output: { textContent: "" }, latestToken: "opaque-runtime-token", latestTicketNonce: "opaque-handoff-ticket" };
  vm.createContext(context);
  vm.runInContext(fn + ';renderOutput({accessToken:latestToken,nested:{nonce:latestTicketNonce},qr:{payload:"/t/"+latestTicketNonce},message:"Bearer "+latestToken,tokenId:"safe-id"})', context);
  assert.ok(!context.output.textContent.includes(context.latestToken));
  assert.ok(!context.output.textContent.includes(context.latestTicketNonce));
  assert.equal(JSON.parse(context.output.textContent).tokenId, "safe-id");
});
test("legacy Postgres handoff retains mandatory consent FK but accepts absent requestId", async () => {
  const store = new PostgresStore("postgres://unused-test-host");
  const calls = [];
  store.client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  await store.ensureSchema();
  const schema = calls.map(call => typeof call.sql === "string" ? call.sql : call.sql.text).join("\n");
  assert.ok(calls.every(call => call.sql.query_timeout === 60000));
  assert.match(schema, /ALTER TABLE transfer_tickets ALTER COLUMN request_id DROP NOT NULL/);
  assert.match(schema, /consent_id varchar NOT NULL REFERENCES consents\(consent_id\)/);
  calls.length = 0;
  await store.insertTransferTickets([{ ticketId: "synthetic-ticket", requestId: null, consentId: "synthetic-consent", nonceHash: "sha256:synthetic-hash" }]);
  assert.equal(calls[0].values[1], null);
  assert.equal(calls[0].values[2], "synthetic-consent");
});
test("browser and packet gates do not substitute fallback data or DNS errors for PASS", () => {
  const browser = readFileSync("scripts/browser-authorization-trace.js", "utf8");
  assert.ok(!browser.includes("await runBrowserFetchFlow(cdp)"));
  assert.match(browser, /naturalWidth > 0/);
  assert.match(browser, /trace\.exposure\.tokenIssued/);
  const packet = readFileSync("scripts/packet-boundary-check.js", "utf8");
  assert.match(packet, /destinationSyn\.length === 0/);
  assert.match(packet, /controlSyn\.length > 0/);
  assert.match(packet, /sourceSyn\.length > 0/);
});
