import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// An isolated container only: never reads credentials or mutates an existing DB.
const name = `hp-v3-identity-${randomUUID()}`;
const label = 'highpass.validation.identity';
const owner = randomUUID();
const results = [];
let created = false;
let failed = false;
const start = Date.now();
function docker(args, input, timeout = 15000) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, windowsHide: true });
}
function sql(input) {
  return docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
  `SET statement_timeout='5s'; SET lock_timeout='3s';\n${input}`);
}
function pass(name, condition) {
  results.push({ name, result: condition ? 'PASS' : 'FAIL' });
  assert.ok(condition, 'SCHEMA_ASSERTION_FAILED');
}
function ok(name, input, expected = '') {
  const run = sql(input);
  pass(name, run.status === 0 && run.stdout.trim() === expected);
}
function deny(name, input, state) {
  // Only the exact SQLSTATE proves a policy/constraint denial, not any CLI failure.
  const run = sql(input);
  const observedState = run.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? null;
  // psql ON_ERROR_STOP scripts return 3 for SQL errors; 1 is a fatal client error.
  results.push({ name, result: run.status === 3 && observedState === state ? 'PASS' : 'FAIL',
    exitCode: run.status, sqlState: observedState });
  assert.ok(run.status === 3 && observedState === state, 'SCHEMA_ASSERTION_FAILED');
}
const ids = Array.from({ length: 9 }, () => randomUUID());
const [ta, tb, ha, hb, pa, pb, ma, mb, foreign] = ids;
const protectedRef = randomBytes(48).toString('hex');
const digest = randomBytes(32).toString('hex');
const mapping = (id, tenant, hospital, patient) =>
  `INSERT INTO highpass_v3.patient_mappings(mapping_id,tenant_id,hospital_id,patient_ref,protected_local_ref,local_ref_digest)
   VALUES('${id}','${tenant}','${hospital}','${patient}',decode('${protectedRef}','hex'),decode('${digest}','hex'));`;
const scoped = (tenant, hospital, body) => `BEGIN; SET LOCAL ROLE hp_identity_test;
  SET LOCAL app.tenant_id='${tenant}'; SET LOCAL app.hospital_id='${hospital}'; ${body} COMMIT;`;
try {
  const image = docker(['image', 'inspect', 'postgres:16-alpine', '--format', '{{.Id}}']);
  if (image.status !== 0) throw new Error('POSTGRES_IMAGE_UNAVAILABLE');
  const launch = docker(['run', '-d', '--pull=never', '--name', name, '--label', `${label}=${owner}`,
    '--network', 'none', '--memory', '256m', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data',
    '-e', `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`, 'postgres:16-alpine'], undefined, 20000);
  created = launch.status === 0;
  if (!created) throw new Error('POSTGRES_START_UNAVAILABLE');
  let ready = false;
  const readyUntil = Date.now() + 60000;
  while (Date.now() < readyUntil) {
    // TCP readiness avoids the image's temporary Unix-socket initialization server.
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-t', '2'], undefined, 4000).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('POSTGRES_READINESS_UNAVAILABLE');
  const migration = readFileSync(new URL('../db/migrations/006_highpass_v3_identity.sql', import.meta.url), 'utf8');
  ok('legacy sentinel initialized', "CREATE TABLE public.hospitals(id text PRIMARY KEY); INSERT INTO public.hospitals VALUES('SYNTHETIC-LEGACY-A');");
  ok('migration dry-run rollback leaves no v3 schema', `BEGIN; ${migration} ROLLBACK; SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3';`, '0');
  ok('additive migration committed', `BEGIN; ${migration} COMMIT;`);
  ok('legacy table and data unchanged', "SELECT id FROM public.hospitals;", 'SYNTHETIC-LEGACY-A');
  ok('synthetic tenant/hospital/ref/mapping fixture', `
    INSERT INTO highpass_v3.tenants VALUES('${ta}','SYNTH-A','SYNTHETIC A','ACTIVE'),('${tb}','SYNTH-B','SYNTHETIC B','ACTIVE');
    INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES('${ha}','${ta}','A'),('${hb}','${tb}','B');
    INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${pa}'),('${pb}');
    ${mapping(ma, ta, ha, pa)} ${mapping(mb, tb, hb, pa)}
    CREATE ROLE hp_identity_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA highpass_v3 TO hp_identity_test;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA highpass_v3 TO hp_identity_test;`);
  ok('nonowner test role cannot bypass RLS', "SELECT (NOT rolsuper AND NOT rolbypassrls) FROM pg_roles WHERE rolname='hp_identity_test';", 't');
  ok('A sees only own mapping and reachable ref', scoped(ta, ha, 'SELECT count(*) FROM highpass_v3.patient_mappings; SELECT count(*) FROM highpass_v3.patient_refs;'), '1\n1');
  ok('B sees only own mapping', scoped(tb, hb, 'SELECT mapping_id FROM highpass_v3.patient_mappings;'), mb);
  ok('missing context sees zero mappings', 'BEGIN; SET LOCAL ROLE hp_identity_test; SELECT count(*) FROM highpass_v3.patient_mappings; COMMIT;', '0');
  ok('hospital mismatch sees zero mappings', scoped(ta, hb, 'SELECT count(*) FROM highpass_v3.patient_mappings;'), '0');
  deny('foreign insert RLS denied', scoped(ta, ha, mapping(foreign, tb, hb, pb)), '42501');
  ok('foreign update and delete affect zero rows', scoped(ta, ha, `WITH changed AS (UPDATE highpass_v3.patient_mappings SET version=version+1 WHERE mapping_id='${mb}' RETURNING 1) SELECT count(*) FROM changed;
    WITH removed AS (DELETE FROM highpass_v3.patient_mappings WHERE mapping_id='${mb}' RETURNING 1) SELECT count(*) FROM removed;`), '0\n0');
  deny('same local digest cannot bind another PatientRef', scoped(ta, ha, mapping(foreign, ta, ha, pb)), '23505');
  deny('cross tenant hospital composite FK denied', mapping(foreign, ta, hb, pb), '23503');
  deny('VERIFIED requires reviewer and evidence', scoped(ta, ha, `UPDATE highpass_v3.patient_mappings SET status='VERIFIED' WHERE mapping_id='${ma}';`), '23514');
  deny('invalid mapping state denied', scoped(ta, ha, `UPDATE highpass_v3.patient_mappings SET status='AUTO_MERGED' WHERE mapping_id='${ma}';`), '23514');
  deny('nonpositive version denied', scoped(ta, ha, `UPDATE highpass_v3.patient_mappings SET version=0 WHERE mapping_id='${ma}';`), '23514');
  ok('same backend loses SET LOCAL context after commit', scoped(ta, ha, 'SELECT count(*) FROM highpass_v3.patient_mappings;') + '\nBEGIN; SET LOCAL ROLE hp_identity_test; SELECT count(*) FROM highpass_v3.patient_mappings; COMMIT;', '1\n0');
  ok('registry suspended', `UPDATE highpass_v3.tenants SET status='SUSPENDED' WHERE tenant_id='${ta}';`);
  ok('suspended tenant fails closed', scoped(ta, ha, 'SELECT count(*) FROM highpass_v3.patient_mappings;'), '0');
  deny('suspended tenant write denied', scoped(ta, ha, mapping(foreign, ta, ha, pb)), '42501');
  ok('foreign data and collision originals preserved', `SELECT count(*) FROM highpass_v3.patient_mappings WHERE patient_ref='${pa}' AND version=1 AND status='UNVERIFIED';`, '2');
  console.log(JSON.stringify({ result: 'PASS', scope: 'P0-04 SCHEMA ONLY / NOT SERVICE OR API ACCEPTANCE',
    imageId: image.stdout.trim(), migrationSha256: createHash('sha256').update(migration).digest('hex'), results,
    notVerified: ['authenticated app ACL', 'encryption/keyed digest generation', 'reviewer workflow and transactional audit',
      'real application connection pool', 'v3 HTTP and connector side effects'] }, null, 2));
} catch (error) {
  failed = true;
  const reason = ['POSTGRES_IMAGE_UNAVAILABLE','POSTGRES_START_UNAVAILABLE','POSTGRES_READINESS_UNAVAILABLE','SCHEMA_ASSERTION_FAILED'].includes(error.message) ? error.message : 'SCHEMA_OR_ENVIRONMENT_FAILURE';
  console.log(JSON.stringify({ result: results.some(item => item.result === 'FAIL') ? 'FAIL' : 'NOT VERIFIED', reason, results }, null, 2));
} finally {
  if (created) {
    const ownership = docker(['inspect', name, '--format', `{{index .Config.Labels "${label}"}}`]);
    const cleanup = ownership.status === 0 && ownership.stdout.trim() === owner
      ? docker(['rm', '-f', '-v', name], undefined, 20000) : { status: 1 };
    const removed = cleanup.status === 0;
    console.log(JSON.stringify({ cleanup: removed ? 'PASS' : 'NOT VERIFIED', durationMs: Date.now() - start }));
    if (!removed) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}
