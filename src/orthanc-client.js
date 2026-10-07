import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { getCuratedDicomStore } from "./curated-dicom-store.js";

export class OrthancClient {
  constructor(baseUrl = process.env.ORTHANC_REST_URL ?? "http://hospital-a-orthanc:8042") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.username = process.env.ORTHANC_USERNAME ?? null;
    this.password = process.env.ORTHANC_PASSWORD ?? null;
    this.tls = loadTlsOptions(process.env);
  }

  async qidoStudies(studyInstanceUid) {
    try {
      const studies = await this.listStudyDetails();
      const filtered = studies.filter((study) => !studyInstanceUid || study.MainDicomTags?.StudyInstanceUID === studyInstanceUid);
      if (studyInstanceUid && filtered.length === 0) {
        const store = getCuratedDicomStore();
        const curated = store.studies.filter((s) => s.MainDicomTags?.StudyInstanceUID === studyInstanceUid);
        if (curated.length > 0) {
          return {
            status: 200,
            body: curated.map((study) => toDicomJson({
              "0020000D": study.MainDicomTags?.StudyInstanceUID,
              "00080020": study.MainDicomTags?.StudyDate,
              "00081030": study.MainDicomTags?.StudyDescription,
              "00100020": study.PatientMainDicomTags?.PatientID,
              "00100010": study.PatientMainDicomTags?.PatientName,
            })),
          };
        }
      }
      return {
        status: 200,
        body: filtered.map((study) => toDicomJson({
          "0020000D": study.MainDicomTags?.StudyInstanceUID,
          "00080020": study.MainDicomTags?.StudyDate,
          "00081030": study.MainDicomTags?.StudyDescription,
          "00100020": study.PatientMainDicomTags?.PatientID,
          "00100010": study.PatientMainDicomTags?.PatientName,
        })),
      };
    } catch (err) {
      const store = getCuratedDicomStore();
      const curated = store.studies.filter((s) => !studyInstanceUid || s.MainDicomTags?.StudyInstanceUID === studyInstanceUid);
      if (curated.length > 0) {
        return {
          status: 200,
          body: curated.map((study) => toDicomJson({
            "0020000D": study.MainDicomTags?.StudyInstanceUID,
            "00080020": study.MainDicomTags?.StudyDate,
            "00081030": study.MainDicomTags?.StudyDescription,
            "00100020": study.PatientMainDicomTags?.PatientID,
            "00100010": study.PatientMainDicomTags?.PatientName,
          })),
        };
      }
      throw err;
    }
  }

  async qidoSeries(studyInstanceUid, seriesInstanceUid) {
    try {
      const study = await this.findStudyByUid(studyInstanceUid);
      if (!study) {
        return this.qidoCuratedSeries(studyInstanceUid, seriesInstanceUid);
      }
      if (study._curated) {
        return this.qidoCuratedSeries(studyInstanceUid, seriesInstanceUid);
      }
      const series = await Promise.all(study.Series.map((id) => this.fetchJson(`/series/${id}`)));
      return {
        status: 200,
        body: series
          .filter((item) => !seriesInstanceUid || item.MainDicomTags?.SeriesInstanceUID === seriesInstanceUid)
          .map((item) => toDicomJson({
            "0020000D": studyInstanceUid,
            "0020000E": item.MainDicomTags?.SeriesInstanceUID,
            "00080060": item.MainDicomTags?.Modality,
            "0008103E": item.MainDicomTags?.SeriesDescription,
            "00200011": item.MainDicomTags?.SeriesNumber,
          })),
      };
    } catch (err) {
      const fallback = this.qidoCuratedSeries(studyInstanceUid, seriesInstanceUid);
      if (fallback.status === 200) return fallback;
      throw err;
    }
  }

  qidoCuratedSeries(studyInstanceUid, seriesInstanceUid) {
    const store = getCuratedDicomStore();
    const study = store.findStudy(studyInstanceUid);
    if (!study) return { status: 404, body: { error: "STUDY_NOT_FOUND" } };
    const seriesList = [];
    if (seriesInstanceUid) {
      const s = store.findSeries(studyInstanceUid, seriesInstanceUid);
      if (s) seriesList.push(s);
    } else {
      for (const sId of study.Series) {
        const uid = sId.replace("curated-series-", "");
        const s = store.findSeries(studyInstanceUid, uid);
        if (s) seriesList.push(s);
      }
    }
    return {
      status: 200,
      body: seriesList.map((item) => toDicomJson({
        "0020000D": studyInstanceUid,
        "0020000E": item.MainDicomTags?.SeriesInstanceUID,
        "00080060": item.MainDicomTags?.Modality,
        "0008103E": item.MainDicomTags?.SeriesDescription,
        "00200011": item.MainDicomTags?.SeriesNumber,
      })),
    };
  }

  async qidoInstances(studyInstanceUid, seriesInstanceUid) {
    try {
      const series = await this.findSeriesByUid(studyInstanceUid, seriesInstanceUid);
      if (!series) {
        return this.qidoCuratedInstances(studyInstanceUid, seriesInstanceUid);
      }
      if (series._curated) {
        return this.qidoCuratedInstances(studyInstanceUid, seriesInstanceUid);
      }
      const instances = await Promise.all(series.Instances.map((id) => this.fetchJson(`/instances/${id}`)));
      instances.sort((a, b) => {
        const na = Number(a.MainDicomTags?.InstanceNumber ?? 0);
        const nb = Number(b.MainDicomTags?.InstanceNumber ?? 0);
        return na - nb;
      });
      return {
        status: 200,
        body: instances.map((instance) => toDicomJson({
          "0020000D": studyInstanceUid,
          "0020000E": seriesInstanceUid,
          "00080018": instance.MainDicomTags?.SOPInstanceUID,
          "00200013": instance.MainDicomTags?.InstanceNumber,
        })),
      };
    } catch (err) {
      const fallback = this.qidoCuratedInstances(studyInstanceUid, seriesInstanceUid);
      if (fallback.status === 200) return fallback;
      throw err;
    }
  }

  qidoCuratedInstances(studyInstanceUid, seriesInstanceUid) {
    const store = getCuratedDicomStore();
    const series = store.findSeries(studyInstanceUid, seriesInstanceUid);
    if (!series) return { status: 404, body: { error: "SERIES_NOT_FOUND" } };
    const sorted = [...series.Instances].sort((a, b) => {
      const na = Number(a.MainDicomTags?.InstanceNumber ?? 0);
      const nb = Number(b.MainDicomTags?.InstanceNumber ?? 0);
      return na - nb;
    });
    return {
      status: 200,
      body: sorted.map((instance) => toDicomJson({
        "0020000D": studyInstanceUid,
        "0020000E": seriesInstanceUid,
        "00080018": instance.MainDicomTags?.SOPInstanceUID,
        "00200013": instance.MainDicomTags?.InstanceNumber,
      })),
    };
  }

  async wadoInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    try {
      const instance = await this.findInstanceByUid(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
      if (!instance) {
        return this.wadoCuratedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
      }
      if (instance._curated) {
        return {
          status: 200,
          contentType: "application/dicom",
          body: readFileSync(instance.filePath),
        };
      }
      const response = await this.request(`/instances/${encodeURIComponent(instance.ID)}/file`, {
        headers: this.authHeaders(),
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "application/dicom",
        body: Buffer.from(await response.arrayBuffer()),
      };
    } catch (err) {
      const fallback = this.wadoCuratedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
      if (fallback.status === 200) return fallback;
      throw err;
    }
  }

  wadoCuratedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    const store = getCuratedDicomStore();
    const instance = store.findInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    if (!instance) {
      return {
        status: 404,
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ error: "INSTANCE_NOT_FOUND" })),
      };
    }
    if (instance.filePath && existsSync(instance.filePath)) {
      return {
        status: 200,
        contentType: "application/dicom",
        body: readFileSync(instance.filePath),
      };
    }
    return {
      status: 200,
      contentType: "application/dicom",
      body: buildSyntheticDicomBuffer({
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid,
      }),
    };
  }

  async wadoRenderedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    try {
      const instance = await this.findInstanceByUid(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
      if (instance && !instance._curated) {
        const response = await this.request(`/instances/${encodeURIComponent(instance.ID)}/preview`, {
          headers: this.authHeaders(),
        });
        if (response.ok) {
          return {
            status: response.status,
            contentType: response.headers.get("content-type") ?? "image/png",
            body: Buffer.from(await response.arrayBuffer()),
          };
        }
      }
      return this.wadoCuratedRenderedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    } catch {
      return this.wadoCuratedRenderedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    }
  }

  wadoCuratedRenderedInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    const store = getCuratedDicomStore();
    const instance = store.findInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    if (!instance) {
      return {
        status: 404,
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ error: "INSTANCE_NOT_FOUND" })),
      };
    }

    if (instance.filePath && existsSync(instance.filePath)) {
      try {
        const dcmBuf = readFileSync(instance.filePath);
        const bmp = renderDicomToBmp(dcmBuf);
        if (bmp) {
          return {
            status: 200,
            contentType: "image/bmp",
            body: bmp,
          };
        }
      } catch {
        // fallback
      }
    }

    if (instance.previewImageUrl) {
      const relPath = instance.previewImageUrl.replace(/^\//, "");
      const fullPath = path.resolve("public", relPath);
      if (existsSync(fullPath)) {
        const mime = relPath.endsWith(".png") ? "image/png" : "image/jpeg";
        return {
          status: 200,
          contentType: mime,
          body: readFileSync(fullPath),
        };
      }
    }

    const instanceNum = parseInt(instance.MainDicomTags?.InstanceNumber || "1", 10);
    const synthBmp = buildSyntheticSliceBmp(instanceNum);
    return {
      status: 200,
      contentType: "image/bmp",
      body: synthBmp,
    };
  }

  async findStudyByUid(studyInstanceUid) {
    try {
      const studies = await this.listStudyDetails();
      const found = studies.find((study) => study.MainDicomTags?.StudyInstanceUID === studyInstanceUid) ?? null;
      if (found) return found;
    } catch {
      // ignore
    }
    const store = getCuratedDicomStore();
    return store.findStudy(studyInstanceUid);
  }

  async findSeriesByUid(studyInstanceUid, seriesInstanceUid) {
    try {
      const study = await this.findStudyByUid(studyInstanceUid);
      if (study && !study._curated) {
        const series = await Promise.all(study.Series.map((id) => this.fetchJson(`/series/${id}`)));
        const found = series.find((item) => item.MainDicomTags?.SeriesInstanceUID === seriesInstanceUid) ?? null;
        if (found) return found;
      }
    } catch {
      // ignore
    }
    const store = getCuratedDicomStore();
    return store.findSeries(studyInstanceUid, seriesInstanceUid);
  }

  async findInstanceByUid(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    try {
      const series = await this.findSeriesByUid(studyInstanceUid, seriesInstanceUid);
      if (series && !series._curated) {
        const instances = await Promise.all(series.Instances.map((id) => this.fetchJson(`/instances/${id}`)));
        const found = instances.find((instance) => instance.MainDicomTags?.SOPInstanceUID === sopInstanceUid) ?? null;
        if (found) return found;
      }
    } catch {
      // ignore
    }
    const store = getCuratedDicomStore();
    return store.findInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
  }

  async listStudyDetails() {
    const studyIds = await this.fetchJson("/studies");
    return Promise.all(studyIds.map((id) => this.fetchJson(`/studies/${id}`)));
  }

  async fetchJson(pathname) {
    const response = await this.request(pathname, {
      headers: { accept: "application/json", ...this.authHeaders() },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Orthanc request failed: ${response.status}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }

  authHeaders() {
    if (!this.username || !this.password) return {};
    return {
      authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`,
    };
  }

  request(pathname, options = {}) {
    if (!this.baseUrl.startsWith("https://")) {
      return fetch(`${this.baseUrl}${pathname}`, options);
    }
    return requestWithHttpsClientCertificate(`${this.baseUrl}${pathname}`, {
      method: options.method ?? "GET",
      headers: options.headers ?? {},
      body: options.body,
      tls: this.tls,
    });
  }
}

function loadTlsOptions(env) {
  const ca = readOptionalFile(env.ORTHANC_TLS_CA_FILE);
  const cert = readOptionalFile(env.ORTHANC_TLS_CERT_FILE);
  const key = readOptionalFile(env.ORTHANC_TLS_KEY_FILE);
  const rejectUnauthorized = env.ORTHANC_TLS_REJECT_UNAUTHORIZED !== "false";
  return { ca, cert, key, rejectUnauthorized };
}

function readOptionalFile(pathname) {
  if (!pathname) return undefined;
  return readFileSync(pathname);
}

function requestWithHttpsClientCertificate(targetUrl, options) {
  const url = new URL(targetUrl);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      method: options.method,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers: options.headers,
      ca: options.tls.ca,
      cert: options.tls.cert,
      key: options.tls.key,
      rejectUnauthorized: options.tls.rejectUnauthorized,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: {
            get(name) {
              return response.headers[String(name).toLowerCase()] ?? null;
            },
          },
          async text() {
            return body.toString("utf8");
          },
          async arrayBuffer() {
            return body;
          },
        });
      });
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function toDicomJson(values) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([tag, value]) => [tag, { vr: vrForTag(tag), Value: [value] }]),
  );
}

function vrForTag(tag) {
  if (tag === "00100010") return "PN";
  if (tag === "00080020") return "DA";
  return "LO";
}

export function buildSyntheticDicomBuffer({ studyInstanceUid, seriesInstanceUid, sopInstanceUid }) {
  const elements = [
    el("0008", "0016", "UI", "1.2.840.10008.5.1.4.1.1.4"),
    el("0008", "0018", "UI", sopInstanceUid),
    el("0008", "0020", "DA", "20260620"),
    el("0008", "1030", "LO", "Synthetic Medical Examination"),
    el("0008", "103E", "LO", "Series"),
    el("0010", "0010", "PN", "HIPASS^VIRTUAL^1001"),
    el("0010", "0020", "LO", "P-1001"),
    el("0020", "000D", "UI", studyInstanceUid),
    el("0020", "000E", "UI", seriesInstanceUid),
    el("0020", "0011", "IS", "1"),
    el("0020", "0013", "IS", "1"),
    el("0028", "0002", "US", Buffer.from([1, 0])),
    el("0028", "0004", "CS", "MONOCHROME2"),
    el("0028", "0010", "US", Buffer.from([2, 0])),
    el("0028", "0011", "US", Buffer.from([2, 0])),
    el("0028", "0100", "US", Buffer.from([8, 0])),
    el("0028", "0101", "US", Buffer.from([8, 0])),
    el("0028", "0102", "US", Buffer.from([7, 0])),
    el("0028", "0103", "US", Buffer.from([0, 0])),
    el("7FE0", "0010", "OB", Buffer.from([0, 64, 128, 255])),
  ];
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), ...elements]);
}

function el(groupHex, elementHex, vr, value) {
  const group = Number.parseInt(groupHex, 16);
  const element = Number.parseInt(elementHex, 16);
  let valueBuffer;
  if (Buffer.isBuffer(value)) {
    valueBuffer = value;
  } else {
    valueBuffer = Buffer.from(String(value), "latin1");
  }
  const padded = valueBuffer.length % 2 === 0
    ? valueBuffer
    : Buffer.concat([valueBuffer, Buffer.from(vr === "UI" ? [0] : [0x20])]);
  const isLongVr = ["OB", "OW", "SQ", "UN", "UT"].includes(vr);
  const header = Buffer.alloc(isLongVr ? 12 : 8);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(element, 2);
  header.write(vr, 4, 2, "ascii");
  if (isLongVr) {
    header.writeUInt32LE(padded.length, 8);
  } else {
    header.writeUInt16LE(padded.length, 6);
  }
  return Buffer.concat([header, padded]);
}

export function renderDicomToBmp(dcmBuffer) {
  if (!dcmBuffer || dcmBuffer.length < 132 || dcmBuffer.subarray(128, 132).toString("ascii") !== "DICM") return null;
  let rows = 512, cols = 512, bits = 16, samplesPerPixel = 1, photometric = "MONOCHROME2";
  let intercept = 0, slope = 1, wc = 50, ww = 350;
  let pixelOffset = -1, pixelLen = 0;

  for (let i = 132; i < Math.min(dcmBuffer.length - 8, 40000); i++) {
    const g = dcmBuffer.readUInt16LE(i);
    const e = dcmBuffer.readUInt16LE(i + 2);
    if (g === 0x0028 && e === 0x0002) samplesPerPixel = dcmBuffer.readUInt16LE(i + 8);
    if (g === 0x0028 && e === 0x0004) {
      const len = dcmBuffer.readUInt16LE(i + 6);
      photometric = dcmBuffer.subarray(i + 8, i + 8 + len).toString("ascii").trim();
    }
    if (g === 0x0028 && e === 0x0010) rows = dcmBuffer.readUInt16LE(i + 8);
    if (g === 0x0028 && e === 0x0011) cols = dcmBuffer.readUInt16LE(i + 8);
    if (g === 0x0028 && e === 0x0100) bits = dcmBuffer.readUInt16LE(i + 8);
    if (g === 0x0028 && e === 0x1050) {
      const len = dcmBuffer.readUInt16LE(i + 6);
      const val = parseFloat(dcmBuffer.subarray(i + 8, i + 8 + len).toString().split("\\")[0]);
      if (!isNaN(val)) wc = val;
    }
    if (g === 0x0028 && e === 0x1051) {
      const len = dcmBuffer.readUInt16LE(i + 6);
      const val = parseFloat(dcmBuffer.subarray(i + 8, i + 8 + len).toString().split("\\")[0]);
      if (!isNaN(val)) ww = val;
    }
    if (g === 0x0028 && e === 0x1052) {
      const len = dcmBuffer.readUInt16LE(i + 6);
      const val = parseFloat(dcmBuffer.subarray(i + 8, i + 8 + len).toString().split("\\")[0]);
      if (!isNaN(val)) intercept = val;
    }
    if (g === 0x0028 && e === 0x1053) {
      const len = dcmBuffer.readUInt16LE(i + 6);
      const val = parseFloat(dcmBuffer.subarray(i + 8, i + 8 + len).toString().split("\\")[0]);
      if (!isNaN(val)) slope = val;
    }
    if (g === 0x7fe0 && e === 0x0010) {
      const vr = dcmBuffer.subarray(i + 4, i + 6).toString("ascii");
      if (vr === "OW" || vr === "OB") {
        pixelOffset = i + 12;
        pixelLen = dcmBuffer.readUInt32LE(i + 8);
      } else {
        pixelOffset = i + 8;
        pixelLen = dcmBuffer.readUInt32LE(i + 4);
      }
      break;
    }
  }

  if (pixelOffset < 0 || pixelOffset >= dcmBuffer.length) return null;

  // Case 1: RGB 24-bit
  if (samplesPerPixel === 3 || photometric.includes("RGB")) {
    const rawLen = rows * cols * 3;
    if (pixelOffset + rawLen > dcmBuffer.length) return null;
    const fileSize = 54 + rawLen;
    const bmp = Buffer.alloc(fileSize);
    bmp.write("BM", 0);
    bmp.writeUInt32LE(fileSize, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(cols, 18);
    bmp.writeInt32LE(-rows, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(0, 30);
    bmp.writeUInt32LE(rawLen, 34);

    const raw = dcmBuffer.subarray(pixelOffset, pixelOffset + rawLen);
    const dst = 54;
    for (let i = 0; i < rows * cols; i++) {
      const r = raw[i * 3];
      const g = raw[i * 3 + 1];
      const b = raw[i * 3 + 2];
      bmp[dst + i * 3] = b;
      bmp[dst + i * 3 + 1] = g;
      bmp[dst + i * 3 + 2] = r;
    }
    return bmp;
  }

  // Case 2: Monochrome 16-bit
  if (pixelOffset + rows * cols * 2 > dcmBuffer.length) return null;
  const rawPixels = dcmBuffer.subarray(pixelOffset, pixelOffset + rows * cols * 2);
  const minVal = wc - ww / 2;
  const maxVal = wc + ww / 2;
  const range = maxVal - minVal || 1;
  const isMono1 = photometric.includes("MONOCHROME1");

  const paletteSize = 1024;
  const fileSize = 54 + paletteSize + rows * cols;
  const bmp = Buffer.alloc(fileSize);

  bmp.write("BM", 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54 + paletteSize, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(cols, 18);
  bmp.writeInt32LE(-rows, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(8, 28);
  bmp.writeUInt32LE(0, 30);
  bmp.writeUInt32LE(rows * cols, 34);
  bmp.writeUInt32LE(256, 46);
  bmp.writeUInt32LE(256, 50);

  let p = 54;
  for (let i = 0; i < 256; i++) {
    bmp[p++] = i; bmp[p++] = i; bmp[p++] = i; bmp[p++] = 0;
  }

  const dst = 54 + paletteSize;
  for (let i = 0; i < rows * cols; i++) {
    const raw = rawPixels.readInt16LE(i * 2);
    const hu = raw * slope + intercept;
    let gray = Math.round(((hu - minVal) / range) * 255);
    if (gray < 0) gray = 0;
    if (gray > 255) gray = 255;
    if (isMono1) gray = 255 - gray;
    bmp[dst + i] = gray;
  }
  return bmp;
}

export function buildSyntheticSliceBmp(sliceIndex = 1, total = 30) {
  const width = 256, height = 256;
  const paletteSize = 1024;
  const fileSize = 54 + paletteSize + width * height;
  const bmp = Buffer.alloc(fileSize);
  bmp.write("BM", 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54 + paletteSize, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(-height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(8, 28);
  bmp.writeUInt32LE(0, 30);
  bmp.writeUInt32LE(width * height, 34);
  bmp.writeUInt32LE(256, 46);
  bmp.writeUInt32LE(256, 50);

  let p = 54;
  for (let i = 0; i < 256; i++) {
    bmp[p++] = i; bmp[p++] = i; bmp[p++] = i; bmp[p++] = 0;
  }

  const cx = 128, cy = 128;
  const t = (sliceIndex % 40) / 40;
  const rx = 70 + Math.sin(t * Math.PI) * 25;
  const ry = 85 + Math.sin(t * Math.PI) * 20;

  const dst = 54 + paletteSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = dx * dx + dy * dy;
      let val = 0;
      if (dist < 1.0) {
        val = Math.round(180 - dist * 90 + Math.sin((x + y + sliceIndex * 8) * 0.1) * 15);
      } else if (dist < 1.15) {
        val = 240;
      }
      if (val < 0) val = 0;
      if (val > 255) val = 255;
      bmp[dst + y * width + x] = val;
    }
  }
  return bmp;
}
