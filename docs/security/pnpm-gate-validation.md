# pnpm Security Gate Validation

## Problem and correction

The former Gate read `%APPDATA%\npm\node_modules\pnpm\package.json` and treated its `11.22.0` version as the executing tool. In this repository, the project pin and actual tool are `pnpm@11.7.0`; therefore the manifest-only decision was an environment misclassification.

The Gate now resolves the command shim, resolves both npm-global and pnpm-managed Windows shim targets, executes the target with the current Node runtime, and compares that output independently with `package.json` and the lockfile. It does not disable Corepack signatures, TLS, or registry verification.

## Evidence

| Attribute | Value |
|---|---|
| PowerShell command source | `C:\Users\user\AppData\Roaming\npm\pnpm.ps1` |
| Gate command path under `pnpm run` | pnpm-managed `11.7.0` store shim |
| Resolved execution target | the shim's `node_modules\pnpm\bin\pnpm.mjs` |
| Actual execution output | `11.7.0` |
| `packageManager` | `pnpm@11.7.0` |
| lockfile version | `9.0` |
| global manifest | `11.22.0`, recorded as `GLOBAL_MANIFEST_DIFFERS_FROM_EXECUTED_VERSION` |
| `corepack pnpm --version` observation | `12.3.4`; not used as the Gate authority |

Tests cover normal execution, missing/invalid path, actual-version mismatch, invalid package-manager pin, incompatible lockfile, global-manifest mismatch, and both Windows shim layouts. The focused suite passed 4/4. `pnpm audit --prod --audit-level critical` found no known vulnerability, and `pnpm run security:gate` passed unit tests, secret scan, and dependency audit.

Failure behavior remains fail-closed: unavailable executable/registry is `ENVIRONMENT_BLOCKED`; pin or lockfile mismatch is `FAIL`; neither is converted to `PASS`.

Evidence: `evidence/generated/2026-09-08T11-08-07-528Z/security-gate.txt`.
