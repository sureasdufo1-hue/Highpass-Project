// Preserve persisted records verbatim. Timestamps/UUID order is not chain order.
export function orderStoredAuditChain(rows) {
  if (!Array.isArray(rows)) throw new Error("AUDIT_CHAIN_LINK_INVALID");
  const next = new Map(), hashes = new Set();
  for (const row of rows) {
    const previous = row.previousHash ?? null;
    if (!/^sha256:[a-f0-9]{64}$/u.test(row.recordHash ?? "")
      || (previous !== null && !/^sha256:[a-f0-9]{64}$/u.test(previous))
      || hashes.has(row.recordHash) || next.has(previous)) throw new Error("AUDIT_CHAIN_LINK_INVALID");
    hashes.add(row.recordHash); next.set(previous, row);
  }
  const ordered = [], visited = new Set();
  let previous = null;
  while (next.has(previous)) {
    const row = next.get(previous);
    if (visited.has(row.recordHash)) throw new Error("AUDIT_CHAIN_LINK_INVALID");
    visited.add(row.recordHash); ordered.push(row); previous = row.recordHash;
  }
  if (ordered.length !== rows.length) throw new Error("AUDIT_CHAIN_LINK_INVALID");
  return ordered;
}
