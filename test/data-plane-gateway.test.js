import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDataPlaneHandler, requireHttpsOrigin, boundedHttps } from "../src/data-plane-gateway.js";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const study = "1.2.410.100.1.20260620.001";
const series = study + ".1";
const token = randomBytes(32).toString("base64url");
const grant = () => ({ active: true, studyInstanceUid: study, allowedSeriesUids: [series], receipt: "test-receipt", expiresAt: new Date(Date.now() + 60000).toISOString() });

async function call(transport, url = "/dicomweb/studies", extra = {}) {
  const handler = createDataPlaneHandler({ publicBaseUrl: "https://hospital-a.test", controlOrigin: "https://control.test", orthancOrigin: "https://orthanc.test", serviceToken: token, transport });
  const response = { destroyed: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  await handler({ method: "GET", url, headers: { authorization: "Bearer test.user.token", dpop: "test-proof" }, socket: { remoteAddress: "192.0.2.2" }, ...extra }, response);
  return response;
}

test("Gateway never fetches PACS if authorization fails or control service is unavailable", async () => {
  let calls = 0;
  const response = await call(async (origin, path, options) => {
    calls++;
    assert.equal(origin, "https://control.test");
    assert.equal(path, "/gateway/data-plane/authorize");
    assert.equal(JSON.parse(options.body).clientIp, "192.0.2.2");
    return { status: 403, body: Buffer.from('{"active":false}') };
  });
  assert.equal(response.status, 403); assert.equal(calls, 1);
  assert.equal((await call(async () => { throw new Error("TLS failure"); })).status, 503);
  assert.throws(() => requireHttpsOrigin("http://unsafe.test"));
});

test("required image encryption returns ciphertext only and clears A response bytes even on encryption failure", async () => {
  for (const fail of [false, true]) {
    const raw = Buffer.from("synthetic PACS image only");
    const handler = createDataPlaneHandler({ publicBaseUrl: "https://hospital-a.test", controlOrigin: "https://control.test", orthancOrigin: "https://orthanc.test", serviceToken: token,
      encryptionRequired: true, imageEncryptionFactory: () => ({ async seal({ body }) {
        assert.deepEqual(body, raw);
        if (fail) throw new Error("KEY_VAULT_UNAVAILABLE");
        return { contentType: "application/vnd.highpass.encrypted-dicom+json", body: Buffer.from('{"ciphertext":"synthetic"}') };
      } }), transport: async origin => origin === "https://control.test"
        ? { status: 200, body: Buffer.from(JSON.stringify({ ...grant(), accepted: true })) }
        : { status: 200, body: raw, contentType: "image/png" } });
    const response = { destroyed: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = Buffer.from(body); } };
    await handler({ method: "GET", url: `/dicomweb/studies/${study}/series/${series}/instances/${series}.1/rendered`, headers: { authorization: "Bearer test.user.token" }, socket: { remoteAddress: "192.0.2.2" } }, response);
    assert.equal(response.status, fail ? 503 : 200);
    assert.ok(raw.every(byte => byte === 0));
    assert.ok(!response.body.includes(Buffer.from("synthetic PACS image only")));
  }
  assert.throws(() => createDataPlaneHandler({ publicBaseUrl: "https://hospital-a.test", controlOrigin: "https://control.test", orthancOrigin: "https://orthanc.test", serviceToken: token, encryptionRequired: true }), /ENCRYPTION_REQUIRED/);
});

test("Gateway constrains QIDO Study and filters upstream identifiers before safe response", async () => {
  const calls = [];
  const response = await call(async (origin, path, options) => {
    calls.push({ origin, path, options });
    if (origin === "https://control.test") return { status: 200, body: Buffer.from(JSON.stringify(path.endsWith("authorize") ? grant() : { accepted: true })) };
    assert.equal(path, `/dicom-web/studies?StudyInstanceUID=${study}`);
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.dpop, undefined);
    return { status: 200, contentType: "application/dicom+json", body: Buffer.from(JSON.stringify([
      { "0020000D": { Value: [study] }, "00100010": { Value: ["SYNTHETIC^NAME"] } },
      { "0020000D": { Value: ["1.2.3"] } },
    ])) };
  });
  assert.equal(response.status, 200);
  const rows = JSON.parse(response.body); assert.equal(rows.length, 1); assert.equal(rows[0]["00100010"], undefined);
  assert.equal(calls.at(-1).path, "/gateway/data-plane/ready");
  assert.equal(JSON.parse(calls.at(-1).options.body).bytesPrepared, response.body.length);
  assert.ok(!JSON.stringify(response).includes("test.user.token"));
});

test("Gateway filters Series and releases no bytes on scope or audit failure", async () => {
  const transport = async (origin, path) => {
    if (origin === "https://control.test") return { status: 200, body: Buffer.from(JSON.stringify(path.endsWith("authorize") ? grant() : { accepted: true })) };
    return { status: 200, contentType: "application/dicom+json", body: Buffer.from(JSON.stringify([
      { "0020000E": { Value: [series] } }, { "0020000E": { Value: [study + ".2"] } }, {},
    ])) };
  };
  assert.equal(JSON.parse((await call(transport, `/dicomweb/studies/${study}/series`)).body).length, 1);
  assert.equal((await call(transport, `/dicomweb/studies/${study}/series/${series}.9/instances`)).status, 403);
  assert.equal((await call(async (origin, path, options) => path.endsWith("/ready") ? { status: 503, body: Buffer.from('{"accepted":false}') } : transport(origin, path, options), `/dicomweb/studies/${study}/series`)).status, 503);
  assert.equal((await call(transport, "/dicomweb/studies?token=leak")).status, 400);
});

test("real TLS transport verifies trust and hostname, overrides insecure option, limits bytes and time", { timeout: 20000 }, async t => {
  const openssl = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
  if (process.platform === "win32" && !existsSync(openssl)) return t.skip("NOT VERIFIED: OpenSSL test-fixture generator unavailable");
  const directory = await mkdtemp(path.join(tmpdir(), "hp-gateway-tls-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keyPath = path.join(directory, "test.key"); const certPath = path.join(directory, "test.crt");
  execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", keyPath, "-out", certPath], { timeout: 15000, stdio: "pipe", windowsHide: true });
  const ca = await readFile(certPath);
  const server = createServer({ key: await readFile(keyPath), cert: ca }, (request, response) => {
    if (request.url === "/timeout") return;
    response.end("synthetic-test-bytes");
  });
  server.requestTimeout = 1000; server.headersTimeout = 1000; server.timeout = 1000;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `https://127.0.0.1:${server.address().port}`;
  t.diagnostic("TLS positive");
  assert.equal((await boundedHttps(origin, "/", { tls: { ca, servername: "localhost" } })).status, 200);
  await assert.rejects(boundedHttps(origin, "/", { tls: { ca, servername: "wrong.test" } }), { code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  await assert.rejects(boundedHttps(origin, "/", { tls: { servername: "localhost", rejectUnauthorized: false } }), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
  t.diagnostic("TLS response limit");
  await assert.rejects(boundedHttps(origin, "/", { tls: { ca, servername: "localhost" }, maxBytes: 4 }), { code: "RESPONSE_LIMIT" });
  t.diagnostic("TLS timeout");
  await assert.rejects(boundedHttps(origin, "/timeout", { tls: { ca, servername: "localhost" }, timeoutMs: 50 }), { code: "ETIMEDOUT" });
});
