const orthancUrl = process.env.ORTHANC_REST_URL ?? "http://hospital-a-orthanc:8042";

const samples = [
  {
    patientId: "P-1001",
    patientName: "HIPASS^VIRTUAL^1001",
    studyInstanceUid: "1.2.410.100.1.20260620.001",
    seriesInstanceUid: "1.2.410.100.1.20260620.001.1",
    sopInstanceUid: "1.2.410.100.1.20260620.001.1.1",
    studyDate: "20260620",
    modality: "MR",
    studyDescription: "Brain MRI",
    seriesDescription: "T1 Axial",
  },
  {
    patientId: "P-1001",
    patientName: "HIPASS^VIRTUAL^1001",
    studyInstanceUid: "1.2.410.100.1.20260620.001",
    seriesInstanceUid: "1.2.410.100.1.20260620.001.2",
    sopInstanceUid: "1.2.410.100.1.20260620.001.2.1",
    studyDate: "20260620",
    modality: "MR",
    studyDescription: "Brain MRI",
    seriesDescription: "T2 FLAIR",
  },
  {
    patientId: "P-1001",
    patientName: "HIPASS^VIRTUAL^1001",
    studyInstanceUid: "1.2.410.100.1.20260518.002",
    seriesInstanceUid: "1.2.410.100.1.20260518.002.1",
    sopInstanceUid: "1.2.410.100.1.20260518.002.1.1",
    studyDate: "20260518",
    modality: "CT",
    studyDescription: "Chest CT",
    seriesDescription: "Lung window",
  },
];

for (const sample of samples) {
  const response = await fetch(`${orthancUrl}/instances`, {
    method: "POST",
    headers: { "content-type": "application/dicom" },
    body: createDicom(sample),
  });
  if (!response.ok && response.status !== 200) {
    throw new Error(`Failed to upload sample DICOM ${sample.sopInstanceUid}: ${response.status} ${await response.text()}`);
  }
}

console.log(`Uploaded ${samples.length} virtual sample DICOM instance(s) to Orthanc`);

function createDicom(sample) {
  const elements = [
    el("0002", "0001", "OB", Buffer.from([0x00, 0x01])),
    el("0002", "0002", "UI", "1.2.840.10008.5.1.4.1.1.7"),
    el("0002", "0003", "UI", sample.sopInstanceUid),
    el("0002", "0010", "UI", "1.2.840.10008.1.2.1"),
    el("0002", "0012", "UI", "1.2.826.0.1.3680043.10.5432"),
    el("0008", "0008", "CS", "DERIVED\\SECONDARY"),
    el("0008", "0016", "UI", "1.2.840.10008.5.1.4.1.1.7"),
    el("0008", "0018", "UI", sample.sopInstanceUid),
    el("0008", "0020", "DA", sample.studyDate),
    el("0008", "0060", "CS", sample.modality),
    el("0008", "1030", "LO", sample.studyDescription),
    el("0008", "103E", "LO", sample.seriesDescription),
    el("0010", "0010", "PN", sample.patientName),
    el("0010", "0020", "LO", sample.patientId),
    el("0020", "000D", "UI", sample.studyInstanceUid),
    el("0020", "000E", "UI", sample.seriesInstanceUid),
    el("0020", "0011", "IS", "1"),
    el("0020", "0013", "IS", "1"),
    el("0028", "0002", "US", uint16(1)),
    el("0028", "0004", "CS", "MONOCHROME2"),
    el("0028", "0010", "US", uint16(2)),
    el("0028", "0011", "US", uint16(2)),
    el("0028", "0100", "US", uint16(8)),
    el("0028", "0101", "US", uint16(8)),
    el("0028", "0102", "US", uint16(7)),
    el("0028", "0103", "US", uint16(0)),
    el("7FE0", "0010", "OB", Buffer.from([0, 64, 128, 255])),
  ];
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), ...elements]);
}

function el(groupHex, elementHex, vr, value) {
  const group = Number.parseInt(groupHex, 16);
  const element = Number.parseInt(elementHex, 16);
  const valueBuffer = Buffer.isBuffer(value) ? value : textValue(vr, value);
  const padded = valueBuffer.length % 2 === 0 ? valueBuffer : Buffer.concat([valueBuffer, Buffer.from(vr === "UI" ? [0] : [0x20])]);
  const header = ["OB", "OW", "SQ", "UN", "UT"].includes(vr) ? Buffer.alloc(12) : Buffer.alloc(8);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(element, 2);
  header.write(vr, 4, 2, "ascii");
  if (header.length === 12) {
    header.writeUInt32LE(padded.length, 8);
  } else {
    header.writeUInt16LE(padded.length, 6);
  }
  return Buffer.concat([header, padded]);
}

function textValue(vr, value) {
  const suffix = vr === "UI" ? "\0" : " ";
  const text = String(value);
  return Buffer.from(text.length % 2 === 0 ? text : `${text}${suffix}`, "ascii");
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}
