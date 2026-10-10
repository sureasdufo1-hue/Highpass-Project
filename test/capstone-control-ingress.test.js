import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { allowedControlPath, createControlIngress } from "../src/capstone-control-ingress.js";

test("metadata ingress denies image, Viewer, bulk and ambiguous paths", () => {
  for (const path of ["/dicomweb/studies", "/viewer", "/api/transfers/pacs-import", "/api/transfers/pacs-archive", "/api/hospitals/HOSP-B/pacs-archive", "/api/pacs-import", "/api/research/export", "/api/clinical-assets/x", "/gateway/token/introspect", "//evil/api/health", "/api/../dicomweb/studies", "/api/%2e%2e/x", "/api/health\\x"]) assert.equal(allowedControlPath(path), false, path);
  for (const path of ["/api/health", "/api/security/proof-policy", "/api/consents", "/gateway/data-plane/authorize", "/gateway/data-plane/ready"]) assert.equal(allowedControlPath(path), true, path);
});
test("Compose publishes only the cloud overlay TLS address and preserves private database/API", () => {
  const env = { ...process.env, HIPASS_APP_IMAGE: "highpass:local", HIPASS_POSTGRES_IMAGE: "postgres:16-alpine", HIPASS_CLOUD_SECRET_DIR: "/opt/highpass/secrets", HIPASS_CAPSTONE_PUBLIC_ORIGIN: "https://192.168.111.149:9443" };
  const config = JSON.parse(execFileSync("docker", ["compose", "--project-directory", process.cwd(), "-f", "infra/azure/capstone-control.compose.yml", "-f", "infra/azure/capstone-control-ingress.compose.yml", "config", "--format", "json"], { env, timeout: 15000, windowsHide: true, encoding: "utf8", stdio: "pipe" }));
  assert.equal(config.services.ingress.ports.length, 1);
  assert.equal(config.services.ingress.ports[0].host_ip, "10.90.88.1");
  assert.equal(config.services.ingress.ports[0].target, 8443);
  for (const name of ["postgres", "control", "bootstrap"]) assert.equal(config.services[name].ports, undefined);
  assert.equal(config.networks.api_private.internal, true);
  assert.ok(Object.hasOwn(config.services.ingress.networks, "edge_transport"));
  assert.equal(config.services.control.networks.edge_transport, undefined);
  assert.equal(config.services.postgres.networks.edge_transport, undefined);
});
test("private upstream config cannot be redirected to external or insecure arbitrary hosts", () => {
  for (const origin of ["http://evil:3000", "https://control:3000", "http://control:3000/path", "http://user@control:3000"]) assert.throws(() => createControlIngress({ origin, secret: "x".repeat(32) }));
  assert.throws(() => createControlIngress({ origin: "http://control:3000", secret: "short" }));
});
test("actual ingress rejects denied paths without contacting upstream or exposing URL secrets", async t => {
  const server = http.createServer(createControlIngress({ origin: "http://control:3000", secret: "x".repeat(32) }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/dicomweb/studies?token=synthetic-marker`, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "METADATA_ROUTE_REQUIRED" });
});
test("Gateway dedicated credential is forwarded only to exact service endpoints, not generic API or forwarded identity headers", t => {
  const captured = [];
  t.mock.method(http, "request", options => {
    captured.push(options);
    const request = new PassThrough();
    request.on("data", () => {});
    return request;
  });
  for (const path of ["/gateway/data-plane/authorize", "/gateway/data-plane/ready", "/gateway/data-plane/package/prepare", "/gateway/data-plane/package/authorize", "/api/health", "/gateway/data-plane/package/authorize?token=forbidden"]) {
    const incoming = new PassThrough();
    incoming.url = path;
    incoming.method = "POST";
    incoming.socket = { remoteAddress: "10.90.88.2" };
    incoming.headers = { "x-hipass-service-token": "synthetic-service-principal", "x-forwarded-for": "spoofed", "x-hipass-ingress-signature": "spoofed" };
    const outgoing = new EventEmitter();
    createControlIngress({ origin: "http://control:3000", secret: "x".repeat(32) })(incoming, outgoing);
    outgoing.emit("close");
    incoming.end();
  }
  for (const item of captured.slice(0, 4)) assert.equal(item.headers["x-hipass-service-token"], "synthetic-service-principal");
  for (const item of captured.slice(4)) assert.equal(item.headers["x-hipass-service-token"], undefined);
  for (const item of captured) {
    assert.equal(item.headers["x-forwarded-for"], "10.90.88.2");
    assert.notEqual(item.headers["x-hipass-ingress-signature"], "spoofed");
  }
});

test('patient metadata service routes forward only the authenticated service boundary; no patient pixels or wildcard Gateway',t=>{
  const exact=['/gateway/patient-self-view/authorize','/gateway/patient-self-view/ready',
    '/gateway/patient-self-view/package/wrap-authorize','/gateway/patient-self-view/package/prepare','/gateway/patient-self-view/package/authorize'];
  for(const route of exact)assert.equal(allowedControlPath(route),true);
  for(const route of ['/patient-dicomweb/studies/1.2/series','/gateway/patient-self-view/token','/gateway/patient-self-view/package/download','/gateway/patient-self-view/authorize/extra'])assert.equal(allowedControlPath(route),false);
  const captured=[];
  t.mock.method(http,'request',options=>{captured.push(options);const request=new PassThrough();request.on('data',()=>{});return request;});
  for(const route of [...exact,'/api/health',exact[0]+'?query=unexpected']){
    const incoming=new PassThrough();incoming.url=route;incoming.method='POST';incoming.socket={remoteAddress:'10.90.88.2'};
    incoming.headers={'x-hipass-service-token':'synthetic-patient-service-marker','x-forwarded-for':'spoofed'};
    const outgoing=new EventEmitter();createControlIngress({origin:'http://control:3000',secret:'x'.repeat(32)})(incoming,outgoing);
    outgoing.emit('close');incoming.end();
  }
  for(const row of captured.slice(0,exact.length)){assert.equal(row.headers['x-hipass-service-token'],'synthetic-patient-service-marker');assert.equal(row.headers['x-forwarded-for'],'10.90.88.2');assert.ok(row.headers['x-hipass-ingress-signature']);}
  for(const row of captured.slice(exact.length))assert.equal(row.headers['x-hipass-service-token'],undefined);
});
