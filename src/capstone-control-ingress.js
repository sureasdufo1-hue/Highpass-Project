import http from "node:http";
import { signIngress } from "./ingress.js";
import { keyReleasePaths } from "./key-release-http-handler.js";

const servicePaths = ["/gateway/data-plane/authorize", "/gateway/data-plane/ready", ...keyReleasePaths];

// Metadata only. Image/Viewer transport has a separate hospital trust boundary.
export function allowedControlPath(raw) {
  if (typeof raw !== "string" || raw.length > 4096 || !raw.startsWith("/") || raw.startsWith("//")) return false;
  const path = raw.split("?")[0];
  if (!/^\/[A-Za-z0-9_./-]*$/.test(path) || path.includes("..")) return false;
  if (servicePaths.includes(path)) return true;
  if (path === "/api/transfers/pacs-import" || /\/pacs-archive(?:\/|$)/.test(path)) return false;
  return path.startsWith("/api/") && !/^\/api\/(?:pacs-import|research|clinical-assets)(?:\/|$)/.test(path);
}

export function createControlIngress({ origin, secret, deadlineMs = 45000 }) {
  const base = new URL(origin);
  // Cleartext is permitted ONLY inside the private, unexposed Compose API network.
  if (base.href !== "http://control:3000/" || Buffer.byteLength(secret ?? "") < 32) throw new Error("INVALID_PRIVATE_INGRESS_CONFIG");
  return (incoming, outgoing) => {
    const fail = (status, code) => {
      if (outgoing.headersSent || outgoing.destroyed) return;
      outgoing.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      outgoing.end(JSON.stringify({ error: code }));
    };
    if (!allowedControlPath(incoming.url)) { incoming.resume(); fail(403, "METADATA_ROUTE_REQUIRED"); return; }
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(incoming.method)) { incoming.resume(); fail(405, "METHOD_NOT_ALLOWED"); return; }
    const headers = { host: base.host, "x-forwarded-proto": "https", "x-forwarded-for": incoming.socket.remoteAddress };
    for (const name of ["authorization", "dpop", "content-type", "accept", "idempotency-key"]) {
      if (typeof incoming.headers[name] === "string") headers[name] = incoming.headers[name];
    }
    // The dedicated least-privilege Gateway principal is required for these
    // two service-only endpoints. Never promote it to a generic API credential.
    if (servicePaths.includes(incoming.url)
        && typeof incoming.headers["x-hipass-service-token"] === "string") {
      headers["x-hipass-service-token"] = incoming.headers["x-hipass-service-token"];
    }
    const envelope = signIngress({ method: incoming.method, url: incoming.url, headers }, incoming.socket.remoteAddress, secret);
    headers["x-hipass-ingress-time"] = envelope.timestamp;
    headers["x-hipass-ingress-signature"] = envelope.signature;
    let bytes = 0;
    let ended = false;
    const request = http.request({ hostname: base.hostname, port: base.port, method: incoming.method, path: incoming.url, headers }, upstream => {
      const chunks = [];
      let size = 0;
      upstream.on("data", chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { fail(502, "METADATA_RESPONSE_TOO_LARGE"); upstream.destroy(); request.destroy(); return; }
        chunks.push(chunk);
      });
      upstream.on("error", () => fail(502, "UPSTREAM_UNAVAILABLE"));
      upstream.on("end", () => {
        if (outgoing.headersSent || outgoing.destroyed) return;
        const type = String(upstream.headers["content-type"] ?? "");
        if (!/^application\/(?:json|problem\+json)(?:;|$)/i.test(type) && upstream.statusCode !== 204) { fail(502, "NON_METADATA_RESPONSE"); return; }
        outgoing.writeHead(upstream.statusCode ?? 502, { "content-type": type || "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
        outgoing.end(Buffer.concat(chunks));
      });
    });
    request.on("error", () => fail(502, "UPSTREAM_UNAVAILABLE"));
    const deadline = setTimeout(() => { fail(504, "UPSTREAM_TIMEOUT"); request.destroy(); }, deadlineMs);
    deadline.unref();
    outgoing.on("close", () => { ended = true; clearTimeout(deadline); request.destroy(); });
    incoming.on("error", () => request.destroy());
    incoming.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > 512 * 1024) { fail(413, "REQUEST_TOO_LARGE"); request.destroy(); return; }
      if (!ended && !request.destroyed && !request.write(chunk)) { incoming.pause(); request.once("drain", () => incoming.resume()); }
    });
    incoming.on("end", () => { if (!request.destroyed) request.end(); });
  };
}
