# Highpass v2 업무흐름·유스케이스 정의서

> **CAPSTONE PoC / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 본 문서는 실제 의료기관 운영 승인, 법률 적합성 판단, 인증 또는 임상 목적 사용을 의미하지 않는다.

| 문서 항목 | 내용 |
|---|---|
| 버전 | v2.0-DRAFT |
| 기준일 | 2026-09-01 |
| 기준 문서 | `docs/highpass-v2-requirements-definition.md`, v2 착수계획서, v2 Draw.io 구성도 |
| 저장소 기준 | 2026-09-01 현재 작업트리 |
| 상태 표현 | 구현됨 / 부분 구현 / 구현 예정 / BLOCKED / 범위 제외 / 결정 필요 |

## 1. 문서 목적과 업무 원칙

Highpass는 환자 동의와 기관·의료진별 권한통제를 기반으로 A 병원 PACS에 보관된 CT·MRI 영상을 B 병원에 중계하고, 승인된 영상의 원격 조회와 선택적 PACS 편입을 제공하는 클라우드 관리형 하이브리드 의료영상 플랫폼이다.

본 문서는 누가 어떤 조건에서 요청을 만들고, 어떤 인증·동의·정책을 통과하며, 어떤 데이터가 어느 경로로 조회·중계·저장되는지와 실패·만료·철회 처리를 정의한다.

업무 불변조건은 다음과 같다.

1. QR은 DICOM 저장매체나 의료진 인증수단이 아니다.
2. QR에는 환자명, 주민등록번호, 환자번호, 병명, DICOM, 복호화 키, 장기 토큰을 포함하지 않는다.
3. 원본 DICOM은 A 병원 PACS/Orthanc에 유지한다.
4. 브라우저와 환자 휴대폰은 A 병원 PACS에 직접 연결하지 않는다.
5. B 의료진 인증과 환자 동의가 모두 유효해야 한다.
6. 조회, 다운로드, 중계, PACS 저장은 서로 다른 권한·정책·감사 이벤트다.
7. QIDO-RS는 검색, WADO-RS는 저장된 객체 조회, STOW-RS/C-STORE는 선택적 저장에 사용한다.
8. 모든 실패는 기본 거부하고 PACS 직접 우회 경로를 만들지 않는다.

## 2. 사전 조사와 변경 충돌 분석

### 2.1 확인한 자료

- 최신 요구사항: `docs/highpass-v2-requirements-definition.md`
- 착수계획: `docs/착수계획서_하이브리드_QR_원격조회_개정본.md`
- 구성도: `docs/architecture/highpass_hybrid_qr_dicomweb_architecture.drawio`
- 실행·아키텍처: `README.md`, `docs/ARCHITECTURE.md`, `docker-compose.yml`
- API·데이터: `src/server.js`, `src/services.js`, `src/domain.js`, `db/schema.sql`
- 시험: `test/`, `scripts/e2e-integration-test.js`, mTLS·network gate 스크립트
- 개발규칙: `AGENTS.md`

### 2.2 기존 내용과 현재 기준

| 기존 내용 | 현재 기준 | 처리 | 사유 |
|---|---|---|---|
| 수신 병원에 영상을 먼저 저장한 뒤 조회 | A 원본 유지, WADO 원격조회 우선, 별도 승인 시 편입 | 수정 | 최소복제·권한 분리 |
| 환자 동의 후 단기 DICOM 토큰 발급 | 동의 요청→일회성 Ticket→B 의료진 인증→정책→접근토큰 | 수정 | QR 권한전달과 API 접근권한 분리 |
| 환자 휴대폰이 영상 전송에 참여 | P0는 동의·QR 확인·승인만 수행 | 수정 | 모바일 DICOM은 P1 |
| 브라우저에서 Gateway 경유 Orthanc 조회 | B Edge와 A Edge를 논리적으로 분리 | 수정 | 기관 신뢰경계 명확화 |
| QIDO/WADO 경로 | 동일 기능 유지, A Edge 경유와 scope 검사 명시 | 유지·보강 | 기존 구현 재사용 |
| STOW 지원 필드 | 별도 `PACS_IMPORT` 권한의 P1 편입 유스케이스 | 신규/구현 예정 | E2E 구현·증적 없음 |
| `ACTIVE/REVOKED/EXPIRED` 동의 상태 | DRAFT/PENDING/APPROVED/REJECTED 포함 목표 상태 | 수정 필요 | 승인대기 업무 표현 부족 |
| 전송 사용 로그 | 독립 전송 작업 상태기계 | 신규/구현 예정 | CREATED~DELETED 모델 없음 |
| Cloud Relay 암호문 중계 | 전송별 AEAD·TTL 캐시·삭제증적 | 신규/구현 예정 | 현재 Compose에 Relay 없음 |
| 실제 OIDC/KMS/PACS | 외부 자원 제공 전 BLOCKED | 유지 | 현재 검증 증적 없음 |

## 3. 시스템 행위자

### 3.1 사용자 행위자

| 행위자 | 역할·업무 | 접근 데이터 | 인증 | 권한 범위 | 감사 대상 |
|---|---|---|---|---|---|
| 환자 또는 보호자 | 동의 내용 확인·승인·거부·철회 | 자신의 합성 환자 참조, Study 요약, 동의 상태 | P0 본인확인 Mock; 보호자 방식 결정 필요 | 자신의 동의만 | 확인·승인·거부·철회 |
| A 병원 의료진 | 환자·Study/Series 선택, B 병원·목적 지정 | 소속기관 환자와 최소 영상 메타데이터 | OIDC 목표, 로컬 Mock | 소속·업무범위 | 로그인·요청·범위 선택 |
| B 병원 의료진 | Ticket 제시, 승인 영상 검색·조회·편입 요청 | 승인된 Study/Series/Instance | OIDC+MFA 목표 | 동의·기관·역할·행위 범위 | 로그인·검색·조회·다운로드·편입 |
| 병원 관리자 | 사용자·Gateway·기관정책 관리 | 소속기관 구성·감사 요약 | 관리자 인증+MFA 목표 | 소속기관 | 등록·변경·비활성화 |
| Highpass 운영자 | Control/Relay 상태와 장애 운영 | 최소 운영 메타데이터 | 플랫폼 관리자 인증 | 의료영상 임의열람 불가 | 정책·구성·장애 조치 |
| 보안관리자 | 감사·경보·무결성 조회 | 보호된 감사로그 | SECURITY_ADMIN | 읽기·조사, 일반 삭제 불가 | 조회·내보내기·조사 |

### 3.2 시스템 행위자

| 행위자 | 역할·업무 | 접근 데이터 | 인증 | 권한·제약 | 감사 대상 |
|---|---|---|---|---|---|
| A PACS/Orthanc | 원본 Study/Series/Instance 보관·제공 | 원본 DICOM | A Edge mTLS | A Edge 승인 요청만 | 검색·조회 결과 |
| A Edge Connector | 정책·토큰 재검증, QIDO/WADO 요청 | 승인 범위 DICOM | 기관 인증서 mTLS | PACS 접근 최소권한 | 요청·전송·오류 |
| B Edge Connector | Viewer 요청, 암호문 수신, 선택적 편입 | 승인 범위 객체 | 기관 인증서 mTLS | B 기관·행위 scope | 조회·편입·오류 |
| Cloud Control Plane | principal, 동의, Ticket, 정책, 상태, 감사 | 최소 메타데이터·참조 | OIDC/service token | DICOM 원본 지속저장 금지 | 발급·결정·상태 |
| Cloud Relay | Edge 간 암호문 중계·선택적 TTL 캐시 | 암호문·라우팅 참조 | workload identity+mTLS | 평문·DEK 접근 금지 | 중계·TTL 삭제 |
| OIDC IdP | 사용자 인증·MFA·claims 발급 | 인증 claims | IdP 자체 | 최소 claims | 성공·실패 |
| 정책엔진 | RBAC+ABAC 결정 | principal·동의·scope·행위 | 내부 서비스 인증 | 기본 거부 | ALLOW/DENY·사유 |
| 감사로그 저장소 | append-only 이벤트·Hash Chain | 감사 이벤트 | 서비스 token | 수정·일반삭제 금지 | 무결성·조회 |
| KMS/HSM | DEK 생성·KEK wrapping·키 수명주기 | 키와 키 메타데이터 | workload identity | 원키 출력 제한 | 키 사용·회전·폐기 |
| B OHIF Viewer | QIDO/WADO 기반 Reference Viewer | 승인 메타데이터·영상 | B 의료진 세션 | URL token 금지 | 검색·표시·실패 |
| B PACS | 별도 승인된 사본 저장 | 편입 DICOM | B Edge mTLS/AE | `PACS_IMPORT`만 | 저장 결과 |

## 4. 전체 업무흐름

### 4.1 주 흐름

| 단계 | 수행 주체 | 업무 | 검증·정책 | 데이터·감사 |
|---|---|---|---|---|
| 1 | A 의료진→IdP/Control | 로그인 | issuer/audience/만료, 역할·기관 | `LOGIN_SUCCESS/FAILED` |
| 2 | A 의료진→A PACS | 환자와 Study/Series 선택 | 소속기관·업무권한, 합성 데이터 | 선택 UID, `TRANSFER_REQUEST_DRAFT` 목표 |
| 3 | A 의료진→Control | B 병원·목적·행위 지정 | 기관 ACTIVE, 목적 허용, 최소범위 | 요청·`auditSessionId` |
| 4 | Control→환자 모바일 | 동의 요청과 QR/모바일 링크 발급 | QR에 opaque 참조만 포함 | `CONSENT_REQUESTED`, Ticket 초안 |
| 5 | 환자→Control | 본인확인 후 승인 또는 거부 | 환자/보호자 권한, 내용 재확인 | `CONSENT_APPROVED/REJECTED` 목표 |
| 6 | Control | 동의·A/B·목적·Study/Series·기간 저장 | 필수값·기간·scope | 동의 상태·감사 |
| 7 | Ticket Service | Transfer Ticket 발급·바인딩 | 일회성, TTL, A/B/환자/Study/목적/행위 | 원문 최소노출, digest·상태 |
| 8 | B 의료진→IdP | OIDC+MFA 로그인 | principal·organization 정규화 | 인증 감사 |
| 9 | B 의료진→B Edge/Control | QR 스캔 또는 Ticket 제출 | URL 미사용, Ticket 원자 소비 준비 | `TICKET_PRESENTED` 목표 |
| 10 | 정책엔진 | 동의·기관·사용자·목적·기간·Study/Series·행위 검사 | 조건 하나라도 실패 시 DENY | 결정·reasonCode |
| 11 | Control | scoped DICOMweb 접근토큰 발급 | 짧은 TTL, issuer/audience/jti, scope | digest·`TOKEN_ISSUED` |
| 12 | Viewer→B Edge→A Edge→A PACS | QIDO 검색, WADO 조회 | 각 홉에서 토큰·mTLS·scope 재검증 | QIDO/WADO 감사·사용량 |
| 13 | B 의료진→B Edge→B PACS | 필요 시 별도 PACS 편입 | `PACS_IMPORT`, 무결성, 저장정책 | STOW/C-STORE 결과·감사 |
| 14 | 전체→Audit | 모든 승인·거부·조회·편입·실패 기록 | 필수필드·Hash Chain | `auditSessionId` 종단 추적 |
| 15 | Control/Gateway | 만료·철회 후 접근 차단 | Ticket/토큰/동의 상태 재검증 | 만료·철회·거부 감사 |
| 16 | Relay/KMS | TTL 자료 삭제·키 폐기 | 보존정책·삭제증적 | `CACHE_DELETED/KEY_RETIRED` 목표 |

### 4.2 대체 흐름

| ALT | 상황 | 처리 |
|---|---|---|
| ALT-01 | B 병원이 먼저 요청 | B 의료진이 환자 참조·A 병원·목적을 입력하면 Control이 A 병원 확인과 환자 동의 요청을 생성한다. 동의·A 승인 전 영상 메타데이터를 제공하지 않는다. `[구현 예정]` |
| ALT-02 | 모바일 링크 동의 | QR 대신 TLS 보호 링크에서 opaque nonce를 교환하며 동일 본인확인·TTL·1회성 정책을 적용한다. `[결정 필요]` |
| ALT-03 | 원격조회만 허용 | QIDO/WADO는 허용하되 다운로드 endpoint와 로컬 저장을 403으로 차단한다. |
| ALT-04 | 조회 허용·PACS 저장 차단 | VIEW는 ALLOW, `PACS_IMPORT`가 없으면 STOW/C-STORE를 DENY한다. |
| ALT-05 | 일부 Series만 허용 | QIDO 결과와 WADO 요청을 허용 Series UID로 제한한다. |

## 5. 공통 오류·악용 처리 원칙

| 오류·악용 | 처리 | 상태·감사 |
|---|---|---|
| QR/Ticket 만료 | 교환 거부, 새 요청 안내 | EXPIRED, `TICKET_EXPIRED` |
| 재사용·복제·동시사용 | 원자 소비로 최대 한 건만 성공, 이후 거부·경보 | CONSUMED/INVALID, 보안 이벤트 |
| 타 사용자·타 병원 | principal/organization 바인딩 불일치 거부 | DENY + HOSPITAL/USER_MISMATCH |
| 다른 환자·Study/Series | ABAC scope 불일치 거부 | DENY + SCOPE_MISMATCH |
| 동의 거부·철회 | 발급·미래조회 차단, 활성 토큰 폐기 | REJECTED/REVOKED |
| 의료진 인증·MFA 실패 | Ticket 정보·영상·메타데이터 미제공 | 401, LOGIN_FAILED |
| 인증서 만료·mTLS 실패 | handshake 단계에서 차단 | TLS 오류·인증서 fingerprint 참조 |
| A PACS/B Gateway/Relay 장애 | 유한 timeout, 직접 우회 금지 | FAILED/PARTIAL, component·correlation |
| 네트워크 단절·일부 객체 실패 | 성공·실패 UID 분리, 정책 재검증 후 제한 재시도 | PARTIAL/FAILED |
| 무결성 실패 | 복호화·표시·편입 중지, 암호문 격리/삭제 | FAILED + INTEGRITY_FAILURE |
| 감사 기록 실패 | 중요 ALLOW를 중단하거나 승인된 내구성 큐 사용 | 정책 결정 필요 |
| 권한 불일치·비인가 다운로드 | 403, 일반화된 UI 메시지 | ACCESS_DENIED + reasonCode |

## 6. 세부 유스케이스

각 유스케이스의 보안통제에는 적용되는 통제만 기재한다. 실제 IdP·KMS·B PACS가 필요한 시험은 외부 자원 제공 전 BLOCKED다.

### UC-01 사용자 및 기관 인증

- **우선순위/상태:** P0 / 부분 구현(로컬 Mock·JWT), 실제 IdP/MFA BLOCKED
- **목적:** 사용자 신원·역할·소속기관을 검증해 서버 principal을 만든다.
- **주/보조 행위자:** A/B 의료진 / IdP, Control Plane, 병원 관리자
- **관련 시스템·요구사항:** IdP, Auth Provider / FR-AUTH-001~005, FR-INST-001~003
- **사전조건:** 기관·사용자 등록, IdP 설정. 동의·Study·Ticket은 불필요.
- **시작조건:** 사용자가 로그인 또는 보호된 기능 진입을 요청한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | 사용자 | 로그인 요청 | TLS, redirect URI | 로그인 시도 |
| 2 | IdP | 인증·MFA 후 token 발급 | 계정·MFA·서명 | 성공/실패 |
| 3 | Control | JWT 검증·principal 정규화 | iss/aud/exp, role, hospital | LOGIN_SUCCESS/FAILED |
| 4 | Policy | 요청 API 권한 확인 | RBAC·기관 | ALLOW/DENY |

- **대체 흐름:** P0 로컬은 DEVELOPMENT_MOCK/TEST를 쓰되 production에서 Mock 시작을 차단한다.
- **예외 흐름:** 잘못된 서명·만료·기관 미등록·MFA 미완료는 401/403이고 자원 정보를 반환하지 않는다.
- **사후조건:** 성공 시 최소 세션과 principal, 실패 시 세션 없음. 재로그인 가능.
- **보안통제:** OIDC/OAuth, MFA, RBAC, TLS 1.3 우선, 최소 claims, 감사, 기본 거부.

### UC-02 A 병원 전송 요청 생성

- **우선순위/상태:** P0 / 구현 예정(현재 동의 직접 생성 흐름만 존재)
- **목적:** A 의료진이 B 병원·목적·Study/Series·행위를 지정한 요청을 만든다.
- **행위자/시스템:** A 의료진 / A PACS, Control, 정책엔진
- **관련 요구사항:** FR-TRANSFER-001, FR-CONSENT-001~002, FR-POLICY-001~002
- **사전조건:** A 의료진 인증, 기관 ACTIVE, 합성 Study 존재, A Gateway ONLINE.
- **시작조건:** A 의료진이 `전송 요청`을 선택한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | A 의료진 | 환자·Study/Series 선택 | 소속·업무범위 | UID 참조 |
| 2 | A 의료진 | B 병원·목적·VIEW/DOWNLOAD 지정 | 기관·목적 enum | 요청 초안 |
| 3 | Control | 최소범위·기간 검증 | ABAC 사전검사 | transferId/auditSessionId |
| 4 | Control | CONSENT_PENDING 생성 | 중복·상태전이 | REQUEST_CREATED 목표 |

- **대체 흐름:** B 선요청은 ALT-01로 환자·A 승인 전 메타데이터를 숨긴다. 일부 Series만 선택할 수 있다.
- **예외 흐름:** 타기관 환자, 미등록 B, 존재하지 않는 UID, 무기한 범위는 거부한다.
- **사후조건:** 요청은 CONSENT_PENDING, 영상 접근 불가, 취소 가능.
- **보안통제:** RBAC·ABAC, Study/Series 제한, 기관·목적 바인딩, 최소권한, 감사.

### UC-03 환자 동의 요청 발급

- **우선순위/상태:** P0 / 구현 예정
- **목적:** 전송 요청의 내용을 환자가 검토할 수 있는 동의 요청으로 발급한다.
- **행위자/시스템:** Control / 환자 모바일, Consent Service
- **관련 요구사항:** FR-CONSENT-001~006, FR-QR-001, FR-QR-006
- **사전조건:** UC-02 요청, 환자 연락·본인확인 채널 `[결정 필요]`.
- **시작조건:** A 의료진이 동의 요청 발송을 확정한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Control | 요청 스냅샷 생성 | 변경불가 항목·버전 | consentRequestId |
| 2 | Ticket Service | opaque 동의참조 발급 | PII·DICOM 없음, TTL | digest·issuedAt |
| 3 | 환자 모바일 | QR/링크로 요약 표시 | 합성 데이터·최소표시 | CONSENT_REQUESTED |

- **대체 흐름:** 모바일 링크를 사용할 수 있으나 QR과 동일한 1회성·TTL 정책을 적용한다.
- **예외 흐름:** 연락 채널 실패·요청 만료 시 영상 접근 없이 EXPIRED 처리한다.
- **사후조건:** 동의는 CONSENT_PENDING, 승인 전 Ticket 교환 불가.
- **보안통제:** TLS, opaque 참조, TTL, PII 최소화, 감사, 기본 거부.

### UC-04 QR 스캔 및 환자 동의

- **우선순위/상태:** P0 / 구현 예정(동의 API는 구현됨)
- **목적:** 환자/승인된 보호자가 동의 내용을 확인하고 승인 또는 거부한다.
- **행위자/시스템:** 환자 또는 보호자 / 모바일, Control, Consent Service
- **관련 요구사항:** FR-CONSENT-001~006, FR-QR-001~003
- **사전조건:** 미만료 CONSENT_PENDING 요청, 본인확인 가능.
- **시작조건:** 환자가 QR 또는 모바일 링크를 연다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | 모바일→Control | opaque 참조 제출 | TTL·상태 | CONSENT_VIEWED |
| 2 | 환자 | A/B·목적·Study/Series·기간·권한 확인 | 본인/보호자 권한 | 확인 시각 |
| 3 | 환자 | 승인 또는 거부 | 명시적 선택 | APPROVED/REJECTED 목표 |
| 4 | Control | 결과 저장 | 원자 상태전이 | CONSENT_APPROVED/REJECTED |

- **대체 흐름:** 일부 Series 또는 원격조회만 선택하도록 범위를 축소할 수 있다. 범위 확대는 새 요청이 필요하다.
- **예외 흐름:** 만료·복제·다른 환자·이미 처리된 요청은 거부한다.
- **사후조건:** 승인 시 동의 APPROVED, 거부 시 REJECTED이며 Ticket 발급 없음.
- **보안통제:** 본인확인, ABAC, 범위·목적 바인딩, TTL, 최소표시, 감사.

### UC-05 Transfer Ticket 발급 및 바인딩

- **우선순위/상태:** P0 / 구현 예정
- **목적:** 승인 동의를 B 병원에서 한 번 교환할 수 있는 불투명 Ticket으로 만든다.
- **행위자/시스템:** Ticket Service / Control, KMS 또는 CSPRNG
- **관련 요구사항:** FR-QR-001~006, FR-POLICY-007~008
- **사전조건:** APPROVED 동의, A/B 기관 ACTIVE, Study 존재.
- **시작조건:** 동의 승인 트랜잭션이 완료된다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Ticket Service | 고엔트로피 원문 생성 | CSPRNG | 원문은 제한 채널만 |
| 2 | Control | A/B·환자참조·동의·목적·scope·행위 바인딩 | 필수 필드 | digest·jti·TTL |
| 3 | Control | ISSUED 상태 저장 | 1회성·원자 소비 | TICKET_ISSUED 목표 |
| 4 | UI | QR/링크 제공 | URL·로그 노출 금지 | 전달 이벤트 |

- **대체 흐름:** 재발급은 기존 Ticket을 폐기하고 새 jti를 만든다.
- **예외 흐름:** 동의 철회·기관 비활성·과도한 TTL이면 발급하지 않는다.
- **사후조건:** 미사용 Ticket ISSUED; DICOM 접근권한은 아직 없음.
- **보안통제:** 일회용 Ticket, TTL, 재사용 방지, 기관·목적·scope 바인딩, 키 관리, 감사.

### UC-06 B 병원 의료진 인증

- **우선순위/상태:** P0 / 부분 구현, 실제 IdP/MFA BLOCKED
- **목적:** Ticket 제시자와 B 병원 소속·역할을 독립적으로 확인한다.
- **행위자/시스템:** B 의료진 / IdP, Control, B Edge
- **관련 요구사항:** FR-AUTH-001~005, FR-INST-002
- **사전조건:** B 기관·사용자 등록. 동의·Study·Gateway는 Ticket 교환 시 검사.
- **시작조건:** B 의료진이 Highpass Viewer 또는 Ticket 입력 화면에 로그인한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | B 의료진→IdP | 로그인·MFA | 계정·인증요소 | IdP 이벤트 |
| 2 | Control | token 검증 | iss/aud/exp/signature | LOGIN_SUCCESS/FAILED |
| 3 | Control | 병원·역할 매핑 | organization=B, DOCTOR | principal |

- **대체 흐름:** 로컬 PoC에서는 합성 principal을 사용한다.
- **예외 흐름:** QR만 제시하고 인증하지 않거나 타기관 의료진이면 영상과 상세 메타데이터를 제공하지 않는다.
- **사후조건:** 인증 세션 또는 실패 감사.
- **보안통제:** OIDC/OAuth, MFA, RBAC, 기관 바인딩, TLS, 감사, 기본 거부.

### UC-07 QR 또는 Ticket 검증

- **우선순위/상태:** P0 / 구현 예정
- **목적:** Ticket 유효성·바인딩·미사용 상태를 확인하고 한 번만 소비한다.
- **행위자/시스템:** B 의료진 / B Edge, Ticket Service, 정책엔진
- **관련 요구사항:** FR-QR-002~006, FR-POLICY-008
- **사전조건:** UC-06 인증, ISSUED·미만료 Ticket.
- **시작조건:** B 의료진이 QR을 스캔하거나 원문을 보안 입력란에 제출한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | B Edge | 원문을 body/header로 전달 | query string 금지 | PRESENTED |
| 2 | Ticket Service | digest·상태·TTL 조회 | ISSUED·미만료 | validation result |
| 3 | Policy | B 기관·사용자·동의·scope 바인딩 | 모두 일치 | ALLOW/DENY |
| 4 | Ticket Service | 원자적으로 CONSUMED 전환 | compare-and-set | TICKET_CONSUMED |

- **대체 흐름:** 모바일 링크 교환도 동일 원자 소비를 사용한다.
- **예외 흐름:** 만료·재사용·복제·타기관·타사용자·철회동의는 거부하고 반복 시 경보한다.
- **사후조건:** 성공 시 CONSUMED와 정책 단계 진행, 실패 시 DICOM 토큰 없음.
- **보안통제:** 일회용, TTL, replay 방지, ABAC, TLS, 감사, 기본 거부.

### UC-08 접근정책 판단

- **우선순위/상태:** P0 / 구현됨(일부 Ticket 속성은 구현 예정)
- **목적:** 요청 행위에 필요한 모든 RBAC·ABAC 조건을 서버에서 평가한다.
- **행위자/시스템:** 정책엔진 / Control, Consent Service
- **관련 요구사항:** FR-POLICY-001~008, FR-CONSENT-004~005
- **사전조건:** 인증 principal, 동의, 소비된 Ticket 또는 직접 승인 context, Study 존재.
- **시작조건:** 검색·조회·다운로드·편입 토큰을 요청한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Policy | 동의 상태·기간 검사 | APPROVED/ACTIVE, 유효창 | reasonCode |
| 2 | Policy | A/B·사용자·목적 검사 | exact binding | reasonCode |
| 3 | Policy | Study/Series·행위 검사 | VIEW/DOWNLOAD/PACS_IMPORT 분리 | ALLOW/DENY |
| 4 | Control | scoped 접근토큰 발급 | 짧은 TTL, iss/aud/jti | TOKEN_ISSUED/DENIED |

- **대체 흐름:** VIEW만 ALLOW하거나 일부 Series만 scope에 넣을 수 있다. PACS 저장은 별도 결정이다.
- **예외 흐름:** 조건 하나라도 실패하면 상세 내부값 없이 403과 표준 reasonCode를 기록한다.
- **사후조건:** ALLOW 시 scoped token, DENY 시 token 없음.
- **보안통제:** RBAC·ABAC, 최소권한, 범위·기관·목적 바인딩, TTL, 감사, 기본 거부.

### UC-09 A 병원 PACS Study 검색

- **우선순위/상태:** P0 / 구현됨(현재 Control이 A Edge 역할 일부 수행)
- **목적:** B Viewer가 승인된 Study/Series 메타데이터만 QIDO-RS로 검색한다.
- **행위자/시스템:** B 의료진 / Viewer, B Edge, A Edge, A PACS
- **관련 요구사항:** FR-DICOM-001~004, FR-VIEW-001~003
- **사전조건:** 유효 VIEW token, A/B Gateway ONLINE, A PACS Study 존재.
- **시작조건:** B 의료진이 승인된 영상 목록을 연다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Viewer→B Edge | QIDO 요청 | Authorization header | SEARCH_REQUESTED |
| 2 | B/A Edge | token·mTLS·UID/scope 재검증 | 기관·Study/Series | ALLOW/DENY |
| 3 | A Edge→PACS | QIDO-RS 호출 | 승인 조건만 | 최소 DICOM JSON |
| 4 | B Edge→Viewer | 허용 결과 반환 | 범위 밖 제거 | QIDO_RESULT |

- **대체 흐름:** 일부 Series만 반환하고 다운로드는 계속 차단할 수 있다.
- **예외 흐름:** 토큰 만료, scope 위반, mTLS/PACS 장애는 401/403/502/504로 구분한다.
- **사후조건:** 원본 이동 없이 승인 메타데이터 표시.
- **보안통제:** TLS/mTLS, scoped token, Study/Series 제한, 최소데이터, 감사, 기본 거부.

### UC-10 B 병원 원격 영상 조회

- **우선순위/상태:** P0 / 부분 구현(브라우저 캔버스 자동검증 필요)
- **목적:** 승인된 Instance/Frame을 WADO-RS로 필요할 때 조회한다.
- **행위자/시스템:** B 의료진 / OHIF, B/A Edge, A PACS, Relay(목표)
- **관련 요구사항:** FR-DICOM-003~005, FR-VIEW-001~006, FR-TRANSFER-002~006
- **사전조건:** UC-09 결과, 유효 VIEW token, Gateway·PACS 가용.
- **시작조건:** 사용자가 Series/Instance를 선택한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Viewer | WADO Instance/Frame 요청 | URL token 금지 | IMAGE_VIEW_REQUESTED |
| 2 | B/A Edge | scope·동의·토큰·mTLS 재검증 | VIEW 권한 | ACCESS_ALLOWED/DENIED |
| 3 | A PACS→Edge | 승인 객체 반환 | UID·content-type | 객체 hash/사용량 |
| 4 | Edge/Relay | 암호문 중계·무결성 검사 | AEAD 목표 | TRANSFER/INTEGRITY |
| 5 | Viewer | Reference Viewer 표시 | 합성·PoC 배지 | IMAGE_VIEWED |

- **대체 흐름:** VIEW_ONLY는 표시만 허용하고 다운로드를 403으로 차단한다. Progressive Loading을 적용한다.
- **예외 흐름:** 철회·만료·타 UID·Relay/PACS 장애·무결성 실패 시 표시하지 않는다.
- **사후조건:** A 원본 유지, Viewer 메모리의 필요 객체만 사용, 임시자료 TTL 대상.
- **보안통제:** TLS/mTLS, AES-256-GCM 목표, 키 관리, 최소권한, 범위 제한, 감사, 기본 거부.

### UC-11 선택적 PACS 편입

- **우선순위/상태:** P1 / 구현 예정
- **목적:** 별도 승인된 영상만 B PACS에 STOW-RS 또는 C-STORE로 저장한다.
- **행위자/시스템:** B 의료진 / 정책엔진, B Edge, B PACS, Audit
- **관련 요구사항:** FR-PACS-001~006, FR-POLICY-005, FR-TRANSFER-006
- **사전조건:** 조회 가능, `PACS_IMPORT` 권한, B 저장정책 승인, 무결성 성공, B PACS ONLINE.
- **시작조건:** B 의료진이 `PACS 편입`을 명시적으로 요청한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | B 의료진 | 대상 Series/Instance 선택 | 별도 권한 | IMPORT_REQUESTED |
| 2 | Policy | 동의·기관·PACS_IMPORT 평가 | VIEW와 분리 | ALLOW/DENY |
| 3 | B Edge | manifest·AEAD tag·UID 검증 | 변조·중복 차단 | INTEGRITY_VERIFIED |
| 4 | B Edge→PACS | STOW-RS 또는 승인 C-STORE | mTLS/AE·저장정책 | 객체별 결과 |
| 5 | Control | COMPLETED/PARTIAL/FAILED 기록 | 영수증 대조 | PACS_IMPORT_RESULT |

- **대체 흐름:** 조회는 허용하지만 저장권한이 없으면 원격조회만 계속한다. 일부 Series만 편입 가능하다.
- **예외 흐름:** B PACS 장애·부분 실패·중복 SOP·무결성 실패는 PARTIAL/FAILED이며 제한 재시도한다.
- **사후조건:** 성공 사본은 B 병원 정책 대상; 이후 동의 철회가 사본 자동삭제를 보장하지 않음.
- **보안통제:** 별도 ABAC, mTLS, AES-GCM, 무결성, 최소권한, 감사, 기본 거부.

### UC-12 전송상태 확인

- **우선순위/상태:** P0 / 구현 예정(사용량 로그만 존재)
- **목적:** 요청·동의·Ticket·조회·편입의 상태와 다음 조치를 표시한다.
- **행위자/시스템:** A/B 의료진, 환자 / Control, Transfer Store
- **관련 요구사항:** FR-TRANSFER-001, FR-TRANSFER-007, FR-ERROR-005
- **사전조건:** transferId와 조회 권한.
- **시작조건:** 사용자가 전송 상세 또는 상태 목록을 연다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | UI→Control | transferId 조회 | principal·기관 | STATUS_VIEWED |
| 2 | Control | 상태·최근 오류·재시도 가능성 조회 | 민감정보 제거 | 상태·timestamp |
| 3 | UI | 텍스트+색상+다음 조치 표시 | 접근성 | 조회 감사 |

- **대체 흐름:** 환자는 동의 상태만, 의료진은 소속기관 업무 상태만 본다.
- **예외 흐름:** 타기관·존재하지 않는 ID는 정보 노출 없이 403/404 정책을 따른다.
- **사후조건:** 상태 변경 없음, 감사만 생성.
- **보안통제:** RBAC/ABAC, 기관 격리, 최소표시, 감사.

### UC-13 동의 철회

- **우선순위/상태:** P0 / 구현됨(기존 ACTIVE→REVOKED)
- **목적:** 환자 의사 변경 후 신규·기존 접근을 차단한다.
- **행위자/시스템:** 환자 / Consent Service, Ticket Service, Gateway
- **관련 요구사항:** FR-CONSENT-005, FR-QR-005, FR-POLICY-008
- **사전조건:** APPROVED/ACTIVE 동의, 환자 인증.
- **시작조건:** 환자가 동의 철회를 확정한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | 환자→Control | 철회 요청 | 동의 소유권 | REVOKE_REQUESTED |
| 2 | Consent Service | REVOKED 원자 전환 | 현재 상태 | CONSENT_REVOKED |
| 3 | Control | 미사용 Ticket·활성 토큰 폐기 | consentId 일치 | TOKEN/TICKET_REVOKED |
| 4 | Gateway | 후속 요청 거부 | 상태 재검증 | ACCESS_DENIED |

- **대체 흐름:** 이미 만료된 동의는 EXPIRED 유지와 사용자 안내를 적용한다.
- **예외 흐름:** 타 환자·이미 철회·동시 접근은 상태 일관성을 지키며 거부한다.
- **사후조건:** 미래 조회·발급 불가; B PACS 기편입 사본은 별도 병원정책.
- **보안통제:** 본인확인, 상태 원자성, 토큰 폐기, 감사, 기본 거부.

### UC-14 Ticket 만료 및 폐기

- **우선순위/상태:** P0 / 구현 예정(접근토큰 만료는 구현됨)
- **목적:** 유효시간 경과·취소·위험탐지 Ticket을 사용할 수 없게 한다.
- **행위자/시스템:** Scheduler/Control / Ticket Store, Audit
- **관련 요구사항:** FR-QR-003, FR-QR-005, FR-RETENTION-002
- **사전조건:** ISSUED Ticket.
- **시작조건:** 현재시각이 expiresAt을 넘거나 폐기 이벤트가 발생한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Scheduler/Control | 대상 조회 | 서버 기준시각 | candidate IDs |
| 2 | Ticket Store | EXPIRED/REVOKED 전환 | 원자 상태 | TICKET_EXPIRED/REVOKED |
| 3 | Retention | 원문·임시참조 삭제 | 보존정책 | 삭제증적 |

- **대체 흐름:** 사용자 재발급 요청은 기존 Ticket 폐기 후 새 동의 상태를 재검증한다.
- **예외 흐름:** clock skew 허용치를 넘는 요청은 거부한다. `[허용치 결정 필요]`
- **사후조건:** 교환 불가, 새 요청 가능 여부 표시.
- **보안통제:** TTL, 폐기, 최소보존, 감사, 기본 거부.

### UC-15 QR 재사용 차단

- **우선순위/상태:** P0 / 구현 예정
- **목적:** 이미 소비된 QR/Ticket의 재사용·동시사용을 차단한다.
- **행위자/시스템:** Ticket Service / Policy, Security Monitoring
- **관련 요구사항:** FR-QR-004, FR-POLICY-008, FR-ERROR-006
- **사전조건:** CONSUMED 또는 동시 제출 Ticket.
- **시작조건:** 두 번째 또는 병렬 교환 요청이 도착한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Ticket Service | digest 조회·compare-and-set | ISSUED만 소비 가능 | attempt count |
| 2 | Policy | 이미 소비됨 확인 | 재사용 DENY | TICKET_REPLAY_DENIED |
| 3 | Monitoring | 반복·타기관 패턴 평가 | 룰 임계값 | anomaly alert |

- **대체 흐름:** 네트워크 응답 유실은 idempotency key로 최초 결과를 안전하게 재조회한다. `[결정 필요]`
- **예외 흐름:** 복제본·다른 사용자·다른 병원은 동일하게 거부하고 공격 상관관계를 기록한다.
- **사후조건:** 기존 접근 세션 정책 유지 여부는 결정 필요; 신규 토큰 발급 없음.
- **보안통제:** 원자성, replay 방지, ABAC, 이상탐지, 감사, 기본 거부.

### UC-16 전송 중단 및 재시도

- **우선순위/상태:** P0 / 구현 예정
- **목적:** 네트워크·구성요소 장애 후 중복·scope 이탈 없이 조회/편입을 재개한다.
- **행위자/시스템:** Edge/Transfer Worker / Relay, PACS, Policy
- **관련 요구사항:** FR-TRANSFER-004~007, FR-ERROR-004~005
- **사전조건:** IN_PROGRESS/PARTIAL/FAILED, 재시도 가능 오류, 동의·토큰 재검증 가능.
- **시작조건:** timeout·connection reset·일부 객체 실패가 발생한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Worker | 성공·실패 UID/청크 저장 | manifest 일치 | TRANSFER_INTERRUPTED |
| 2 | Policy | 동의·권한·Ticket/token 상태 재검증 | 철회·만료 시 중단 | retry decision |
| 3 | Worker | 재시도 가능 오류만 backoff | 횟수·timeout 상한 | RETRY_STARTED |
| 4 | Edge | 중복 UID·nonce 방지 후 재개 | idempotency·AEAD | 결과·상태 |

- **대체 흐름:** 사용자가 명시적으로 새 요청을 만들 수 있다.
- **예외 흐름:** 정책오류·무결성 실패·재시도 초과는 즉시 FAILED이고 우회하지 않는다.
- **사후조건:** COMPLETED/PARTIAL/FAILED, 임시자료 TTL 유지, 재시도 횟수 감사.
- **보안통제:** 정책 재검증, nonce 재사용 방지, TLS/mTLS, timeout, 감사, 기본 거부.

### UC-17 무결성 검증 실패 처리

- **우선순위/상태:** P0 / 구현 예정
- **목적:** 변조·손상된 영상이 표시되거나 PACS에 편입되지 않게 한다.
- **행위자/시스템:** A/B Edge / Relay, KMS, Audit
- **관련 요구사항:** FR-TRANSFER-003, FR-TRANSFER-006, NFR-CIA-002
- **사전조건:** manifest/hash/AEAD tag가 있는 수신 객체.
- **시작조건:** hash 또는 tag 불일치가 발생한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | B Edge | 객체·manifest·tag 검사 | constant-time 비교 적용 검토 | INTEGRITY_CHECK |
| 2 | B Edge | 복호화·표시·편입 중지 | fail closed | INTEGRITY_FAILURE |
| 3 | Control/Security | 작업 FAILED·경보 | transfer/session 상관 | security alert |
| 4 | Retention | 실패 암호문 격리 또는 삭제 | 증거보존 정책 | disposal evidence |

- **대체 흐름:** 전송 손상으로 판정된 경우 새 키·nonce로 처음부터 재요청한다.
- **예외 흐름:** 반복 실패는 재시도하지 않고 보안사고 절차로 전환한다.
- **사후조건:** 사용자에게 일반화 오류, 영상 미사용, 조사 이벤트 생성.
- **보안통제:** AES-256-GCM, key separation, manifest hash, 최소권한, 감사, 기본 거부.

### UC-18 감사로그 조회

- **우선순위/상태:** P0 / 구현됨(운영 WORM/SIEM은 BLOCKED)
- **목적:** 승인된 관리자가 업무 흐름과 거부·이상 이벤트를 추적한다.
- **행위자/시스템:** 보안관리자 / Audit API, Audit Store
- **관련 요구사항:** FR-AUDIT-001~006, NFR-AUD-001
- **사전조건:** `audit:read` 권한, 조회범위·목적.
- **시작조건:** 관리자가 기간·기관·session/transfer 필터로 조회한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | 관리자→API | 필터 조회 | RBAC·기관·limit | AUDIT_QUERY |
| 2 | Audit Store | 최소필드 결과 | 민감필드 마스킹 | events |
| 3 | Integrity Service | Hash Chain 검증 | previousHash/recordHash | integrity result |
| 4 | UI | 종단 타임라인 표시 | 읽기 전용 | 조회 행위 감사 |

- **대체 흐름:** 병원 관리자는 소속기관 요약만, 보안관리자는 승인된 상세만 조회한다.
- **예외 흐름:** 무권한 401/403, PUT/PATCH/DELETE 405, 무결성 실패 경보.
- **사후조건:** 로그 변경 없음, 조회 이벤트 추가.
- **보안통제:** RBAC, 최소필드, append-only, Hash Chain, TLS, 감사.

### UC-19 장애 및 복구 처리

- **우선순위/상태:** P0 / 부분 구현
- **목적:** PACS·Gateway·Relay·DB 장애를 구분하고 정책 우회 없이 복구한다.
- **행위자/시스템:** 운영자 / Monitoring, Control, Edge, Relay, PACS
- **관련 요구사항:** FR-ERROR-001~006, FR-TRANSFER-004~005
- **사전조건:** health/timeout/경보 설정.
- **시작조건:** health 실패, connection refused, DNS/TLS/timeout 또는 DB 오류가 발생한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Monitoring | 장애 유형 분류 | DNS/refused/TLS/timeout 분리 | component event |
| 2 | Control | 신규 요청 중단·상태 DEGRADED/OFFLINE | fail closed | INCIDENT_OPENED |
| 3 | 운영자 | Runbook 복구·readiness 확인 | 승인 절차 | action log |
| 4 | Control | 정책·동의 재검증 후 제한 재개 | readiness PASS | INCIDENT_CLOSED |

- **대체 흐름:** Relay 장애 시 승인된 Edge-to-Edge 경로가 사전 설계·인증된 경우만 사용한다. 임의 직접 PACS 연결은 금지한다.
- **예외 흐름:** 복구 실패·감사 실패·데이터 잔존은 운영/보안 에스컬레이션한다.
- **사후조건:** READY 또는 FAILED, 조치·영향·잔존자료 기록.
- **보안통제:** 유한 timeout, mTLS, readiness, 최소권한, 감사, 기본 거부.

### UC-20 비인가 접근 차단

- **우선순위/상태:** P0 / 구현됨·일부 신규 Ticket 규칙 예정
- **목적:** 인증·동의·scope·행위·네트워크 경계를 위반한 접근을 차단하고 탐지한다.
- **행위자/시스템:** 비인가 사용자/클라이언트 / Edge, Policy, Monitoring
- **관련 요구사항:** FR-POLICY-001~008, FR-DICOM-004, FR-ERROR-006
- **사전조건:** 없음.
- **시작조건:** 무인증, 타기관, 범위 밖 UID, 다운로드·PACS 저장, 직접 PACS 접근을 시도한다.

| 단계 | 수행 주체 | 수행 내용 | 검증·정책 | 데이터·감사로그 |
|---|---|---|---|---|
| 1 | Edge/Policy | 인증·mTLS·동의·scope·행위 평가 | 모두 필수 | deny reason |
| 2 | Edge | 요청 차단 | 401/403 또는 TLS 거부 | ACCESS_DENIED |
| 3 | UI/API | 일반화 오류 제공 | 내부정보 미노출 | correlation ID |
| 4 | Monitoring | 반복·대량·야간·타기관 탐지 | 룰 임계값 | alert |

- **대체 흐름:** 합법적인 권한 부족은 새 동의·권한 요청으로 안내하되 자동 승격하지 않는다.
- **예외 흐름:** 브라우저-PACS 직접 경로와 무인증 mTLS는 네트워크/handshake 수준에서 차단한다.
- **사후조건:** 자원·토큰 미제공, 거부·경보 감사.
- **보안통제:** OIDC/MFA, RBAC/ABAC, mTLS, scope·행위 분리, 최소권한, 감사, 기본 거부.

## 7. 상태 전이

### 7.1 동의 상태

| 상태 | 진입조건 | 허용 다음 상태 | 접근 가능 | 감사 이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|
| DRAFT | 요청 초안 | CONSENT_PENDING, DELETED | 불가 | CONSENT_DRAFTED 목표 | 초안 삭제 가능 |
| CONSENT_PENDING | 환자 확인 요청 발급 | APPROVED, REJECTED, EXPIRED, REVOKED | 불가 | CONSENT_REQUESTED 목표 | Ticket 초안 TTL |
| APPROVED | 명시적 승인·유효성 성공 | EXPIRED, REVOKED | 정책 성공 시 가능 | CONSENT_APPROVED 목표 | 이력 유지 |
| REJECTED | 환자 거부 | 없음 또는 새 DRAFT | 불가 | CONSENT_REJECTED 목표 | 이력 정책 적용 |
| EXPIRED | validUntil 경과 | 없음 또는 새 DRAFT | 불가 | 현재 일부 구현 | 활성 토큰 폐기 |
| REVOKED | 환자 철회 | 없음 또는 새 DRAFT | 미래 접근 불가 | 구현됨 | Ticket/토큰 폐기 |

**현재 코드 비교:** `ConsentStatus`는 `ACTIVE/REVOKED/EXPIRED`만 제공한다. v2에서는 `ACTIVE`를 승인 완료 상태로 매핑할 수 있으나, `DRAFT`, `CONSENT_PENDING`, `REJECTED`와 승인 이벤트가 없다. 기존 API 호환성과 DB 마이그레이션을 검토해 상태를 확장하거나 별도 `consent_requests` 상태로 분리해야 한다.

### 7.2 전송 상태

| 상태 | 진입조건 | 허용 다음 상태 | 접근 가능 | 감사 이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|
| CREATED | 요청 생성 | AUTHORIZED, EXPIRED, REVOKED, DELETED | 불가 | TRANSFER_CREATED 목표 | 초안 정책 |
| AUTHORIZED | 동의·기관·행위 승인 | READY, EXPIRED, REVOKED, FAILED | 토큰 전 불가 | TRANSFER_AUTHORIZED 목표 | Ticket 상태 연계 |
| READY | Gateway·PACS 준비 | IN_PROGRESS, FAILED, EXPIRED, REVOKED | 정책 내 가능 | TRANSFER_READY 목표 | 임시자료 없음/최소 |
| IN_PROGRESS | QIDO/WADO/편입 시작 | PARTIAL, COMPLETED, FAILED, REVOKED | 범위 내 | TRANSFER_STARTED 목표 | TTL 시작 |
| PARTIAL | 일부 객체 성공 | IN_PROGRESS, COMPLETED, FAILED, DELETED | 성공 객체 정책 내 | TRANSFER_PARTIAL 목표 | 실패 임시자료 처리 |
| COMPLETED | 목표 조회/편입 완료 | EXPIRED, REVOKED, DELETED | 동의·토큰 유효 시 | TRANSFER_COMPLETED 목표 | 임시자료 삭제 |
| FAILED | 비복구 오류/재시도 초과 | READY, IN_PROGRESS, DELETED | 불가 | TRANSFER_FAILED 목표 | 격리/삭제 |
| EXPIRED | Ticket/동의 만료 | DELETED | 불가 | TRANSFER_EXPIRED 목표 | token/cache 폐기 |
| REVOKED | 동의·정책 철회 | DELETED | 불가 | TRANSFER_REVOKED 목표 | token/cache 폐기 |
| DELETED | TTL/승인 삭제 | 없음 | 불가 | TRANSFER_DELETED 목표 | 삭제증적 유지 |

**현재 코드 비교:** 독립 전송 상태 엔티티는 없고 `transfer_usage_logs`와 DICOM 접근토큰 상태만 존재한다. 상태기계·허용 전이·낙관적 잠금·idempotency가 구현 예정이다.

### 7.3 Ticket 상태

`ISSUED → CONSUMED | EXPIRED | REVOKED`, `CONSUMED → REVOKED`를 기본 목표로 한다. `CONSUMED` 재사용은 상태를 되돌리지 않고 보안 이벤트만 추가한다. `[기존 세션 강제종료 정책 결정 필요]`

## 8. 보안·개인정보 흐름

| 단계 | 보호대상 | 주요 위협 | 보안통제 | 감사로그 |
|---|---|---|---|---|
| 로그인 | 계정·claims | 위조·계정탈취 | OIDC, MFA, iss/aud/exp, TLS | LOGIN_SUCCESS/FAILED |
| 요청 생성 | 환자 참조·UID·목적 | 과다범위·타기관 | RBAC/ABAC, 최소범위 | REQUEST_CREATED |
| 동의·QR | 동의·Ticket | PII 노출·복제·피싱 | opaque 참조, 본인확인, TTL | REQUEST/VIEW/APPROVE/REJECT |
| Ticket 교환 | 원문·바인딩 | 탈취·재사용·타사용자 | digest, 원자 소비, 기관·사용자 바인딩 | PRESENTED/CONSUMED/DENIED |
| 정책 | principal·동의·scope | 권한상승·scope escape | 서버 RBAC+ABAC, 기본 거부 | ALLOW/DENY·reasonCode |
| QIDO | 최소 메타데이터 | 타 환자 검색·열거 | scoped token, 결과 필터, mTLS | SEARCH/RESULT |
| WADO | DICOM 객체 | 직접접근·도청·변조 | Edge 경유, TLS/mTLS, AEAD 목표 | IMAGE_VIEW/TRANSFER |
| Relay | 암호문·라우팅 | 평문 노출·잔존 | 평문/DEK 금지, TTL 캐시, 최소 로그 | RELAY/CACHE_DELETE |
| PACS 편입 | 승인 사본 | 무권한 저장·부분성 | PACS_IMPORT, 무결성, mTLS | IMPORT_REQUEST/RESULT |
| 감사 | 행위·사유·상관ID | 삭제·변조·과다노출 | append-only, Hash Chain, RBAC | AUDIT_QUERY/INTEGRITY |
| 철회·만료 | 상태·token | 철회 후 재접근 | 실시간 상태 재검증, token 폐기 | REVOKE/EXPIRE/DENY |
| 장애·삭제 | 캐시·키·재개자료 | fail-open·데이터 잔존 | 기본 거부, timeout, 키 폐기, 삭제증적 | INCIDENT/DELETE |

검토 결론:

- QR만으로 영상 접근할 수 없다. B 의료진 인증·MFA와 정책 승인 후 별도 접근토큰이 필요하다.
- Cloud Relay는 목표 설계상 평문 DICOM과 DEK를 볼 수 없다. 현재 Relay 자체는 미구현이다.
- 전송·캐시는 AEAD 암호화 목표이며 PostgreSQL·백업·운영 WORM은 외부환경 검증이 필요하다.
- B PACS 사본은 B 병원의 의료정보·보존정책 대상이며 동의 철회만으로 자동 삭제를 보장하지 않는다.
- 감사 Hash Chain은 로컬 구현이 있으나 운영 불변 저장은 BLOCKED다.
- 장애 시 인증·정책·PACS 경계를 우회하지 않는다.

## 9. 요구사항 및 테스트 추적성

| 유스케이스 | 기능 요구사항 | 보안 요구사항 | 테스트 ID | 검증 증적·상태 |
|---|---|---|---|---|
| UC-01 | FR-AUTH-001~005, FR-INST | NFR-SEC-001~002 | AT-UC-001, SEC-UC-001 | Node auth tests; 실 IdP BLOCKED |
| UC-02 | FR-TRANSFER-001, FR-CONSENT | NFR-PRI-001 | AT-UC-002, AT-ERR-002 | 구현 예정 |
| UC-03 | FR-CONSENT, FR-QR-001/006 | NFR-PRI-001 | AT-UC-003, SEC-UC-003 | 구현 예정 |
| UC-04 | FR-CONSENT-001~006 | NFR-PRI-001 | AT-UC-004, AT-ALT-004, AT-ERR-004 | 동의 API 일부 구현 |
| UC-05 | FR-QR-001~006 | NFR-SEC-001 | AT-UC-005, SEC-UC-005 | 구현 예정 |
| UC-06 | FR-AUTH-001~005 | NFR-SEC-001~002 | AT-UC-006, SEC-UC-006 | Mock만 확인 |
| UC-07 | FR-QR-002~006 | NFR-SEC-001 | AT-UC-007, AT-ERR-007, SEC-UC-007 | QR 만료·재사용·타기관 시험 예정 |
| UC-08 | FR-POLICY-001~008 | NFR-SEC-001 | AT-UC-008, SEC-UC-008 | 정책 정상·음성 Node/E2E |
| UC-09 | FR-DICOM-001~004 | NFR-INT-001 | AT-UC-009, SEC-UC-009 | QIDO E2E |
| UC-10 | FR-VIEW-001~006 | NFR-CIA-001~002 | AT-UC-010, AT-ALT-010, SEC-UC-010 | WADO E2E; browser canvas 검증 필요 |
| UC-11 | FR-PACS-001~006 | NFR-CIA-001~002 | AT-UC-011, AT-ERR-011 | PACS 편입 P1 구현 예정 |
| UC-12 | FR-TRANSFER-001/007 | NFR-USA-001 | AT-UC-012 | 상태모델 구현 예정 |
| UC-13 | FR-CONSENT-005 | NFR-AUD-001 | AT-UC-013, SEC-UC-013, AUD-UC-013 | 철회·token 차단 test |
| UC-14 | FR-QR-003/005, RETENTION | NFR-PRI-001 | AT-ERR-014, AUD-UC-014 | Ticket 구현 예정 |
| UC-15 | FR-QR-004, FR-ERROR-006 | NFR-SEC-001 | SEC-UC-015, AUD-UC-015 | 동시소비 시험 예정 |
| UC-16 | FR-TRANSFER-004~007 | NFR-REC-001 | AT-UC-016, AT-ERR-016 | 장애주입 예정 |
| UC-17 | FR-TRANSFER-003/006 | NFR-CIA-002 | SEC-UC-017, AT-ERR-017 | AEAD/manifest 구현 예정 |
| UC-18 | FR-AUDIT-001~006 | NFR-AUD-001 | AT-UC-018, AUD-UC-018 | audit API/hash-chain test |
| UC-19 | FR-ERROR-001~006 | NFR-CIA-003 | AT-ERR-019, SEC-UC-019 | mTLS/network/timeout test 일부 |
| UC-20 | FR-POLICY, FR-DICOM-004 | NFR-SEC-001~002 | SEC-UC-020, AUD-UC-020 | 범위·token·mTLS 음성 test |
| 공통 삭제 | FR-RETENTION-002 | NFR-PRI-001 | AT-ERR-021 | 임시자료 TTL 삭제 구현 예정 |

필수 수용시험 연결:

- 환자 동의 성공: AT-UC-004
- 동의 거부: AT-ERR-004
- QR 만료·재사용: AT-ERR-007, SEC-UC-015
- 다른 기관·권한 없는 Study: SEC-UC-007, SEC-UC-020
- 원격조회 성공: AT-UC-010
- PACS 편입 성공: AT-UC-011(P1)
- 중단·재시도: AT-ERR-016
- 철회 후 접근 차단: SEC-UC-013
- 감사로그 생성·무결성: AUD-UC-018
- 영상 무결성 실패: SEC-UC-017
- 임시데이터 삭제: AT-ERR-021

## 10. Draw.io 구성도 일치성 검토

| 검토 항목 | 결과 | 근거·권고 |
|---|---|---|
| 업무 시스템의 구성도 표현 | 일치 | A/B PACS·Edge, Control/Data Plane, Relay, IdP, KMS, Viewer, Audit 표현 |
| 구성도에만 있는 시스템 | 부분 | 선택적 PQC Extension은 P1이며 본 업무에서는 암호민첩성 검토로만 사용 |
| 브라우저-PACS 직접 연결 | 일치 | 적색 금지 경로이며 허용 화살표 없음 |
| A/B Gateway 역할 분리 | 일치 | A는 원본 조회, B는 Viewer·편입 경계 |
| Control/Data Plane 구분 | 일치 | 정책·Ticket·감사와 암호문 중계가 분리됨 |
| 환자 모바일 역할 | 일치 | 동의·QR·Ticket, 영상 저장 아님 |
| 원격조회/편입 분기 | 일치 | WADO와 STOW/C-STORE 분리 |
| TLS/mTLS/암호화 경계 | 대체로 일치 | 인증서 수명주기·실제 IdP/KMS는 문서상 BLOCKED 유지 |
| Relay 평문 여부 | 일치 | 암호문 Relay로 표시, 영구저장 금지 |

### 10.1 구성도와의 불일치사항 및 보완 권고

구성도 파일은 수정하지 않았다.

| 구성도 항목 | 업무흐름 항목 | 불일치 내용 | 수정 권고 |
|---|---|---|---|
| Transfer Ticket/QR Service | UC-05·07·15 | 구성도에는 Ticket 상태 `ISSUED/CONSUMED/EXPIRED/REVOKED`와 원자 소비가 상세 표기되지 않음 | 후속 상세 시퀀스도에 상태·경쟁조건 추가 |
| Cloud Relay/Cache | UC-10·16·17·19 | 암호문 중계는 보이나 키 종단·manifest·재시도 책임은 축약됨 | Data Plane LLD에 키/nonce/manifest 경계 추가 |
| B PACS | UC-11·13 | 편입 후 동의 철회와 B 사본 관리 한계가 축약됨 | 편입 상세도에 책임경계 주석 추가 |
| Consent Service | UC-03·04 | 승인대기·거부 상태가 구성도에 없음 | 상태도 산출물에 별도 표현 |
| Audit Service | UC-18·감사 실패 | 이벤트 범위는 있으나 기록 실패 처리정책이 없음 | 정책·인터페이스 명세에서 동기차단/내구성 큐 결정 |

## 11. 전체 업무흐름 요약

**A 병원 원본 유지 → A 의료진 전송 요청 → 환자 동의 요청·승인 → 일회성 QR/Transfer Ticket 발급 → B 의료진 OIDC+MFA 인증 → Ticket 원자 검증 → RBAC+ABAC 정책 승인 → QIDO-RS 검색 → WADO-RS 원격조회 → 필요 시 별도 권한으로 STOW-RS/C-STORE 편입 → 전 구간 감사 → 만료·철회·TTL 삭제**

## 12. P0 핵심 유스케이스

UC-01~10, UC-12~20을 P0로 정의한다. 단, 현재 P0 중 UC-02·03·05·07·12·14~17의 전부 또는 일부는 구현 예정이며 완료로 간주하지 않는다.

## 13. P1 확장 유스케이스

- UC-11 선택적 PACS 편입
- 환자 모바일 암호화 DICOM 임시 저장·오프라인 교환 `[별도 UC 필요]`
- ML-KEM 하이브리드 키 교환·ML-DSA 서명 실험 `[별도 UC 필요]`
- FHIR/IHE 및 다기관 연계 `[별도 UC 필요]`

## 14. 주요 보안통제 지점

1. IdP: OIDC/MFA와 최소 claims.
2. Ticket 교환: opaque 값, TTL, 원자 소비, 재사용 탐지.
3. Policy: 환자 동의+의료진 인증+기관+목적+Study/Series+행위의 결합.
4. Edge/PACS: 브라우저 직접접근 금지, mTLS, 범위 재검증.
5. Data Plane: 전송별 DEK, AES-256-GCM, nonce 재사용 방지, Relay 평문 금지.
6. Audit: `auditSessionId`, append-only API, Hash Chain, 관리자 권한 분리.
7. Retention: 캐시 TTL, 키 폐기, 삭제증적, B PACS 사본 책임경계.

## 15. 미결정사항

1. 환자·보호자 본인확인과 대리동의 방식.
2. Ticket TTL, clock skew, 재발급·idempotency·기존 세션 종료 정책.
3. B 선요청 흐름의 A 의료진 승인 필요 여부.
4. 조회·다운로드·`PACS_IMPORT` 동의문과 역할 매트릭스.
5. STOW-RS 우선과 C-STORE fallback 조건.
6. Relay 평문 메모리 금지 범위, Edge-to-Edge 키 종단과 KMS 책임.
7. cache TTL·삭제 허용오차·증거보존·백업 정책.
8. 감사 기록 실패 시 동기 차단 또는 내구성 큐.
9. timeout·재시도 횟수·backoff·성능 SLO.
10. B PACS 사본의 보존·철회·삭제 책임과 고지.

## 16. 다음 단계 권고

다음 산출물로 **동의·권한·QR Transfer Ticket·API·데이터 상태를 구체화한 정책 및 인터페이스 명세서**를 작성한다. 이 문서에서 DEC 항목을 승인하고, Ticket 원자 소비·상태 전이·API 오류계약·키 종단·감사 실패정책을 시퀀스와 데이터 모델 수준으로 확정해야 한다.
