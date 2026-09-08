# ADR-PF-001 — Privacy Filter native label mapping

- Status: Accepted for PF-0 contract baseline
- Date: 2026-09-07
- Scope: Capstone/MVP technical test environment

## Decision

The internal privacy contract adds `URL_IDENTIFIER` and `FINANCIAL_ACCOUNT`. OpenAI Privacy Filter labels remain unchanged and are stored separately as `nativeLabel`. `private_url` maps to `URL_IDENTIFIER`; `account_number` maps to `FINANCIAL_ACCOUNT`.

This avoids treating a personal URL as a hospital identifier or treating every financial account as a generic secret. An unknown native label is preserved as unmapped, forces `REVIEW_REQUIRED`, and cannot be release eligible.

## Compatibility impact

Consumers must tolerate the two additive system types. The database enum migration and contract-consistency test must be applied before a future persistent PF-2 artifact pipeline is enabled. No existing clinical API enum is changed.

## Safety boundary

This ADR defines classification plumbing only. It does not establish de-identification adequacy, PIPA compliance, clinical safety, or permission to release an artifact.
