import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

export class OrthancClient {
  constructor(baseUrl = process.env.ORTHANC_REST_URL ?? "http://hospital-a-orthanc:8042") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.username = process.env.ORTHANC_USERNAME ?? null;
    this.password = process.env.ORTHANC_PASSWORD ?? null;
    this.tls = loadTlsOptions(process.env);
  }

  async qidoStudies(studyInstanceUid) {
    const studies = await this.listStudyDetails();
    return {
      status: 200,
      body: studies
        .filter((study) => !studyInstanceUid || study.MainDicomTags?.StudyInstanceUID === studyInstanceUid)
        .map((study) => toDicomJson({
          "0020000D": study.MainDicomTags?.StudyInstanceUID,
          "00080020": study.MainDicomTags?.StudyDate,
          "00081030": study.MainDicomTags?.StudyDescription,
          "00100020": study.PatientMainDicomTags?.PatientID,
          "00100010": study.PatientMainDicomTags?.PatientName,
        })),
    };
  }

  async qidoSeries(studyInstanceUid, seriesInstanceUid) {
    const study = await this.findStudyByUid(studyInstanceUid);
    if (!study) return { status: 404, body: { error: "STUDY_NOT_FOUND" } };
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
  }

  async qidoInstances(studyInstanceUid, seriesInstanceUid) {
    const series = await this.findSeriesByUid(studyInstanceUid, seriesInstanceUid);
    if (!series) return { status: 404, body: { error: "SERIES_NOT_FOUND" } };
    const instances = await Promise.all(series.Instances.map((id) => this.fetchJson(`/instances/${id}`)));
    return {
      status: 200,
      body: instances.map((instance) => toDicomJson({
        "0020000D": studyInstanceUid,
        "0020000E": seriesInstanceUid,
        "00080018": instance.MainDicomTags?.SOPInstanceUID,
        "00200013": instance.MainDicomTags?.InstanceNumber,
      })),
    };
  }

  async wadoInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    const instance = await this.findInstanceByUid(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    if (!instance) {
      return {
        status: 404,
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ error: "INSTANCE_NOT_FOUND" })),
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
  }

  async findStudyByUid(studyInstanceUid) {
    const studies = await this.listStudyDetails();
    return studies.find((study) => study.MainDicomTags?.StudyInstanceUID === studyInstanceUid) ?? null;
  }

  async findSeriesByUid(studyInstanceUid, seriesInstanceUid) {
    const study = await this.findStudyByUid(studyInstanceUid);
    if (!study) return null;
    const series = await Promise.all(study.Series.map((id) => this.fetchJson(`/series/${id}`)));
    return series.find((item) => item.MainDicomTags?.SeriesInstanceUID === seriesInstanceUid) ?? null;
  }

  async findInstanceByUid(studyInstanceUid, seriesInstanceUid, sopInstanceUid) {
    const series = await this.findSeriesByUid(studyInstanceUid, seriesInstanceUid);
    if (!series) return null;
    const instances = await Promise.all(series.Instances.map((id) => this.fetchJson(`/instances/${id}`)));
    return instances.find((instance) => instance.MainDicomTags?.SOPInstanceUID === sopInstanceUid) ?? null;
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
