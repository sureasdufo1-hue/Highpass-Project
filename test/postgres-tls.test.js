import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresTlsOptions} from '../src/postgres-tls.js';
test('local fixture remains unchanged',()=>assert.deepEqual(postgresTlsOptions('postgres://a:b@postgres/db',{}),{}));
test('required TLS fails closed without configuration',()=>assert.throws(()=>postgresTlsOptions('postgres://a:b@postgres/db',{HIPASS_POSTGRES_TLS_REQUIRED:'1'}),/CONFIGURATION_REQUIRED/));
test('URL cannot disable certificate verification',()=>assert.throws(()=>postgresTlsOptions('postgres://a:b@postgres/db?sslmode=no-verify',{HIPASS_POSTGRES_TLS_REQUIRED:'1',HIPASS_POSTGRES_TLS_CA_FILE:'unused',HIPASS_POSTGRES_TLS_SERVERNAME:'db.invalid'}),/OVERRIDE_FORBIDDEN/));
