#!/usr/bin/env node
import { OpfLocalAdapter } from "../src/privacy-adapter.js";
import { PrivacyPolicyDecision } from "../src/privacy-contracts.js";
import { PrivacyTextInspectionService } from "../src/privacy-service.js";

const adapter = new OpfLocalAdapter();
const readiness = await adapter.readiness();
if (!readiness.ready) {
  console.log(JSON.stringify({ status: "ENVIRONMENT_BLOCKED", gate: "ACTUAL_OPF_MODEL", code: readiness.code, reason: readiness.reason }));
  process.exit(2);
}

const service = new PrivacyTextInspectionService({ adapter });
const result = await service.inspect({
  mediaType: "text/plain",
  content: "환자 김민수, 검사일 2026-08-31. 우측 폐 결절 5 mm, 발열 없음.",
  approvedUseRef: "use_research_synthetic_001",
  purpose: "RESEARCH",
  recipientRef: "HOSP-B-RESEARCH-SANDBOX",
  sourceOrganizationId: "HOSP-A",
  sourceArtifactRef: "synthetic-report-c001",
  sourceArtifactVersion: 1,
  context: { personNames: ["김민수"] },
}, { role: "INTERNAL_SERVICE", userId: "internal-service", scopes: ["privacy:inspect"] });

if (result.policyDecision !== PrivacyPolicyDecision.REVIEW_REQUIRED || result.releaseEligible !== false) {
  console.log(JSON.stringify({ status: "FAIL", gate: "ACTUAL_OPF_MODEL", code: "FAIL_CLOSED_INVARIANT" }));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  gate: "ACTUAL_OPF_MODEL",
  modelRevision: result.modelRevision,
  runtimeRevision: result.runtimeRevision,
  durationMs: result.durationMs,
  findingCount: result.findings.length,
  policyDecision: result.policyDecision,
  releaseEligible: result.releaseEligible,
}));
