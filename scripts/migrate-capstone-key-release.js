// Explicit additive migration for the isolated capstone legacy transport only.
import { readFileSync } from "node:fs";
import pg from "pg";
let client;
try {
  const password = readFileSync(process.env.CAPSTONE_APP_PASSWORD_FILE, "utf8").trim();
  if (password.length < 32 || password.length > 256 || /[\r\n\0]/u.test(password)) throw new Error("INVALID_SECRET");
  client = new pg.Client({ host: "postgres", port: 5432, database: "hipass", user: "hipass_app", password,
    connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000, options: "-c lock_timeout=3000" });
  client.on("error", () => {});
  await client.connect();
  const role = await client.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = current_user");
  if (!role.rows.length || Object.values(role.rows[0]).some(Boolean)) throw new Error("APP_ROLE_REQUIRED");
  await client.query(readFileSync(new URL("../db/migrations/030_capstone_key_release_ledger.sql", import.meta.url), "utf8"));
  console.log("CAPSTONE_KEY_RELEASE_MIGRATION=PASS");
} catch {
  console.error("CAPSTONE_KEY_RELEASE_MIGRATION=FAIL");
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
