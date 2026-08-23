import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/deidentify-dicom.js <input.dcm> <output.dcm> [report.json]");
  process.exit(2);
}

const key = process.env.HIPASS_DEID_LOCAL_KEY;
if (!key || key.length < 16) {
  console.error("HIPASS_DEID_LOCAL_KEY must be set to a local non-production key for deterministic UID pseudonymization.");
  process.exit(2);
}

const source = await readFile(inputPath);
const parsed = parseExplicitVrLittleEndian(source);
const originalTags = Object.fromEntries(parsed.elements.map((element) => [element.tag, valueToString(element)]));
const uidMap = new Map();
const outputElements = parsed.elements.map((element) => deidentifyElement(element, uidMap));
const output = Buffer.concat([source.subarray(0, parsed.datasetOffset), ...outputElements.map(serializeElement)]);
await writeFile(outputPath, output);

const reparsed = parseExplicitVrLittleEndian(await readFile(outputPath));
const outputTags = Object.fromEntries(reparsed.elements.map((element) => [element.tag, valueToString(element)]));
const report = {
  inputPath,
  outputPath,
  readableAfterRewrite: outputTags["00080018"] !== undefined,
  originalPreserved: true,
  pixelDataPresent: outputTags["7FE00010"] !== undefined,
  burnedInAnnotation: outputTags["00280301"] ?? "NOT_PRESENT",
  defacingStatus: "NOT_VERIFIED",
  policy: {
    PatientName: "REPLACE",
    PatientID: "REPLACE",
    PatientBirthDate: "BLANK",
    PatientAddress: "BLANK",
    PatientTelephoneNumbers: "BLANK",
    OtherPatientIDs: "BLANK",
    StudyDate: "GENERALIZE",
    SeriesDate: "GENERALIZE",
    AcquisitionDate: "GENERALIZE",
    InstitutionName: "GENERALIZE",
    ReferringPhysicianName: "BLANK",
    AccessionNumber: "BLANK",
    StudyInstanceUID: "REGENERATE_UID",
    SeriesInstanceUID: "REGENERATE_UID",
    SOPInstanceUID: "REGENERATE_UID",
    BodyPartExamined: "GENERALIZE",
  },
  checks: {
    patientNameChanged: originalTags["00100010"] !== outputTags["00100010"],
    patientIdChanged: originalTags["00100020"] !== outputTags["00100020"],
    studyDateGeneralized: /^\d{4}$/.test(outputTags["00080020"] ?? ""),
    studyUidRegenerated: originalTags["0020000D"] !== outputTags["0020000D"],
    seriesUidRegenerated: originalTags["0020000E"] !== outputTags["0020000E"],
    sopUidRegenerated: originalTags["00080018"] !== outputTags["00080018"],
  },
};
if (reportPath) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));

function parseExplicitVrLittleEndian(buffer) {
  if (buffer.subarray(128, 132).toString("ascii") !== "DICM") {
    throw new Error("Input is not a Part 10 DICOM file with DICM preamble");
  }
  const datasetOffset = 132;
  const elements = [];
  let offset = datasetOffset;
  while (offset + 8 <= buffer.length) {
    const group = buffer.readUInt16LE(offset);
    const element = buffer.readUInt16LE(offset + 2);
    const vr = buffer.subarray(offset + 4, offset + 6).toString("ascii");
    const longVr = ["OB", "OD", "OF", "OL", "OW", "SQ", "UC", "UR", "UT", "UN"].includes(vr);
    const lengthOffset = longVr ? offset + 8 : offset + 6;
    const valueOffset = longVr ? offset + 12 : offset + 8;
    const length = longVr ? buffer.readUInt32LE(lengthOffset) : buffer.readUInt16LE(lengthOffset);
    const value = buffer.subarray(valueOffset, valueOffset + length);
    elements.push({
      tag: `${group.toString(16).padStart(4, "0")}${element.toString(16).padStart(4, "0")}`.toUpperCase(),
      group,
      element,
      vr,
      value,
    });
    offset = valueOffset + length;
  }
  return { datasetOffset, elements };
}

function deidentifyElement(element, uidMap) {
  const tag = element.tag;
  const text = valueToString(element);
  if (tag === "00100010") return withText(element, "REMOVED");
  if (tag === "00100020") return withText(element, pseudonymPatientId(text));
  if (["00100030", "00101040", "00102154", "00101000", "00080090", "00080050"].includes(tag)) return withText(element, "");
  if (["00080020", "00080021", "00080022"].includes(tag)) return withText(element, text.slice(0, 4));
  if (tag === "00080080") return withText(element, "VIRTUAL_HOSPITAL");
  if (tag === "00180015") return withText(element, generalizeBodyPart(text));
  if (["00020003", "00080018", "0020000D", "0020000E"].includes(tag)) return withText(element, pseudonymUid(text, uidMap));
  return element;
}

function serializeElement(element) {
  const value = paddedValue(element.vr, element.value);
  const longVr = ["OB", "OD", "OF", "OL", "OW", "SQ", "UC", "UR", "UT", "UN"].includes(element.vr);
  const header = longVr ? Buffer.alloc(12) : Buffer.alloc(8);
  header.writeUInt16LE(element.group, 0);
  header.writeUInt16LE(element.element, 2);
  header.write(element.vr, 4, 2, "ascii");
  if (longVr) {
    header.writeUInt32LE(value.length, 8);
  } else {
    header.writeUInt16LE(value.length, 6);
  }
  return Buffer.concat([header, value]);
}

function withText(element, text) {
  return { ...element, value: Buffer.from(String(text), "ascii") };
}

function valueToString(element) {
  if (["OB", "OW", "UN"].includes(element.vr)) return element.value.toString("hex");
  return element.value.toString("ascii").replace(/\0/g, "").trim();
}

function paddedValue(vr, value) {
  if (value.length % 2 === 0) return value;
  return Buffer.concat([value, Buffer.from(vr === "UI" ? [0] : [0x20])]);
}

function pseudonymPatientId(value) {
  return `R-PSEUDO-${createHmac("sha256", key).update(value).digest("hex").slice(0, 12).toUpperCase()}`;
}

function pseudonymUid(value, uidMap) {
  if (!uidMap.has(value)) {
    const hex = createHmac("sha256", key).update(value).digest("hex").slice(0, 30);
    uidMap.set(value, `2.25.${BigInt(`0x${hex}`).toString(10)}`);
  }
  return uidMap.get(value);
}

function generalizeBodyPart(value) {
  const upper = value.toUpperCase();
  if (upper.includes("BRAIN") || upper.includes("HEAD") || upper.includes("FACE")) return "HEAD";
  if (upper.includes("CHEST") || upper.includes("LUNG")) return "CHEST";
  if (upper.includes("ABDOMEN")) return "TRUNK";
  return upper ? "OTHER" : "";
}
