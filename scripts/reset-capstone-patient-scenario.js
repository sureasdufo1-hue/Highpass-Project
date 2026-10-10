import { readFileSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { retireCapstonePatients } from './lib/retire-capstone-patients.js';

let client;
try {
  if (process.argv.slice(2).some(arg => arg !== '--apply') || process.env.HIPASS_CONTROL_PLANE_ONLY !== '1' || process.env.AUTH_MODE !== 'TEST') throw new Error('SCENARIO_RESET_INVALID_PROFILE');
  if (process.argv.includes('--apply') && !path.isAbsolute(process.env.CAPSTONE_SCENARIO_BACKUP_DIR ?? '')) throw new Error('SCENARIO_RESET_DURABLE_BACKUP_DIRECTORY_REQUIRED');
  const password = readFileSync(process.env.CAPSTONE_ADMIN_PASSWORD_FILE, 'utf8').trim();
  if (password.length < 32 || /[\r\n\0]/.test(password)) throw new Error('SCENARIO_RESET_INVALID_SECRET');
  client = new pg.Client({ host: 'postgres', port: 5432, database: 'hipass', user: 'hipass_bootstrap', password,
    connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
  client.on('error', () => {}); await client.connect();
  const result = await retireCapstonePatients(client, { apply: process.argv.includes('--apply'), backup: async snapshot => {
    // Generated operator artifact; contains selected statuses, never tokens or nonces.
    const directory = process.env.CAPSTONE_SCENARIO_BACKUP_DIR; await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `legacy-patients-${randomUUID()}.json`);
    const contents = JSON.stringify(snapshot, null, 2) + '\n';
    await writeFile(file, contents, { flag: 'wx', mode: 0o600 });
    const bytes = await readFile(file);
    if (bytes.toString() !== contents) throw new Error('SCENARIO_RESET_BACKUP_WRITE_FAILED');
    return { sha256: createHash('sha256').update(bytes).digest('hex') };
  } });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(/^SCENARIO_RESET_[A-Z_]+$/.test(error.message) ? error.message : 'SCENARIO_RESET_FAIL'); process.exitCode = 1;
} finally { await client?.end().catch(() => {}); }
