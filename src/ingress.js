import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export function validateIngressConfig(env) {
  if (env.HIPASS_INGRESS_SECRET && Buffer.byteLength(env.HIPASS_INGRESS_SECRET) < 32) throw new Error("Ingress secret must be at least 32 bytes");
  if (env.HIPASS_DPOP_REQUIRED === "1") {
    const origin = new URL(env.HIPASS_PUBLIC_BASE_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || !env.HIPASS_INGRESS_SECRET) throw new Error("Strict DPoP requires an HTTPS origin and authenticated ingress");
  }
}

function canonical(request, timestamp, ip) {
  return JSON.stringify([timestamp, request.method, request.url, ip, "https", createHash("sha256").update(String(request.headers.authorization ?? "")).digest("hex")]);
}

export function signIngress(request, ip, secret, now = Date.now()) {
  const timestamp = String(now);
  return { timestamp, signature: createHmac("sha256", secret).update(canonical(request, timestamp, ip)).digest("base64url") };
}

// Forwarded headers are metadata, never authentication. Unauthenticated callers
// cannot choose audit/network-policy identity, including callers on Docker networks.
export function ingressMeta(request, secret, now = Date.now()) {
  const ip = request.headers["x-forwarded-for"];
  const timestamp = request.headers["x-hipass-ingress-time"];
  const signature = request.headers["x-hipass-ingress-signature"];
  let trusted = false;
  if (secret && typeof ip === "string" && isIP(ip) && typeof timestamp === "string" && /^\d{13}$/.test(timestamp) && Math.abs(now - Number(timestamp)) <= 10_000 && request.headers["x-forwarded-proto"] === "https" && typeof signature === "string") {
    const expected = signIngress(request, ip, secret, Number(timestamp)).signature;
    const supplied = Buffer.from(signature);
    const calculated = Buffer.from(expected);
    trusted = supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
  }
  return { ingressTrusted: trusted, ipAddress: trusted ? ip : request.socket.remoteAddress, ja3Fingerprint: null };
}
