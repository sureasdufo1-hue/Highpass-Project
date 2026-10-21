import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';

// Opt-in for existing local fixtures; mandatory in the deployed Control overlay.
export function postgresTlsOptions(connectionString, env = process.env) {
  if (env.HIPASS_POSTGRES_TLS_REQUIRED !== '1') return {};
  if (!env.HIPASS_POSTGRES_TLS_CA_FILE || !env.HIPASS_POSTGRES_TLS_SERVERNAME)
    throw new Error('POSTGRES_TLS_CONFIGURATION_REQUIRED');
  const url = new URL(connectionString);
  if (![...url.searchParams.keys()].every(key => !/^ssl/i.test(key)))
    throw new Error('POSTGRES_TLS_URL_OVERRIDE_FORBIDDEN');
  const ca = readFileSync(env.HIPASS_POSTGRES_TLS_CA_FILE, 'utf8');
  const certificate = new X509Certificate(ca);
  if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now())
    throw new Error('POSTGRES_TLS_CA_INVALID');
  return {ssl:{ca,servername:env.HIPASS_POSTGRES_TLS_SERVERNAME,
    checkServerIdentity:(_host,peer)=>checkServerIdentity(env.HIPASS_POSTGRES_TLS_SERVERNAME,peer),
    rejectUnauthorized:true,minVersion:'TLSv1.2'}};
}
