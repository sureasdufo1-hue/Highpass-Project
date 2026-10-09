import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync('/fixtures/manifest.json', 'utf8'));
const checks = [];
const deadline = setTimeout(() => { console.log(JSON.stringify({ status: 'NOT VERIFIED', reason: 'PHANTOM_PROBE_DEADLINE', checks })); process.exit(1); }, 25000);
const request = async (path, options = {}) => {
  const response = await fetch('http://127.0.0.1:8042' + path, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('PHANTOM_PACS_HTTP_' + response.status);
  return response;
};
try {
  if (manifest.instances.length !== 24 || manifest.clinicalUseAllowed !== false) throw new Error('PHANTOM_MANIFEST_INVALID');
  for (const entry of manifest.instances) {
    if (!/^(ct|mr)-\d{2}\.dcm$/.test(entry.file)) throw new Error('PHANTOM_FILE_INVALID');
    const dicom = readFileSync('/fixtures/' + entry.file);
    if (createHash('sha256').update(dicom).digest('hex') !== entry.sha256) throw new Error('PHANTOM_HASH_INVALID');
    const stored = await (await request('/instances', { method: 'POST', headers: { 'content-type': 'application/dicom' }, body: dicom })).json();
    if (stored.Status !== 'Success') throw new Error('PHANTOM_UPLOAD_NOT_NEW');
    const tags = await (await request('/instances/' + stored.ID + '/simplified-tags')).json();
    if (tags.SOPInstanceUID !== entry.sopUid || tags.PatientID !== manifest.patientIdentifier || Number(tags.Rows) !== 256 || Number(tags.Columns) !== 256) throw new Error('PHANTOM_TAGS_MISMATCH');
    const returned = Buffer.from(await (await request('/instances/' + stored.ID + '/file')).arrayBuffer());
    if (createHash('sha256').update(returned).digest('hex') !== entry.sha256) throw new Error('PHANTOM_SOURCE_NOT_BIT_PRESERVED');
    const png = Buffer.from(await (await request('/instances/' + stored.ID + '/preview')).arrayBuffer());
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) throw new Error('PHANTOM_PREVIEW_INVALID');
    checks.push({ modality: entry.modality, slice: entry.slice, status: 'PASS', storedByteIntegrity: 'PASS', renderedDimensions: [256, 256] });
  }
  const studies = await (await request('/studies')).json(), instances = await (await request('/instances')).json();
  if (studies.length !== 2 || instances.length !== 24) throw new Error('PHANTOM_COUNTS_MISMATCH');
  console.log(JSON.stringify({ status: 'PASS', scope: 'ISOLATED_OFFLINE_ORTHANC_FORMAT_STORAGE_RENDERING_ONLY_NOT_DISTRIBUTED_E2E', review: 'DRAFT / UNASSIGNED', studies: 2, instances: 24, checks }));
} catch (error) {
  console.log(JSON.stringify({ status: 'FAIL', checks, reason: /^PHANTOM_[A-Z_0-9]+$/.test(error.message) ? error.message : 'PHANTOM_PROBE_ERROR' }));
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
}
