# CONSENT_EXPIRY principal / private command contract

2026-10-08 / PARTIAL ISOLATED IMPLEMENTATION / DRAFT / UNASSIGNED.
L1~L5 policy adopter/reviewer/approver: 김범희, 2026-10-08. Technical independent review separate.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001; FR-001~005/014~025/037~041.

## Server enrollment and signed operation

V3PrincipalRegistry allows two explicit INTERNAL_SERVICE maintenance purposes:

| Purpose | Exact sole scope | Patient binding |
| --- | --- | --- |
| SESSION_EXPIRY | exchange:expire | null |
| CONSENT_EXPIRY | consent:expire | null |

Issuer/subject, actor UUID, tenant/source hospital UUIDs and provider-facing hospital
identity are server-owned enrollment, never request metadata. ACTIVE enrollment is
required at resolution; persisted ACTIVE source/service checks remain necessary at DB admission.
Unknown purpose, mixed/duplicate/crossed scopes or any human maintenance scope is rejected.
One signed INTERNAL_SERVICE role and exact sole purpose-specific token/operation scope
are required. Existing issuer/audience/signature/subject/hospital/expiry checks remain.
JWT/body purpose or patientRef claims cannot alter enrollment. No shared service token,
developer header or API-key shortcut is introduced. Actual IdP/workload provisioning is deferred.

## Pure batch command

`prepareConsentExpiryBatch(binding, options)` uses `v3ConsentExpiryPolicy`. Options are
only optional own `limit`: integer1..100, default25 if omitted. Explicit null/undefined,
extra/symbol/authority fields, accessors, arrays and custom prototypes reject. Omitted limit
does not evaluate a getter inherited from Object.prototype.
Issued immutable command kind is CONSENT_EXPIRY_COMMAND_ONLY with server-derived actor,
tenant/hospital and limit. Private WeakMap binds it to the exact issued binding.
`assertConsentExpiryBatch` rechecks binding credential expiry and provenance. Copies or
separately resolved bindings do not inherit its capability. A command is neither successful
expiry, a historical receipt nor clinical authority; it requires a future guarded DB factory.

## Persistent checks and implementation boundary

027 already matches these purpose/scope rules. The actual synthetic fixture verifies signed
registry+command with generic V3TenantTransaction against persisted source actor/role/ref/
servicePurpose. Its FOR SHARE privileges are column-scoped and WITH CHECK(false) forbids
registry writes. It has no patient_refs SELECT, approval/withdrawal/clinical/Session-expiry
capability inheritance. Signed registry mismatch or suspended persisted source/service denies.
This is not an expiry-specific guarded factory or authenticated event-writing worker.
SQL expiry race evidence remains labelled SQL fixture. Public HTTP, scheduler, runtime
registration/credentials/migration and Grant activation are not provided by this contract.

[Execution/evidence](../governance/highpass-v3-consent-expiry-principal-execution-2026-10-08.md),
[next factory prompt](../implementation/highpass-v3-p0-06-consent-expiry-factory-prompt.md).
Complete CON/D6/MVP/v3, minimum audited evidence read and downstream authority/ACK are pending.
