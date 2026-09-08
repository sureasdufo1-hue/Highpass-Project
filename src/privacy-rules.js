import {
  PrivacyAction,
  PrivacyFindingSource,
  PrivacyNativeLabel,
  PrivacySystemType,
  mapNativeLabel,
} from "./privacy-contracts.js";
import { codePointSlice, utf16IndexToCodePoint, validateSpan } from "./privacy-unicode.js";

const TYPE_PRIORITY = Object.freeze({
  [PrivacySystemType.SECRET]: 100,
  [PrivacySystemType.KR_IDENTIFIER]: 95,
  [PrivacySystemType.FINANCIAL_ACCOUNT]: 90,
  [PrivacySystemType.HOSPITAL_ID]: 85,
  [PrivacySystemType.PERSON]: 70,
  [PrivacySystemType.CONTACT]: 65,
  [PrivacySystemType.URL_IDENTIFIER]: 60,
  [PrivacySystemType.ADDRESS]: 55,
  [PrivacySystemType.DATE]: 40,
});

export function detectRequiredRuleFindings(text, context = {}, profile = {}) {
  const findings = [];
  addMatches(findings, text, /\b\d{6}[- ]?\d{7}\b/gu, finding(PrivacySystemType.KR_IDENTIFIER, "HPP-P007", "<KR_IDENTIFIER>"));
  addMatches(findings, text, /\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/gu, finding(PrivacySystemType.CONTACT, "HPP-P011", "<PHONE>", PrivacyNativeLabel.PRIVATE_PHONE));
  addMatches(findings, text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, finding(PrivacySystemType.CONTACT, "HPP-P012", "<EMAIL>", PrivacyNativeLabel.PRIVATE_EMAIL));
  addMatches(findings, text, /\b(?:bearer\s+|api[_-]?key\s*[:=]\s*|password\s*[:=]\s*)[^\s,;]+/giu, finding(PrivacySystemType.SECRET, "HPP-P014", "<SECRET>", PrivacyNativeLabel.SECRET));
  addMatches(findings, text, /\bsk-[A-Za-z0-9_-]{8,}\b/gu, finding(PrivacySystemType.SECRET, "HPP-P014", "<SECRET>", PrivacyNativeLabel.SECRET));
  addMatches(findings, text, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu, finding(PrivacySystemType.SECRET, "HPP-P014", "<SECRET>", PrivacyNativeLabel.SECRET));
  addMatches(findings, text, /(?:\uACC4\uC88C|account)\s*[:\uFF1A]?\s*\d{2,6}(?:-\d{2,6}){1,3}/giu, (match) => {
    const value = /\d{2,6}(?:-\d{2,6}){1,3}/u.exec(match[0]);
    if (!value) return null;
    return finding(PrivacySystemType.FINANCIAL_ACCOUNT, "HPP-P009", "<FINANCIAL_ACCOUNT>", PrivacyNativeLabel.ACCOUNT_NUMBER)({
      0: value[0],
      index: match.index + value.index,
      input: text,
    });
  });
  addMatches(findings, text, /\bhttps?:\/\/[^\s<>"']+/giu, (match) => {
    let allowed = false;
    try {
      const parsed = new URL(match[0]);
      allowed = (profile.publicUrlAllowlist ?? []).includes(parsed.hostname) && !parsed.search && !parsed.hash;
    } catch {
      allowed = false;
    }
    return allowed ? null : finding(PrivacySystemType.URL_IDENTIFIER, "HPP-P013", "<URL_IDENTIFIER>", PrivacyNativeLabel.PRIVATE_URL)(match);
  });
  addMatches(findings, text, /(?:생년월일|검사일|퇴원일|입원일)\s*[:：]?\s*\d{4}-\d{2}-\d{2}/gu, (match) => {
    const date = /\d{4}-\d{2}-\d{2}/u.exec(match[0]);
    if (!date) return null;
    return finding(PrivacySystemType.DATE, match[0].startsWith("생년월일") ? "HPP-P017" : "HPP-P018", "<DATE>", PrivacyNativeLabel.PRIVATE_DATE)({
      0: date[0],
      index: match.index + date.index,
      input: text,
    });
  });
  addMatches(findings, text, /(?:[가-힣]+(?:시|도)\s+)?[가-힣]+(?:구|군)\s+[가-힣0-9]+(?:로|길)\s+\d+(?:-\d+)?/gu, finding(PrivacySystemType.ADDRESS, "HPP-P013", "<ADDRESS>", PrivacyNativeLabel.PRIVATE_ADDRESS));

  addMatches(findings, text, /[가-힣]{2,}(?:로|길)\s+\d+(?:-\d+)?(?:\s+\d+호)?/gu, finding(PrivacySystemType.ADDRESS, "HPP-P013", "<ADDRESS>", PrivacyNativeLabel.PRIVATE_ADDRESS));

  for (const name of context.personNames ?? []) {
    const candidate = String(name);
    if (!/^[가-힣]{2,4}$/u.test(candidate)) continue;
    addLiteral(findings, text, candidate, {
      systemType: PrivacySystemType.PERSON,
      nativeLabel: PrivacyNativeLabel.PRIVATE_PERSON,
      action: PrivacyAction.REPLACE,
      replacement: "<PERSON>",
      sources: [PrivacyFindingSource.STRUCTURED_FIELD],
      ruleIds: ["HPP-P003"],
      score: null,
    });
  }

  const fieldContexts = new Set(context.fieldContexts ?? []);
  for (const entry of profile.institutionIdentifierPatterns ?? []) {
    if (!fieldContexts.has(entry.fieldContext)) continue;
    addMatches(findings, text, new RegExp(entry.pattern, "gu"), finding(PrivacySystemType.HOSPITAL_ID, entry.id ?? "HPP-P008", "<PATIENT_ID>"));
  }
  return findings;
}

export function normalizeModelFindings(detectionText, rawFindings, mappedView) {
  if (!Array.isArray(rawFindings)) return [];
  return rawFindings.map((item) => {
    validateSpan(detectionText, item.start, item.end, item.text);
    const mapped = mappedView.mapSpan(item.start, item.end, item.text);
    const systemType = mapNativeLabel(item.nativeLabel);
    return {
      ...mapped,
      nativeLabel: item.nativeLabel,
      systemType,
      action: systemType ? PrivacyAction.REPLACE : PrivacyAction.REVIEW,
      replacement: placeholderFor(systemType),
      sources: [PrivacyFindingSource.MODEL],
      ruleIds: [],
      score: Number.isFinite(item.score) ? item.score : null,
      unmapped: !systemType,
    };
  });
}

export function mergePrivacyFindings(text, findings) {
  const sorted = findings.map((item) => validatedFinding(text, item)).sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const candidate of sorted) {
    const current = merged.at(-1);
    if (!current || candidate.start >= current.end) {
      merged.push({ ...candidate });
      continue;
    }
    const preferred = priority(candidate.systemType) > priority(current.systemType) ? candidate : current;
    const start = Math.min(current.start, candidate.start);
    const end = Math.max(current.end, candidate.end);
    const conflict = current.systemType !== candidate.systemType || current.action !== candidate.action;
    merged[merged.length - 1] = {
      ...preferred,
      start,
      end,
      text: codePointSlice(text, start, end),
      sources: [...new Set([...current.sources, ...candidate.sources])].sort(),
      ruleIds: [...new Set([...current.ruleIds, ...candidate.ruleIds])].sort(),
      score: maxNullable(current.score, candidate.score),
      conflict: Boolean(current.conflict || candidate.conflict || conflict),
      unmapped: Boolean(current.unmapped || candidate.unmapped),
      replacement: conflict && !preferred.systemType ? "<REVIEW_REQUIRED>" : preferred.replacement,
    };
  }
  return merged;
}

export function detectProtectedClinicalSpans(text) {
  const protectedSpans = [];
  for (const regex of [
    /\b(?:Hb|Hgb|WBC|RBC|CRP)\s*\d+(?:\.\d+)?(?:\s*[a-zA-Z/]+)?\b/gu,
    /\b\d+(?:\.\d+)?\s*(?:mm|cm|mg|mL|g\/dL|mmHg)\b/giu,
    /(?:좌측|우측|양측|없음|아님|음성|양성)/gu,
    /\b\d+\s*(?:일|주|개월|년)\s*(?:전|후|동안)/gu,
  ]) {
    addMatches(protectedSpans, text, regex, (match) => ({
      start: utf16IndexToCodePoint(text, match.index),
      end: utf16IndexToCodePoint(text, match.index + match[0].length),
      text: match[0],
    }));
  }
  return protectedSpans.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function applyDeterministicTransform(text, findings, approvedUse) {
  const personMap = new Map();
  const hospitalIdMap = new Map();
  let personIndex = 0;
  let hospitalIdIndex = 0;
  const prepared = findings.map((item) => {
    let replacement = item.replacement ?? placeholderFor(item.systemType);
    if (item.preserve === true) {
      replacement = item.text;
    } else if (item.systemType === PrivacySystemType.PERSON) {
      if (!personMap.has(item.text)) personMap.set(item.text, `<PERSON_${++personIndex}>`);
      replacement = personMap.get(item.text);
    } else if (item.systemType === PrivacySystemType.HOSPITAL_ID) {
      if (!hospitalIdMap.has(item.text)) hospitalIdMap.set(item.text, `<PATIENT_ID_${++hospitalIdIndex}>`);
      replacement = hospitalIdMap.get(item.text);
    } else if (item.systemType === PrivacySystemType.DATE && item.ruleIds?.includes("HPP-P017") && approvedUse.purpose === "RESEARCH") {
      replacement = ageBand(item.text, approvedUse.referenceDate) ?? "<DATE>";
    } else if (item.systemType === PrivacySystemType.DATE && approvedUse.purpose === "RESEARCH" && Number.isInteger(approvedUse.dateShiftDays)) {
      replacement = shiftIsoDate(item.text, approvedUse.dateShiftDays) ?? "<DATE>";
    } else if (item.unmapped || item.action === PrivacyAction.REVIEW) {
      replacement = "<REVIEW_REQUIRED>";
    }
    return { ...item, replacement };
  });
  let output = text;
  for (const item of [...prepared].sort((a, b) => b.start - a.start)) {
    const start = Array.from(output).slice(0, item.start).join("").length;
    const end = Array.from(output).slice(0, item.end).join("").length;
    output = `${output.slice(0, start)}${item.replacement}${output.slice(end)}`;
  }
  return { text: output, findings: prepared };
}

function addLiteral(findings, text, literal, template) {
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(literal, from);
    if (index < 0) return;
    findings.push({
      ...template,
      start: utf16IndexToCodePoint(text, index),
      end: utf16IndexToCodePoint(text, index + literal.length),
      text: literal,
    });
    from = index + literal.length;
  }
}

function addMatches(findings, text, regex, factory) {
  for (const match of text.matchAll(regex)) {
    const built = factory(match);
    if (built) findings.push(built);
  }
}

function finding(systemType, ruleId, replacement, nativeLabel = null) {
  return (match) => ({
    start: utf16IndexToCodePoint(match.input ?? "", match.index),
    end: utf16IndexToCodePoint(match.input ?? "", match.index + match[0].length),
    text: match[0],
    nativeLabel,
    systemType,
    action: PrivacyAction.REPLACE,
    replacement,
    sources: [PrivacyFindingSource.RULE],
    ruleIds: [ruleId],
    score: null,
  });
}

function validatedFinding(text, finding) {
  validateSpan(text, finding.start, finding.end, finding.text);
  return {
    ...finding,
    sources: finding.sources ?? [],
    ruleIds: finding.ruleIds ?? [],
    score: Number.isFinite(finding.score) ? finding.score : null,
  };
}

function placeholderFor(systemType) {
  return systemType ? `<${systemType}>` : "<REVIEW_REQUIRED>";
}

function priority(systemType) {
  return TYPE_PRIORITY[systemType] ?? 0;
}

function maxNullable(left, right) {
  const values = [left, right].filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function shiftIsoDate(value, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ageBand(birthDate, referenceDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(referenceDate ?? "")) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const reference = new Date(`${referenceDate}T00:00:00.000Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(reference.getTime()) || birth > reference) return null;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  if (reference.getUTCMonth() < birth.getUTCMonth()
    || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate())) age -= 1;
  if (age < 18) return "<AGE_BAND_0_17>";
  if (age < 40) return "<AGE_BAND_18_39>";
  if (age < 65) return "<AGE_BAND_40_64>";
  return "<AGE_BAND_65_PLUS>";
}
