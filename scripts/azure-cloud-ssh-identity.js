import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Dedicated capstone automation identity outside Git. The unencrypted private
// key is protected by a current-user/SYSTEM-only Windows directory and file ACL.
// Never print or copy private key bytes into parameters, logs or the repository.
if (process.platform !== "win32" || !process.env.USERPROFILE) throw new Error("WINDOWS_USER_PROFILE_REQUIRED");
const directory = path.join(process.env.USERPROFILE, ".ssh", "highpass-capstone-cloud");
const privatePath = path.join(directory, "id_ed25519");
const publicPath = privatePath + ".pub";
const native = (command, args, extra = {}) => execFileSync(command, args, {
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 15000, encoding: "utf8", maxBuffer: 16384,
  ...extra,
});
const sid = /S-1-5-21-(?:\d+-){3}\d+/u.exec(native("whoami.exe", ["/user", "/fo", "csv", "/nh"]))?.[0];
if (!sid) throw new Error("CURRENT_USER_SID_UNVERIFIED");
const acl = (target, inherited) => {
  native("icacls.exe", [target, "/inheritance:r", "/grant:r",
    `*${sid}:${inherited ? "(OI)(CI)" : ""}(F)`, `*S-1-5-18:${inherited ? "(OI)(CI)" : ""}(F)`]);
  // ssh-keygen can leave an explicit Administrators grant; inheritance:r alone
  // does not remove it. Restrict only this dedicated identity, never parent .ssh.
  native("icacls.exe", [target, "/remove:g", "*S-1-5-32-544", "*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"]);
  // Use .NET directly in Windows PowerShell 5.1: inherited PSModulePath from
  // PowerShell 7 can otherwise prevent its Security module from loading.
  const check = "$p=$env:HIPASS_SSH_ACL_TARGET; $a=if([System.IO.Directory]::Exists($p)){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}; if(-not $a.AreAccessRulesProtected){exit 1}; foreach($r in $a.Access){$s=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($s -ne $env:HIPASS_SSH_ACL_SID -and $s -ne 'S-1-5-18'){exit 1}}";
  native("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", check], {
    env: { ...process.env, HIPASS_SSH_ACL_TARGET: target, HIPASS_SSH_ACL_SID: sid },
  });
};
if (!existsSync(directory)) {
  mkdirSync(directory, { recursive: true });
  acl(directory, true);
} else {
  // Never weaken/overwrite a pre-existing identity; secure only this dedicated path.
  acl(directory, true);
}
if (existsSync(privatePath) !== existsSync(publicPath)) throw new Error("PARTIAL_IDENTITY_PRESERVED_REVIEW_REQUIRED");
let created = false;
if (!existsSync(privatePath)) {
  native("ssh-keygen.exe", ["-q", "-t", "ed25519", "-f", privatePath, "-N", "", "-C", "highpass-capstone-cloud"]);
  created = true;
}
acl(privatePath, false);
const publicKey = readFileSync(publicPath, "utf8").trim();
if (!/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: highpass-capstone-cloud)?$/u.test(publicKey)) throw new Error("PUBLIC_IDENTITY_INVALID");
const derivedPublic = native("ssh-keygen.exe", ["-y", "-f", privatePath]).trim().split(/\s+/u).slice(0, 2).join(" ");
if (derivedPublic !== publicKey.split(/\s+/u).slice(0, 2).join(" ")) throw new Error("IDENTITY_PAIR_MISMATCH");
const fingerprint = native("ssh-keygen.exe", ["-lf", publicPath]).trim().split(/\s+/u)[1];
console.log(JSON.stringify({ scope: "CAPSTONE_CLOUD_ADMIN_IDENTITY", status: "PASS", created,
  publicKeyPath: publicPath, fingerprint, protection: "WINDOWS_CURRENT_USER_AND_SYSTEM_ACL", review: "DRAFT / UNASSIGNED" }));
