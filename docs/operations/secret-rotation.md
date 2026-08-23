# Secret Rotation

## Scope

This PoC validates only synthetic/test secrets. Real KMS/HSM and production secret managers remain `NOT VERIFIED`.

## PostgreSQL Credential Rotation

Validated flow:

1. Generated a new local test PostgreSQL application password.
2. Updated the `hipass_app` database role.
3. Recreated `hipass-control-api` and `hipass-edge` with the new `DATABASE_URL`.
4. Verified application health through trusted Edge TLS.
5. Verified old credential rejection from a separate container on `newproject_db_net`.

Evidence:

- `artifacts/operations/secret-rotation-20260823-152416/network-credential-retest.json`

PostgreSQL local `127.0.0.1` inside the database container uses `trust` in `pg_hba.conf`, so credential validation must use a separate network client.

## Fail Closed

A deliberately wrong application credential made `hipass-control-api` unhealthy and Edge returned `502 UPSTREAM_UNAVAILABLE`; protected operations did not fall back to an alternate credential.

## Leakage Control

The local `.env` file is Git-ignored. Evidence files store status and redacted outputs, not plaintext passwords.
