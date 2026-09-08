# Highpass Mobile-Core 권한·동의·QR 토큰 정책서

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 본 문서는 PIPA 법률 판단, 병원 보안 승인, ISMS-P 인증, 임상 진단 또는 운영 준비 완료를 의미하지 않는다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v3.0-DRAFT — v2.0-Rebaseline 이후 Mobile-Core 개정판 |
| 기준일 | 2026-09-01 |
| 기준 문서 | Mobile-Core 요구사항정의서 v3.0, 업무흐름·유스케이스 정의서 v1.0 |
| 적용 환경 | 가상 A·B 병원, 합성 환자·DICOM, 캡스톤 기술시험 환경 |
| 정책 상태 | 승인·구현 전 기준선 |

## 1. 문서 개요

본 정책은 의료영상 접근을 단일 역할이나 QR 소지만으로 허용하지 않고, 인증된 주체·기관·환자 동의·목적·영상 범위·행위·시간·기기·Ticket·키 상태를 매 요청마다 결합해 판단한다. 모바일 저장·운반·B 병원 핸드오프는 P0이며, 클라우드 원격조회도 별도 P0 경로로 유지한다.

표기는 `[구현 완료]`, `[구현 예정]`, `[정책 결정 필요]`, `[설계 가정]`, `[검증 필요]`, `[P1 확장]`, `[범위 제외]`를 사용한다. 기존 서버 정책·단기 토큰·DICOMweb·감사 일부는 `[부분 구현]`이며 모바일 Vault, 기기 신뢰, 패키지, Handoff, KMS 종단은 `[구현 예정]`이다.

## 2. 구조변경 배경

| v2.0-Rebaseline 정책 | v3.0 변경 | 처리 |
|---|---|---|
| 모바일 영상 보관을 선택적 후속기능으로 분류 | 암호화 패키지 모바일 저장을 P0 | 대체 |
| 모바일은 QR·동의 단말 | 등록 기기·Vault·암호문 운반·승인 단말 | 확대 |
| 모바일 참여범위를 동의·제어에 한정 | A Edge→모바일→B Edge Data Plane 참여 | 확대 |
| 오프라인 모바일 저장은 확장 | 제한적 오프라인 보관을 P0 | 대체 |
| 원격조회 중심 | 모바일 전달과 원격조회의 이중 P0 | 병행 |

기존 원본 분산 보관, QR 최소화, A/B Edge 분리, 브라우저 직접 PACS 접근 금지, 중앙 Pixel Data 영구 저장 금지는 유지한다.

## 3. Highpass Mobile-Core 서비스 정의

Highpass는 환자 동의와 기관·의료진별 권한통제를 기반으로 A 병원 PACS의 CT·MRI 영상을 암호화된 모바일 영상 패키지로 환자에게 전달하고, B 병원 방문 시 QR 기반 핸드오프를 통해 B 병원 Reference Viewer 또는 PACS로 전달하는 Zero-Trust 기반 의료영상 플랫폼이다.

- 모바일 경로: `A PACS→A Edge→암호 패키지→환자 모바일 Vault→B Edge→Viewer/PACS`.
- 원격 경로: `A PACS→A Edge→필요 시 암호 Relay→B Edge→QIDO/WADO→Viewer/PACS`.
- 두 경로는 동일한 동의·기관·의료진·목적·Study/Series·행위·만료·철회·감사 정책을 사용한다.

## 4. 정책 적용범위

정책 대상 데이터는 동의, 가명 환자 참조, DICOM Study/Series/Instance/Frame 참조, 암호 패키지, Token/Ticket, 기기·기관·전송 상태, 감사로그이다. 실제 개인정보·실제 PACS는 `[범위 제외]`이다.

| 행위자 | 식별자·소속 | 인증 | 허용 데이터·행위 | 금지행위 | 감사·해지 |
|---|---|---|---|---|---|
| 환자 | `patient_ref`, 개인 | OIDC+등록기기 생체/PIN | 본인 동의·패키지 상태·승인·철회 | 타환자 조회, QR만으로 전달 | 모든 동의/기기/승인; 철회·사망·계정위험 `[정책 결정 필요]` |
| 보호자 | `delegate_id`, 환자 관계 | 강한 본인·대리권 확인 | 위임 범위 동의 | 포괄·기한없는 대리 | 위임증적; 위임종료/철회 |
| A 의료진 | `clinician_id`, A | OIDC+MFA | 진료관계 환자 선택·요청·발급 | 환자 대신 승인, 과다범위 | 요청/선택; 퇴직·소속변경 |
| B 의료진 | `clinician_id`, B | OIDC+MFA | 세션·조회·허용 시 편입 | Ticket만으로 접근, 범위외 요청 | 세션/조회/편입; 퇴직·소속변경 |
| 병원 관리자 | `admin_id`, 기관 | OIDC+MFA/PAM | 기관 사용자·Gateway 정책 | 임상영상 임의조회, 로그삭제 | 정책변경; 직무변경 |
| Highpass 운영자 | `operator_id` | MFA/PAM `[구현 예정]` | 최소 운영메타 | 평문 영상·키 열람 | 운영행위; 계약/직무종료 |
| 보안관리자 | `security_admin_id` | MFA/PAM | 가명 감사·탐지 | 영상조회·로그변조 | 조회 자체 감사; 직무종료 |
| A PACS/A Edge | workload·A | mTLS/workload ID | 승인 DICOM 제공·패키징 | 외부 직접 공개 | QIDO/WADO/패키징; 인증서·기관폐기 |
| 모바일 앱 | `device_id`·환자 | app/device attestation, 기기키 | 암호문 Vault·QR 승인·업로드 | 평문 지속저장·외부공유 | 등록/저장/전달; 분실·루팅·해지 |
| B Edge/Viewer/PACS | workload·B | mTLS, 사용자 세션 | 수신·검증·조회·별도 편입 | 브라우저 직접 PACS, 무단저장 | 수신/조회/편입; 인증서·기관폐기 |
| Control/Policy/Relay | workload | mTLS/workload ID | 최소 메타·정책·암호문 중계 | 중앙 평문 영구저장 | 결정/중계/삭제; workload 폐기 |
| IdP/KMS/Audit | service identity | mTLS·관리자 분리 | 인증·키연산·불변로그 | 키/로그 무단열람 | 모든 관리행위; 키/권한 lifecycle |

## 5. 정책 기본원칙

1. 신원·동의 검증은 영상 접근보다 선행한다.
2. QR은 영상, 개인정보, DICOM UID, URL bearer token, 키를 담지 않는다.
3. QR 스캔은 인증·동의·전송 승인이 아니다.
4. 환자 승인과 B 의료진 MFA를 함께 요구한다.
5. 모바일은 반신뢰 매체이며 앱 Vault에는 암호문만 지속 저장한다.
6. SEARCH, VIEW, DOWNLOAD, MOBILE_STORE, MOBILE_HANDOFF, PACS_IMPORT를 분리한다.
7. 브라우저는 B Edge만 호출하며 PACS나 타 기관 Gateway에 직접 접근하지 않는다.
8. Cloud Relay는 기본 경로가 아니고 필요 시 암호문만 짧게 중계한다.
9. 중앙 Pixel Data 영구 저장을 금지한다. 임시 캐시는 별도 TTL 5~30분과 자동삭제·증적을 적용한다.
10. 모바일 패키지 보존기간은 중앙 캐시와 별도이며 `[정책 결정 필요]`; 동의 유효기간을 초과할 수 없다.
11. 모든 판단은 deny-by-default이고 허용·거부를 감사한다.
12. OHIF는 Reference Viewer이며 임상 진단용 시스템으로 주장하지 않는다.

## 6. 행위자 및 신뢰경계

병원 A, 환자 모바일, Cloud Control Plane, 선택 Cloud Data Plane, 병원 B는 각각 별도 신뢰경계이다. 사용자 identity claim은 IdP가, 기관 identity는 등록기관·mTLS certificate/workload claim이, 기기 identity는 기기키·등록·attestation이 증명한다. 어느 경계도 다른 경계의 입력을 암묵적으로 신뢰하지 않는다.

PEP는 API Gateway, A/B Edge, 모바일 앱의 민감행위 진입점에 둔다. PDP는 Control Plane 정책엔진이며 동의·Ticket·token·기기·키 상태의 최신값을 조회한다. KMS는 별도 key-release PEP로 동일 조건을 재검증한다. 감사저장소는 업무 DB와 관리권한을 분리한다.

## 7. 권한모델

### 7.1 RBAC와 ABAC

RBAC 역할은 PATIENT, DELEGATE, A_CLINICIAN, B_CLINICIAN, HOSPITAL_ADMIN, PLATFORM_OPERATOR, SECURITY_ADMIN이다. ABAC는 user/role/institution, patient_ref, Study/Series/Instance UID, Frame 범위, source/target 기관, purpose, consent/ticket/device/key 상태, action, time, network zone, MFA와 break-glass claim을 평가한다.

검증 순서는 인증→기관→역할→동의/정당한 예외→대상기관→목적→Study/Series/Instance/Frame→Ticket/token→기기→행위→만료·철회·폐기→감사가용성이다. 하나라도 불일치하면 구체적 내부정보를 노출하지 않고 DENY한다.

### 7.2 행위별 분리

| 행위 | 환자 동의 | 의료진 인증 | 대상기관 일치 | Study 범위 | Ticket | 모바일 기기 | 감사로그 |
|---|---|---|---|---|---|---|---|
| SEARCH | 필요 | B MFA | 필요 | 환자/검색 scope | Remote token | 불필요 | 필수 |
| VIEW | 필요 | B MFA | 필요 | Study~Frame | Remote/View token | 경로별 | 필수 |
| DOWNLOAD | 명시 필요 | B MFA | 필요 | Study~Instance | Download token | 불필요 | 필수 |
| MOBILE_STORE | 명시 필요 | A MFA | B 확정 | Study/Series | 발급 grant | ACTIVE | 필수 |
| MOBILE_HANDOFF | 명시 필요 | B MFA | 필요 | Study/Series | 1회 Ticket | ACTIVE·비차단 | 필수 |
| PACS_IMPORT | 명시 필요 | B MFA | 필요 | Study/Series | 1회 Import token | 불필요 | 필수 |
| CONSENT_CREATE | 해당 목적 생성 | A MFA | 필요 | 후보범위 | 불필요 | 불필요 | 필수 |
| CONSENT_APPROVE/REVOKE | 본 행위 자체 | 환자 재인증 | 필요 | 동의범위 | 요청참조 | 등록기기 권고 | 필수 |
| TICKET_ISSUE/USE | 필요 | B MFA | 필요 | Study/Series | 자체 | USE 시 필요 | 필수 |
| AUDIT_READ | 해당 없음 | 관리자 MFA | 기관범위 | 최소 참조 | 불필요 | 불필요 | 필수 |
| ADMIN_POLICY_CHANGE | 해당 없음 | 관리자 MFA/PAM | 기관범위 | 해당 없음 | 불필요 | 불필요 | 필수 |
| BREAK_GLASS | 예외정책 | 승인 의료진 MFA | 필요 | 최소범위 | 전용 grant | 경로별 | 강화 |

## 8. 환자 동의정책

### 8.1 데이터와 범위

동의 레코드는 `consent_id`, `patient_ref`, consentor_type(PATIENT/DELEGATE/EMERGENCY_EXCEPTION), identity-proof method/time, source/target institution, purpose, Study/Series scope, `remote_view_allowed`, `download_allowed`, `mobile_store_allowed`, `mobile_handoff_allowed`, `pacs_import_allowed`, valid_from/until, revoked_at/reason, consent_version, policy_version, 전자증적 hash와 `audit_session_id`를 가진다. 직접식별자와 동의 전문은 최소화·분리 저장한다.

### 8.2 상태

| 상태 | 진입조건 | 허용행위 | 다음 상태 |
|---|---|---|---|
| DRAFT | 의료진 요청 초안 | 편집·폐기 | PENDING, REJECTED |
| PENDING | 환자에게 발급 | 조회·승인·거부 | APPROVED, REJECTED, EXPIRED |
| APPROVED | 명시적 승인·증적 | 동의 scope의 허용평가, 철회 | REVOKED, EXPIRED, SUPERSEDED |
| REJECTED | 환자/대리인 거부 | 신규 요청만 | 없음 |
| EXPIRED | valid_until 경과 | 신규 요청만 | 없음 |
| REVOKED | 환자 철회 | 향후 접근 전부 거부 | 없음 |
| SUPERSEDED | 새 버전 승인 | 이전 버전 신규사용 거부 | 없음 |

QR 스캔은 동의가 아니다. 기관·목적·범위가 실제 행위와 다르면 거부한다. 모바일 저장, 원격조회, 다운로드, 핸드오프, PACS 편입은 각각 명시 boolean/action scope로 동의받는다. 철회는 신규/활성 token과 key release를 차단하지만 이미 B PACS에 편입된 사본의 자동 회수를 보장하지 않으며 이를 승인 전에 고지한다. 보호자 권한과 응급예외는 별도 증적·기간·사후검토를 요구한다.

## 9. QR 및 Transfer Ticket 정책

QR은 동의요청 연결 또는 B 핸드오프 세션 시작에만 사용한다. 허용 필드는 `highpass://handoff/<opaque-ticket>` 형태의 검증된 딥링크, protocol version, 고엔트로피 opaque ticket뿐이다. 환자명·주민번호·환자번호·생년월일·병명·Patient ID·Study/Series/Instance UID·다운로드 URL·JWT 전체·영구 token·동의 전문·모든 키는 금지한다.

Ticket은 CSPRNG 128-bit 이상 추측난이도 `[구현 상세 결정 필요]`, 서버상태, 짧은 TTL, target institution/clinician session/consent/purpose/Study-Series/action/device 바인딩, digest 저장, 원자적 compare-and-set 소비, 폐기목록과 replay 탐지를 적용한다. JWT를 내부 grant에 사용하더라도 QR에는 opaque 참조를 우선하고 서버 상태를 유지한다.

정상 흐름은 B 의료진 MFA→B 세션→QR 발급→환자 앱 스캔→안전한 요약→환자 재인증·승인→정책 재평가→Package Transfer Token→별도 TLS 채널 업로드이다. B가 환자 앱의 역방향 QR을 스캔하는 대체흐름도 같은 양측 인증을 요구한다. 다른 병원, 복제/재사용, 유효 QR+철회동의, Study 불일치는 각각 HOSPITAL_MISMATCH, REPLAY_BLOCKED, CONSENT_REVOKED, SCOPE_MISMATCH로 거부한다.

## 10. Token 유형 및 필드정책

| Token 유형 | 용도 | 기본 수명 | 범위 | 재사용 |
|---|---|---|---|---|
| Consent Request ID | 동의요청 참조 | 완료 또는 요청 TTL까지 `[결정 필요]` | 환자·목적·요청 | 제한 |
| QR Handoff Ticket | B 세션 시작 | 2~5분 `[결정 필요]` | 기관·세션·Study | 1회 |
| Remote View Token | QIDO/WADO | 5~10분 | institution·user·Study/Series/Frame·VIEW | 제한·매요청 검증 |
| Package Transfer Token | 모바일→B Edge | 2~5분/전송창 `[결정 필요]` | package·B·chunks | 1회 또는 nonce chunk |
| PACS Import Token | B PACS 편입 | 2~5분 | Study/Series·IMPORT | 1회 |
| Audit Session ID | 거래 상관관계 | 거래+보존기간 | 전체 거래 | 식별 참조로 재사용 |

서버 레코드는 `token_id/type`, `jti`, `transfer_id`, `consent_id`, `handoff_session_id`, `audit_session_id`, issuer/target institution, issuer/subject user, patient_ref, Study/Series/Frame scope, purpose, allowed_actions, issued/not_before/expires/used/revoked time, device, first-use institution, revocation reason, status, policy_version, token hash를 갖는다. 원문 bearer token은 저장·로그하지 않는다. `iss`, `aud`, `sub`, `exp`, `nbf`, `iat`, `jti`, scope를 검증하고 URL query에 전달하지 않는다.

### Token 상태

| 상태 | 진입조건 | 허용행위 | 차단행위 | 감사로그 | 다음 상태 |
|---|---|---|---|---|---|
| CREATED | 서버 레코드 생성 | 발급준비 | 데이터 접근 | TOKEN_CREATED | ISSUED, REVOKED |
| ISSUED | 안전한 채널 발급 | 지정 검증/스캔 | 범위외 접근 | TOKEN_ISSUED | SCANNED, AUTHORIZED, EXPIRED, REVOKED |
| SCANNED | 유효 QR 스캔 | 환자 확인·승인 | 전송/복호화 | TOKEN_SCANNED | PATIENT_APPROVED, REJECTED, EXPIRED |
| PATIENT_APPROVED | 환자 재인증·승인 | 정책평가 | 즉시 데이터 접근 | PATIENT_APPROVED | AUTHORIZED, REJECTED |
| AUTHORIZED | 전체 ABAC 허용 | 지정 1회 행위 | 다른 행위/기관 | TOKEN_AUTHORIZED | CONSUMED, EXPIRED, REVOKED |
| CONSUMED | 원자적 성공소비 | 상태조회 | 재사용 | TOKEN_CONSUMED | REPLAY_BLOCKED 이벤트 |
| EXPIRED | TTL 경과 | 재발급 요청 | 모든 보호자원 | TOKEN_EXPIRED | 없음 |
| REVOKED | 동의·기기·관리자 폐기 | 상태조회 | 모든 보호자원 | TOKEN_REVOKED | 없음 |
| REPLAY_BLOCKED | 소비/nonce 재제출 | 없음 | 모든 행위 | TOKEN_REPLAY_BLOCKED | 없음 |
| REJECTED | 환자/정책 거부 | 신규 요청 | 해당 거래 | TOKEN_REJECTED | 없음 |

## 11. 모바일 기기 권한정책

기기는 환자 계정, hardware-backed 공개키, 앱 인스턴스, OS/앱 버전, attestation 결과와 바인딩한다. ACTIVE·비분실·비차단·지원버전·무결성 통과 기기만 MOBILE_STORE/HANDOFF가 가능하다. 생체/PIN은 앱 로컬 재인증이며 서버 환자 identity를 대체하지 않는다.

루팅·탈옥, debugger/hook, 앱 위변조, 백업복원 불일치, 기기키 변경, 장기 미접속은 위험신호다. P0 기본은 고위험 기기 저장·핸드오프 차단이며 false positive·접근성 처리 절차는 `[정책 결정 필요]`이다. 분실·해지는 세션·Ticket·device key release를 폐기하고 다음 연결 시 Vault 삭제를 명령한다. OS별 attestation·MDM 연계는 `[P1 확장]`일 수 있으나 최소 기기등록·차단은 P0다.

## 12. 모바일 영상 패키지 저장정책

MOBILE_STORE는 유효한 명시동의, A 의료진 MFA, 확정된 B·목적·Study/Series, ACTIVE 기기/환자 바인딩, 패키지 생성 권한, AES-256-GCM 성공, 감사 기록 가능 조건을 모두 요구한다.

- 전송별 DEK, 고유 nonce, AEAD tag, canonical manifest와 파일 count/size/hash를 사용한다.
- DEK와 KEK를 분리하고 원문 키·DICOM·token을 로그에 남기지 않는다.
- Android Keystore 또는 iOS Keychain/Secure Enclave의 비추출 기기키를 사용한다.
- 앱 sandbox/Vault만 허용하고 일반 파일, 갤러리, share sheet, clipboard, 다른 앱, 일반 OS/cloud backup을 차단한다.
- 앱 잠금·생체/PIN, 화면캡처 제한 `[플랫폼별 검증 필요]`, 외부 미리보기 금지, 임시 평문 즉시 zeroization을 적용한다.
- 저장공간 부족은 사전검사 후 실패하고 부분파일을 격리·삭제한다. 앱 재설치 시 이전 기기 binding/key 복구는 기본 금지하며 승인된 복구절차는 `[정책 결정 필요]`이다.
- 모바일 보존기간은 중앙 cache 5~30분과 독립된 값이며 동의기간 이내의 최소기간으로 설정한다 `[정책 결정 필요]`.

## 13. 모바일 핸드오프 정책

| 행위 | 필수 권한·검사 | 감사 이벤트 |
|---|---|---|
| 세션 생성 | B_CLINICIAN, MFA, B institution, 목적, B Edge ONLINE | HANDOFF_SESSION_CREATED/DENIED |
| QR 발급 | TICKET_ISSUE, 세션·TTL·opaque 값 | QR_ISSUED |
| QR 스캔 | ACTIVE device, issuer/format/TTL | QR_SCANNED/REJECTED |
| 환자 승인 | 환자 재인증, 유효 동의, B·목적·scope 요약 | HANDOFF_APPROVED/REJECTED |
| 패키지 전송 | MOBILE_HANDOFF, 1회 transfer token, package/device/B binding | PACKAGE_TRANSFER_STARTED/COMPLETED |
| 복호화 | VERIFIED package, KMS key-release 전 조건 | KEY_RELEASE_ALLOWED/DENIED |
| Viewer 조회 | VIEW, B 의료진 세션, Study~Frame scope | VIEW_ACCESSED/DENIED |
| PACS 편입 | 별도 PACS_IMPORT, 무결성·B 매핑 | PACS_IMPORT_RESULT |
| 전송 완료 | 전 패키지 receipt·Ticket CAS 소비 | TICKET_CONSUMED |
| 모바일 삭제 | 완료/만료/철회 정책과 receipt | PACKAGE_DELETED/FAILED |

검사 항목 하나라도 실패하면 업로드 grant와 key release를 발급하지 않는다. 중단 재개는 검증된 chunk offset, nonce와 idempotency key만 허용하며 새 정책평가를 수행한다.

## 14. 클라우드 원격조회 정책

B 의료진 OIDC+MFA·기관소속·동의·목적·Study scope를 확인하고 Study 단위 Remote View Token을 발급한다. SEARCH는 QIDO-RS, VIEW는 WADO-RS에 각각 허용하고 Instance/Frame 요청마다 scope를 재검사한다. 다운로드는 기본 차단하고 명시 DOWNLOAD 권한을 요구한다. PACS 편입은 별도 token이다.

브라우저는 B Edge만 접근한다. B Edge→A Edge/PACS는 mTLS이며 Cloud Relay는 기본 경로가 아니고 네트워크상 필요할 때 종단 암호문만 중계한다. 중앙 Pixel Data 영구 저장을 금지하고 optional encrypted cache는 5~30분 TTL, 자동삭제·best-effort zeroization·삭제증적·접근감사를 적용한다. 이를 Remote Viewing, On-demand Retrieval, Progressive Loading, Federated Medical Imaging Access로 표현한다.

## 15. PACS 편입 정책

PACS_IMPORT는 유효 동의의 import flag, B 의료진 MFA/역할, B 기관, Study/Series scope, VERIFIED package/object, 중복검사, 전송완료와 감사를 모두 요구한다. DICOMweb 지원 시 STOW-RS를 우선하고, 기존 PACS 호환이 필요한 경우 B Edge 내부에서 C-STORE를 허용한다 `[기관별 결정]`.

중복 Study는 SOP Instance UID와 B 환자매핑 정책에 따라 idempotent 처리하며 덮어쓰지 않는다. 부분성공은 instance별 receipt로 실패 목록을 분리하고 제한 재시도한다. 성공 후 모바일 패키지는 보존정책에 따라 삭제하되 PACS receipt와 감사증적은 유지한다. 편입본은 B 병원 정보관리·보존·파기 책임영역이며 동의 철회가 자동삭제를 보장하지 않는다.

## 16. 만료·철회·폐기정책

| 객체 | 만료조건 | 철회조건 | 삭제시점 | 키폐기 | 접근차단 | 감사증적 |
|---|---|---|---|---|---|---|
| 환자 동의 | valid_until | 환자/적법 대리 | 원문 보존정책 후 | 관련 grant 폐기 | 즉시 미래행위 | 상태전이·사유 |
| QR Ticket | 2~5분 `[결정]` | 동의/세션/관리 | 소비·만료 후 원문폐기 | 해당 없음 | CAS 상태 | issue/scan/consume/replay |
| Remote View Token | 5~10분 | 동의·사용자·기관 | 원문 미저장 | 세션키 폐기 | introspection/denylist | issue/use/deny |
| 모바일 패키지 | 별도 보존기간·동의종료 | 동의·분실·기기해지·변조 | 완료/만료/철회/장기미사용 | unwrap권한·DEK 폐기 | app+KMS | delete proof/failure |
| 암호화키 | package lifecycle | 침해·철회 | crypto period 종료 | KMS destroy/disable | key-release PEP | key lifecycle |
| Handoff session | 짧은 session TTL | 의료진 logout·동의·장애 | 완료/실패 TTL | session key 폐기 | 서버상태 | start/end/reason |
| Relay cache | 5~30분 | 거래철회·침해 | TTL/완료 즉시 | cache key 폐기 | object policy | delete receipt |
| B PACS 사본 | B 보존정책 | 법·병원정책 | B 책임절차 | B 책임 | B IAM | import·보존·파기 참조 |

앱 삭제나 오프라인 분실에서는 서버가 물리삭제를 즉시 증명할 수 없으므로 기기키·unwrap 권한 폐기로 먼저 접근불능화하고 재연결 때 삭제한다. 저장공간 부족·부분전송·변조본은 정상본과 격리해 즉시 삭제한다.

## 17. Break Glass 정책

Break Glass는 `[정책 결정 필요]`이며 캡스톤 기본 흐름에서는 비활성이다. 실제 운영 시 응급진료 권한이 사전 등록된 B 의료진만 MFA 후 사용할 수 있고, 기관·환자 매칭과 최소 Study/최근기간·VIEW_ONLY를 원칙으로 하며 DOWNLOAD/MOBILE_STORE/HANDOFF/PACS_IMPORT는 별도 사후승인 없이는 금지한다.

사유코드와 자유서술, 임상 응급근거, 최대 30~60분 `[결정 필요]`, 전용 grant, 자동만료, 실시간 보안알림, 일반 로그보다 강화된 불변감사, 24시간 내 `[결정 필요]` 의료·개인정보보호 책임자 검토와 환자/보호자 통지 정책을 요구한다. 반복·야간·과다조회·사후사유 누락을 탐지하고 남용 시 즉시 계정차단·조사한다. 일반 권한오류나 편의를 위한 우회로 사용할 수 없다.

## 18. 암호화키 및 키 릴리스 정책

### 선택: 방식 B — 기기 바인딩 envelope + 정책 기반 B 재래핑

방식 A는 B가 발급 시 확정되어 단순하지만 기기소유 증명과 대상변경 유연성이 낮다. 방식 C는 모바일 보안영역에 key-release 책임이 집중되어 루팅 단말 위험과 구현 복잡도가 높다. 따라서 방식 B를 선택한다.

1. A Edge가 KMS에 전송별 256-bit DEK 생성을 요청하고 패키지를 AES-256-GCM으로 암호화한다.
2. KMS는 DEK를 모바일 등록 공개키/기기 binding과 서버 KEK 정책으로 envelope 처리한다. 모바일 앱 프로세스 밖으로 평문 DEK를 내보내지 않는다.
3. 환자 승인과 전체 ABAC 검증 후 KMS가 기존 보호 envelope를 해제해 B Gateway의 인증된 workload 공개키/KEK용 새 envelope를 생성한다. raw DEK는 모바일·Control Plane·QR을 통과하지 않는다.
4. B Edge는 mTLS workload, B 기관, consent, Ticket, package, scope, action, TTL, integrity 준비가 모두 유효할 때만 unwrap한다.

키 생성·보관·wrap/unwrap은 KMS/HSM, 기기 개인키는 hardware-backed keystore, B 개인키는 B KMS/HSM에 둔다. 키 복구는 일반 사용자가 할 수 없고 다중승인 운영복구 여부는 `[정책 결정 필요]`다. 분실·철회 시 기기/B envelope와 key-release grant를 폐기하고 package 종료·삭제증적 후 DEK를 destroy한다. PQC는 crypto-agility 인터페이스를 준비하되 ML-KEM/ML-DSA 적용은 `[P1 확장·성능/상호운용 검증 필요]`이며 캡스톤 필수 구현이 아니다.

## 19. 감사로그 정책

필수 이벤트는 로그인/MFA/기관인증, 기기 등록·해지·분실·원격차단, 동의 요청·승인·거부·철회, Study 선택, package 생성·암호화·저장, QR 발급·스캔·환자승인, 정책 ALLOW/DENY, token 발급·사용·replay, handoff·수신·무결성, Viewer·download 시도·PACS 편입, 만료·폐기·삭제·키폐기, 장애·재시도, Break Glass, 감사조회, 정책변경이다.

각 이벤트는 `event_id/type/time`, `actor_id/role`, `institution_id`, `patient_ref`, `study_ref`, `transfer_id`, `ticket_id`(digest/ref), `audit_session_id`, `device_id`, source/destination, action, decision, reason, policy_version, `trace_id`, `failure_code`를 가진다. 비밀번호·token 원문·키·Pixel Data·불필요한 평문 개인정보는 금지한다.

로그는 UTC, schema version, append-only, hash chain, 엄격한 AUDIT_READ, 조회 자체 감사, 업무 DB와 관리분리를 적용한다. 운영 WORM/SIEM·보존기간은 `[P1/상용화 전 결정]`이다. 중요 허용행위의 감사 기록 실패는 기본 거부하고, 이미 진행 중인 전송의 안전중단·로컬 buffer 한도는 `[정책 결정 필요]`다.

## 20. 보안위협 및 대응정책

| 위협 | 악용조건 | 피해 | 예방통제 | 탐지 | 대응 | 잔여위험 |
|---|---|---|---|---|---|---|
| QR 촬영·재사용 | 화면 노출 | 세션탈취 시도 | 짧은 TTL·양측바인딩·1회 CAS | replay event | Ticket/세션 폐기 | TTL 내 phishing |
| QR 무차별 대입 | endpoint 접근 | 유효 Ticket 발견 | 128-bit+ entropy·rate limit | 실패율/분산 IP | 차단·키공간 교체 | 대규모 bot |
| Token 탈취 | 로그/브라우저 유출 | scope 악용 | header 전달·hash 저장·aud/PoP `[P1]` | 다른 기관/기기 | revoke·세션차단 | bearer 특성 |
| Token Replay | 원문 재제출 | 중복 전송 | jti/nonce·CAS·idempotency | replay rule | REPLAY_BLOCKED | race condition |
| 다른 병원 사용 | C 기관 credential | 정보유출 | mTLS/claim target binding | mismatch | deny·계정조사 | 내부자 공모 |
| 다른 환자 Study | UID 조작 | 타환자 노출 | 서버 scope allowlist | 반복 DENY | rate limit·조사 | 메타 상관추론 |
| 모바일 분실·도난 | 기기 확보 | 암호문/승인 위험 | app lock·hardware key·TTL | 분실신고/risk | remote block/key revoke | 오프라인 물리공격 |
| 루팅·탈옥 | root exploit | 메모리·키 공격 | attestation·debug/hook 차단 | integrity signal | 저장/전달 차단 | 탐지우회 |
| 저장소 추출 | sandbox dump | 암호문 유출 | AES-GCM·non-export key | 앱 무결성 | key revoke/delete | brute force |
| OS 백업 유출 | backup 허용오류 | 암호문 복제 | backup exclusion·restore binding | 복원불일치 | 기기 재등록 | OEM 차이 |
| 패키지 변조 | file 수정 | 오진/DoS | manifest hash·GCM tag | verify failure | 격리삭제 | canonicalization 결함 |
| 악성 앱 접근 | overlay/accessibility 남용 | 승인탈취 | app isolation·overlay 탐지 `[검토]` | 위험신호 | 재인증·차단 | 사회공학 |
| 가짜 QR | 공격자 QR | phishing | issuer/domain allowlist | invalid issuer | 경고·신고 | 유사 도메인 |
| 의료진 계정 탈취 | credential+MFA 공격 | 무단조회 | phishing-resistant MFA `[P1]`·ABAC | impossible travel/대량조회 | 계정차단 | 세션탈취 |
| 철회 후 접근 | 캐시 grant | 철회무시 | 매 단계 introspection·key gate | revoked attempt | 모든 grant 폐기 | 전파지연 |
| Relay 침해 | relay admin/host | 암호문·메타/DoS | 종단암호·최소메타·TTL | 무결성/행위탐지 | 격리·키회전 | 트래픽 분석 |
| 감사로그 위변조 | 관리자 권한 | 부인방지 상실 | append-only·hash chain·권한분리 | chain verify | 보조본 복구·조사 | 공모 |
| 키 노출 | KMS/메모리 침해 | 대량복호화 | HSM·envelope·짧은 grant·zeroize | KMS anomaly | revoke/rotate/incident | 사용 중 키 |
| 전송 중단 | 네트워크/전원 | 미완료·DoS | chunk hash·bounded retry | timeout | 안전 재개/삭제 | 반복 장애 |
| 부분 전송 | 일부 object | 불완전 진료자료 | manifest count/receipt | mismatch | 격리·재전송 | PACS 부분성공 |
| 중복 PACS 편입 | retry/race | 중복·매핑오류 | SOP UID idempotency·commit receipt | duplicate event | 중단·수동검토 | 기관별 PACS 차이 |

## 21. 정책 결정 매트릭스

모든 `필요` 조건은 AND이며 하나라도 실패하면 DENY다.

| 행위 | 환자 동의 | 사용자 인증 | 기관 일치 | Study 범위 | Ticket | 모바일 기기 | 키 상태 | 최종결정 |
|---|---|---|---|---|---|---|---|---|
| 모바일 저장 | MOBILE_STORE | A MFA | A/B 필요 | 필요 | 발급 grant | ACTIVE | DEK/wrap 정상 | 모두 충족 시 허용 |
| 모바일 핸드오프 | MOBILE_HANDOFF | B MFA+환자 재인증 | 필요 | 필요 | 유효·미소비 | ACTIVE | release 가능 | 모두 충족 시 허용 |
| 원격조회 | VIEW/SEARCH | B MFA | 필요 | Study~Frame | Remote token | 불필요 | 경로키 정상 | 모두 충족 시 허용 |
| 다운로드 | DOWNLOAD | B MFA | 필요 | 필요 | Download token | 불필요 | 정상 | 명시권한 시 허용 |
| PACS 편입 | PACS_IMPORT | B MFA | 필요 | 필요 | Import token | 불필요 | 정상 | 검증완료 시 허용 |
| 감사로그 조회 | 해당 없음 | 관리자 MFA | 기관별 | 최소참조 | 불필요 | 불필요 | 불필요 | AUDIT_READ 범위만 |
| Break Glass | 전용 예외 | 승인 의료진 MFA | 필요 | 최소범위 | 전용 grant | 경로별 | 전용 TTL | 허용+강화 사후검토 |

## 22. 상태 및 생명주기

동의는 DRAFT→PENDING→APPROVED→EXPIRED/REVOKED/SUPERSEDED 또는 PENDING→REJECTED다. 이전 업무흐름 문서의 `CONSENT_PENDING` 표기는 본 정책의 `PENDING`과 같은 의미이며 다음 개정에서 정규화한다.

Ticket/token은 CREATED→ISSUED→(QR이면 SCANNED→PATIENT_APPROVED)→AUTHORIZED→CONSUMED가 정상이다. 어느 단계에서든 EXPIRED/REVOKED/REJECTED로 종결하며 소비 후 요청은 상태를 되돌리지 않고 REPLAY_BLOCKED 보안 이벤트를 생성한다.

모바일 패키지는 CREATED→ENCRYPTED→DOWNLOADING→STORED_ON_DEVICE→READY_FOR_HANDOFF→HANDOFF_PENDING→UPLOADING→RECEIVED→VERIFIED→VIEWED/IMPORTED→DELETED가 정상이다. EXPIRED/REVOKED/FAILED는 이용 불가이고 DELETED로 정리한다. 상태전이는 원자적·단조증가하며 이전 상태로 임의 회귀하지 않는다.

## 23. 법령·표준 검토

이 절은 설계 참고이며 법률 의견이 아니다. 법령 적용성과 보존·파기·동의·응급예외는 상용화 전 법무·병원 개인정보보호책임자 검토가 필요하다.

| 구분 | 공식 기준과 해석 | PoC 적용 | 운영 추가검토 |
|---|---|---|---|
| 개인정보 보호 | 개인정보보호법과 안전성 확보조치 기준은 접근권한, 인증, 암호화, 접속기록, 파기 등 적용성 검토의 기준이다 | 최소수집, 합성데이터, RBAC/ABAC, 암호화·감사 | 처리근거·위수탁·국외이전·보존기간·PIA 법무검토 |
| 의료정보 | 의료법상 진료기록 관리·비밀보호와 기관별 보존책임을 검토해야 한다 | 실제 진료·PACS 미사용 | 전자서명·열람/사본·보존·응급예외 확인 |
| 보건의료데이터 | 2024 보건의료데이터 활용 가이드라인은 가명처리·연구활용 참고자료다 | 진료 전달과 연구활용 분리 | 실제 연구반출·IRB/DRB 별도 |
| DICOM | DICOM current edition의 PS3.15 보안, PS3.18 Web Services를 참조한다 | UID 계층, QIDO/WADO/STOW, Edge 통제 | Conformance Statement·실제 PACS 상호운용 시험 |
| OIDC/OAuth | OIDC Core는 OAuth 2.0 위 인증계층이다. issuer/audience/nonce/TLS와 OAuth 보안 BCP를 적용한다 | mock/개발 IdP 경계, 짧은 scope | 실제 IdP·MFA·FAPI/PoP 적용성 |
| TLS | TLS 1.3 및 인증서 hostname/EKU/chain 검증을 기본으로 한다 | 개발 인증서 mTLS | 병원 PKI·인증서 수명주기/HSM |
| NIST 암호/PQC | AES-GCM·키관리 원칙을 적용하고 FIPS 203/204/205의 ML-KEM/ML-DSA/SLH-DSA는 crypto-agility 확장 대상으로 본다 | AES-256-GCM, PQC 비필수 | 승인모듈·성능·hybrid migration 검토 |

공식 참고: [국가법령정보센터](https://www.law.go.kr/), [개인정보보호위원회](https://www.pipc.go.kr/), [보건복지부](https://www.mohw.go.kr/), [DICOM Current Edition](https://www.dicomstandard.org/current/), [DICOM PS3.18](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/PS3.18.html), [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html), [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [NIST PQC](https://csrc.nist.gov/projects/post-quantum-cryptography).

## 24. 요구사항·유스케이스·테스트 추적성

| 정책 ID | 정책 내용 | 관련 요구사항 | 관련 유스케이스 | 테스트 ID | 증적 |
|---|---|---|---|---|---|
| POL-AUTH-001 | OIDC/MFA·기관·RBAC/ABAC | FR-AUTH-001~002, FR-POLICY-001~002 | UC-001,004,014,028~029 | SEC-POL-001~003 | `[부분 기존시험]` |
| POL-CONSENT-001 | 행위별 명시동의·철회 | FR-CONSENT-001~002 | UC-005~007 | SEC-CONSENT-001~003 | `[부분 기존시험]` |
| POL-QR-001 | opaque·무PII/키·일회 Ticket | FR-QR-001~003, FR-HANDOFF-001~007 | UC-014~018,027 | SEC-QR-001~004 | `[미생성]` |
| POL-TOKEN-001 | 유형분리·TTL·aud/scope/replay | FR-POLICY-001~002, FR-HANDOFF-007 | UC-018~020,024~029 | SEC-TOKEN-001~003 | `[부분 기존시험]` |
| POL-DEVICE-001 | 등록·반신뢰·분실/루팅 차단 | FR-MOBILE-001~003,010~012 | UC-002~003,011~013 | SEC-DEVICE-001~003 | `[미생성]` |
| POL-PACKAGE-001 | Vault 암호문·무결성·삭제 | FR-PACKAGE-001~007, FR-STORAGE-001~007 | UC-009~013,019~021 | SEC-PACKAGE-001~004 | `[미생성]` |
| POL-KEY-001 | 방식 B envelope·조건부 release | FR-KEY-001~007 | UC-010,013,018,021 | SEC-KEY-001~003 | `[미생성]` |
| POL-REMOTE-001 | QIDO/WADO 최소범위·Edge 경유 | FR-DICOM-001~005, FR-VIEW-001~003 | UC-022,024~025 | SEC-REMOTE-001~002 | `[부분 기존시험]` |
| POL-PACS-001 | 별도 IMPORT·receipt·B 책임 | FR-DICOM-006, FR-PACS-001~003 | UC-023,026 | AT-PACS-001~002 | `[미생성]` |
| POL-LIFE-001 | 만료·철회·삭제·cache 5~30분 | FR-STORAGE-005~007, FR-KEY-006~007 | UC-003,007,013,027 | SEC-LIFE-001~004 | `[미생성]` |
| POL-BG-001 | 제한 Break Glass·사후검토 | `[추가 요구사항 필요]` | `[추가 UC 필요]` | SEC-BG-001 | `[미생성]` |
| POL-AUDIT-001 | 전구간 최소·불변 감사 | FR-AUDIT-001~003 | UC-030 | AUD-POL-001~002 | `[부분 기존시험]` |

필수 시험 매핑: 동의 없는 모바일 저장 `SEC-CONSENT-001`, 동의 없는 원격조회 `SEC-CONSENT-002`, B 인증실패 `SEC-POL-001`, 타기관 Ticket `SEC-QR-002`, QR 재사용 `SEC-QR-003`, token replay `SEC-TOKEN-002`, 분실 후 차단 `SEC-DEVICE-002`, 루팅 차단 `SEC-DEVICE-003`, 변조 `SEC-PACKAGE-002`, QR 키 미포함 `SEC-QR-004`, 철회/만료 차단 `SEC-LIFE-001~002`, 모바일 삭제 `SEC-LIFE-003`, Relay TTL 삭제 `SEC-LIFE-004`, Viewer `SEC-REMOTE-001`, PACS 편입 `AT-PACS-001`, Break Glass 감사 `SEC-BG-001`, 감사 누락 `AUD-POL-002`. 미실행 항목은 PASS가 아니다.

## 25. 미결정사항 및 위험

- QR/Ticket·transfer token의 정확한 TTL, 모바일 보존기간, package/chunk 최대 크기와 재시도 상한.
- 방식 B envelope의 KMS 제품·알고리즘, 기기교체/복구, B 키 rotation 중 재래핑 상세.
- Android/iOS 최소버전, attestation, 루팅/탈옥·화면캡처 정책과 접근성 예외.
- 보호자 위임검증, 미성년자, 응급 Break Glass의 법적 근거·승인자·통지·시간.
- PACS_IMPORT의 P0/P1, 환자매핑·중복/부분성공·편입본 보존/파기 책임.
- Relay 필요조건과 Edge 직접연결, 중앙 cache TTL 내 구체값, zeroization 검증 수준.
- 감사 보존기간·WORM/SIEM·감사실패 시 가용성, 실제 IdP/KMS/HSM/PACS/병원망.
- PIPA·의료법·병원 운영 적합성은 `DEFERRED — PRE-COMMERCIALIZATION/PRE-PRODUCTION`이다.

구현 전에 반드시 Ticket/Token TTL, 동의 schema·버전, 기기 신뢰정책, key envelope/API, 모바일 보존·삭제, B Gateway 네트워크, PACS 편입 책임, Break Glass 활성 여부와 감사실패 정책을 승인해야 한다.

## 26. 결론

1. **기존 정책 변경:** 모바일을 QR 전용/P1 단말에서 암호 패키지 저장·운반·B 전달 P0 매체로 변경했다.
2. **모바일 P0 정책:** 등록·비차단 기기, 명시 MOBILE_STORE/HANDOFF 동의, 앱 Vault, 별도 데이터채널, B 의료진 MFA와 환자 승인 결합이다.
3. **권한·동의·QR 결정:** RBAC+ABAC AND 평가, 행위별 동의, opaque 일회 Ticket, 서버 원자소비·replay 차단을 채택했다.
4. **패키지 보안:** AES-256-GCM, 전송별 DEK, 방식 B 기기 envelope→정책 기반 B 재래핑, QR key 금지, manifest/hash/tag 검증, TTL 삭제다.
5. **주요 위협:** QR/token replay, 기관·Study 우회, 분실·루팅·백업·위장앱, 변조, Relay/KMS/계정/감사 침해를 deny-by-default와 탐지·폐기로 대응한다.
6. **미결정:** TTL·보존기간, KMS·attestation, PACS 편입, Break Glass, 운영 감사·법적 책임이다.
7. **구현 전 필수 확정:** consent/token/package schema, key-release 시퀀스, 기기 lifecycle, 네트워크·삭제·오류·감사실패 계약이다.
8. **추적성:** 12개 정책군을 FR·UC와 보안/수용/감사시험에 연결했으며 모바일 증적은 아직 `[미생성]`이다.
9. **다음 산출물:** **모바일 영상 패키지·키 래핑·QR 핸드오프·Gateway API·Token 상태를 정의하는 상세 인터페이스 및 데이터 명세서**.

최종 판정: 정책 기준선은 작성됐으나 Mobile-Core 종단 구현과 운영·법적 검증은 완료되지 않았다.
