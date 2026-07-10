import { JsonStore } from "./store.js";
import { PostgresStore } from "./postgres-store.js";

export function createStoreFromEnv() {
  const storeType = process.env.HIPASS_STORE ?? "json";
  if (storeType === "postgres") return new PostgresStore(process.env.DATABASE_URL);
  if (storeType === "json") return new JsonStore(process.env.HIPASS_DB_PATH);
  throw new Error(`Unsupported HIPASS_STORE value: ${storeType}`);
}
