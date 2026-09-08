export const RetentionDataType = Object.freeze({
  CONSENT: "CONSENT",
  REVOKED_CONSENT: "REVOKED_CONSENT",
  EXPIRED_CONSENT: "EXPIRED_CONSENT",
  IMAGING_STUDY_METADATA: "IMAGING_STUDY_METADATA",
  AUDIT_LOG: "AUDIT_LOG",
  ACCESS_TOKEN_LOG: "ACCESS_TOKEN_LOG",
  TRANSFER_TICKET: "TRANSFER_TICKET",
  IP_ADDRESS: "IP_ADDRESS",
  TEMPORARY_CACHE: "TEMPORARY_CACHE",
  TEMPORARY_DICOM: "TEMPORARY_DICOM",
  RESEARCH_DERIVATION: "RESEARCH_DERIVATION",
  PSEUDONYM_MAPPING: "PSEUDONYM_MAPPING",
});

export const RetentionPurgeMode = Object.freeze({
  DRY_RUN: "DRY_RUN",
  ENFORCE: "ENFORCE",
});

export function buildRetentionPolicies(env = process.env) {
  return [
    policy(RetentionDataType.CONSENT, "Patient consent evidence", "Control Plane DB: consents", "LEGAL RETENTION PERIOD NOT DETERMINED", "Manual legal review or patient lifecycle closure", "soft-delete candidate only", false),
    policy(RetentionDataType.REVOKED_CONSENT, "Revocation evidence and dispute handling", "Control Plane DB: consents", "LEGAL RETENTION PERIOD NOT DETERMINED", "Legal retention decision", "retain audit evidence, then soft-delete candidate", false),
    policy(RetentionDataType.EXPIRED_CONSENT, "Expired consent history", "Control Plane DB: consents", "LEGAL RETENTION PERIOD NOT DETERMINED", "Legal retention decision", "soft-delete candidate only", false),
    policy(RetentionDataType.IMAGING_STUDY_METADATA, "Minimum routing and consent scope metadata", "Control Plane DB: imaging_studies, imaging_series", "LEGAL RETENTION PERIOD NOT DETERMINED", "Source hospital/patient lifecycle decision", "metadata purge candidate only", false),
    policy(RetentionDataType.AUDIT_LOG, "Security audit and dispute evidence", "Control Plane DB: audit_logs", "LEGAL RETENTION PERIOD NOT DETERMINED", "Legal retention decision", "append-only retention; no normal purge", false),
    policy(RetentionDataType.ACCESS_TOKEN_LOG, "Short-lived DICOMweb token audit evidence", "Control Plane DB: dicom_access_token_logs", env.HIPASS_TOKEN_LOG_RETENTION_DAYS ?? "LEGAL RETENTION PERIOD NOT DETERMINED", "Token log age exceeds configured policy", "dry-run candidate; enforce only after approval", true),
    policy(RetentionDataType.TRANSFER_TICKET, "One-time QR transfer ticket state and nonce digest (plaintext nonce is never stored)", "Control Plane DB: transfer_tickets", env.HIPASS_TICKET_LOG_RETENTION_DAYS ?? "LEGAL RETENTION PERIOD NOT DETERMINED", "Ticket expired or consumed beyond configured policy", "dry-run candidate; enforce only after approval", true),
    policy(RetentionDataType.IP_ADDRESS, "Security audit metadata", "Control Plane DB: audit_logs, transfer_usage_logs", "LEGAL RETENTION PERIOD NOT DETERMINED", "Legal retention decision", "minimize or truncate after approved period", false),
    policy(RetentionDataType.TEMPORARY_CACHE, "Transient viewer/gateway cache if introduced", "No persistent Control Plane cache currently identified", env.HIPASS_TEMP_CACHE_RETENTION_DAYS ?? "0", "Cache expires", "delete transient cache", true),
    policy(RetentionDataType.TEMPORARY_DICOM, "Temporary DICOM if introduced", "No Control Plane DICOM storage currently identified", env.HIPASS_TEMP_DICOM_RETENTION_DAYS ?? "0", "Temporary processing complete", "delete temporary object and audit", true),
    policy(RetentionDataType.RESEARCH_DERIVATION, "Approved research export tracking", "Control Plane DB: research_export_requests", "LEGAL RETENTION PERIOD NOT DETERMINED", "Research governance decision", "purge candidate after approval lifecycle", false),
    policy(RetentionDataType.PSEUDONYM_MAPPING, "Protected re-linking for research pseudonyms", "Control Plane DB: pseudonym_mappings", "LEGAL RETENTION PERIOD NOT DETERMINED", "Research linkage no longer required and legal hold cleared", "separate protected deletion ceremony", false),
  ];
}

export function planRetentionPurge(store, clock = () => new Date().toISOString(), env = process.env) {
  const mode = normalizePurgeMode(env.RETENTION_PURGE_MODE);
  const now = new Date(clock()).getTime();
  const policies = buildRetentionPolicies(env);

  return {
    mode,
    generatedAt: new Date(now).toISOString(),
    destructiveActionTaken: false,
    candidates: [
      candidateFor(store, env, mode, now, RetentionDataType.ACCESS_TOKEN_LOG, "dicomAccessTokenLogs", "tokenId", "HIPASS_TOKEN_LOG_RETENTION_DAYS"),
      candidateFor(store, env, mode, now, RetentionDataType.TRANSFER_TICKET, "transferTickets", "ticketId", "HIPASS_TICKET_LOG_RETENTION_DAYS"),
    ],
    policies,
  };
}

function candidateFor(store, env, mode, now, dataType, collectionName, idField, retentionEnvKey) {
  const retentionDays = Number(env[retentionEnvKey]);
  const candidates = Number.isFinite(retentionDays) && retentionDays >= 0
    ? collection(store, collectionName).filter((row) => isOlderThan(row.expiresAt ?? row.issuedAt, retentionDays, now))
    : [];
  const ids = candidates.map((row) => row[idField]);
  const heldIds = legalHoldIds(store, dataType);
  const approvedIds = deletionApprovalIds(store, dataType);
  const heldCount = ids.filter((id) => heldIds.has(id)).length;
  const approvedCount = ids.filter((id) => approvedIds.has(id)).length;
  return {
    dataType,
    collectionName,
    idField,
    count: candidates.length,
    ids,
    legalHoldCount: heldCount,
    approvedCount,
    action: retentionAction(mode, ids.length, heldCount, approvedCount, env),
  };
}

export async function executeRetentionPurge(store, clock = () => new Date().toISOString(), env = process.env) {
  const plan = planRetentionPurge(store, clock, env);
  if (plan.mode !== RetentionPurgeMode.ENFORCE || env.RETENTION_ALLOW_SYNTHETIC_DELETE !== "true") {
    return { ...plan, destructiveActionTaken: false, deleted: [] };
  }

  const deleted = [];
  let destructiveActionTaken = false;
  for (const candidate of plan.candidates) {
    if (!candidate.count) continue;
    const legalHold = legalHoldIds(store, candidate.dataType);
    const approved = deletionApprovalIds(store, candidate.dataType);
    const deletableIds = new Set(candidate.ids.filter((id) => approved.has(id) && !legalHold.has(id)));
    if (!deletableIds.size) continue;
    const before = collection(store, candidate.collectionName);
    store.set(candidate.collectionName, before.filter((row) => !deletableIds.has(row[candidate.idField])));
    deleted.push({ dataType: candidate.dataType, ids: [...deletableIds] });
    destructiveActionTaken = true;
  }
  if (destructiveActionTaken) await store.save?.();
  return { ...plan, destructiveActionTaken, deleted };
}

function policy(dataType, purpose, storageLocation, retentionPeriod, deletionTrigger, deletionMethod, configurable) {
  return {
    dataType,
    purpose,
    owner: "HiPass Control Plane",
    storageLocation,
    retentionBasis: retentionPeriod === "LEGAL RETENTION PERIOD NOT DETERMINED" ? "Legal review required" : "Configurable MVP policy",
    retentionPeriod,
    deletionTrigger,
    deletionMethod,
    backupTreatment: "NOT VERIFIED - backup system not implemented in local MVP",
    legalHoldSupported: true,
    configurable,
  };
}

function normalizePurgeMode(value) {
  return value === RetentionPurgeMode.ENFORCE ? RetentionPurgeMode.ENFORCE : RetentionPurgeMode.DRY_RUN;
}

function isOlderThan(value, days, nowMs) {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return false;
  return at + days * 24 * 60 * 60 * 1000 < nowMs;
}

function collection(store, name) {
  try {
    return store.get(name) ?? [];
  } catch {
    return [];
  }
}

function legalHoldIds(store, dataType) {
  return new Set(collection(store, "retentionLegalHolds")
    .filter((hold) => hold.dataType === dataType && hold.active !== false)
    .map((hold) => hold.recordId));
}

function deletionApprovalIds(store, dataType) {
  return new Set(collection(store, "retentionDeletionApprovals")
    .filter((approval) => approval.dataType === dataType && approval.status === "APPROVED")
    .map((approval) => approval.recordId));
}

function retentionAction(mode, candidateCount, legalHoldCount, approvedCount, env) {
  if (!candidateCount) return "NO_CANDIDATES";
  if (legalHoldCount) return "KEEP_LEGAL_HOLD";
  if (mode !== RetentionPurgeMode.ENFORCE) return "DRY_RUN_ONLY";
  if (env.RETENTION_ALLOW_SYNTHETIC_DELETE !== "true") return "ENFORCE_DISABLED";
  if (approvedCount < candidateCount) return "PENDING_DELETION_APPROVAL";
  return "APPROVED_FOR_SYNTHETIC_DELETE";
}
