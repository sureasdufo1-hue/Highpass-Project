import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthError } from "../src/auth.js";
import { ExternalHttpKeyProvider, LocalDevelopmentKeyProvider } from "../src/key-provider.js";
import { JwksCache, fetchOidcDiscovery, verifyJwtWithJwks } from "../src/oidc-jwks.js";
import { HipassService } from "../src/services.js";
import { JsonStore } from "../src/store.js";

test("OIDC discovery, JWKS lookup, unknown kid denial, and rotation work over HTTP", async () => {
  const keyA = createRsaJwkPair("oidc-a");
  const keyB = createRsaJwkPair("oidc-b");
  let activeKeys = [keyA.publicJwk];
  const { server, baseUrl } = await startOidcServer(() => activeKeys);
  const cache = new JwksCache({ ttlMs: 60_000 });
  try {
    const discovery = await fetchOidcDiscovery(`${baseUrl}/.well-known/openid-configuration`);
    assert.equal(discovery.issuer, baseUrl);
    assert.equal(discovery.jwks_uri, `${baseUrl}/jwks`);

    const tokenA = signRs256Jwt(keyA.privateKey, "oidc-a", {
      iss: baseUrl,
      aud: "hipass-api",
      sub: "doctor-subject",
      roles: ["DOCTOR"],
      doctorId: "DOC-A-01",
      hospitalId: "HOSP-A",
    });
    const claimsA = await verifyJwtWithJwks(tokenA, {
      discoveryUrl: discovery.issuer + "/.well-known/openid-configuration",
      issuer: baseUrl,
      audience: "hipass-api",
      cache,
    });
    assert.equal(claimsA.hospitalId, "HOSP-A");

    const unknownKid = signRs256Jwt(keyB.privateKey, "oidc-x", {
      iss: baseUrl,
      aud: "hipass-api",
      sub: "doctor-subject",
      roles: ["DOCTOR"],
      doctorId: "DOC-A-01",
      hospitalId: "HOSP-A",
    });
    await assert.rejects(() => verifyJwtWithJwks(unknownKid, {
      discoveryUrl: discovery.issuer + "/.well-known/openid-configuration",
      issuer: baseUrl,
      audience: "hipass-api",
      cache,
    }), (error) => error instanceof AuthError && error.code === "JWT_KID_UNKNOWN");

    activeKeys = [keyB.publicJwk];
    const tokenB = signRs256Jwt(keyB.privateKey, "oidc-b", {
      iss: baseUrl,
      aud: "hipass-api",
      sub: "doctor-subject-b",
      roles: ["DOCTOR"],
      doctorId: "DOC-B-01",
      hospitalId: "HOSP-B",
    });
    const claimsB = await verifyJwtWithJwks(tokenB, {
      discoveryUrl: discovery.issuer + "/.well-known/openid-configuration",
      issuer: baseUrl,
      audience: "hipass-api",
      cache,
    });
    assert.equal(claimsB.hospitalId, "HOSP-B");
  } finally {
    await closeServer(server);
  }
});

test("DICOM token key rotation keeps verify-only keys and rejects retired keys", async () => {
  const { dir, service } = await createServiceWithKeys(new LocalDevelopmentKeyProvider(null, null, [{
    kid: "dicom-v1",
    material: "dicom-v1-material",
    status: "ACTIVE",
    provider: "TEST_ROTATING",
    createdAt: "2026-01-01T00:00:00.000Z",
    activatedAt: "2026-01-01T00:00:00.000Z",
    retiredAt: null,
  }]));
  try {
    const provider = service.dicomTokenKeyProvider;
    const first = await service.requestDicomAccessToken(accessRequest());
    assert.equal(decodeHeader(first.accessToken).kid, "dicom-v1");

    provider.rotate({ kid: "dicom-v2", material: "dicom-v2-material" });
    const second = await service.requestDicomAccessToken(accessRequest());
    assert.equal(decodeHeader(second.accessToken).kid, "dicom-v2");
    assert.equal((await service.verifyDicomAccessToken(first.accessToken, tokenScope())).active, true);

    provider.retire("dicom-v1");
    const retired = await service.verifyDicomAccessToken(first.accessToken, tokenScope());
    assert.equal(retired.active, false);
    assert.equal(retired.reason, "TOKEN_INVALID");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("external HTTP key provider fails closed when runtime provider is unavailable", async () => {
  const provider = new ExternalHttpKeyProvider("http://127.0.0.1:1");
  await assert.rejects(() => provider.currentKeyAsync(), /EXTERNAL_KEY_PROVIDER_UNAVAILABLE|fetch failed|ECONNREFUSED/);
});

async function createServiceWithKeys(keyProvider) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hipass-runtime-security-"));
  const store = new JsonStore(path.join(dir, "db.json"));
  await store.load();
  return {
    dir,
    store,
    service: new HipassService(store, () => "2026-06-25T10:00:00.000Z", {
      tokenSecret: "runtime-security-test-secret",
      dicomTokenKeyProvider: keyProvider,
    }),
  };
}

function createRsaJwkPair(kid) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKey,
    publicJwk: { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" },
  };
}

async function startOidcServer(keysProvider) {
  let baseUrl;
  const server = createServer((request, response) => {
    if (request.url === "/.well-known/openid-configuration") {
      sendJson(response, {
        issuer: baseUrl,
        jwks_uri: `${baseUrl}/jwks`,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
      });
      return;
    }
    if (request.url === "/jwks") {
      sendJson(response, { keys: keysProvider() });
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { server, baseUrl };
}

function sendJson(response, body) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function signRs256Jwt(privateKey, kid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid }), "utf8").toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    exp: now + 300,
    iat: now,
    ...claims,
  }), "utf8").toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
}

function accessRequest() {
  return {
    consentId: "CONSENT-DEMO-ACTIVE",
    doctorId: "DOC-B-01",
    requestingHospitalId: "HOSP-B",
    studyInstanceUid: "1.2.410.100.1.20260620.001",
    seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    purpose: "TREATMENT",
    requestedAction: "VIEW",
  };
}

function tokenScope() {
  return {
    targetHospitalId: "HOSP-B",
    studyInstanceUid: "1.2.410.100.1.20260620.001",
    seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    requestedAction: "VIEW",
  };
}

function decodeHeader(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

async function closeServer(server) {
  server.close();
  await once(server, "close");
}
