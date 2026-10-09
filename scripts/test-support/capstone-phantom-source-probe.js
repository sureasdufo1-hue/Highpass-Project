// Operator-owned additive PACS seeding only. Not consent/mapping authorization evidence.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { boundedHttps } from '/app/src/data-plane-gateway.js';
import { extractSingleDicomInstance } from '/app/src/dicomweb-single-instance.js';
const manifest = JSON.parse(readFileSync('/fixtures/manifest.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
let added = 0;
const deadline = setTimeout(() => { console.log(JSON.stringify({ status: 'NOT VERIFIED', reason: 'SOURCE_PROBE_DEADLINE', checks })); process.exit(1); }, 90000);
const request = async (path, options = {}) => {
  const response = await fetch('http://orthanc:8042' + path, { ...options, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('SOURCE_PACS_HTTP_FAILURE');
  return response;
};
const tls = { ca: readFileSync('/run/pacs/ca.crt'), cert: readFileSync('/run/pacs/gateway-client.crt'), key: readFileSync('/run/pacs/gateway-client.key'), servername: 'hospital-a-orthanc-mtls' };
const query = pathname => boundedHttps('https://orthanc-mtls:8443', pathname, { tls,
  headers: { accept: pathname.endsWith('/rendered') ? 'image/png' : pathname.endsWith('/instances') ? 'application/dicom+json' : 'multipart/related; type=application/dicom' },
  timeoutMs: 5000, maxBytes: 1048576 });
try {
  if (manifest.generator !== 'highpass-geometric-phantom-v1' || manifest.patientIdentifier !== 'HP-TEST-PHANTOM-001' || manifest.instances.length !== 24 || manifest.clinicalUseAllowed !== false) throw new Error('SOURCE_MANIFEST_INVALID');
  const before = await (await request('/instances')).json();
  const staged = [];
  // Verify ALL inputs and existing UID collisions before the first payload mutation.
  for (const entry of manifest.instances) {
    if (!/^(ct|mr)-\d{2}\.dcm$/.test(entry.file) || !/^1\.2\.826\.0\.1\.3680043\.10\.5432\.20261009\.[12]\.1\.([1-9]|1[0-2])$/.test(entry.sopUid)) throw new Error('SOURCE_UID_OR_FILE_INVALID');
    const bytes = readFileSync('/fixtures/' + entry.file);
    if (hash(bytes) !== entry.sha256) throw new Error('SOURCE_INPUT_HASH_INVALID');
    const found = await (await request('/tools/find', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Level: 'Instance', Query: { SOPInstanceUID: entry.sopUid } }) })).json();
    if (found.length > 1) throw new Error('SOURCE_UID_AMBIGUOUS');
    if (found.length && hash(Buffer.from(await (await request('/instances/' + found[0] + '/file')).arrayBuffer())) !== entry.sha256) throw new Error('SOURCE_EXISTING_UID_CONFLICT');
    staged.push({ entry, bytes, exists: found.length === 1 });
  }
  if (process.env.HIPASS_PHANTOM_VERIFY_ONLY === '1' && staged.some(row => !row.exists)) throw new Error('SOURCE_VERIFY_ONLY_MISSING_INSTANCE');
  for (const { entry, bytes, exists } of staged) {
    if (!exists) {
      const stored = await (await request('/instances', { method: 'POST', headers: { 'content-type': 'application/dicom' }, body: bytes })).json();
      if (stored.Status !== 'Success') throw new Error('SOURCE_UPLOAD_NOT_NEW');
      added++;
    }
    const pathname = `/dicom-web/studies/${entry.studyUid}/series/${entry.seriesUid}/instances/${entry.sopUid}`;
    const dicom = await query(pathname);
    if (dicom.status !== 200 || hash(extractSingleDicomInstance(dicom)) !== entry.sha256) throw new Error('SOURCE_MTLS_WADO_INTEGRITY_INVALID');
    const rendered = await query(pathname + '/rendered');
    if (rendered.status !== 200 || rendered.body.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || rendered.body.readUInt32BE(16) !== 256 || rendered.body.readUInt32BE(20) !== 256) throw new Error('SOURCE_MTLS_RENDER_INVALID');
    checks.push({ modality: entry.modality, slice: entry.slice, status: 'PASS', reusedIdenticalInstance: exists, mtlsWadoIntegrity: 'PASS', renderedDimensions: [256, 256] });
  }
  for (const modality of ['CT', 'MR']) {
    const entry = manifest.instances.find(row => row.modality === modality);
    const response = await query(`/dicom-web/studies/${entry.studyUid}/series/${entry.seriesUid}/instances`);
    const rows = JSON.parse(response.body.toString());
    const expected = new Set(manifest.instances.filter(row => row.modality === modality).map(row => row.sopUid));
    if (response.status !== 200 || rows.length !== 12 || rows.some(row => !expected.delete(row['00080018']?.Value?.[0])) || expected.size) throw new Error('SOURCE_MTLS_QIDO_SCOPE_INVALID');
  }
  const after = await (await request('/instances')).json();
  if (after.length !== before.length + added || before.some(id => !after.includes(id))) throw new Error('SOURCE_EXISTING_INSTANCES_NOT_PRESERVED');
  console.log(JSON.stringify({ status: 'PASS', scope: 'A_OPERATOR_SYNTHETIC_SOURCE_MTLS_ONLY_NOT_MAPPING_OR_CONSENT_E2E', readOnlyVerification: process.env.HIPASS_PHANTOM_VERIFY_ONLY === '1', review: 'DRAFT / UNASSIGNED', checks, addedInstances: added, sourceInstancesBefore: before.length, sourceInstancesAfter: after.length, deletedInstances: 0, existingInstanceIdsPreserved: true, qidoSeries: 2, qidoInstancesPerSeries: 12 }));
} catch (error) {
  console.log(JSON.stringify({ status: 'NOT VERIFIED', checks, reason: /^SOURCE_[A-Z_]+$/.test(error.message) ? error.message : 'SOURCE_PROBE_ERROR', partialAdditionsMayRemain: true, addedInstances: added, deletedInstances: 0 }));
  process.exitCode = 1;
} finally { clearTimeout(deadline); }
