import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [mode, inputFile, outputFile] = process.argv.slice(2);
if (!["encrypt", "decrypt"].includes(mode) || !inputFile || !outputFile) {
  console.error("Usage: node scripts/ops-encrypt-file.js <encrypt|decrypt> <input> <output>");
  process.exit(2);
}

const passphrase = process.env.OPS_BACKUP_PASSPHRASE;
if (!passphrase || passphrase.length < 24) {
  console.error("OPS_BACKUP_PASSPHRASE must be set to a test secret of at least 24 characters");
  process.exit(2);
}

try {
  if (mode === "encrypt") encrypt(inputFile, outputFile, passphrase);
  else decrypt(inputFile, outputFile, passphrase);
} catch (error) {
  console.error(error.code ?? error.message);
  process.exit(1);
}

function encrypt(inputFile, outputFile, secret) {
  const plaintext = readFileSync(inputFile);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(JSON.stringify({
    format: "hipass-ops-backup-v1",
    algorithm: "AES-256-GCM",
    kdf: "scrypt",
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    plaintextSha256: sha256(plaintext),
  }), "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(header.length);
  writeFileSync(outputFile, Buffer.concat([Buffer.from("HPOB1"), size, header, ciphertext]));
}

function decrypt(inputFile, outputFile, secret) {
  const file = readFileSync(inputFile);
  if (file.subarray(0, 5).toString("utf8") !== "HPOB1") throw new Error("INVALID_BACKUP_MAGIC");
  const headerSize = file.readUInt32BE(5);
  const header = JSON.parse(file.subarray(9, 9 + headerSize).toString("utf8"));
  if (header.algorithm !== "AES-256-GCM") throw new Error("UNSUPPORTED_BACKUP_ALGORITHM");
  const ciphertext = file.subarray(9 + headerSize);
  const key = scryptSync(secret, Buffer.from(header.salt, "base64url"), 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(header.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (sha256(plaintext) !== header.plaintextSha256) throw new Error("BACKUP_SHA256_MISMATCH");
  writeFileSync(outputFile, plaintext);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}
