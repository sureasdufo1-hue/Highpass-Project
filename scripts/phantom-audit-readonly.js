// Wrapper prepends phantom-release-evidence.js in this stdin module.
// Run inside the existing control container. Never invokes load/save/migration.
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {createHash} from 'node:crypto';
import {orderStoredAuditChain} from '/app/src/audit-chain-order.js';
import {HipassService} from '/app/src/services.js';
const reference=JSON.parse(process.argv[2]);
if (!reference || !['consentId','auditSessionId','tokenId'].every(key=>/^[A-Za-z0-9_-]{1,128}$/.test(reference[key]??''))) throw new Error('SAFE_REFERENCE_REQUIRED');
if(reference.negativeAuditSessionId!==undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(reference.negativeAuditSessionId)) throw new Error('SAFE_NEGATIVE_REFERENCE_REQUIRED');
const db=new Client({host:process.env.POSTGRES_HOST,database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,
  password:readFileSync(process.env.POSTGRES_PASSWORD_FILE,'utf8').trim(),connectionTimeoutMillis:5000,
  statement_timeout:5000,query_timeout:6000,options:'-c lock_timeout=2000'});
const checks=[];
if(reference.snapshotOnly===true) {
  let snapshot;
  try {
    await db.connect();
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const consent=await db.query('SELECT to_jsonb(c) AS data FROM consents c WHERE consent_id=$1',[reference.consentId]);
    if(consent.rows.length!==1) throw new Error('OWNED_CONSENT_REQUIRED');
    const scopes=await db.query('SELECT to_jsonb(s) AS data FROM consent_scopes s WHERE consent_id=$1 ORDER BY study_instance_uid,series_instance_uid,scope_id',[reference.consentId]);
    const counts=await db.query(`SELECT
      (SELECT count(*)::int FROM dicom_access_token_logs) AS tokens,
      (SELECT count(*)::int FROM capstone_key_releases) AS releases,
      (SELECT count(*)::int FROM capstone_key_releases WHERE consumed_at IS NOT NULL) AS consumed,
      (SELECT count(*)::int FROM audit_logs WHERE result='SUCCESS' AND action IN ('TOKEN_ISSUED','DATA_PLANE_RESPONSE_PREPARED','KEY_WRAP_AUTHORIZED','KEY_RELEASE_PREPARED','KEY_RELEASE_PRECHECKED','KEY_RELEASE_CONSUMED')) AS success`);
    const denials=await db.query("SELECT coalesce(reason_code,reason) AS reason,count(*)::int AS count FROM audit_logs WHERE result='FAIL' AND coalesce(reason_code,reason) ~ '^[A-Z0-9_]{1,80}$' GROUP BY coalesce(reason_code,reason)");
    snapshot={status:'PASS',scope:'READ_ONLY_SERIAL_NEGATIVE_WINDOW_GLOBAL_COUNTERS_NOT_PACKET_CAPTURE',
      counters:counts.rows[0],consentScopeSha256:createHash('sha256').update(JSON.stringify([consent.rows,scopes.rows])).digest('hex'),
      denialCounts:Object.fromEntries(denials.rows.map(row=>[row.reason,row.count]))};
    await db.query('ROLLBACK');
  } catch {snapshot={status:'NOT VERIFIED',reason:'NEGATIVE_SNAPSHOT_UNAVAILABLE'};}
  finally {await db.end();}
  console.log(JSON.stringify(snapshot)); process.exit(snapshot.status==='PASS'?0:1);
}
try {
  await db.connect();
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const consent=await db.query('SELECT status,patient_id FROM consents WHERE consent_id=$1',[reference.consentId]);
  checks.push({test:'EXACT_BROWSER_CONSENT_REVOKED',status:consent.rows[0]?.status==='REVOKED'?'PASS':'FAIL'});
  if(reference.identityDenialAuditRequired===true) {
    const denied=await db.query(`SELECT reason_code AS reason,count(*)::int AS count FROM audit_logs
      WHERE consent_id=$1 AND action='TOKEN_DENIED' AND result='FAIL' AND (
        (reason_code='ROLE_NOT_ALLOWED' AND actor_type='PATIENT' AND actor_id=$2 AND hospital_id IS NULL) OR
        (reason_code IN ('HOSPITAL_IDENTITY_MISMATCH','DOCTOR_IDENTITY_MISMATCH') AND actor_type='DOCTOR' AND actor_id=$3 AND hospital_id=$4))
      GROUP BY reason_code`,[reference.consentId,consent.rows[0]?.patient_id??null,'DOC-B-01','HOSP-B']);
    const reasons=Object.fromEntries(denied.rows.map(row=>[row.reason,row.count]));
    checks.push({test:'EXACT_CONSENT_AUTHENTICATED_ACTOR_IDENTITY_DENIALS',status:['ROLE_NOT_ALLOWED','HOSPITAL_IDENTITY_MISMATCH','DOCTOR_IDENTITY_MISMATCH'].every(reason=>reasons[reason]>0)?'PASS':'FAIL',reasons});
  }
  if(reference.negativeAuditSessionId) {
    const denied=await db.query("SELECT coalesce(reason_code,reason) AS reason,count(*)::int AS count FROM audit_logs WHERE consent_id=$1 AND audit_session_id=$2 AND action='TOKEN_INVALID' AND result='FAIL' GROUP BY coalesce(reason_code,reason)",[reference.consentId,reference.negativeAuditSessionId]);
    const reasons=Object.fromEntries(denied.rows.map(row=>[row.reason,row.count]));
    checks.push({test:'EXACT_BOUND_PROBE_SCOPE_PERMISSION_REVOCATION_DENIAL_REASONS',status:['TOKEN_STUDY_MISMATCH','TOKEN_PERMISSION_MISMATCH','TOKEN_CONSENT_INACTIVE'].every(reason=>reasons[reason]>0)?'PASS':'FAIL',reasons});
  }
  const releases=await db.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE consumed_at IS NOT NULL)::int AS consumed,count(*) FILTER (WHERE metadata->'binding'->>'keyId' LIKE 'https://kv-hp-demo-4869edd9.vault.azure.net/keys/%')::int AS vault FROM capstone_key_releases WHERE metadata->>'consentId'=$1 AND metadata->>'tokenId'=$2 AND metadata->>'auditSessionId'=$3",[reference.consentId,reference.tokenId,reference.auditSessionId]);
  const r=releases.rows[0];
  const unused=await db.query(`SELECT count(*) FILTER (WHERE expires_at <= transaction_timestamp())::int AS expired,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_logs a WHERE a.actor_id='key-release:' || k.release_id::text AND a.action='ACCESS_DENIED' AND a.result='FAIL' AND a.reason='KEY_RELEASE_DENIED'))::int AS denied
    FROM capstone_key_releases k WHERE consumed_at IS NULL AND metadata->>'consentId'=$1 AND metadata->>'tokenId'=$2 AND metadata->>'auditSessionId'=$3`,[reference.consentId,reference.tokenId,reference.auditSessionId]);
  r.unconsumedExpired=unused.rows[0].expired;
  r.unconsumedDenied=unused.rows[0].denied;
  const audited=await db.query(`SELECT count(*)::int AS count FROM capstone_key_releases k
    WHERE consumed_at IS NOT NULL AND metadata->>'consentId'=$1 AND metadata->>'tokenId'=$2 AND metadata->>'auditSessionId'=$3
    AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['KEY_RELEASE_PREPARED','KEY_RELEASE_PRECHECKED','KEY_RELEASE_CONSUMED']) expected(action)
      WHERE NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.actor_id='key-release:' || k.release_id::text AND a.consent_id=$1 AND a.audit_session_id=$3 AND a.result='SUCCESS' AND a.action=expected.action))
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.actor_id='key-release:' || (k.metadata->'binding'->>'packageId') AND a.consent_id=$1 AND a.audit_session_id=$3 AND a.result='SUCCESS' AND a.action='KEY_WRAP_AUTHORIZED')`,[reference.consentId,reference.tokenId,reference.auditSessionId]);
  r.consumedAudited=audited.rows[0].count;
  checks.push({test:'EXACT_TOKEN_VAULT_RELEASE_OUTCOMES_ACCOUNTED',status:classifyPhantomReleases(r,consent.rows[0]?.status==='REVOKED'),...r,allPreparedConsumed:r.total===r.consumed});
  const actions=await db.query('SELECT action,count(*)::int AS count FROM audit_logs WHERE consent_id=$1 AND audit_session_id=$2 AND result=$3 GROUP BY action',[reference.consentId,reference.auditSessionId,'SUCCESS']);
  const counts=Object.fromEntries(actions.rows.map(row=>[row.action,row.count]));
  checks.push({test:'WRAP_PRECHECK_CONSUME_AUDIT_LINKAGE',status:['KEY_WRAP_AUTHORIZED','KEY_RELEASE_PREPARED','KEY_RELEASE_PRECHECKED','KEY_RELEASE_CONSUMED'].every(action=>counts[action]>0)?'PASS':'FAIL',counts});
  const stored=await db.query('SELECT * FROM audit_logs');
  const rows=stored.rows.map(row=>Object.fromEntries([
    ['auditId','audit_id'],['auditSessionId','audit_session_id'],['actorType','actor_type'],['actorId','actor_id'],
    ['hospitalId','hospital_id'],['patientId','patient_id'],['consentId','consent_id'],['ticketId','ticket_id'],
    ['sourceHospitalId','source_hospital_id'],['targetHospitalId','target_hospital_id'],['action','action'],
    ['studyInstanceUid','study_instance_uid'],['seriesInstanceUid','series_instance_uid'],['sopInstanceUid','sop_instance_uid'],
    ['ipAddress','ip_address'],['userAgent','user_agent'],['result','result'],['reason','reason'],['previousHash','previous_hash'],['recordHash','record_hash']
  ].map(([field,column])=>[field,row[column]]).concat([['createdAt',new Date(row.created_at).toISOString()],['reasonCode',row.reason_code??row.reason]])));
  const ordered=orderStoredAuditChain(rows);
  const integrity=HipassService.prototype.verifyAuditIntegrity.call({store:{get:()=>ordered}});
  checks.push({test:'WHOLE_PERSISTED_AUDIT_CHAIN',status:integrity.ok?'PASS':'FAIL',checked:integrity.checked??0});
  await db.query('ROLLBACK');
} catch(error) {
  checks.push({test:'READ_ONLY_AUDIT_CHECK',status:'NOT VERIFIED',reason:/^[A-Z0-9_]{1,40}$/.test(error.code??'')?error.code:'READ_ONLY_CHECK_FAILED'});
} finally {await db.end();}
console.log(JSON.stringify({scope:'READ_ONLY_PG_BROWSER_CONSENT_TOKEN_RELEASE_CHAIN_NOT_AZURE_VAULT_SERVICE_LOG',review:'DRAFT / UNASSIGNED',checks,status:checks.every(c=>c.status==='PASS')?'PASS':checks.some(c=>c.status==='FAIL')?'FAIL':'NOT VERIFIED'}));
