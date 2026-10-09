# Highpass v3 Security Requirements

## Lifecycle authority clarification — 2026-10-08

IAM-004/TEN-001..003/AUTH-001..004/GRT-001..003 require separate server-verified
patient approval and institution participation. A supplied ACTIVE state/evidence digest
is not verified consent. [Dependency contract](../api/highpass-v3-lifecycle-dependency-contract.md)
defines proposed privacy projections and current-authority checks. Revocation committed
in DB precedes stale ALLOW/Grant; outbox enqueue is not downstream acknowledgement.
D1..D4 proposals/D5 sequencing were user-approved by 김범희2026-10-08; D6 testing
is authorized but technical result NOT VERIFIED. See [decision record](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md).
No clinical/maintenance runtime privileges are granted by that policy decision.

문서 버전: `v3.0-DRAFT-BASELINE`
기준일: 2026-09-12
상태: **SECURITY REQUIREMENTS / REVIEW REQUIRED**

이 문서는 [Highpass v3 Requirements](../requirements/highpass-v3-requirements-definition.md)의 보안 요구사항을 독립적으로 동결한다. 범위와 우선순위는 [Capstone MVP Boundary](../baseline/CAPSTONE-MVP-BOUNDARY.md), 요구사항·위협·통제·시험 연결은 [Highpass v3 Traceability Matrix](../traceability/highpass-v3-traceability-matrix.md)를 따른다. DICOM PS3.15는 보안 메커니즘 참고 기준이며, 이 문서만으로 PS3.15·PIPA·ISMS-P 준수를 주장하지 않는다.

표의 `P0`, `P1`, `P2`는 각각 `CAPSTONE-P0`, `CAPSTONE-P1`, `POST-MVP`의 호환 축약이다. 실제 IdP/KMS/PACS/병원망/법률검토의 `BLOCKED-EXTERNAL`은 Productionization 상태이며 Capstone P0 blocker가 아니다.

## 1. Security objectives

1. 잘못된 환자·기관·의료진·목적·영상 범위로의 접근과 편입을 차단한다.
2. 영상과 키의 기밀성·무결성·가용성·책임추적성을 유지한다.
3. Control, Imaging, Key, Edge Plane의 권한과 데이터를 분리한다.
4. 모든 정책은 fail closed하고 우회 경로를 제공하지 않는다.
5. 실제 운영 통제와 로컬 합성 기술증적을 구분한다.

## 2. Security requirements

### 2.1 Identity, authentication and tenant isolation

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-IAM-001 | 사람 사용자는 검증된 issuer/audience/expiry/signature와 명시 role/hospital claim으로 인증해야 한다. | P0 | invalid JWT matrix | IMPLEMENTED-LOCAL; actual IdP blocked |
| V3-SR-IAM-002 | service/connector는 사용자 token과 분리된 workload identity와 mTLS를 사용해야 한다. | P0 | cert identity negatives | PARTIAL |
| V3-SR-IAM-003 | Capstone은 test MFA assurance claim의 fail-closed 경계를 검증하고, Production은 실제 IdP MFA assurance를 요구해야 한다. | P0 | mock amr/acr negative; production integration gate | PARTIAL local; production IdP BLOCKED-EXTERNAL |
| V3-SR-IAM-004 | Patient principal은 서버가 PatientRef에 bind하고 요청 body의 patient ID를 신뢰하지 않아야 한다. | P0 | foreign patient negative | IMPLEMENTED-LOCAL PHR scope |
| V3-SR-TEN-001 | 모든 query/mutation은 tenant+hospital+resource ownership을 검증해야 한다. | P0 | cross-tenant CRUD matrix | PARTIAL |
| V3-SR-TEN-002 | tenant context 누락·불일치·ambiguous mapping은 DENY해야 한다. | P0 | missing/mismatch negatives | PARTIAL |
| V3-SR-TEN-003 | RLS/DB role은 defense-in-depth 최소권한을 적용하고 cross-tenant join을 차단해야 한다. | P0 | PostgreSQL RLS gate | PARTIAL |

### 2.2 Consent, authorization and grant

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-AUTH-001 | Consent, AuthorizationDecision, TransferGrant를 타입·저장·수명주기에서 분리해야 한다. | P0 | contract review | PARTIAL |
| V3-SR-AUTH-002 | 정책은 role/hospital/patient/purpose/scope/action/time/consent/session을 AND로 평가해야 한다. | P0 | single-failure matrix | IMPLEMENTED-LOCAL current flow |
| V3-SR-AUTH-003 | DENY reason은 감사에는 구체적으로, UI에는 내부정보 없이 안전하게 표시해야 한다. | P0 | API/UI error test | PARTIAL |
| V3-SR-AUTH-004 | 철회·만료·상태변경은 캐시된 ALLOW보다 우선하며 신규 access/key release를 차단해야 한다. | P0 | stale authorization test | PARTIAL |
| V3-SR-GRT-001 | grant는 최소 resource/action/recipient와 짧은 TTL, issuer/audience/jti를 가져야 한다. | P0 | claim/scope tests | PARTIAL |
| V3-SR-GRT-002 | grant 원문은 지속 저장하지 않고 hash/jti/status만 저장해야 한다. | P0 | DB/log inspection | PARTIAL |
| V3-SR-GRT-003 | 위변조·재사용·audience/recipient/scope mismatch·expiry는 전부 DENY와 감사로 끝나야 한다. | P0 | negative/replay suite | IMPLEMENTED-LOCAL legacy DICOMweb + PostgreSQL shared replay; scoped verdicts in latest execution record; full API HA and v3 grants NOT VERIFIED |

### 2.3 Patient safety and DICOM boundary

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-PAT-001 | PatientMapping이 불명확하거나 충돌이면 PACS_IMPORT를 차단해야 한다. | P0 | mapping negative | NOT IMPLEMENTED |
| V3-SR-PAT-002 | destination import 전 patientRef↔local patient, Study UID, SOP Class/Transfer Syntax를 preflight해야 한다. | P0 | capability/mapping fixture | NOT IMPLEMENTED |
| V3-SR-DICOM-001 | PACS/Orthanc는 public port로 노출하지 않고 Connector/Gateway identity만 허용해야 한다. | P0 | network/mTLS negative | IMPLEMENTED-LOCAL |
| V3-SR-DICOM-002 | DICOMweb 매 요청은 grant scope를 재검증하고 전체 Study 과다조회·범위 확대를 차단해야 한다. | P0 | QIDO/WADO negative | IMPLEMENTED-LOCAL/partial multi-Study |
| V3-SR-DICOM-003 | STOW/C-STORE는 explicit import grant와 idempotency, object별 receipt를 요구해야 한다. | P0 | import/retry/partial suite | NOT IMPLEMENTED |
| V3-SR-DICOM-004 | transcoding은 allowlist와 provenance 없이는 금지하며 동일 UID만으로 무결성을 승인하지 않아야 한다. | P0 | transcode negative | NOT IMPLEMENTED |

### 2.4 Cryptography and key management

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-CRY-001 | payload는 승인된 AEAD와 CSPRNG key/nonce를 사용하고 동일 key에서 nonce를 재사용하지 않아야 한다. | P0 | roundtrip/vector/nonce/tamper | IMPLEMENTED-LOCAL domain |
| V3-SR-CRY-002 | DEK와 KEK를 분리하고 raw DEK를 Control DB, API, log, receipt에 반환하지 않아야 한다. | P0 | key boundary/secret scan | IMPLEMENTED-LOCAL contract |
| V3-SR-CRY-003 | key operation은 package/recipient/purpose/grant/expiry/version에 bind해야 한다. | P0 | mismatch/replay tests | IMPLEMENTED-LOCAL domain |
| V3-SR-CRY-004 | Capstone KMS adapter 장애와 Production KMS 장애는 fail closed하고 검증되지 않은 fallback을 사용하지 않아야 한다. | P0 | unavailable provider test | IMPLEMENTED-LOCAL contract; production KMS BLOCKED-EXTERNAL |
| V3-SR-CRY-005 | algorithm/key/provider version과 rotation/disable/destroy 상태를 감사해야 한다. | P0 | rotation/state tests | PARTIAL |
| V3-SR-CRY-006 | custom cryptography와 TLS 인증 우회 옵션을 금지해야 한다. | P0 | dependency/config scan | IMPLEMENTED policy |

### 2.5 Payload, storage and deletion

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-DATA-001 | Control metadata, encrypted medical payload, key material을 논리·권한·저장에서 분리해야 한다. | P0 | data-flow/access test | PARTIAL |
| V3-SR-DATA-002 | object storage/relay에는 ciphertext만 존재하고 object ownership과 tenant prefix를 검증해야 한다. | P0 | storage spy/cross-tenant test | NOT IMPLEMENTED |
| V3-SR-DATA-003 | manifest/chunk/package hash와 AEAD tag 실패는 즉시 quarantine/DENY하고 자동 재시도하지 않아야 한다. | P0 | tamper suite | IMPLEMENTED-LOCAL domain |
| V3-SR-DATA-004 | retention 만료·철회·완료 cleanup은 idempotent delete, key disable/destroy, deletion receipt를 수행해야 한다. | P0 | time-travel/lifecycle test | PARTIAL domain |
| V3-SR-DATA-005 | legal hold 또는 승인 보존정책과 자동삭제 충돌을 명시적으로 해결해야 한다. | P0 | policy conflict test | PARTIAL existing retention |

### 2.6 Transport, application and API security

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-NET-001 | 외부/API/DICOMweb은 TLS, service-to-service는 요구 경계에서 mTLS를 사용해야 한다. | P0 | TLS positive/negative | IMPLEMENTED-LOCAL partial topology |
| V3-SR-NET-002 | certificate chain, hostname/SAN, EKU, expiry, trust anchor를 모두 검증해야 한다. | P0 | missing/untrusted/expired/mismatch | IMPLEMENTED-LOCAL |
| V3-SR-NET-003 | connect/read/operation/polling timeout을 유한하게 하고 DNS/refused/TLS/timeout/policy 오류를 구분해야 한다. | P0 | fault injection | PARTIAL |
| V3-SR-API-001 | 모든 입력은 type/size/UID/enum/pagination/idempotency를 server-side 검증해야 한다. | P0 | malformed/boundary suite | PARTIAL |
| V3-SR-API-002 | SQL parameter binding과 framework escaping을 유지하고 innerHTML/raw SQL 결합을 금지해야 한다. | P0 | SAST/code review | IMPLEMENTED-LOCAL current paths |
| V3-SR-API-003 | error/UI/log는 stack, endpoint credential, cert path, token, key, raw PHI를 노출하지 않아야 한다. | P0 | leak pattern scan | PARTIAL |
| V3-SR-VIEW-001 | Viewer token은 URL/localStorage에 두지 않고 no-store와 expiry 후 재인가를 적용해야 한다. | P0 | browser/network/storage trace | PARTIAL |

### 2.7 Audit, detection and operational security

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-AUD-001 | 중요 ALLOW/DENY와 상태변경은 최소 PHI audit event를 남겨야 한다. | P0 | event coverage | PARTIAL |
| V3-SR-AUD-002 | 중요 허용행위에서 audit/outbox 실패 시 rollback 또는 승인된 durable queue를 사용해야 한다. | P0 | audit failure injection | PARTIAL |
| V3-SR-AUD-003 | audit는 append-only, hash/integrity 검증, 역할·tenant 제한 조회를 제공해야 한다. | P0 | mutation/hash/RBAC tests | IMPLEMENTED-LOCAL |
| V3-SR-DET-001 | bulk access/download, repeated deny/expired token, cross-hospital, replay, key/integrity failure를 탐지해야 한다. | P0 | rule fixtures | PARTIAL |
| V3-SR-OPS-001 | production secret은 secret manager/KMS를 사용하고 기본값·placeholder로 시작하지 않아야 한다. | P0 | startup/secret scan | PARTIAL; external blocked |
| V3-SR-OPS-002 | dependency/image는 version/digest 고정, 취약점·SBOM gate와 승인 예외 만료를 가져야 한다. | P0 | supply-chain gates | PARTIAL |
| V3-SR-OPS-003 | backup/restore/DR에서 tenant·ciphertext·key separation과 복구 후 auth를 검증해야 한다. | P2 | rehearsal | BLOCKED-EXTERNAL |

### 2.8 Mobile Secure Vault — P1

| ID | Security requirement | P | Verification | Current |
|---|---|---:|---|---|
| V3-SR-MOB-001 | device private key는 hardware-backed/non-exportable storage를 사용해야 한다. | P1 | device attestation/key export | BLOCKED-EXTERNAL |
| V3-SR-MOB-002 | valid capsule+original device+valid user auth 조합에서만 decrypt해야 한다. | P1 | device-binding positives/negatives | PARTIAL domain |
| V3-SR-MOB-003 | backup/share/gallery/external URI와 다른 device copy는 DENY해야 한다. | P1 | platform tests | PARTIAL domain |
| V3-SR-MOB-004 | rooted/jailbroken/lost/revoked/outdated device의 package/key release 정책을 fail closed 해야 한다. | P1 | risk/lifecycle tests | PARTIAL domain |
| V3-SR-MOB-005 | 화면 capture/overlay 위험은 플랫폼별 정책·제한·잔여위험으로 기록해야 한다. | P1 | device UI tests | NOT IMPLEMENTED |
| V3-SR-MOB-006 | Offline lease는 제한된 기간·scope·device 상태·clock rollback 방어와 재연결 검증을 가져야 한다. | P2 | offline expiry/clock/reconnect tests | NOT IMPLEMENTED |

## 3. Mandatory negative scenarios

다음은 P0 security acceptance에서 누락할 수 없다.

- no/malformed/expired/withdrawn Consent
- wrong actor role/hospital/tenant/patient/purpose/action/Study/Series/Instance
- tampered/expired/replayed/wrong-audience Grant
- ambiguous/unverified PatientMapping before PACS_IMPORT
- unsupported destination/SOP Class/Transfer Syntax and expired preflight
- ciphertext/manifest/chunk/receipt modification
- no/untrusted/expired/wrong-SAN client certificate
- direct PACS/Orthanc bypass
- token/key/PHI exposure in URL, browser storage, UI, logs, evidence
- KMS/PACS/object store/audit failure without fail-open
- stale temporary object after lifecycle deadline

## 4. Security completion gate

현재 판정: **PARTIAL — DOCUMENT COMPLETE, REVIEW/APPROVAL AND TEST EVIDENCE PENDING**

완료 조건:

1. 모든 P0 V3-FR이 최소 한 개 V3-SR 또는 명시적 `N/A-security`에 연결된다.
2. 모든 V3-SR에 verification method와 acceptance test ID가 있다.
3. Critical threat(Patient mis-match, cross-tenant, unauthorized PACS import, key exposure, payload tamper)의 risk owner가 지정된다.
4. 실제 IdP/KMS/PACS/병원망 항목은 제공 전 `BLOCKED-EXTERNAL`로 유지하되 Capstone P0 blocker로 집계하지 않는다.
5. Security reviewer가 예외 없이 승인하거나 만료일·owner·대체통제를 가진 예외를 승인한다.
