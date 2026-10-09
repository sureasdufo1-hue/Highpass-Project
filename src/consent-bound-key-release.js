import { createHash, randomUUID } from "node:crypto";
import { parseDataPlaneRequest, revalidateDataPlaneReceipt } from "./data-plane-authorization.js";

const fields = ["packageId", "keyId", "wrappedKeyHash", "ciphertextHash", "manifestHash", "recipientHospitalId"];
const digest = value => createHash("sha256").update(value).digest("hex");
const keyPattern = /^https:\/\/[a-z0-9][a-z0-9-]{1,22}[a-z0-9]\.vault\.azure\.net\/keys\/[A-Za-z0-9-]{1,127}\/[a-f0-9]{32}$/u;

function binding(input, configuration) {
  if (!input || Object.keys(input).sort().join() !== [...fields].sort().join()
    || typeof input.packageId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(input.packageId)
    || !fields.slice(2, 5).every(field => typeof input[field] === "string" && /^[a-f0-9]{64}$/u.test(input[field]))
    || input.keyId !== configuration.keyId || input.recipientHospitalId !== configuration.recipientHospitalId) throw new Error("KEY_RELEASE_BINDING_INVALID");
  return Object.freeze(Object.fromEntries(fields.map(field => [field, input[field]])));
}

/** Internal service component only. HTTP principal checks are required before
 * exposing either method. Not the v3 patient-approval/rewrap implementation.
 * Repository must durably persist metadata and atomically consume releases.
 */
export class ConsentBoundKeyRelease {
  constructor({ service, repository, configuration }) {
    if (!service || repository?.persistent !== true || !["create", "read", "consume"].every(name => typeof repository[name] === "function")
      || !keyPattern.test(configuration?.keyId)
      || ![configuration?.sourceHospitalId, configuration?.recipientHospitalId].every(value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value))
      || configuration.sourceHospitalId === configuration.recipientHospitalId) throw new Error("KEY_RELEASE_DEPENDENCIES_REQUIRED");
    parseDataPlaneRequest({ method: "GET", path: "/dicomweb/studies" }, configuration.publicBaseUrl);
    this.service = service;
    this.repository = repository;
    this.configuration = Object.freeze({ ...configuration });
  }

  async prepare(input) {
    try { return await this.#prepare(input); }
    catch (error) { await this.#deny(); throw error; }
  }

  async authorizeWrap(input) {
    try {
      if (!input || Object.keys(input).sort().join() !== ["keyId", "packageId", "receipt"].sort().join()
        || typeof input.packageId !== "string" || !/^pkg_[A-Za-z0-9_-]{16,80}$/u.test(input.packageId)
        || input.keyId !== this.configuration.keyId) throw new Error("KEY_RELEASE_BINDING_INVALID");
      const authority = await revalidateDataPlaneReceipt(this.service, input.receipt, this.configuration);
      if (authority.status !== 200 || authority.grant.targetHospitalId !== this.configuration.recipientHospitalId) throw new Error("KEY_RELEASE_POLICY_DENIED");
      if (!["instance", "frame"].includes(authority.route.kind) || !authority.route.sopInstanceUid) throw new Error("KEY_RELEASE_INSTANCE_REQUIRED");
      await this.audit(authority, input.packageId, "KEY_WRAP_AUTHORIZED");
      return true;
    } catch (error) { await this.#deny(); throw error; }
  }

  async #prepare({ receipt, packageBinding }) {
    const snapshot = binding(packageBinding, this.configuration);
    const authority = await revalidateDataPlaneReceipt(this.service, receipt, this.configuration);
    if (authority.status !== 200 || authority.grant.targetHospitalId !== snapshot.recipientHospitalId) throw new Error("KEY_RELEASE_POLICY_DENIED");
    // Only a single selected Instance/Frame can become an encrypted package.
    if (!["instance", "frame"].includes(authority.route.kind) || !authority.route.sopInstanceUid) throw new Error("KEY_RELEASE_INSTANCE_REQUIRED");
    const releaseId = randomUUID();
    await this.repository.create({ releaseId, receiptHash: digest(receipt), binding: snapshot,
      tokenId: authority.grant.tokenId, consentId: authority.grant.consentId,
      doctorId: authority.grant.doctorId, auditSessionId: authority.grant.auditSessionId,
      sourceHospitalId: authority.grant.sourceHospitalId, expiresAt: authority.grant.deadline });
    await this.audit(authority, releaseId, "KEY_RELEASE_PREPARED");
    return Object.freeze({ releaseId, expiresAt: authority.grant.deadline });
  }

  async authorize(input) {
    try { return await this.#authorize(input); }
    catch (error) { await this.#deny(input?.releaseId); throw error; }
  }

  async #authorize({ releaseId, receipt, packageBinding, phase, authenticatedHospitalId }) {
    if (!/^[a-f0-9-]{36}$/u.test(releaseId) || !["BEFORE_UNWRAP", "AFTER_UNWRAP"].includes(phase)
      || authenticatedHospitalId !== this.configuration.recipientHospitalId) throw new Error("KEY_RELEASE_PRINCIPAL_INVALID");
    const snapshot = binding(packageBinding, this.configuration);
    const record = await this.repository.read(releaseId);
    if (!record || record.receiptHash !== digest(receipt ?? "") || fields.some(field => record.binding[field] !== snapshot[field])
      || record.consumed || !Number.isSafeInteger(record.expiresAt)
      || !Number.isFinite(Date.parse(this.service.clock())) || Date.parse(this.service.clock()) >= record.expiresAt) throw new Error("KEY_RELEASE_BINDING_INACTIVE");
    const authority = await revalidateDataPlaneReceipt(this.service, receipt, this.configuration);
    if (authority.status !== 200 || authority.grant.targetHospitalId !== authenticatedHospitalId
      || ["tokenId", "consentId", "doctorId", "auditSessionId", "sourceHospitalId"].some(field => authority.grant[field] !== record[field])) throw new Error("KEY_RELEASE_POLICY_DENIED");
    if (phase === "AFTER_UNWRAP" && await this.repository.consume(releaseId) !== true) throw new Error("KEY_RELEASE_ALREADY_CONSUMED");
    // Audit failure after consumption denies plaintext; no rollback/retry bypass.
    await this.audit(authority, releaseId, phase === "AFTER_UNWRAP" ? "KEY_RELEASE_CONSUMED" : "KEY_RELEASE_PRECHECKED");
    return true;
  }

  async #deny(releaseId) {
    await this.service.writeAudit({ actorType: "GATEWAY",
      actorId: /^[a-f0-9-]{36}$/u.test(releaseId ?? "") ? `key-release:${releaseId}` : "key-release",
      action: "ACCESS_DENIED", result: "FAIL", reason: "KEY_RELEASE_DENIED" });
    await this.service.store.save();
  }

  async audit(authority, releaseId, action) {
    const grant = authority.grant;
    await this.service.writeAudit({ actorType: "GATEWAY", actorId: `key-release:${releaseId}`,
      action, result: "SUCCESS", reason: action, consentId: grant.consentId,
      auditSessionId: grant.auditSessionId, sourceHospitalId: grant.sourceHospitalId,
      targetHospitalId: grant.targetHospitalId, studyInstanceUid: grant.studyInstanceUid,
      seriesInstanceUid: authority.route.seriesInstanceUid, sopInstanceUid: authority.route.sopInstanceUid });
    await this.service.store.save();
  }
}

/** Parameterized durable ledger. Initialization belongs to the deployment
 * migration, not request handling. Never stores signed receipts or image/DEK.
 */
export class PostgresKeyReleaseRepository {
  persistent = true;
  constructor(pool) { this.pool = pool; }
  async create(record) {
    await this.pool.query("INSERT INTO capstone_key_releases (release_id, metadata, expires_at) VALUES ($1, $2::jsonb, to_timestamp($3 / 1000.0))", [record.releaseId, JSON.stringify(record), record.expiresAt]);
  }
  async read(releaseId) {
    const result = await this.pool.query("SELECT metadata, consumed_at IS NOT NULL AS consumed FROM capstone_key_releases WHERE release_id = $1", [releaseId]);
    return result.rows[0] ? { ...result.rows[0].metadata, consumed: result.rows[0].consumed } : null;
  }
  async consume(releaseId) {
    const result = await this.pool.query("UPDATE capstone_key_releases SET consumed_at = clock_timestamp() WHERE release_id = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING release_id", [releaseId]);
    return result.rowCount === 1;
  }
}
