# Monitoring and Alerting

## Signals

| Signal | Severity | Source |
|---|---|---|
| API unavailable | P1 | `/api/health` |
| PostgreSQL unavailable | P1 | `/api/health`, container health |
| Orthanc unavailable | P1 | Gateway DICOMweb response |
| mTLS proxy unavailable | P1 | Gateway `ORTHANC_UNAVAILABLE` |
| Authentication failures | P2 | AuditLog |
| Authorization denies spike | P2 | AuditLog anomaly rules |
| Audit hash missing/failure | P1 | Audit integrity checks |
| Certificate expires <= 7 days | P2 | `pnpm run ops:expiry` |
| Certificate expired | P1 | `pnpm run ops:expiry` |
| Risk exception expires soon | P2 | `pnpm run ops:expiry` |
| Risk exception expired | P1 | Container Gate |

## Commands

```bash
pnpm run ops:expiry
pnpm run security:network
pnpm run security:readiness
pnpm run security:container
docker compose ps
```

`ops:expiry` reports vulnerability exception and test certificate expiry without reading private keys.

## Independent Backend Validation

`pnpm run ops:monitor` starts an independent local alert receiver process, evaluates runtime health plus certificate/risk expiry signals, emits synthetic auth/audit/authorization alerts, and verifies delivery to the receiver.

Latest result:

- Backend: `independent-node-alert-receiver`
- Alert delivery: `PASS`
- Alerts delivered: 10
- External human notification channel: `NOT VERIFIED`

This is a test observability backend, not a production monitoring SaaS or enterprise NOC integration.
