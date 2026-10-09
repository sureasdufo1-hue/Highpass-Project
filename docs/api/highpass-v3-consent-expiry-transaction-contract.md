# CONSENT_EXPIRY private transaction contract

2026-10-08 / PARTIAL ISOLATED IMPLEMENTATION / DRAFT / UNASSIGNED.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001;
legacy FR-001~005/014~025/037~041. L1~L5 policy adoption: 김범희,
2026-10-08. Independent technical evidence review remains separate.

## Admission and minimum capability

`createConsentExpiryTransactions` issues a privately branded immutable factory.
Its `run(binding, command, callback)` requires the exact registry-issued
INTERNAL_SERVICE / CONSENT_EXPIRY / sole consent:expire / null patientRef binding
and that binding's privately issued bounded command before borrowing a connection.
Copied factories, bindings or commands are not authority.

The dedicated nonowner pool must be a member of hp_v3_consent_expiry_policy and
no other role apart from itself. Superuser, BYPASSRLS, dangerous inherited role,
schema/table ownership or mixed approval/withdrawal/clinical/Session expiry
membership rejects admission and destroys the borrowed connection. Query/socket
faults return safe codes without raw PostgreSQL details. No patient_refs grant,
runtime enrollment, credential provisioning or migration is added.

The existing generic transaction checks exact persisted actor/tenant/source
hospital/role/patientRef/scope/servicePurpose and ACTIVE service/source under
registry SHARE locks. A valid signature does not override suspended/mismatched DB
enrollment. Query budgets remain finite; total deadline is 50..10000 ms, default
8000 ms, query budget 10..5000 ms. Pool acquisition is inside the total deadline.

## Callback lifetime and result boundary

`assertConsentExpiryTransaction(tx, binding, command)` requires the exact private
callback transaction and original binding/command, current credential and deadline.
UTC time zone and ISO YMD DateStyle are set locally before caller work. DB clock
and credential expiry are checked before and after callback work. Captured or
copied transactions cannot be asserted after callback completion. Query access
also checks the private callback lifetime and underlying transaction liveness.

Callback failure rolls back; deadline destroys the connection. Credential expiry,
unknown COMMIT outcome and rollback/storage errors never become a success receipt.
The returned callback value is not by itself an expiry event, historical receipt,
clinical permission or consumer ACK. Only a future atomic event service can
assemble event3/audit/result/REQUESTED cascade under the consent advisory domain.

## Remaining work

Finite batch expiry service, real service withdrawal/expiry races, lost ACK/drain,
audited minimum read, downstream Decision/Grant/access denial, HTTPS/Viewer and
full v3 acceptance remain incomplete. SQL expiry fixtures remain SQL fixtures,
not deployed workers. Runtime scheduler/API activation is a separate gate.

[Factory execution prompt](../implementation/highpass-v3-p0-06-consent-expiry-factory-prompt.md).
