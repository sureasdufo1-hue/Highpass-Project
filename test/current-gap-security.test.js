import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import vm from "node:vm";
import { getHospitalMasterKek } from "../src/pacs-crypto-engine.js";
import { importStudyToHospitalBPacs } from "../src/pacs-import-engine.js";
import { OrthancClient } from "../src/orthanc-client.js";

const patient = { "x-hipass-role": "PATIENT", "x-hipass-patient-id": "P-1001" };

test("FIX-001/002 isolated HTTP: mobile binding and hospital archive ACL", { timeout: 20000 }, async (t) => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const dir = await mkdtemp(path.join(tmpdir(), "highpass-gap-http-"));
  const child = spawn(process.execPath, ["src/server.js"], {
    windowsHide: true, stdio: "pipe",
    env: { ...process.env, NODE_ENV: "development", AUTH_MODE: "DEVELOPMENT_MOCK", HIPASS_STORE: "json", HIPASS_DB_PATH: path.join(dir, "db.json"), PORT: String(port), DICOM_TOKEN_SECRET: randomBytes(32).toString("hex") },
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const ended = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await ended;
    }
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (url, headers = {}, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000),
    });
    return { status: res.status, body: await res.json() };
  };
  const started = Date.now();
  while (true) {
    try { if ((await request("/api/health")).status === 200) break; } catch {}
    if (Date.now() - started > 8000 || child.exitCode !== null) throw new Error(`Isolated server failed: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await t.test("unauthenticated mobile calls are denied", async () => {
    for (const [url, body] of [["device", undefined], ["vault", undefined], ["vault/erase", {}], ["auth/login", {}]]) {
      assert.equal((await request(`/api/v1/mobile/${url}`, {}, body)).status, 401);
    }
  });
  await t.test("wrong-patient login cannot create success audit", async () => {
    assert.equal((await request("/api/v1/mobile/auth/login", patient, { patientId: "P-1002" })).status, 403);
    const data = JSON.parse(await readFile(path.join(dir, "db.json"), "utf8"));
    assert.equal(data.auditLogs.some((item) => item.action === "PATIENT_QUICK_AUTH_LOGIN"), false);
  });
  await t.test("simulator claims no hardware attestation or successful deletion", async () => {
    const login = await request("/api/v1/mobile/auth/login", patient, { patientId: "P-1001", method: "BIO" });
    assert.equal(login.status, 200);
    assert.equal(login.body.fido2Attested, false);
    assert.equal(login.body.enclaveVerified, false);
    assert.equal(login.body.simulation, true);
    const device = await request("/api/v1/mobile/device", patient);
    assert.equal(device.body.attestation, "NOT VERIFIED");
    assert.equal(device.body.patientId, "P-1001");
    assert.equal((await request("/api/v1/mobile/vault/erase", patient, {})).status, 501);
  });
  await t.test("patient without query filter receives only own imaging", async () => {
    const own = await request("/api/imaging-studies", patient);
    assert.equal(own.status, 200);
    assert.ok(own.body.length > 0);
    assert.ok(own.body.every((item) => item.patientId === "P-1001"));
    assert.equal((await request("/api/imaging-studies?patientId=P-1002", patient)).status, 403);
  });
  await t.test("B archive denies patient and foreign hospital doctor", async () => {
    assert.equal((await request("/api/transfers/pacs-archive", patient)).status, 403);
    const doctor = { "x-hipass-role": "DOCTOR", "x-hipass-doctor-id": "DOC-A-01", "x-hipass-hospital-id": "HOSP-A" };
    assert.equal((await request("/api/transfers/pacs-archive", doctor)).status, 403);
    assert.equal((await request("/api/transfers/pacs-archive", { ...doctor, "x-hipass-doctor-id": "DOC-B-01", "x-hipass-hospital-id": "HOSP-B" })).status, 200);
  });
  await t.test("unverified clinical assets are disabled by default", async () => {
    assert.equal((await request("/assets/clinical/ct-slice.jpg")).status, 404);
  });
  await t.test("client cannot select a server filesystem destination", async () => {
    assert.equal((await request("/api/transfers/pacs-import", patient, { studyInstanceUid: "1.2.3", destDir: "C:/outside" })).status, 400);
  });
  await t.test("readiness stays responsive after rejected token probes", async () => {
    for (let i = 0; i < 2; i++) assert.equal((await request("/dicomweb/studies", { authorization: "Bearer invalid.token" })).status, 403);
    const started = Date.now();
    assert.equal((await request("/api/health")).status, 200);
    assert.ok(Date.now() - started < 2000, "readiness must not inherit a security tarpit delay");
  });
});

test("FIX-005: unconfigured and malformed runtime KEK fail closed", () => {
  const saved = process.env.HIPASS_HOSPITAL_B_KEK;
  try {
    delete process.env.HIPASS_HOSPITAL_B_KEK;
    assert.throws(() => getHospitalMasterKek(), (error) => error.code === "KEK_NOT_CONFIGURED");
    process.env.HIPASS_HOSPITAL_B_KEK = "weak-password";
    assert.throws(() => getHospitalMasterKek(), (error) => error.code === "INVALID_KEK_CONFIGURATION");
    process.env.HIPASS_HOSPITAL_B_KEK = randomBytes(32).toString("hex");
    assert.equal(getHospitalMasterKek().length, 32);
  } finally {
    if (saved === undefined) delete process.env.HIPASS_HOSPITAL_B_KEK;
    else process.env.HIPASS_HOSPITAL_B_KEK = saved;
  }
});

test("strict source retrieval cannot substitute curated/synthetic data", async () => {
  const client = new OrthancClient();
  client.findInstanceByUid = async () => ({ _curated: true });
  await assert.rejects(client.wadoInstance("1.2.3", "1.2.3.1", "1.2.3.1.1", { allowSyntheticFallback: false }), /SOURCE_OBJECT_UNAVAILABLE/);
  client.findInstanceByUid = async () => { throw new Error("SOURCE_DOWN"); };
  await assert.rejects(client.wadoInstance("1.2.3", "1.2.3.1", "1.2.3.1.1", { allowSyntheticFallback: false }), /SOURCE_DOWN/);
});

test("FIX-004: source error cannot become a synthetic successful archive", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "highpass-source-fail-"));
  try {
    await assert.rejects(importStudyToHospitalBPacs({
      studyInstanceUid: "1.2.3", kek: randomBytes(32), baseDestDir: dir,
      studyData: { series: [{ seriesInstanceUid: "1.2.3.1", instances: [{ sopInstanceUid: "1.2.3.1.1" }] }] },
      orthancClient: { wadoInstance: async () => { throw new Error("SOURCE_DOWN"); } },
      allowSynthetic: true,
    }), (error) => error.code === "SOURCE_RETRIEVAL_FAILED");
    await assert.rejects(access(path.join(dir, "1.2.3", "manifest.json")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("FIX-003: patient viewer stays closed after self-view rejection", async () => {
  const source = await readFile("public/app.js", "utf8");
  const start = source.indexOf("async function openPatientStudyViewer(");
  const end = source.indexOf("function updatePatientViewerControls(", start);
  let setupCount = 0;
  const messages = [];
  const context = vm.createContext({
    lastStudies: [{ studyInstanceUid: "1.2.3" }], demo: { patientId: "P-1001" },
    postJson: async () => { throw new Error("DENY"); }, showToast: (message) => messages.push(message),
    patientViewerState: new Proxy({}, { set() { setupCount++; return true; } }), encodeURIComponent,
  });
  vm.runInContext(source.slice(start, end), context);
  await vm.runInContext('openPatientStudyViewer("1.2.3")', context);
  assert.equal(setupCount, 0);
  assert.equal(messages.length, 1);
});
