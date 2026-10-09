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
  #diagnostics = { spawned: 0, closed: 0, stdinFailures: 0, stdoutFailures: 0, spawnFailures: 0 };

  diagnostics() { return Object.freeze({ ...this.#diagnostics, active: this.active, queued: this.queue.length }); }
  constructor(options = {}) {
    this.checkpointPath = options.checkpointPath ?? process.env.HIPASS_PRIVACY_MODEL_PATH ?? null;
    this.bridgePath = options.bridgePath ?? DEFAULT_BRIDGE;
    this.pythonCommand = options.pythonCommand ?? process.env.HIPASS_PRIVACY_PYTHON ?? "python";
    this.device = options.device ?? process.env.HIPASS_PRIVACY_DEVICE ?? "cpu";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxConcurrency = options.maxConcurrency ?? 1;
    this.maxQueue = options.maxQueue ?? 8;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000
      || !Number.isInteger(this.maxConcurrency) || this.maxConcurrency < 1 || this.maxConcurrency > 4
      || !Number.isInteger(this.maxQueue) || this.maxQueue < 0 || this.maxQueue > 64) {
      throw new Error("INVALID_PRIVACY_ADAPTER_LIMITS");
    }
    this.active = 0;
    this.queue = [];
  }

  async readiness(options = {}) {
    if (!this.checkpointPath) return unavailable("EXPLICIT_CHECKPOINT_REQUIRED");
    try {
      await Promise.all([
        access(this.bridgePath),
        access(path.join(this.checkpointPath, "config.json")),
      ]);
      const result = await this.#enqueue((signal) => this.#run(["--ready"], "", signal), options);
      return result.ready === true
        ? { ready: true, modelRevision: result.model_revision, runtimeRevision: result.runtime_revision }
        : unavailable("MODEL_INITIALIZATION_FAILED");
    } catch (error) {
      if (error instanceof PrivacyProcessingError) return unavailable(error.code);
      return unavailable("MODEL_FILES_UNAVAILABLE");
    }
  }

  countTokens(text, options = {}) {
    return this.#enqueue(async (signal) => {
      this.#requireExplicitCheckpoint();
      const result = await this.#run(["--count-tokens"], text, signal);
      if (!Number.isInteger(result.token_count) || result.token_count < 0) {
        throw processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID);
      }
      return result.token_count;
    }, options);
  }

  detect(text, options = {}) {
    return this.#enqueue(async (signal) => {
      const startedAt = performance.now();
      this.#requireExplicitCheckpoint();
      const result = await this.#run([], text, signal);
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
    }, options);
  }

  #requireExplicitCheckpoint() {
    if (!this.checkpointPath) throw processingError(503, PrivacyErrorCode.MODEL_UNAVAILABLE);
  }

  async #enqueue(operation, options = {}) {
    const joined = linkedSignal(this.timeoutMs, options.signal);
    const signal = joined.signal;
    try {
    if (signal.aborted) return Promise.reject(processingError(504, PrivacyErrorCode.MODEL_TIMEOUT));
    if (this.active < this.maxConcurrency) return await this.#start(operation, signal);
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(processingError(429, PrivacyErrorCode.QUEUE_FULL));
    }
    return await new Promise((resolve, reject) => {
      const entry = { operation, signal, resolve, reject, cleanup: () => signal.removeEventListener("abort", cancelled) };
      const cancelled = () => {
        const index = this.queue.indexOf(entry);
        if (index !== -1) this.queue.splice(index, 1);
        entry.cleanup();
        reject(processingError(504, PrivacyErrorCode.MODEL_TIMEOUT));
      };
      signal.addEventListener("abort", cancelled, { once: true });
      this.queue.push(entry);
    });
    } finally { joined.dispose(); }
  }

  #start(operation, signal) {
    this.active += 1;
    const work = Promise.resolve().then(() => {
      if (signal.aborted) throw processingError(504, PrivacyErrorCode.MODEL_TIMEOUT);
      return operation(signal);
    }).finally(() => {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) { next.cleanup(); this.#start(next.operation, next.signal).then(next.resolve, next.reject); }
    });
    return abortable(work, signal);
  }

  #run(extraArguments, input, signal) {
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
      child.once("spawn", () => { this.#diagnostics.spawned++; });
      let total = 0;
      let settled = false;
      let failure = null;
      let killTimer;
      const stop = (error) => {
        if (settled || failure) return;
        failure = error;
        chunks.length = 0;
        child.stdin.destroy();
        child.kill();
        killTimer = setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, 1000);
        killTimer.unref();
      };
      const aborted = () => stop(processingError(504, PrivacyErrorCode.MODEL_TIMEOUT));
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();

      child.stdout.on("data", (chunk) => {
        if (failure) return;
        total += chunk.length;
        if (total > MAX_BRIDGE_OUTPUT_BYTES) {
          stop(processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID));
          return;
        }
        chunks.push(chunk);
      });
      child.once("error", () => { this.#diagnostics.spawnFailures++; stop(processingError(503, PrivacyErrorCode.MODEL_UNAVAILABLE)); });
      child.stdout.on("error", () => { this.#diagnostics.stdoutFailures++; stop(processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID)); });
      child.stdin.on("error", () => { this.#diagnostics.stdinFailures++; stop(processingError(502, PrivacyErrorCode.MODEL_OUTPUT_INVALID)); });
      child.once("close", (code) => {
        this.#diagnostics.closed++;
        if (settled) return;
        // Hold active capacity until the owned child is actually closed.
        if (failure) { finishReject(failure); return; }
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
        cleanup();
        resolve(payload);
      });
      child.stdin.end(Buffer.from(String(input), "utf8"));

      function finishReject(error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
      function cleanup() {
        clearTimeout(killTimer);
        signal.removeEventListener("abort", aborted);
      }
    });
  }
}

// Avoid AbortSignal.any (not present in the earliest supported Node 20 releases).
function linkedSignal(timeoutMs, parent) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (parent) {
    parent.addEventListener("abort", abort, { once: true });
    if (parent.aborted) abort();
  }
  return { signal: controller.signal, dispose: () => {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  } };
}

async function abortable(work, signal) {
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(processingError(504, PrivacyErrorCode.MODEL_TIMEOUT));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
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
