import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Explicit dependency order; legacy030 must never enter this bundle.
export const capstoneV3MigrationFiles=Object.freeze([
 '006_highpass_v3_identity.sql','007_highpass_v3_identity_transactions.sql','008_highpass_v3_patient_ref_registration.sql',
 '009_highpass_v3_identity_idempotency.sql','010_highpass_v3_mapping_review.sql','011_highpass_v3_exchange_foundation.sql',
 '012_highpass_v3_exchange_create_authority.sql','013_highpass_v3_exchange_read_audit.sql','014_highpass_v3_exchange_requested_actions.sql',
 '015_highpass_v3_exchange_cancel_events.sql','016_highpass_v3_expiry_principal.sql','017_highpass_v3_exchange_expiry_events.sql',
 '018_highpass_v3_pending_preparation_foundation.sql','019_highpass_v3_pending_source_projection.sql','020_highpass_v3_pending_write_authority.sql',
 '021_highpass_v3_pending_network_audit.sql','022_highpass_v3_preauth_security_events.sql','023_highpass_v3_patient_ceremony_foundation.sql',
 '024_highpass_v3_patient_approval_projection.sql','025_highpass_v3_patient_challenge_issuance.sql','026_highpass_v3_patient_consent_decisions.sql',
 '027_highpass_v3_consent_lifecycle.sql','028_highpass_v3_withdrawal_outcomes.sql','029_highpass_v3_consent_expiry_batches.sql',
 '031_highpass_v3_identity_network_audit.sql'
]);
export const capstoneV3PolicyRoles=Object.freeze(['hp_v3_clinical_policy','hp_v3_expiry_policy','hp_v3_pending_policy',
 'hp_v3_preauth_publisher_policy','hp_v3_preauth_reader_policy','hp_v3_consent_approval_policy','hp_v3_consent_withdraw_policy','hp_v3_consent_expiry_policy']);
const fail=()=>{throw Error('V3_MIGRATION_MANIFEST_NOT_VERIFIED');};
const verifiedBundles=new WeakSet();

/** Loads only the fixed local bundle matching an explicit frozen baseline.
 * No network, SQL execution, current-hash self-approval or credential issuance. */
export function readCapstoneV3MigrationBundle({root,manifest,read=readFileSync}={}){
 if(typeof root!=='string'||!manifest||manifest.scope!=='CAPSTONE_SYNTHETIC_ONLY'||manifest.version!==1
  ||!Array.isArray(manifest.migrations)||manifest.migrations.length!==capstoneV3MigrationFiles.length||typeof read!=='function')fail();
 const entries=capstoneV3MigrationFiles.map((file,index)=>{
  const entry=manifest.migrations[index];
  if(!entry||Object.keys(entry).sort().join(',')!=='file,sha256'||entry.file!==file||!/^[a-f0-9]{64}$/.test(entry.sha256??''))fail();
  let sql;try{sql=read(path.join(root,'db','migrations',file),'utf8');}catch{fail();}
  if(typeof sql!=='string'||createHash('sha256').update(sql).digest('hex')!==entry.sha256)fail();
  return Object.freeze({file,sha256:entry.sha256,sql});
 });
 const digest=createHash('sha256').update(JSON.stringify(entries.map(({file,sha256})=>({file,sha256})))).digest('hex');
 const bundle=Object.freeze({entries:Object.freeze(entries),digest,scope:'CAPSTONE_SYNTHETIC_ONLY'});
 verifiedBundles.add(bundle);return bundle;
}

/** Fresh empty target only. Atomic DDL, ledger, NOLOGIN ownership and catalog guard.
 * No runtime login, identity or original-patient enrollment. */
export function buildCapstoneV3BootstrapSql(bundle,{targetDatabase}={}){
 if(!verifiedBundles.has(bundle)||!['highpass_v3_capstone','highpass_v3_capstone_rehearsal'].includes(targetDatabase))fail();
 const roles=[...capstoneV3PolicyRoles,'hp_v3_schema_owner','hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader'];
 const names=roles.map(name=>"'"+name+"'").join(',');
 return `BEGIN;
 SET LOCAL statement_timeout='3000ms';SET LOCAL lock_timeout='1000ms';
 DO $$ BEGIN
 IF current_database()<>'${targetDatabase}' OR current_user NOT IN ('hipass_bootstrap','postgres')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPLICIT_ADMINISTRATIVE_MIGRATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716031);
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='highpass_v3')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (${names}))
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='CAPSTONE_TARGET_COLLISION'; END IF;
 END $$;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 ${bundle.entries.map(entry=>entry.sql).join('\n')}
 CREATE TABLE highpass_v3.deployment_migrations(
 sequence integer PRIMARY KEY,file_name text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 bundle_sha256 text NOT NULL CHECK(bundle_sha256~'^[a-f0-9]{64}$'),scope text NOT NULL CHECK(scope='CAPSTONE_SYNTHETIC_ONLY'),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp());
 ALTER TABLE highpass_v3.deployment_migrations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE highpass_v3.deployment_migrations FORCE ROW LEVEL SECURITY;
 REVOKE ALL ON highpass_v3.deployment_migrations FROM PUBLIC;
 CREATE TRIGGER deployment_migrations_immutable BEFORE UPDATE OR DELETE ON highpass_v3.deployment_migrations
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
 INSERT INTO highpass_v3.deployment_migrations(sequence,file_name,sha256,bundle_sha256,scope) VALUES
 ${bundle.entries.map((entry,index)=>`(${index+1},'${entry.file}','${entry.sha256}','${bundle.digest}','CAPSTONE_SYNTHETIC_ONLY')`).join(',')};
 CREATE ROLE hp_v3_schema_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
 DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='highpass_v3' AND c.relkind IN ('r','p')
 LOOP EXECUTE format('ALTER TABLE highpass_v3.%I OWNER TO hp_v3_schema_owner',item.relname);END LOOP;
 FOR item IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highpass_v3'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO hp_v3_schema_owner',item.signature);END LOOP;
 END $$;
 ALTER SCHEMA highpass_v3 OWNER TO hp_v3_schema_owner;
 COMMIT;`;
}
