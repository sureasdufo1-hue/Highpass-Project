import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createPhantomInstance, PHANTOM_VERSION } from './test-support/synthetic-phantom.js';

// Exclusive new directory: never overwrite an existing dataset or PACS instance.
const output = path.resolve('artifacts/synthetic-phantom', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
mkdirSync(path.dirname(output), { recursive: true });
mkdirSync(output);
const instances = [];
for (const modality of ['CT', 'MR']) for (let slice = 1; slice <= 12; slice++) {
  const sample = createPhantomInstance(modality, slice);
  const file = `${modality.toLowerCase()}-${String(slice).padStart(2, '0')}.dcm`;
  writeFileSync(path.join(output, file), sample.dicom, { flag: 'wx' });
  const { dicom, ...metadata } = sample;
  instances.push({ file, ...metadata, bytes: dicom.length, sha256: createHash('sha256').update(dicom).digest('hex') });
}
const manifest = { generator: PHANTOM_VERSION, review: 'DRAFT / UNASSIGNED',
  source: 'PROJECT-GENERATED DETERMINISTIC MATHEMATICAL SHAPES; NO EXTERNAL OR PATIENT DATA',
  qualifier: 'SYNTHETIC SECONDARY CAPTURE DEMO ONLY — NOT SCANNER DATA, CLINICAL ANATOMY OR DIAGNOSTIC CT/MR',
  patientIdentifier: 'HP-TEST-PHANTOM-001', clinicalUseAllowed: false,
  deployment: 'NOT DEPLOYED; EXISTING PACS AND CONTROL METADATA UNCHANGED',
  generatorSha256: createHash('sha256').update((await import('node:fs')).readFileSync(new URL('./test-support/synthetic-phantom.js', import.meta.url))).digest('hex'), instances };
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', generatedInstances: instances.length, output, deployment: manifest.deployment }));
