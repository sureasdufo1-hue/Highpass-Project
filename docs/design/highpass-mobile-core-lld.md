# Highpass Mobile-Core Low-Level Design

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> Mobile-Core 신규 구성요소는 `[구현 예정]`; 기존 정책·DICOMweb·감사 일부만 `[부분 구현]`이다.

## 1. 기준선과 조사결과

현재 API는 무버전 경로, Node `http` 서버, `pg` 직접 query, 내장 DDL을 사용한다. ORM·migration runner는 없다. Compose의 PostgreSQL image가 실행 기준이며 정확한 운영 버전은 `[검증 필요]`다. 기존 endpoint는 `/api/consents`, `/api/imaging-studies`, `/api/dicom-access/request`, `/api/policies/access-check`, `/api/hospitals/{id}/gateway`, QIDO/WADO 일부, `/gateway/token/introspect`, `/gateway/audit`다. 테스트는 Node test runner와 `*.test.js`, 스크립트 기반 E2E/보안 gate를 사용한다.

본 설계는 `/api/v1` facade를 추가하되 기존 경로를 제거하지 않는다. PostgreSQL에는 Pixel Data, 평문 DEK, Token 원문을 신규 저장하지 않는다. 기존 token 원문 컬럼은 별도 migration으로 단계적으로 제거한다.

## 2. 논리 아키텍처와 신뢰경계

```text
[A Trust Zone] PACS─mTLS─A Edge{Adapter,Builder,Manifest,Encrypt}
                         │ ciphertext
[Mobile Semi-Trust] App{Binding,Vault,Package,QR,Approval,Transfer,Delete}
                         │ ciphertext + one-time grant
[B Trust Zone] B Edge{Receiver,Verify,Unwrap,DICOM Adapter}─{OHIF | PACS}
          ▲              ▲
          │ control/mTLS │ key authorization
[Cloud Control] Identity,Consent,Policy,Handoff,Token,Device,Institution,KeyAuth,Audit
[Optional Data Plane] ciphertext Relay/cache TTL 5~30m (not default)
```

브라우저는 B Edge만 접근한다. A/B PACS, A Edge, KMS, Audit는 public Internet에서 직접 접근할 수 없다. Control Plane은 metadata/state만 보유한다.

## 3. 컴포넌트 상세

| 영역·컴포넌트 | 책임 / 입력→출력 | 호출·저장 | 인증·경계·오류·감사 | P/상태 |
|---|---|---|---|---|
| A PACS/Orthanc | 승인 DICOM QIDO/WADO 제공 | DICOMweb; 원본 | A Edge mTLS만; PACS_* | P0 `[부분]` |
| A Edge Gateway | scope 강제·orchestration | Control, PACS, KMS; temp only | workload mTLS; fail closed; EDGE_* | P0 `[예정]` |
| DICOMweb Adapter A | UID 검증·QIDO/WADO 변환 | PACS endpoint | cert/timeout, 표준오류; DICOM_* | P0 `[부분]` |
| Package Builder | snapshot object/chunk 구성 | PKG API; temp | size/count bound; PACKAGE_CREATED | P0 `[예정]` |
| Encryption Module | AES-256-GCM, unique nonce/AAD | KMS handle; no key persistence | tag failure terminal; PACKAGE_ENCRYPTED | P0 `[예정]` |
| Manifest Generator | deterministic protected manifest/hash | Schema/CBOR; encrypted object | canonical validation; MANIFEST_* | P0 `[예정]` |
| Identity Broker | OIDC/PKCE/MFA/claims | IdP/session | issuer/aud/nonce; AUTH_* | P0 `[부분]` |
| Consent Service | action별 동의·상태/version | consents/scopes | patient reauth; CONSENT_* | P0 `[부분]` |
| Policy Engine | RBAC+ABAC AND decision | consent/token/device/context | deny default; POLICY_* | P0 `[부분]` |
| Handoff Broker | B session·Ticket CAS | handoff tables | B MFA+patient approval; HANDOFF_* | P0 `[예정]` |
| Token Service | typed grant, hash/jti/revoke | session/ticket tables | short TTL/aud/scope; TOKEN_* | P0 `[부분]` |
| Institution Service | tenant/Gateway/cert binding | institution/gateway | admin MFA/mTLS; INSTITUTION_* | P0 `[부분]` |
| Device Registry | registration/key/risk/block | device tables | proof/attestation; DEVICE_* | P0 `[예정]` |
| Key Auth Service | one-time B rewrap authorization | policy+KMS refs | mTLS, dual condition; KEY_RELEASE_* | P0 `[예정]` |
| Audit Service | append/hash/search/integrity | audit store | service mTLS/admin MFA; failure blocks critical action | P0 `[부분]` |
| Service Discovery | active Gateway endpoint/cert | gateway registry | signed registry; DISCOVERY_* | P0 `[부분]` |
| Cache Manager | optional ciphertext TTL deletion | object ref/cache table | no plaintext; CACHE_DELETE_* | P0 fallback `[예정]` |
| Mobile App | patient flow shell | Control/B Edge | OIDC+device reauth; UI safe errors | P0 `[예정]` |
| Device Binding | hardware key/proof | DEV APIs/keystore | private key non-export; DEVICE_AUTH | P0 `[예정]` |
| Secure Storage | ciphertext-only Vault | package files | backup/share disabled; VAULT_* | P0 `[예정]` |
| Package Manager | chunk download/status/expiry | PKG APIs/Vault meta | hash/checkpoint; PACKAGE_* | P0 `[예정]` |
| QR Scanner | issuer/deeplink/opaque Ticket | HOF scan | allowlist/no PHI; QR_* | P0 `[예정]` |
| Approval Module | safe B/purpose/scope + consent | HOF approval | biometric/PIN; APPROVAL_* | P0 `[예정]` |
| Transfer Client | resumable ciphertext upload | GW upload | transfer token/idempotency; UPLOAD_* | P0 `[예정]` |
| Mobile Integrity | envelope/chunk hash precheck | manifest/chunks | no decrypt required; INTEGRITY_* | P0 `[예정]` |
| Deletion Handler | expiry/revoke/lost delete | PKG delete/receipt | crypto erase; DELETE_* | P0 `[예정]` |
| B Frontend | MFA session/handoff/status | Control/B Edge | browser→B Edge only; UI audit | P0 `[예정]` |
| B Edge Gateway | receive/verify/unwrap/serve | GW/KMS/DICOM | workload mTLS; no bypass; B_EDGE_* | P0 `[예정]` |
| Package Receiver | chunks/checkpoints/receipt | encrypted temp | quotas/idempotency; RECEIVER_* | P0 `[예정]` |
| Integrity Verifier | manifest/count/hash/GCM tag | package/schema | failure quarantine; VERIFY_* | P0 `[예정]` |
| Key Unwrap Module | B envelope unwrap in trust zone | KMS/HSM | raw DEK transient; KEY_UNWRAP_* | P0 `[예정]` |
| OHIF Reference Viewer | scoped Remote Viewing | B Edge DICOMweb | short token/no URL secret; VIEW_* | P0 `[부분]` |
| B PACS | optional imported copy | STOW/C-STORE | B responsibility; PACS_* | P0 decision `[검증]` |
| STOW/C-STORE Adapter | idempotent import/receipt | PACS | mTLS/import token; partial result | P1 or approved P0 `[예정]` |

## 4. 저장·암호화·Key Envelope

Public Envelope는 version/package/cipher/chunk/size/time/destination ref와 encrypted-manifest flag만 포함한다. patient·질병·모든 DICOM UID·key·token은 금지한다. Protected Manifest는 consent/patient pseudonym/institutions/purpose와 Study→Frame snapshot, object/chunk hashes, encryption refs를 포함해 암호화한다.

KMS가 package별 DEK를 생성한다. A Edge는 transient handle로 AES-256-GCM을 수행하고 `(DEK,nonce)` 중복을 거부한다. device 공개키와 KMS escrow용 envelope를 만들고, Handoff 승인 후 Key Auth가 전체 정책을 검증하면 KMS가 B Gateway용 envelope로 재래핑한다. Control/mobile에는 raw DEK가 없다. B private key는 B KMS/HSM이 보호한다.

## 5. 호출·상태·일관성

- Handoff: B MFA→session/Ticket→mobile scan→patient approve→policy→transfer token→cipher upload→verify→key authorization→unwrap→view/import→receipt+Ticket atomic consume→mobile delete.
- Token 상태: CREATED→ISSUED→SCANNED→PATIENT_APPROVED→AUTHORIZED→CONSUMED. EXPIRED/REVOKED/REJECTED terminal, 재사용은 REPLAY_BLOCKED 사건이다.
- Package 상태는 Schema enum 15개를 사용한다. 상태전이는 `If-Match`, transaction/CAS, outbox로 기록한다.
- retry는 retryable 오류와 idempotency key가 있는 작업만 허용한다. chunk는 `(upload,number,hash)`로 중복을 판정한다.
- 감사 write와 상태변경의 원자성은 transactional outbox로 보장한다. 중요 허용행위에서 audit/outbox 실패 시 rollback한다.

## 6. DICOMweb·PACS

QIDO Study/Series/Instance와 WADO Instance/Frame을 분리하고 매 요청 token scope를 검사한다. Study 전체 snapshot은 이후 추가된 object를 자동 포함하지 않는다. Viewer는 On-demand Retrieval과 Progressive Loading을 사용한다. DOWNLOAD와 PACS_IMPORT는 VIEW와 별도다. STOW-RS를 우선하고 legacy C-STORE는 B Edge 내부 adapter로 한정한다.

## 7. 네트워크·운영·모니터링

TLS/mTLS는 hostname/SAN/EKU/chain/expiry를 검증한다. timeout은 connect 3s, service 10s, DICOM/object operation별 상한 `[성능검증 필요]`; 무한 polling 금지다. 지표는 policy deny, auth/MFA failure, Ticket replay, device risk, package throughput/failure, key release deny, PACS/Relay latency, cache overdue, audit chain failure다. label에는 patient/UID/token을 넣지 않는다.

경보는 반복 DENY/replay, 기관 mismatch, bulk access, integrity/key/audit failure, cache TTL 초과, cert expiry다. 로그는 secret/PHI redaction과 trace/audit correlation을 적용한다.

## 8. 삭제·장애·복구

Relay cache 5~30분, Edge plaintext 처리시간, mobile 별도 보존기간을 구분한다. 동의철회/기기분실/만료는 token·Ticket·key authorization을 즉시 차단하고 온라인 단말은 삭제한다. 오프라인은 cryptographic erasure 후 연결 시 receipt를 생성한다. B PACS 편입본은 B 보존정책 책임이다.

DNS·refused·TLS·timeout·PACS/Relay/KMS/audit 장애와 policy DENY를 별도 code로 분류한다. 장애 시 PACS 직접우회, TLS 완화, stale authorization 사용을 금지한다.

## 9. 산출물 연결과 추적성

| 흐름 | 정책/FR | API | DB | Schema | 시퀀스 | 구현/시험 |
|---|---|---|---|---|---|---|
| 동의 | POL-CONSENT/FR-CONSENT | consent ops | consents_v3/scopes | manifest consent ref | Handoff | WBS-04/SEC-CONSENT |
| 기기 | POL-DEVICE/FR-MOBILE | mobile-devices | devices/keys | key envelope recipient | Handoff/Key | WBS-05/SEC-DEVICE |
| 패키지·암호화·저장 | POL-PACKAGE/KEY | packages | package/manifests/chunks/envelopes | 4 JSON+4 CDDL | Key | WBS-06~08/SEC-PKG |
| QR Handoff | POL-QR/HANDOFF | handoffs/uploads | handoff/tickets/receipts | receipt | Handoff | WBS-09~10/SEC-QR/HOF |
| Key release·B decrypt | POL-KEY | key-release | key_envelopes/policy_decisions | key envelope | Key | WBS-11~12/SEC-KEY |
| Viewer/PACS | POL-REMOTE/PACS | DICOM/PACS import | remote_sessions/pacs_imports | receipt | Handoff | WBS-13~15/API-DCM/PACS |
| 만료·철회·삭제 | POL-LIFE | revoke/delete | revocations/deletions/cache | envelope state | both | WBS-16/SEC-LIFE |
| 감사 | POL-AUDIT | audit ops | audit/outbox/errors | receipt hashes | both | WBS-16/AUD-* |

## 10. 검증 상태

문서·Schema는 정적 검증 대상이다. OpenAPI parser, PostgreSQL migration dry-run, CDDL validator, JSON↔CBOR round-trip, KMS/IdP/PACS/모바일 종단, 외부 staging은 아직 `NOT VERIFIED`다. 어떠한 신규 Mobile-Core 기능도 구현 완료 또는 운영 준비로 판정하지 않는다.
