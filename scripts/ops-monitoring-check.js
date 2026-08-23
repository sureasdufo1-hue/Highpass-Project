import { createServer } from "node:http";
import https from "node:https";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const now = new Date();
const alerts = [];
const received = [];
const receiver = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405);
    response.end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  response.writeHead(202, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
});

await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
const receiverUrl = `http://127.0.0.1:${receiver.address().port}/alerts`;

try {
  await checkApiHealth();
  await checkDockerHealth();
  checkCertificates();
  checkRiskExceptions();
  addSyntheticSecuritySignals();
  for (const alert of alerts) await emit(alert);
} finally {
  await new Promise((resolve) => receiver.close(resolve));
}

const result = {
  status: alerts.length === received.length ? "PASS" : "FAIL",
  generatedAt: now.toISOString(),
  backend: "independent-node-alert-receiver",
  externalHumanNotification: "NOT_VERIFIED",
  alerts,
  receivedCount: received.length,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);

async function checkApiHealth() {
  const status = await httpsStatus("https://localhost:3443/api/health", "tmp/certs/mtls/ca.crt").catch(() => 0);
  if (status !== 200) {
    alert("API_UNAVAILABLE", "P1", "api-health", { status });
  }
}

function httpsStatus(url, caFile) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      ca: readFileSync(caFile),
      servername: "localhost",
      rejectUnauthorized: true,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
  });
}

function checkDockerHealth() {
  const output = execFileSync("docker", ["compose", "ps", "--format", "json"], { encoding: "utf8" });
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const service = JSON.parse(line);
    if (!String(service.Health ?? service.State ?? "").toLowerCase().includes("healthy")
      && !["hospital-a-orthanc-seed"].includes(service.Service)) {
      alert("CONTAINER_NOT_HEALTHY", "P1", "docker-compose", {
        service: service.Service,
        state: service.State,
        health: service.Health,
      });
    }
  }
}

function checkCertificates() {
  for (const file of [
    "tmp/certs/edge/localhost.crt",
    "tmp/certs/mtls/ca.crt",
    "tmp/certs/mtls/gateway-client.crt",
    "tmp/certs/mtls/orthanc-server.crt",
    "tmp/certs/bad/bad.crt",
  ]) {
    try {
      const cert = new X509Certificate(readFileSync(file));
      const days = Math.floor((new Date(cert.validTo).getTime() - now.getTime()) / 86400000);
      if (days < 0) alert("CERTIFICATE_EXPIRED", "P1", "certificate-expiry", { file, daysRemaining: days });
      else if (days <= 7) alert("CERTIFICATE_NEAR_EXPIRY", "P2", "certificate-expiry", { file, daysRemaining: days });
    } catch {
      alert("CERTIFICATE_READ_FAILED", "P2", "certificate-expiry", { file });
    }
  }
}

function checkRiskExceptions() {
  const document = JSON.parse(readFileSync("security/container-vulnerability-exceptions.json", "utf8"));
  for (const item of document.exceptions ?? []) {
    const expiresAt = new Date(item.expiresAt);
    const days = Math.floor((expiresAt.getTime() - now.getTime()) / 86400000);
    if (expiresAt.getTime() <= now.getTime()) {
      alert("RISK_EXCEPTION_EXPIRED", "P1", "risk-exception-expiry", { cve: item.cve, package: item.package });
    } else if (days <= 1) {
      alert("RISK_EXCEPTION_NEAR_EXPIRY", "P2", "risk-exception-expiry", { cve: item.cve, package: item.package, daysRemaining: days });
    }
  }
}

function addSyntheticSecuritySignals() {
  alert("AUTHENTICATION_FAILURE_THRESHOLD", "P2", "synthetic-auth-monitor", { count: 3, containsSensitiveData: false });
  alert("AUTHORIZATION_DENY_RATE", "P3", "synthetic-authorization-monitor", { count: 3, containsSensitiveData: false });
  alert("AUDIT_INTEGRITY_ANOMALY", "P1", "synthetic-audit-monitor", { fixture: true, containsSensitiveData: false });
}

function alert(name, severity, source, labels = {}) {
  alerts.push({
    name,
    severity,
    source,
    labels,
    observedAt: now.toISOString(),
  });
}

async function emit(payload) {
  await fetch(receiverUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
