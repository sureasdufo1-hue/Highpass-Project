# Next execution: paired pre-auth HTTP edge observer binding

2026-10-08 / DRAFT / UNASSIGNED / SYNTHETIC NONOPERATING ONLY.
Related FR-037..041, V3-SR-IAM-002. Overall MVP/v3 IN PROGRESS.

1. Read HTTP observation contract and latest actual outage/clock evidence. Retain
   uncertain delivery after dispatch; locked PG is not an expected policy DENY.
2. Implement an observer-owned, privately branded edge emitter bound to its own
   factory-created sink. Reject arbitrary/cloned/foreign sink or callback config
   before copying secrets or activating an edge. No request-selected emitter.
3. Add optional injection-only edge binding: trusted-hop capture failure emits
   INGRESS_REJECTED; registry admission failure HUMAN_AUTH_REJECTED; verified mock
   assurance failure MOCK_ASSURANCE_REQUIRED. Preserve existing default behavior,
   exact safe403 codes, connection close and no preparation callback on failure.
4. Publish asynchronously without awaiting storage before response; keep sink
   capacity/deadlines and at most a bounded safe outcome observation history for
   owned tests. Unexpected publication errors remain uncertain, not fake durable
   success. Use only request.socket immediate IP; no headers/body/URL/raw errors,
   unverified JWT identity, invented domain actor/session or token in audit/UI.
5. Prove factory pairing/disposal/default compatibility and actual owned HTTPS
   to nonowner PG for three rejection branches, real privilege outage403,
   spoofed forwarded IP ignored and unchanged domain/preparation/ledger state.
6. Run focused/full regressions and current exact-source PG manifest/cleanup,
   preserve failures and write/start next gate. Long-outage operator reconciliation,
   production retention/reader purpose, actual IdP/human PoP/D1..D6 and previous
   Session latency root cause remain unresolved. No runtime deployment or commit.
