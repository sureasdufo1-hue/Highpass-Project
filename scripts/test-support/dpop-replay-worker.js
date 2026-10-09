import { randomBytes } from "node:crypto";
import { HipassService } from "../../src/services.js";
import { PostgresDPoPReplayStore } from "../../src/dpop-replay-store.js";
import { createSeedData } from "../../src/seed.js";

if (!process.send || !/^hp-validation-[a-z0-9-]+$/.test(process.env.HIPASS_COMPOSE_PROJECT ?? "")) throw new Error("Synthetic IPC worker required");
const data = createSeedData();
const replay = new PostgresDPoPReplayStore(process.env.DATABASE_URL);
// Each worker has independent synthetic audit state; this is not a full API HA test.
const store = { get: name => data[name], save: async () => {} };
const service = new HipassService(store, undefined, { tokenSecret: randomBytes(32).toString("hex"), dpopReplayStore: replay });
process.on("message", async message => {
  if (message.type === "stop") { await replay.close(); process.exit(0); }
  try {
    const result = await service.verifyDPoPProof(message.proof, { method: "POST", url: message.url, requireAbsoluteUrl: true });
    process.send({ id: message.id, valid: result.valid, reason: result.reason ?? null, statusCode: result.statusCode ?? null });
  } catch { process.send({ id: message.id, valid: false, reason: "WORKER_FAILURE", statusCode: 503 }); }
});
process.send({ ready: true });
