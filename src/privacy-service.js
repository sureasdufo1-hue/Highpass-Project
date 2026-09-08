import { createHash, randomUUID } from "node:crypto";
import {
  PRIVACY_SYNC_MAX_BYTES,
  PRIVACY_SYNC_MAX_TOKENS,
  PrivacyAction,
  PrivacyErrorCode,
  PrivacyJobStatus,
  PrivacyPolicyDecision,
  PrivacyProcessingError,
  PrivacyReviewStatus,
  PrivacySystemType,
} from "./privacy-contracts.js";
import { ApprovedUseRegistry, PrivacyRuleRegistry } from "./privacy-policy.js";
import {
  applyDeterministicTransform,
  detectProtectedClinicalSpans,
  detectRequiredRuleFindings,
  mergePrivacyFindings,
  normalizeModelFindings,
} from "./privacy-rules.js";
import { normalizeForDetection } from "./privacy-unicode.js";

export class PrivacyTextInspectionService {
  constructor(options) {
    if (!options?.adapter) throw new Error("Privacy adapter is required");
    this.adapter = options.adapter;
    this.approvedUses = options.approvedUses ?? ApprovedUseRegistry.fromFile();
    this.rules = options.rules ?? PrivacyRuleRegistry.fromFile();
    this.clock = options.clock ?? (() => new Date());
  }

  async readiness() {
    const model = await this.adapter.readiness();
    return {
      status: model.ready ? "READY" : "NOT_READY",
      model,
      policyRegistry: "READY",
      approvedUseRegistry: "READY",
      contract: "PF-1",
    };
  }

  async inspect(input, principal) {
    assertInternalPrincipal(principal);
    validateInput(input);
    const approvedUse = this.approvedUses.resolve(input, "privacy:inspect", principal.userId ?? principal.subject);
    const profile = this.rules.profile(approvedUse.rulesProfile);
    const byteLength = Buffer.byteLength(input.content, "utf8");
    if (byteLength > PRIVACY_SYNC_MAX_BYTES) throw tooLarge();

    const tokenCount = await this.adapter.countTokens(input.content);
    if (tokenCount > PRIVACY_SYNC_MAX_TOKENS) throw tooLarge();

    const mappedView = normalizeForDetection(input.content, { normalization: "NFC" });
    const detection = await this.adapter.detect(mappedView.detectionText);
    const modelFindings = normalizeModelFindings(mappedView.detectionText, detection.findings, mappedView);
    const ruleFindings = detectRequiredRuleFindings(input.content, input.context, profile);
    const merged = mergePrivacyFindings(input.content, [...modelFindings, ...ruleFindings]);
    const protectedSpans = detectProtectedClinicalSpans(input.content);
    let clinicalSpanConflict = false;
    for (const finding of merged) {
      if (![PrivacySystemType.SECRET, PrivacySystemType.KR_IDENTIFIER].includes(finding.systemType)
        && protectedSpans.some((span) => overlaps(finding, span))) {
        finding.action = PrivacyAction.REVIEW;
        finding.preserve = true;
        finding.conflict = true;
        clinicalSpanConflict = true;
      }
    }
    const transformed = applyDeterministicTransform(input.content, merged, approvedUse);
    const unmappedLabel = transformed.findings.some((finding) => finding.unmapped);
    const overlapConflict = transformed.findings.some((finding) => finding.conflict);
    const qualityFlags = [
      ...(detection.warning ? ["MODEL_WARNING"] : []),
      ...(unmappedLabel ? ["UNMAPPED_LABEL"] : []),
      ...(overlapConflict ? ["OVERLAP_CONFLICT"] : []),
      ...(clinicalSpanConflict ? ["CLINICAL_SPAN_PRESERVED"] : []),
      ...(transformed.findings.length === 0 ? ["ZERO_FINDINGS_REQUIRES_REVIEW"] : []),
    ];

    return {
      contractVersion: "1.0.0",
      inspectionId: randomUUID(),
      jobStatus: PrivacyJobStatus.SUCCEEDED,
      policyDecision: PrivacyPolicyDecision.REVIEW_REQUIRED,
      reviewStatus: PrivacyReviewStatus.PENDING,
      releaseEligible: false,
      purpose: approvedUse.purpose,
      approvedUseRef: approvedUse.approvedUseRef,
      sourceArtifactRef: approvedUse.sourceArtifactRef,
      sourceArtifactVersion: approvedUse.sourceArtifactVersion,
      recipientRef: approvedUse.recipientRef,
      policyVersion: approvedUse.policyVersion,
      rulesProfile: approvedUse.rulesProfile,
      policyRegistryDigest: this.approvedUses.digest,
      rulesDigest: this.rules.digest,
      inputDigest: sha256(input.content),
      tokenCount,
      byteLength,
      redactedText: transformed.text,
      findings: transformed.findings.map((finding) => ({
        start: finding.start,
        end: finding.end,
        offsetUnit: "unicode_codepoint",
        endExclusive: true,
        nativeLabel: finding.nativeLabel,
        systemType: finding.systemType,
        action: finding.action,
        replacement: finding.replacement,
        sources: finding.sources,
        ruleIds: finding.ruleIds,
        score: finding.score,
        conflict: Boolean(finding.conflict),
        unmapped: Boolean(finding.unmapped),
      })),
      qualityFlags,
      modelRevision: detection.modelRevision ?? "UNAVAILABLE_IN_TEST_ADAPTER",
      runtimeRevision: detection.runtimeRevision ?? "UNAVAILABLE_IN_TEST_ADAPTER",
      durationMs: detection.durationMs ?? null,
      inspectedAt: this.clock().toISOString(),
    };
  }
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  if (input.mediaType !== "text/plain") {
    throw new PrivacyProcessingError(415, PrivacyErrorCode.UNSUPPORTED_MEDIA_TYPE, PrivacyErrorCode.UNSUPPORTED_MEDIA_TYPE);
  }
  for (const field of [
    "content", "approvedUseRef", "purpose", "recipientRef", "sourceOrganizationId",
    "sourceArtifactRef",
  ]) {
    if (typeof input[field] !== "string" || input[field].length === 0) throw invalid();
  }
  if (!(typeof input.sourceArtifactVersion === "string" && input.sourceArtifactVersion.length > 0)
    && !Number.isInteger(input.sourceArtifactVersion)) throw invalid();
  if (Buffer.byteLength(input.content, "utf8") > PRIVACY_SYNC_MAX_BYTES) throw tooLarge();
  if (input.context !== undefined && (!input.context || typeof input.context !== "object" || Array.isArray(input.context))) throw invalid();
}

function assertInternalPrincipal(principal) {
  if (principal?.role !== "INTERNAL_SERVICE" || !principal.scopes?.includes("privacy:inspect")) {
    throw new PrivacyProcessingError(403, PrivacyErrorCode.AUTH_REQUIRED, PrivacyErrorCode.AUTH_REQUIRED);
  }
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function invalid() {
  return new PrivacyProcessingError(422, PrivacyErrorCode.INVALID_CONTENT, PrivacyErrorCode.INVALID_CONTENT);
}

function tooLarge() {
  return new PrivacyProcessingError(413, PrivacyErrorCode.INPUT_TOO_LARGE, PrivacyErrorCode.INPUT_TOO_LARGE);
}
