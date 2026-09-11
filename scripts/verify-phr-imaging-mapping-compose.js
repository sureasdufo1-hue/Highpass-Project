#!/usr/bin/env node
import { spawn } from "node:child_process";

const composeProject = process.env.COMPOSE_PROJECT_NAME ?? "highpass-phase2";
const timeoutMs = Number(process.env.PHR_VERIFY_TIMEOUT_MS ?? 120_000);
const args = [
  "compose",
  "-p",
  composeProject,
  "run",
  "--rm",
  "--no-deps",
  "hospital-a-phr-mapping-check",
];

const child = spawn("docker", args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

let finished = false;
const finish = (code) => {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  process.exitCode = code;
};

const timer = setTimeout(() => {
  console.error(`PHR mapping verification timed out after ${timeoutMs} ms`);
  child.kill();
  finish(2);
}, timeoutMs);

child.on("error", (error) => {
  console.error(`Unable to start Docker Compose: ${error.message}`);
  finish(2);
});

child.on("close", (code, signal) => {
  if (signal) {
    console.error(`Docker Compose mapping check terminated by ${signal}`);
    finish(2);
    return;
  }
  finish(code ?? 2);
});
