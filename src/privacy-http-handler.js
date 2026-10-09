import { AuthError, authenticateRequest, requireInternalServiceScope } from "./auth.js";
import { PrivacyProcessingError } from "./privacy-contracts.js";
import { PrivacyRequestBudget, readPrivacyJson } from "./privacy-request-budget.js";
import { sendJson } from "./http-utils.js";

export function createPrivacyHttpHandler({ service, env = process.env, timeoutMs = 30000 }) {
  new PrivacyRequestBudget(timeoutMs).dispose();
  return async function handlePrivacy(request, response, url) {
    const budget = new PrivacyRequestBudget(timeoutMs);
    const disconnect = () => { if (!response.writableFinished) budget.abort(); };
    request.once("aborted", disconnect);
    response.once("close", disconnect);
    try {
      await budget.run(async () => {
        let principal;
        try {
          principal = authenticateRequest(request, env);
          requireInternalServiceScope(principal, "privacy:inspect");
        } catch (error) {
          if (error instanceof AuthError) throw new PrivacyProcessingError(error.statusCode === 401 ? 401 : 403, "AUTH_REQUIRED");
          throw error;
        }
        if (request.method === "GET" && url.pathname === "/internal/privacy/health/ready") {
          const ready = await service.readiness({ budget });
          budget.check();
          sendJson(response, ready.status === "READY" ? 200 : 503, ready);
          return;
        }
        if (request.method === "POST" && url.pathname === "/internal/privacy/text-inspections") {
          if (String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
            throw new PrivacyProcessingError(415, "UNSUPPORTED_MEDIA_TYPE");
          }
          const body = await readPrivacyJson(request, budget.signal);
          const result = await service.inspect(body, principal, { budget });
          budget.check();
          sendJson(response, 200, result);
          return;
        }
        sendJson(response, 404, { error: "RESOURCE_NOT_FOUND" });
      });
    } catch (error) {
      if (!response.destroyed && !response.headersSent) {
        response.setHeader("connection", "close");
        response.once("finish", () => { if (!request.complete) request.destroy(); });
        // Never disclose unexpected adapter errors or original request content.
        sendJson(response, error instanceof PrivacyProcessingError ? error.statusCode : 500,
          { error: error instanceof PrivacyProcessingError ? error.code : "PRIVACY_INTERNAL_ERROR" });
      }
    } finally {
      budget.dispose();
      request.removeListener("aborted", disconnect);
      response.removeListener("close", disconnect);
    }
  };
}
