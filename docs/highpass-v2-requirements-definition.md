# Highpass v2 요구사항정의서

> **CAPSTONE PoC / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 본 문서는 법률 적합성 판단, 병원 보안 승인, 인증 또는 운영 준비 완료를 의미하지 않는다.

| 문서 항목 | 내용 |
|---|---|
| 프로젝트 | Highpass Platform v2 |
| 문서 버전 | v2.0-DRAFT |
| 기준일 | 2026-09-01 |
| 문서 상태 | 구조변경 기준선 제안·승인 전 |
| 저장소 기준 | 2026-09-01 현재 작업트리(미커밋 변경 포함) |
| 대상 환경 | 가상 A·B 병원, 합성 환자·DICOM, 로컬 Docker Compose |
| 승인자 | PM / 지도교수 / 의료정보·보안 검토자 `[결정 필요]` |

## 1. 문서 개요

### 1.1 목적과 범위

본 문서는 저장·전송 중심의 기존 설명을 다음 Highpass v2 기준으로 변경하고, 유지·수정·삭제·신규 요구사항을 추적 가능한 형태로 정의한다.

> Highpass는 환자 동의와 기관·의료진별 권한통제를 기반으로 A 병원 PACS에 보관된 CT·MRI 영상을 B 병원에 안전하게 중계하고, 승인된 영상의 원격 조회와 선택적 PACS 편입을 제공하는 클라우드 관리형 하이브리드 의료영상 플랫폼이다.

QR은 영상이나 사용자 인증정보를 저장하지 않는다. QR은 동의·전송 요청을 참조하는 짧은 수명의 일회용 Transfer Ticket 전달 수단이다. B 병원 의료진 인증, 환자 동의, 기관·목적·Study/Series·권한 검사가 모두 성공한 경우에만 Edge Connector를 경유해 저장된 영상을 조회한다.

### 1.2 조사 자료와 사실 등급

| 자료 | 사용 목적 | 확인 결과 |
|---|---|---|
| `README.md`, `package.json`, `docker-compose.yml` | 실행·기술 스택·API | Node.js, PostgreSQL, Orthanc, OHIF, HTTPS Edge 구성 확인 |
| `src/`, `db/schema.sql`, `test/` | 구현·데이터·시험 | 동의, 정책, 단기 토큰, QIDO/WADO, 감사·이상행위 구현 확인 |
| `docs/ARCHITECTURE.md`, 보안·운영 문서 | 경계·통제·제약 | 브라우저-PACS 직접 접근 차단, mTLS, 운영 전 차단 항목 확인 |
| v2 착수계획서 | 구조변경 기준 | QR/Ticket·Relay·PACS 편입은 계획, 실제 외부 연동은 BLOCKED |
| v2 Draw.io 구성도 | 목표 논리 구조 | Control Plane/Data Plane, A/B Edge, 원격조회·편입 분기 확인 |

상태는 `구현됨`, `부분 구현`, `계획`, `BLOCKED`, `범위 제외`, `검증 필요`로 표시한다. 저장소에서 확인되지 않은 내용은 완료로 간주하지 않는다.

### 1.3 변경 이력

| 버전 | 일자 | 변경 내용 |
|---|---|---|
| v2.0-DRAFT | 2026-09-01 | A 병원 원본 유지, 일회성 QR/Ticket, DICOMweb 원격조회, 선택적 편입 구조 반영 |

### 1.4 용어 및 약어

| 용어 | 정의 |
|---|---|
| Control Plane | 동의, 인증 주체, 정책, Ticket, 최소 메타데이터, 상태, 감사를 관리하는 영역 |
| Data Plane | 승인된 DICOM 객체를 Edge 간 암호화 중계하는 영역 |
| Transfer Ticket | QR로 전달되는 불투명 참조값. 직접식별정보·DICOM·암호키를 포함하지 않음 |
| QIDO-RS / WADO-RS / STOW-RS | 각각 DICOMweb 검색 / 조회 / 저장 트랜잭션 |
| PACS 편입 | 별도 승인 후 B 병원 저장정책에 따라 DICOM 객체를 저장하는 P1 행위 |
| Edge Connector | 병원 내부 PACS와 플랫폼 사이에서 기관 인증·정책 집행·감사를 수행하는 구성요소 |
| `auditSessionId` | 동의·Ticket·정책·조회·편입 이벤트를 연결하는 상관 식별자 |
| 즉시 원격조회 | 촬영 완료 후 저장된 승인 영상을 요청 시 조회하는 방식 |

## 2. 프로젝트 개요

### 2.1 추진 배경과 문제

CD·USB·수동 업로드 방식은 매체 발급·운반·등록 지연, 분실 위험, 중복 검사, 이력 단절과 불필요한 전체 Study 복제를 유발할 수 있다. 기존 Highpass 설명도 수신 병원 선저장을 중심으로 하여 원본 분산 보관, 최소 전송, 조회와 저장 권한의 분리를 충분히 드러내지 못했다.

### 2.2 v2 해결방안과 기대효과

Highpass v2는 A 병원 원본 유지, 환자 동의, 의료진 인증, RBAC+ABAC, 짧은 수명의 Ticket·접근토큰, QIDO/WADO 기반 필요한 객체 조회, 선택적 편입, 전 구간 감사를 결합한다. 기대효과는 매체 이동 감소, 진료 연속성 향상, 불필요한 복제 축소, 기관 간 책임경계 명확화, 접근 사유 추적성 향상이다. 효과의 정량 수치는 `[성과지표 결정 필요]`다.

## 3. 시스템 범위

### 3.1 우선순위별 범위

| 구분 | 범위 | 현재 상태 |
|---|---|---|
| P0 | 가상 A/B 병원, 합성 데이터, Orthanc, 동의, 의료진·기관 인증 경계, Study/Series 정책, 단기 접근토큰, QIDO/WADO, OHIF, TLS 1.3 지향, mTLS, 감사·오류 처리 | 일부 구현됨 |
| P0 신규 | 일회용 QR/Transfer Ticket, A/B Edge 분리, 토큰 재사용 차단, 전송상태 모델 | 계획 |
| P1 | STOW-RS/C-STORE 편입, 암호화 임시 캐시, 오프라인 기능, ML-KEM 실험, FHIR/IHE, 다기관 | 계획 |
| P2 | 운영 최적화·확장 기능 | `[결정 필요]` |
| 범위 제외 | 실제 환자정보·실제 PACS, 촬영 장비 생영상, AI 판독, 의료기기 인증, 전국 허브, 인증 완료 주장 | 범위 제외 |

### 3.2 아키텍처 불변조건

1. 원본 DICOM은 A 병원 PACS/Orthanc에 유지한다.
2. Control Plane은 DICOM Pixel Data를 지속 저장하지 않는다.
3. 브라우저는 A 병원 PACS에 직접 접근하지 않는다.
4. QR에는 직접식별정보, DICOM, 장기 토큰, 복호화 키를 넣지 않는다.
5. 환자 동의와 B 의료진 인증 중 하나라도 실패하면 접근을 거부한다.
6. 조회, 다운로드, 중계, B PACS 저장 권한과 감사 이벤트를 분리한다.
7. Data Plane 임시 캐시는 명시적 TTL, 암호화, 자동삭제와 삭제증적이 있어야 한다.

### 3.3 가정과 제약

- `[가정]` 환자·의료진·병원은 합성 식별자만 사용한다.
- `[가정]` P0 IdP는 Mock/Test Provider이며 실제 병원 SSO는 BLOCKED다.
- `[결정 필요]` 환자 본인·보호자 확인 수준과 대리동의 정책.
- `[결정 필요]` Ticket TTL, 재시도 횟수, 캐시 TTL과 보존기간.
- `[검증 필요]` 실제 OHIF Authorization 헤더 전파와 캔버스 표시.
- `[BLOCKED]` 실제 IdP, KMS/HSM, PACS, 외부 Staging, WORM/SIEM, DR.

## 4. 이해관계자 및 사용자

| 주체 | 역할·주요 업무 | 권한 | 접근 데이터 |
|---|---|---|---|
| 환자 | 동의·범위·기간·목적 확인, 승인·철회 | 자신의 동의 조회·변경 | 최소 Study 메타데이터, 동의 상태 |
| A 병원 의료진 | 원본 Study 선택, 전송 요청 | 소속기관 환자·업무범위 | 승인 대상 메타데이터 |
| B 병원 의료진 | 인증 후 검색·조회·별도 저장 요청 | 역할·기관·동의 범위 | 승인된 Study/Series/Instance |
| 병원 관리자 | 사용자·Gateway·기관 정책 관리 | 소속기관 관리 | 소속기관 상태·감사 요약 |
| Highpass 운영자 | 서비스·기관·정책·장애 운영 | 플랫폼 운영, 의료정보 임의 열람 불가 | 운영 메타데이터 |
| 보안관리자 | 감사·경보·무결성 검토 | 감사 읽기, 삭제 불가 | 보호된 감사·보안 이벤트 |
| A/B Gateway | PACS 요청·중계·정책 집행 | 서비스 계정·mTLS | 승인된 DICOM 및 최소 메타데이터 |
| Control Plane | 인증 주체 정규화, 동의·정책·Ticket·상태·감사 | 서버 정책 | 최소 개인정보·참조정보 |
| Cloud Relay | 암호문 중계·선택적 임시 보관 | 평문·키 접근 금지 | 암호문, 최소 라우팅 정보 |
| PACS/Orthanc | 원본 보관 또는 승인 사본 저장 | Gateway를 통한 제한 접근 | DICOM 객체 |
| OIDC IdP | B 의료진 인증·MFA·claims | 신원 검증 | 인증 claims |
| KMS/HSM | KEK·키 수명주기 | 키 사용 정책 | 키 메타데이터·암호 연산 |

## 5. 업무 흐름 및 유스케이스

모든 유스케이스는 `auditSessionId`로 연결하고, 실패 시 내부정보를 노출하지 않는 사유코드와 감사 이벤트를 남긴다.

| ID | 목적·행위자 | 사전/시작조건 | 정상 흐름 | 예외 흐름·사후조건 | 관련 요구사항·검증 |
|---|---|---|---|---|---|
| UC-01 | 환자 동의 등록 | 본인확인, A/B·목적·범위 선택 | 동의 유효성 검사→ACTIVE 저장→감사 | 잘못된 기간·범위 거부; 동의 ID 생성 | FR-CONSENT-001~004; API 시험 |
| UC-02 | QR/Ticket 발급 | 유효 동의·전송 요청 | opaque Ticket 생성→TTL·1회성 저장→QR 표시 | 개인정보 포함·과도한 TTL 거부 | FR-QR-001~006; 디코딩·DB 시험 |
| UC-03 | B 병원 전송 요청 | A 의료진 권한·Study 존재 | 수신기관·목적·범위 지정→환자 승인 요청 | 기관·Study 불일치 거부 | FR-TRANSFER-001~003; 통합시험 |
| UC-04 | QR 스캔·환자 승인 | 미사용·미만료 QR | QR 참조 확인→동의 확인/승인 | 복제·만료·타기관 사용 거부 | FR-QR-003~006; 음성시험 |
| UC-05 | B 의료진 인증 | 등록 기관·계정 | OIDC 인증→MFA→principal/organization 정규화 | 인증·claim·기관 매핑 실패 거부 | FR-AUTH-001~005; Mock/외부 시험 |
| UC-06 | 정책 검증 | 인증·동의·Ticket 존재 | RBAC+ABAC로 기관·사용자·목적·범위·행위 평가 | 하나라도 실패하면 DENY | FR-POLICY-001~008; 결정표 시험 |
| UC-07 | A PACS 검색 | 조회정책 ALLOW | B Viewer→B Edge→A Edge→QIDO-RS | PACS 장애·범위 밖 결과 차단 | FR-DICOM-001~004; QIDO 통합시험 |
| UC-08 | B 원격조회 | WADO 권한·단기 토큰 | 필요한 Instance/Frame을 WADO-RS로 조회 | 만료·철회·scope 위반 차단 | FR-VIEW-001~006; Viewer/E2E |
| UC-09 | 선택적 PACS 편입 | 별도 저장 권한·P1 활성 | 편입 요청→무결성 검사→STOW/C-STORE→영수증 | 부분 실패·중복·B PACS 장애 기록 | FR-PACS-001~006; P1 통합시험 |
| UC-10 | 동의 철회 | ACTIVE 동의 | REVOKED 전환→활성 토큰 폐기→미래 접근 차단 | 이미 만료·철회 상태 처리 | FR-CONSENT-005; API·토큰시험 |
| UC-11 | 토큰 만료 | 발급 토큰 TTL 경과 | introspection 비활성→401/403→감사 | clock skew 정책 초과 거부 | FR-QR-005, FR-POLICY-007; 시간시험 |
| UC-12 | QR 재사용 차단 | Ticket 소비 완료 | 두 번째 교환을 거부하고 보안 이벤트 기록 | 동시 요청은 원자적 소비로 1건만 성공 | FR-QR-004; 경쟁조건 시험 |
| UC-13 | 전송 중단·재시도 | 재시도 가능 상태 | 청크/객체 상태 확인→정책·토큰 재검증→재개 | 횟수 초과 FAILED, 중복 저장 방지 | FR-TRANSFER-004~007; 장애주입 |
| UC-14 | 감사로그 조회 | SECURITY_ADMIN 등 승인 | 필터 조회→무결성 검증→민감필드 제한 | 무권한 401/403, 수정·삭제 405 | FR-AUDIT-001~006; API 시험 |
| UC-15 | 장애·예외 처리 | 구성요소 오류 | timeout→표준 오류→잔존자료 정리→감사 | 우회 경로 없이 fail closed | FR-ERROR-001~006; 장애주입 |

## 6. 기능 요구사항

### 6.1 요구사항 공통 규칙

- 수용기준은 합성 데이터 기반 자동시험 또는 검토 가능한 증적으로 판정한다.
- `구현됨`도 현재 저장소 범위의 상태이며 실제 외부환경 검증을 뜻하지 않는다.
- 의존성 약어: AUTH(인증), CONS(동의), POL(정책), EDGE(Connector), PACS, KMS, AUDIT.

### 6.2 인증·기관·동의·QR 요구사항

| ID | 요구사항명·내용 | 주체 | 우선순위/상태 | 사전조건 | 수용기준 | 검증방법 | 의존성·출처 |
|---|---|---|---|---|---|---|---|
| FR-AUTH-001 | 의료진 OIDC 인증: 시스템은 B 의료진의 issuer, audience, 서명, 만료를 검증해야 한다. | Control Plane | P0/부분 구현 | IdP 설정 | 잘못된 claim·서명·만료 토큰 100% 거부 | 단위·통합시험 | IdP; OIDC 설계 |
| FR-AUTH-002 | MFA: B 의료진은 영상 접근 전 MFA를 완료해야 한다. | IdP | P0/BLOCKED | 실제 IdP | MFA 미완료 principal 접근 거부 | IdP E2E | 외부 IdP; 사용자 요구 |
| FR-AUTH-003 | Principal 정규화: 사용자·역할·기관·인증수단을 서버 principal로 변환한다. | Control Plane | P0/구현됨 | 인증 성공 | body 식별자가 principal과 다르면 거부 | 단위시험 | AUTH; 보안설계 |
| FR-AUTH-004 | Mock 차단: 운영 모드에서 개발 Mock 인증으로 시작하지 않아야 한다. | Control Plane | P0/구현됨 | production 설정 | 프로세스 non-zero 종료 | 설정시험 | 보안설계 |
| FR-AUTH-005 | 세션·로그아웃: 세션 종료·계정 비활성화 후 신규 접근토큰 발급을 차단한다. | IdP/Control | P1/계획 | 세션 정책 | 비활성 계정 발급 0건 | 통합시험 | IdP |
| FR-INST-001 | 기관 등록: 고유 병원 ID, 상태, Gateway와 지원 DICOMweb 기능을 관리한다. | 운영자 | P0/부분 구현 | 관리자 인증 | 중복 ID 거부, 상태 조회 가능 | API·DB 검토 | 설계 |
| FR-INST-002 | 기관 격리: 요청 principal 기관과 동의 수신기관이 일치해야 한다. | Policy | P0/구현됨 | 인증·동의 | 불일치 요청 100% DENY | 음성시험 | POL; Zero Trust |
| FR-INST-003 | Gateway 상태: ONLINE/OFFLINE/DEGRADED를 관리하고 OFFLINE에 신규 전송을 시작하지 않는다. | Control | P0/부분 구현 | healthcheck | OFFLINE 신규 작업 거부 | 장애시험 | EDGE |
| FR-CONSENT-001 | 동의 생성: 환자, A/B 병원, 목적, 권한, 기간, Study/Series 범위를 원자적으로 저장한다. | 환자/Control | P0/구현됨 | 본인확인 가정 | 필수값 누락·역전 기간 거부, ACTIVE 생성 | API·DB 시험 | 사용자 요구 |
| FR-CONSENT-002 | 최소범위: 포괄적 무기한 동의를 기본값으로 사용하지 않는다. | Control | P0/구현됨 | 범위 선택 | Study 최소 1개, 종료시각 필수 | 경계값 시험 | 개인정보 최소화 |
| FR-CONSENT-003 | 동의 조회: 환자 또는 승인 주체만 최소필드로 조회한다. | Control | P0/구현됨 | 인증 | 타 환자·타기관 조회 거부 | API 음성시험 | AUTH |
| FR-CONSENT-004 | 유효성: ACTIVE, validFrom≤현재≤validUntil을 모두 검사한다. | Policy | P0/구현됨 | 동의 존재 | 시작 전·만료 후 DENY | 시간시험 | POL |
| FR-CONSENT-005 | 동의 철회: REVOKED 전환과 활성 접근토큰 폐기를 하나의 업무로 수행한다. | 환자/Control | P0/구현됨 | ACTIVE | 철회 후 신규·기존 토큰 모두 거부, 감사 기록 | 통합시험 | AUDIT |
| FR-CONSENT-006 | 보호자·대리동의: 법적 관계와 권한 증적을 별도로 관리한다. | Control | P1/결정 필요 | 정책 승인 | 승인된 관계 없이는 대리동의 거부 | 검토·시험 | 법무 결정 |
| FR-QR-001 | opaque QR: QR에는 무작위 Ticket 참조값과 최소 라우팅 정보만 포함한다. | Ticket Service | P0/계획 | 동의·요청 | 디코딩 결과에 PII·DICOM·키·장기 토큰 없음 | 정적·동적 시험 | 개인정보 최소화 |
| FR-QR-002 | Ticket 바인딩: 사용자·A/B기관·환자 참조·동의·목적·Study/Series·행위를 바인딩한다. | Ticket Service | P0/계획 | 유효 동의 | 필드 불일치 교환 100% 거부 | 결정표 시험 | POL |
| FR-QR-003 | Ticket TTL: 발급시각·만료시각을 기록하고 TTL은 설정값 상한 이내여야 한다. | Ticket Service | P0/계획 | 시간 동기화 | 만료 후 교환 불가 | 시간시험 | `[TTL 결정 필요]` |
| FR-QR-004 | 1회 소비: Ticket 소비를 원자 처리하고 재사용·동시사용을 차단한다. | Ticket Service | P0/계획 | 미사용 Ticket | 동시 N개 요청 중 최대 1건 성공 | 경쟁시험 | DB 트랜잭션 |
| FR-QR-005 | 폐기: 동의 철회·작업 취소·위험 탐지 시 미사용 Ticket을 폐기한다. | Control | P0/계획 | Ticket 존재 | 폐기 후 교환 거부 | 통합시험 | CONS/AUDIT |
| FR-QR-006 | 노출 방지: Ticket·접근토큰을 URL, 브라우저 history, 일반 로그에 기록하지 않는다. | UI/Edge | P0/부분 구현 | HTTPS | 자동 trace에서 query·로그 노출 0건 | 브라우저 trace | 보안설계 |

### 6.3 정책·DICOM·Viewer·중계·편입 요구사항

| ID | 요구사항명·내용 | 주체 | 우선순위/상태 | 사전조건 | 수용기준 | 검증방법 | 의존성·출처 |
|---|---|---|---|---|---|---|---|
| FR-POLICY-001 | RBAC: PATIENT, DOCTOR, HOSPITAL_ADMIN, SECURITY_ADMIN, PLATFORM_ADMIN과 서비스 역할을 서버에서 검사한다. | Policy | P0/구현됨 | 인증 | 미허용 역할 DENY | 단위시험 | 보안설계 |
| FR-POLICY-002 | ABAC: 기관·동의·목적·기간·Study·Series·행위를 모두 검사한다. | Policy | P0/구현됨 | principal·동의 | 조건 하나라도 불일치하면 DENY | 결정표 시험 | Zero Trust |
| FR-POLICY-003 | 조회 권한: QIDO/WADO 검색·표시 권한을 별도 평가한다. | Policy | P0/구현됨 | VIEW 권한 | 승인 범위만 반환 | E2E | 사용자 요구 |
| FR-POLICY-004 | 다운로드 권한: VIEW_ONLY 사용자의 파일 다운로드 요청을 거부한다. | Policy/Gateway | P0/구현됨 | 토큰 | VIEW_ONLY 다운로드 403 | 음성시험 | 최소권한 |
| FR-POLICY-005 | 저장 권한: B PACS 편입은 조회 권한과 다른 명시적 권한을 요구한다. | Policy | P1/계획 | P1 편입 | VIEW 권한만으로 STOW 불가 | 정책시험 | 구조변경 |
| FR-POLICY-006 | 안전한 사유코드: 거부는 표준 reasonCode로 감사하되 UI에는 민감 내부정보를 숨긴다. | Policy/UI | P0/구현됨 | DENY | 감사에는 코드, UI에는 일반화 메시지 | API/UI 시험 | 보안설계 |
| FR-POLICY-007 | 단기 접근토큰: issuer, audience, jti, 동의, 기관, 사용자, 목적, Study/Series, 권한, 만료를 포함한다. | Control | P0/구현됨 | ALLOW | 기본 5분, 변조·만료·scope 위반 거부 | 단위·E2E | 기존 코드 |
| FR-POLICY-008 | 토큰 폐기·재사용 탐지: 철회·만료 상태를 introspection에서 거부하고 반복 사용을 경보한다. | Gateway | P0/부분 구현 | token log | 비활성 토큰 접근 0건, 반복 실패 감사 | 보안시험 | AUDIT |
| FR-DICOM-001 | UID 검증: StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID를 구분하고 입력 형식을 검증한다. | Gateway | P0/부분 구현 | 요청 | 비정상 UID 400, 범위 밖 UID 403 | API 시험 | DICOM |
| FR-DICOM-002 | QIDO 검색: 승인 범위의 Study/Series 메타데이터만 반환한다. | A Edge | P0/구현됨 | 유효 토큰 | 허용 밖 결과 0건 | E2E | DICOM PS3.18 |
| FR-DICOM-003 | WADO 조회: 승인된 Instance/Frame만 필요 시 반환한다. | A Edge | P0/구현됨 | 유효 토큰 | Study→Series→Instance lazy 요청 확인 | E2E | DICOM PS3.18 |
| FR-DICOM-004 | PACS 직접접근 차단: PACS는 내부망에 두고 Edge/mTLS 경로만 허용한다. | 인프라 | P0/구현됨 | Compose | 호스트 직접 포트 없음, 무인증·비신뢰 인증서 DENY | 네트워크/mTLS 시험 | 아키텍처 |
| FR-DICOM-005 | DICOM 오류 구분: 인증 401, 인가 403, 입력 400, PACS/Upstream 502·504를 구분한다. | Gateway | P0/부분 구현 | 실패 | 표준 오류와 correlation ID 반환 | 장애시험 | 운영성 |
| FR-VIEW-001 | 승인 진입: Viewer는 인증·정책 승인 후에만 접근한다. | Viewer/Edge | P0/부분 구현 | 인증 | 비로그인·미승인 진입 차단 | 브라우저 E2E | AUTH/POL |
| FR-VIEW-002 | 최소 표시: 합성 환자 참조와 필요한 Study 정보만 표시한다. | Viewer | P0/부분 구현 | 조회 성공 | 직접식별정보·토큰·경로 미노출 | UI 검토 | 최소수집 |
| FR-VIEW-003 | 범위 고정: 주소 직접 입력으로 다른 Study/Series를 열 수 없어야 한다. | Gateway | P0/구현됨 | 토큰 | 다른 UID 요청 403 | 음성시험 | POL |
| FR-VIEW-004 | 만료·철회 반영: 토큰 만료 또는 동의 철회 후 재요청을 차단하고 재인증 안내를 표시한다. | Viewer/Gateway | P0/부분 구현 | 상태 변경 | 데이터 미표시·안내 메시지 | E2E | CONS |
| FR-VIEW-005 | Reference 표시: 합성 데이터·PoC·비임상 Reference Viewer임을 화면에 표시한다. | Viewer | P0/부분 구현 | 화면 | 모든 영상 화면에서 배지 확인 | UI 검토 | 범위정의 |
| FR-VIEW-006 | Progressive Loading: 전체 Study 선다운로드 없이 Series/Instance/Frame 단위 요청을 우선한다. | Viewer | P0/부분 구현 | WADO | 네트워크 trace로 순차 요청 확인 | 브라우저 trace | 최소전송 |
| FR-TRANSFER-001 | 전송 작업: 요청마다 고유 transferId, auditSessionId, source/target, Study/Series, 상태를 생성한다. | Control | P0/계획 | 동의 | 필수필드 저장·중복 방지 | API/DB 시험 | 구조변경 |
| FR-TRANSFER-002 | 암호문 중계: Relay는 평문·DEK에 접근하지 않고 Edge 간 암호문만 중계한다. | Relay | P0/계획 | 키 확립 | Relay 로그·저장에 평문 없음 | 설계·침투시험 | 보안설계 |
| FR-TRANSFER-003 | 전송별 AEAD: 전송별 DEK와 AES-256-GCM을 사용하고 nonce를 파일/청크마다 재사용하지 않는다. | Edge | P0/계획 | KMS/Mock KMS | nonce 중복 0건, 태그 변조 거부 | 암호시험 | KMS |
| FR-TRANSFER-004 | 유한 timeout: 모든 PACS·Relay·health 요청과 polling은 설정된 timeout 안에 종료한다. | 전체 | P0/부분 구현 | 설정 | 무응답 시 결정적 오류·non-zero | 장애시험 | 운영성 |
| FR-TRANSFER-005 | 재시도: 재시도 가능 오류만 지수 backoff로 제한 횟수 재시도한다. | Edge | P0/계획 | PARTIAL/FAILED | 정책오류 재시도 0건, 중복 객체 없음 | 장애주입 | `[횟수 결정 필요]` |
| FR-TRANSFER-006 | 무결성: manifest, 객체/청크 hash, AEAD tag를 편입·표시 전에 검증한다. | Edge | P0/계획 | 데이터 수신 | 변조 시 사용·편입 중지 | 변조시험 | 보안설계 |
| FR-TRANSFER-007 | 전송 상태: DRAFT~DELETED 상태와 허용 전이를 원자적으로 기록한다. | Control | P0/계획 | 작업 생성 | 금지 전이 409, 각 전이 감사 | 상태시험 | 12장 |
| FR-PACS-001 | 별도 승인: B PACS 편입은 `PACS_IMPORT` 권한과 B 병원 저장정책 승인을 요구한다. | B Edge | P1/계획 | 조회 가능 | 별도 승인 없는 STOW/C-STORE 거부 | 정책시험 | POL |
| FR-PACS-002 | STOW-RS 우선: 지원 시 STOW-RS로 승인 객체만 저장한다. | B Edge | P1/계획 | B PACS 지원 | 승인 UID만 저장, 응답 영수증 기록 | 통합시험 | DICOM PS3.18 |
| FR-PACS-003 | C-STORE 대안: STOW 미지원 시 승인된 구성에서만 C-STORE를 사용한다. | B Edge | P1/계획 | AE/네트워크 설정 | 미등록 AE 거부 | 통합시험 | `[우선순위 결정 필요]` |
| FR-PACS-004 | 중복·부분성: SOP UID 중복과 일부 저장 결과를 객체별로 기록한다. | B Edge | P1/계획 | 편입 요청 | PARTIAL/COMPLETED 구분 | 장애시험 | PACS |
| FR-PACS-005 | 사본 한계: B PACS 편입 후 동의 철회가 이미 저장된 진료기록의 삭제를 자동 보장하지 않음을 고지한다. | Control/UI | P1/계획 | 편입 완료 | 동의문·감사에 책임경계 기록 | 법무·UI 검토 | `[법률 검토 필요]` |
| FR-PACS-006 | 저장 감사: 요청자, 승인자, UID, 대상 PACS, 결과, 시각을 기록한다. | B Edge/Audit | P1/계획 | 편입 시도 | 성공·부분·실패 모두 감사 | 통합시험 | AUDIT |

### 6.4 감사·보존·오류·관리자 요구사항

| ID | 요구사항명·내용 | 주체 | 우선순위/상태 | 사전조건 | 수용기준 | 검증방법 | 의존성·출처 |
|---|---|---|---|---|---|---|---|
| FR-AUDIT-001 | 이벤트 기록: 로그인, 동의, Ticket, 정책, QIDO/WADO, 다운로드, 편입, 철회, 만료, 실패를 기록한다. | Audit | P0/부분 구현 | 이벤트 | 정의 이벤트별 1건 이상 | 통합시험 | 감사정책 |
| FR-AUDIT-002 | 필드: actor, role, hospital, patient reference, consent, Study/Series/SOP, action, result, reasonCode, IP, timestamp, token/transfer, correlation을 기록한다. | Audit | P0/부분 구현 | 이벤트 | 필수필드 누락률 0% | 스키마시험 | 안전성 기준 |
| FR-AUDIT-003 | 변경 방지: 일반 API로 감사로그 수정·삭제를 허용하지 않는다. | Audit API | P0/구현됨 | 로그 존재 | PUT/PATCH/DELETE 405 | API 시험 | 보안설계 |
| FR-AUDIT-004 | Hash chain: previousHash/recordHash로 순서를 검증하고 불일치를 경보한다. | Audit | P0/구현됨 | 로그 2건 이상 | 변조 fixture 탐지 | 단위시험 | 무결성 |
| FR-AUDIT-005 | 조회 권한: 승인된 관리자만 최소 필드·기간·기관 범위로 조회한다. | Audit API | P0/구현됨 | 인증 | 무권한 401/403 | API 시험 | RBAC |
| FR-AUDIT-006 | 기록 실패: 중요 행위의 감사 기록 실패 시 행위를 중단하거나 보상 이벤트 큐에 보존한다. | 전체 | P0/계획 | Audit 장애 | 기록 없는 중요 ALLOW 0건 | 장애주입 | `[정책 결정 필요]` |
| FR-RETENTION-001 | 분리 보존: DICOM 임시자료, 메타데이터, 동의, 감사의 보존기간을 별도 정책으로 관리한다. | Admin | P0/부분 구현 | 정책 | 데이터 종류별 값·근거 존재 | 정책검토 | 법무 결정 |
| FR-RETENTION-002 | 임시 캐시 삭제: TTL 만료 시 암호화 캐시와 재개파일을 자동 삭제하고 결과를 감사한다. | Relay/Edge | P0/계획 | 캐시 허용 | TTL+허용오차 내 삭제·증적 | 시간시험 | `[TTL 결정 필요]` |
| FR-RETENTION-003 | 기본 비파괴: 데모 시작·중지는 기존 볼륨을 삭제하지 않고, 파괴적 정리는 명시 명령으로 분리한다. | 운영 | P0/구현됨 | Compose | stop/down과 down -v 구분 | Runbook 검토 | 운영성 |
| FR-ERROR-001 | 표준 오류: 인증·인가·입력·PACS·네트워크·TLS·무결성 오류를 구분한다. | API/Edge | P0/부분 구현 | 오류 | 코드·HTTP status·correlation 반환 | 계약시험 | 운영성 |
| FR-ERROR-002 | 내부정보 보호: stack, 인증서 경로, 토큰, 키, 환자정보를 오류·UI에 출력하지 않는다. | 전체 | P0/부분 구현 | 오류 | 민감패턴 0건 | 로그·UI 검사 | 보안설계 |
| FR-ERROR-003 | 장애 격리: 구성요소 장애 시 PACS 직접접근·정책 우회를 허용하지 않는다. | 전체 | P0/구현됨 | 장애 | 우회 경로 0건 | 네트워크시험 | Fail closed |
| FR-ERROR-004 | 부분 전송: 일부 객체 성공 시 PARTIAL로 기록하고 성공·실패 UID를 구분한다. | Transfer | P0/계획 | 일부 실패 | 상태·목록 일치 | 장애주입 | TRANSFER |
| FR-ERROR-005 | 복구 가능성: 재시도 가능 여부와 다음 조치를 사용자에게 일반화해 표시한다. | UI/API | P0/계획 | 실패 | 오류 유형별 안내 확인 | UI 시험 | 사용성 |
| FR-ERROR-006 | 보안 경보: 반복 거부·만료토큰·대량조회·타기관 시도·야간 이상을 룰로 탐지한다. | Security | P0/구현됨 | 감사로그 | fixture별 경보 생성 | 단위시험 | 이상탐지 |
| FR-ADMIN-001 | 기관·사용자·Gateway 관리 API는 관리자 역할과 기관 범위를 검사한다. | Admin API | P1/부분 구현 | 인증 | 타기관 변경 거부 | API 시험 | RBAC |
| FR-ADMIN-002 | 정책 변경은 변경 전후 값, 승인자, 시각을 감사하고 즉시 활성화 여부를 통제한다. | Admin | P1/계획 | 승인 워크플로 | 미승인 변경 미적용 | 통합시험 | 거버넌스 |
| FR-ADMIN-003 | 상태 대시보드는 Gateway·PACS·Relay·DB 상태를 민감정보 없이 표시한다. | Admin UI | P1/계획 | health 수집 | ONLINE/OFFLINE/DEGRADED 표시 | UI 시험 | 운영성 |

## 7. 비기능 요구사항

| ID | 영역 | 측정 가능한 요구사항 | 우선순위/상태 | 검증 |
|---|---|---|---|---|
| NFR-SEC-001 | 보안 | 모든 중요 정책은 서버·Gateway에서 재검증하고 기본 거부한다. | P0/구현됨 | 음성시험 |
| NFR-SEC-002 | 전송보호 | 외부 HTTP API는 TLS 1.3 우선, Gateway-PACS는 상호 인증을 사용한다. | P0/부분 구현 | protocol/mTLS 시험 |
| NFR-PRI-001 | 개인정보 | 합성 데이터만 사용하고 QR·URL·일반 로그에 직접식별정보를 넣지 않는다. | P0/부분 구현 | secret/PII scan |
| NFR-CIA-001 | 기밀성 | DICOM 중계·캐시는 AES-256-GCM 암호문으로 보호하고 Relay 평문 접근을 차단한다. | P0/계획 | 암호·침투시험 |
| NFR-CIA-002 | 무결성 | 객체·청크·감사로그 변조를 탐지하고 사용을 중단한다. | P0/부분 구현 | 변조시험 |
| NFR-CIA-003 | 가용성 | 모든 외부 호출은 유한 timeout을 사용한다. 목표 응답·복구 시간은 `[성능 목표 결정 필요]`다. | P0/부분 구현 | 장애시험 |
| NFR-PERF-001 | 성능 | QIDO, 첫 WADO frame, 대용량 Study 지표를 측정한다. 합격 수치는 `[성능 목표 결정 필요]`다. | P0/계획 | 부하시험 |
| NFR-SCALE-001 | 확장성 | 기관·Gateway 식별자를 전역 고유하게 하고 기관 추가가 기존 정책을 변경하지 않아야 한다. | P1/부분 구현 | 다기관시험 |
| NFR-INT-001 | 상호운용성 | QIDO/WADO/STOW 메시지는 DICOM PS3.18 계약과 호환해야 한다. | P0/P1 부분 | conformance 검토 |
| NFR-AUD-001 | 추적성 | 하나의 업무 흐름을 auditSessionId/transferId/tokenId로 종단 추적한다. | P0/부분 구현 | E2E 로그 대조 |
| NFR-REC-001 | 복구성 | 네트워크 단절 후 중복 없이 재시도하며 RTO/RPO는 `[결정 필요]`다. | P1/계획 | 복구훈련 |
| NFR-OPS-001 | 운영성 | 한 명령으로 로컬 검증하고 각 단계 timeout·종료코드·요약을 제공한다. | P0/구현됨 | `mvp:verify` 실행 |
| NFR-MNT-001 | 유지보수성 | 상태·권한·사유코드를 중앙 enum으로 관리하고 API 변경을 문서화한다. | P0/부분 구현 | 코드검토 |
| NFR-USA-001 | 사용성 | 허용·거부·만료·철회를 색상 외 텍스트와 상태로 표시한다. | P0/부분 구현 | 접근성 검토 |
| NFR-TST-001 | 테스트 | P0마다 정상·음성 시험 ID와 증적 위치를 연결한다. | P0/부분 구현 | 추적성 감사 |

## 8. 동의·권한·토큰 상세 규칙

| 항목 | 규칙 | 상태 |
|---|---|---|
| 동의 주체 | 환자 본인 우선; 보호자는 관계·권한 증적 필요 | 본인 PoC 가정, 보호자 결정 필요 |
| 동의 범위 | A/B 병원, 목적, Study, 선택 Series, VIEW/DOWNLOAD/PACS_IMPORT, validFrom/Until | VIEW/DOWNLOAD 구현, PACS_IMPORT 계획 |
| 결합 조건 | 유효 동의 + B 의료진 OIDC/MFA + 기관 바인딩 + 정책 ALLOW | Mock 인증 기반 부분 구현 |
| Ticket | 불투명·짧은 TTL·1회 사용·원자 소비·재사용 경보 | 계획 |
| 접근토큰 | 기본 5분, issuer/audience/jti/scope/permission/auditSessionId, Authorization header 전달 | 구현됨 |
| 복제·재전송 | Ticket/토큰 digest·상태·소비시각·client context를 검사하고 반복 실패 경보 | 부분 구현 |
| 철회 | 미래 발급 및 활성 토큰 사용 차단; 이미 B PACS에 편입된 사본은 별도 정책 | 토큰 차단 구현, 사본 정책 결정 필요 |
| 응급상황 | 일반 동의를 우회하지 않는다. 별도 break-glass 법적·병원정책 승인 전 범위 제외 | 범위 제외/결정 필요 |
| 상관관계 | 동의 생성부터 조회·편입·삭제까지 동일 auditSessionId 계보 유지 | 부분 구현 |

## 9. 데이터 요구사항

| 데이터 | 생성·조회·변경 | 보존·삭제 | 소유·책임 | 상태 |
|---|---|---|---|---|
| 기관·사용자 | 관리자 등록, principal 매핑 | 계약·계정 정책 `[결정 필요]` | 병원/플랫폼 역할 구분 | 부분 구현 |
| 환자 식별자 | 합성 대체 ID만 사용 | 테스트 종료 정책 | 데이터 생성자 | 구현됨 |
| 동의·Scope | 생성·조회·철회, 이력 유지 | 법적 보존 `[결정 필요]` | 환자 의사·병원/플랫폼 처리책임 검토 | 구현됨 |
| QR/Transfer Ticket | 발급·소비·폐기, 원문 대신 digest 권고 | TTL 후 원문 삭제, 최소 이력 유지 | Control Plane | 계획 |
| Study/Series/Instance | A PACS 원본, Control에는 최소 메타데이터 | 원본은 A 정책, 중앙 지속 저장 금지 | A 병원 | 메타데이터 구현 |
| 전송 작업·상태 | 상태 전이·오류·재시도 기록 | `[보존기간 결정 필요]` | 플랫폼/병원 공동 경계 | 계획 |
| 정책 결정 | 입력 참조·결과·사유 | 감사정책과 연계 | 플랫폼 | 구현됨 |
| 감사로그 | append-only 조회·무결성 | 별도 보존, 파기는 승인·감사 | 보안관리 | 구현됨/운영 WORM BLOCKED |
| 임시 캐시 | 암호문·TTL·키 참조만 | TTL 자동삭제·삭제증적 | Data Plane | 계획 |
| B PACS 사본 | P1 승인 후 저장 | B 병원 의료기록·보존정책 적용; 철회만으로 자동삭제하지 않음 | B 병원 `[법률 검토 필요]` | 계획 |

Control Plane은 DICOM Pixel Data를 지속 저장하지 않는다. 환자명·주민등록번호·실제 환자번호는 사용하지 않으며, 로그에는 가능한 한 가명 참조를 사용한다.

## 10. 인터페이스 요구사항

| ID/인터페이스 | 호출→대상·목적 | 요청/응답 | 인증·권한 | 오류·감사 | 범위/상태 |
|---|---|---|---|---|---|
| IF-01 OIDC/OAuth | Browser→IdP→Control, 의료진 인증 | code/token, 최소 claims | OIDC, MFA, iss/aud/exp | 인증 실패 감사 | P0/BLOCKED(실 IdP) |
| IF-02 Gateway mTLS | Control/B Edge→A Edge/PACS | DICOMweb 요청 | 기관별 인증서, SAN/EKU/chain | TLS 오류 구분·감사 | P0/로컬 구현 |
| IF-03 병원 간 TLS | A Edge↔Relay↔B Edge | 암호문·manifest | TLS 1.3 우선, mTLS | timeout/무결성 감사 | P0/계획 |
| IF-04 QIDO-RS | Viewer/B Edge→A Edge | Study/Series 검색 조건·DICOM JSON | scoped token, VIEW | 400/401/403/502/504 | P0/구현 |
| IF-05 WADO-RS | Viewer/B Edge→A Edge | Instance/Frame·metadata | scoped token, VIEW/DOWNLOAD | 객체 조회 감사 | P0/구현 |
| IF-06 STOW-RS | B Edge→B PACS | 승인 DICOM instance | PACS_IMPORT+mTLS | 객체별 저장 결과 | P1/계획 |
| IF-07 C-STORE | B Edge→B PACS | DICOM association/object | 등록 AE·기관망 | association/객체 결과 | P1/계획 |
| IF-08 Control API | UI/Edge→Control | consent, access, policy, audit query | OIDC/service token+RBAC/ABAC | 표준 오류·감사 | P0/부분 구현 |
| IF-09 Gateway API | Control/Viewer→Gateway | introspection, DICOMweb, gateway audit | bearer/service token+mTLS | 토큰·scope 실패 감사 | P0/구현 |
| IF-10 Viewer API | OHIF→Edge | QIDO/WADO | Authorization header | URL token 금지 | P0/부분 구현 |
| IF-11 Audit API | 서비스/관리자→Audit | 이벤트/필터 결과 | service token/audit:read | 수정·삭제 405 | P0/구현 |
| IF-12 KMS/HSM | Edge/Control→KMS | generate/wrap/unwrap/sign | workload identity·키 정책 | 키 ID만 감사, 키 미출력 | P0 Mock/P1 외부 BLOCKED |

## 11. 보안 및 개인정보 요구사항

1. TLS 1.3을 우선하고 하위 프로토콜 허용 범위는 `[결정 필요]`로 관리한다.
2. Gateway 간·Gateway-PACS 구간은 기관별 인증서 기반 mTLS를 사용하고 무인증·비신뢰·만료 인증서를 거부한다.
3. DICOM 중계·캐시는 전송별 DEK와 AES-256-GCM으로 보호하며 파일/청크 nonce를 재사용하지 않는다.
4. KEK와 DEK를 분리하고 운영 키는 KMS/HSM 정책으로 생성·회전·폐기한다. 로컬 secret은 PoC 한정이다.
5. Relay는 암호문만 처리하고 평문·복호화 키·영구 DICOM 저장 권한을 갖지 않는다.
6. 토큰은 URL·QR·일반 로그에 노출하지 않고 digest·jti·상태로 추적한다.
7. MFA, RBAC+ABAC, 최소권한, 기관 격리, Study/Series 범위 제한을 서버·Gateway 양쪽에서 집행한다.
8. 감사로그는 append-only API, Hash Chain, 권한 분리로 보호하고 운영 전 WORM/SIEM을 검증한다.
9. 임시파일·캐시·백업은 암호화·TTL·접근통제·삭제증적을 적용한다.
10. 인증서·비밀·키는 코드에 하드코딩하거나 로그·증적에 출력하지 않는다.
11. 장애 시 잔존 암호문·재개자료를 정책에 따라 삭제하고 직접 PACS 우회는 허용하지 않는다.

### 11.1 PQC 분류

| 분류 | 요구사항 |
|---|---|
| 현재 P0 | TLS 1.3 우선, mTLS, AES-256-GCM, 키 분리 |
| P1 실험 | ECDHE+ML-KEM 하이브리드 키 교환의 상호운용성·성능 측정 |
| P1 검토 | ML-DSA 기반 manifest/아티팩트 서명 적용성 |
| 필수 설계 | 알고리즘·키 ID·provider 교체가 가능한 Crypto Agility |
| 범위 경계 | 캡스톤 전체 통신구간에 PQC를 강제하지 않음 |

## 12. 상태 및 생명주기 요구사항

| 상태 | 진입조건 | 허용 다음 상태 | 접근 | 감사 | 재시도/삭제 |
|---|---|---|---|---|---|
| DRAFT | 요청 임시저장 | CONSENT_PENDING, DELETED | 불가 | 생성 | 수정·삭제 가능 |
| CONSENT_PENDING | 환자 승인 대기 | APPROVED, EXPIRED, REVOKED | 불가 | 승인요청 | 새 동의 요청 가능 |
| APPROVED | 동의·요청 승인 | READY, REVOKED, EXPIRED | 토큰 발급 전 불가 | 승인 | 준비 재시도 가능 |
| READY | 기관·Gateway 준비 완료 | IN_PROGRESS, REVOKED, EXPIRED, FAILED | 정책 후 가능 | 준비 | 시작 재시도 가능 |
| IN_PROGRESS | 조회/중계 시작 | PARTIAL, COMPLETED, FAILED, REVOKED | 범위 내 가능 | 시작·객체 | 제한 재시도 |
| PARTIAL | 일부 객체 성공 | IN_PROGRESS, COMPLETED, FAILED, DELETED | 성공 객체만 정책에 따라 | 부분결과 | 제한 재시도 |
| COMPLETED | 조회/편입 목표 완료 | EXPIRED, REVOKED, DELETED | 토큰·동의 유효 시 조회 | 완료 | 편입 사본은 B 정책 |
| EXPIRED | 동의/Ticket/토큰 만료 | DELETED | 불가 | 만료 | 신규 요청 필요 |
| REVOKED | 환자·관리정책 철회 | DELETED | 미래 접근 불가 | 철회 | 신규 동의 필요 |
| FAILED | 비복구 오류·재시도 초과 | READY, IN_PROGRESS, DELETED | 불가 | 실패·사유 | 승인 조건에서 재시도 |
| DELETED | TTL/승인 삭제 완료 | 없음 | 불가 | 삭제·증적 | 불가 |

금지 상태 전이는 HTTP 409 또는 동등한 도메인 오류로 거부한다. `REVOKED`와 `EXPIRED`는 신규 접근을 허용하지 않는다.

## 13. 예외·장애·악용 시나리오

| TC-ID | 시나리오 | 기대 결과 | 관련 요구사항 |
|---|---|---|---|
| SEC-QR-01 | QR 만료 | 교환 거부, 새 요청 안내, 감사 | FR-QR-003 |
| SEC-QR-02 | QR 재사용·동시사용 | 최대 1건 성공, 이후 거부·경보 | FR-QR-004 |
| SEC-QR-03 | QR 복제 | 바인딩·상태 검사 실패 시 거부 | FR-QR-002~005 |
| SEC-INST-01 | 다른 병원에서 사용 | HOSPITAL_MISMATCH DENY | FR-INST-002 |
| SEC-SCOPE-01 | 다른 환자/Study/Series | SCOPE_MISMATCH DENY | FR-POLICY-002 |
| SEC-CONS-01 | 동의 철회 | 활성 토큰 폐기·미래 접근 차단 | FR-CONSENT-005 |
| SEC-AUTH-01 | 의료진 인증/MFA 실패 | 영상·메타데이터 미제공 | FR-AUTH-001~002 |
| SEC-MTLS-01 | 인증서 만료·비신뢰·무인증 | TLS handshake 거부 | NFR-SEC-002 |
| OPS-PACS-01 | A PACS 장애 | 502/504, 직접 우회 금지 | FR-ERROR-001~003 |
| OPS-EDGE-01 | B Gateway 장애 | 요청 실패·재시도 가능성 표시 | FR-TRANSFER-005 |
| OPS-RELAY-01 | Relay 장애 | timeout·실패/재시도, 평문 우회 금지 | FR-TRANSFER-002~005 |
| OPS-PERF-01 | 대용량 조회 지연 | timeout 내 상태 반환; 목표 수치 결정 필요 | NFR-PERF-001 |
| OPS-NET-01 | 전송 중 네트워크 단절 | PARTIAL/FAILED, 중복 없는 재개 | FR-ERROR-004 |
| SEC-INT-01 | 일부 파일·태그 변조 | 무결성 실패, 표시·편입 중지 | FR-TRANSFER-006 |
| OPS-AUD-01 | 감사 기록 실패 | 중요 행위 중단 또는 승인된 보상처리 | FR-AUDIT-006 |
| SEC-TOKEN-01 | 토큰 탈취·반복 사용 | scope·상태 검증, 거부·경보 | FR-POLICY-008 |
| SEC-DL-01 | 비인가 다운로드 | 403, 거부 감사 | FR-POLICY-004 |

## 14. 요구사항 추적성

| 목표 | 유스케이스 | 요구사항 ID | 설계요소 | 테스트 ID | 증적 |
|---|---|---|---|---|---|
| 환자 동의 기반 공유 | UC-01,04,10 | FR-CONSENT-001~006 | Consent Service/DB | CONS-UNIT, E2E-CONS | test 결과·audit log |
| 일회성 QR 권한전달 | UC-02,04,12 | FR-QR-001~006 | Ticket Service/QR UI | SEC-QR-01~03 | `[구현 예정]` |
| 기관·의료진 인증 | UC-05 | FR-AUTH-001~005, FR-INST-002 | IdP/Auth Provider | AUTH-UNIT, SEC-AUTH-01 | Node test; 실 IdP BLOCKED |
| 최소권한 정책 | UC-06 | FR-POLICY-001~008 | Policy Service/Gateway | POLICY-UNIT, SEC-SCOPE-01 | Node/E2E 결과 |
| A 원본 검색 | UC-07 | FR-DICOM-001~004 | A Edge/Orthanc | DICOM-QIDO-E2E | E2E 로그 |
| 원격 영상 조회 | UC-08 | FR-VIEW-001~006 | OHIF/B Edge/A Edge | DICOM-WADO-E2E | E2E·browser trace 일부 |
| 암호화 중계 | UC-08,13 | FR-TRANSFER-001~007 | A/B Edge/Relay/KMS | SEC-INT-01, OPS-NET-01 | `[구현 예정]` |
| 선택적 편입 | UC-09 | FR-PACS-001~006 | B Edge/B PACS | PACS-STOW-E2E | P1 `[구현 예정]` |
| 종단 감사 | UC-01~15 | FR-AUDIT-001~006 | Audit/Hash Chain | AUDIT-UNIT, OPS-AUD-01 | Node test·audit API |
| 보존·삭제 | UC-13,15 | FR-RETENTION-001~003 | Cache/Retention | RET-TTL-01 | 일부 정책·계획 |
| 장애 시 차단 | UC-15 | FR-ERROR-001~006 | Edge/API/Monitoring | SEC-MTLS-01, OPS-* | mTLS/network test |

## 15. 기존 문서 변경 영향 분석

| 기존 항목 | 처리 | 변경 내용 | 변경 사유 | 신규 ID |
|---|---|---|---|---|
| 환자 동의·RBAC/ABAC | 유지 | 기관·사용자·목적·Study/Series·행위 바인딩 명시 | 기존 구현 재사용 | FR-CONSENT, FR-POLICY |
| 5분 DICOM 접근토큰 | 유지·수정 | QR Ticket과 Viewer 접근토큰을 분리하고 재사용 통제 추가 | 권한전달 단계 분리 | FR-QR, FR-POLICY-007~008 |
| QIDO/WADO Gateway | 유지 | B Edge→A Edge 경로와 UID 검증 명시 | 직접접근 방지 | FR-DICOM-001~004 |
| 수신 병원에 선저장 | 수정 | 기본은 원격조회, 저장은 P1 별도 승인 | 최소 복제·권한 분리 | FR-VIEW, FR-PACS |
| 환자 휴대폰 원본 저장 | 삭제/P1 재분류 | P0에서 제거; 암호화 임시 저장·오프라인은 P1 | 휴대폰 저장소 오인 방지 | `[P1 결정 필요]` |
| 브라우저-PACS 직접 접근 | 삭제 | Edge Connector 경유만 허용 | 신뢰경계·정책 집행 | FR-DICOM-004 |
| 촬영 중 생영상 설명 | 삭제 | 촬영 완료 후 저장 영상의 요청 기반 조회로 정의 | DICOMweb 역할 정정 | FR-VIEW-006 |
| STOW/C-STORE | 신규 | 원격조회와 분리된 P1 편입 흐름 | 저장 책임·권한 분리 | FR-PACS-001~006 |
| Cloud Relay | 신규 | 암호문 중계·선택적 TTL 캐시, 평문·영구저장 금지 | Data Plane 경계 | FR-TRANSFER-002~003 |
| PQC 전 구간 적용 | 수정 | ML-KEM/ML-DSA는 P1 실험·검토, Crypto Agility 필수 | 성숙도·상호운용성 | 11.1 |
| 실제 외부 연동 | 수정 | IdP/KMS/PACS/Staging은 BLOCKED로 명시 | 증적 부재 | IF-01, IF-12 |
| 감사 Hash Chain | 유지·확장 | QR·편입·캐시 삭제 이벤트 추가 | 종단 추적성 | FR-AUDIT-001~006 |

## 16. 법령 및 표준 검토

본 절은 요구사항에 영향을 주는 공식 자료의 기술·관리적 시사점을 정리한 것이며 개별 서비스의 법률 결론이 아니다. 실제 처리자 역할, 동의문, 제3자 제공·위탁, 보존, 국외이전은 사업모델과 배포구조 확정 후 법무·개인정보보호책임자 검토가 필요하다.

| 구분 | 공식 출처(2026-09-01 확인) | 요구사항 영향 | 상태 |
|---|---|---|---|
| 개인정보 보호법 | [국가법령정보센터](https://www.law.go.kr/) | 민감정보·최소수집·안전조치·처리근거·권리보장 검토 | 적용성 법률검토 필요 |
| 안전성 확보조치 기준 | [개인정보보호위원회고시 제2026-9호, 2026-07-01 시행](https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulNm=%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EC%9D%98+%EC%95%88%EC%A0%84%EC%84%B1+%ED%99%95%EB%B3%B4%EC%A1%B0%EC%B9%98+%EA%B8%B0%EC%A4%80&docType=JO) | 접근통제, 암호화, 접속기록, 보존·파기, 위험관리 | 운영 전 상세 매핑 필요 |
| 의료법 전자의무기록 | [의료법 제23조, 2026-04-07 시행본](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032849013) | A/B PACS 원본·사본 책임, 보존·무결성·접근권한 검토 | 법률·병원정책 검토 필요 |
| 보건의료데이터 가이드라인 | 개인정보보호위원회·보건복지부 최신 공식본 `[최신성 확인 필요]` | 가명처리·연구반출·책임경계 | P1/별도 검토 |
| DICOMweb | [DICOM PS3.18 Web Services](https://www.dicomstandard.org/) | QIDO=검색, WADO=조회, STOW=저장 계약 | P0/P1 설계 기준 |
| OIDC | [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) | 사용자 인증, issuer/audience/claims 검증 | 실제 IdP BLOCKED |
| OAuth 2.0 | [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) | 제한된 API 권한 부여·Bearer 보호 | 구현 프로파일 결정 필요 |
| TLS 1.3 | [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) | 전송구간 보호·상호인증 기반 | 로컬 일부 구현 |
| ML-KEM | [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final) | P1 하이브리드 키 교환 실험 | P1 |
| ML-DSA | [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) | P1 선택적 서명 검토 | P1 |

## 17. 요구사항 변경 요약

- 유지: 동의, RBAC+ABAC, 단기 접근토큰, QIDO/WADO, Orthanc mTLS, OHIF, 감사 Hash Chain.
- 수정: 수신 병원 선저장을 A 병원 원본 유지·기본 원격조회로 변경; 저장은 별도 권한의 P1 편입으로 분리.
- 삭제/범위 이동: 브라우저 직접 PACS 접근, QR 내 의료정보, 촬영 중 생영상, P0 모바일 DICOM 저장, 전 구간 PQC 강제.
- 신규: opaque 일회성 Transfer Ticket, A/B Edge, 암호문 Relay, 전송 상태·재시도·무결성, 선택적 STOW/C-STORE, 캐시 TTL·삭제증적.

## 18. P0 핵심 요구사항 목록

1. FR-AUTH-001~004, FR-INST-001~003
2. FR-CONSENT-001~005
3. FR-QR-001~006
4. FR-POLICY-001~008
5. FR-DICOM-001~005
6. FR-VIEW-001~006
7. FR-TRANSFER-001~007
8. FR-AUDIT-001~006
9. FR-RETENTION-001~003
10. FR-ERROR-001~006
11. NFR-SEC/PRI/CIA/AUD/OPS/TST P0 항목

현재 P0 중 QR/Ticket, A/B Edge 분리, 암호문 Relay·전송별 AEAD, 전송상태·재시도, 감사 실패정책은 미구현 또는 계획이다.

## 19. P1 확장 요구사항 목록

1. FR-AUTH-005, FR-CONSENT-006
2. FR-POLICY-005 및 FR-PACS-001~006
3. 환자 휴대폰 암호화 임시 DICOM·오프라인 기능 `[상세 요구사항 결정 필요]`
4. ECDHE+ML-KEM 하이브리드 실험과 ML-DSA 서명 검토
5. FHIR ImagingStudy/IHE 연계와 다기관 확장
6. 실제 IdP/KMS/PACS·외부 Staging 연동은 자원 제공 전 BLOCKED

## 20. 미결정사항 및 추가 의사결정

| ID | 의사결정 | 필요한 승인·입력 |
|---|---|---|
| DEC-01 | 환자 본인·보호자 확인과 대리동의 | 법무·병원·UX |
| DEC-02 | QR Ticket TTL·표시·재발급·동시소비 정책 | 보안·제품 |
| DEC-03 | 조회·다운로드·편입 권한 모델과 동의문 | 의료정보·법무 |
| DEC-04 | STOW-RS 우선 및 C-STORE fallback | PACS 담당자 |
| DEC-05 | Relay 평문 메모리 금지 범위와 E2E 암호화 키 종단 | 보안 아키텍트 |
| DEC-06 | 캐시 허용조건·TTL·삭제 허용오차·삭제증적 | 개인정보·운영 |
| DEC-07 | 감사 실패 시 동기 차단 또는 내구성 큐 | 보안·SRE |
| DEC-08 | 성능 SLO, timeout, 재시도 횟수·backoff | PM·SRE |
| DEC-09 | 보존기간, B PACS 사본 철회·삭제 책임 | 법무·병원 |
| DEC-10 | 실제 IdP/KMS/PACS/Staging 제공 일정 | 외부 이해관계자 |
| DEC-11 | P1 모바일 저장·오프라인 위협모델 | 보안·모바일 |
| DEC-12 | PQC 실험 성공기준과 적용 대상 | 암호 담당자 |

## 21. 최종 품질검토

| 점검 항목 | 결과 |
|---|---|
| 모든 P0 기능에 고유 ID·수용기준·검증방법 존재 | PASS |
| QR에 직접식별정보·DICOM·키·장기 토큰 금지 | PASS |
| 환자 동의와 B 의료진 인증 결합 | PASS |
| 조회·다운로드·PACS 저장 권한 분리 | PASS |
| Ticket 1회성·TTL·폐기·재사용 차단 정의 | PASS |
| 브라우저-PACS 직접 접근 금지 | PASS |
| QIDO/WADO/STOW 역할 구분 | PASS |
| 저장된 영상 요청 기반 조회로 표현 | PASS |
| Relay 평문·영구저장 금지 및 캐시 TTL | PASS |
| 구현·계획·BLOCKED·범위 제외 구분 | PASS |
| 모바일 저장·PQC를 P1로 분리 | PASS |
| 법률·인증·병원 승인 상태 과장 없음 | PASS |
| 실제 Draw.io와 코드 수준의 전체 양방향 추적 자동검증 | NOT VERIFIED — 후속 추적성 도구 필요 |

## 22. 다음 단계 권고

1. DEC-01~08을 설계 승인회의에서 결정하고 요구사항 기준선을 승인한다.
2. `FR-QR`의 Ticket 데이터모델·API·원자 소비·음성시험을 LLD로 구체화한다.
3. A/B Edge와 암호문 Relay의 키 종단·manifest·재시도 상태기계를 설계한다.
4. 원격조회 P0와 PACS 편입 P1을 API·권한·감사 수준에서 분리한다.
5. 요구사항 ID를 테스트 이름과 증적 manifest에 포함해 자동 추적성을 구축한다.
6. 이후 산출물로 API 명세서, 데이터 모델/ERD, 보안 위협모델 v2, 시험계획서·테스트케이스, 운영·장애 Runbook을 순서대로 작성한다.

---

**최종 흐름:** A 병원 원본 유지 → 환자 동의·QR 발급 → B 병원 의료진 인증 → 정책 승인 → QIDO-RS 검색 → WADO-RS 원격조회 → 필요 시 STOW-RS/C-STORE 편입 → 감사로그
