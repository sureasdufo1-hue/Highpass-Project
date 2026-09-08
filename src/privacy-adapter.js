import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  PrivacyErrorCode,
  PrivacyProcessingError,
} from "./privacy-contracts.js";

const DEFAULT_BRIDGE = path.join(process.cwd(), "services", "privacy-inference", "opf_bridge.py");
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BRIDGE_OUTPUT_BYTES = 4 * 1024 * 1024;

export class OpfLocalAdapter {
  constructor(options = {}) {
    this.checkpointPath = options.checkpointPath ?? process.env.HIPASS_PRIVACY_MODEL_PATH ?? null;
    this.bridgePath = options.bridgePath ?? DEFAULT_BRIDGE;
    this.pythonCommand = options.pythonCommand ?? process.env.HIPASS_PRIVACY_PYTHON ?? "python";
    this.device = options.device ?? process.env.HIPASS_PRIVACY_DEVICE ?? "cpu";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxConcurrency = options.maxConcurrency ?? 1;
    this.maxQueue = options.maxQueue ?? 8;
    this.active = 0;
    this.queue = [];
  }

  async readiness() {
    if (!this.checkpointPath) return unavailable("EXPLICIT_CHECKPOINT_REQUIRED");
    try {
      await Promise.all([
        access(this.bridgePath),
        access(path.join(this.checkpointPath, "config.json")),
      ]);
      const result = await this.#run(["--ready"], "");
      return result.ready === true
        ? { ready: true, modelRevision: result.model_revision, runtimeRevision: result.runtime_revision }
        : unavailable("MODEL_INITIALIZATION_FAILED");
    } catch (error) {
      if (error instanceof PrivacyProcessingError) return unavailable(error.code);
      return unavailable("MODEL_FILES_UNAVAILABLE");
    }
  }

  countTokens(text) {
    return this.#enqueue(async () => {
      this.#requireExplicitCheckpoint();
      const result = await this.#run(["--count-tokens"], text);
      if (!Number.isInteger(result.token_count) || result.token_count < 0) {
        throw processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID);
      }
      return result.token_count;
    });
  }

  detect(text) {
    return this.#enqueue(async () => {
      const startedAt = performance.now();
      this.#requireExplicitCheckpoint();
      const result = await this.#run([], text);
      if (!Array.isArray(result.detected_spans)) {
        throw processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID);
      }
      const findings = result.detected_spans.map((span) => {
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || typeof span.text !== "string" || typeof span.label !== "string") {
          throw processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID);
        }
        return {
          start: span.start,
          end: span.end,
          text: span.text,
          nativeLabel: span.label,
          score: null,
          offsetUnit: "unicode_codepoint",
          endExclusive: true,
        };
      });
      return {
        findings,
        modelRevision: result.model_revision,
        runtimeRevision: result.runtime_revision,
        durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        warning: result.warning ?? null,
      };
    });
  }

  #requireExplicitCheckpoint() {
    if (!this.checkpointPath) throw processingError(503, PrivacyErrorCode.MODEL_UNAVAILABLE);
  }

  #enqueue(operation) {
    if (this.active < this.maxConcurrency) return this.#start(operation);
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(processingError(429, PrivacyErrorCode.QUEUE_FULL));
    }
    return new Promise((resolve, reject) => this.queue.push({ operation, resolve, reject }));
  }

  async #start(operation) {
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) this.#start(next.operation).then(next.resolve, next.reject);
    }
  }

  #run(extraArguments, input) {
    const checkpoint = path.resolve(this.checkpointPath);
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand, [
        this.bridgePath,
        "--checkpoint", checkpoint,
        "--device", this.device,
        ...extraArguments,
      ], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
        env: {
          ...process.env,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          DO_NOT_TRACK: "1",
          PYTHONUNBUFFERED: "1",
        },
      });
      const chunks = [];
      let total = 0;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(processingError(504, PrivacyErrorCode.MODEL_TIMEOUT));
      }, this.timeoutMs);

      child.stdout.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_BRIDGE_OUTPUT_BYTES) {
          child.kill();
          return;
        }
        chunks.push(chunk);
      });
      child.once("error", () => finishReject(processingError(503, PrivacyErrorCode.MODEL_UNAVAILABLE)));
      child.once("close", (code) => {
        if (settled) return;
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          finishReject(processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID));
          return;
        }
        if (code !== 0 || payload.ok !== true) {
          const mapped = bridgeError(payload.code);
          finishReject(mapped);
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(payload);
      });
      child.stdin.end(Buffer.from(String(input), "utf8"));

      function finishReject(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  }
}

function bridgeError(code) {
  if (code === PrivacyErrorCode.INVALID_CONTENT) return processingError(422, code);
  if (code === PrivacyErrorCode.INPUT_TOO_LARGE) return processingError(413, code);
  if (code === PrivacyErrorCode.MODEL_TIMEOUT) return processingError(504, code);
  if (code === PrivacyErrorCode.MODEL_OUTPUT_INVALID) return processingError(502, code);
  return processingError(503, PrivacyErrorCode.MODEL_UNAVAILABLE);
}

function processingError(statusCode, code) {
  return new PrivacyProcessingError(statusCode, code, code);
}

function unavailable(reason) {
  return { ready: false, code: PrivacyErrorCode.MODEL_UNAVAILABLE, reason };
}
