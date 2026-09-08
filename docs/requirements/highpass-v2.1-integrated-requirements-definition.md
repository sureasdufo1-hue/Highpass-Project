# Highpass v2.1 통합 요구사항정의서

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 본 문서는 PIPA 법률 판단, ISMS-P 인증, 병원 보안 승인 또는 운영 준비 완료를 의미하지 않는다.

| 문서 항목 | 내용 |
|---|---|
| 프로젝트 | Highpass Platform |
| 문서명 | Highpass v2.1 통합 요구사항정의서 |
| 버전 | v2.1-DRAFT-BASELINE |
| 기준일 | 2026-09-01 |
| 문서 상태 | 기존 요구사항 연결·구조변경 통합 기준선, 승인 전 |
| 대상 | 가상 A·B 병원, 합성 환자·DICOM, 로컬 Docker Compose 기반 캡스톤 MVP |
| 선행 문서 | 기존 FR 기능군, v2 요구사항정의서, v2 업무흐름·유스케이스, 착수계획서, Draw.io 구성도 |
| 승인자 | PM / 지도교수 / 의료정보·보안 검토자 `[결정 필요]` |

## 1. 문서 목적

본 문서는 기존 Highpass 요구사항 `FR-001~FR-046`의 기능군과 현재 구현을 보존하면서, 다음 구조변경을 반영한 새로운 요구사항 기준선을 처음부터 정의한다.

> Highpass는 환자 동의와 기관·의료진별 권한통제를 기반으로 A 병원 PACS에 보관된 CT·MRI 영상을 B 병원에 중계하고, 승인된 영상의 DICOMweb 원격 조회와 선택적 PACS 편입을 제공하는 클라우드 관리형 하이브리드 의료영상 플랫폼이다.

핵심 흐름은 다음과 같다.

**A 병원 원본 유지 → A 의료진 전송요청 → 환자 동의·일회성 QR Ticket → B 의료진 OIDC/MFA 인증 → RBAC+ABAC 정책 → QIDO-RS 검색 → WADO-RS 원격조회 → 필요 시 별도 권한으로 STOW-RS/C-STORE 편입 → 전 구간 감사 → 만료·철회·TTL 삭제**

## 2. 작성 근거와 사실 등급

### 2.1 확인한 근거

| 근거 | 확인 내용 | 활용 |
|---|---|---|
| `AGENTS.md` | 기존 FR-001~046의 기능군 범위 | 기존 추적키 보존 |
| `docs/highpass-v2-requirements-definition.md` | v2 기능·비기능 요구사항과 상태 | 신규 요구사항 재정의 근거 |
| `docs/requirements/highpass-v2-workflows-usecases.md` | UC-01~20, 상태·보안 흐름 | 업무·시험 추적 |
| v2 착수계획서·Draw.io | A/B Edge, Control/Data Plane, Relay, 원격조회·편입 분기 | 목표 아키텍처 |
| `src/`, `db/schema.sql`, `test/` | 동의·정책·토큰·QIDO/WADO·감사 구현 | 구현상태 판정 |
| `docker-compose.yml` | Edge HTTPS, Control, PostgreSQL, Orthanc mTLS, OHIF | 로컬 배포경계 |

### 2.2 기존 원문 부재

저장소에는 FR-001~FR-046의 개별 요구사항 원문이 없고 다음 기능군 범위만 확인된다. 따라서 본 문서는 기존 개별 문구를 재구성했다고 주장하지 않으며, 기능군 ID를 `LEGACY-*` 추적키로 보존한다. 원문이 제공되면 항목별 유지·수정·삭제 판정을 다시 승인해야 한다.

### 2.3 상태 정의

| 상태 | 의미 |
|---|---|
| 구현됨 | 저장소 코드와 자동시험에서 행위가 확인됨 |
| 부분 구현 | 일부 코드·시험은 있으나 v2 경계 또는 UI/E2E가 부족함 |
| 계획 | 저장소에 없으며 이번 목표 설계에 포함됨 |
| 미구현·BLOCKED | 실제 IdP·KMS·PACS 등 외부 자원이나 승인이 필요함 |
| 검증 필요 | 코드가 있거나 문서화됐지만 실행 증적이 불충분함 |
| 범위 제외 | 캡스톤 MVP에서 구현하지 않음 |

## 3. 기존 요구사항 기능군과 v2 연결

| 기존 범위 | 기존 기능군 | v2.1 처리 | 연결 영역 | 비고 |
|---|---|---|---|---|
| FR-001~005 | 환자 동의 관리 | 유지·확장 | VR-CONS, VR-TICKET | 동의 요청·승인대기·Ticket 분리 |
| FR-006~009 | 영상 목록·메타데이터 | 유지·수정 | VR-DICOM | A PACS 원본·최소 QIDO 결과 |
| FR-010~013 | 의료진 영상 접근 | 유지·수정 | VR-AUTH, VR-VIEW | B 의료진 독립 인증·Edge 경유 |
| FR-014~020 | 접근정책 검증 | 유지·보강 | VR-POLICY | 기관·목적·행위·scope 결합 |
| FR-021~025 | 단기 DICOMweb 토큰 | 유지·분리 | VR-TOKEN | QR Ticket과 접근토큰을 구분 |
| FR-026~031 | DICOMweb Gateway | 유지·확장 | VR-DICOM, VR-EDGE | A/B Edge 논리분리·mTLS |
| FR-032~036 | Viewer | 유지·보강 | VR-VIEW | WADO 기반 필요 객체 조회·PoC 배지 |
| FR-037~041 | 감사·이상행위 탐지 | 유지·확장 | VR-AUDIT | Ticket·Relay·편입·삭제 이벤트 추가 |
| FR-042~046 | 마스킹·가명처리 | P1/별도 범위 | VR-RESEARCH | 진료·전원 핵심 흐름과 분리 |

## 4. 서비스 원칙과 시스템 범위

### 4.1 아키텍처 불변조건

1. 원본 DICOM은 A 병원 PACS/Orthanc에 유지한다.
2. Control Plane은 DICOM Pixel Data를 지속 저장하지 않는다.
3. 환자 모바일은 P0에서 동의·QR 확인·승인만 수행한다.
4. QR에는 직접식별정보, DICOM, 복호화 키, 장기 인증정보를 포함하지 않는다.
5. 브라우저는 A PACS/Orthanc에 직접 접근하지 않고 B Edge→A Edge를 경유한다.
6. 동의와 B 의료진 인증 중 하나라도 실패하면 영상 접근을 거부한다.
7. 조회·다운로드·중계·PACS 편입은 서로 다른 권한과 감사 이벤트다.
8. QIDO-RS는 검색, WADO-RS는 조회, STOW-RS/C-STORE는 편입에 사용한다.
9. Relay 캐시는 선택적·암호문·TTL 기반이며 영구 영상 저장소가 아니다.

### 4.2 P0·P1·제외 범위

| 구분 | 범위 |
|---|---|
| P0 | 합성 데이터, A/B 가상병원, Orthanc, 동의, 일회성 QR Ticket, B 의료진 인증경계, RBAC+ABAC, 단기 토큰, QIDO/WADO, A/B Edge, mTLS, OHIF, 감사, 상태·오류 |
| P1 | STOW/C-STORE 편입, 모바일 암호화 임시 DICOM·오프라인, FHIR/IHE, 다기관, ML-KEM/ML-DSA 실험 |
| 제외 | 실제 환자정보·실제 병원 PACS, 촬영 장비 생영상, AI 판독, 의료기기 인증, 공식 인증·운영 승인 완료 주장 |

## 5. 이해관계자와 권한 경계

| 주체 | 주요 업무 | 허용 데이터·행위 | 인증·권한 |
|---|---|---|---|
| 환자/보호자 | 동의 확인·승인·거부·철회 | 자신의 동의·합성 Study 요약 | 본인확인; 보호자 정책 결정 필요 |
| A 의료진 | 환자·Study/Series·B 병원·목적 선택 | 소속기관 업무범위 | OIDC 목표/Mock P0, RBAC+ABAC |
| B 의료진 | Ticket 제출, 검색·조회·편입 요청 | 승인된 범위 | OIDC+MFA 목표, 기관·행위 scope |
| 병원 관리자 | 사용자·Gateway·기관정책 | 소속기관 관리 | 관리자 RBAC·MFA 목표 |
| 운영자 | 플랫폼·Relay·장애 운영 | 최소 운영 메타데이터 | 플랫폼 역할, 영상 임의열람 금지 |
| 보안관리자 | 감사·경보·무결성 조사 | 승인된 감사필드 | `audit:read`, 삭제 불가 |
| A/B Edge | PACS 요청·중계·정책 재집행 | 승인 객체 | 서비스 신원+mTLS |
| Control Plane | 동의·Ticket·정책·상태·감사 | 최소 메타데이터 | 내부 서비스 권한 |
| Relay | 암호문 중계·TTL 캐시 | 암호문·라우팅 참조 | 평문·DEK 접근 금지 |
| IdP/KMS/PACS | 인증·키·영상 보관 | 역할별 최소범위 | 외부 연동은 BLOCKED |

## 6. 유스케이스 연결

| UC | 유스케이스 | 우선순위 | 주요 신규 요구사항 |
|---|---|---|---|
| UC-01 | 사용자·기관 인증 | P0 | VR-AUTH-001~005 |
| UC-02 | A 병원 전송요청 생성 | P0 | VR-TRANSFER-001~003 |
| UC-03~05 | 동의 요청·승인·Ticket 발급 | P0 | VR-CONS-001~006, VR-TICKET-001~006 |
| UC-06~08 | B 인증·Ticket 검증·정책 | P0 | VR-AUTH, VR-TICKET, VR-POLICY |
| UC-09~10 | QIDO 검색·WADO 원격조회 | P0 | VR-DICOM, VR-VIEW |
| UC-11 | 선택적 PACS 편입 | P1 | VR-PACS-001~006 |
| UC-12 | 전송상태 확인 | P0 | VR-TRANSFER-004~007 |
| UC-13~15 | 철회·만료·재사용 차단 | P0 | VR-CONS-006, VR-TICKET-004~006 |
| UC-16~17 | 재시도·무결성 실패 | P0 | VR-TRANSFER-002~004, VR-CRYPTO-001~004 |
| UC-18 | 감사로그 조회 | P0 | VR-AUDIT-001~006 |
| UC-19~20 | 장애·비인가 접근 차단 | P0 | VR-ERROR, VR-EDGE |

## 7. 기능 요구사항

모든 요구사항은 서버 또는 Gateway에서 집행한다. UI에서 버튼을 숨기는 것만으로 충족되지 않는다.

### 7.1 인증·기관

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-AUTH-001 | 시스템은 의료진 JWT의 서명, issuer, audience, expiry를 검증해야 한다. | P0/구현됨 | 각 위반 token 100% 거부 | 단위시험 | FR-010~013 |
| VR-AUTH-002 | B 의료진은 영상 접근 전에 OIDC 인증과 MFA를 완료해야 한다. | P0/미구현·BLOCKED | MFA 미완료 접근 0건 | 실제 IdP E2E | FR-010~013 |
| VR-AUTH-003 | 서버는 subject, role, hospital, doctor를 principal로 정규화하고 body 식별자를 신뢰하지 않아야 한다. | P0/구현됨 | principal 불일치 403 | 단위시험 | FR-014~020 |
| VR-AUTH-004 | 운영 모드에서 개발 Mock 인증을 사용하면 시작에 실패해야 한다. | P0/구현됨 | non-zero 종료 | 설정시험 | 신규 보강 |
| VR-AUTH-005 | 계정 비활성·세션 종료 후 신규 DICOM token 발급을 차단해야 한다. | P1/계획 | 비활성 계정 발급 0건 | IdP 통합시험 | 신규 |
| VR-INST-001 | 기관과 Gateway는 고유 ID, 상태, 지원 DICOM 기능을 가져야 한다. | P0/부분 구현 | 중복 ID 거부·상태 조회 | API/DB | FR-006~013 |
| VR-INST-002 | 요청기관·의료진 소속·동의 수신기관이 모두 일치해야 한다. | P0/구현됨 | 모든 불일치 DENY | 음성시험 | FR-014~020 |
| VR-INST-003 | OFFLINE Gateway에는 신규 조회·편입 작업을 시작하지 않아야 한다. | P0/부분 구현 | OFFLINE 요청 거부 | 장애시험 | FR-026~031 |

### 7.2 환자 동의·QR Ticket

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-CONS-001 | 동의 요청은 환자, A/B 병원, 목적, 권한, 기간, Study/Series를 포함해야 한다. | P0/부분 구현 | 필수값 누락·역전기간 거부 | API/DB | FR-001~005 |
| VR-CONS-002 | 포괄적·무기한 동의를 기본값으로 사용하지 않아야 한다. | P0/구현됨 | 최소 1 Study·종료시각 필수 | 경계시험 | FR-001~005 |
| VR-CONS-003 | 승인 전 동의는 영상 접근권한을 만들지 않아야 한다. | P0/계획 | PENDING 접근 0건 | 상태시험 | FR-001~005 |
| VR-CONS-004 | 동의는 ACTIVE/APPROVED와 유효시간을 모두 만족해야 한다. | P0/구현됨 | 시작 전·만료 후 DENY | 시간시험 | FR-014~020 |
| VR-CONS-005 | 환자는 범위를 축소해 승인하거나 거부할 수 있어야 한다. | P0/계획 | 축소 scope만 저장·거부 시 token 없음 | UI/API | FR-001~005 |
| VR-CONS-006 | 철회는 동의를 REVOKED로 바꾸고 관련 Ticket·활성 token을 폐기해야 한다. | P0/구현됨/부분 | 철회 후 신규·기존 접근 거부 | 통합시험 | FR-004, FR-021~025 |
| VR-TICKET-001 | QR에는 고엔트로피 opaque Ticket 참조값만 포함해야 한다. | P0/계획 | 디코딩 결과에 PII·DICOM·키 없음 | 정적/동적시험 | 신규 |
| VR-TICKET-002 | Ticket은 A/B기관, 환자참조, 동의, 목적, Study/Series, 행위에 바인딩돼야 한다. | P0/계획 | 필드 불일치 100% 거부 | 결정표시험 | FR-001~025 확장 |
| VR-TICKET-003 | Ticket은 설정된 TTL과 발급·만료시각을 가져야 한다. | P0/계획 | 만료 후 교환 불가 | 시간시험 | FR-021~025 확장 |
| VR-TICKET-004 | Ticket 소비는 원자적이며 동시 요청 중 최대 한 건만 성공해야 한다. | P0/계획 | N개 동시 요청≤1 성공 | 경쟁시험 | 신규 |
| VR-TICKET-005 | 철회·취소·위험탐지 시 미사용 Ticket을 폐기해야 한다. | P0/계획 | 폐기 후 교환 거부 | 통합시험 | 신규 |
| VR-TICKET-006 | Ticket과 접근token을 URL, history, 일반 로그에 기록하지 않아야 한다. | P0/부분 구현 | 자동 trace 노출 0건 | 브라우저 trace | FR-021~025 보강 |

### 7.3 정책·접근토큰

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-POLICY-001 | 서버는 역할, 기관, 동의, 목적, 기간, Study, Series, 행위를 모두 평가해야 한다. | P0/구현됨 | 하나라도 실패하면 DENY | 결정표시험 | FR-014~020 |
| VR-POLICY-002 | 조회, 다운로드, PACS 편입 권한을 별도 정책으로 판단해야 한다. | P0/P1 부분 | VIEW_ONLY 다운로드·편입 403 | 음성시험 | FR-014~020 수정 |
| VR-POLICY-003 | 거부는 표준 reasonCode로 감사하고 UI에는 내부값을 숨겨야 한다. | P0/구현됨 | 감사 코드 존재·UI 민감정보 없음 | API/UI | FR-014~020 |
| VR-TOKEN-001 | 접근token은 jti, issuer, audience, 동의, 병원, 사용자, 목적, Study/Series, 권한, auditSessionId, expiry를 가져야 한다. | P0/구현됨 | claims·서명 검증 통과 | 단위시험 | FR-021~025 |
| VR-TOKEN-002 | 접근token TTL은 기본 5분이며 설정 상한을 초과하지 않아야 한다. | P0/구현됨 | 만료 후 active=false | 시간시험 | FR-021~025 |
| VR-TOKEN-003 | Gateway는 매 요청마다 token·동의·scope·행위를 재검증해야 한다. | P0/구현됨 | 철회·변조·scope 위반 거부 | E2E | FR-021~031 |
| VR-TOKEN-004 | token 원문은 저장하지 않고 digest와 상태를 저장해야 한다. | P0/구현됨 | DB에 원문 없음 | DB검토 | FR-021~025 보강 |
| VR-TOKEN-005 | 만료·철회·반복 실패를 감사·이상행위 탐지에 연결해야 한다. | P0/부분 구현 | fixture별 경보 | 보안시험 | FR-037~041 |

### 7.4 DICOMweb·Edge·Viewer

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-DICOM-001 | Study/Series/SOP UID를 구분하고 입력형식을 검증해야 한다. | P0/부분 구현 | 비정상 UID 400, scope 위반 403 | API시험 | FR-006~009,026~031 |
| VR-DICOM-002 | QIDO-RS는 승인 범위의 최소 Study/Series 메타데이터만 반환해야 한다. | P0/구현됨 | 범위 밖 결과 0건 | E2E | FR-006~009,026~031 |
| VR-DICOM-003 | WADO-RS는 승인 Instance/Frame만 필요 시 반환해야 한다. | P0/구현됨 | Study→Series→Instance 순차 요청 | E2E | FR-026~036 |
| VR-DICOM-004 | PACS는 내부 네트워크에 두고 A Edge의 mTLS 요청만 받아야 한다. | P0/구현됨 | 직접 host port 없음·무인증 거부 | network/mTLS | FR-026~031 |
| VR-DICOM-005 | 인증·인가·입력·PACS·timeout 오류를 구분해야 한다. | P0/부분 구현 | 400/401/403/502/504 계약 | 장애시험 | FR-026~031 |
| VR-EDGE-001 | B Viewer 요청은 B Edge와 A Edge를 순서대로 경유해야 한다. | P0/부분 구현 | 브라우저-A PACS 직접 요청 0건 | trace/network | FR-026~031 수정 |
| VR-EDGE-002 | A/B Edge는 기관별 인증서와 최소 서비스권한을 사용해야 한다. | P0/부분 구현 | 무인증·비신뢰·만료 cert 거부 | mTLS시험 | FR-026~031 |
| VR-VIEW-001 | Viewer는 인증·정책 승인 후에만 열려야 한다. | P0/부분 구현 | 무인증 진입 차단 | browser E2E | FR-032~036 |
| VR-VIEW-002 | 직접 URL로 다른 Study/Series를 열 수 없어야 한다. | P0/구현됨 | 다른 UID 403 | 음성시험 | FR-032~036 |
| VR-VIEW-003 | 전체 Study 선다운로드 대신 Series/Instance/Frame 요청을 우선해야 한다. | P0/부분 구현 | network trace 순차 요청 | browser trace | FR-032~036 |
| VR-VIEW-004 | 합성 데이터·PoC·Reference Viewer임을 표시해야 한다. | P0/부분 구현 | 영상화면 배지 확인 | UI검토 | FR-032~036 보강 |
| VR-VIEW-005 | token 만료·동의 철회 후 재접근을 차단하고 재요청 안내를 표시해야 한다. | P0/부분 구현 | 데이터 미표시·안내 | E2E | FR-032~036 |

### 7.5 전송·암호화·선택적 편입

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-TRANSFER-001 | 요청마다 transferId, auditSessionId, A/B, Study/Series, 상태를 생성해야 한다. | P0/계획 | 필수필드·고유성 | API/DB | 신규 |
| VR-TRANSFER-002 | 모든 PACS·Relay·health 요청과 polling은 유한 timeout을 사용해야 한다. | P0/부분 구현 | 무응답 시 결정적 종료 | 장애시험 | FR-026~031 보강 |
| VR-TRANSFER-003 | 재시도 가능 오류만 제한 횟수 backoff로 재시도해야 한다. | P0/계획 | 정책오류 재시도 0건 | 장애주입 | 신규 |
| VR-TRANSFER-004 | 성공·실패 UID를 구분하고 PARTIAL 상태를 지원해야 한다. | P0/계획 | 상태·객체목록 일치 | 장애주입 | 신규 |
| VR-CRYPTO-001 | 전송별 DEK와 AES-256-GCM을 사용하고 파일/청크 nonce를 재사용하지 않아야 한다. | P0/계획 | nonce 중복 0건·tag 변조 거부 | 암호시험 | 신규 |
| VR-CRYPTO-002 | Relay는 암호문만 중계하고 평문·DEK에 접근하지 않아야 한다. | P0/계획 | Relay 평문·키 0건 | 설계/침투시험 | 신규 |
| VR-CRYPTO-003 | KEK와 DEK를 분리하고 keyId·provider를 교체 가능하게 해야 한다. | P0 목표/외부 KMS BLOCKED | Mock 교체·실 KMS fail closed | 통합시험 | 신규 |
| VR-CRYPTO-004 | manifest, hash, AEAD tag 검증 실패 시 표시·편입을 중지해야 한다. | P0/계획 | 변조 fixture 100% 거부 | 변조시험 | 신규 |
| VR-PACS-001 | B PACS 편입은 별도 `PACS_IMPORT` 권한을 요구해야 한다. | P1/계획 | VIEW만으로 저장 0건 | 정책시험 | 신규 |
| VR-PACS-002 | 지원 시 STOW-RS, 승인 시 C-STORE로 선택 객체만 저장해야 한다. | P1/계획 | 승인 UID만 저장 | 통합시험 | 신규 |
| VR-PACS-003 | 객체별 성공·중복·부분·실패 결과를 기록해야 한다. | P1/계획 | 결과와 PACS 응답 일치 | 장애시험 | 신규 |
| VR-PACS-004 | 기편입 사본은 B 병원 보존정책 대상임을 고지해야 한다. | P1/계획 | 동의/UI·감사에 경계 표시 | 검토 | 신규 |

### 7.6 감사·보존·오류

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-AUDIT-001 | 로그인·동의·Ticket·정책·QIDO/WADO·다운로드·편입·철회·만료·실패를 기록해야 한다. | P0/부분 구현 | 정의 이벤트별 로그 | 통합시험 | FR-037~041 |
| VR-AUDIT-002 | actor, hospital, patientRef, consent, UID, action, result, reasonCode, timestamp, token/transfer/correlation을 기록해야 한다. | P0/부분 구현 | 필수필드 누락 0% | 스키마시험 | FR-037~041 |
| VR-AUDIT-003 | 일반 API로 감사로그 수정·삭제를 허용하지 않아야 한다. | P0/구현됨 | PUT/PATCH/DELETE 405 | API시험 | FR-037~041 |
| VR-AUDIT-004 | Hash Chain을 검증하고 불일치를 경보해야 한다. | P0/구현됨 | 변조 fixture 탐지 | 단위시험 | FR-037~041 |
| VR-AUDIT-005 | 감사조회는 승인 역할·기관·기간 범위로 제한해야 한다. | P0/구현됨 | 무권한 401/403 | API시험 | FR-037~041 |
| VR-AUDIT-006 | 중요 행위의 감사기록 실패 시 행위를 중단하거나 승인된 내구성 큐를 사용해야 한다. | P0/계획 | 기록 없는 중요 ALLOW 0건 | 장애시험 | 신규 |
| VR-RET-001 | DICOM 임시자료, 메타데이터, 동의, 감사의 보존기간을 분리해야 한다. | P0/부분 구현 | 종류별 정책 존재 | 정책검토 | FR-037~046 |
| VR-RET-002 | 임시 캐시는 TTL 후 자동삭제하고 삭제증적을 남겨야 한다. | P0/계획 | TTL+허용오차 내 삭제 | 시간시험 | 신규 |
| VR-ERROR-001 | 실패 응답에 stack, 인증서 경로, token, key, 직접식별정보를 노출하지 않아야 한다. | P0/부분 구현 | 민감패턴 0건 | 로그/UI검사 | 전체 |
| VR-ERROR-002 | 장애 시 정책·Gateway·PACS 경계를 우회하지 않아야 한다. | P0/구현됨 | 우회 경로 0건 | network시험 | FR-014~031 |
| VR-ERROR-003 | 반복거부·만료token·대량조회·타기관 시도를 탐지해야 한다. | P0/구현됨 | fixture별 경보 | 단위시험 | FR-037~041 |

### 7.7 연구·가명처리 확장

| ID | 요구사항 | 우선순위/상태 | 수용기준 | 검증 | 기존 연결 |
|---|---|---|---|---|---|
| VR-RESEARCH-001 | 연구 반출은 진료·전원 흐름과 다른 저장영역·역할·승인을 사용해야 한다. | P1/부분 구현 | 진료 token으로 반출 불가 | 정책시험 | FR-042~046 |
| VR-RESEARCH-002 | DICOM header·UID·텍스트·고위험 영상의 비식별 위험을 별도 평가해야 한다. | P1/부분 구현 | high-risk는 human review | 단위/전문가검토 | FR-042~046 |
| VR-RESEARCH-003 | 실제 비식별 적정성·IRB·연구윤리 승인을 완료로 기록하지 않아야 한다. | P1/문서화 | 상태가 계획/검증 필요 | 문서검토 | FR-042~046 |

## 8. 비기능 요구사항

| ID | 영역 | 요구사항·측정기준 | 상태 | 검증 |
|---|---|---|---|---|
| VNFR-SEC-001 | 보안 | 중요 정책은 서버·Gateway에서 재검증하고 조건 누락 시 거부한다. | 구현됨 | 음성시험 |
| VNFR-SEC-002 | 통신 | 외부 API는 TLS 1.3 우선, Gateway/PACS는 mTLS를 사용한다. | 부분 구현 | protocol/mTLS |
| VNFR-PRI-001 | 개인정보 | 합성 데이터만 사용하고 QR·URL·로그에 직접식별정보를 넣지 않는다. | 부분 구현 | PII/secret scan |
| VNFR-CIA-001 | 기밀성 | DICOM 중계·캐시는 AEAD 암호문이며 Relay는 평문을 보지 않는다. | 계획 | 암호/침투시험 |
| VNFR-CIA-002 | 무결성 | 객체·manifest·감사 변조를 탐지하고 사용을 중지한다. | 부분 구현 | 변조시험 |
| VNFR-AVL-001 | 가용성 | 모든 외부 호출은 유한 timeout을 사용한다. 응답·복구 목표는 `[결정 필요]`다. | 부분 구현 | 장애시험 |
| VNFR-PERF-001 | 성능 | QIDO, 첫 WADO Frame, 대용량 Study 지표를 수집한다. 합격 수치는 `[결정 필요]`다. | 계획 | 부하시험 |
| VNFR-INT-001 | 상호운용 | QIDO/WADO/STOW는 DICOM PS3.18 계약과 호환해야 한다. | 부분 구현 | 계약검토 |
| VNFR-AUD-001 | 추적성 | 하나의 흐름을 auditSessionId/transferId/tokenId로 종단 추적한다. | 부분 구현 | E2E로그 |
| VNFR-OPS-001 | 운영성 | 상위 검증 명령은 timeout, 단계별 결과, 종료코드, cleanup을 제공한다. | 구현됨 | `mvp:verify` |
| VNFR-USA-001 | 사용성 | 허용·거부·만료·철회를 텍스트·아이콘·색상으로 구분한다. | 부분 구현 | UI/접근성 |
| VNFR-TST-001 | 시험성 | 모든 P0 요구사항은 정상·음성 test ID와 증적 위치를 가져야 한다. | 부분 구현 | 추적성 감사 |

## 9. 데이터·상태 요구사항

### 9.1 데이터 소유·보존

| 데이터 | 저장 위치 | 원칙 | 상태 |
|---|---|---|---|
| 원본 DICOM | A PACS | A 병원 유지, 중앙 지속저장 금지 | 구현 구조 확인 |
| 최소 메타데이터 | Control DB | 합성 식별자·필요 필드만 | 구현됨 |
| 동의·scope | Control DB | 이력·철회·기간 | 구현됨 |
| QR Ticket | Ticket Store | digest·상태·TTL, 원문 최소노출 | 계획 |
| 접근token log | Control DB | 원문 대신 digest | 구현됨 |
| 전송작업 | Transfer Store | 상태·객체별 결과·재시도 | 계획 |
| Relay cache | Data Plane | 암호문·TTL·삭제증적 | 계획 |
| 감사로그 | Audit Store | append-only·Hash Chain | 구현됨/운영 WORM BLOCKED |
| B PACS 사본 | B PACS | B 병원 보존·책임정책 | P1 계획 |

### 9.2 목표 상태

- 동의: `DRAFT → CONSENT_PENDING → APPROVED | REJECTED | EXPIRED | REVOKED`
- Ticket: `ISSUED → CONSUMED | EXPIRED | REVOKED`
- 전송: `CREATED → AUTHORIZED → READY → IN_PROGRESS → PARTIAL | COMPLETED | FAILED → EXPIRED | REVOKED | DELETED`

현재 코드는 동의 `ACTIVE/REVOKED/EXPIRED`, 접근token `ACTIVE/REVOKED/EXPIRED/INVALID`만 지원한다. 승인대기·거부·Ticket·전송 상태기계는 계획이며 API 호환성과 DB migration 결정이 필요하다.

## 10. 인터페이스 요구사항

| IF | 호출 경로 | 인증·권한 | 주요 데이터 | 상태 |
|---|---|---|---|---|
| VIF-01 | Browser↔IdP↔Control | OIDC/MFA, iss/aud/exp | 최소 claims | Mock 부분/실 IdP BLOCKED |
| VIF-02 | UI↔Control API | OIDC, RBAC+ABAC | 동의·Ticket·정책·상태 | 부분 구현 |
| VIF-03 | Viewer→B Edge→A Edge | bearer scope+mTLS | QIDO/WADO | 논리 분리 부분 구현 |
| VIF-04 | A Edge→A PACS | mTLS | 승인 QIDO/WADO | 구현됨 |
| VIF-05 | A/B Edge↔Relay | mTLS+AEAD | 암호문·manifest | 계획 |
| VIF-06 | B Edge→B PACS | PACS_IMPORT+mTLS/AE | STOW/C-STORE | P1 계획 |
| VIF-07 | 서비스→Audit | service token | append-only event | 구현됨 |
| VIF-08 | Edge/Control→KMS | workload identity | generate/wrap/unwrap/keyId | Mock/외부 BLOCKED |

## 11. 오류·악용 수용 시나리오

| Test ID | 시나리오 | 기대 결과 | 연결 요구사항 |
|---|---|---|---|
| VAT-CONS-001 | 환자 동의 승인/거부/철회 | 상태 전이, 거부·철회 후 token 없음 | VR-CONS |
| VSEC-TICKET-001 | QR 만료·재사용·복제·타기관 | 교환 거부·반복 경보 | VR-TICKET |
| VSEC-AUTH-001 | 의료진 인증/MFA 실패 | 자원·Ticket 상세 미제공 | VR-AUTH |
| VSEC-SCOPE-001 | 다른 환자·Study·Series | 403·reasonCode·감사 | VR-POLICY |
| VAT-QIDO-001 | 승인 QIDO 검색 | 허용 메타데이터만 반환 | VR-DICOM-002 |
| VAT-WADO-001 | 승인 WADO 조회 | 허용 객체만 표시 | VR-DICOM-003, VR-VIEW |
| VSEC-DL-001 | VIEW_ONLY 다운로드 | 403·거부 감사 | VR-POLICY-002 |
| VAT-PACS-001 | 선택적 편입 | 별도 권한·객체별 결과 | VR-PACS |
| VSEC-MTLS-001 | 무인증·비신뢰·만료 인증서 | handshake 거부 | VR-EDGE-002 |
| VOPS-PACS-001 | A PACS/Relay/B Edge 장애 | timeout·우회 금지·상태 기록 | VR-TRANSFER, VR-ERROR |
| VSEC-INT-001 | hash/tag 변조 | 표시·편입 중지 | VR-CRYPTO-004 |
| VAUD-001 | 감사 생성·변조·무권한 변경 | 생성·변조탐지·405 | VR-AUDIT |
| VRET-001 | 임시 캐시 TTL | 자동삭제·삭제증적 | VR-RET-002 |

## 12. 통합 추적성 매트릭스

| 목표 | 기존 FR | 신규 요구사항 | 유스케이스 | 설계요소 | 시험 |
|---|---|---|---|---|---|
| 환자 동의 | FR-001~005 | VR-CONS, VR-TICKET | UC-03~05,13~15 | Consent/Ticket | VAT-CONS, VSEC-TICKET |
| 영상 메타데이터 | FR-006~009 | VR-DICOM-001~002 | UC-09 | A Edge/QIDO | VAT-QIDO |
| 의료진 접근 | FR-010~013 | VR-AUTH, VR-VIEW | UC-01,06,10 | IdP/Viewer | VSEC-AUTH, VAT-WADO |
| 정책 검증 | FR-014~020 | VR-POLICY | UC-08,20 | Policy Engine | VSEC-SCOPE/DL |
| 단기token | FR-021~025 | VR-TOKEN | UC-08,13~15 | Token Service | token unit/E2E |
| Gateway | FR-026~031 | VR-DICOM, VR-EDGE | UC-09~10,19 | A/B Edge/PACS | VSEC-MTLS, VOPS-PACS |
| Viewer | FR-032~036 | VR-VIEW | UC-10 | OHIF | VAT-WADO/browser trace |
| 감사·탐지 | FR-037~041 | VR-AUDIT, VR-ERROR-003 | UC-18,20 | Audit/Monitoring | VAUD-001 |
| 연구·가명 | FR-042~046 | VR-RESEARCH | P1 별도 | Research boundary | 별도 시험 |
| 암호문 중계 | 신규 | VR-TRANSFER, VR-CRYPTO | UC-16~17 | Relay/KMS | VSEC-INT/VRET |
| 선택적 편입 | 신규 | VR-PACS | UC-11 | B Edge/B PACS | VAT-PACS |

## 13. 기존 문서 변경 영향

| 항목 | 처리 | v2.1 기준 | 사유 |
|---|---|---|---|
| 기존 FR-001~046 | 보존 | 상위 추적키로 유지 | 개별 원문 부재·이력 보호 |
| 기존 v2 카테고리 ID | 대체·매핑 | `VR-*` 기준선 사용 | 신규 문서의 고유 ID 체계 |
| 수신 병원 선저장 | 수정 | 원격조회 우선·편입 P1 | 최소복제·권한분리 |
| 환자 모바일 영상저장 | P1 이동 | P0는 동의·QR | 위협·범위 축소 |
| 브라우저-PACS 직접연결 | 삭제 | A/B Edge 경유만 | Zero Trust 경계 |
| 전 구간 PQC | P1 이동 | Crypto Agility·선택 실험 | 현재 구현·상호운용성 한계 |
| 실제 IdP/KMS/PACS | 미구현·BLOCKED | 외부환경 제공 후 검증 | 증적 없음 |

## 14. 컴플라이언스·표준 경계

- 개인정보보호·의료법 적용성은 실제 사업자 역할·처리근거·배포구조 확정 후 법무·개인정보보호책임자가 검토한다.
- PIPA 적합성, ISMS-P 인증, 병원 보안 승인은 `DEFERRED`이며 로컬 시험 PASS로 대체하지 않는다.
- DICOM PS3.18을 QIDO/WADO/STOW 인터페이스 기준으로 사용한다.
- OIDC Core, OAuth 2.0, TLS 1.3을 인증·권한·전송보호 설계 기준으로 사용한다.
- ML-KEM/ML-DSA는 P1 검토이며 현재 전체 적용 상태로 기록하지 않는다.

## 15. P0 완료 기준

1. VR-AUTH의 로컬 인증경계와 production Mock 차단을 시험한다.
2. VR-CONS·VR-TICKET의 승인·TTL·원자 소비·재사용 음성시험을 통과한다.
3. VR-POLICY·VR-TOKEN의 기관·목적·scope·행위 정상/음성시험을 통과한다.
4. QIDO/WADO 전체 흐름과 브라우저 token 비노출을 검증한다.
5. 무인증·비신뢰·만료 mTLS와 PACS 직접접근을 거부한다.
6. 전송상태·timeout·재시도·무결성 실패가 결정적으로 종료된다.
7. 감사 이벤트·Hash Chain·이상행위와 임시자료 삭제증적을 검증한다.
8. 실행하지 못한 시험은 PASS가 아니라 NOT VERIFIED 또는 ENVIRONMENT BLOCKED로 기록한다.

## 16. 미결정사항

| ID | 결정사항 | 필요한 입력 |
|---|---|---|
| VDEC-01 | 환자 본인·보호자 확인과 대리동의 | 법무·병원·UX |
| VDEC-02 | Ticket TTL, clock skew, 재발급·idempotency | 보안·제품 |
| VDEC-03 | B 선요청 시 A 의료진 승인 | 의료업무 담당 |
| VDEC-04 | VIEW/DOWNLOAD/PACS_IMPORT 동의문·역할 | 법무·병원 |
| VDEC-05 | STOW 우선·C-STORE fallback | PACS 담당 |
| VDEC-06 | Relay 키 종단·평문 메모리 금지 범위 | 보안 아키텍트 |
| VDEC-07 | cache TTL·삭제 허용오차·증거보존 | 개인정보·운영 |
| VDEC-08 | 감사 실패 시 동기차단/내구성 큐 | 보안·SRE |
| VDEC-09 | 성능 SLO·timeout·재시도 | PM·SRE |
| VDEC-10 | B PACS 사본 보존·철회·삭제 책임 | 법무·B 병원 |
| VDEC-11 | 기존 FR-001~046 개별 원문 확보·승인 | 문서 소유자 |

## 17. 다음 단계

1. 기존 FR-001~046 원문을 확보해 각 항목의 유지·수정·삭제를 개별 승인한다.
2. 본 문서의 `VR-*` ID를 기준선으로 승인하고 UC-01~20과 양방향 링크한다.
3. **동의·권한·QR Transfer Ticket·API·데이터 상태 정책 및 인터페이스 명세서**를 작성한다.
4. Ticket 상태·원자 소비, 전송 상태기계, API 오류계약, Relay 키 종단을 LLD로 구체화한다.
5. 시험 ID를 코드 테스트명과 증적 manifest에 포함한다.

## 18. 문서 품질 자체점검

| 점검 | 결과 |
|---|---|
| 기존 FR-001~046 기능군 연결 | PASS |
| 원문 부재를 추정으로 보완하지 않음 | PASS |
| A 병원 원본 유지·중앙 지속저장 금지 | PASS |
| QR PII/DICOM/키 금지 | PASS |
| 환자 동의+B 의료진 인증 결합 | PASS |
| 조회·다운로드·편입 권한 분리 | PASS |
| QIDO/WADO/STOW 역할 분리 | PASS |
| 구현·부분·계획·BLOCKED·검증 필요 구분 | PASS |
| 요구사항별 우선순위·수용기준·검증·기존 연결 | PASS |
| 실제 외부환경·법률·인증 상태 과장 없음 | PASS |

---

**최종 기준선:** 기존 `FR-001~FR-046`은 이력·기능군 추적키로 보존하고, 신규 구현·시험·설계는 승인된 `VR-*` 요구사항을 기준으로 수행한다.
