// Test-only filesystem coordination carries phase labels, never credentials.
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export function outageDecision({ status, imageReturned, imageHidden, requested }) {
  return status === 503 && !imageReturned && imageHidden && requested ? "PASS" : "FAIL";
}

export async function runBrowserOutageGate(cdp, responses, directory) {
  const root = realpathSync(path.resolve("artifacts/workstation"));
  const resolved = realpathSync(directory);
  if (path.dirname(resolved) !== root || !/^browser-outage-[0-9T.+-]+$/.test(path.basename(resolved))) throw new Error("OUTAGE_COORDINATION_PATH_INVALID");
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const phase = label => writeFileSync(path.join(resolved, "browser-phase.json"), JSON.stringify({ phase: label }));
  const until = async (predicate, milliseconds) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) { if (predicate()) return; await delay(150); }
    throw new Error("OUTAGE_PHASE_DEADLINE");
  };
  const reload = () => cdp.send("Runtime.evaluate", { expression: "document.querySelector('#load-instances').click()", returnByValue: true });
  const imageState = async () => {
    const result = await cdp.send("Runtime.evaluate", { expression: "({imageHidden:document.querySelector('#viewer-image')?.hidden===true,imageDecoded:document.querySelector('#viewer-image')?.hidden===false&&document.querySelector('#viewer-image')?.naturalWidth>0&&document.querySelector('#viewer-image')?.src.startsWith('blob:')})", returnByValue: true });
    return result.result.value;
  };
  const checks = [];
  try {
    for (const name of ["B_VAULT_CONNECTION", "B_CONTROL_CONNECTION"]) {
      phase(name + "_READY");
      await until(() => existsSync(path.join(resolved, name + "_INJECTED")), 60000);
      const before = new Set(responses.keys());
      await reload();
      let failure;
      await until(() => {
        failure = [...responses].find(([id, value]) => !before.has(id) && value.url.endsWith("/rendered"));
        return Boolean(failure);
      }, 40000);
      await delay(500);
      const state = await imageState();
      const value = failure[1];
      checks.push({ test: name + "_FAIL_CLOSED", httpStatus: value.status,
                    imageReturned: value.mimeType.startsWith("image/"), imageHidden: state.imageHidden,
                    status: outageDecision({ status: value.status, imageReturned: value.mimeType.startsWith("image/"), imageHidden: state.imageHidden, requested: true }) });
      phase(name + "_RESTORE");
      await until(() => existsSync(path.join(resolved, name + "_RESTORED")), 60000);
      const denied = new Set(responses.keys());
      await reload();
      if (name === "B_CONTROL_CONNECTION") {
        // Authoritative-consent polling may deliberately clear local access on
        // a Control outage. Recovery must not resurrect that token automatically.
        await delay(1000);
        const policy = await cdp.send("Runtime.evaluate", { expression: "({tokenRequired:document.querySelector('#viewer-status')?.textContent==='토큰 필요',imageHidden:document.querySelector('#viewer-image')?.hidden===true})", returnByValue: true });
        if (policy.result.value?.tokenRequired && policy.result.value?.imageHidden) {
          checks.push({ test: name + "_RECOVERY_REQUIRES_FRESH_AUTHORIZATION", status: "PASS", staleAccessRestored: false,
                        fullRecoveryProof: "SEPARATE_FRESH_BROWSER_REQUIRED" });
          // Restore authoritative consent metadata before the existing verifier
          // attempts patient revocation. Do not issue or resurrect an access token.
          await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#refresh')?.click()", returnByValue: true });
          const syncEnd = Date.now() + 15000;
          let synced = false;
          while (Date.now() < syncEnd) {
            const consent = await cdp.send("Runtime.evaluate", { expression: "document.querySelector('#patient-status')?.textContent.includes('ACTIVE')===true&&!document.querySelector('#patient-revoke')?.disabled", returnByValue: true });
            if (consent.result.value) { synced = true; break; }
            await delay(200);
          }
          if (!synced) throw new Error("CONSENT_METADATA_RECOVERY_NOT_VERIFIED");
          continue;
        }
      }
      await until(() => [...responses].some(([id, value]) => !denied.has(id) && value.url.endsWith("/rendered") && value.status === 200 && value.mimeType.startsWith("image/")), 40000);
      await delay(500);
      const recovered = await imageState();
      checks.push({ test: name + "_RECOVERED_ENCRYPTED_VIEW", status: recovered.imageDecoded ? "PASS" : "FAIL" });
    }
    phase("COMPLETE");
  } catch {
    phase("ABORT_RESTORE");
    checks.push({ test: "OUTAGE_COORDINATION_OR_REQUEST", status: "NOT VERIFIED", reason: "FINITE_PHASE_FAILED" });
  }
  return { scope: "B_PORTAL_EGRESS_CONNECTION_FAULTS_NOT_GLOBAL_PROVIDER_OR_CLOUD_SHUTDOWN", checks,
           result: checks.length === 4 && checks.every(row => row.status === "PASS") ? "PASS" : "FAIL" };
}
