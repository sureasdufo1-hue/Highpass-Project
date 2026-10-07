import fs from "node:fs";
import path from "node:path";
import { createSeedData } from "./seed.js";

let cachedStore = null;

export function getCuratedDicomStore(curatedDir = path.resolve("data/curated-dicom")) {
  if (cachedStore) return cachedStore;

  const studiesMap = new Map();
  const seriesMap = new Map();
  const instancesMap = new Map();

  if (fs.existsSync(curatedDir)) {
    const seriesFolders = fs.readdirSync(curatedDir).sort();

  for (const folder of seriesFolders) {
    const folderPath = path.join(curatedDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".dcm")).sort();
    if (files.length === 0) continue;

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const header = parseDicomHeader(filePath);
      if (!header || !header.studyInstanceUid || !header.seriesInstanceUid || !header.sopInstanceUid) {
        continue;
      }

      const { studyInstanceUid, seriesInstanceUid, sopInstanceUid } = header;

      // Register or update Study
      if (!studiesMap.has(studyInstanceUid)) {
        studiesMap.set(studyInstanceUid, {
          ID: `curated-${studyInstanceUid}`,
          MainDicomTags: {
            StudyInstanceUID: studyInstanceUid,
            StudyDate: header.studyDate,
            StudyDescription: header.studyDescription,
          },
          PatientMainDicomTags: {
            PatientID: "P-1001",
            PatientName: "HIPASS^VIRTUAL^1001",
          },
          Series: [],
          _curated: true,
        });
      }

      const study = studiesMap.get(studyInstanceUid);
      const seriesKey = `${studyInstanceUid}:${seriesInstanceUid}`;

      // Register or update Series
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, {
          ID: `curated-series-${seriesInstanceUid}`,
          MainDicomTags: {
            SeriesInstanceUID: seriesInstanceUid,
            Modality: header.modality,
            SeriesDescription: header.seriesDescription,
            SeriesNumber: String(header.seriesNumber || "1"),
          },
          Instances: [],
          _curated: true,
          _studyInstanceUid: studyInstanceUid,
        });
        study.Series.push(`curated-series-${seriesInstanceUid}`);
      }

      const series = seriesMap.get(seriesKey);
      const instanceKey = `${seriesKey}:${sopInstanceUid}`;

      // Register Instance
      const instanceObj = {
        ID: `curated-instance-${sopInstanceUid}`,
        MainDicomTags: {
          SOPInstanceUID: sopInstanceUid,
          InstanceNumber: String(header.instanceNumber || "1"),
        },
        filePath,
        fileSize: header.fileSize,
        _curated: true,
        _studyInstanceUid: studyInstanceUid,
        _seriesInstanceUid: seriesInstanceUid,
      };

      instancesMap.set(instanceKey, instanceObj);
      series.Instances.push(instanceObj);
    }
  }
}

  // Merge synthetic studies from seed / database so all studies can be queried via DICOMweb
  const allSyntheticStudies = [];
  try {
    const seed = createSeedData();
    if (Array.isArray(seed?.imagingStudies)) {
      allSyntheticStudies.push(...seed.imagingStudies);
    }
  } catch {
    // ignore
  }
  try {
    const dbPath = path.resolve("data/hipass-db.json");
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      if (Array.isArray(db?.imagingStudies)) {
        for (const s of db.imagingStudies) {
          if (!allSyntheticStudies.some((x) => x.studyInstanceUid === s.studyInstanceUid)) {
            allSyntheticStudies.push(s);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  for (const sStudy of allSyntheticStudies) {
    if (!sStudy.studyInstanceUid) continue;

    if (!studiesMap.has(sStudy.studyInstanceUid)) {
      studiesMap.set(sStudy.studyInstanceUid, {
        ID: `curated-${sStudy.studyInstanceUid}`,
        MainDicomTags: {
          StudyInstanceUID: sStudy.studyInstanceUid,
          StudyDate: sStudy.studyDate || "2026-06-20",
          StudyDescription: sStudy.description || "Medical Examination",
        },
        PatientMainDicomTags: {
          PatientID: sStudy.patientId || "P-1001",
          PatientName: "HIPASS^VIRTUAL^1001",
        },
        Series: [],
        _curated: true,
        _synthetic: true,
      });
    }

    const study = studiesMap.get(sStudy.studyInstanceUid);

    for (const s of sStudy.series || []) {
      const seriesKey = `${sStudy.studyInstanceUid}:${s.seriesInstanceUid}`;
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, {
          ID: `curated-series-${s.seriesInstanceUid}`,
          MainDicomTags: {
            SeriesInstanceUID: s.seriesInstanceUid,
            Modality: s.modality || sStudy.modality || "OT",
            SeriesDescription: s.description || "Series",
            SeriesNumber: "1",
          },
          Instances: [],
          _curated: true,
          _synthetic: true,
          _studyInstanceUid: sStudy.studyInstanceUid,
          previewImageUrl: s.previewImageUrl,
        });
        study.Series.push(`curated-series-${s.seriesInstanceUid}`);
      }

      const series = seriesMap.get(seriesKey);
      const count = Math.min(s.instanceCount || 1, 32);
      for (let i = 1; i <= count; i++) {
        const sopInstanceUid = `${s.seriesInstanceUid}.${i}`;
        const instanceKey = `${seriesKey}:${sopInstanceUid}`;
        if (!instancesMap.has(instanceKey)) {
          const instanceObj = {
            ID: `curated-instance-${sopInstanceUid}`,
            MainDicomTags: {
              SOPInstanceUID: sopInstanceUid,
              InstanceNumber: String(i),
            },
            filePath: null,
            fileSize: 512 * 1024,
            _curated: true,
            _synthetic: true,
            _studyInstanceUid: sStudy.studyInstanceUid,
            _seriesInstanceUid: s.seriesInstanceUid,
            previewImageUrl: s.previewImageUrl,
          };
          instancesMap.set(instanceKey, instanceObj);
          series.Instances.push(instanceObj);
        }
      }
    }
  }

  for (const series of seriesMap.values()) {
    series.Instances.sort((a, b) => {
      const na = parseInt(a.MainDicomTags?.InstanceNumber || "0", 10);
      const nb = parseInt(b.MainDicomTags?.InstanceNumber || "0", 10);
      return na - nb;
    });
  }

  cachedStore = {
    studies: Array.from(studiesMap.values()),
    series: Array.from(seriesMap.values()),
    instances: Array.from(instancesMap.values()),
    findStudy: (studyUid) => studiesMap.get(studyUid) ?? null,
    findSeries: (studyUid, seriesUid) => seriesMap.get(`${studyUid}:${seriesUid}`) ?? null,
    findInstance: (studyUid, seriesUid, sopUid) => instancesMap.get(`${studyUid}:${seriesUid}:${sopUid}`) ?? null,
  };

  return cachedStore;
}

export function parseDicomHeader(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 132) return null;

    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(Math.min(stat.size, 131072));
    fs.readSync(fd, buffer, 0, buffer.length, 0);

    if (buffer.subarray(128, 132).toString("ascii") !== "DICM") {
      return null;
    }

    let offset = 132;
    const tags = {};
    const seqDelim = Buffer.from([0xFE, 0xFF, 0xDD, 0xE0]);

    while (offset + 8 <= buffer.length) {
      const group = buffer.readUInt16LE(offset);
      const element = buffer.readUInt16LE(offset + 2);
      const tag = (group.toString(16).padStart(4, "0") + element.toString(16).padStart(4, "0")).toUpperCase();
      const vr = buffer.subarray(offset + 4, offset + 6).toString("ascii");

      const longVr = ["OB", "OD", "OF", "OL", "OW", "SQ", "UC", "UR", "UT", "UN"].includes(vr);
      const lengthOffset = longVr ? offset + 8 : offset + 6;
      const valueOffset = longVr ? offset + 12 : offset + 8;

      if (lengthOffset + 2 > buffer.length) break;

      const length = longVr
        ? (lengthOffset + 4 <= buffer.length ? buffer.readUInt32LE(lengthOffset) : 0)
        : buffer.readUInt16LE(lengthOffset);

      if (length === 0xFFFFFFFF) {
        const nextDelim = buffer.indexOf(seqDelim, valueOffset);
        if (nextDelim !== -1 && nextDelim + 8 <= buffer.length) {
          offset = nextDelim + 8;
          continue;
        } else {
          break;
        }
      }

      if (valueOffset + length > buffer.length) break;

      tags[tag] = {
        rawValue: buffer.subarray(valueOffset, valueOffset + length),
      };

      if (tag === "7FE00010") break;
      offset = valueOffset + length;
    }

    const getString = (t) => (tags[t]?.rawValue ? tags[t].rawValue.toString("latin1").replace(/\0/g, "").trim() : null);
    const getUint16 = (t) => (tags[t]?.rawValue && tags[t].rawValue.length >= 2 ? tags[t].rawValue.readUInt16LE(0) : null);

    return {
      filePath,
      fileSize: stat.size,
      modality: getString("00080060") || "OT",
      studyDate: getString("00080020") || "UNKNOWN_DATE",
      studyDescription: getString("00081030") || "General Examination",
      seriesDescription: getString("0008103E") || "Series",
      studyInstanceUid: getString("0020000D") || "",
      seriesInstanceUid: getString("0020000E") || "",
      sopInstanceUid: getString("00080018") || "",
      seriesNumber: getString("00200011") || "1",
      instanceNumber: getString("00200013") || "1",
      rows: getUint16("00280010"),
      columns: getUint16("00280011"),
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
