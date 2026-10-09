import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("overlay keeps private keys on own hosts and only public keys cross orchestration", () => {
  const setup = readFileSync("scripts/capstone-overlay-setup.sh", "utf8");
  const runner = readFileSync("scripts/capstone-overlay-ops.py", "utf8");
  assert.match(setup, /umask 077/u);
  assert.match(setup, /root:root:600/u);
  assert.match(setup, /wg pubkey < "\$state\/private.key"/u);
  assert.match(setup, /PostUp = wg set %%i private-key/u);
  assert.doesNotMatch(setup, /wg showconf|wg show .*dump|StrictHostKeyChecking=no|0\.0\.0\.0\/0/u);
  assert.match(runner, /paramiko\.RejectPolicy/u);
  assert.match(runner, /trust.key\(role, credential/u);
  assert.match(runner, /OVERLAY_KEYS_NOT_DISTINCT/u);
  assert.match(runner, /OVERLAY_ROUTE_COLLISION/u);
  assert.doesNotMatch(runner, /read_text.*private.key|read_bytes.*private.key|sftp.get\(|password=["']/u);
  assert.match(runner, /PRIVATE_CLOUD_OVERLAY_PING/u);
  assert.match(runner, /VAULT=401,10\.89\.1\.4,0/u);
  assert.doesNotMatch(runner, /--insecure|curl -k/u);
});

test("overlay forwarding grants only narrow private TLS and B to A Gateway routes", () => {
  const firewall = readFileSync("scripts/capstone-overlay-firewall.sh", "utf8");
  assert.match(firewall, /-d 10\.89\.1\.4\/32 -p tcp --dport 443 -j ACCEPT/u);
  assert.match(firewall, /-s 10\.90\.88\.3\/32 -d 10\.90\.88\.2\/32 -p tcp --dport 9443 -j ACCEPT/u);
  assert.match(firewall, /-A HP-CAP-WG-F -j DROP/u);
  assert.match(firewall, /-A HP-CAP-WG-I -j DROP/u);
  assert.doesNotMatch(firewall, /iptables -F(?:\s|$)|iptables -P|--dport (?:8042|4242|5432) -j ACCEPT/u);
  assert.match(firewall, /--dport 8042 -j DROP/u);
  assert.match(firewall, /previous-ip-forward/u);
  assert.match(firewall, /timeout 5s iptables -w 3/u);
});
