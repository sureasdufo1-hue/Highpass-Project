import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("Dockerfile.orthanc", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");

test("Orthanc runtime images are digest pinned", () => {
  assert.match(dockerfile, /^FROM busybox:1\.37\.0-musl@sha256:[a-f0-9]{64} AS healthcheck$/m);
  assert.match(dockerfile, /^FROM jodogne\/orthanc-plugins:1\.12\.11@sha256:[a-f0-9]{64}$/m);
});

test("Orthanc runtime removes unused vulnerable package families", () => {
  for (const packageName of [
    "libblkid1",
    "libuuid1",
    "libsystemd0",
    "libudev1",
    "libtinfo6",
    "libacl1",
  ]) {
    assert.match(dockerfile, new RegExp(`\\b${packageName}\\b`));
  }
});

test("Orthanc readiness uses the static probe without a shell", () => {
  assert.match(
    compose,
    /test: \["CMD", "\/usr\/local\/bin\/busybox", "wget", "-q", "-O", "\/dev\/null", "http:\/\/127\.0\.0\.1:8042\/system"\]/,
  );
  assert.doesNotMatch(compose, /bash -lc 'exec 3<>\/dev\/tcp\/127\.0\.0\.1\/8042/);
});
