// Exact creation receipt from this fresh verifier page only. No list/search,
// historical inference, fallback identity, record deletion or exported IDs.
export async function cleanupOwnedConsent({ receipts, request, expectedPatientId = "P-1001" }) {
  const base = { scope: "THIS_BROWSER_CREATION_RECEIPT_ONLY", recordsDeleted: 0 };
  if (!Array.isArray(receipts) || receipts.length !== 1) {
    return { ...base, status: "NOT VERIFIED", reason: "UNIQUE_CREATION_RECEIPT_REQUIRED" };
  }
  const created = receipts[0];
  if (!created || !/^consent_[a-f0-9]{2,16}$/.test(created.consentId ?? "") ||
      !["P-1001", "HP-TEST-PHANTOM-001"].includes(expectedPatientId) ||
      created.patientId !== expectedPatientId || created.sourceHospitalId !== "HOSP-A" ||
      created.targetHospitalId !== "HOSP-B" || created.status !== "ACTIVE") {
    return { ...base, status: "NOT VERIFIED", reason: "SYNTHETIC_OWNED_RECEIPT_REQUIRED" };
  }
  const path = `/api/consents/${created.consentId}`;
  const statuses = [];
  const matches = body => body?.consentId === created.consentId && body?.patientId === created.patientId &&
    body?.sourceHospitalId === created.sourceHospitalId && body?.targetHospitalId === created.targetHospitalId;
  try {
    let current = await request("GET", path);
    statuses.push(current.status);
    if (current.status !== 200 || !matches(current.body)) throw new Error();
    if (!["REVOKED", "EXPIRED"].includes(current.body.status)) {
      if (current.body.status !== "ACTIVE") throw new Error();
      const revoked = await request("POST", path + "/revoke");
      statuses.push(revoked.status);
      if (revoked.status !== 200 || !matches(revoked.body) || revoked.body.status !== "REVOKED") throw new Error();
      current = await request("GET", path);
      statuses.push(current.status);
      if (current.status !== 200 || !matches(current.body) || current.body.status !== "REVOKED") throw new Error();
    }
    return { ...base, status: "PASS", effectiveStatus: current.body.status, httpStatuses: statuses };
  } catch {
    return { ...base, status: "NOT VERIFIED", reason: "OWNED_CONSENT_INACTIVE_NOT_CONFIRMED", httpStatuses: statuses };
  }
}
