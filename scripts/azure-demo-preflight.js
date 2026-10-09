#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

export function azureInvocation(args, { platform = process.platform, exists = existsSync } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) throw new Error("AZURE_READ_ARGUMENTS_INVALID");
  if (platform !== "win32") return { command: "az", args: [...args] };
  // Match the installed Microsoft's az.cmd (-IBm azure.cli), but invoke its
  // bundled Python directly. cmd.exe interprets URL ampersands/percent escapes.
  const python = [
    "C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe",
    "C:/Program Files (x86)/Microsoft SDKs/Azure/CLI2/python.exe",
  ].find((candidate) => exists(candidate));
  if (!python) throw new Error("AZURE_CLI_RUNTIME_UNAVAILABLE");
  return { command: python, args: ["-IBm", "azure.cli", ...args] };
}

// Read-only Azure control-plane checks. Never acquire/print bearer tokens,
// register providers, create resources, or change the default subscription.
export async function azureDemoPreflight({ env = process.env, run = runAzureJson } = {}) {
  const checks = [];
  const record = (name, status, reason) => checks.push({ name, status, reason });
  try {
    const version = await run(["version", "--output", "json"]);
    if (typeof version?.["azure-cli"] !== "string") throw new Error();
    record("azure-cli", "PASS", "CLI_AVAILABLE");
  } catch {
    record("azure-cli", "ENVIRONMENT BLOCKED", "CLI_UNAVAILABLE_OR_UNRUNNABLE");
  }
  const subscription = env.HIPASS_AZURE_SUBSCRIPTION_ID;
  const validSubscription = typeof subscription === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(subscription);
  record("explicit-subscription", validSubscription ? "PASS" : "NOT VERIFIED", validSubscription ? "TARGET_CONFIGURED" : "SUBSCRIPTION_UUID_REQUIRED");
  const budget = Number(env.HIPASS_AZURE_BUDGET_USD);
  record("declared-budget", Number.isFinite(budget) && budget > 0 && budget <= 100 ? "PASS" : "NOT VERIFIED", Number.isFinite(budget) && budget > 0 && budget <= 100 ? "DECLARED_LIMIT_ONLY_NOT_SPENDING_ENFORCEMENT" : "POSITIVE_LIMIT_AT_MOST_100_REQUIRED");
  if (validSubscription && checks[0].status === "PASS") {
    try {
      const account = await run(["account", "show", "--subscription", subscription, "--output", "json"]);
      if (account?.id?.toLowerCase() !== subscription.toLowerCase()) {
        record("subscription-access", "FAIL", "SUBSCRIPTION_MISMATCH");
      } else if (account.state !== "Enabled") {
        record("subscription-access", "FAIL", "SUBSCRIPTION_NOT_ENABLED");
      } else {
        record("subscription-access", "PASS", "EXACT_SUBSCRIPTION_ENABLED");
        for (const namespace of ["Microsoft.Compute", "Microsoft.Network", "Microsoft.KeyVault"]) {
          try {
            const provider = await run(["provider", "show", "--namespace", namespace, "--subscription", subscription, "--query", "{namespace:namespace,registrationState:registrationState}", "--output", "json"]);
            record(namespace, provider?.namespace === namespace && provider?.registrationState === "Registered" ? "PASS" : "NOT VERIFIED", provider?.namespace === namespace && provider?.registrationState === "Registered" ? "PROVIDER_REGISTERED" : "PROVIDER_NOT_REGISTERED_OR_INVALID");
          } catch {
            record(namespace, "ENVIRONMENT BLOCKED", "PROVIDER_READ_FAILED");
          }
        }
      }
    } catch {
      record("subscription-access", "ENVIRONMENT BLOCKED", "ACCOUNT_READ_FAILED_SIGN_IN_OR_NETWORK_REQUIRED");
    }
  } else {
    record("subscription-access", "NOT VERIFIED", "PREREQUISITES_MISSING");
  }
  for (const name of ["student-credit-balance", "regional-vm-quota", "cost-estimate-and-alerts", "keyvault-wrap-unwrap", "vm-a-b-connectivity", "cloud-viewer-e2e"]) {
    record(name, "NOT VERIFIED", "SEPARATE_LIVE_VALIDATION_REQUIRED");
  }
  return {
    scope: "CAPSTONE AZURE READ-ONLY PREFLIGHT ONLY",
    reviewStatus: "DRAFT / UNASSIGNED",
    status: checks.some((item) => item.status === "FAIL") ? "FAIL" : checks.some((item) => item.status === "ENVIRONMENT BLOCKED") ? "ENVIRONMENT BLOCKED" : "NOT VERIFIED",
    checks,
    // Even a successful account/provider query is not a deployment or crypto test.
    deploymentVerified: false,
  };
}

export function runAzureJson(args, { timeoutMs = 15000, maxOutputBytes = 128 * 1024 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 1024 * 1024) {
    return Promise.reject(new Error("AZURE_READ_LIMITS_INVALID"));
  }
  return new Promise((resolve, reject) => {
    // Use the installed runtime without any command shell or interpolation.
    const windows = process.platform === "win32";
    const invocation = azureInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      windowsHide: true,
      env: { ...process.env, AZ_INSTALLER: "MSI", AZURE_CORE_COLLECT_TELEMETRY: "false", AZURE_EXTENSION_USE_DYNAMIC_INSTALL: "no" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let bytes = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(new Error("AZURE_READ_FAILED")); else resolve(value);
    };
    const stop = () => {
      if (settled) return;
      if (windows && child.pid) {
        // Kill only this owned CLI process tree, never a shared Azure session.
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => {});
      } else child.kill("SIGKILL");
      finish(true);
    };
    const timer = setTimeout(stop, timeoutMs);
    for (const [stream, capture] of [[child.stdout, true], [child.stderr, false]]) {
      stream.on("data", (chunk) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > maxOutputBytes) { stop(); return; }
        if (capture) output += chunk.toString("utf8");
      });
    }
    child.on("error", () => finish(true));
    child.on("close", (code) => {
      if (code !== 0) { finish(true); return; }
      try { finish(false, JSON.parse(output)); } catch { finish(true); }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await azureDemoPreflight();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "FAIL" ? 1 : 2;
}
