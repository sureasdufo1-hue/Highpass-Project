process.env.HIPASS_STORE ??= "postgres";

if (!process.env.DATABASE_URL) {
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.POSTGRES_DB;

  if (!user || !password || !database) {
    throw new Error("DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are required");
  }

  process.env.DATABASE_URL = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

await import("../src/server.js");
