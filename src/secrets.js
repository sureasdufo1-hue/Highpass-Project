const DEFAULT_SECRET_PATTERNS = [
  /changeme/i,
  /replace-with/i,
  /password/i,
  /secret/i,
  /123456/,
  /development-only-key/i,
  /local-node-server/i,
];

export class SecretProvider {
  getSecret() {
    throw new Error("SecretProvider#getSecret must be implemented");
  }
}

export class EnvironmentSecretProvider extends SecretProvider {
  constructor(env = process.env) {
    super();
    this.env = env;
    this.provider = "ENVIRONMENT";
  }

  getSecret(name, options = {}) {
    const value = this.env[name];
    if (!value && options.required) {
      throw new Error(`${name}_REQUIRED`);
    }
    if (value && options.rejectDefault && isDefaultSecret(value)) {
      throw new Error(`${name}_DEFAULT_SECRET_FORBIDDEN`);
    }
    return value ?? options.defaultValue ?? null;
  }
}

export class TestSecretProvider extends SecretProvider {
  constructor(values = {}) {
    super();
    this.values = values;
    this.provider = "TEST";
  }

  getSecret(name, options = {}) {
    const value = this.values[name];
    if (!value && options.required) throw new Error(`${name}_REQUIRED`);
    return value ?? options.defaultValue ?? null;
  }
}

export class ExternalSecretProvider extends SecretProvider {
  constructor() {
    super();
    this.provider = "EXTERNAL_SECRET_PROVIDER_INTERFACE";
  }

  getSecret() {
    throw new Error("External secret manager integration is NOT VERIFIED in local MVP");
  }
}

export function createSecretProvider(env = process.env) {
  if (env.SECRET_PROVIDER === "EXTERNAL") return new ExternalSecretProvider();
  return new EnvironmentSecretProvider(env);
}

export function isDefaultSecret(value) {
  return DEFAULT_SECRET_PATTERNS.some((pattern) => pattern.test(String(value ?? "")));
}

export function validateProductionSecrets(env = process.env) {
  if (String(env.NODE_ENV ?? "").toLowerCase() !== "production") return { ok: true, checked: 0 };
  const required = [
    "DATABASE_URL",
    "DICOM_TOKEN_SECRET",
    "HIPASS_INTERNAL_SERVICE_TOKEN",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    "JWT_PUBLIC_KEY",
    "AUDIT_HASH_SECRET",
    "PSEUDONYM_HMAC_SECRET",
  ];
  const failures = [];
  for (const name of required) {
    const value = env[name];
    if (!value) failures.push({ name, reason: "MISSING" });
    else if (isDefaultSecret(value)) failures.push({ name, reason: "DEFAULT_OR_PLACEHOLDER" });
  }
  return {
    ok: failures.length === 0,
    checked: required.length,
    failures,
  };
}
