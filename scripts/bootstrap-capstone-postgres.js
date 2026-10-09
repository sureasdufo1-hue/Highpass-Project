// One-time role bootstrap; no credentials/query text/errors are printed.
import { readFileSync } from "node:fs";
import pg from "pg";
const password = name => {
  const value = readFileSync(process.env[name], "utf8").trim();
  if (value.length < 32 || value.length > 256 || /[\r\n\0]/u.test(value)) throw new Error("BOOTSTRAP_SECRET_INVALID");
  return value;
};
let admin, app;
try {
  const options = { host: "postgres", port: 5432, database: "hipass", connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 };
  const appPassword = password("CAPSTONE_APP_PASSWORD_FILE");
  admin = new pg.Client({ ...options, user: "hipass_bootstrap", password: password("CAPSTONE_ADMIN_PASSWORD_FILE") });
  await admin.connect();
  const role = await admin.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = $1", ["hipass_app"]);
  if (!role.rows.length) {
    const ddl = await admin.query("SELECT format('CREATE ROLE hipass_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', $1::text) AS statement", [appPassword]);
    await admin.query(ddl.rows[0].statement);
  } else if (Object.values(role.rows[0]).some(Boolean)) throw new Error("EXISTING_PRIVILEGED_ROLE_PRESERVED");
  await admin.query("REVOKE ALL ON DATABASE hipass FROM PUBLIC");
  await admin.query("GRANT CONNECT ON DATABASE hipass TO hipass_app");
  await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await admin.query("GRANT USAGE, CREATE ON SCHEMA public TO hipass_app");
  app = new pg.Client({ ...options, user: "hipass_app", password: appPassword });
  await app.connect();
  const check = await app.query("SELECT current_user AS actor, rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = current_user");
  if (check.rows[0]?.actor !== "hipass_app" || ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication"].some(name => check.rows[0][name])) throw new Error("APP_ROLE_VERIFICATION_FAILED");
  console.log("CAPSTONE_DB_ROLE=PASS NON_SUPERUSER");
} catch {
  console.error("CAPSTONE_DB_BOOTSTRAP=FAIL");
  process.exitCode = 1;
} finally {
  await app?.end().catch(() => {});
  await admin?.end().catch(() => {});
}
