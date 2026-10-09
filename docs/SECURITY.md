# Highpass 보안 기준 문서

상태: **MVP 기술시험 기준 / 운영 승인 아님**
기준일: 2026-09-12

## Highpass v3 target security requirements

[Highpass v3 Security Requirements](security/highpass-v3-security-requirements.md)를 목표 보안 요구사항 기준으로 사용한다. 아래 내용은 현행 v2.1 로컬 MVP의 통제 요약이며 v3 PatientMapping·ExchangeSession·TransferGrant·Cloud Exchange·Provenance·Tenant 전 범위의 구현 완료를 뜻하지 않는다.

## 보안 경계

2026-10-07 DPoP 후속: legacy DICOMweb bound token은 cnf.jkt·매 요청 proof·ath·원자적
PostgreSQL 공유 replay ledger를 검증한다. 외부 forwarded/fingerprint 헤더는 인증되지 않으면
정책 정체성으로 사용하지 않는다. strict synthetic profile과 기본 Bearer 호환 profile을 구분한다.
ledger에는 hash/expiry만 보관하며 DB 원자적 claim, 200초 TTL, 30초 clock guard를 사용한다.
저장소 실패는 503 fail-closed이고 메모리 fallback하지 않는다. JSON 호환 저장소/프로세스
Map은 재시작 보호가 없다. 공유 replay 컴포넌트 검증을 전체 API HA나 실제 IdP로 해석하지 않는다.
최신 적용 범위·시험·독립 검토: [실행 기록](governance/highpass-v3-p0-execution-2026-10-07.md).

- Control Plane은 인증 주체, 동의, RBAC+ABAC 정책, 단기 토큰, 최소 메타데이터, 감사로그를 관리합니다.
- Data Plane/Gateway는 승인된 DICOMweb 요청만 PACS/Orthanc로 전달합니다.
- 브라우저는 PACS/Orthanc에 직접 접근하지 않습니다.
- 모든 중요 허용행위는 서버 측에서 정책을 재검증하고 감사로그를 남깁니다.
- 동의·토큰·기관·사용자·Study/Series 범위가 하나라도 맞지 않으면 Fail Closed 합니다.

## 현재 통제와 한계

| 통제 | 현재 상태 |
|---|---|
| RBAC+ABAC·동의·단기 토큰 | 코드 및 자동시험 확인 |
| 토큰 원문 저장 금지 | digest 기반 구현 확인 |
| 감사 Hash Chain·이상행위 | 로컬 MVP 시험 확인 |
| TLS/mTLS | 구성·fixture 존재, 최신 Compose E2E 재검증 필요 |
| 실제 IdP/MFA | 미검증·외부 자원 필요 |
| KMS/HSM·WORM/SIEM·DR | 미검증·운영 전 필수 |
| 실제 PACS·모바일 Vault | 미검증 또는 미구현 |

상세 기존 문서는 [보안 위협모델](security/threat-model.md), [DICOM 접근 흐름](security/dicom-access-flow.md), [운영 준비도](security/production-readiness.md)를 참조합니다.

## Azure capstone key protection preparation — 2026-10-08

`src/azure-key-vault-data-plane.js` is a Gateway-only protocol component for version-pinned
Azure Key Vault RSA-OAEP-256 wrapKey/unwrapKey (REST2025-07-01). It is NOT wired into
the Control API, the reference-only mobile rewrap contract, or a public unwrap route.
No raw DEK is returned from its public methods or consumer return value. Buffers are
cleared after synchronous consumer completion/error; immutable JavaScript strings and
runtime/network-library copies cannot be claimed as comprehensively zeroized.

Required injected server-side authorizer must check CURRENT consent, patient approval,
institution/clinician, ticket/scope/expiry and the persisted package/envelope hash binding.
The component rechecks authority after unwrap latency; this callback contract is not
proof that production policy integration exists. Tests use synthetic authorization and
local RSA protocol fixtures, not real Azure. Managed identity token acquisition,
durable envelope storage/audit, restricted RBAC, runtime gateway wiring and live cloud
positive/negative tests remain NOT VERIFIED. Consumer is synchronous-only; integrating
with the existing asynchronous transient decrypt flow is a separate reviewed change.

Transport pins versioned vault.azure.net keys, does not follow redirects, verifies TLS,
limits response bytes and deadlines, and sanitizes errors. No fallback local KEK or
security bypass is added. Declared demo budget is USD100, not enforced by this module.

Sources: [Azure wrapKey](https://learn.microsoft.com/en-us/rest/api/keyvault/keys/wrap-key/wrap-key?view=rest-keyvault-keys-2025-07-01)
and [Azure unwrapKey](https://learn.microsoft.com/en-us/rest/api/keyvault/keys/unwrap-key/unwrap-key?view=rest-keyvault-keys-2025-07-01).
Related requirements: FR-014~FR-020 (required authorization boundary), FR-026~FR-031
(Gateway boundary); this preparation alone does not satisfy those FR end-to-end.

Latest scoped run: 29/29 local tests PASS, exit0. CLI2.91.0 installed and executable;
CLI account list returned empty before the login attempt. Owned device authentication
attempt terminated at its 180-second deadline. Subscription/credit/quota/resource
creation/Key Vault operations/VM connectivity/cloud Viewer E2E remain NOT VERIFIED.
New technical work is DRAFT / UNASSIGNED; no certification or production readiness claim.

### Azure live provisioning checkpoint — 2026-10-08 (supersedes login snapshot above)

User confirmed use of the authenticated Azure for Students subscription. CLI account
and ARM subscription state Enabled, AzureForStudents offer and spendingLimit On were
read back. Provider registration for Microsoft.KeyVault completed; Compute/Network
were already Registered. Original CLI provider reads returned excessive metadata;
the preflight now projects namespace/registrationState without raising output bounds.
Scoped preflight tests 7/7 PASS. Live preflight is NOT VERIFIED overall, not deployment PASS.

Azure policy allowed locations: japaneast, centralindia, malaysiawest, southeastasia,
eastasia. Korea Central Key Vault creation was actually rejected with
RequestDisallowedByAzure; no vault was created there. No policy exemption or spending
limit removal was performed. Synthetic-only demo placement moved to Japan East.

Created and read back:

- Resource group `rg-highpass-capstone-20261008`: Succeeded; group metadata Korea Central,
  which does not determine contained resource location.
- Vault `kv-hp-demo-4869edd9`: Japan East, Standard, Succeeded; RBAC true,
  publicNetworkAccess Disabled, network defaultAction Deny, bypass None,
  soft-delete retention 7 days. Initially RegisteringDns, subsequently Succeeded.
- Tags project=highpass, environment=capstone, expiresOn=2026-10-16. These are metadata,
  NOT a scheduler or automatic deletion guarantee.

No key, secret, data-plane role assignment, VM or personal clinical data was created.
No raw key/token was printed or stored in project evidence. CLI no-wait creation
returned no JSON and the strict JSON helper reported exit2/ACK NOT VERIFIED; the
subsequent exact resource GET, not that exit code, established creation success.
Future write orchestration must handle empty successful acknowledgments explicitly.

Japan East quota read: total regional vCPU6, B-series vCPU4, current usage0.
SKU availability checks for Korea Central timed out at their finite CLI deadlines;
this is NOT proof of capacity or availability in Japan East. VM creation remains pending.
Retail Prices API quote: Linux Consumption B1ms USD0.0272/hour, B2s USD0.0544/hour
in Japan East. Candidate 2xB1ms+1xB2s consumes 4 B-series vCPUs and computes to
USD18.2784 for 168 hours, compute ONLY. Disk/IP/network/monitoring costs, actual student
credit balance and workload sizing remain NOT VERIFIED. Declared cap USD100 is not
equivalent to a full remaining credit balance or automated budget enforcement.

Next: confirm remaining credit and full cost estimate, subnet/private access design,
managed identities and least-privilege per-Gateway key operations, then key generation
and actual wrap/unwrap plus DENY tests. Do not open default network access to make a
test pass. Existing local client tests do not certify this live vault's encryption,
policy integration, audit integration, VM networking, Viewer or overall MVP completion.
Live checkpoint is DRAFT / UNASSIGNED.
