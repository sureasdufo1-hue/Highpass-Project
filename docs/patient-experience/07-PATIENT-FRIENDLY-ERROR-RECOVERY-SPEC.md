# MediQ 환자 친화 오류 복구 기능 명세

**Feature:** 7 — Patient-friendly Error Recovery  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-ER-001`

## 1. 결정 요약

모든 환자 오류는 `무슨 일 → 영향 → 지금 할 수 있는 일 → 도움이 필요할 때` 순서로 표현한다. 내부 Stack, Endpoint, SQL, PACS 응답, UID, 정책 세부는 노출하지 않는다. Retry CTA는 서버가 `retryable=true`와 멱등성 범위를 명시한 경우에만 보인다.

## 2. 오류 Taxonomy

| Category | 사용자 의미 | 기본 행동 |
|---|---|---|
| `CONNECTIVITY` | 연결이 불안정함 | 연결 확인, 안전한 재시도 |
| `AUTHENTICATION_REQUIRED` | 다시 본인 확인 필요 | 재인증 |
| `ACCESS_DENIED` | 현재 요청을 수행할 수 없음 | 범위/만료 확인 |
| `STATE_CONFLICT` | 다른 기기/요청으로 상태 변경 | 최신 상태 새로고침 |
| `EXPIRED` | QR/Consent/Grant/Lease 만료 | 새 요청 시작 |
| `INTEGRITY_FAILURE` | 파일 신뢰 불가 | 열람 차단, 재다운로드 |
| `DESTINATION_REJECTED` | 목적지 검증 실패 | 병원 확인, 재전송 금지 |
| `RATE_LIMITED` | 잠시 후 가능 | 서버 지정 대기 |
| `RESULT_UNKNOWN` | 요청 결과 확인 중 | 상태 조회, 중복 실행 금지 |
| `SERVICE_UNAVAILABLE` | 서비스 일시 장애 | 나중에 재시도, 진행 보존 |

## 3. 화면·Component

| ID | 화면/Component | 내용 |
|---|---|---|
| `MOB-PXE-ER-001` | Inline Error | 해당 필드/행동의 짧은 원인과 수정 |
| `MOB-PXE-ER-002` | 복구 Sheet | 영향, 다음 행동, 재시도 가능 시각 |
| `MOB-PXE-ER-003` | Result Unknown | 처리 중/확인 중, 상태 조회, Correlation ID |
| `MOB-PXE-ER-004` | 도움 요청 | 안전한 진단 Bundle 미리보기·접수 |

## 4. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-ER-001` | 서버 오류 응답은 stable error code, correlationId, retryable, retryAfter, resultState를 제공해야 한다. |
| `REQ-PXE-ER-002` | 클라이언트는 stable code를 지역화된 안전 문구와 허용 CTA에 Mapping해야 한다. |
| `REQ-PXE-ER-003` | 알 수 없는 코드는 일반 오류로 Fail Safe 처리하고 기술 Detail을 표시하지 않아야 한다. |
| `REQ-PXE-ER-004` | 자동 재시도는 읽기 또는 승인된 멱등 업무 행위에 한정하고 지수 Backoff·상한을 적용해야 한다. |
| `REQ-PXE-ER-005` | STOW/Consent/Grant 결과가 불명확하면 동일 idempotency key로 상태를 조회하고 새 작업을 만들지 않아야 한다. |
| `REQ-PXE-ER-006` | 오프라인 쓰기 요청은 허용된 저위험 작업만 Queue하고 승인·전송·Lease 갱신은 Queue하지 않아야 한다. |
| `REQ-PXE-ER-007` | 사용자는 Correlation ID를 복사할 수 있으나 민감 로그는 볼 수 없어야 한다. |
| `REQ-PXE-ER-008` | 복구 후 원래 업무 Context로 돌아가되 권한과 상태를 다시 확인해야 한다. |

## 5. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-ER-001` | 403/404 응답은 다른 Tenant·환자·Study 존재 여부를 구분 가능하게 하지 않아야 한다. |
| `SEC-PXE-ER-002` | 오류 문구·로그·Bundle에 PHI, Token, Credential, DEK, 전체 UID, Endpoint를 포함하지 않아야 한다. |
| `SEC-PXE-ER-003` | 지원 Bundle은 생성 전 Allowlist Redaction, 사용자 미리보기, 명시적 전송 동의를 거쳐야 한다. |
| `SEC-PXE-ER-004` | Correlation ID는 불투명하고 권한 또는 객체 조회 Key로 사용할 수 없어야 한다. |
| `SEC-PXE-ER-005` | 무결성 실패 데이터는 어떤 Viewer에도 전달하지 않아야 한다. |

## 6. API·운영 GAP

공통 Error Envelope의 제안 필드는 `code`, `messageKey`, `correlationId`, `retryable`, `retryAfterSeconds`, `resultState`, `safeNextActions`다. 클라이언트가 서버 임의 문구를 그대로 렌더링하지 않는다. 현재 OpenAPI 전체 오류 응답에 일관되게 적용되어 있지 않으므로 `MEDIQ-PXE-CORE-001`에서 Contract 개정이 필요하다.

운영 Dashboard는 Category, Endpoint group, build version, retry outcome을 집계하되 의료 Resource 식별자는 제외한다.

## 7. 접근성·콘텐츠 규칙

- “오류 500” 대신 사용자 행동을 설명하고 책임을 환자에게 전가하지 않는다.
- Screen Reader Live Region은 한 번만 알리고 무한 반복하지 않는다.
- Focus를 오류 요약 또는 첫 수정 가능 항목으로 이동한다.
- 버튼은 “다시 시도”, “상태 확인”, “새 요청 시작”처럼 결과가 다른 행동을 구분한다.
- 번역 실패 시 안전한 기본 한국어/영어 Message Key를 사용한다.

## 8. 위협과 통제

| 위협 | 통제 |
|---|---|
| 오류로 객체 Enumeration | 일반화된 deny, Correlation ID만 제공 |
| 무한 재시도로 중복 STOW | idempotency, Result Unknown, Retry allowlist |
| 로그/지원 Bundle 유출 | Allowlist, Redaction, 미리보기·동의 |
| 서버 Detail XSS | Message Key Mapping, 임의 HTML 미렌더링 |
| Integrity 실패 무시 | Fail Closed, Viewer 차단 |

## 9. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-ER-001` | 네트워크 단절 중 목록 조회 | Offline 설명, 마지막 동기화 표시 |
| `TC-PXE-ER-002` | 타 Tenant Resource 요청 | 일반 거부, 존재 여부 미노출 |
| `TC-PXE-ER-003` | 409 상태 충돌 | 최신 상태 조회, 중복 업무 없음 |
| `TC-PXE-ER-004` | STOW Timeout | Result Unknown, 자동 재전송 없음 |
| `TC-PXE-ER-005` | 429 응답 | Retry-After 준수, 무한 반복 없음 |
| `TC-PXE-ER-006` | Hash 불일치 | 열람 차단, 재다운로드 안내 |
| `TC-PXE-ER-007` | 지원 Bundle 생성 | PHI/Secret/UID/Endpoint 없음 |

모든 Test는 `NOT RUN`이다.

## 10. 구현 계획과 완료 경계

`MEDIQ-PXE-CORE-001` Error Envelope, `MEDIQ-PXE-ER-001` Android Component/Mapping, `ER-002` Result Unknown/Retry, `ER-003` Sanitized Support Bundle, `ER-004` Contract/Security/Accessibility Test로 진행한다. 기존 API와 UI가 이 기준을 충족한다고 아직 주장하지 않는다.
