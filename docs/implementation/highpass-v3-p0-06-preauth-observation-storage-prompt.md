# Next execution: pre-auth real observation and storage alignment

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041 and V3-SR-IAM-002.

1. Read the pre-auth event contract and latest race/adapter report. Verify current
   source and full regression result; never substitute socket mocks for real TLS.
2. Identify real server tlsClientError observations and safe edge-rejection stages
   in isolated fixtures. Observe actual Node/OpenSSL codes for no-certificate,
   expired and untrusted handshakes without logging raw messages or credentials.
   Keep unknown failures generic; socket IP is immediate hop, not patient IP.
3. Design trusted capture lifecycle and injection-only integration, with no caller
   headers as authoritative provenance. Test cloned/foreign admission and that
   all sink outcomes leave authentication rejection unchanged. Keep a finite
   response deadline, flood capacity bounds and readiness responsiveness.
4. Align isolated durable storage schema, minimal publisher role, security-admin
   read role, append-only constraints and global versus tenant visibility BEFORE
   implementing a migration. Record retention/ownership as unresolved, not an
   invented organizational approval. Do not expose events to ordinary clinical
   users or attach fabricated tenant/actor/session identifiers.
5. Write actual isolated PG storage/failure acceptance criteria and next prompt.
   Runtime wiring, clinical approval, production deployment and actual patient
   data stay excluded. Existing audit/DPoP paths must not be weakened or skipped.
6. Run focused/full regressions, preserve failures, and mark fresh evidence
   DRAFT/UNASSIGNED. No commit/push/merge/PR. Do not declare full MVP/v3 complete.
