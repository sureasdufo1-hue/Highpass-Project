import { PrivacyErrorCode, PrivacyProcessingError } from "./privacy-contracts.js";

export function codePointLength(value) {
  return Array.from(String(value)).length;
}

export function codePointSlice(value, start, end) {
  return Array.from(String(value)).slice(start, end).join("");
}

export function codePointIndexToUtf16(value, index) {
  if (!Number.isInteger(index) || index < 0 || index > codePointLength(value)) {
    throw offsetError();
  }
  return Array.from(String(value)).slice(0, index).join("").length;
}

export function utf16IndexToCodePoint(value, index) {
  const text = String(value);
  if (!Number.isInteger(index) || index < 0 || index > text.length) throw offsetError();
  const prefix = text.slice(0, index);
  if (prefix.length > 0) {
    const last = prefix.charCodeAt(prefix.length - 1);
    const next = text.charCodeAt(index);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) throw offsetError();
  }
  return codePointLength(prefix);
}

export function normalizeForDetection(originalText, options = {}) {
  const original = String(originalText);
  const normalization = options.normalization ?? "NFC";
  const prefix = String(options.prefix ?? "");
  const suffix = String(options.suffix ?? "");
  const normalizedParts = [];
  const pointMap = [];
  const sourcePoints = Array.from(original);
  let sourceIndex = 0;
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

  for (const segment of segmenter.segment(original)) {
    const raw = segment.segment;
    const rawLength = codePointLength(raw);
    let normalized = raw === "\r\n" ? "\n" : raw.normalize(normalization);
    if (raw === "\r") normalized = "\n";
    normalizedParts.push(normalized);
    for (const ignored of Array.from(normalized)) {
      void ignored;
      pointMap.push({ start: sourceIndex, end: sourceIndex + rawLength });
    }
    sourceIndex += rawLength;
  }

  if (sourceIndex !== sourcePoints.length) throw offsetError();
  const normalizedBody = normalizedParts.join("");
  const bodyOffset = codePointLength(prefix);
  const detectionText = `${prefix}${normalizedBody}${suffix}`;

  return {
    original,
    normalizedBody,
    detectionText,
    mapSpan(start, end, expectedText = undefined) {
      validateSpan(detectionText, start, end, expectedText);
      const bodyStart = start - bodyOffset;
      const bodyEnd = end - bodyOffset;
      if (bodyStart < 0 || bodyEnd > pointMap.length || bodyStart >= bodyEnd) throw offsetError();
      const mappedStart = pointMap[bodyStart]?.start;
      const mappedEnd = pointMap[bodyEnd - 1]?.end;
      if (!Number.isInteger(mappedStart) || !Number.isInteger(mappedEnd) || mappedStart >= mappedEnd) throw offsetError();
      return {
        start: mappedStart,
        end: mappedEnd,
        text: codePointSlice(original, mappedStart, mappedEnd),
      };
    },
  };
}

export function validateSpan(text, start, end, expectedText = undefined) {
  const length = codePointLength(text);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > length || start >= end) {
    throw offsetError();
  }
  if (expectedText !== undefined && codePointSlice(text, start, end) !== expectedText) throw offsetError();
}

function offsetError() {
  return new PrivacyProcessingError(422, PrivacyErrorCode.OFFSET_MISMATCH, "Privacy finding offsets could not be mapped safely");
}
