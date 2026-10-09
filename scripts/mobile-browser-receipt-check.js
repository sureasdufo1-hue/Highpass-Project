// Read-only domain checks for an explicitly selected browser-issued synthetic ticket.
// The existing presenter key is accepted only through anonymous stdin, never argv.
import https from 'node:https';
import { readFileSync } from 'node:fs';

const ticketId = process.argv[2];
if (!/^ticket_[a-f0-9]{16}$/.test(ticketId ?? '')) throw new Error('EXPLICIT_TICKET_REQUIRED');
const ca = readFileSync(new URL('../tmp/certs/mtls/ca.crt', import.meta.url));
function request(path, roleToken, body) {
  return new Promise((resolve, reject) => {
    const encoded = body ? JSON.stringify(body) : null;
    const req = https.request(new URL(path, 'https://192.168.111.149:9443'), {
      ca, timeout: 10000, method: encoded ? 'POST' : 'GET',
      headers: { ...(roleToken ? { authorization: `Bearer ${roleToken}` } : {}), ...(encoded ? { 'content-type': 'application/json', origin: 'https://192.168.111.149:9443' } : {}) },
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 2_000_000) response.destroy(new Error('RESPONSE_LIMIT')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP_${response.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('INVALID_RECEIPT')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('REQUEST_TIMEOUT')));
    req.on('error', reject);
    req.end(encoded);
  });
}
try {
  let key = '';
  for await (const chunk of process.stdin) { key += chunk; if (key.length > 129) throw new Error('CREDENTIAL_INPUT_LIMIT'); }
  const session = await request('/api/capstone-demo/login', null, { key: key.trim() }); key = '';
  if (!session.profiles?.SECURITY_ADMIN || !session.profiles?.PATIENT) throw new Error('REVIEW_PROFILE_REQUIRED');
  const logs = await request('/api/audit-logs?action=TICKET_ISSUED&limit=128', session.profiles.SECURITY_ADMIN);
  const rows = Array.isArray(logs) ? logs : logs.logs;
  const issued = rows?.find(log => log.ticketId === ticketId);
  if (!issued?.consentId) throw new Error('TICKET_AUDIT_NOT_FOUND');
  const consent = await request(`/api/consents/${encodeURIComponent(issued.consentId)}`, session.profiles.PATIENT);
  const integrity = await request('/api/audit-integrity', session.profiles.SECURITY_ADMIN);
  console.log(JSON.stringify({ review: 'DRAFT / UNASSIGNED', ticketId, consentId: consent.consentId, consentStatus: consent.status, effectiveStatus: consent.effectiveStatus, durationHours: (Date.parse(consent.validUntil) - Date.parse(consent.validFrom)) / 3600000, auditIssued: true, auditChainOk: integrity.ok === true, browserRevocation: 'NOT VERIFIED' }));
} catch (error) {
  console.log(JSON.stringify({ status: 'NOT VERIFIED', reason: /^HTTP_\d+$|^[A-Z_]+$/.test(error.message) ? error.message : 'RECEIPT_CHECK_FAILED' }));
  process.exitCode = 1;
}
