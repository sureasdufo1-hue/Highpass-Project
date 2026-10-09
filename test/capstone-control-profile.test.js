import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("cloud profile exposes neither database nor bare Control API and enforces strict persistent policy", () => {
  const env = { ...process.env, HIPASS_APP_IMAGE: "highpass-platform-mvp:local", HIPASS_POSTGRES_IMAGE: "postgres:16-alpine", HIPASS_CLOUD_SECRET_DIR: "/opt/highpass/secrets", HIPASS_CAPSTONE_PUBLIC_ORIGIN: "https://192.168.111.149:9443" };
  const result = JSON.parse(execFileSync("docker", ["compose", "--project-directory", process.cwd(), "-f", "infra/azure/capstone-control.compose.yml", "config", "--format", "json"], { env, timeout: 15000, windowsHide: true, encoding: "utf8", stdio: "pipe" }));
  assert.ok(Object.values(result.services).every(service => !service.ports));
  assert.equal(result.services.control.environment.HIPASS_CONTROL_PLANE_ONLY, "1");
  assert.equal(result.services.control.environment.HIPASS_DPOP_REQUIRED, "1");
  assert.equal(result.services.control.environment.AUTH_MODE, "TEST");
  assert.equal(result.services.control.environment.POSTGRES_USER, "hipass_app");
  assert.equal(result.services.control.environment.POSTGRES_PASSWORD, undefined);
  assert.equal(result.services.control.environment.DICOM_TOKEN_SECRET, undefined);
  assert.equal(result.services.postgres.environment.POSTGRES_USER, "hipass_bootstrap");
  assert.equal(result.services.control.depends_on.bootstrap.condition, "service_completed_successfully");
  assert.ok(Object.values(result.networks).every(network => network.internal));
});

test("role bootstrap safely binds SQL and entrypoint reads distinct external secrets without printing them", () => {
  const bootstrap = readFileSync("scripts/bootstrap-capstone-postgres.js", "utf8");
  assert.match(bootstrap, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/u);
  assert.match(bootstrap, /\$1::text/u);
  assert.match(bootstrap, /EXISTING_PRIVILEGED_ROLE_PRESERVED/u);
  assert.doesNotMatch(bootstrap, /console\.(?:log|error)\([^)]*(?:appPassword|statement|error)/u);
  const start = readFileSync("scripts/start-capstone-control.js", "utf8");
  assert.match(start, /Role secrets must be distinct/u);
  assert.match(start, /HIPASS_CONTROL_PLANE_ONLY !== "1"/u);
  assert.doesNotMatch(start, /console\./u);
});

test("key release opt-in profile adds bounded explicit migration and external B credential, never Vault identity", () => {
  const env = { ...process.env, HIPASS_APP_IMAGE: "highpass:local", HIPASS_POSTGRES_IMAGE: "postgres:16-alpine", HIPASS_CLOUD_SECRET_DIR: "/opt/highpass/secrets", HIPASS_CAPSTONE_PUBLIC_ORIGIN: "https://192.168.111.149:9443",
    HIPASS_KEY_RELEASE_VAULT_KEY_ID: `https://capstone-demo.vault.azure.net/keys/demo/${"a".repeat(32)}` };
  const config = JSON.parse(execFileSync("docker", ["compose", "--project-directory", process.cwd(), "-f", "infra/azure/capstone-control.compose.yml", "-f", "infra/azure/capstone-control-key-release.compose.yml", "config", "--format", "json"], { env, timeout: 15000, windowsHide: true, encoding: "utf8" }));
  assert.equal(config.services.control.environment.HIPASS_CAPSTONE_KEY_RELEASE, "1");
  assert.equal(config.services.control.environment.HIPASS_KEY_RELEASE_RECIPIENT_HOSPITAL_ID, "HOSP-B");
  assert.equal(config.services.control.depends_on["key-release-migrate"].condition, "service_completed_successfully");
  assert.equal(config.services.control.environment.HIPASS_KEY_RELEASE_SERVICE_TOKEN, undefined);
  assert.ok(Object.values(config.services).every(service => !service.ports));
  assert.ok(config.services.control.volumes.every(volume => !/identity\.(?:key|crt)|capstone-key-identity/u.test(volume.source)));
  const migration = readFileSync("scripts/migrate-capstone-key-release.js", "utf8");
  assert.match(migration, /lock_timeout=3000/u);
  assert.match(migration, /statement_timeout: 5000/u);
  assert.doesNotMatch(migration, /console\.(?:log|error)\([^)]*(?:password|error|query)/u);
});
