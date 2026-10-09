import test from 'node:test';import assert from 'node:assert/strict';
import {buildCapstoneSourceExchangeRehearsalSql,buildCapstoneSourceExchangeActivationSql,buildCapstoneSourceExchangeAuditDependencySql} from '../src/v3-capstone-source-exchange-profile.js';
import {readFileSync} from 'node:fs';
test('source exchange profile rehearsal is bounded narrow and always rolls back',()=>{
 const sql=buildCapstoneSourceExchangeRehearsalSql({targetDatabase:'highpass_v3_capstone'});
 assert.ok(sql.startsWith('BEGIN;')&&sql.endsWith('ROLLBACK;'));
 assert.match(sql,/SET LOCAL ROLE hp_v3_app/);assert.match(sql,/relforcerowsecurity/);
 assert.match(sql,/V3_EXCHANGE_SOURCE_BASELINE_REQUIRED/);assert.match(sql,/GRANT UPDATE\(session_id\)/);
 assert.doesNotMatch(sql,/COMMIT|GRANT ALL|TO PUBLIC|CREATE ROLE|PASSWORD|BYPASSRLS|GRANT.*consent/);
 assert.match(sql,/sourceOnlyScopes/);assert.match(sql,/destructiveDenied/);
 assert.match(sql,/NOT p.prosecdef/);assert.match(sql,/granted.rolname<>'hp_v3_clinical_policy'/);
});
test('operator rehearsal pins SSH and legacy image and checks post-rollback state',()=>{
 const source=readFileSync(new URL('../scripts/capstone-v3-source-exchange-profile-check.py',import.meta.url),'utf8');
 assert.match(source,/paramiko.RejectPolicy\(\)/);assert.match(source,/before!=after/);
 assert.match(source,/if not sql.startswith\('BEGIN;'\) or not sql.endswith\('ROLLBACK;'\)/);
 assert.match(source,/SQL_ROLE_PRIVILEGE_AND_UNBOUND_RLS_CHECK_NOT_LOGIN_SERVICE_OR_SESSION_E2E/);
 assert.doesNotMatch(source,/AutoAddPolicy|COMMIT;|key_file.*read|print\(.*stderr/);
});
test('legacy and arbitrary database targets fail before SQL is produced',()=>{
 for(const targetDatabase of ['hipass','postgres',undefined,"highpass_v3_capstone';COMMIT;"])
 assert.throws(()=>buildCapstoneSourceExchangeRehearsalSql({targetDatabase}),/TARGET_INVALID/);
});
test('explicit activation retains pristine guard and asserts source scopes before commit',()=>{
 const sql=buildCapstoneSourceExchangeActivationSql({targetDatabase:'highpass_v3_capstone'});
 assert.ok(sql.endsWith('COMMIT;'));assert.match(sql,/V3_EXCHANGE_PRISTINE_FUNCTION_GRANTS_REQUIRED/);
 assert.match(sql,/V3_EXCHANGE_ACTIVATION_SCOPE_MISMATCH/);assert.doesNotMatch(sql,/TO PUBLIC|GRANT ALL|GRANT.*consent/);
});
test('restrictive audit dependency adds only four read columns and denies event mutation',()=>{
 const sql=buildCapstoneSourceExchangeAuditDependencySql({targetDatabase:'highpass_v3_capstone'});
 assert.ok(sql.endsWith('ROLLBACK;'));
 assert.match(sql,/GRANT SELECT\(event_id,session_id,actor_id,to_version\) ON highpass_v3.exchange_state_events TO hp_v3_app/);
 assert.match(sql,/eventMutationDenied/);assert.match(sql,/relforcerowsecurity/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|TO PUBLIC|ALTER POLICY|SECURITY DEFINER/);
 assert.ok(buildCapstoneSourceExchangeAuditDependencySql({targetDatabase:'highpass_v3_capstone',mode:'ACTIVATE'}).endsWith('COMMIT;'));
 assert.throws(()=>buildCapstoneSourceExchangeAuditDependencySql({targetDatabase:'hipass'}));
 assert.throws(()=>buildCapstoneSourceExchangeAuditDependencySql({targetDatabase:'highpass_v3_capstone',mode:'SKIP'}));
});
