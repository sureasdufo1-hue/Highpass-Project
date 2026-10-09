import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("VM automation pins management-channel public host keys before password authentication", () => {
  const source = readFileSync("scripts/workstation-automatic-ops.py", "utf8");
  assert.match(source, /VixVM_CopyFileFromGuestToHost/u);
  assert.match(source, /ssh_host_ed25519_key\.pub/u);
  assert.match(source, /paramiko\.RejectPolicy\(\)/u);
  assert.doesNotMatch(source, /AutoAddPolicy|WarningPolicy|ssh_host_ed25519_key["']/u);
  assert.match(source, /GUEST_ROLE_MISMATCH/u);
  assert.match(source, /getpass\.getpass/u);
  assert.match(source, /stdin\.write\(credential \+ "\\n"\)/u);
  assert.doesNotMatch(source, /password=["']|-pw(?:file)?|logging\.DEBUG/u);
  assert.ok(source.indexOf("key = trust.key") < source.indexOf("client.connect(address"));
});

test("VM jobs, SSH, output and root operations are bounded; rotation verifies independent reconnect", () => {
  const source = readFileSync("scripts/workstation-automatic-ops.py", "utf8");
  assert.match(source, /time\.monotonic\(\) \+ 25/u);
  assert.match(source, /REMOTE_OUTPUT_LIMIT/u);
  assert.match(source, /auth_timeout=10/u);
  assert.match(source, /get_pty=False/u);
  assert.match(source, /B_ROTATION_NOT_INDEPENDENT/u);
  assert.match(source, /B_RECONNECT_ROLE_MISMATCH/u);
  assert.match(source, /return 0 if overall == "PASS" else 1/u);
  assert.match(source, /except ConnectionRefusedError/u);
  assert.match(source, /RAW_ORTHANC=NETWORK_ERROR/u);
  assert.match(source, /else "FAIL" if code == 0 and output.strip\(\) == "RAW_ORTHANC=REACHABLE"/u);
  assert.doesNotMatch(source, /write_text\(credential|write_bytes\(credential/u);
  const rotate = readFileSync("scripts/workstation-rotate-b-hostkeys.sh", "utf8");
  assert.match(rotate, /00:0c:29:a3:9e:1b/u);
  assert.match(rotate, /chmod 700 "\$backup"/u);
  assert.match(rotate, /trap rollback ERR/u);
  assert.match(rotate, /\/usr\/sbin\/sshd -t/u);
  assert.match(rotate, /ssh-keygen -lf .*\.pub/u);
  assert.doesNotMatch(rotate, /rm -rf|cat .*_key(?:\s|$)/u);
});
