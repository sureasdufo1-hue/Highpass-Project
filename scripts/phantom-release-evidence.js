// Reconcile both completed reads and fail-closed reads interrupted by revocation.
// A prepared release is not itself proof that plaintext was released.
export function classifyPhantomReleases(counts, consentRevoked) {
  const fields=['total','consumed','vault','consumedAudited','unconsumedExpired','unconsumedDenied'];
  if (!fields.every(key=>Number.isSafeInteger(counts?.[key]) && counts[key]>=0)) return 'NOT VERIFIED';
  const unused=counts.total-counts.consumed;
  if (!consentRevoked || counts.total<1 || counts.consumed<1 || unused<0 || counts.vault!==counts.total || counts.consumedAudited!==counts.consumed) return 'FAIL';
  if (counts.unconsumedExpired!==unused || counts.unconsumedDenied!==unused) return 'NOT VERIFIED';
  return 'PASS';
}
