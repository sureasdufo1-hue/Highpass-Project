import test from "node:test";
import assert from "node:assert/strict";
import { buildEncryptedImagingPackage } from "../src/mobile-package-crypto.js";
import { MobileVault, MobileVaultError, MobileVaultStatus } from "../src/mobile-vault.js";

function packageFixture() {
  return buildEncryptedImagingPackage({
    packageId: "pkg_abcdefghijklmnop",
    transferId: "trf_abcdefghijklmnop",
    consentId: "consent_demo",
    patientRef: "pat_abcdefghijklmnop",
    sourceInstitution: "inst_hospital_a",
    destinationInstitution: "inst_hospital_b",
    purpose: "TREATMENT",
    scope: { studyRefs: ["study-synthetic-1"], actions: ["VIEW", "MOBILE_STORE"] },
    objects: [{ studyRef: "study-synthetic-1", seriesRef: "series-synthetic-1", instanceRef: "instance-synthetic-1", data: Buffer.from("synthetic-dicom-payload") }],
    keyEnvelopeRefs: ["kenv_abcdefghijklmnop"],
    now: new Date("2026-09-12T00:00:00.000Z"),
    ttlMs: 600000,
  });
}

test("vault stores ciphertext-only package and returns cloned encrypted data", () => {
  const fixture = packageFixture();
  const vault = new MobileVault({ clock: () => new Date("2026-09-12T00:01:00.000Z") });
  const stored = vault.storePackage({ packageId: fixture.envelope.packageId, envelope: fixture.envelope, chunks: fixture.chunks });
  assert.equal(stored.status, MobileVaultStatus.STORED_ON_DEVICE);
  assert.equal(Buffer.concat(stored.chunks.map((chunk) => chunk.ciphertext)).includes(Buffer.from("synthetic-dicom-payload")), false);
  stored.chunks[0].ciphertext[0] ^= 1;
  assert.notEqual(stored.chunks[0].ciphertext[0], vault.getPackage(fixture.envelope.packageId).chunks[0].ciphertext[0]);
});

test("vault blocks backup/share and duplicate storage", () => {
  const fixture = packageFixture();
  const vault = new MobileVault();
  vault.storePackage({ packageId: fixture.envelope.packageId, envelope: fixture.envelope, chunks: fixture.chunks });
  assert.throws(() => vault.storePackage({ packageId: fixture.envelope.packageId, envelope: fixture.envelope, chunks: fixture.chunks }), (error) => error.code === "VAULT_PACKAGE_EXISTS");
  assert.throws(() => vault.requestBackup(), (error) => error instanceof MobileVaultError && error.code === "VAULT_EXPORT_BLOCKED");
  assert.throws(() => vault.sharePackage(fixture.envelope.packageId), (error) => error.code === "VAULT_EXPORT_BLOCKED");
});

test("vault expires package and erases ciphertext at TTL", () => {
  const fixture = packageFixture();
  let current = new Date("2026-09-12T00:01:00.000Z");
  const vault = new MobileVault({ clock: () => current });
  vault.storePackage({ packageId: fixture.envelope.packageId, envelope: fixture.envelope, chunks: fixture.chunks });
  current = new Date("2026-09-12T00:11:00.000Z");
  assert.throws(() => vault.getPackage(fixture.envelope.packageId), (error) => error.code === "VAULT_PACKAGE_UNAVAILABLE");
  assert.equal(vault.listPackages()[0].status, MobileVaultStatus.EXPIRED);
  assert.equal(vault.auditEvents().at(-1).action, "PACKAGE_EXPIRED");
});

test("revoke and delete return auditable receipt and make package unavailable", () => {
  const fixture = packageFixture();
  const vault = new MobileVault();
  vault.storePackage({ packageId: fixture.envelope.packageId, envelope: fixture.envelope, chunks: fixture.chunks });
  assert.equal(vault.revokePackage(fixture.envelope.packageId).status, MobileVaultStatus.REVOKED);
  assert.throws(() => vault.getPackage(fixture.envelope.packageId), (error) => error.code === "VAULT_PACKAGE_UNAVAILABLE");
  const receipt = vault.deletePackage(fixture.envelope.packageId);
  assert.equal(receipt.status, MobileVaultStatus.DELETED);
  assert.equal(receipt.method, "CRYPTO_ERASE");
  assert.match(receipt.evidenceDigest, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(vault.listPackages()[0].status, MobileVaultStatus.DELETED);
});
