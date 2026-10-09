import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("cloud deployment requires exact fresh image scans before any remote write", () => {
  const runner = readFileSync("scripts/capstone-cloud-control-ops.py", "utf8");
  assert.ok(runner.indexOf("LATEST_IMAGE_SECURITY_GATE_NOT_SATISFIED") < runner.indexOf("client.connect("));
  assert.match(runner, /paramiko\.RejectPolicy/u);
  assert.match(runner, /ARCHIVE_HASH_MISMATCH/u);
  assert.match(runner, /LOADED_IMAGE_ID_MISMATCH/u);
  assert.match(runner, /--pull never/u);
  assert.match(runner, /CERTIFICATE_PUBLIC_KEY_MISMATCH/u);
  assert.doesNotMatch(runner, /sftp\.put\([^\n]*(?:ca\.key|cloud-server\.key)|--insecure|StrictHostKeyChecking=no/u);
});
test("cloud secrets and TLS key are generated remotely, and Docker forwarding stays original-destination bound", () => {
  const prepare = readFileSync("scripts/capstone-cloud-control-prepare.sh", "utf8");
  assert.match(prepare, /test ! -e "\$secret_dir"/u);
  assert.match(prepare, /openssl rand -hex 32/u);
  assert.match(prepare, /chmod 640/u);
  assert.match(prepare, /umask 077/u);
  assert.doesNotMatch(prepare, /set -x|cat .*password/u);
  const firewall = readFileSync("scripts/capstone-overlay-firewall.sh", "utf8");
  assert.match(firewall, /--dport 8443 -m conntrack --ctstate NEW --ctorigdst 10\.90\.88\.1 --ctorigdstport 443/u);
  const pg = readFileSync("infra/azure/Dockerfile.postgres-capstone", "utf8");
  assert.match(pg, /postgres:16-alpine@sha256:/u);
  assert.match(pg, /apk upgrade --no-cache/u);
  assert.match(pg, /rm \/usr\/local\/bin\/gosu/u);
  assert.doesNotMatch(pg, /--allow-untrusted|--no-check-certificate/u);
});
