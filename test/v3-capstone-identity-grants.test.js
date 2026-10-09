import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCapstoneIdentityGrantsSql,capstoneIdentityLoginRoles} from '../src/v3-capstone-identity-grants.js';
test('grant target is fixed and never legacy or user-controlled SQL',()=>{
 for(const targetDatabase of ['hipass','postgres',undefined,'highpass_v3_capstone;DROP DATABASE hipass'])
 assert.throws(()=>buildCapstoneIdentityGrantsSql({targetDatabase}),/V3_GRANT_TARGET_INVALID/);
});
test('Identity profile is transactional and excludes credentials broad future grants and other domains',()=>{
 const sql=buildCapstoneIdentityGrantsSql({targetDatabase:'highpass_v3_capstone'});
 assert.ok(sql.startsWith('BEGIN;'));assert.ok(sql.endsWith('COMMIT;'));
 assert.match(sql,/V3_GRANT_ROLE_NOT_PRISTINE/);assert.match(sql,/pg_advisory_xact_lock/);
 assert.doesNotMatch(sql,/PASSWORD|CREATE ROLE|ALL TABLES|ALTER DEFAULT PRIVILEGES|GRANT ALL|exchange_sessions|deployment_migrations|patient_consents/);
 assert.equal(capstoneIdentityLoginRoles.length,3);assert.ok(Object.isFrozen(capstoneIdentityLoginRoles));
});
