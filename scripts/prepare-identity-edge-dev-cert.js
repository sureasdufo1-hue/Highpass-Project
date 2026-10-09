import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import path from 'node:path';
const directory = path.resolve('tmp/certs/identity-edge');
const cert = path.join(directory, 'identity-proxy-dev.crt'), key = path.join(directory, 'identity-proxy-dev.key');
const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
const run = args => { try { execFileSync(openssl, args, { timeout: 15000, stdio: 'ignore' }); } catch { throw new Error('IDENTITY_DEV_CERT_OPERATION_FAILED'); } };
if (!existsSync(cert) && !existsSync(key)) {
  if (existsSync(directory)) throw new Error('IDENTITY_DEV_CERT_DIRECTORY_ALREADY_EXISTS');
  mkdirSync(path.dirname(directory), { recursive: true }); mkdirSync(directory, { mode: 0o700 });
  const csr = path.join(directory, 'identity-proxy-dev.csr');
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=Highpass Identity Proxy DEVELOPMENT ONLY']);
  chmodSync(key, 0o600);
  run(['x509', '-req', '-in', csr, '-CA', path.resolve('tmp/certs/mtls/ca.crt'), '-CAkey', path.resolve('tmp/certs/mtls/ca.key'),
    '-set_serial', '0x' + randomBytes(16).toString('hex'), '-out', cert, '-days', '30', '-sha256', '-extfile', path.resolve('config/identity-edge-dev-client.ext')]);
}
if (!existsSync(cert) || !existsSync(key)) throw new Error('IDENTITY_DEV_CERT_PARTIAL_STATE_PRESERVED');
run(['verify', '-CAfile', path.resolve('tmp/certs/mtls/ca.crt'), '-purpose', 'sslclient', cert]);
const publicCert = new X509Certificate(readFileSync(cert));
if (!publicCert.checkPrivateKey(createPrivateKey(readFileSync(key)))) throw new Error('IDENTITY_DEV_CERT_KEY_MISMATCH');
if (publicCert.subjectAltName !== 'URI:spiffe://highpass.local/dev/identity-edge-proxy' || Date.parse(publicCert.validTo) <= Date.now()) throw new Error('IDENTITY_DEV_CERT_ROLE_OR_EXPIRY_INVALID');
const untrustedCert=path.join(directory,'untrusted-dev.crt'),untrustedKey=path.join(directory,'untrusted-dev.key');
if (!existsSync(untrustedCert) && !existsSync(untrustedKey)) {
  run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',untrustedKey,'-out',untrustedCert,'-days','30','-sha256','-subj','/CN=Highpass UNTRUSTED NEGATIVE DEVELOPMENT ONLY','-addext','extendedKeyUsage=clientAuth']);
  chmodSync(untrustedKey,0o600);
}
if (!existsSync(untrustedCert)||!existsSync(untrustedKey)) throw new Error('IDENTITY_UNTRUSTED_FIXTURE_PARTIAL_STATE_PRESERVED');
const untrusted=new X509Certificate(readFileSync(untrustedCert)),ca=new X509Certificate(readFileSync('tmp/certs/mtls/ca.crt'));
if (untrusted.verify(ca.publicKey)||Date.parse(untrusted.validTo)<=Date.now()||!untrusted.checkPrivateKey(createPrivateKey(readFileSync(untrustedKey)))) throw new Error('IDENTITY_UNTRUSTED_FIXTURE_INVALID');
console.log(JSON.stringify({ status: 'PASS', scope: 'LOCAL DEVELOPMENT FIXTURE ONLY NOT RUNTIME CERTIFICATE ROTATION', certificate: cert, validUntil: publicCert.validTo, fingerprint: publicCert.fingerprint256, privateKeyPrinted: false }));
