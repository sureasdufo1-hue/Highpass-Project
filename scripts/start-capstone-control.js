// Cloud metadata-only entrypoint. Secrets remain external files/process memory.
import { readFileSync } from "node:fs";

for (const name of ["POSTGRES_PASSWORD", "DICOM_TOKEN_SECRET", "TEST_JWT_SECRET", "HIPASS_INGRESS_SECRET", "HIPASS_DATA_PLANE_SERVICE_TOKEN"]) {
  const filename = process.env[`${name}_FILE`];
  if (!filename) throw new Error(`${name}_FILE required`);
  const value = readFileSync(filename, "utf8").trim();
  if (value.length < 32 || value.length > 256 || /[\r\n\0]/u.test(value)) throw new Error(`${name} invalid`);
  process.env[name] = value;
}
if (new Set([process.env.DICOM_TOKEN_SECRET, process.env.TEST_JWT_SECRET, process.env.HIPASS_INGRESS_SECRET, process.env.HIPASS_DATA_PLANE_SERVICE_TOKEN]).size !== 4) throw new Error("Role secrets must be distinct");
if (process.env.HIPASS_CAPSTONE_KEY_RELEASE === "1") {
  const value = readFileSync(process.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN_FILE, "utf8").trim();
  if (value.length < 32 || value.length > 256 || /[\r\n\0]/u.test(value)
    || [process.env.POSTGRES_PASSWORD, process.env.DICOM_TOKEN_SECRET, process.env.TEST_JWT_SECRET, process.env.HIPASS_INGRESS_SECRET, process.env.HIPASS_DATA_PLANE_SERVICE_TOKEN].includes(value)) throw new Error("Invalid distinct recipient key-release credential");
  process.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN = value;
}
if (process.env.HIPASS_CAPSTONE_MOCK_IDP === "1") {
  const key = readFileSync(process.env.HIPASS_CAPSTONE_LOGIN_KEY_FILE, "utf8").trim();
  if (key.length < 32 || key.length > 128 || /[\r\n\0]/.test(key) || [process.env.DICOM_TOKEN_SECRET, process.env.TEST_JWT_SECRET, process.env.HIPASS_INGRESS_SECRET, process.env.HIPASS_DATA_PLANE_SERVICE_TOKEN, process.env.HIPASS_KEY_RELEASE_SERVICE_TOKEN].includes(key)) throw new Error("Invalid separate capstone presenter key");
  process.env.HIPASS_CAPSTONE_LOGIN_KEY = key;
}
if (process.env.HIPASS_CONTROL_PLANE_ONLY !== "1" || process.env.HIPASS_DPOP_REQUIRED !== "1" || process.env.HIPASS_STORE !== "postgres" || process.env.NODE_ENV !== "production" || process.env.AUTH_MODE !== "TEST") throw new Error("Capstone cloud boundary configuration required");
await import("./start-postgres.js");
