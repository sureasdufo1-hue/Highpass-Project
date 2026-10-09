import { PrivacyProcessingError } from "./privacy-contracts.js";

export class PrivacyRequestBudget {
  constructor(timeoutMs = 30000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error("INVALID_PRIVACY_REQUEST_TIMEOUT");
    this.deadline = performance.now() + timeoutMs;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.timer = setTimeout(() => this.abort(), timeoutMs);
  }

  abort() { this.controller.abort(); }
  check() {
    if (this.signal.aborted || performance.now() >= this.deadline) {
      this.abort();
      throw timeout();
    }
  }

  async run(operation) {
    this.check();
    let onAbort;
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(timeout());
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(() => { this.check(); return operation(); }), cancelled]);
      this.check();
      return result;
    } finally {
      this.signal.removeEventListener("abort", onAbort);
    }
  }

  dispose() { clearTimeout(this.timer); }
}

function timeout() { return new PrivacyProcessingError(504, "MODEL_TIMEOUT"); }

// Privacy-only bounded body reader. Abort removes listeners and pauses input;
// the HTTP wrapper closes the connection after sending its typed error.
export function readPrivacyJson(request, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const cleanup = () => {
      request.removeListener("data", data);
      request.removeListener("end", end);
      request.removeListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const fail = (error) => { cleanup(); request.pause(); reject(error); };
    const aborted = () => fail(timeout());
    const failed = () => fail(new PrivacyProcessingError(422, "INVALID_CONTENT"));
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > 40 * 1024) return fail(new PrivacyProcessingError(413, "INPUT_TOO_LARGE"));
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        resolve(text.length ? JSON.parse(text) : {});
      } catch { reject(new PrivacyProcessingError(422, "INVALID_CONTENT")); }
    };
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    request.on("data", data);
    request.once("end", end);
    request.once("error", failed);
  });
}
