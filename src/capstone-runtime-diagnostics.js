import { randomUUID } from "node:crypto";

const stages = new Set(["REQUEST", "CONTROL_AUTHORIZATION", "ORTHANC_READ", "IMAGE_ENCRYPTION", "CONTROL_READY", "UPSTREAM_METADATA", "UPSTREAM_IMAGE", "IMAGE_DECRYPTION", "STATIC"]);
const codes = new Set(["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UPSTREAM_ABORTED", "RESPONSE_LIMIT", "KV_TIMEOUT", "KV_AUTH_DENIED", "KV_RATE_LIMITED", "KV_KEY_NOT_FOUND", "KV_DNS_FAILURE", "KV_CONNECTION_REFUSED", "KV_TLS_FAILED", "KV_CONNECTION_FAILED", "KV_OPERATION_FAILED", "KV_AUTHORIZATION_DENIED", "ENCRYPTED_TRANSFER_POLICY_DENIED", "ENCRYPTED_TRANSFER_EXPIRED", "ENCRYPTED_TRANSFER_REQUIRED", "ENCRYPTED_TRANSFER_INVALID", "ENCRYPTED_TRANSFER_SCOPE_MISMATCH", "ENCRYPTED_TRANSFER_INTEGRITY_FAILED"]);
const noop = Object.freeze({stage(){},finish(){}});

// Opt-in technical test metrics only. No arbitrary exception text, request
// values, token/proof/key bytes, URLs, identities or certificate paths.
export function createRuntimeDiagnosticFactory(env, write = record => console.error(JSON.stringify(record))) {
  if (env.CAPSTONE_RUNTIME_DIAGNOSTICS !== "1") return () => noop;
  return () => {
    const began=performance.now(), traceId=randomUUID();
    let stage="REQUEST", completed=false;
    return {
      stage(value) { stage=stages.has(value)?value:"REQUEST"; },
      finish(status,error) {
        if(completed) return;
        completed=true;
        const rawCode=error?.code ?? error?.message;
        const code=codes.has(rawCode)?rawCode:error?.name==="SyntaxError"?"RESPONSE_INVALID":error?"UNCLASSIFIED_FAILURE":"NONE";
        const event={event:"CAPSTONE_RUNTIME_DIAGNOSTIC",traceId,stage,httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:503,code,elapsedMs:Math.max(0,Math.round(performance.now()-began))};
        try { write(event); } catch { /* diagnostics never change authorization */ }
      }
    };
  };
}

export function beginRuntimeDiagnostic(factory) {
  try { const value=factory?.(); return value && typeof value.stage==="function" && typeof value.finish==="function" ? value : noop; }
  catch { return noop; }
}
