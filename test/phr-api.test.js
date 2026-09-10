import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const secret = "phr-api-test-secret-material-at-least-32-bytes";

test("PHR-W04 HTTP API enforces /me binding, problem details, UID minimization, and audit", async (t) => {
  const port = await availablePort();
  const tempRoot = mkdtempSync(path.join(tmpdir(), "highpass-phr-api-"));
  const databasePath = path.join(tempRoot, "hipass.json");
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      AUTH_MODE: "DEVELOPMENT_MOCK",
      HIPASS_STORE: "json",
      HIPASS_DB_PATH: databasePath,
      PORT: String(port),
      DICOM_TOKEN_SECRET: secret,
      PHR_CURSOR_SECRET: secret,
      PHR_REFERENCE_SECRET: `${secret}-reference`,
    },
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(() => child.kill());
  await waitForHealth(port, child, () => output);

  const patientHeaders = {
    "x-hipass-role": "PATIENT",
    "x-hipass-user-id": "synthetic-account-a",
    "x-hipass-patient-id": "P-1001",
    "x-request-id": "phr-api-test-correlation-a",
  };
  const summary = await request(port, "/api/v1/me/phr/summary", patientHeaders);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.patient.displayName, "합성환자 A");
  assert.equal(summary.body.meta.correlationId, "phr-api-test-correlation-a");

  const imaging = await request(port, "/api/v1/me/phr/imaging-studies", patientHeaders);
  assert.equal(imaging.status, 200);
  assert.equal(imaging.body.data[0].mappingStatus, "MAPPED");
  assert.equal(JSON.stringify(imaging.body).includes("1.2.826"), false);
  assert.equal(JSON.stringify(imaging.body).includes("urn:dicom:uid"), false);

  const imagingRef = imaging.body.data.find((item) => item.mappingStatus === "MAPPED").imagingStudyRef;
  const consent = await request(port, `/api/v1/me/phr/imaging-studies/${encodeURIComponent(imagingRef)}/consents`, patientHeaders, {
    method: "POST",
    body: {
      targetHospitalId: "HOSP-B",
      purpose: "TREATMENT",
      permission: "VIEW_ONLY",
      validUntil: "2026-12-31T10:00:00.000Z",
    },
  });
  assert.equal(consent.status, 201);
  const handoff = await request(port, `/api/consents/${consent.body.data.consentId}/handoff-ticket`, patientHeaders, {
    method: "POST",
    body: {},
  });
  assert.equal(handoff.status, 201);
  assert.match(handoff.body.qr.payload, /\/t\/[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(handoff.body).includes("1.2.410"), false);

  const wrongPatientHandoff = await request(port, `/api/consents/${consent.body.data.consentId}/handoff-ticket`, {
    ...patientHeaders,
    "x-hipass-user-id": "synthetic-account-b",
    "x-hipass-patient-id": "P-1002",
  }, { method: "POST", body: {} });
  assert.equal(wrongPatientHandoff.status, 403);
  assert.equal(wrongPatientHandoff.body.error, "PATIENT_IDENTITY_MISMATCH");

  const nonce = handoff.body.qr.payload.split("/").at(-1);
  const doctorHeaders = {
    "x-hipass-role": "DOCTOR",
    "x-hipass-user-id": "DOC-B-01",
    "x-hipass-doctor-id": "DOC-B-01",
    "x-hipass-hospital-id": "HOSP-B",
  };
  const redemption = await request(port, "/api/transfers/tickets/redeem-viewer", doctorHeaders, {
    method: "POST",
    body: { nonce },
  });
  assert.equal(redemption.status, 200);
  assert.equal(redemption.body.decision, "ALLOWED");
  assert.ok(redemption.body.accessToken);
  assert.ok(redemption.body.viewerContext.studyInstanceUid);
  assert.equal(redemption.body.viewerContext.targetHospitalId, "HOSP-B");
  const replay = await request(port, "/api/transfers/tickets/redeem-viewer", doctorHeaders, {
    method: "POST",
    body: { nonce },
  });
  assert.equal(replay.status, 403);
  assert.equal(replay.body.reasonCode, "TICKET_ALREADY_USED");

  const forbiddenQuery = await request(port, "/api/v1/me/phr/observations?patientId=P-1002", patientHeaders);
  assert.equal(forbiddenQuery.status, 422);
  assert.match(forbiddenQuery.contentType, /^application\/problem\+json/);
  assert.equal(forbiddenQuery.body.code, "PHR_RESOURCE_UNSUPPORTED");
  assert.equal(forbiddenQuery.body.auditSessionId, "phr-api-test-correlation-a");
  assert.equal("detail" in forbiddenQuery.body, false);

  const wrongBinding = await request(port, "/api/v1/me/phr/summary", {
    ...patientHeaders,
    "x-hipass-patient-id": "P-1002",
    "x-request-id": "phr-api-test-wrong-binding",
  });
  assert.equal(wrongBinding.status, 403);
  assert.equal(wrongBinding.body.code, "PHR_PATIENT_BINDING_MISMATCH");

  const doctor = await request(port, "/api/v1/me/phr/summary", {
    "x-hipass-role": "DOCTOR",
    "x-hipass-user-id": "DOC-A-01",
    "x-hipass-doctor-id": "DOC-A-01",
    "x-hipass-hospital-id": "HOSP-A",
    "x-request-id": "phr-api-test-doctor-denied",
  });
  assert.equal(doctor.status, 403);
  assert.equal(doctor.body.code, "PHR_PATIENT_BINDING_MISMATCH");

  await new Promise((resolve) => setTimeout(resolve, 30));
  const persisted = JSON.parse(readFileSync(databasePath, "utf8"));
  const phrAudit = persisted.auditLogs.filter((entry) => entry.action.startsWith("PHR_"));
  assert.ok(phrAudit.some((entry) => entry.action === "PHR_ACCESS_ALLOWED"));
  assert.ok(phrAudit.some((entry) => entry.action === "PHR_IMAGING_MAPPING_CHECKED"));
  assert.ok(phrAudit.some((entry) => entry.action === "PHR_ACCESS_DENIED"));
  assert.ok(phrAudit.some((entry) => entry.action === "PHR_ACCESS_DENIED" && entry.actorId === "DOC-A-01" && entry.actorType === "DOCTOR"));
  assert.ok(phrAudit.every((entry) => !entry.studyInstanceUid && !entry.seriesInstanceUid && !entry.sopInstanceUid));
  assert.equal(JSON.stringify(phrAudit).includes("1.2.826"), false);
});

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, child, output) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`PHR API exited early: ${output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`PHR API startup timeout: ${output()}`);
}

async function request(port, pathname, headers, options = {}) {
  const requestHeaders = { ...headers };
  if (options.body !== undefined) requestHeaders["content-type"] = "application/json";
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: options.method ?? "GET",
    headers: requestHeaders,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.json(),
  };
}
