import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCapstoneV3MigrationBundle,capstoneV3MigrationFiles,buildCapstoneV3BootstrapSql} from '../src/v3-capstone-migration-bundle.js';
const manifest=JSON.parse(readFileSync('config/capstone-v3-migrations-20261009.json','utf8'));
const config={root:process.cwd(),manifest};
test('frozen capstone manifest loads exact25 dependency-ordered migrations excluding legacy030',()=>{
 const bundle=readCapstoneV3MigrationBundle(config);assert.equal(bundle.entries.length,25);
 assert.equal(bundle.entries.at(-1).file,'031_highpass_v3_identity_network_audit.sql');
 assert.ok(!bundle.entries.some(entry=>entry.file.startsWith('030_')));assert.match(bundle.digest,/^[a-f0-9]{64}$/);
 assert.ok(Object.isFrozen(bundle)&&Object.isFrozen(bundle.entries)&&bundle.entries.every(Object.isFrozen));
});
test('bootstrap accepts only privately verified bundle and exact fresh-target names; ownership is inside COMMIT',()=>{
 const bundle=readCapstoneV3MigrationBundle(config);
 for(const value of [{},structuredClone(bundle)])assert.throws(()=>buildCapstoneV3BootstrapSql(value,{targetDatabase:'highpass_v3_capstone'}));
 for(const targetDatabase of ['hipass','postgres','unknown',"x';DROP DATABASE hipass;"])
  assert.throws(()=>buildCapstoneV3BootstrapSql(bundle,{targetDatabase}));
 const sql=buildCapstoneV3BootstrapSql(bundle,{targetDatabase:'highpass_v3_capstone_rehearsal'});
 assert.ok(sql.startsWith('BEGIN;')&&sql.endsWith('COMMIT;'));
 assert.ok(sql.indexOf('ALTER SCHEMA highpass_v3 OWNER TO hp_v3_schema_owner')<sql.lastIndexOf('COMMIT;'));
 assert.ok(!sql.includes('CREATE ROLE hp_v3_app LOGIN'));assert.ok(!sql.includes('DROP DATABASE'));
});
test('missing altered reordered duplicated or arbitrary-path baseline never becomes current-source approval',()=>{
 for(const modify of [m=>m.migrations.pop(),m=>m.migrations.reverse(),m=>m.migrations[0].file='../escape.sql',
  m=>m.migrations[0].sha256='0'.repeat(64),m=>m.migrations[1]=m.migrations[0],m=>m.scope='PRODUCTION']){
  const value=structuredClone(manifest);modify(value);assert.throws(()=>readCapstoneV3MigrationBundle({...config,manifest:value}),/NOT_VERIFIED/);
 }
 assert.throws(()=>readCapstoneV3MigrationBundle({...config,read:()=> 'ALTERED'}),/NOT_VERIFIED/);
 assert.equal(capstoneV3MigrationFiles.length,25);
});
