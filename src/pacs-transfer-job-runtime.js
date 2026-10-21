import pg from "pg";
import { postgresTlsOptions } from './postgres-tls.js';
import {readFileSync} from 'node:fs';
import { PostgresPacsTransferJobRepository } from "./pacs-transfer-jobs.js";
import { createPacsTransferJobHttpHandler } from "./pacs-transfer-job-http.js";

const REQUIRED_PRIVILEGES = ["SELECT", "INSERT", "UPDATE"];
const FORBIDDEN_PRIVILEGES = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

export async function createPacsTransferJobRuntime({ env = process.env, service, readJson, Pool = pg.Pool }) {
  if (env.HIPASS_CAPSTONE_PACS_TRANSFER_JOBS !== "1") return null;
  const databaseUrl=env.HIPASS_PACS_TRANSFER_DATABASE_URL_FILE
    ? readFileSync(env.HIPASS_PACS_TRANSFER_DATABASE_URL_FILE,'utf8').trim() : env.HIPASS_PACS_TRANSFER_DATABASE_URL;
  if (env.HIPASS_CONTROL_PLANE_ONLY !== "1" || env.HIPASS_STORE !== "postgres"
      || typeof databaseUrl !== "string" || !databaseUrl) {
    throw new Error("PACS_TRANSFER_JOB_PROFILE_REQUIRED");
  }

  const pool = new Pool({ connectionString: databaseUrl, ...postgresTlsOptions(databaseUrl,env), max: 4,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, statement_timeout: 5000,
    query_timeout: 6000, options: "-c search_path=public -c lock_timeout=3000" });
  pool.on("error", () => console.warn("PACS_TRANSFER_JOB_DATABASE_UNAVAILABLE"));
  try {
    const role = await pool.query(`SELECT r.rolsuper, r.rolbypassrls,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolbypassrls || role.rows[0].can_create_schema) {
      throw new Error("PACS_TRANSFER_JOB_ROLE_UNSAFE");
    }
    const schema = await pool.query(`SELECT to_regclass('public.capstone_pacs_transfer_jobs') IS NOT NULL AS jobs,
      to_regclass('public.capstone_pacs_transfer_items') IS NOT NULL AS items`);
    if (schema.rows[0]?.jobs !== true || schema.rows[0]?.items !== true) throw new Error("PACS_TRANSFER_JOB_MIGRATION_REQUIRED");

    const checks = [];
    for (const table of ["capstone_pacs_transfer_jobs", "capstone_pacs_transfer_items"]) {
      for (const privilege of REQUIRED_PRIVILEGES) {
        checks.push(`has_table_privilege(current_user, 'public.${table}', '${privilege}') AS ${table}_${privilege.toLowerCase()}`);
      }
      for (const privilege of FORBIDDEN_PRIVILEGES) {
        checks.push(`has_table_privilege(current_user, 'public.${table}', '${privilege}') AS ${table}_${privilege.toLowerCase()}`);
      }
    }
    const privileges = (await pool.query(`SELECT ${checks.join(",\n")}`)).rows[0];
    for (const table of ["capstone_pacs_transfer_jobs", "capstone_pacs_transfer_items"]) {
      if (REQUIRED_PRIVILEGES.some(privilege => privileges[`${table}_${privilege.toLowerCase()}`] !== true)
          || FORBIDDEN_PRIVILEGES.some(privilege => privileges[`${table}_${privilege.toLowerCase()}`] !== false)) {
        throw new Error("PACS_TRANSFER_JOB_ROLE_PRIVILEGES_INVALID");
      }
    }
    const repository = new PostgresPacsTransferJobRepository(pool);
    return { repository, route: createPacsTransferJobHttpHandler({ repository, service, readJson }), close: () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
