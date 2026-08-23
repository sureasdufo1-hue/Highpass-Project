# Incident Response Runbooks

Each incident must preserve evidence without storing raw JWTs, bearer tokens, private keys, or real patient data.

## Compromised DICOM Token

Trigger: suspected leaked short-lived DICOMweb token.

Immediate containment: revoke the related consent if patient safety permits, block new token issuance for the scope, and preserve `auditSessionId`, actor, hospital, study, and series.

Validation: confirm Gateway rejects expired, tampered, and scope-mismatched tokens.

## Signing Key Compromise

Trigger: active DICOM token signing key exposure or unexpected `kid` use.

Containment: rotate to a new ACTIVE key, move old key to VERIFY_ONLY only for bounded TTL if required, then RETIRED. Unknown or retired `kid` must deny.

## mTLS Private Key Compromise

Trigger: gateway client or Orthanc server private key exposure.

Containment: remove trust for the affected cert, issue replacement cert, restart affected service, and verify wrong/old cert denial.

## DB Credential Compromise

Trigger: leaked PostgreSQL credential or suspicious DB access.

Containment: rotate credential, restart dependent services, confirm old credential fails, preserve audit and DB logs.

## Cross-Tenant Attempt

Trigger: hospital, doctor, Study, or Series mismatch.

Containment: confirm server-side DENIED reason, preserve actor/hospital/resource scope, review repeated failures.

## Audit Integrity Anomaly

Trigger: missing or invalid audit hash chain.

Containment: do not silently repair. Preserve DB snapshot, identify last valid audit row, and escalate to security owner.

## Critical Container CVE

Trigger: new confirmed runtime Critical vulnerability.

Containment: block release gate, patch/rebuild/rescan, or record explicit time-boxed risk decision.
