import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { signIngress, validateIngressConfig } from "../src/ingress.js";

validateIngressConfig(process.env);

const httpPort = Number(process.env.EDGE_HTTP_PORT ?? 8080);
const httpsPort = Number(process.env.EDGE_HTTPS_PORT ?? 8443);
const publicHttpsPort = Number(process.env.EDGE_PUBLIC_HTTPS_PORT ?? 3443);
const apiOrigin = process.env.EDGE_API_ORIGIN ?? "http://hipass-control-api:3000";
const viewerOrigin = process.env.EDGE_VIEWER_ORIGIN ?? "http://hospital-b-viewer:80";

http.createServer((request, response) => {
  const host = request.headers.host?.replace(/:\d+$/, "") ?? "localhost";
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const redirectPath = requestUrl.pathname === "/" ? `/hipass/${requestUrl.search}` : `${requestUrl.pathname}${requestUrl.search}`;
  response.writeHead(307, { location: `https://${host}:${publicHttpsPort}${redirectPath}` });
  response.end();
}).listen(httpPort);

https.createServer({
  cert: readFileSync(requiredEnv("EDGE_TLS_CERT_FILE")),
  key: readFileSync(requiredEnv("EDGE_TLS_KEY_FILE")),
}, (request, response) => {
  const target = routeTarget(request.url ?? "/");
  proxy(request, response, target);
}).listen(httpsPort, () => {
  console.log(`HiPass edge proxy listening on HTTPS ${httpsPort}`);
});

function routeTarget(pathname) {
  const url = new URL(pathname, "https://localhost");
  if (url.pathname === "/hipass/") return new URL("/", apiOrigin);
  if (/^\/t\/[A-Za-z0-9_-]{22,128}$/.test(url.pathname)) return new URL(url.pathname, apiOrigin);
  if (["/styles.css", "/app.js", "/qrcode.js", "/jsqr.js", "/mobile"].includes(url.pathname) || url.pathname.startsWith("/mobile/") || url.pathname.startsWith("/images/") || isPlatformAsset(url.pathname)) {
    return new URL(`${url.pathname}${url.search}`, apiOrigin);
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dicomweb/") || url.pathname === "/dicomweb/studies" || url.pathname.startsWith("/gateway/")) {
    return new URL(`${url.pathname}${url.search}`, apiOrigin);
  }
  return new URL(`${url.pathname}${url.search}`, viewerOrigin);
}

function isPlatformAsset(pathname) {
  return [
    "/assets/demo-ct.png",
    "/assets/demo-mri.png",
    "/assets/hero-medical-platform.png",
  ].includes(pathname);
}

function proxy(incoming, outgoing, targetUrl) {
  const transport = targetUrl.protocol === "https:" ? https : http;
  const headers = { ...incoming.headers, host: targetUrl.host, "x-forwarded-proto": "https", "x-forwarded-for": incoming.socket.remoteAddress };
  delete headers["x-ja3-fingerprint"];
  delete headers["x-ja4-fingerprint"];
  delete headers["forwarded"];
  delete headers["x-forwarded-host"];
  delete headers["x-hipass-ingress-time"];
  delete headers["x-hipass-ingress-signature"];
  if (process.env.HIPASS_INGRESS_SECRET) {
    const envelope = signIngress({ method: incoming.method, url: `${targetUrl.pathname}${targetUrl.search}`, headers }, incoming.socket.remoteAddress, process.env.HIPASS_INGRESS_SECRET);
    headers["x-hipass-ingress-time"] = envelope.timestamp;
    headers["x-hipass-ingress-signature"] = envelope.signature;
  }
  const request = transport.request({
    method: incoming.method,
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers,
  }, (upstream) => {
    const headers = {
      ...upstream.headers,
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://localhost:3443; worker-src 'self' blob:; frame-ancestors 'none';",
    };
    outgoing.writeHead(upstream.statusCode ?? 502, headers);
    upstream.pipe(outgoing);
  });
  request.on("error", () => {
    if (outgoing.headersSent || outgoing.destroyed) { outgoing.destroy(); return; }
    outgoing.writeHead(502, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "UPSTREAM_UNAVAILABLE" }));
  });
  // Allow the bounded legacy DB write (30s) plus security tarpit (<=5s)
  // and transport margin. Authentication/proof checks are not weakened.
  request.setTimeout(40000, () => request.destroy(new Error("UPSTREAM_TIMEOUT")));
  const deadline = setTimeout(() => request.destroy(new Error("UPSTREAM_TIMEOUT")), 50000);
  deadline.unref();
  outgoing.on("close", () => { clearTimeout(deadline); request.destroy(); });
  outgoing.on("finish", () => clearTimeout(deadline));
  incoming.pipe(request);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
