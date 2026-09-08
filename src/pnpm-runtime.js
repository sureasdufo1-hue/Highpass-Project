import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function probePnpmRuntime(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const runner = options.runner ?? spawnSync;
  const packageJson = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
  const lockfile = readFileSync(path.join(cwd, "pnpm-lock.yaml"), "utf8");
  const packageManager = String(packageJson.packageManager ?? "");
  const lockfileVersion = /^lockfileVersion:\s*['"]?([^'"\r\n]+)['"]?/mu.exec(lockfile)?.[1]?.trim() ?? null;
  const commandPath = options.commandPath ?? resolvePnpmCommand(env, runner, cwd);
  const globalManifestPath = env.APPDATA
    ? path.join(env.APPDATA, "npm", "node_modules", "pnpm", "package.json")
    : null;
  const globalManifestVersion = globalManifestPath && existsSync(globalManifestPath)
    ? JSON.parse(readFileSync(globalManifestPath, "utf8")).version
    : null;

  if (!commandPath || !existsSync(commandPath)) {
    return evaluatePnpmRuntime({ packageManager, lockfileVersion, commandPath, commandExists: false, globalManifestVersion });
  }

  const execution = runPnpm(commandPath, ["--version"], { env, cwd, runner });
  const executionTarget = resolveExecutionTarget(commandPath);
  return evaluatePnpmRuntime({
    packageManager,
    lockfileVersion,
    commandPath,
    executionTarget,
    commandExists: true,
    actualVersion: String(execution.stdout ?? "").trim(),
    executionStatus: execution.status,
    executionError: execution.error?.code ?? null,
    globalManifestVersion,
  });
}

export function evaluatePnpmRuntime(input) {
  const requestedMatch = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(input.packageManager ?? "");
  const evidence = {
    commandPath: input.commandPath ?? null,
    executionTarget: input.executionTarget ?? null,
    actualVersion: input.actualVersion ?? null,
    packageManager: input.packageManager ?? null,
    requestedVersion: requestedMatch?.[1] ?? null,
    lockfileVersion: input.lockfileVersion ?? null,
    globalManifestVersion: input.globalManifestVersion ?? null,
    warnings: [],
  };
  if (!input.commandExists || input.executionError === "ENOENT") {
    return { status: "ENVIRONMENT_BLOCKED", reason: "PNPM_EXECUTABLE_UNAVAILABLE", ...evidence };
  }
  if (input.executionStatus !== undefined && input.executionStatus !== 0) {
    return { status: "ENVIRONMENT_BLOCKED", reason: "PNPM_EXECUTION_FAILED", ...evidence };
  }
  if (!requestedMatch) return { status: "FAIL", reason: "PACKAGE_MANAGER_PIN_INVALID", ...evidence };
  if (!/^\d+\.\d+\.\d+$/u.test(input.actualVersion ?? "")) {
    return { status: "FAIL", reason: "PNPM_VERSION_OUTPUT_INVALID", ...evidence };
  }
  if (input.actualVersion !== requestedMatch[1]) {
    return { status: "FAIL", reason: "PNPM_VERSION_MISMATCH", ...evidence };
  }
  if (!lockfileCompatible(input.lockfileVersion, input.actualVersion)) {
    return { status: "FAIL", reason: "LOCKFILE_VERSION_INCOMPATIBLE", ...evidence };
  }
  if (input.globalManifestVersion && input.globalManifestVersion !== input.actualVersion) {
    evidence.warnings.push("GLOBAL_MANIFEST_DIFFERS_FROM_EXECUTED_VERSION");
  }
  return { status: "PASS", reason: "EXECUTED_VERSION_MATCHES_PROJECT_PIN", ...evidence };
}

export function runPnpm(commandPath, args, options = {}) {
  const runner = options.runner ?? spawnSync;
  if (process.platform === "win32" && /\.cmd$/iu.test(commandPath)) {
    const executionTarget = resolveExecutionTarget(commandPath);
    if (!executionTarget) {
      return { status: null, stdout: "", stderr: "", error: Object.assign(new Error("pnpm npm shim target is unavailable"), { code: "ENOENT" }) };
    }
    return runner(process.execPath, [executionTarget, ...args], {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: options.timeoutMs ?? 10_000,
    });
  }
  return runner(commandPath, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs ?? 10_000,
  });
}

export function resolveExecutionTarget(commandPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  if (platform !== "win32" || !/\.cmd$/iu.test(commandPath ?? "")) return commandPath ?? null;
  const shimDirectory = path.dirname(commandPath);
  const candidates = [
    // npm global shim: %APPDATA%\npm\pnpm.cmd
    path.join(shimDirectory, "node_modules", "pnpm", "bin", "pnpm.mjs"),
    // pnpm managed tool shim: ...\<version>\<hash>\bin\pnpm.cmd
    path.join(shimDirectory, "..", "node_modules", "pnpm", "bin", "pnpm.mjs"),
  ];
  return candidates.map((candidate) => path.resolve(candidate)).find((candidate) => exists(candidate)) ?? null;
}

function resolvePnpmCommand(env, runner, cwd) {
  if (env.HIPASS_PNPM_COMMAND) return path.resolve(cwd, env.HIPASS_PNPM_COMMAND);
  const resolver = process.platform === "win32"
    ? runner("where.exe", ["pnpm.cmd"], { cwd, env, encoding: "utf8", shell: false, windowsHide: true })
    : runner("which", ["pnpm"], { cwd, env, encoding: "utf8", shell: false });
  if (resolver.status !== 0) return null;
  return String(resolver.stdout ?? "").split(/\r?\n/u).map((value) => value.trim()).find(Boolean) ?? null;
}

function lockfileCompatible(lockfileVersion, pnpmVersion) {
  const pnpmMajor = Number(String(pnpmVersion).split(".")[0]);
  if (!Number.isInteger(pnpmMajor)) return false;
  if (lockfileVersion === "9.0") return pnpmMajor >= 9;
  return false;
}
