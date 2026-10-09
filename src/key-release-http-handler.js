import { requireInternalServiceScope } from "./auth.js";
import { readJson, sendJson } from "./http-utils.js";
import { ConsentBoundKeyRelease } from "./consent-bound-key-release.js";

export const keyReleasePaths = Object.freeze(["/gateway/data-plane/package/prepare", "/gateway/data-plane/package/authorize", "/gateway/data-plane/package/wrap-authorize"]);

export function createKeyReleaseHttpHandler(options) {
  const policy = new ConsentBoundKeyRelease(options);
  return async (request, response, url, principal) => {
    if (!keyReleasePaths.includes(url.pathname)) return false;
    response.setHeader("cache-control", "no-store");
    const preparing = url.pathname.endsWith("/prepare");
    const wrapping = url.pathname.endsWith("/wrap-authorize");
    requireInternalServiceScope(principal, preparing || wrapping ? "gateway:data-plane-authorize" : "gateway:package-key-release");
    if (request.method !== "POST" || url.search) {
      request.resume(); sendJson(response, 400, { error: "KEY_RELEASE_REQUEST_INVALID" }); return true;
    }
    const body = await readJson(request, { maxBytes: 32768, strictUtf8: true });
    const expected = preparing ? ["receipt", "packageBinding"] : wrapping ? ["receipt", "packageId", "keyId"] : ["receipt", "packageBinding", "releaseId", "phase"];
    if (!body || Object.keys(body).sort().join() !== expected.sort().join()) {
      sendJson(response, 400, { error: "KEY_RELEASE_REQUEST_INVALID" }); return true;
    }
    try {
      const result = wrapping ? { authorized: await policy.authorizeWrap(body) } : preparing ? await policy.prepare(body)
        : { authorized: await policy.authorize({ ...body, authenticatedHospitalId: principal.hospitalId }) };
      sendJson(response, 200, result);
    } catch (error) {
      // Never expose provider/DB diagnostics, receipt, token or key material.
      const denied = /^KEY_RELEASE_(?:BINDING_INVALID|POLICY_DENIED|INSTANCE_REQUIRED|PRINCIPAL_INVALID|BINDING_INACTIVE|ALREADY_CONSUMED)$/u.test(error.message ?? "");
      sendJson(response, denied ? 403 : 503, { error: denied ? "KEY_RELEASE_DENIED" : "KEY_RELEASE_UNAVAILABLE" });
    }
    return true;
  };
}
