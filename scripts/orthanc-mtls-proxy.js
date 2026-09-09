import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const port = Number(process.env.ORTHANC_MTLS_PORT ?? 8443);
const upstreamOrigin = process.env.ORTHANC_UPSTREAM_ORIGIN ?? "http://hospital-a-orthanc:8042";
const allowedClientSan = optionalEnv("ORTHANC_MTLS_ALLOWED_CLIENT_SAN");
const allowedClientSubjectCn = optionalEnv("ORTHANC_MTLS_ALLOWED_CLIENT_SUBJECT_CN");

if (Boolean(allowedClientSan) === Boolean(allowedClientSubjectCn)) {
  throw new Error("exactly one client certificate identity policy is required");
}

https.createServer({
  cert: readFileSync(requiredEnv("ORTHANC_MTLS_CERT_FILE")),
  key: readFileSync(requiredEnv("ORTHANC_MTLS_KEY_FILE")),
  ca: readFileSync(requiredEnv("ORTHANC_MTLS_CA_FILE")),
  requestCert: true,
  rejectUnauthorized: true,
}, (request, response) => {
  if (!request.client.authorized) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "CLIENT_CERT_REQUIRED" }));
    return;
  }
  const peer = request.socket.getPeerCertificate();
  const presentedSans = parseSubjectAltName(peer.subjectaltname);
  const identityMatches = allowedClientSan
    ? presentedSans.includes(allowedClientSan)
    : peer.subject?.CN === allowedClientSubjectCn;
  if (!identityMatches) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "CLIENT_CERT_IDENTITY_DENIED" }));
    return;
  }
  proxyToOrthanc(request, response);
}).listen(port, () => {
  console.log(`Orthanc mTLS proxy listening on ${port}`);
});

function proxyToOrthanc(incoming, outgoing) {
  const targetUrl = new URL(incoming.url ?? "/", upstreamOrigin);
  const request = http.request({
    method: incoming.method,
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers: { ...incoming.headers, host: targetUrl.host, "x-forwarded-proto": "https" },
  }, (upstream) => {
    outgoing.writeHead(upstream.statusCode ?? 502, upstream.headers);
    upstream.pipe(outgoing);
  });
  request.on("error", () => {
    outgoing.writeHead(502, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "ORTHANC_UNAVAILABLE" }));
  });
  incoming.pipe(request);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function parseSubjectAltName(value) {
  return String(value ?? "")
    .split(/,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}
