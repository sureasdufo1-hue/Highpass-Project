import { readFileSync } from "node:fs";
import { createAzureCertificateCredential } from "../src/azure-certificate-credential.js";

export function hospitalKeyConfig(role) {
  const directory = process.env.CAPSTONE_KEY_IDENTITY_DIR;
  const keyId = process.env.CAPSTONE_VAULT_KEY_ID;
  if (directory !== "/run/key-identity" || !keyId) throw new Error("HOSPITAL_KEY_CONFIG_REQUIRED");
  const identity = JSON.parse(readFileSync(`${directory}/identity.json`, "utf8"));
  if (identity.role !== role) throw new Error("HOSPITAL_KEY_ROLE_MISMATCH");
  return { keyId, tokenProvider: createAzureCertificateCredential({ tenantId: identity.tenantId, clientId: identity.clientId,
    certificate: readFileSync(`${directory}/identity.crt`), privateKey: readFileSync(`${directory}/identity.key`) }) };
}
