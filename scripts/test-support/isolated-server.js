import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function startIsolatedServer(t) {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const dir = await mkdtemp(path.join(tmpdir(), "highpass-http-test-"));
  const child = spawn(process.execPath, ["src/server.js"], {
    windowsHide: true, stdio: "pipe",
    env: { ...process.env, PORT: String(port), HIPASS_DB_PATH: path.join(dir, "db.json"), HIPASS_STORE: "json", NODE_ENV: "development", AUTH_MODE: "DEVELOPMENT_MOCK", DICOM_TOKEN_SECRET: randomBytes(32).toString("hex"), HIPASS_ENABLE_CURATED_DICOM: "0" },
  });
  child.stdout.resume();
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode === null) {
      const ended = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await ended;
    }
    await rm(dir, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (child.exitCode !== null) throw new Error("Isolated HTTP test server exited before readiness");
    try {
      if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) return baseUrl;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Isolated HTTP test server readiness timed out");
}

export function boundedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
}
