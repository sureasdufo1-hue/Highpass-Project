import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { evaluatePnpmRuntime, probePnpmRuntime, resolveExecutionTarget } from "../src/pnpm-runtime.js";

const valid = Object.freeze({
  packageManager: "pnpm@11.7.0",
  lockfileVersion: "9.0",
  commandPath: "C:\\tools\\pnpm.cmd",
  commandExists: true,
  actualVersion: "11.7.0",
  executionStatus: 0,
});

test("pnpm gate trusts the executed version and treats a different global manifest as evidence", () => {
  const result = evaluatePnpmRuntime({ ...valid, globalManifestVersion: "11.22.0" });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.warnings, ["GLOBAL_MANIFEST_DIFFERS_FROM_EXECUTED_VERSION"]);
});

test("pnpm gate blocks a missing or invalid executable path", () => {
  assert.equal(evaluatePnpmRuntime({ ...valid, commandExists: false }).status, "ENVIRONMENT_BLOCKED");
  const result = probePnpmRuntime({ commandPath: "Z:\\missing\\pnpm.cmd" });
  assert.equal(result.status, "ENVIRONMENT_BLOCKED");
  assert.equal(result.reason, "PNPM_EXECUTABLE_UNAVAILABLE");
});

test("pnpm gate rejects executed-version and lockfile mismatches", () => {
  assert.equal(evaluatePnpmRuntime({ ...valid, actualVersion: "11.22.0" }).reason, "PNPM_VERSION_MISMATCH");
  assert.equal(evaluatePnpmRuntime({ ...valid, lockfileVersion: "6.0" }).reason, "LOCKFILE_VERSION_INCOMPATIBLE");
  assert.equal(evaluatePnpmRuntime({ ...valid, packageManager: "npm@11.7.0" }).reason, "PACKAGE_MANAGER_PIN_INVALID");
});

test("pnpm gate resolves both npm-global and pnpm-managed Windows shims", () => {
  const globalShim = "C:\\Users\\tester\\AppData\\Roaming\\npm\\pnpm.cmd";
  const globalTarget = path.resolve(path.dirname(globalShim), "node_modules", "pnpm", "bin", "pnpm.mjs");
  assert.equal(resolveExecutionTarget(globalShim, { platform: "win32", exists: (candidate) => candidate === globalTarget }), globalTarget);

  const managedShim = "C:\\store\\links\\@\\pnpm\\11.7.0\\hash\\bin\\pnpm.cmd";
  const managedTarget = path.resolve(path.dirname(managedShim), "..", "node_modules", "pnpm", "bin", "pnpm.mjs");
  assert.equal(resolveExecutionTarget(managedShim, { platform: "win32", exists: (candidate) => candidate === managedTarget }), managedTarget);
});
