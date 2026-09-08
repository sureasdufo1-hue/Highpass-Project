# Highpass Mobile-Core 상세 인터페이스 및 데이터 명세서

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 계약 수준의 설계 기준이며 실제 병원 운영, 법률 적합성, 임상 진단 또는 구현 완료를 의미하지 않는다.

| 항목 | 내용 |
|---|---|
| 버전 | v1.0-DRAFT |
| 기준일 | 2026-09-01 |
| 기준선 | Mobile-Core 요구사항 v3.0, 업무흐름 v1.0, 정책서 v3.0-DRAFT |
| 산출물 경로 | `docs/design/highpass-mobile-core-detailed-interface-data-specification.md` |
| API 기준 | `/api/v1`, `/gateway/v1`, DICOMweb PS3.18 경로 |

## 1. 문서 목적과 범위

본 명세는 모바일 기기·동의·패키지·암호화·QR Handoff·Gateway·DICOMweb·Token·감사·삭제 계약을 LLD, 구현 및 시험의 입력으로 정의한다. 모든 예시는 합성 식별자만 사용한다. 모바일 저장·운반·Handoff는 P0, 완전 오프라인 직접전송·모바일 Viewer·PQC는 P1이다.

표기: `[기존 API]`, `[변경 필요]`, `[신규 설계]`, `[구현 예정]`, `[검증 필요]`. 기존 서버의 동의·정책·단기 DICOM access·QIDO/WADO·감사 기능은 `[기존 API]`, Mobile-Core 종단은 `[신규 설계][구현 예정]`이다.

## 2. 조사 결과와 호환성 기준

| 후보 | 저장소 확인 | 판정·변경 영향 |
|---|---|---|
| `POST/GET /api/consents`, revoke | `src/server.js`에 존재 | `[기존 API][변경 필요]`: v1 별칭 유지, 행위별 동의·상태·version 추가 |
| `GET /api/imaging-studies` | 존재 | `[기존 API]`: patient scope·Series 응답 유지 |
| `POST /api/dicom-access/request` | 존재 | `[기존 API][변경 필요]`: typed Remote View Token과 aud/jti/hash 도입 |
| `POST /api/policies/access-check` | 존재 | `[기존 API]`: Mobile ABAC 입력 확장 |
| `GET /api/hospitals/{id}/gateway` | 존재 | `[기존 API]` |
| QIDO/WADO 경로 | Study/Series/Instance 조회 존재 | `[기존 API]`; Frame·STOW는 신규 |
| `/gateway/token/introspect`, `/gateway/audit` | 존재 | `[기존 API]`; mTLS·token hash·표준오류 강화 |
| Mobile/Package/Handoff/Key API | 없음 | `[신규 설계][구현 예정]` |
| PostgreSQL | patient/hospital/gateway/doctor/study/series/consent/scope/token/audit 존재 | Mobile-Core 엔터티 신규 migration 필요 |

호환성 원칙은 기존 경로를 삭제하지 않고 `/api/v1` facade로 이행하는 것이다. 기존 JSON 필드는 최소 한 개 버전 유지하고 deprecation header를 제공한다. 현재 `dicom_access_token_logs.token` 원문 저장과 unique index는 `token_hash`로 교체해야 한다. migration은 backfill→dual-read→원문 제거 순서이며 별도 승인 전 본 문서에서 코드를 변경하지 않는다.

## 3. 공통 API 계약

모든 API는 TLS 1.3을 목표로 하며 Gateway/workload 호출은 mTLS가 필수다. 사용자 API는 OIDC access token, 의료진·관리자는 MFA claim을 요구한다. `iss`, `aud`, `exp`, `nbf`, `jti`, scope, revocation을 검사한다.

### 3.1 공통 헤더

| 헤더 | 필수 | 규칙 |
|---|---|---|
| `Authorization: Bearer` | 보호 API | URL/query/log 금지, 올바른 audience |
| `X-Request-Id` | 권고/서버 생성 | UUID/ULID, 응답에 반영 |
| `traceparent` | 권고 | W3C trace, 민감값 금지 |
| `X-Audit-Session-Id` | 거래 API | 전체 흐름 상관관계 |
| `Idempotency-Key` | 상태생성·전송 | caller+endpoint+body digest에 바인딩, TTL `[결정 필요]` |
| `Content-Type` | body API | `application/json`, DICOM은 표준 media type |
| `If-Match` | 상태 변경 | resource version/ETag 낙관적 잠금 |

응답은 UTC RFC 3339 시간, opaque ID, 최소정보를 사용한다. rate limit 기본 목표는 사용자 write 30/min, read 120/min, Ticket 검증 10/min/device+IP, chunk는 동시 4개/package `[성능 검증 필요]`이다. `429`에 `Retry-After`를 반환한다.

### 3.2 표준 오류

```json
{
  "error": {
    "code": "TICKET_EXPIRED",
    "message": "The handoff ticket cannot be used.",
    "requestId": "req_01...",
    "auditSessionId": "aud_01...",
    "retryable": false
  }
}
```

내부 경로·stack·token·키·환자정보·리소스 존재 여부는 노출하지 않는다. HTTP는 400 형식, 401 미인증/invalid token, 403 정책거부, 404 비노출 리소스, 409 상태충돌/replay, 412 ETag, 413 크기, 422 무결성/의미검증, 429 제한, 502 PACS/Relay, 503 IdP/KMS/Gateway, 504 timeout을 사용한다.

## 4. API 카탈로그 및 상세 계약

아래 표의 각 행은 API 계약이다. 공통으로 API version v1, JSON, Request/Trace/Audit ID, 안전한 오류, 감사, deny-by-default를 적용한다. `I`는 idempotent, `R`은 안전 재시도다.

### 4.1 사용자·기관 인증 API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| AUTH-001 `[신규]` | POST `/api/v1/auth/login` | 사용자→IdP adapter | public+PKCE, no mTLS | redirect/context→302/authorization URL | AUTH_FAILED; LOGIN_STARTED; I:N/R:Y |
| AUTH-002 `[신규]` | GET `/api/v1/auth/callback` | IdP→Control | state+nonce+PKCE | code/state→session summary | OIDC_INVALID; LOGIN_RESULT; I:N/R:N |
| AUTH-003 `[신규]` | POST `/api/v1/auth/mfa/result` | IdP→Control | signed IdP event, mTLS | subject/amr→204 | MFA_REQUIRED/INVALID; MFA_RESULT; I:Y/R:Y |
| AUTH-004 `[신규]` | GET `/api/v1/me/institution` | 사용자→Control | OIDC, `profile:read` | none→institution/roles | INSTITUTION_MISMATCH; PROFILE_READ; I:Y/R:Y |
| AUTH-005 `[신규]` | GET `/api/v1/me/permissions` | 사용자→Policy | OIDC | resource context→effective actions | ACCESS_DENIED; PERMISSION_READ; I:Y/R:Y |
| AUTH-006 `[신규]` | POST `/api/v1/sessions` | 사용자→Control | OIDC+MFA | device/context→session | MFA_REQUIRED; SESSION_CREATED; I:key/R:Y |
| AUTH-007 `[신규]` | DELETE `/api/v1/sessions/{id}` | 사용자→Control | session owner | none→204 | SESSION_NOT_FOUND; SESSION_ENDED; I:Y/R:Y |
| AUTH-008 `[신규]` | POST `/api/v1/tokens/refresh` | 사용자→IdP | rotated refresh token | token→short access token | TOKEN_REUSED; TOKEN_REFRESH; I:N/R:N |
| AUTH-009 `[신규]` | POST `/api/v1/tokens/revoke` | 사용자/admin→IdP | OIDC/MFA | token ref→204 | TOKEN_INVALID; TOKEN_REVOKED; I:Y/R:Y |

### 4.2 환자·동의 API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| PAT-001 `[신규]` | POST `/api/v1/patient-refs` | 기관 service→Control | mTLS, `patient:tokenize` | local ref/context→patient_ref | IDENTITY_INVALID; PATIENT_REF_CREATED; I:key/R:Y |
| PAT-002 `[신규]` | POST `/api/v1/patient-refs/verify` | A clinician→Control | OIDC+MFA | proof/ref→verified summary | IDENTITY_MISMATCH; PATIENT_VERIFIED; I:Y/R:Y |
| CON-001 `[기존/변경]` | POST `/api/v1/consents` | A clinician/patient→Consent | OIDC+MFA, `CONSENT_CREATE` | institutions,purpose,actions,scope,validity→201 consent | CONSENT_SCOPE_INVALID; CONSENT_REQUESTED; I:key/R:Y |
| CON-002 `[기존/변경]` | GET `/api/v1/consents/{id}` | owner/authorized admin | OIDC | id→redacted consent | CONSENT_NOT_FOUND; CONSENT_VIEWED; I:Y/R:Y |
| CON-003 `[신규]` | POST `/api/v1/consents/{id}/approve` | patient/delegate | OIDC+device reauth | version,evidence→APPROVED | CONSENT_EXPIRED/VERSION_CONFLICT; CONSENT_APPROVED; I:key/R:Y |
| CON-004 `[신규]` | POST `/api/v1/consents/{id}/reject` | patient/delegate | OIDC+reauth | reasonCode→REJECTED | INVALID_STATE; CONSENT_REJECTED; I:key/R:Y |
| CON-005 `[기존/변경]` | POST `/api/v1/consents/{id}/revoke` | patient/delegate | OIDC+reauth | reason/version→REVOKED | ALREADY_REVOKED; CONSENT_REVOKED; I:key/R:Y |
| CON-006 `[신규]` | POST `/api/v1/consents/{id}/validate` | Policy/Edge | workload mTLS | action/context→ALLOW/DENY | POLICY_UNAVAILABLE; POLICY_DECISION; I:Y/R:Y |
| CON-007 `[신규]` | GET `/api/v1/consents/{id}/scopes` | owner/Policy | OIDC or mTLS | pagination→scopes | ACCESS_DENIED; CONSENT_SCOPE_READ; I:Y/R:Y |

### 4.3 모바일 기기 API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| DEV-001 `[신규]` | POST `/api/v1/mobile-devices` | patient app→Device | OIDC+reauth | platform,app,attestation,publicKey→201 device | DEVICE_INTEGRITY_FAILED; DEVICE_ENROLLED; I:key/R:Y |
| DEV-002 `[신규]` | PUT `/api/v1/mobile-devices/{id}/keys` | bound app→Device | device proof | JWK,keyAttestation→keyVersion | KEY_INVALID; DEVICE_KEY_ROTATED; I:key/R:Y |
| DEV-003 | GET `/api/v1/mobile-devices/{id}` | owner/admin | OIDC | id→status/risk/version | DEVICE_NOT_FOUND; DEVICE_STATUS_READ; I:Y/R:Y |
| DEV-004 | POST `/api/v1/mobile-devices/{id}/authenticate` | app→Device | nonce signature | nonce,signature→device grant | DEVICE_PROOF_INVALID; DEVICE_AUTH; I:N/R:Y |
| DEV-005 | POST `/api/v1/mobile-devices/{id}/revoke` | owner/admin | OIDC+reauth | reason→REVOKED | INVALID_STATE; DEVICE_REVOKED; I:key/R:Y |
| DEV-006 | POST `/api/v1/mobile-devices/{id}/lost` | owner/admin | OIDC+strong recovery | reason→BLOCKED | IDENTITY_UNVERIFIED; DEVICE_LOST; I:key/R:Y |
| DEV-007 | POST `/api/v1/mobile-devices/{id}/remote-block` | Security/Device svc | MFA/mTLS | incidentRef→BLOCKED | ACCESS_DENIED; DEVICE_BLOCKED; I:key/R:Y |
| DEV-008 | POST `/api/v1/mobile-devices/{id}/reenroll` | patient app | OIDC+recovery | new proof/key→new binding | OLD_KEY_REJECTED; DEVICE_REENROLLED; I:key/R:Y |
| DEV-009 | GET `/api/v1/mobile/app-policy` | app | app attestation | platform/version→minVersion | APP_VERSION_BLOCKED; APP_POLICY_READ; I:Y/R:Y |
| DEV-010 | POST `/api/v1/mobile-devices/{id}/security-check` | app→Device | device grant | attestation/risk→ALLOW/DENY | ROOTED_DEVICE; DEVICE_SECURITY_CHECK; I:N/R:Y |

### 4.4 영상 패키지 API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| PKG-001 `[신규]` | POST `/api/v1/packages` | A clinician/Edge | OIDC+MFA→mTLS, `MOBILE_STORE` | consent,device,Study/Series→202 package | CONSENT_REQUIRED/SCOPE_MISMATCH; PACKAGE_CREATED; I:key/R:Y |
| PKG-002 | PUT `/api/v1/packages/{id}/selection` | A clinician | MFA, owner | Study/Series/Instance/Frame refs→scope | SCOPE_INVALID; STUDY_SELECTED; I:key/R:Y |
| PKG-003 | POST `/api/v1/packages/{id}/manifest` | A Edge | mTLS | object descriptors→manifest/hash | DICOM_METADATA_INVALID; MANIFEST_CREATED; I:key/R:Y |
| PKG-004 | POST `/api/v1/packages/{id}/encrypt` | A Edge→KMS | mTLS, `package:encrypt` | manifestHash,deviceKeyRef→ENCRYPTED | KMS_UNAVAILABLE/NONCE_REUSE; PACKAGE_ENCRYPTED; I:key/R:Y |
| PKG-005 | GET `/api/v1/packages/{id}/download` | bound app | device+package grant | Range optional→ciphertext | DEVICE_BLOCKED; PACKAGE_DOWNLOAD; I:Y/R:Y |
| PKG-006 | GET `/api/v1/packages/{id}/chunks/{n}` | bound app | device+chunk grant | Range→chunk/tag/hash | CHUNK_NOT_FOUND; CHUNK_DOWNLOADED; I:Y/R:Y |
| PKG-007 | POST `/api/v1/packages/{id}/stored` | bound app | device proof | manifestHash,size→receipt | HASH_MISMATCH; PACKAGE_STORED; I:key/R:Y |
| PKG-008 | GET `/api/v1/packages/{id}` | owner/authorized staff | OIDC/device | id→safe status | ACCESS_DENIED; PACKAGE_STATUS_READ; I:Y/R:Y |
| PKG-009 | POST `/api/v1/packages/{id}/resume` | app/Edge | device grant | verifiedChunks→resume grant | PACKAGE_EXPIRED; TRANSFER_RESUMED; I:key/R:Y |
| PKG-010 | DELETE `/api/v1/packages/{id}` | owner/system | reauth/mTLS | reason→202 deletion | DELETE_PENDING; PACKAGE_DELETE_REQUEST; I:key/R:Y |
| PKG-011 | POST `/api/v1/packages/{id}/revoke` | Consent/Security | mTLS | reason→REVOKED | INVALID_STATE; PACKAGE_REVOKED; I:key/R:Y |
| PKG-012 | POST `/api/v1/packages/{id}/verify` | A/B Edge | mTLS | manifest/hash/tag results→VERIFIED/FAILED | PACKAGE_TAMPERED; PACKAGE_VERIFIED; I:key/R:Y |

### 4.5 QR·Handoff API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| HOF-001 `[신규]` | POST `/api/v1/handoffs` | B clinician | OIDC+MFA, `TICKET_ISSUE` | purpose,action,gateway→201 session | GATEWAY_OFFLINE; HANDOFF_CREATED; I:key/R:Y |
| HOF-002 | POST `/api/v1/handoffs/{id}/tickets` | B clinician | session owner | ttl→opaque ticket/QR payload | TTL_INVALID; QR_ISSUED; I:key/R:Y |
| HOF-003 | POST `/api/v1/handoff-tickets/scan` | patient app | OIDC+device | opaqueTicket,deviceProof→safe B summary | TICKET_EXPIRED; QR_SCANNED; I:key/R:N |
| HOF-004 | POST `/api/v1/handoffs/{id}/patient-approval` | patient app | reauth+device | package,consent,decision→PATIENT_APPROVED | CONSENT_REVOKED; HANDOFF_APPROVED; I:key/R:Y |
| HOF-005 | POST `/gateway/v1/handoff-tickets/introspect` | B Edge | mTLS | ticket digest,context→active/claims | INSTITUTION_MISMATCH; TICKET_VALIDATED; I:Y/R:Y |
| HOF-006 | POST `/api/v1/handoffs/{id}/consume` | B Edge | mTLS+receipt | ticket,receipt→CONSUMED | TICKET_REPLAY; TICKET_CONSUMED; I:key/R:N |
| HOF-007 | POST `/api/v1/handoffs/{id}/revoke` | owner/system | OIDC/mTLS | reason→REVOKED | INVALID_STATE; TICKET_REVOKED; I:key/R:Y |
| HOF-008 | GET `/api/v1/handoffs/{id}` | participants | OIDC/device/mTLS | id→safe state | ACCESS_DENIED; HANDOFF_STATUS_READ; I:Y/R:Y |
| HOF-009 | POST `/api/v1/handoffs/{id}/retry` | app/B Edge | device/mTLS | checkpoint→new transfer grant | RETRY_LIMIT; HANDOFF_RETRIED; I:key/R:Y |
| HOF-010 | POST `/api/v1/handoffs/{id}/cancel` | patient/B clinician | reauth | reason→REJECTED/REVOKED | ALREADY_CONSUMED; HANDOFF_CANCELLED; I:key/R:Y |

### 4.6 모바일→B Gateway API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| GW-001 `[신규]` | POST `/gateway/v1/package-uploads` | app→B Edge | transfer token+device proof, TLS | package,manifest,size→uploadId | TOKEN_INVALID; UPLOAD_STARTED; I:key/R:Y |
| GW-002 | PUT `/gateway/v1/package-uploads/{id}/chunks/{n}` | app→B Edge | chunk nonce/token | bytes+hash+tag→204/ETag | CHUNK_HASH_MISMATCH; CHUNK_RECEIVED; I:key/R:Y |
| GW-003 | GET `/gateway/v1/package-uploads/{id}` | app/B clinician | scoped token | id→received chunks/status | ACCESS_DENIED; UPLOAD_STATUS_READ; I:Y/R:Y |
| GW-004 | POST `/gateway/v1/package-uploads/{id}/resume` | app | fresh transfer token | checkpoint→resume offset | TOKEN_EXPIRED; UPLOAD_RESUMED; I:key/R:Y |
| GW-005 | POST `/gateway/v1/package-uploads/{id}/complete` | app | transfer token | count/hash→RECEIVED | PACKAGE_INCOMPLETE; UPLOAD_COMPLETED; I:key/R:Y |
| GW-006 | GET `/gateway/v1/delivery-receipts/{id}` | participants | scoped token | id→signed receipt | RECEIPT_NOT_FOUND; RECEIPT_READ; I:Y/R:Y |
| GW-007 | POST `/gateway/v1/packages/{id}/verify` | B Edge internal | mTLS | manifest/count/hash/tag→result | PACKAGE_TAMPERED; INTEGRITY_RESULT; I:key/R:Y |
| GW-008 | POST `/gateway/v1/packages/{id}/key-release` | B Edge→KMS | mTLS, `key:unwrap` | consent/ticket/device/package proof→B envelope | KEY_RELEASE_DENIED; KEY_RELEASE_DECISION; I:key/R:N |
| GW-009 | POST `/gateway/v1/packages/{id}/pacs-imports` | B clinician/Edge | MFA+Import token/mTLS | mapping,protocol→202 import | PACS_IMPORT_DENIED; PACS_IMPORT_REQUEST; I:key/R:Y |

### 4.7 DICOMweb API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| DCM-001 `[기존]` | GET `/dicomweb/studies` | Viewer→B Edge | Remote token `SEARCH` | query→DICOM JSON Studies | SCOPE_MISMATCH; QIDO_STUDY; I:Y/R:Y |
| DCM-002 `[기존]` | GET `/dicomweb/studies/{study}/series` | Viewer→B Edge | token Study | query→Series | TOKEN_SCOPE_MISMATCH; QIDO_SERIES; I:Y/R:Y |
| DCM-003 `[기존]` | GET `.../series/{series}/instances` | Viewer→B Edge | token Study/Series | query→Instances | SCOPE_MISMATCH; QIDO_INSTANCE; I:Y/R:Y |
| DCM-004 `[기존]` | GET `.../instances/{sop}` | Viewer→B Edge | `VIEW`, Instance | Accept→DICOM multipart/object | DOWNLOAD_NOT_ALLOWED; WADO_INSTANCE; I:Y/R:Y |
| DCM-005 `[신규]` | GET `.../instances/{sop}/frames/{frames}` | Viewer→B Edge | `VIEW`, Frame allowlist/range | Accept→frames | FRAME_SCOPE_MISMATCH; WADO_FRAME; I:Y/R:Y |
| DCM-006 `[신규]` | POST `/dicomweb/studies` | B Edge→B PACS | mTLS+Import token | DICOM multipart→STOW response | PACS_PARTIAL_FAILURE; STOW_RESULT; I:key/R:Y |
| DCM-007 `[신규]` | POST `/gateway/v1/c-store` | B Edge internal→adapter | mTLS+Import token | object refs→DIMSE receipt | CSTORE_FAILED; CSTORE_RESULT; I:key/R:Y |
| DCM-008 `[신규]` | POST `/gateway/v1/dicom/validate` | Edge | mTLS | metadata/UID refs→validation | DICOM_METADATA_INVALID; DICOM_VALIDATED; I:Y/R:Y |
| DCM-009 `[기존/변경]` | POST `/gateway/token/introspect` | Edge | mTLS+service role | token/context→active/claims | TOKEN_INVALID; TOKEN_INTROSPECT; I:Y/R:Y |

### 4.8 감사 API

| API ID·상태 | Method / Endpoint | 호출자→대상 | 인증·Scope·mTLS | 요청 → 성공응답 | 오류·감사·I/R |
|---|---|---|---|---|---|
| AUD-001 `[기존]` | POST `/api/audit-logs` 또는 `/gateway/audit` | service→Audit | internal mTLS | event schema→201 | AUDIT_WRITE_FAILED; AUDIT_APPENDED; I:eventId/R:Y |
| AUD-002 `[기존]` | GET `/api/audit-logs` | security/admin | OIDC+MFA `AUDIT_READ` | filters/page→redacted events | ACCESS_DENIED; AUDIT_READ; I:Y/R:Y |
| AUD-003 `[변경]` | POST `/api/v1/audit-events/search` | security/admin | MFA, institution scope | complex filter→page | QUERY_TOO_BROAD; AUDIT_SEARCH; I:Y/R:Y |
| AUD-004 `[기존]` | GET `/api/audit-integrity` | security/admin | MFA `AUDIT_READ` | range→chain result | INTEGRITY_CHECK_FAILED; AUDIT_VERIFY; I:Y/R:Y |
| AUD-005 `[신규]` | GET `/api/v1/operator-audit-events` | platform security | PAM+MFA | filters→events | ACCESS_DENIED; OPERATOR_AUDIT_READ; I:Y/R:Y |
| AUD-006 `[신규]` | GET `/api/v1/security-incidents/{id}/events` | security | MFA | incident→correlated events | INCIDENT_NOT_FOUND; INCIDENT_AUDIT_READ; I:Y/R:Y |

개별 body schema는 다음 데이터 모델을 참조한다. 개인정보 포함 API는 PAT/CON/PKG/HOF이며 응답을 가명 참조로 제한한다. DICOM payload와 key envelope는 민감정보로 취급하고 application log/body capture를 금지한다.

## 5. 모바일 영상 패키지 계약

### 5.1 논리 구조

```text
Package Header (magic, version, package_id, manifest offset)
Package Metadata (비식별 표시용 최소정보)
Encrypted Payloads (DICOM object 또는 chunk ciphertext)
Canonical Manifest (object/chunk 목록과 scope)
Integrity (manifest hash, package hash, AEAD tags)
Encryption Metadata (algorithm, nonce derivation version, key envelope refs)
Expiration/Delivery Metadata (expires_at, source/destination, receipt ref)
```

컨테이너 형식은 CBOR/ZIP64 custom container 중 `[설계 결정 필요]`이다. path traversal·zip bomb 방지를 위해 절대경로, `..`, symlink를 금지하고 선언/실제 크기 및 object 수 상한을 검사한다.

### 5.2 Manifest

| 필드 | 타입·필수 | 규칙 |
|---|---|---|
| `package_id`, `transfer_id` | opaque ID·Y | 전역 유일, QR 미포함 |
| `patient_ref` | opaque·Y | 가명 참조, 직접식별자 금지 |
| `study_ref`, `series_ref[]` | protected ref·Y | 서버에서 실제 UID와 매핑; QR 금지 |
| `objects[]` | array·Y | instance_ref, frame range, chunk refs, size/hash |
| `instance_count`, `frame_count` | uint·Y | payload와 정확히 일치 |
| `total_size`, `chunk_count` | uint64/uint·Y | 상한검사 |
| `hash_algorithm` | enum·Y | `SHA-256` 기본 |
| `package_hash`, `manifest_hash` | base64url·Y | canonical bytes 대상 |
| `encryption_algorithm/version` | enum/string·Y | `A256GCM`, `enc-v1` |
| `created_at`, `expires_at` | timestamp·Y | expires>created, consent 이내 |
| `source_institution`, `destination_institution` | opaque ID·Y | 정책과 일치 |
| `purpose`, `scope`, `status` | enum/object·Y | actions와 DICOM hierarchy |
| `key_envelope_refs[]` | opaque ID·Y | 키 원문 금지 |

QR에는 deep link, protocol version, opaque Ticket만 포함한다. Manifest는 암호 패키지 내부의 보호된 메타이며 QR로 노출하지 않는다.

### 5.3 DICOM 범위

Patient는 identity 검증 단위이고 token resource가 아니다. Study 전체 허용은 명시된 모든 Series/Instance를 포함하지만 새로 추가된 객체를 자동 포함하지 않도록 manifest snapshot을 고정한다. Series 허용은 해당 Series의 명시 Instance만, Instance 허용은 SOPInstanceUID 하나만, Multi-frame은 명시 Frame number/range만 허용한다. 상위범위 권한이 하위범위를 포함하는지는 동의 snapshot과 action별로 평가하며 문자열 prefix 비교를 금지한다.

## 6. 암호화·키 래핑 계약

정책서와 동일하게 설계안 B를 선택한다. KMS/HSM이 package/transfer별 256-bit DEK를 생성하고 A Edge 메모리에서만 제한적으로 사용한다. payload/chunk별 96-bit GCM nonce는 CSPRNG 또는 package nonce prefix+검증된 monotonic counter로 만들며 `(DEK, nonce)` 중복을 DB/KMS에서 거부한다. AAD는 package_id, manifest_hash, chunk number, algorithm version을 canonical encoding한 값이다.

DEK는 KMS KEK 아래 escrow envelope와 등록 모바일 공개키용 envelope로 보관한다. 모바일 개인키는 Android Keystore/iOS Secure Enclave 계열 비추출 키다. 환자 승인·B MFA·기관·동의·Ticket·scope·package integrity-ready·TTL·기기상태가 모두 유효하면 KMS가 raw DEK를 외부로 내보내지 않고 B Gateway 공개키/KEK용 envelope를 재래핑한다. B Gateway private key는 B KMS/HSM에 둔다.

| 항목 | 계약 |
|---|---|
| wrap 알고리즘 | HPKE 또는 RSA-OAEP-256/AES-KWP 조합 `[KMS 호환 결정 필요]`; algorithm agility 필드 필수 |
| key owner | DEK lifecycle은 Highpass KMS 정책, device/B private key는 각 trust domain |
| release | GW-008에서 전체 ABAC와 manifest hash를 바인딩한 1회 authorization |
| 분실/철회/만료 | device/B envelope disable, release deny, active session revoke |
| PACS 편입 후 | receipt 후 B 임시 DEK zeroize; PACS at-rest key는 B 책임 |
| 복구 | 일반 사용자 복구 불가; quorum recovery는 `[정책 결정 필요]` |
| 폐기 | package 삭제/보존종료와 모든 retry 종료 후 DEK destroy·receipt |
| PQC | ML-KEM hybrid envelope는 P1; v1 필수 아님 |

GCM tag, manifest hash, count/size 중 하나라도 실패하면 복호화·Viewer·편입을 중지하고 격리 후 삭제한다. key material은 오류·trace·audit에 남기지 않는다.

## 7. QR Ticket·Token 계약

| 유형 | 발급/사용 | 대상·행위 | 시간·aud/scope/nonce | 상태·폐기·감사 |
|---|---|---|---|---|
| Consent Request ID | Consent→patient | patient_ref·purpose·request | opaque, 요청 TTL | 완료/거부/만료; CONSENT_* |
| QR Handoff Ticket | Handoff→app/B Edge | B institution/session, consent, Study/Series | 128-bit+ opaque, 2~5분 `[결정]`, 1회 nonce | ISSUED~CONSUMED, revoke/replay 감사 |
| Remote View Token | Policy→B Viewer/Edge | B user·Study/Series/Instance/Frame, SEARCH/VIEW | 5~10분, aud=B Edge, jti | 제한 재사용·매요청 검사 |
| Package Transfer Token | Policy→app/B Edge | package/upload/B, chunk range | 2~5분, aud=B Edge, nonce/idempotency | 1회/청크 단위 소비 |
| PACS Import Token | Policy→B Edge | Study/Series, PACS_IMPORT | 2~5분, aud=B PACS adapter | 1회, receipt 후 소비 |
| Key Release Authorization | Policy→KMS/B Edge | envelope/package/manifest/B | 최대 1~2분 `[결정]`, aud=KMS, nonce | 1회, key release 감사 |
| Audit Session ID | Control→모든 서비스 | 거래 상관관계 | 비권한성 opaque ID | 거래 동안 재사용, 인증수단 아님 |

JWT형 grant는 `iss,aud,sub,iat,nbf,exp,jti,scope,purpose,institution_id,resource_refs,policy_version`을 서명하고 원문을 저장하지 않는다. QR payload 예시는 `highpass://handoff?v=1&t=hdt_<opaque>`뿐이며 patient data, DICOM UID, key, JWT, permanent token, long-lived URL, download path 검사를 자동시험한다.

## 8. Token 상태 및 생명주기

| 상태 | 진입조건 | 허용행위 | 차단행위 | 감사로그 | 다음 상태 |
|---|---|---|---|---|---|
| CREATED | 서버 record 생성 | issue 준비 | resource 접근 | TOKEN_CREATED | ISSUED, REVOKED |
| ISSUED | 안전한 전달 | scan/introspect | payload 접근 | TOKEN_ISSUED | SCANNED, AUTHORIZED, EXPIRED, REVOKED |
| SCANNED | 최초 유효 QR scan | 안전요약·환자승인 | 전송/키 | TOKEN_SCANNED | PATIENT_APPROVED, REJECTED, EXPIRED |
| PATIENT_APPROVED | 환자 재인증 승인 | 전체 policy 평가 | 직접 데이터 | PATIENT_APPROVED | AUTHORIZED, REJECTED |
| AUTHORIZED | 모든 조건 ALLOW | 지정 action | 범위외 action | TOKEN_AUTHORIZED | CONSUMED, EXPIRED, REVOKED |
| CONSUMED | 원자적 1회 성공 | 상태확인 | 재사용 | TOKEN_CONSUMED | terminal; replay event |
| EXPIRED | exp 경과 | 신규 요청 | 모든 action | TOKEN_EXPIRED | terminal |
| REVOKED | consent/device/session 폐기 | 상태확인 | 모든 action | TOKEN_REVOKED | terminal |
| REPLAY_BLOCKED | 소비 token 재제출 | 없음 | 모든 action | TOKEN_REPLAY_BLOCKED | terminal |
| REJECTED | 환자/정책 거부 | 신규 요청 | 현재 거래 | TOKEN_REJECTED | terminal |

승인 전 QR는 SCANNED까지만 전이하고 전송을 거부한다. 승인 후 최초 요청만 AUTHORIZED/CONSUMED가 된다. 만료·철회·기관/scope 불일치·기기해지는 각각 terminal DENY이며 불일치는 REJECTED, 재사용은 REPLAY_BLOCKED 사건이다. B 전달 완료는 receipt와 같은 transaction에서 CONSUMED 처리한다. Handoff 취소는 미소비 Ticket을 REVOKED/REJECTED로 전이한다.

## 9. 데이터 모델과 저장 경계

Control Plane PostgreSQL에는 원본 DICOM/Pixel Data를 저장하지 않는다. 패키지 암호문은 모바일 Vault 또는 제한된 Edge/Relay object store, key material은 KMS/HSM, 감사는 append-only 저장소에 둔다. 모든 DB ID는 UUID/ULID, 시간은 `timestamptz`, 상태는 DB check/enum과 애플리케이션 중앙 enum을 함께 사용한다.

### 9.1 엔터티 사전

| 엔터티 | 핵심 필드(타입, 필수) | 목적·관계 | 민감도·암호화 | 저장·보존/삭제·인덱스·감사 |
|---|---|---|---|---|
| Institution | `institution_id uuid Y`, name, status, public_key_ref | 기관·Gateway 1:N | 내부, at-rest | Control; 계약기간+정책; PK, status idx; 감사 Y |
| User | `user_id uuid Y`, oidc_sub, role, institution_id FK | 인증주체 | 개인정보, field/at-rest | Control; 계정정책; unique issuer+sub; Y |
| PatientIdentityRef | `patient_ref uuid Y`, institution_id, protected_local_ref | 환자 가명매핑 | PHI, envelope encryption | 분리 vault; 목적기간; unique institution+digest; Y |
| MobileDevice | `device_id uuid Y`, patient_ref FK, platform, app_version, status, risk | 반신뢰 단말 | 개인정보, at-rest | Control; 해지 후 증적; patient/status idx; Y |
| DeviceBinding | `binding_id`, device_id FK, public_key_ref, attestation_hash, version | 계정·기기키 결합 | 보안민감, 암호화 | Control/KMS ref; 폐기 후 digest; unique active device+version; Y |
| Consent | `consent_id`, patient_ref, source/target FK, purpose, action_flags, status, validity, version | 동의 header | PHI, field encryption | Control; 법정기간 결정; lookup composite; Y |
| ConsentScope | `scope_id`, consent_id FK, study_ref, series/instance/frame refs | 최소 허용범위 | PHI, protected refs | Control; consent와 lifecycle; unique scope tuple; Y |
| TransferRequest | `transfer_id`, consent_id FK, requester, purpose, status | A 요청 | PHI 최소, at-rest | Control; 거래보존; consent/status idx; Y |
| TransferSession | `session_id`, transfer_id FK, source/target, status, timestamps | 종단 거래 | 내부 | Control; TTL+감사기간; transfer unique active; Y |
| HandoffSession | `handoff_id`, transfer_id, B clinician/gateway, purpose, status, exp | B 수신세션 | PHI 참조, at-rest | Control; TTL; target/status idx; Y |
| HandoffTicket | `ticket_id`, handoff_id FK, token_hash, jti, status, exp, used_at | QR 1회상태 | secret digest only | Control; TTL+replay 증적; unique token_hash/jti; Y |
| ImagingPackage | `package_id`, transfer_id, device_id, manifest_id, status, size, exp | 암호 패키지 lifecycle | PHI 메타, at-rest | Control metadata; payload 외부; status/exp idx; Y |
| PackageManifest | `manifest_id`, package_id FK, canonical_hash, counts, algorithm/version, scope_json | payload snapshot | PHI, encryption | 보호 object+Control hash; package lifecycle; unique package; Y |
| PackageChunk | `(package_id,chunk_no)`, size, cipher_hash, tag_ref, status | 재개·완전성 | 암호문 메타 | Edge/object; 완료 후 TTL; composite PK/status; Y |
| KeyEnvelope | `envelope_id`, package_id, recipient_type/id, key_ref, alg, version, status | wrapped DEK ref | 극비, envelope/KMS | KMS+Control ref; key lifecycle; unique active recipient; Y |
| DeliveryReceipt | `receipt_id`, package_id, handoff_id, manifest_hash, receiver, received_at, signature | 수신증명 | 민감, 서명/at-rest | Control/Audit; 증적기간; unique package+handoff; Y |
| DicomAccessTokenLog | `token_id`, token_hash, jti, consent_id, user/B, scope, exp/status | 원격 token 상태 | secret digest, encrypted | Control; TTL+증적; unique hash/jti; Y |
| Revocation | `revocation_id`, object_type/id, reason, actor, at | 폐기 원장 | 민감 | Control/Audit; 증적기간; object idx; Y |
| DeletionReceipt | `deletion_id`, object_type/id, method, requested/completed, result | 삭제증적 | 내부, 서명 권고 | Audit; 증적기간; object unique success; Y |
| AuditLog | `event_id`, audit_session_id, actor/institution, refs, decision/reason, trace, prev/hash | 불변감사 | 민감, at-rest | Audit store; 기간 결정; time/actor/action idx; append-only |
| ErrorEvent | `error_id`, request/trace/audit ids, safe_code, component, retryable, time | 장애분류 | 내부, redacted | observability; 단기+사건기간; code/time idx; Y |

모든 엔터티는 `created_at`, `updated_at`(불변형 제외), `version`을 가진다. FK 삭제는 임상/감사증적을 cascade 삭제하지 않고 tombstone/restrict를 기본으로 한다. 실제 이름·생년월일을 가진 기존 `patients` 구조는 합성 MVP에서만 허용하며 운영 전 PatientIdentityRef 분리 migration이 필수다.

### 9.2 관계

`Institution 1:N User/Gateway`, `PatientIdentityRef 1:N Device/Consent`, `MobileDevice 1:N DeviceBinding`, `Consent 1:N ConsentScope/TransferRequest`, `TransferRequest 1:N TransferSession/ImagingPackage`, `TransferSession 1:N HandoffSession`, `HandoffSession 1:N HandoffTicket`, `ImagingPackage 1:1 Manifest, 1:N Chunk/KeyEnvelope/Receipt`, 모든 중요 객체 `1:N AuditLog/Revocation/DeletionReceipt`다.

## 10. 모바일 패키지 상태 계약

| 상태 | 진입·허용 API/주체 | 데이터·키 접근 | 재시도 | 감사·다음 상태·폐기 |
|---|---|---|---|---|
| CREATED | PKG-001/002/003, A clinician/Edge | 평문은 A Edge 임시만, DEK 생성 전 | Y | PACKAGE_CREATED→ENCRYPTED/FAILED; 임시 TTL |
| ENCRYPTED | PKG-004, A Edge/KMS | 암호문·wrapped key만 | Y | PACKAGE_ENCRYPTED→DOWNLOADING/FAILED |
| DOWNLOADING | PKG-005/006, bound app | 암호문만, device envelope | Y | CHUNK_*→STORED/FAILED; 부분삭제 |
| STORED_ON_DEVICE | PKG-007/008, patient app | Vault 암호문; key release 불가 | Y | PACKAGE_STORED→READY/EXPIRED/REVOKED |
| READY_FOR_HANDOFF | HOF-003, app | 유효상태 확인만 | Y | PACKAGE_READY→HANDOFF_PENDING |
| HANDOFF_PENDING | HOF-004/005, patient/B | 아직 복호화 불가 | Y | HANDOFF_*→UPLOADING/REVOKED/FAILED |
| UPLOADING | GW-001~005, app/B Edge | 암호문 upload만 | Y, bounded | PACKAGE_UPLOAD→RECEIVED/FAILED |
| RECEIVED | GW-007, B Edge | 격리 암호문, unwrap 전 | Y | PACKAGE_RECEIVED→VERIFIED/FAILED |
| VERIFIED | GW-008, B Edge/KMS | 조건부 B unwrap 가능 | N for verify | PACKAGE_VERIFIED→VIEWED/IMPORTED/DELETED |
| VIEWED | DCM-004/005, B clinician | 짧은 scoped session | 조회만 Y | VIEW_ACCESSED→IMPORTED/DELETED/EXPIRED |
| IMPORTED | GW-009/DCM-006/007 | B PACS 정책, 임시 DEK 제거 | 실패 instance만 | PACS_IMPORTED→DELETED |
| EXPIRED | scheduler/policy | key release 금지 | N, 신규발급 | PACKAGE_EXPIRED→DELETED |
| REVOKED | consent/device/security | 모든 key/data action 금지 | N | PACKAGE_REVOKED→DELETED |
| DELETED | PKG-010/deletion worker | 없음 | 실패삭제만 | PACKAGE_DELETED terminal |
| FAILED | 어느 단계 오류 | 이용 금지·격리 | 원인별 Y | PACKAGE_FAILED→안전 이전 준비상태 또는 DELETED |

상태 변경은 `If-Match`와 DB transaction/CAS로 원자 처리한다. terminal 상태에서 정상 상태로 되돌리지 않는다.

## 11. 오류코드 및 예외 계약

| 코드 | HTTP | 의미 | retryable | 처리 |
|---|---:|---|---|---|
| AUTHENTICATION_REQUIRED / MFA_REQUIRED | 401/403 | 인증/MFA 부족 | 조건부 | 재인증 |
| INSTITUTION_MISMATCH | 403 | 대상기관 불일치 | N | deny·보안감사 |
| CONSENT_REQUIRED / REVOKED / EXPIRED | 403 | 동의 비유효 | N | grant/key 차단 |
| SCOPE_MISMATCH / FRAME_SCOPE_MISMATCH | 403 | DICOM 범위외 | N | 존재정보 숨김 |
| TICKET_EXPIRED / REVOKED | 409 | Ticket terminal | N | 신규세션 |
| TICKET_REPLAY | 409 | 소비 Ticket 재사용 | N | REPLAY_BLOCKED·탐지 |
| DEVICE_NOT_REGISTERED / BLOCKED / INTEGRITY_FAILED | 403 | 기기 비신뢰 | 조건부 | 재등록/보안절차 |
| TOKEN_INVALID / EXPIRED / AUDIENCE_INVALID | 401 | token 검증 실패 | N | 재발급 |
| PACKAGE_INCOMPLETE | 422 | chunk/count 부족 | Y | checkpoint 재개 |
| PACKAGE_TAMPERED / HASH_MISMATCH / GCM_TAG_INVALID | 422 | 무결성 실패 | N | 격리·삭제·사건 |
| KEY_RELEASE_DENIED | 403 | KMS 정책 실패 | N | 복호화 금지 |
| STORAGE_INSUFFICIENT | 507 | 모바일/B 공간 부족 | Y | 공간확보·부분삭제 |
| PACS_UNAVAILABLE / PACS_PARTIAL_FAILURE | 502/207 | 외부 PACS 장애/부분성공 | Y | instance receipt 재시도 |
| RELAY_UNAVAILABLE / GATEWAY_OFFLINE | 503 | 경로 장애 | Y | 직접경로/후속 재시도 |
| AUDIT_WRITE_FAILED | 503 | 필수감사 실패 | Y | 중요행위 중단 |
| RATE_LIMITED | 429 | 호출한도 | Y | Retry-After |
| VERSION_CONFLICT / INVALID_STATE | 409/412 | 상태경쟁 | Y | 최신상태 재조회 |

DNS, connection refused, TLS handshake/certificate, timeout, policy DENY를 서로 다른 failure_code로 보존한다. client message는 안전하게 통합할 수 있다.

## 12. 데이터 보존·삭제·폐기

| 객체 | 위치 | 보존 | 삭제·폐기 |
|---|---|---|---|
| 중앙 Pixel Data | 저장 금지 | 없음 | 수신 시 차단 |
| Relay 암호 cache | Data Plane | 5~30분 | 완료/TTL 자동삭제, key 폐기, receipt |
| 모바일 package | 앱 Vault | 동의 이내 별도 기간 `[결정 필요]` | 완료/만료/철회/분실/장기미사용 시 삭제+key disable |
| A/B Edge 평문 temp | 메모리/암호 temp | 처리시간만 | 검증/전달 후 zeroization 시도 |
| token 원문 | 저장 금지 | 메모리 수명 | 사용 후 제거; digest/상태만 보존 |
| consent/transaction meta | Control DB | 법·병원정책 `[결정 필요]` | 목적종료 후 파기/비식별 증적 |
| audit/receipt | Audit store | 정책 `[결정 필요]` | 승인된 lifecycle, 삭제행위 별도 감사 |
| B PACS 사본 | B 병원 | B 보존정책 | B 운영자 책임; 철회 자동회수 보장 없음 |

앱 삭제·오프라인 분실은 즉시 물리삭제를 증명할 수 없으므로 cryptographic erasure를 우선하고 다음 연결 시 deletion receipt를 생성한다.

## 13. 감사 이벤트 계약

```json
{
  "event_id":"evt_01...", "event_type":"TICKET_REPLAY_BLOCKED",
  "event_time":"2026-09-01T00:00:00Z", "actor_id":"usr_ref",
  "actor_role":"B_CLINICIAN", "institution_id":"inst_b",
  "patient_ref":"pat_ref", "study_ref":"study_ref",
  "transfer_id":"trf_01", "ticket_id":"ticket_digest_ref",
  "audit_session_id":"aud_01", "device_id":"dev_01",
  "source":"mobile", "destination":"b-edge", "action":"MOBILE_HANDOFF",
  "decision":"DENY", "reason":"REPLAY", "policy_version":"3.0",
  "trace_id":"trace_01", "failure_code":"TICKET_REPLAY"
}
```

필수 필드 누락, token/key/payload 포함, patient direct identifier 포함 이벤트는 reject한다. event_id idempotency, UTC, schema version, previous_hash/record_hash를 사용한다. 감사 API mutation은 허용하지 않고 조회·무결성 검사도 감사한다.

## 14. 보안·네트워크 계약

- Internet→Control API와 app→B Edge는 TLS 1.3; A/B Edge↔Control/Relay/PACS/KMS/Audit는 mTLS와 hostname/SAN/EKU/chain 검증.
- Browser→B Edge만 허용하고 Browser→A PACS/A Edge/B PACS 및 public→PACS는 network deny 시험 대상이다.
- OAuth/OIDC authorization code+PKCE, exact redirect URI, state/nonce, MFA claim freshness를 적용한다.
- request body/UID/filename은 allowlist·길이·형식 검증, SQL parameter binding, 출력 escaping을 적용한다.
- upload는 content length, chunk count, decompression ratio, media type, malware/format validation `[결정 필요]`을 적용한다.
- 모든 polling/network call은 유한 timeout이고 retry는 idempotent operation과 retryable code에만 적용한다.

## 15. 요구사항·유스케이스·시험 추적성

| 계약군 | 요구사항 | 유스케이스 | 핵심 시험 | 현재 증적 |
|---|---|---|---|---|
| 인증·동의 | FR-AUTH-001~002, FR-CONSENT-001~002, FR-POLICY-001~002 | UC-001,004~007 | API-AUTH-001, API-CON-001~003, SEC-CONSENT-001 | `[부분 기존시험]` |
| 기기 | FR-MOBILE-001~003,010~012 | UC-002~003 | API-DEV-001~003, SEC-DEVICE-001~003 | `[미생성]` |
| 패키지·저장 | FR-PACKAGE-001~007, FR-STORAGE-001~007 | UC-009~013 | API-PKG-001~004, SEC-PKG-001~003 | `[미생성]` |
| 키 | FR-KEY-001~007 | UC-010,013,018,021 | SEC-KEY-001~004 | `[미생성]` |
| QR·Handoff | FR-QR-001~003, FR-HANDOFF-001~008 | UC-014~020,027~029 | API-HOF-001~005, SEC-QR-001~004 | `[미생성]` |
| Gateway upload | FR-HANDOFF-006~008, FR-ERROR-001~003 | UC-019~021 | API-GW-001~009, ERR-GW-001~003 | `[미생성]` |
| DICOMweb·Viewer | FR-DICOM-001~006, FR-VIEW-001~003 | UC-022~026 | API-DCM-001~009, SEC-REMOTE-001 | `[부분 기존시험]` |
| PACS | FR-PACS-001~003 | UC-023,026 | API-PACS-001~003 | `[미생성]` |
| 감사 | FR-AUDIT-001~003 | UC-030 | API-AUD-001~006, AUD-INTEGRITY-001 | `[부분 기존시험]` |

필수 negative 시험은 QR payload PII/UID/key/JWT/download path 미포함, 승인 전 전송, 타기관, 범위외 Study/Frame, 재사용, 철회/만료, 분실/루팅, hash/tag 변조, 부분전송, KMS/감사/PACS 장애, 브라우저 직접 PACS 접근을 모두 DENY로 확인한다. 미실행 시험은 PASS로 기록하지 않는다.

## 16. 구현 순서와 변경 영향

1. 공통 ID/error/audit/idempotency 계약과 DB migration을 확정한다.
2. 기존 consent/access token을 v1 facade와 token hash로 안전하게 이행한다.
3. MobileDevice/Binding과 package/manifest/chunk lifecycle을 구현한다.
4. KMS 방식 B envelope·key-release를 구현하고 독립 negative 시험을 통과시킨다.
5. Handoff/Ticket CAS와 mobile→B resumable upload를 구현한다.
6. B verify/Viewer를 연결하고 PACS_IMPORT는 별도 승인 후 구현한다.
7. Relay/cache 삭제와 종단 감사·장애시험을 완료한다.

영향받는 기존 파일은 향후 `src/server.js`, service/store/auth, PostgreSQL schema, E2E/보안시험, Viewer client다. 본 문서 작업에서는 수정하지 않았다. `/api/consents`, `/api/dicom-access/request`, `/gateway/token/introspect`, 기존 DICOMweb 경로를 즉시 제거하지 않는다.

## 17. 미결정사항

- container format과 canonical serialization, chunk 크기/동시성/최대 package 크기.
- Ticket 2~5분, transfer 2~5분, key authorization 1~2분의 최종값과 mobile package 보존기간.
- HPKE 대 RSA-OAEP/AES-KWP, KMS/HSM 제품, quorum recovery, key rotation.
- Android/iOS 우선순위, attestation·root policy, screen capture/backup의 OS별 검증.
- 직접 app→B Edge 네트워크 가능성 및 Relay fallback 조건.
- PatientIdentityRef 매핑 주체, 보호자/Break Glass 상세 API는 후속 결정 필요.
- STOW/C-STORE, 환자매핑, 중복·부분성공, B PACS 보존 책임.
- 운영 감사 보존/WORM/SIEM, 법률·병원 승인, 실제 IdP/KMS/PACS는 상용화 전 검토 대상이다.

## 18. 완료 기준과 결론

명세 기준 완료는 API catalogue, package/manifest, 방식 B key envelope, 7종 token, 10 token 상태, 21개 엔터티, 15 package 상태, 표준오류, 보존·감사·추적성이 서로 모순 없이 연결되는 것이다. 문서 수준 기준은 충족했으나 신규 API·DB·모바일·KMS·Gateway 구현과 시험은 완료되지 않았다.

다음 산출물은 **OpenAPI 3.1 계약, PostgreSQL ERD·DDL migration, package JSON/CBOR Schema, Handoff·key-release sequence diagram을 포함한 Low-Level Design 및 구현계획서**로 제안한다.
