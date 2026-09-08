# Highpass Mobile-Core 업무흐름·유스케이스 정의서

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 법률 적합성, 병원 보안 승인, 의료기기 인증 또는 운영 준비 완료를 의미하지 않는다.

| 문서 항목 | 내용 |
|---|---|
| 버전·기준일 | v1.0-DRAFT / 2026-09-01 |
| 기준선 | `highpass-mobile-core-requirements-definition.md` v3.0-DRAFT-BASELINE |
| 상태 | 승인 전 설계, 모바일 핵심기능 `[구현 예정]` |
| 데이터 | 가상 병원·합성 환자·합성 DICOM만 사용 |

## 1. 문서 개요

본 문서는 A 병원 영상의 암호화 모바일 저장과 B 병원 QR 핸드오프, 기존 클라우드 원격조회를 두 개의 P0 흐름으로 정의한다. QR은 일회용 제어정보이며 영상·개인정보·키를 포함하지 않는다. 실제 영상은 별도 암호화 데이터 채널로 이동한다.

표기: `[구현 완료]`은 코드와 시험 증적이 확인된 경우, `[부분 구현]`은 기존 서버 기능만 존재하는 경우, `[구현 예정]`은 Mobile-Core 구현이 없는 경우, `[검증 필요]`는 실행 증적이 부족한 경우, `[결정 필요]`는 승인되지 않은 설계 선택을 뜻한다.

## 2. 변경 배경

기존 v2의 모바일은 동의·QR 승인 단말이고 영상 원본은 A PACS에 유지한 채 DICOMweb으로 조회했다. Mobile-Core는 원본 분산 보관 원칙을 유지하면서, 환자 단말의 앱 전용영역에 암호화 패키지를 임시 보관·운반하는 흐름을 P0로 추가한다. 모바일은 반신뢰 매체이며 평문 DICOM 저장, 일반 파일 공유, OS 백업을 허용하지 않는다.

## 3. 업무흐름 작성 기준

- 모든 허용은 환자 동의, 기관·의료진, 목적, Study·Series, 행위, 유효기간을 서버에서 함께 검증한다.
- OIDC/OAuth 2.0, 의료진 MFA, RBAC+ABAC, TLS 1.3, Gateway 간 mTLS를 기본으로 한다.
- 패키지는 전송별 DEK로 AES-256-GCM 암호화하고 DEK는 KEK/수신 주체 키로 래핑한다. 키와 암호문은 논리적으로 분리한다.
- Ticket은 추측 불가능하고 짧은 TTL을 가진 일회용 참조값이다. 승인·소비·만료·철회 시 재사용을 거부한다.
- 실패 시 기본 거부하고 보안로그 실패 시 중요 상태변경을 완료하지 않는다. 세부 가용성 정책은 `[결정 필요]`이다.
- 조회, 다운로드, PACS 편입은 서로 다른 권한으로 판정한다. 성능 수치는 `[성능 목표 결정 필요]`이다.

## 4. 시스템 행위자

| 행위자 | 역할·업무 | 접근 데이터 | 인증·권한 | 주요 위협 / 감사대상 |
|---|---|---|---|---|
| 환자·보호자 | 동의, 기기 등록, QR 스캔, 전달 승인 | 본인 가명정보·패키지 상태 | OIDC, 기기 바인딩, 생체/PIN | 탈취·오승인 / 동의·승인·철회 |
| A 의료진 | 환자·영상·목적·B 병원 선택 | 허용 환자 메타데이터 | OIDC+MFA, A 소속 RBAC/ABAC | 과다선택 / 요청·Study 선택 |
| B 의료진 | 세션 생성, 수신, 조회·편입 | 승인 Study·Series | OIDC+MFA, B 소속 RBAC/ABAC | 기관·범위 우회 / 세션·조회·편입 |
| 병원 관리자 | 사용자·Gateway·정책 관리 | 기관 범위 운영정보 | 관리자 MFA, 최소권한 | 권한남용 / 정책변경 |
| Highpass 운영자 | 서비스 운영 | 최소 메타데이터 | PAM/MFA `[결정 필요]` | 내부자·오조작 / 운영행위 |
| 보안관리자 | 탐지·감사 조회 | 보호된 감사정보 | SECURITY_ADMIN, MFA | 로그 유출·삭제 / 조회·내보내기 |
| A PACS/Orthanc | 승인 DICOM 원본 제공 | 원본 DICOM | A Edge 전용 mTLS | 직접접근 / QIDO·WADO |
| A Edge Connector | 범위조회, manifest, 암호화·발급 | 승인 DICOM과 DEK 일시처리 | 서비스 mTLS, workload ID | 키·평문 노출 / 생성·암호화 |
| 환자 모바일 앱 | 암호문 저장·운반·전송 | 암호 패키지, 최소 메타 | 기기 키, 앱 인증, 생체/PIN | 분실·루팅·백업 / 저장·삭제 |
| B Edge Connector | 수신·검증·복호화·전달 | 승인 패키지, 단기 평문 | mTLS, 기관/세션 바인딩 | 변조·재전송 / 수신·검증 |
| Control Plane·정책엔진 | 동의·Ticket·정책·상태 | 최소 메타·키 참조 | 서비스 인증, RBAC/ABAC | 정책우회 / ALLOW·DENY |
| Cloud Relay | 암호문 중계·TTL 캐시 | 암호문만 | mTLS, signed grant | 침해·잔존 / 입출·삭제 |
| OIDC IdP | 사용자·MFA 인증 | 계정·claim | OIDC | 계정탈취 / 인증결과 |
| KMS/HSM | KEK, wrap/unwrap | 키 재료·키 메타 | workload policy | 키 탈취 / 키연산 |
| 감사로그 저장소 | 불변 감사 증적 | 가명화 이벤트 | append-only, 관리자 분리 | 삭제·변조 / 검증·조회 |
| OHIF Viewer | 승인 영상 표시 | 승인된 인스턴스·프레임 | B 세션, 단기 scope | URL token·다운로드 / 조회 |
| B PACS | 승인된 영상 편입 | 명시 허용 원본 | B Edge 전용 mTLS | 무단저장·회수불가 / 편입 |

## 5. 전체 서비스 업무흐름

| ID | P | 흐름 | 핵심 상태·통제 | 구현상태 |
|---|---|---|---|---|
| WF-01 | P0 | 환자 계정→앱 설치→기기 바인딩→생체/PIN→분실·교체 | Device ACTIVE/BLOCKED, attestation `[결정 필요]` | `[구현 예정]` |
| WF-02 | P0 | A 의료진 인증→환자·Study/Series·B·목적 선택→동의 요청→환자 승인/거부 | 동의 DRAFT→PENDING→APPROVED/REJECTED | `[부분 구현]` |
| WF-03 | P0 | A PACS 조회→manifest/hash→DEK→AES-GCM→key wrap→모바일 저장확인 | 패키지 CREATED→ENCRYPTED→STORED | `[구현 예정]` |
| WF-04 | P0 | 오프라인 보관→잠금·TTL 확인→공간/배터리 처리→분실 차단·삭제 | READY/EXPIRED/REVOKED/DELETED | `[구현 예정]` |
| WF-05 | P0 | B 의료진 MFA→세션/QR→모바일 스캔→환자 승인→검증→별도 채널 전송 | Ticket ISSUED→SCANNED→APPROVED→CONSUMED | `[구현 예정]` |
| WF-06 | P0 | B 수신→manifest·개수·hash·GCM 검증→복호화→Viewer 또는 PACS | RECEIVED→VERIFIED→VIEWED/IMPORTED | `[구현 예정]` |
| WF-07 | P0 | B 인증·정책→QIDO→필요 항목 WADO→Relay 암호문→Viewer/선택 저장 | 단기 scope, progressive retrieval, TTL | `[부분 구현]` |
| WF-08 | P0 | 동의·Ticket·패키지 만료/철회→접근차단→삭제·키폐기→증적 | fail closed, PACS 사본 회수 한계 명시 | `[부분 구현]` |

두 P0 종단경로는 `A PACS→A Edge→암호 패키지→모바일→B Edge→Viewer/PACS`와 `A PACS→A Edge→암호 Relay→B Edge→Viewer/PACS`이다.

## 6. 모바일 영상 패키지 발급 흐름

1. A 의료진은 MFA 후 합성 환자, B 병원, 진료 목적, Study와 필요한 Series, VIEW/DOWNLOAD/IMPORT 행위를 선택한다.
2. 정책엔진은 소속·역할·동의·목적·범위·기간을 검증한다. 환자는 앱/링크로 동의를 승인하며 포괄동의는 허용하지 않는다.
3. A Edge만 PACS에 mTLS로 QIDO/WADO 요청하고 승인 인스턴스만 가져온다.
4. 파일 목록·크기·SOP UID·해시의 canonical manifest를 만들고 전송별 DEK로 각 payload를 AES-256-GCM 암호화한다.
5. DEK는 KMS/HSM의 KEK와 허용 수신 조건에 묶어 래핑한다. 암호문과 키 참조를 분리한다.
6. 등록·비차단 기기에 TLS로 전달하고 앱 Vault 저장, 원자적 완료, manifest 재검증 뒤 `STORED_ON_DEVICE`로 전이한다.

PACS 장애, 범위 불일치, 공간 부족, 기기 미등록, 무결성 오류는 `FAILED` 또는 재시도 가능 상태로 끝나며 성공으로 기록하지 않는다.

## 7. 모바일 저장·운반 흐름

모바일 Vault는 앱 샌드박스·OS hardware-backed keystore 사용을 목표로 하고 일반 파일앱, 갤러리, clipboard, share sheet, 일반 백업을 차단한다. 앱은 암호문과 최소 표시정보만 저장하며 미리보기 평문 캐시는 사용 후 즉시 제거한다. 오프라인에서는 TTL·철회 최신성에 한계가 있으므로 핸드오프 직전 온라인 재검증을 필수화한다. 루팅·탈옥 또는 attestation 실패 처리는 원칙적으로 차단하되 세부 정책은 `[결정 필요]`이다. 앱 삭제·재설치, 기기교체, 분실 신고 시 기기 바인딩과 unwrap 권한을 폐기하고 서버에 삭제/접근불능 증적을 남긴다.

## 8. B 병원 QR 핸드오프 흐름

정상 흐름은 B 의료진 MFA→B 기관·의료진·목적·TTL에 바인딩된 세션/Ticket 생성→QR 표시→환자 앱 스캔→환자 생체/PIN 승인→서버 동의·Ticket·Study 검증→모바일과 B Edge 사이 별도 TLS 데이터 채널→수신영수증→Ticket 소비이다. QR은 Ticket 참조만 포함하며 영상, 개인정보, manifest, URL bearer token, 복호화 키를 포함하지 않는다.

대체 흐름은 B가 환자 앱의 역방향 QR을 스캔하거나 환자가 검증된 B 링크를 선택하는 방식이다. 모바일 오프라인이면 암호문 보관만 허용하고 전달 완료를 유예한다. 원격조회만 허용되면 모바일 업로드/PACS 편입을 차단하고 WF-07로 전환한다.

## 9. B 병원 수신·검증·이용 흐름

B Edge는 수신 전 B 기관·의료진·환자 승인·동의·Ticket·목적·Study/Series·행위·TTL을 다시 검증한다. 수신 후 manifest 서명/정규형, 파일 수·크기·해시, AES-GCM 인증태그를 검증한다. 모든 검증 후에만 KMS가 B Edge에 제한적으로 unwrap을 허용한다. Viewer 조회는 단기 세션으로 제공하고 다운로드와 PACS 편입은 별도 정책을 요구한다. 편입 후 사본은 B 병원 보존정책의 지배를 받으므로 동의 철회가 이미 편입된 법정 보존 사본의 자동 삭제를 보장하지 않는다.

## 10. 클라우드 중계·원격조회 흐름

B 의료진 인증과 ABAC 허용 후 B Edge가 QIDO-RS로 목록을 검색하고 WADO-RS로 필요한 Series·Instance·Frame을 순차 조회한다. A Edge는 A PACS와 연결하고 Cloud Relay는 종단 암호문과 최소 라우팅 메타만 처리하며 평문 DICOM을 볼 수 없어야 한다. 임시 캐시는 TTL 후 삭제한다. 다운로드는 기본 차단하고, STOW-RS/C-STORE는 IMPORT 권한이 있을 때만 별도 수행한다. 기존 서버의 정책·토큰·QIDO/WADO·감사 기능은 `[부분 구현]`, 실제 Edge/Relay/PACS 종단연동은 `[검증 필요]`이다.

## 11. 만료·철회·삭제 흐름

동의 철회는 신규 Ticket·토큰·unwrap을 즉시 차단하고 활성 세션을 폐기한다. Ticket TTL 만료·소비·재사용은 DENY한다. 모바일 패키지 TTL 만료 또는 기기 차단 시 Vault 삭제를 요청하고, 오프라인 단말에는 키 접근불능화와 다음 연결 시 삭제를 적용한다. Relay 캐시는 TTL 삭제, B Edge 임시는 처리 후 삭제한다. 삭제 결과와 키 폐기는 별도 증적으로 기록한다. 이미 B PACS에 합법적으로 편입된 사본은 B 병원의 보존·파기 정책과 법적 의무를 따른다 `[법률·병원 정책 검토 필요]`.

## 12. 유스케이스 목록

| UC | 명칭 | P | 관련 WF | 상태 |
|---|---|---|---|---|
| UC-001~003 | 인증, 기기 등록, 분실 차단 | P0 | WF-01 | `[구현 예정]` |
| UC-004~008 | 요청, 동의, Study·Series 선택 | P0 | WF-02 | `[부분 구현]` |
| UC-009~013 | 생성, 암호화, 모바일 저장·만료 | P0 | WF-03~04 | `[구현 예정]` |
| UC-014~020 | 세션, QR, 승인, Ticket, 전송·재시도 | P0 | WF-05 | `[구현 예정]` |
| UC-021~023 | 검증, Viewer, PACS 편입 | P0(편입 P1 가능) | WF-06 | `[구현 예정]` |
| UC-024~026 | QIDO, WADO, STOW/C-STORE | P0/P1 | WF-07 | `[부분 구현]` |
| UC-027~030 | 재사용·기관·범위 차단, 감사 | P0 | WF-05~08 | `[부분 구현]` |

## 13. 유스케이스 상세

아래 모든 정상흐름은 합성데이터 기준이다. 공통 예외는 인증 실패, 동의 거부·철회, 만료·재사용·복제 QR, 기관/환자/Study 불일치, 미등록·분실·루팅 기기, 공간 부족·앱 삭제, 네트워크·PACS·Gateway·Relay 장애, 전송중단, 변조·hash/복호화 오류, 감사기록 실패이며 모두 기본 거부한다. 공통 통제는 OIDC/OAuth, 의료진 MFA, RBAC+ABAC, 주체·기관·Study 바인딩, TTL/replay 방지, TLS 1.3·mTLS, AES-256-GCM, DEK/KEK 분리, OS 키 저장소·앱 샌드박스, 외부공유/백업 차단, 무결성·감사이다.

### UC-001 사용자 인증

- **기본정보:** P0; 목적은 환자/의료진/관리자 신원 확인; 주 행위자 사용자, 보조 IdP; FR-AUTH-001~002; WF-01·02·05·07; `[부분 구현]`.
- **사전/시작:** 등록 계정·기관, IdP 가용; 로그인 선택으로 시작.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 사용자/IdP | OIDC 인증·의료진 MFA | credential→code | 계정·MFA | LOGIN_ATTEMPT | session pending |
| 2 | Control Plane | claim·기관·역할 검증 | code→session | issuer/aud/nonce/RBAC | LOGIN_RESULT | authenticated/denied |
- **대체/예외:** 환자는 기기 생체/PIN으로 재인증; MFA 실패·기관 비활성·IdP 장애는 거부.
- **사후/통제:** 짧은 세션 또는 DENIED, 로그인 감사; OIDC, MFA, RBAC, fail closed.

### UC-002 모바일 기기 등록

- **기본정보:** P0; 환자 계정과 앱 설치 기기 바인딩; 환자·앱·Control Plane/KMS; FR-MOBILE-001~003, FR-KEY-004; WF-01; `[구현 예정]`.
- **사전/시작:** 환자 인증, 지원 OS, 미차단 기기; 등록 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱 | 기기 키쌍·attestation 생성 | device proof | 환자 재인증 | DEVICE_ENROLL_START | pending |
| 2 | Control Plane | proof·기기 한도 검증·바인딩 | deviceId | patient/device ABAC | DEVICE_ENROLLED | ACTIVE |
- **대체/예외:** 기기교체는 기존 기기 해지 후 등록; 루팅·위조 proof·기기한도 초과는 차단.
- **사후/통제:** ACTIVE 또는 REJECTED; hardware key, sandbox, audit, fail closed.

### UC-003 기기 분실 및 원격차단

- **기본정보:** P0; 분실 기기의 신규 접근·unwrap 차단; 환자/관리자·KMS; FR-MOBILE-010~012, FR-KEY-006; WF-01·04·08; `[구현 예정]`.
- **사전/시작:** 등록 기기; 분실 신고 또는 위험탐지.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 환자/관리자 | 분실 신고 | deviceId | 강한 재인증 | DEVICE_LOST | ACTIVE→BLOCKED |
| 2 | 시스템/KMS | 세션·키권한 폐기, 삭제명령 | revoke/delete | device binding | DEVICE_REMOTE_BLOCK | package→REVOKED |
- **대체/예외:** 오프라인 단말은 다음 연결 시 삭제; 신원확인 실패는 관리자 복구절차 `[결정 필요]`.
- **사후/통제:** 신규 전달 불가, 기존 암호문 접근불능 목표; revocation, key separation, audit.

### UC-004 A 병원 전송 요청 생성

- **기본정보:** P0; 전송 맥락 생성; A 의료진·정책엔진; FR-INST-001, FR-CONSENT-001, FR-POLICY-001; WF-02; `[부분 구현]`.
- **사전/시작:** A 의료진 MFA, A/B 기관·환자·Study 존재; 요청 작성.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | A 의료진 | B·목적·범위·행위·기간 입력 | request draft | A 소속/RBAC | TRANSFER_DRAFT | DRAFT |
| 2 | 정책엔진 | 완전성·최소범위 검증 | requestId | ABAC | TRANSFER_REQUESTED | CONSENT_PENDING |
- **대체/예외:** B가 먼저 요청해도 A 확인 필요; 기관·목적·환자 불일치, 과도범위는 거부.
- **사후/통제:** 동의대기 요청 또는 DENIED; MFA, least privilege, audit.

### UC-005 환자 동의 요청 발급

- **기본정보:** P0; 환자에게 명시적 범위 제시; A 의료진·환자 앱; FR-CONSENT-001~002; WF-02; `[부분 구현]`.
- **사전/시작:** 유효 DRAFT 요청, 환자 연락수단/등록기기; 발급 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | Control Plane | 최소정보 링크/QR 생성 | opaque consent ref | patient/request binding | CONSENT_ISSUED | CONSENT_PENDING |
| 2 | 앱 | 범위·목적·기간·행위 표시 | consent summary | 환자 인증 | CONSENT_VIEWED | pending |
- **대체/예외:** 검증된 모바일 링크 가능; 개인정보 포함 QR, 만료 링크, 잘못된 환자면 거부.
- **사후/통제:** pending; opaque reference, TTL, audit.

### UC-006 환자 동의 승인

- **기본정보:** P0; 명시 동의 확정; 환자·정책엔진; FR-CONSENT-002, FR-POLICY-001; WF-02; `[부분 구현]`.
- **사전/시작:** 환자 인증, CONSENT_PENDING, 기간 유효; 승인·생체/PIN.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 환자 앱 | 최종 범위 확인·승인 | signed intent | patient/device binding | CONSENT_APPROVE_ATTEMPT | pending |
| 2 | 정책엔진 | nonce·범위·기간 검증 | consentId | ABAC/replay | CONSENT_APPROVED | APPROVED |
- **대체/예외:** 일부 Series/VIEW_ONLY로 축소 승인 가능; 만료·중복·다른 환자는 거부.
- **사후/통제:** APPROVED, 발급 가능; strong auth, binding, audit.

### UC-007 환자 동의 거부·철회

- **기본정보:** P0; 거부 또는 기존 권한 회수; 환자·정책/KMS; FR-CONSENT-002, FR-KEY-006; WF-02·08; `[부분 구현]`.
- **사전/시작:** pending/approved 동의; 거부·철회 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 환자 | 사유 선택·확인 | consentId | patient binding | CONSENT_REVOKE_ATTEMPT | pending |
| 2 | 시스템 | Ticket·token·unwrap 차단 | revoke result | current status | CONSENT_REJECTED/REVOKED | REJECTED/REVOKED |
- **대체/예외:** 지원센터 절차는 강한 신원확인; 이미 PACS 편입본은 자동회수 불가.
- **사후/통제:** 신규 접근 거부, 삭제명령·감사; immediate revocation, fail closed.

### UC-008 Study·Series 선택

- **기본정보:** P0; 필요 최소 영상 범위 지정; A 의료진·A PACS; FR-DICOM-001~002, FR-POLICY-001; WF-02·03; `[부분 구현]`.
- **사전/시작:** A 권한, 합성 환자 매칭; 영상목록 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | A Edge | QIDO 목록 조회 | Study/Series meta | A PACS mTLS | STUDY_SEARCH | unchanged |
| 2 | A 의료진 | Study/Series 확정 | scoped UIDs | patient/purpose scope | STUDY_SELECTED | request scope set |
- **대체/예외:** 일부 Series만 선택; 다른 환자 UID·형식 오류·PACS 장애는 거부/재시도.
- **사후/통제:** 승인 후보 scope; UID validation, minimum necessary, audit.

### UC-009 DICOM 영상 패키지 생성

- **기본정보:** P0; 승인 인스턴스와 manifest 구성; A Edge/PACS; FR-PACKAGE-001~004, FR-DICOM-002; WF-03; `[구현 예정]`.
- **사전/시작:** APPROVED 동의·scope, PACS 연결; 발급 실행.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | A Edge | 승인 인스턴스 WADO 조회 | DICOM set | consent/scope/mTLS | PACKAGE_FETCH | CREATED |
| 2 | A Edge | manifest·개수·크기·hash 생성 | canonical manifest | UID/scope recheck | PACKAGE_CREATED | CREATED |
- **대체/예외:** 재개 가능한 생성 `[결정 필요]`; 누락·범위외·PACS 오류면 FAILED.
- **사후/통제:** 평문은 Edge 임시영역에만 존재 후 삭제; scope, integrity, audit.

### UC-010 영상 패키지 암호화

- **기본정보:** P0; 모바일 보관 전 기밀성·무결성 보장; A Edge·KMS; FR-PACKAGE-005~007, FR-KEY-001~005; WF-03; `[구현 예정]`.
- **사전/시작:** 완전한 manifest/패키지, KMS 가용; 생성 후 자동 시작.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | KMS/A Edge | 전송별 DEK 생성·AES-GCM 암호화 | ciphertext/tag | workload identity | PACKAGE_ENCRYPT_START | CREATED→ENCRYPTED |
| 2 | KMS | DEK wrap·key reference 발급 | wrapped key ref | device/B policy | PACKAGE_ENCRYPTED | ENCRYPTED |
- **대체/예외:** KMS 장애·nonce 중복·tag 생성 실패는 폐기 후 실패; 키를 로그에 남기지 않는다.
- **사후/통제:** 암호문만 배포 가능; AES-GCM, DEK/KEK, HSM/KMS, zeroization.

### UC-011 모바일 영상 패키지 저장

- **기본정보:** P0; 등록 앱 Vault에 암호문 저장; 환자 앱·A Edge; FR-MOBILE-004~009, FR-STORAGE-001~004; WF-03; `[구현 예정]`.
- **사전/시작:** ACTIVE 기기, ENCRYPTED package, 공간·네트워크; 환자 수락.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱/A Edge | TLS 분할 다운로드 | ciphertext chunks | device/package grant | MOBILE_DOWNLOAD | DOWNLOADING |
| 2 | 앱 | 원자 저장·hash 검증·receipt | stored receipt | sandbox/device binding | MOBILE_STORED | STORED_ON_DEVICE |
- **대체/예외:** 오프라인 재개·부분파일 격리; 공간부족·분실·루팅·앱삭제는 FAILED/차단.
- **사후/통제:** Vault 암호문, READY 전 서버 확인; no backup/share, TLS, audit.

### UC-012 모바일 저장상태 확인

- **기본정보:** P0; 사용자에게 안전한 상태·TTL 표시; 환자 앱; FR-MOBILE-006~008, FR-STORAGE-005; WF-04; `[구현 예정]`.
- **사전/시작:** 저장 메타 존재; 앱 열기/상태조회.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱 | 로컬 manifest/hash·TTL 검사 | status | 생체/PIN | PACKAGE_STATUS_VIEW | unchanged |
| 2 | Control Plane | 철회·기기 상태 동기화 | effective status | patient/device | PACKAGE_STATUS_SYNC | READY/REVOKED/EXPIRED |
- **대체/예외:** 오프라인은 마지막 확인시각과 제한 표시; 평문 미리보기·민감정보 표시는 금지.
- **사후/통제:** 유효 상태 표시; minimal UI, revalidation, audit.

### UC-013 모바일 패키지 만료·삭제

- **기본정보:** P0; TTL/철회 후 접근불능·삭제; 앱·KMS; FR-STORAGE-005~007, FR-KEY-006~007; WF-04·08; `[구현 예정]`.
- **사전/시작:** 만료/철회/사용자 삭제; scheduler 또는 명령.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 시스템/KMS | unwrap 권한·세션 폐기 | revocation | package/device | KEY_REVOKED | EXPIRED/REVOKED |
| 2 | 앱 | 암호문·임시캐시 삭제·receipt | deletion proof | app integrity | PACKAGE_DELETED | DELETED |
- **대체/예외:** 오프라인/앱삭제 시 cryptographic erasure 우선, 다음 연결 증적; 물리삭제 보장은 `[검증 필요]`.
- **사후/통제:** 접근불능·삭제증적; TTL, key destruction, audit.

### UC-014 B 병원 핸드오프 세션 생성

- **기본정보:** P0; 인증된 B 수신 맥락 생성; B 의료진·Control Plane; FR-HANDOFF-001~003; WF-05; `[구현 예정]`.
- **사전/시작:** B 의료진 MFA, B Gateway ONLINE; 수신 시작.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B 의료진 | 목적·행위 입력 | session request | B role/hospital | HANDOFF_SESSION_REQUEST | pending |
| 2 | 시스템 | 세션을 B·의료진·목적·TTL에 바인딩 | sessionId | ABAC | HANDOFF_SESSION_CREATED | CREATED |
- **대체/예외:** B가 먼저 환자 요청 가능; Gateway 장애·권한없음·목적누락은 거부.
- **사후/통제:** CREATED session; MFA, binding, TTL, audit.

### UC-015 핸드오프 QR 발급

- **기본정보:** P0; 일회용 Ticket을 QR로 제시; Control Plane·B 화면; FR-QR-001~003, FR-HANDOFF-002; WF-05; `[구현 예정]`.
- **사전/시작:** 유효 CREATED session; QR 발급.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 시스템 | 고엔트로피 Ticket 생성 | opaque ticket | session binding | TICKET_CREATED | CREATED |
| 2 | B 화면 | 개인정보·키 없는 QR 표시 | QR ref | B session | QR_ISSUED | ISSUED |
- **대체/예외:** 짧은 코드 병행은 `[결정 필요]`; 캡처돼도 승인·바인딩 없이는 사용 불가, 만료 시 재발급.
- **사후/통제:** ISSUED; one-time, TTL, no secrets/PHI, replay defense.

### UC-016 모바일 QR 스캔

- **기본정보:** P0; 환자 앱이 B 세션 참조 획득; 환자 앱; FR-QR-001~003, FR-HANDOFF-003; WF-05; `[구현 예정]`.
- **사전/시작:** ACTIVE 기기, READY package, ISSUED Ticket; 카메라 스캔.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱 | QR 형식·도메인 검증 | ticket ref | app allowlist | QR_SCAN_ATTEMPT | unchanged |
| 2 | 시스템 | TTL·B 기관·세션 조회 | safe summary | ticket/device | QR_SCANNED | SCANNED |
- **대체/예외:** B가 환자 앱 역방향 QR 스캔 가능; 가짜 도메인·복제·만료·다른 기관은 차단.
- **사후/통제:** SCANNED, 아직 전송 불가; allowlist, anti-phishing, audit.

### UC-017 환자 핸드오프 승인

- **기본정보:** P0; B·목적·범위 확인 후 전달 의사 확정; 환자; FR-HANDOFF-003~005; WF-05; `[구현 예정]`.
- **사전/시작:** SCANNED Ticket, APPROVED 동의, 환자 재인증; 승인 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱 | B·목적·Study/Series·행위 표시 | approval summary | 생체/PIN | HANDOFF_APPROVE_ATTEMPT | SCANNED |
| 2 | 정책엔진 | 동의·환자·기기·세션 재검증 | approval grant | ABAC/replay | HANDOFF_APPROVED | APPROVED |
- **대체/예외:** 원격조회만 승인 또는 거부 가능; 동의 철회·범위변경·다른 환자는 REJECTED.
- **사후/통제:** APPROVED grant 또는 거부; explicit consent, binding, audit.

### UC-018 Transfer Ticket 검증

- **기본정보:** P0; Ticket의 일회성·범위·기관 검증; B Edge·정책엔진; FR-HANDOFF-004~007; WF-05; `[구현 예정]`.
- **사전/시작:** APPROVED Ticket, B Edge mTLS; 전송 초기화.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | introspection 요청 | ticket+proof | mTLS/B workload | TICKET_VALIDATE | APPROVED |
| 2 | 정책엔진 | TTL·nonce·기관·의료진·동의·scope 검사 | upload grant/deny | full ABAC | POLICY_ALLOW/DENY | HANDOFF_PENDING/REJECTED |
- **대체/예외:** 원격조회 grant로 전환 가능; 재사용·복제·만료·다른 기관은 거부·탐지.
- **사후/통제:** 짧은 upload grant; one-time CAS, TTL, mTLS, audit.

### UC-019 모바일→B Gateway 패키지 전송

- **기본정보:** P0; 암호 패키지를 별도 데이터 채널로 전달; 앱·B Edge; FR-HANDOFF-006~008, FR-STORAGE-003; WF-05; `[구현 예정]`.
- **사전/시작:** 유효 upload grant, B Edge ready, 암호문 존재; 승인 후 자동 시작.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 앱/B Edge | TLS chunk upload | ciphertext | grant/device/B binding | PACKAGE_UPLOAD | UPLOADING |
| 2 | B Edge | 완전수신·receipt, Ticket 원자 소비 | receipt | size/hash/session | PACKAGE_RECEIVED | RECEIVED; Ticket CONSUMED |
- **대체/예외:** Relay 보조 경로 `[결정 필요]`; 중단 시 검증된 offset만 재개, 기관변경·grant 만료는 거부.
- **사후/통제:** RECEIVED, 재사용 불가; TLS, resume nonce, no QR data path, audit.

### UC-020 전송 중단 및 재시도

- **기본정보:** P0; 중복·손상 없이 재개; 앱·B Edge; FR-HANDOFF-008, FR-ERROR-001~003; WF-05; `[구현 예정]`.
- **사전/시작:** UPLOADING 중 네트워크/배터리 장애; 재시도 이벤트.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | 수신 chunk/hash checkpoint 저장 | resume offset | session/grant | TRANSFER_INTERRUPTED | HANDOFF_PENDING |
| 2 | 앱 | 새 grant로 미수신 chunk 재전송 | remaining chunks | re-auth/revalidate | TRANSFER_RETRIED | UPLOADING/RECEIVED |
- **대체/예외:** TTL 내 자동 재시도 횟수 `[결정 필요]`; 만료·철회·서버 불일치는 처음부터 거부.
- **사후/통제:** 단일 완전본 또는 FAILED; idempotency, integrity, bounded retry, audit.

### UC-021 패키지 무결성 검증

- **기본정보:** P0; 변조·누락 검출 후 복호화 허용; B Edge·KMS; FR-PACKAGE-003~007, FR-KEY-005; WF-06; `[구현 예정]`.
- **사전/시작:** RECEIVED package; 수신 완료.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | manifest·개수·크기·hash 검증 | integrity result | package/session | PACKAGE_INTEGRITY_CHECK | RECEIVED |
| 2 | B Edge/KMS | GCM tag·key policy 검증 | verified/decrypt grant | B/scope/TTL | PACKAGE_VERIFIED/DENIED | VERIFIED/FAILED |
- **대체/예외:** 부분 재수신 가능; hash/tag/manifest/unwrap 실패는 격리·삭제, 상세값은 사용자에 숨김.
- **사후/통제:** VERIFIED만 이용; AEAD, canonical manifest, KMS policy, audit.

### UC-022 B 병원 Viewer 조회

- **기본정보:** P0; 승인 의료진이 허용 영상 조회; B 의료진·OHIF/B Edge; FR-VIEW-001~003; WF-06; `[부분 구현]`.
- **사전/시작:** VERIFIED, B 의료진 MFA, VIEW 권한; Viewer 열기.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | 짧은 Viewer 세션 발급 | scoped session | B/doctor/study/series | VIEW_SESSION_ISSUED | VERIFIED |
| 2 | OHIF | 필요한 DICOMweb 객체만 요청·표시 | instances/frames | scope each request | VIEWER_ACCESSED | VIEWED |
- **대체/예외:** 원격조회 WF-07 가능; 직접 UID·다운로드·만료 세션·범위외 요청은 차단.
- **사후/통제:** VIEWED, token URL/로그 미노출; server ABAC, short session, audit.

### UC-023 B 병원 PACS 편입

- **기본정보:** P0 후보/P1 확장; 명시 허용 영상만 B PACS 저장; B 의료진/Edge/PACS; FR-PACS-001~003; WF-06; `[구현 예정]`.
- **사전/시작:** VERIFIED, IMPORT 권한, B 정책·용량·환자 매핑; 편입 선택.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B 의료진 | 저장 사유·대상 확인 | import request | role/purpose/permission | PACS_IMPORT_REQUEST | VERIFIED |
| 2 | B Edge/PACS | STOW-RS/C-STORE·수신확인 | DICOM/receipt | mTLS, UID/map | PACS_IMPORTED | IMPORTED |
- **대체/예외:** VIEW_ONLY면 조회만; 중복 UID·매핑·PACS 장애는 격리/재시도.
- **사후/통제:** IMPORTED 사본은 B 보존정책 적용; separate permission, mTLS, audit.

### UC-024 QIDO-RS 검색

- **기본정보:** P0; 허용 영상 메타데이터 검색; B 의료진·B/A Edge; FR-DICOM-001~003; WF-07; `[부분 구현]`.
- **사전/시작:** 인증·동의·검색 scope, Gateway 연결; 목록조회.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | 정책검사 후 A Edge QIDO | scoped query | token/hospital/study | QIDO_REQUEST | unchanged |
| 2 | A Edge | 최소 메타 필터 응답 | Study/Series meta | PACS mTLS/scope | QIDO_RESULT | unchanged |
- **대체/예외:** 빈 결과는 정상; wildcard 과다검색·다른 환자·PACS 장애는 제한/거부.
- **사후/통제:** 최소 메타 목록; parameter validation, rate limit, audit.

### UC-025 WADO-RS 원격조회

- **기본정보:** P0; 허용 객체를 필요할 때 조회; B 의료진·Edge/Relay; FR-DICOM-003~005, FR-VIEW-001; WF-07; `[부분 구현]`.
- **사전/시작:** QIDO 결과, VIEW scope, 동의 유효; Viewer 요청.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B/A Edge | 매 요청 scope 재검증·WADO | UID request | consent/token/series | WADO_REQUEST | unchanged |
| 2 | Edge/Relay | 암호화 중계·필요 객체 반환 | instance/frame | mTLS/TTL | WADO_RESULT | VIEWED |
- **대체/예외:** progressive retrieval·cache; Relay/PACS 장애, 범위외·만료는 표준 오류/거부.
- **사후/통제:** 필요한 객체만 표시, TTL 캐시 삭제; E2E encryption, audit.

### UC-026 STOW-RS·C-STORE 저장

- **기본정보:** P1 또는 명시 승인 P0; 원격경로의 B PACS 편입; B Edge/PACS; FR-DICOM-006, FR-PACS-001~003; WF-07; `[검증 필요]`.
- **사전/시작:** IMPORT 권한, VERIFIED object, B PACS 가용; 저장 승인.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | B Edge | STOW 또는 C-STORE 전송 | DICOM set | import scope/mTLS | STORE_REQUEST | pending |
| 2 | B PACS | UID·환자매핑·저장 결과 | receipt | PACS policy | STORE_RESULT | IMPORTED/FAILED |
- **대체/예외:** 기관별 프로토콜 선택 `[결정 필요]`; 부분성공은 상세 receipt와 보상처리.
- **사후/통제:** 저장본/실패목록 명확; protocol allowlist, audit, retention notice.

### UC-027 QR 재사용 차단

- **기본정보:** P0 보안; 소비·복제 Ticket 거부; 정책엔진; FR-QR-002~003, FR-HANDOFF-007; WF-05·08; `[구현 예정]`.
- **사전/시작:** CONSUMED/EXPIRED Ticket 제출; 검증 요청.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 시스템 | nonce 상태를 원자 조회·소비 시도 | ticket | CAS/TTL/session | TICKET_REPLAY_ATTEMPT | unchanged |
| 2 | 정책엔진 | DENY·위험신호·rate limit | safe denial | actor/device/IP | TICKET_REPLAY_BLOCKED | REJECTED 유지 |
- **대체/예외:** 동시 최초요청은 하나만 성공; 반복 시 기기/세션 차단.
- **사후/통제:** 영상·키 접근 없음; single-use CAS, replay detection, audit.

### UC-028 다른 기관 접근 차단

- **기본정보:** P0 보안; Ticket/동의 대상 외 기관 거부; 정책엔진·B Edge; FR-POLICY-001~002, FR-HANDOFF-004; WF-05~07; `[부분 구현]`.
- **사전/시작:** 기관 불일치 요청; introspection/API 호출.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 정책엔진 | token·mTLS 기관과 target 비교 | claims/cert | hospital binding | CROSS_HOSPITAL_ATTEMPT | unchanged |
| 2 | Gateway | 안전한 403·전송/unwrap 차단 | denial | fail closed | HOSPITAL_MISMATCH_DENIED | REJECTED |
- **대체/예외:** 합법적 대상 변경은 기존 동의 폐기 후 신규 동의; claim/cert 불일치는 침해로 탐지.
- **사후/통제:** 데이터 이동 없음; mTLS identity, ABAC, audit.

### UC-029 권한 없는 Study 접근 차단

- **기본정보:** P0 보안; 다른 환자·범위외 UID 거부; Gateway/정책; FR-POLICY-001~002, FR-DICOM-002; WF-03·05~07; `[부분 구현]`.
- **사전/시작:** 범위외 Study/Series 요청; API/직접입력.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | Gateway | UID 정규화·token/동의 scope 비교 | requested UID | patient/study/series | SCOPE_VIOLATION | unchanged |
| 2 | 정책엔진 | DENY·반복탐지 | safe denial | ABAC/rate rule | STUDY_ACCESS_DENIED | DENIED |
- **대체/예외:** 일부 Series 허용 시 허용 목록만 반환; 존재여부를 추론할 상세 오류는 숨긴다.
- **사후/통제:** 범위외 데이터 미노출; server-side scope, least privilege, audit.

### UC-030 감사로그 생성 및 조회

- **기본정보:** P0; 종단 행위·거부·폐기 추적; 모든 주체/보안관리자; FR-AUDIT-001~003; WF-01~08; `[부분 구현]`.
- **사전/시작:** 감사대상 사건 또는 권한 있는 조회; 이벤트 발생.
| 단계 | 수행 주체 | 수행 내용 | 입력·출력 | 인증·권한검사 | 감사로그 | 상태변경 |
|---|---|---|---|---|---|---|
| 1 | 서비스 | 가명화 이벤트·correlation 기록 | audit event | schema/redaction | AUDIT_APPEND | append-only |
| 2 | 보안관리자 | 기간·기관·trace 검색·chain 검증 | filtered result | SECURITY_ADMIN/MFA | AUDIT_VIEWED | unchanged |
- **대체/예외:** SIEM 연계 `[P1 확장]`; 저장 실패 시 중요 허용행위 중단·경보, 로그 삭제/변조는 탐지.
- **사후/통제:** 불변 이벤트·조회 자체 감사; hash chain/WORM 목표, separation of duties, no secrets.

## 14. 상태 전이

### 동의 상태

| 상태 | 진입조건 | 허용되는 다음 상태 | 사용자 표시 | 접근 가능 여부 | 감사 이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|---|
| DRAFT | 요청 임시저장 | CONSENT_PENDING, REJECTED | 작성 중 | 불가 | CONSENT_DRAFTED | TTL 정리 |
| CONSENT_PENDING | 환자에게 발급 | APPROVED, REJECTED, EXPIRED | 승인 대기 | 불가 | CONSENT_ISSUED | 만료 보존정책 |
| APPROVED | 환자 강한 인증·승인 | REVOKED, EXPIRED | 동의함 | scope 내 가능 | CONSENT_APPROVED | 철회 시 grant 폐기 |
| REJECTED | 환자 거부/정책 거부 | 없음(신규 요청) | 거부됨 | 불가 | CONSENT_REJECTED | 최소 증적 유지 |
| EXPIRED | validUntil 경과 | 없음(신규 요청) | 만료됨 | 불가 | CONSENT_EXPIRED | grant/key 차단 |
| REVOKED | 환자 철회 | 없음(신규 요청) | 철회됨 | 불가 | CONSENT_REVOKED | Ticket/token 폐기 |

### Transfer Ticket 상태

| 상태 | 진입조건 | 허용되는 다음 상태 | 사용자 표시 | 접근 가능 여부 | 감사 이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|---|
| CREATED | 세션 검증 | ISSUED, REVOKED | 생성 중 | 불가 | TICKET_CREATED | TTL |
| ISSUED | QR 표시 | SCANNED, EXPIRED, REVOKED | 스캔 대기 | 불가 | QR_ISSUED | 만료 폐기 |
| SCANNED | 유효 앱 스캔 | APPROVED, REJECTED, EXPIRED | 승인 대기 | 불가 | QR_SCANNED | TTL |
| APPROVED | 환자·정책 승인 | CONSUMED, REVOKED, EXPIRED | 전송 승인 | 업로드만 | HANDOFF_APPROVED | 단회 소비 |
| CONSUMED | 원자적 전송수신 | 없음 | 사용 완료 | 불가 | TICKET_CONSUMED | nonce 보존 |
| EXPIRED | TTL 경과 | 없음 | 만료 | 불가 | TICKET_EXPIRED | 참조 폐기 |
| REVOKED | 동의/관리 차단 | 없음 | 철회 | 불가 | TICKET_REVOKED | grant 폐기 |
| REJECTED | 환자/정책 거부 | 없음 | 거부 | 불가 | TICKET_REJECTED | 최소 증적 |

### 모바일 패키지 상태

| 상태 | 진입조건 | 허용되는 다음 상태 | 사용자 표시 | 접근 가능 여부 | 감사 이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|---|
| CREATED | manifest 완료 | ENCRYPTED, FAILED | 준비 중 | 불가 | PACKAGE_CREATED | 평문 임시삭제 |
| ENCRYPTED | AEAD·wrap 완료 | DOWNLOADING, FAILED | 발급 준비 | 불가 | PACKAGE_ENCRYPTED | 키 분리 |
| DOWNLOADING | 앱 전송 시작 | STORED_ON_DEVICE, FAILED | 저장 중 | 불가 | MOBILE_DOWNLOAD | 부분파일 격리 |
| STORED_ON_DEVICE | 원자 저장·hash 확인 | READY_FOR_HANDOFF, EXPIRED, REVOKED, DELETED | 저장 완료 | 승인 전 불가 | MOBILE_STORED | Vault TTL |
| READY_FOR_HANDOFF | 서버 최신상태 확인 | HANDOFF_PENDING, EXPIRED, REVOKED, DELETED | 전달 가능 | 승인 시 가능 | PACKAGE_READY | TTL |
| HANDOFF_PENDING | Ticket 스캔/승인대기 | UPLOADING, REVOKED, EXPIRED, FAILED | 승인/연결 대기 | 불가 | HANDOFF_PENDING | grant TTL |
| UPLOADING | B 데이터채널 전송 | RECEIVED, FAILED, REVOKED | 전송 중 | 업로드만 | PACKAGE_UPLOAD | checkpoint TTL |
| RECEIVED | B 완전수신 | VERIFIED, FAILED | 검증 중 | 불가 | PACKAGE_RECEIVED | 격리 |
| VERIFIED | manifest/hash/tag 통과 | VIEWED, IMPORTED, DELETED | 검증 완료 | scope 내 | PACKAGE_VERIFIED | 임시평문 TTL |
| VIEWED | Viewer 조회 | IMPORTED, DELETED, EXPIRED | 조회됨 | 유효 세션만 | VIEWER_ACCESSED | 캐시 삭제 |
| IMPORTED | B PACS receipt | DELETED | PACS 저장됨 | B 정책 적용 | PACS_IMPORTED | B 보존정책 |
| EXPIRED | TTL 경과 | DELETED | 만료 | 불가 | PACKAGE_EXPIRED | key 차단·삭제 |
| REVOKED | 동의/기기 차단 | DELETED | 철회 | 불가 | PACKAGE_REVOKED | key 차단·삭제 |
| DELETED | Vault/임시본 삭제 | 없음 | 삭제됨 | 불가 | PACKAGE_DELETED | 증적 유지 |
| FAILED | 생성·전송·검증 실패 | ENCRYPTED, DOWNLOADING, HANDOFF_PENDING, DELETED | 실패/재시도 | 불가 | PACKAGE_FAILED | 불완전본 삭제 |

## 15. 보안·개인정보 통제 흐름

### 영상 데이터 경로

`A PACS ─mTLS→ A Edge ─AES-256-GCM→ {모바일 Vault 또는 Cloud Relay} ─TLS/mTLS→ B Edge ─검증·정책→ {OHIF Viewer 또는 B PACS}`

Cloud Relay는 암호문만 처리하며 평문 DICOM을 볼 수 없어야 한다. 모바일에도 평문 영상은 지속 저장하지 않는다. B Edge의 평문은 VERIFIED 후 허용 행위에 필요한 시간만 존재한다.

### 제어·키 데이터 경로

`IdP→사용자 인증`, `Control Plane→동의·정책·Ticket·상태`, `KMS/HSM→DEK 생성·KEK wrap·조건부 unwrap`, `각 서비스→감사로그 저장소`로 분리한다. QR에는 Ticket 참조만 있고 복호화 키는 없다. B Edge는 B workload identity, 유효 동의, 환자 승인, Ticket, 기관·의료진·목적·Study/Series·행위·TTL이 모두 일치할 때만 unwrap할 수 있다. 키와 영상 암호문은 같은 저장객체에 평문으로 공존하지 않는다.

변조는 canonical manifest의 파일 수·크기·SHA-256 해시와 AES-GCM 인증태그로 검출한다. 모바일 분실 시 기기·세션·Ticket·unwrap 권한을 폐기하고 온라인 연결 시 Vault 삭제를 수행한다. 오프라인 탈취 단말의 암호문 물리 회수는 보장할 수 없으므로 hardware-backed key, 앱 잠금, 짧은 TTL이 잔여위험을 줄인다.

## 16. 예외·장애·악용 시나리오

| ID·시나리오 | 행위·전제 | 피해 | 탐지·차단 | 감사·복구 | 잔여위험 |
|---|---|---|---|---|---|
| AB-01 QR 촬영·재사용 | 공격자가 ISSUED QR 복제 | 세션 탈취 시도 | TTL, B/환자/기기 바인딩, 원자 소비 | REPLAY_BLOCKED; Ticket 폐기 | TTL 내 phishing |
| AB-02 제3자 단말조작 | 잠금해제 단말 확보 | 오승인 | 앱 잠금·생체/PIN·위험 재인증 | DEVICE_RISK; 원격차단 | 강압·동시 탈취 |
| AB-03 다른 병원 사용 | C 기관이 Ticket 제출 | 무단 유출 | mTLS 기관 claim과 target 비교 | HOSPITAL_MISMATCH; 세션차단 | 인증기관 계정침해 |
| AB-04 범위외 Study | B 의료진이 UID 변조 | 타환자 노출 | 서버 ABAC·허용목록 | SCOPE_DENIED; rate limit | 내부자 공모 |
| AB-05 저장소 추출 | 앱 sandbox dump | 암호문 유출 | hardware key, encryption, debug/backup 차단 | DEVICE_COMPROMISE; 키폐기 | 오프라인 brute force |
| AB-06 OS 백업 유출 | backup/cloud sync | 암호문 복제 | backup exclusion·restore 검증 | BACKUP_POLICY_FAIL; 기기차단 | OEM별 동작차이 |
| AB-07 루팅·탈옥 | root로 앱 메모리 접근 | 키/평문 노출 | attestation·hook/debug 탐지·차단 | DEVICE_INTEGRITY_FAIL; revoke | 우회 가능한 탐지 |
| AB-08 패키지 변조 | ciphertext/manifest 변경 | 오진·DoS | hash·signature `[결정 필요]`·GCM tag | INTEGRITY_DENIED; 격리삭제 | 메타 canonicalization 오류 |
| AB-09 전송 재전송 | chunk/session replay | 중복·자원고갈 | nonce, idempotency, offset hash, rate limit | TRANSFER_REPLAY; checkpoint 정리 | 분산 race |
| AB-10 만료 후 접근 | 만료 package/Ticket 사용 | 정책우회 | 서버시간·TTL·unwrap 차단 | EXPIRED_DENIED; 삭제 | 오프라인 시간조작 |
| AB-11 철회 후 전송 | 캐시된 grant 사용 | 철회 무시 | 매 단계 최신 동의 introspection | REVOKED_DENIED; grant 폐기 | 짧은 전파지연 |
| AB-12 PACS 사본 회수 | 편입 뒤 철회 | 삭제 기대 불일치 | 편입 전 고지·별도 IMPORT 권한 | RETENTION_NOTICE; B 정책절차 | 법정보존으로 회수불가 |
| AB-13 로그 삭제·변조 | 관리자/침해자가 수정 | 부인방지 상실 | append-only, hash chain, 권한분리 | AUDIT_TAMPER_ALERT; 백업검증 | 운영자 공모 |
| AB-14 Relay 침해 | cache·route 탈취 | 암호문·메타 유출/DoS | 종단암호, TTL, 최소메타, mTLS | RELAY_INCIDENT; key rotate/delete | 트래픽 분석 |
| AB-15 위장앱·가짜 QR | phishing 앱/도메인 | 자격·승인 탈취 | app attestation, universal link allowlist, QR issuer 검증 | PHISHING_BLOCKED; 사용자경보 | 사회공학 |

장애 공통처리는 유한 timeout, 안전한 오류코드, 지수 backoff·상한 재시도, 중복방지 키를 적용한다. A PACS/B Gateway/Relay/IdP/KMS/감사저장소 장애를 정책상 DENY와 구분하고 `NOT VERIFIED` 또는 장애로 기록한다.

## 17. 감사로그 흐름

| 이벤트군·이벤트 ID | 발생시점/수행자 | 필수 결과·실패사유 | 개인정보·보존 |
|---|---|---|---|
| 인증 `AUTH_LOGIN`, `DEVICE_ENROLL/REVOKE` | 로그인·기기 등록/해지 시 사용자·IdP | ALLOW/DENY, reasonCode | actor pseudonym; 기간 `[결정 필요]` |
| 동의 `CONSENT_REQUEST/APPROVE/REJECT/REVOKE` | 요청·상태전이 시 의료진/환자 | 이전/이후 상태, 정책결과 | patient pseudonym; 최소화 |
| 선택·발급 `STUDY_SELECT`, `PACKAGE_CREATE/ENCRYPT/STORE` | 선택·manifest·암호화·저장 시 | Study/Series hash, packageId, 성공/실패 | UID는 민감정보로 보호 |
| QR·전달 `QR_ISSUE/SCAN`, `HANDOFF_APPROVE`, `TICKET_VALIDATE/CONSUME` | 각 세션 단계 | 기관·Ticket ID hash·replay 결과 | QR 원문/secret 금지 |
| 전송·검증 `PACKAGE_TRANSFER/VERIFY/RETRY` | chunk 시작/완료/오류 | bytes/count/hash result, 오류분류 | payload/키 금지 |
| 이용 `VIEW_ACCESS`, `DOWNLOAD_ATTEMPT`, `PACS_IMPORT` | 조회·다운로드·편입 | 행위 scope와 ALLOW/DENY | 최소 UID |
| 수명주기 `TICKET_EXPIRE`, `PACKAGE_DELETE`, `KEY_REVOKE` | 만료·삭제·키폐기 | 증적/실패·재시도 | 삭제대상 원문 금지 |
| 보안 `POLICY_DENY`, `UNAUTHORIZED_BLOCK`, `AUDIT_TAMPER` | 비인가·변조 탐지 | reasonCode·risk signal | 접근 제한·장기보존 검토 |

모든 이벤트는 `eventId`, UTC `timestamp`, `actorId/type`, `hospitalId`, `patientPseudonym`, `studyUid/seriesUid`(필요 시 hash), `action`, `result`, `reasonCode`, `auditSessionId`, `traceId`, `ticketId/packageId/tokenId`의 비밀 아닌 참조값, source IP/device risk, schema version을 가진다. 보존기간은 법무·병원 정책 승인 전 `[결정 필요]`이며 감사로그 조회·내보내기도 감사한다.

## 18. 요구사항·테스트 추적성

| 업무흐름 | 유스케이스 | 요구사항 ID | 보안통제 | 테스트 ID | 증적 |
|---|---|---|---|---|---|
| WF-01 | UC-001~003 | FR-AUTH-001~002, FR-MOBILE-001~003,010~012 | MFA, 기기키, 차단 | AT-UC-001, SEC-UC-003 | `[미생성]` |
| WF-02 | UC-004~008 | FR-CONSENT-001~002, FR-POLICY-001~002, FR-DICOM-001 | 동의·RBAC/ABAC | AT-UC-004, AT-ALT-006, AUD-UC-007 | `[부분 기존시험]` |
| WF-03 | UC-009~011 | FR-PACKAGE-001~007, FR-KEY-001~005 | AES-GCM, DEK/KEK, scope | AT-UC-009, SEC-UC-010, AT-UC-011 | `[미생성]` |
| WF-04 | UC-012~013 | FR-STORAGE-001~007, FR-KEY-006~007 | sandbox, TTL, 삭제 | SEC-UC-003, AT-ERR-013 | `[미생성]` |
| WF-05 | UC-014~020,027~029 | FR-QR-001~003, FR-HANDOFF-001~008 | one-time, binding, replay | AT-UC-014, AT-UC-019, AT-ERR-020, SEC-UC-027~029 | `[미생성]` |
| WF-06 | UC-021~023 | FR-VIEW-001~003, FR-PACS-001~003 | tag/hash, VIEW/IMPORT 분리 | SEC-UC-021, AT-UC-022, AT-UC-023 | `[미생성]` |
| WF-07 | UC-024~026 | FR-DICOM-001~006 | mTLS, short scope, TTL cache | AT-UC-024~026, SEC-UC-025 | `[부분 기존시험]` |
| WF-08 | UC-003,007,013,027,030 | FR-AUDIT-001~003, FR-ERROR-001~003 | 철회, hash chain, fail closed | AT-ERR-007, AT-ERR-013, AUD-UC-030 | `[부분 기존시험]` |

필수 수용시험은 모바일 저장/암호문 확인, B QR 핸드오프, 환자 미승인·의료진 미인증·다른 기관·QR 재사용 차단, 분실 차단, 변조 탐지, 중단 재개, Viewer 조회, PACS 편입, 철회 차단, 만료 삭제, 전 구간 감사이다. 정상은 `AT-UC-*`, 대체는 `AT-ALT-*`, 장애는 `AT-ERR-*`, 보안은 `SEC-UC-*`, 감사는 `AUD-UC-*`로 관리하며 실행 전에는 PASS로 판정하지 않는다.

## 19. Draw.io 구성도 일치성 검토

검토 대상은 `docs/architecture/highpass_hybrid_qr_dicomweb_architecture.drawio` 및 동반 SVG/PNG이다. 파일은 수정하지 않았다.

| 구성도 항목 | 업무흐름 항목 | 불일치 내용 | 수정 권고 | 우선순위 |
|---|---|---|---|---|
| Patient Mobile App | WF-01,03~05 | 별도 노드는 있으나 기존 설명이 “영상 저장소가 아닌 QR·동의 단말”이라 Mobile-Core와 충돌 | 암호화 Vault·기기신뢰·앱잠금·백업제외를 별도 표기 | P0 |
| 모바일 저장영역 | WF-03~04 | 앱 전용 암호화 저장소가 없음 | `Encrypted Package Vault (ciphertext only)` 추가 | P0 |
| A/B Edge | WF-03,05~07 | 두 Edge는 구분되어 있어 일치 | 역할에 package create/receive/verify 추가 | P0 |
| 모바일 패키지 경로 | WF-03,05 | A Edge→Mobile→B Edge 데이터 경로가 없음 | 굵은 암호문 데이터 경로와 프로토콜 경계 추가 | P0 |
| QR와 영상 경로 | WF-05 | QR 제어선은 있으나 모바일 영상선과 비교 불가 | QR 점선과 payload 실선을 분리, QR에 no PHI/key 명시 | P0 |
| Control/Data Plane | 전 WF | 기존 분리는 대체로 일치 | Mobile Vault·Handoff service의 소속 평면 명확화 | P0 |
| 모바일 평문 금지 | WF-03~04 | 모바일 영상 미저장 전제로만 표현 | ciphertext-only, plaintext persistence prohibited 명시 | P0 |
| Browser→PACS | WF-06~07 | 직접접근 금지 구조는 일치 | B Edge 경유 invariant 유지 | P0 |
| 원격조회/모바일 핸드오프 | WF-05,07 | 원격조회만 상세하고 두 P0 경로 구분 부족 | 두 경로를 별도 lane/legend로 표시 | P0 |
| Viewer/PACS | WF-06 | 별도 대상은 표현되나 권한 차이가 약함 | VIEW와 IMPORT 정책게이트 분리 | P1 |
| 키·권한·감사 | WF-03~08 | Control 선은 있으나 package key wrap/unwrap·삭제증적 부족 | KMS key envelope, Ticket/Handoff, Audit 흐름 추가 | P0 |

## 20. 미결정사항 및 위험

- 모바일 OS 최소버전, hardware attestation 공급자, 루팅·탈옥 차단/제한 정책.
- 패키지 최대용량·chunk 크기·재시도 횟수·TTL·오프라인 허용기간 `[성능 목표 결정 필요]`.
- DEK envelope의 기기키/B Gateway 키 결합 방식, 다중기기·기기교체 시 키 재발급 정책.
- A Edge→모바일과 모바일→B Edge의 직접/Relay 선택, 병원망 inbound 제한 대응.
- manifest 서명 방식, canonicalization, 암호 suite/version migration.
- B PACS 환자 매핑·중복 UID·부분성공·보존/삭제 책임과 IMPORT의 P0/P1 확정.
- 보호자 대리동의 및 미성년자, 응급상황, 접근성, 단말 분실 신원복구 절차.
- 감사로그 보존기간·WORM/SIEM, KMS/HSM·실제 IdP·실제 PACS·외부 병원망은 상용화 전 검토/외부자원 필요.
- 모바일은 새로운 고위험 공격면이다. 암호화만으로 루팅 단말의 실행 중 평문·사회공학·오프라인 물리공격을 완전히 제거할 수 없다.

## 21. 결론 및 다음 단계

1. **모바일 핵심 흐름:** A PACS의 승인 범위를 A Edge가 패키징·암호화하고 환자 앱 Vault에 저장한 뒤, B 의료진 세션 QR과 환자 승인을 결합해 별도 데이터 채널로 B Edge에 전달·검증하여 Viewer 또는 PACS로 사용한다.
2. **P0 핵심 UC:** UC-001~022, UC-024~025, UC-027~030. PACS 편입 UC-023·026의 최종 P0 여부는 병원 정책 결정을 요구한다.
3. **P1 확장 UC:** 기관별 STOW-RS/C-STORE 고도화, SIEM/WORM, Relay 보조 모바일 업로드, 운영 attestation·MDM 연계.
4. **주요 통제:** MFA, RBAC+ABAC, 명시동의, 기관·의료진·환자·Study/Series 바인딩, 일회 Ticket, TLS/mTLS, AES-256-GCM, DEK/KEK 분리, Vault·백업차단, 무결성·불변감사, fail closed.
5. **주요 예외:** 분실·루팅·백업, QR 복제/재사용, 기관·범위 우회, 패키지 변조, 전송·PACS·Relay·KMS·감사 장애, 철회/만료, PACS 편입본 회수 한계.
6. **Draw.io 수정 필요:** 암호화 Vault, A Edge→Mobile→B Edge 패키지 경로, QR/데이터 분리, Handoff/Ticket·KMS·감사 경로, 두 P0 lane을 추가해야 한다.
7. **미결정사항:** 단말 신뢰정책, 키 envelope, TTL·용량·재시도, 네트워크 경로, PACS 편입·보존 책임.
8. **추적성:** 8개 WF와 30개 UC를 Mobile-Core FR 및 AT/SEC/AUD 시험 ID에 연결했으며 미실행 시험은 `[미생성]` 또는 `[부분 기존시험]`으로 표시했다.
9. **다음 작성 산출물:** **모바일 영상 패키지·암호화키·QR 핸드오프·DICOM API·상태전이를 정의하는 상세 인터페이스 및 데이터 명세서**.

최종 판단: Mobile-Core 업무·보안 설계 기준선은 작성되었으나 모바일 앱·Vault·패키지·Handoff 종단기능은 `[구현 예정]`이며 운영·법적 적합성을 주장하지 않는다.
