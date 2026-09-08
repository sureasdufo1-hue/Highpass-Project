# 하이패스 하이브리드 QR·원격조회 구조변경 반영 착수계획서

| 문서 항목 | 내용 |
|---|---|
| 프로젝트명 | 하이패스(HiPass) Platform |
| 문서명 | 하이브리드 QR·원격조회 구조변경 반영 착수계획서 |
| 버전 | v1.0-BASELINE |
| 기준일 | 2026-09-01 |
| 일정 기준 | D+1주~D+8주, 2026년 10월 말 발표 가정 |
| 작성 | 프로젝트 착수계획 작성위원회 |
| 검토·승인 | PM / 지도교수 / 의료정보·보안 검토자 — TBD |
| 저장소 기준 | `fb1e1a1` 및 2026-09-01 현재 미커밋 작업트리 |
| 문서 상태 | 구조변경 기준선 제안 — 승인 전 |

> **본 계획서는 가상 A·B 병원과 합성 의료정보를 이용한 캡스톤 PoC의 착수·설계·검증 계획이며, 실제 의료기관 운영 승인이나 법적 적합성 인증을 의미하지 않는다.**

## 1. 경영진 요약

하이패스는 환자 동의와 기관·사용자·Study 단위 권한통제를 기반으로 A 병원 PACS의 CT·MRI 영상을 B 병원에 안전하게 중계하고, DICOMweb 기반 On-demand Remote Viewing과 선택적 PACS 편입을 제공하는 클라우드 관리형 하이브리드 B2B SaaS로 재정의한다.

QR은 영상 저장매체나 사용자 인증수단이 아니다. QR에는 직접 식별정보나 DICOM 원본을 넣지 않고, 환자 동의 및 전송요청을 참조하는 짧은 수명의 일회용 opaque Transfer Ticket만 전달한다. B 병원 의료진은 별도의 OIDC/OAuth 인증을 거쳐야 하며, 플랫폼은 기관·의료진·환자·목적·Study/Series·기간·권한을 서버에서 다시 검증한다.

원본 DICOM Pixel Data는 A 병원 PACS/Orthanc에 유지한다. Control Plane은 동의, 정책, 최소 메타데이터, 전송상태와 감사를 관리하고, Data Plane은 승인 범위의 영상만 암호화 중계한다. 중앙 영구 저장은 기본 설계에서 제외한다. 성능이나 재시도 때문에 임시 버퍼·캐시가 필요하면 목적, 암호화, 보유시간, 삭제 및 삭제증적을 별도 정책으로 승인해야 한다.

현재 저장소에는 동의, RBAC/ABAC, Study/Series 제한, 단기 DICOMweb 토큰, QIDO-RS/WADO-RS Gateway, Orthanc, OHIF 정적 Viewer, mTLS 프록시, PostgreSQL, 감사로그 hash chain과 음성 테스트 기반이 확인된다. 반면 QR 일회용 티켓, 선택적 B 병원 PACS 편입, 전송 객체·청크 AEAD, 실제 IdP/KMS/PACS와 외부 Staging은 계획 또는 BLOCKED 상태다.

## 2. 문서 개정이력과 기존 문서 관계

| 버전 | 일자 | 개정 사유 | 기존 문서와의 관계 |
|---|---|---|---|
| v1.0-BASELINE | 2026-09-01 | 저장·전송 중심 설명을 A 병원 원본 유지, QR 권한전달, 원격조회, 선택적 편입 구조로 변경 | 기존 README·MVP Scope·Architecture·보안 문서는 구현 현황 증거로 보존하며 본 문서 승인 후 요구사항·HLD·LLD를 순차 개정 |

본 문서는 기존 문서나 미커밋 변경을 삭제하지 않는다. 상충하는 기존 설명은 이후 변경대비표와 추적성 매트릭스에서 폐기·재사용·변경 대상으로 분류한다.

## 3. 조사 범위와 사실 분류

### 3.1 조사 결과

| 조사 항목 | 확인 결과 | 분류 |
|---|---|---|
| 저장소 | 최근 커밋 `fb1e1a1`(2026-08-23), 다수의 컴플라이언스·인증서·E2E 미커밋 변경 존재 | 확인됨 |
| 실행 구성 | Node.js Control API, PostgreSQL, Orthanc, OHIF 정적 Viewer, Edge HTTPS, Orthanc mTLS proxy로 구성된 Docker Compose | 확인됨 |
| 접근정책 | 동의 상태·기간·기관·의료진·목적·Study·Series·권한을 서버에서 검증 | 확인됨 |
| 토큰 | 기본 5분 단기 서명 토큰, issuer/audience/scope/만료/동의상태 검증 및 digest 저장 | 확인됨 |
| DICOMweb | QIDO-RS 검색과 WADO-RS 조회 경로 존재 | 확인됨 |
| PACS 편입 | DB에 `supports_stow` 필드는 있으나 STOW-RS/C-STORE E2E 구현·증적은 확인되지 않음 | 계획 |
| QR | QR·일회용 Transfer Ticket 데이터 모델/API/테스트는 확인되지 않음 | 계획 |
| 감사 | append-only 성격의 API, previous hash/record hash, 무결성 조회 및 이상행위 탐지 | 확인됨 |
| 외부 자원 | 실제 IdP, KMS/HSM, 병원 PACS, 외부 Staging, WORM/SIEM, DR 미제공 | BLOCKED |
| 운영·법적 상태 | 로컬 PoC 문서와 매핑은 존재하나 병원 승인·법률 의견·ISMS-P 인증은 없음 | 미확인/제약 |

### 3.2 상태 정의

| 상태 | 의미 |
|---|---|
| 확인됨 | 저장소 코드·설정·증적에서 현재 존재가 확인된 사실 |
| 계획 | 구조변경 후 구현·시험·승인이 필요한 항목 |
| 미확인/제약 | 외부 기관·계약·운영환경 없이는 확인할 수 없는 항목 |
| BLOCKED | 외부 자원, 관리자 권한, 계약 또는 기관 결정이 없으면 착수할 수 없는 항목 |

## 4. 사업·프로젝트 개요

### 4.1 문제정의

기존 CD·USB 기반 의료영상 교류는 발급, 환자 운반, 수신 병원 등록과 조회가 분리되어 있어 지연·분실·중복검사 가능성이 있고 접근 이력 및 동의 범위를 일관되게 추적하기 어렵다. 하이패스는 원본의 병원 내 보관 원칙을 유지하면서 승인 범위만 기관 간 조회·전송하도록 통제한다.

### 4.2 대상 사용자와 이해관계자

- 환자·보호자: 동의 확인, QR 보관·제시, 전송 승인 및 철회
- A 병원 담당자·의료진: 대상 환자와 Study 확인, 전송요청 발급
- B 병원 의료진: 인증 후 원격조회, 별도 승인 시 PACS 편입 요청
- 병원 관리자·보안담당자: 기관 연결, 인증서, 정책, 감사 및 사고대응
- 플랫폼 운영자: Control Plane, Relay, 상태·감사·모니터링 운영
- 개인정보보호·법무·의료정보 담당자: 처리근거, 책임경계, 보유·파기 검토
- 캡스톤 평가자: 합성 데이터 기반 재현성과 증적 평가

### 4.3 MVP 목적과 비목표

MVP 목적은 합성 CT·MRI와 가상 A/B 병원으로 동의→일회용 티켓→B 의료진 인증→정책검증→QIDO/WADO 원격조회→선택적 편입→감사를 재현하는 것이다. 실제 환자정보, 실제 병원망·PACS, 임상판단, 운영 승인, 법적 인증, AI 진단, 생영상 실시간 스트리밍은 해결 대상이 아니다.

## 5. 구조 변경 전후 비교

| 항목 | 기존 중심 설명 | 변경 기준선 |
|---|---|---|
| 데이터 보관 | 전송·저장 후 수신 병원 조회로 오해 가능 | 원본은 A 병원 PACS 유지, 중앙 DICOM Pixel Data 영구 저장 금지 |
| 영상 이동 | Study 전송 중심 | QIDO/WADO On-demand Retrieval 우선, 저장은 별도 승인 |
| QR 역할 | 명시적 기준 없음 | 동의·전송권한을 참조하는 1회용 opaque ticket 전달 |
| 환자 휴대폰 | 영상 운반매체로 오해 가능 | QR 보관, 본인확인, 동의·승인; DICOM 장기 저장 제외 |
| 클라우드 | API와 영상 경유 경계가 모호 | Control Plane과 암호문 Data Plane/Relay 분리 |
| B 병원 PACS | 조회와 저장 구분 미흡 | 조회권한과 STOW/C-STORE 편입권한 별도 정책 |
| 브라우저 경로 | Gateway 기반이나 기준선 명시 필요 | 브라우저는 타 병원 PACS에 직접 연결하지 않음 |
| 보안 경계 | 동의·토큰·mTLS 중심 | QR 재사용 방지, Edge-to-Edge, 임시캐시, 키·권한 분리 추가 |
| 장애 fallback | 오류 처리 중심 | 원격조회 불가 시 승인된 선택적 Study 전송 검토; fail closed |
| 책임 | 기술 통제 중심 | A/B 병원·플랫폼·클라우드 책임모델은 후보안으로 두고 법률 검토 |

## 6. 목표 아키텍처와 시스템 경계

```text
환자 휴대폰(QR·동의 승인)
          |
          v
B 병원 사용자 -- OIDC/OAuth+MFA(계획) --> Cloud Control Plane
          |                                  | 동의·정책·티켓·감사
          |                                  v
          +--> B Viewer/Connector <-- 단기권한/암호문 Relay --> A Edge Connector
                                                            | mTLS
                                                            v
                                                     A PACS/Orthanc
          |
          +-- 별도 저장승인 --> B Connector -- STOW-RS/C-STORE --> B PACS
```

| 구성요소 | 보유 | 처리 | 전송 | 현재 상태 |
|---|---|---|---|---|
| A PACS/Orthanc | 원본 DICOM | Study/Series/Instance 검색·조회 | 승인 객체 | Orthanc 시뮬레이션 확인됨 |
| A Edge Connector | 인증서·최소 연결설정 | 정책 결과에 따른 PACS 요청, 패키징 | DICOMweb/암호문 | mTLS proxy 기반 재설계 계획 |
| Control Plane | 동의, 기관·사용자, 최소 메타데이터, 상태, 감사 | ABAC, ticket·token 발급·폐기 | 정책·제어 메시지 | 상당 부분 확인됨 |
| Data Plane/Relay | 기본 무영구저장; 필요 시 암호화 임시캐시 | 암호문 중계, 재시도, 무결성 | 객체·청크 | 계획 |
| B Viewer/Connector | 세션·단기권한 | QIDO/WADO 표시, 선택적 편입 요청 | 조회·저장요청 | Viewer 확인, Connector 편입 계획 |
| B PACS | 승인 편입 사본 | 중복·무결성·수신 처리 | 내부 조회 | 외부 자원 BLOCKED |
| 환자 휴대폰 | QR/Deep Link, 최소 상태 | 동의확인·본인확인·승인 | opaque ticket | 계획 |
| IdP/KMS/SIEM | 신원·키·보안이벤트 | 인증·키수명주기·탐지 | 표준 API | 실제 자원 BLOCKED |

### 6.1 아키텍처 불변조건

1. 원본 DICOM은 A 병원 PACS에 유지한다.
2. 브라우저가 A 병원 PACS/Orthanc에 직접 접근하지 않는다.
3. QR에 환자명·환자번호·주민등록번호·병명·DICOM·장기 토큰을 넣지 않는다.
4. 조회권한과 B 병원 PACS 저장권한을 분리한다.
5. Control Plane은 DICOM Pixel Data 영구 저장소가 아니다.
6. 임시 캐시·버퍼·재개파일·백업이 존재하면 암호화·TTL·삭제증적을 갖춘다.
7. 모든 중요 권한검증은 서버와 Gateway에서 fail closed로 수행한다.

## 7. 주요 업무 시나리오와 사용자 여정

| 시나리오 | 행위자 → 입력 | 검증 | 처리 | 결과 | 감사증적 |
|---|---|---|---|---|---|
| A 병원 전송요청 | A 담당자 → 환자, B 병원, 목적, Study/Series | 담당자 소속·권한, 환자/Study 매핑 | 전송요청 초안 생성 | 승인 대기 | 요청자·기관·범위·목적 |
| 동의·QR 발급 | 환자/보호자 → 동의, 기간, 권한 | 본인/대리인 확인, 필수고지, 범위 | nonce/jti가 있는 1회용 opaque ticket 발급 | QR/Deep Link | 발급·표시·만료시각 |
| B 의료진 인증 | B 의료진 → OIDC 로그인 | issuer, audience, MFA, 소속·역할 | 인증 세션 생성 | 사용자 식별 | 성공·실패·claim 최소값 |
| QR 원격조회 | B 의료진 → ticket | 1회성, TTL, A/B 기관, 환자, 목적, Study, 동의 | 단기 조회권한 후 QIDO/WADO | Progressive Loading Viewer | 스캔·검증·조회·거부 |
| 선택적 PACS 편입 | B 의료진 → 저장 요청 | DOWNLOAD/IMPORT 권한, 중복, 수신정책 | STOW-RS 우선 검토, 필요 시 C-STORE | 승인 객체만 편입 | 요청·승인·수신·해시 |
| 만료·철회·재사용 | 사용자/시스템 → 이전 ticket | 상태·사용횟수·동의 | ticket/token 폐기 | 미래 접근 DENY | reason code와 jti |
| 장애·부분실패 | Gateway/Relay → timeout·부분 수신 | 재시도 가능성, idempotency, 무결성 | 제한 재시도 또는 중단·정리 | 일관된 실패상태 | 단계·바이트·오류·정리 |
| 사후 추적 | 보안담당자 → trace/audit ID | 관리자 권한·목적 | hash chain 검증·조회 | 전체 행위 재구성 | 조회행위 자체 감사 |

편입된 B 병원 사본은 동의 철회만으로 기술적으로 자동 회수되지 않을 수 있다. 이후 이용의 법적·운영적 처리, 보존·파기 책임은 병원 정책과 법률 검토로 확정한다.

## 8. 추진 목표와 성공기준

### 8.1 정성 목표

- 환자 동의와 진료 목적을 의료진 인증 및 Study 범위와 결합한다.
- 원격조회와 선택적 저장을 분리해 최소전송·최소권한을 구현한다.
- Control Plane/Data Plane 및 A/B 병원 신뢰경계를 명확히 한다.
- 정상·음성·장애 흐름을 재현 가능한 시험과 감사증적으로 연결한다.

### 8.2 검증 목표

| 목표 | 성공기준 | 현 상태 |
|---|---|---|
| 승인 Study만 조회 | 범위 밖 Study/Series 요청이 DENY되고 reason code 기록 | 기존 토큰·정책 테스트 재사용 가능 |
| QR 1회성·TTL·기관 바인딩 | 사용완료·만료·복제·타 기관 시험 모두 DENY | 계획 |
| 의료진 인증 결합 | B 의료진 미인증/타 기관 claim DENY | 합성 OIDC 확인, 실제 IdP BLOCKED |
| QIDO/WADO 원격조회 | 합성 CT·MRI 검색과 필요한 Instance/Frame 조회 재현 | QIDO/WADO 기반 존재, CT·MRI 시나리오 보강 계획 |
| PACS 편입 분리 | 조회만 허용된 사용자의 STOW/C-STORE가 DENY | 계획 |
| 중앙 영구저장 방지 | Relay 종료 후 Pixel Data 잔존 없음 또는 승인 TTL 내 삭제증적 | 계획 |
| 전송 무결성 | manifest, 객체/청크 hash, AEAD tag 불일치 DENY | 계획 |
| 감사 추적 | actor·기관·환자 가명ID·Study·목적·결과·trace/jti 연결 | 기존 감사 기반 재사용 가능 |
| 안전한 장애 | timeout·PACS/Gateway 실패·철회 시 fail closed, 부분파일 정리 | 계획 |
| 성능 | Study 크기·Instance 수·multi-frame별 측정표 생성 | 목표 수치는 측정계획 수립 필요 |

## 9. 상위 요구사항

| ID | 시험 가능한 요구사항 | 우선순위 | 근거 | 검증방법 | 담당 산출물 | 상태 |
|---|---|---|---|---|---|---|
| FR-ID-001 | 시스템은 환자 대체식별자, A/B 기관, B 의료진과 소속을 구분한다. | P0/MVP | 사용자 여정 | API·DB·음성시험 | 요구사항/데이터명세 | 확인됨+보강 |
| FR-CONSENT-001 | 동의는 목적, A/B 기관, Study/Series, 권한, 유효기간과 상태를 포함한다. | P0/MVP | 최소권한 | API·DB·로그 | 동의정책명세 | 확인됨 |
| FR-CONSENT-002 | 철회 후 신규 ticket/token과 미래 조회를 차단한다. | P0/MVP | 철회 흐름 | 철회 E2E | 시험계획 | 확인됨+QR 보강 |
| FR-QR-001 | QR은 직접 식별정보 없이 보안설계에서 승인한 충분한 엔트로피의 추측 불가능한 opaque ticket 참조만 전달한다. | P0/MVP | QR 위협 | QR decode·entropy·secret scan | QR 명세 | 계획 |
| FR-QR-002 | ticket은 1회 사용, 짧은 TTL, jti/nonce, A/B 기관·환자·목적·Study 범위에 바인딩된다. | P0/MVP | 재사용 방지 | 만료·복제·기관 불일치 시험 | QR/API/DB | 계획 |
| FR-QR-003 | QR 스캔만으로 인증하지 않고 B 의료진 OIDC 세션과 결합한다. | P0/MVP | OAuth BCP | 미인증·세션교체 시험 | 인증설계 | 계획 |
| FR-POLICY-001 | RBAC와 ABAC가 기관·의료진·동의·목적·Study/Series·권한을 모두 검증한다. | P0/MVP | Zero Trust | 정책 unit/E2E | 정책명세 | 확인됨 |
| FR-VIEW-001 | Viewer는 QIDO-RS 검색과 WADO-RS On-demand Retrieval을 Gateway 경유로 수행한다. | P0/MVP | DICOM PS3.18 | HTTP·브라우저 증적 | DICOMweb 명세 | 확인됨+보강 |
| FR-VIEW-002 | 브라우저는 A PACS/Orthanc의 주소·자격증명·mTLS 키에 직접 접근할 수 없다. | P0/MVP | 신뢰경계 | 네트워크 음성시험 | HLD/네트워크설계 | 확인됨 |
| FR-IMPORT-001 | PACS 편입은 조회와 별도 권한으로 평가하며 승인 객체만 STOW-RS 또는 C-STORE로 전송한다. | P0/MVP | 흐름 C | 허용·거부 E2E | 편입명세 | 계획 |
| FR-IMPORT-002 | 편입은 중복, 부분수신, 객체 hash 및 수신결과를 검증한다. | P0/MVP | 무결성 | 실패주입 시험 | 시험계획 | 계획 |
| FR-SEC-001 | 병원 Gateway 간 통신은 TLS 1.3과 mTLS를 목표 기준으로 하고 인증서 만료·폐기 시 차단한다. | P0/MVP | RFC 8446/정책 | handshake·음성시험 | PKI 설계 | mTLS 확인, TLS1.3 보강 |
| FR-SEC-002 | 전송 패키지는 객체/청크별 DEK와 AES-256-GCM AEAD 적용을 설계하고 nonce 재사용을 금지한다. | P0/MVP | NIST SP 800-38D/정책 | test vector·변조시험 | 암호설계 | 계획 |
| FR-SEC-003 | KEK/DEK와 키 접근권한을 분리하고 KMS 장애 시 신규 암복호화를 fail closed 처리한다. | P1/운영전환 | 키관리 | Mock·장애시험 | 키관리계획 | Mock 계획, 실제 KMS BLOCKED |
| FR-AUDIT-001 | 발급·스캔·검증·조회·편입·거부·철회·삭제를 trace ID와 jti로 연결한다. | P0/MVP | 책임추적 | 감사조회·hash chain | 감사명세 | 기반 확인, QR 보강 |
| FR-FAIL-001 | PACS/Gateway/Relay 장애와 부분실패를 상태기계로 기록하고 무제한 재시도를 하지 않는다. | P0/MVP | 안전실패 | fault injection | 장애설계 | 계획 |
| NFR-PERF-001 | Study 크기, Instance 수, multi-frame, 동시조회별 응답·처리량·메모리를 측정한다. | P0/MVP | 발표 검증 | 부하시험 | 성능계획 | 계획; 목표값 미정 |
| NFR-AVAIL-001 | 구성요소 장애 시 조회·편입을 fail closed하고 복구 후 idempotent 재시도를 제공한다. | P0/MVP | 장애 흐름 | 중단·복구 시험 | HLD/시험 | 계획 |
| NFR-INTEROP-001 | QIDO/WADO/STOW 응답과 DICOM UID·media type을 PS3.18 기준으로 검증한다. | P0/MVP | DICOM | conformance test | 매핑명세 | 일부 확인 |
| NFR-PRIV-001 | Control Plane 데이터와 로그를 최소화하고 임시 Pixel Data의 TTL·삭제증적을 제공한다. | P0/MVP | 개인정보·정책 | DB/파일/로그 검사 | 데이터명세 | 메타데이터 최소화 확인, 캐시 계획 |
| NFR-OPS-001 | 인증서·키·로그·보유·삭제·모니터링의 담당자와 갱신·회수 절차를 정의한다. | P0/MVP | 운영책임 | runbook·drill | 운영계획 | 일부 문서 확인 |

## 10. 보안·개인정보·규제 착수계획

### 10.1 보안 설계 기준

- QR: bearer 성격을 전제로 짧은 TTL, 1회 사용, 복제 탐지, B 의료진 세션 결합, 원문 미로그화.
- 사용자 인증: OIDC Authorization Code + PKCE 및 MFA를 우선 검토하고 issuer/audience/nonce/state/redirect URI를 검증한다.
- 서비스 인증: A/B Connector와 Relay는 기관별 인증서의 mTLS로 인증하고 사용자 토큰과 서비스 신원을 모두 요구한다.
- 데이터 보호: TLS/mTLS와 별도로 필요 시 DICOM 전송 객체·청크에 AES-256-GCM을 적용하며 DEK/KEK를 분리한다.
- 저장: Control Plane에는 최소 메타데이터만 두고 임시 캐시·재개파일·백업의 위치, TTL, 삭제주체와 삭제증적을 설계한다.
- 감사: 원문 ticket/token, DICOM Pixel Data, 불필요한 직접식별정보를 로그에 남기지 않는다. hash chain은 로컬 PoC 통제로 유지하되 운영 WORM/SIEM은 별도다.
- 암호 민첩성: 알고리즘·키 버전을 metadata로 관리하고 교체·dual-read·rollback 계획을 둔다.

### 10.2 법적 의무·권고·프로젝트 정책의 구분

| 구분 | 적용 판단 | 착수 조치 |
|---|---|---|
| 법적 의무 후보 | 건강정보는 민감정보이며 처리 근거와 안전조치가 필요하다. 의료기록 열람·사본·송부는 의료법상 주체·동의·예외 요건 검토가 필요하다. | 법무/CPO가 실제 서비스 흐름과 역할을 기준으로 조문·동의문 검토 |
| 감독기관 가이드 | 안전성 확보조치, 처리방침, 보건의료 데이터 관련 가이드는 설계 참고 및 통제 매핑 자료다. | 최신 고시·가이드 원문과 적용성 재확인 |
| 프로젝트 보안정책 | QR 최소정보, 1회성, mTLS, 최소권한, 중앙 영구저장 금지, 임시캐시 TTL | P0 요구사항과 시험으로 강제 |
| PoC 가정 | 가상 병원, 합성 환자·DICOM, Mock 인증·키 | 화면·문서·증적에 비운영 한계 표시 |
| 운영 전 추가검토 | 병원·플랫폼·클라우드 책임, 위탁·국외이전, 보유기간, 동의 철회 후 사본, PIA/ISMS-P | DEFERRED/BLOCKED 상태로 상용화 P0 관리 |

### 10.3 공식 출처 등록부

확인일은 모두 2026-09-01이다. 아래 자료는 기술·법률 검토의 출발점이며 이 문서가 법률 의견을 대신하지 않는다.

| 출처 | 적용 주장/요구사항 | 구분 |
|---|---|---|
| [개인정보 보호법, 국가법령정보센터](https://www.law.go.kr/법령/개인정보보호법) | 건강정보 민감정보, 처리근거·안전조치·최소처리 검토 | 법령 |
| [의료법 제21조·제21조의2, 국가법령정보센터](https://www.law.go.kr/법령/의료법) | 진료기록 열람·사본·송부·전송 주체와 동의/예외 검토 | 법령 |
| [개인정보보호위원회](https://www.pipc.go.kr/) | 안전성 확보조치·보건의료 데이터 가이드 최신본 확인 창구 | 감독기관; 세부 문서 최신성 재확인 필요 |
| [DICOM PS3.18 Current](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/) | QIDO-RS 검색, WADO-RS 조회, STOW-RS 저장의 구분 | 공식 표준 |
| [RFC 9700 OAuth 2.0 Security BCP](https://www.rfc-editor.org/info/rfc9700/) | Authorization Code/PKCE, replay 방지, audience·최소권한 | IETF BCP |
| [RFC 8446 TLS 1.3](https://www.rfc-editor.org/info/rfc8446/) | TLS 1.3 보안채널 기준. RFC 페이지의 후속 갱신 상태도 설계 시 재확인 | IETF 표준 |
| [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final) | GCM AEAD와 nonce 관리 설계 | 공식 권고 |
| [NIST SP 800-57 Part 1 Rev.5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) | 키 생성·보호·수명주기·책임 분리 | 공식 권고; Rev.6 최종화 여부 추적 |
| [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) | ML-KEM/ML-DSA는 향후 암호민첩성 실험 계층 | 공식 표준, MVP 핵심 아님 |

### 10.4 PQC 위치

DICOM 본문은 대칭키 AEAD로 보호한다. PQC는 Gateway 애플리케이션 계층의 ECDHE+ML-KEM 하이브리드 키 설정이나 ML-DSA 서명 실험 후보로만 둔다. PACS, OHIF, 브라우저, 프록시와의 상호운용 및 성능이 확인되지 않았으므로 P1 설계 실험이며 “PQC 적용 완료” 또는 인증으로 표현하지 않는다.

## 11. MVP 범위

### 11.1 P0/MVP

- 가상 A/B 병원, 합성 환자, 합성 CT·MRI, Orthanc
- A Edge Connector/Gateway와 Control Plane/Data Plane 경계
- 동의·목적·기관·의료진·Study/Series·조회/편입 권한
- QR 기반 일회용 Transfer Ticket과 재사용·만료·철회 차단
- 합성 OIDC/OAuth 인증, mTLS, 단기 조회 토큰
- QIDO-RS/WADO-RS Remote Viewing과 Progressive Loading
- 승인된 선택적 STOW-RS 또는 C-STORE 편입 시연
- 전송 패키지 AEAD·manifest·hash 무결성의 로컬 검증
- 감사로그, 상태 추적, 장애·부분실패·삭제 시험
- Docker Compose 기반 재현 및 발표 E2E 증적

### 11.2 P1/선택적 확장

- 환자 휴대폰 암호화 DICOM 및 오프라인 전송
- 실제 KMS/HSM·병원 IdP/MFA·상용 PACS 어댑터
- FHIR 진료정보 연계, PQC 하이브리드 실험
- 멀티테넌시, 고가용성, 멀티리전, 독립 DR

### 11.3 제외

- 실제 환자·의료영상, 실제 병원망/PACS 운영 연결
- 촬영장비 생영상 실시간 스트리밍 또는 라이브 방송
- AI 판독·진단·예측 및 연구용 독자 수집
- 환자 휴대폰을 기본 장기 DICOM 저장소로 사용하는 구조
- 법률자문, 병원 운영승인, ISMS-P/PIPA/PQC 인증 완료 주장
- N2SF 또는 PQC를 프로젝트 본체로 확장하는 작업

## 12. WBS와 8주 일정

실제 팀 이름과 승인일은 TBD다. D+8주를 2026년 10월 말 발표 이전으로 배치한다.

| 주차 | 목표·주요 작업 | 산출물 | 선행조건 | 담당 | 완료기준 | 차단조건 |
|---|---|---|---|---|---|---|
| D+1주 | 현황·변경대비·범위·용어 기준선 확정 | 본 착수계획서, 대비표 | 저장소 조사 | PM/EA | 승인된 P0·제외범위 | 의사결정자 부재 |
| D+2주 | A/B/환자/의료진 여정, QR·예외 흐름 확정 | 업무흐름·상태기계 | 1주차 승인 | 업무/UX/보안 | 정상·음성 시나리오 리뷰 | 환자 본인확인 가정 미정 |
| D+3주 | FR/NFR, QR·ABAC·DICOMweb 추적성 확정 | 요구사항정의서·RTM | 시나리오 | 분석/QA | 모든 P0에 시험방법 | 편입 프로토콜 미결정 |
| D+4주 | HLD, 데이터흐름, 위협·암호·키·캐시·책임경계 | HLD·위협모델·보안설계 | 요구사항 | EA/보안 | 위협별 통제·증적 연결 | 법률 역할 미확정은 가정 처리 |
| D+5주 | 동의·요청·ticket·정책·감사 MVP | API/DB/LLD·구현증적 | HLD | Backend/QR | 발급·1회성·만료·재사용 차단 | 인증 UX 미확정 |
| D+6주 | Edge·Orthanc·QIDO/WADO·Viewer·선택적 편입 | DICOMweb E2E | Connector 인증서 | DICOM/Frontend | 원격조회와 편입 분리 재현 | Docker/PACS 어댑터 장애 |
| D+7주 | mTLS·AEAD·철회·부분실패·삭제·성능 시험 | 시험성적서·증적목록 | E2E 환경 | 보안/QA | P0 결과·잔여위험 기록 | 외부 IdP/KMS는 BLOCKED 분리 |
| D+8주 | 결함수정, 문서 동결, 발표·시연 패키지 | 최종보고·발표·영상 | P0 시험 | 전원 | 제3자 재현 및 실패대응 | 치명 결함·증적 누락 |

## 13. 역할·RACI와 의사결정

| 역할 | 담당 | 주요 책임 |
|---|---|---|
| PM/총괄 | TBD | 범위·일정·승인·위험 |
| 의료정보/업무 | TBD | 동의·기록제공·병원 흐름 |
| EA/DICOMweb | TBD | HLD, PACS·QIDO/WADO/STOW |
| Backend/Control Plane | TBD | 동의·ticket·ABAC·감사 |
| Edge/네트워크/PKI | TBD | Connector, Relay, mTLS, 장애 |
| Frontend/OHIF/QR UX | TBD | QR 발급·스캔·Viewer UX |
| 보안·개인정보 | TBD | 위협·암호·법규 매핑·잔여위험 |
| QA·증적·발표 | TBD | RTM, 자동시험, 증적, 시연 |

| 의사결정 | 책임(A) | 실행(R) | 검토(C) | 기한 | 현재 권고/상태 |
|---|---|---|---|---|---|
| QR 기본 흐름 | PM | Backend/UX | 보안/업무 | D+2주 | 환자 제시 + B 의료진 인증 |
| 조회/편입 정책 | 의료정보 책임자 | EA/Backend | 보안/QA | D+3주 | 별도 권한·별도 감사 |
| Relay 평문 처리 | 보안 책임자 | EA/Edge | PM/개인정보 | D+4주 | 암호문 우선, 평문 최소 메모리 처리 |
| 임시캐시 TTL | PM | EA/운영 | 보안/법무 | D+4주 | 수치 임의 확정 금지, 시험 후 승인 |
| STOW/C-STORE 우선 | EA | DICOM 담당 | 병원업무/QA | D+3주 | MVP STOW-RS 우선 검토 |
| KMS/HSM Mock | 보안 책임자 | Backend | QA | D+4주 | 인터페이스+fail closed, 실제 KMS BLOCKED |
| PQC 실험 | PM | 보안/EA | DICOM/일정 | D+4주 | P1, 핵심경로 제외 |
| 휴대폰 오프라인 저장 | PM | UX/보안 | 업무/법무 | D+2주 | MVP 제외 |

## 14. 위험·가정·의존성·블로커

가능성은 정성값(낮음/중간/높음)이며 측정 데이터가 생기면 재평가한다.

| ID | 위험 | 원인 | 영향 | 가능성 | 대응 | 잔여위험 | 담당 | 발생판단기준 |
|---|---|---|---|---|---|---|---|---|
| R-01 | 실제 PACS/병원망 부재 | 외부 승인 없음 | 상호운용 미확인 | 높음 | Orthanc+합성 DICOM, conformance 명세 | 상용 PACS 차이 | EA | 실제 endpoint 미제공 |
| R-02 | 외부 IdP/KMS/Staging 부재 | 계약·계정 없음 | 운영 보안 미검증 | 높음 | Mock과 fail-closed, BLOCKED 분리 | 운영 통합 위험 | 보안 | 자원·명령·증적 없음 |
| R-03 | QR 탈취·복제·재사용 | bearer 노출 | 무단 연결·조회 | 중간 | 1회성·TTL·세션·기관 binding | 카메라 복제 | Backend | 같은 jti 2회 검증 |
| R-04 | 동의/권한 불일치 | 분산 상태·경합 | 과다 접근 | 중간 | 원자적 상태전이·Gateway 재검증 | 지연창 | Backend | 철회 후 ALLOW |
| R-05 | PACS/Gateway 장애 | 네트워크·서비스 | 진료 지연 | 높음 | timeout, 상태기계, 제한 재시도 | 가용성 한계 | Edge | readiness 실패 |
| R-06 | 대용량 CT·MRI 지연 | Instance·multi-frame | UX·시연 실패 | 중간 | Progressive Loading, 측정표 | 환경 편차 | DICOM | 예산 초과; 기준 TBD |
| R-07 | DICOMweb 비호환 | vendor 차이 | 조회·편입 실패 | 중간 | PS3.18 매핑·adapter·오류 정규화 | vendor 특화 | EA | conformance 불일치 |
| R-08 | Relay 평문 노출 | 복호화·임시파일 | 민감정보 유출 | 중간 | 암호문 중계, 메모리 최소화, TTL 삭제 | 메모리·crash dump | 보안 | 평문 파일 탐지 |
| R-09 | 임시파일·백업·로그 잔존 | cleanup 누락 | 장기 잔존 | 중간 | inventory, TTL, deletion test | forensic 잔존 | 운영 | TTL 후 파일 존재 |
| R-10 | B PACS 사본 철회 한계 | 독립 보존 의무 | 환자 기대 불일치 | 높음 | 고지·별도 정책·책임경계 | 자동 회수 불가 | 업무/법무 | 편입 후 철회 요청 |
| R-11 | 인증서 갱신 실패 | 수명주기 운영 미성숙 | 기관 연결 중단 | 중간 | 만료 경보·rotation·rollback | 동시 갱신 장애 | PKI | 임계기간 진입 |
| R-12 | 법적 책임 미확정 | 처리자 역할·계약 부재 | 상용화 차단 | 높음 | 법무/CPO 의사결정 gate | 해석 변화 | PM | 책임모델 미승인 |
| R-13 | 일정·인력 부족 | 8주·TBD 역할 | P0 미완료 | 높음 | P0 우선, PQC/오프라인 제외 | 품질 저하 | PM | 주차 exit 미충족 |

## 15. 시험 및 증적 계획

현재 단계의 상태는 `PLANNED`, `BLOCKED`, `NOT EXECUTED`만 사용한다. 기존 테스트를 재사용하더라도 구조변경 기준선으로 다시 실행하기 전에는 PASS로 승격하지 않는다.

| 시험 ID | 시험항목·사전조건 | 실행절차 | 기대결과 | 증적 | 현재 상태 |
|---|---|---|---|---|---|
| T-E2E-001 | 합성 환자·CT/MRI, A/B 환경 | 요청→동의→QR→인증→QIDO/WADO | 승인 범위 원격조회 | trace, 화면, HTTP | PLANNED |
| T-QR-001 | 유효 ticket | 1회 사용 후 재사용 | 첫 사용 완료, 두 번째 DENY | jti 감사 | PLANNED |
| T-QR-002 | 만료·복제·타 기관 ticket | 각 조건으로 검증 | 모두 reason code와 DENY | API/로그 | PLANNED |
| T-AUTH-001 | 미인증·타 기관 의료진 | QR 검증·조회 요청 | 영상·메타데이터 비노출 | 401/403 | PLANNED |
| T-POL-001 | 타 환자·Study·Series·목적 | 범위 밖 QIDO/WADO | fail closed | 정책로그 | PLANNED |
| T-CONSENT-001 | 활성 동의 | 조회 후 철회·재조회 | 미래 ticket/token·조회 DENY | DB/감사 | PLANNED |
| T-DICOM-001 | Orthanc 합성 Study | QIDO/WADO 검색·Instance 조회 | UID/media type 일치 | HTTP body/hash | PLANNED |
| T-IMPORT-001 | IMPORT 승인 | STOW-RS/C-STORE 편입 | 승인 객체·수신검증 성공 | PACS/manifest | PLANNED |
| T-IMPORT-002 | VIEW_ONLY | 저장 요청 | DENY | 정책·감사 | PLANNED |
| T-CRYPTO-001 | 로컬 test key | AEAD 암복호·tag/hash 변조 | 정상 복호, 변조 DENY | test vector | PLANNED |
| T-MTLS-001 | 개발 CA·기관 인증서 | 정상/무인증/비신뢰/만료 | 정상만 ALLOW | handshake log | NOT EXECUTED |
| T-AUDIT-001 | E2E 이벤트 | trace/jti 검색·hash chain | 전 구간 연결, 무결성 OK | JSON/화면 | PLANNED |
| T-FAIL-001 | PACS/Gateway/Relay | 중단·timeout·부분수신 주입 | 제한 재시도·정리·DENY | 상태전이 로그 | PLANNED |
| T-DELETE-001 | 임시 캐시 사용 | TTL 경과·cleanup | Pixel Data 미잔존·삭제증적 | 파일목록·로그 | PLANNED |
| T-PERF-001 | 크기·Instance·multi-frame 표본 | Progressive Loading 측정 | 측정표 생성, 임의 SLA 없음 | 메트릭 | PLANNED |
| T-EXT-001 | 실제 IdP/KMS/PACS/Staging | 외부 E2E | 운영 후보 검증 | 외부 증적 | BLOCKED |

## 16. 산출물 체계와 추적성

| 순서 | 산출물 | 목적·작성시점 | 선행 산출물 | 책임 | 완료기준 | 연계 |
|---|---|---|---|---|---|---|
| 1 | 본 착수계획서 | 기준선·범위·일정 승인, D+1 | 저장소 조사 | PM/EA | 변경기준 승인 | 전체 |
| 2 | 문제정의·업무흐름서 | 사용자·예외 흐름, D+2 | 1 | 업무/UX | 8개 흐름 승인 | FR-CONSENT/QR |
| 3 | 요구사항정의서 | 시험 가능한 FR/NFR, D+3 | 2 | 분석/QA | P0 RTM 완성 | FR/NFR 전체 |
| 4 | HLD/기본설계 | 경계·데이터흐름, D+4 | 3 | EA | 불변조건 반영 | VIEW/IMPORT/SEC |
| 5 | LLD | 상태기계·컴포넌트·오류, D+4~5 | 4 | 개발 | 구현 가능한 인터페이스 | QR/FAIL |
| 6 | 데이터·API·DICOMweb 매핑 | UID·media type·schema, D+4 | 3~4 | DICOM/Backend | QIDO/WADO/STOW 구분 | INTEROP |
| 7 | 동의·QR·정책 명세 | ticket·ABAC·철회, D+4 | 3 | 보안/Backend | 모든 binding 정의 | CONSENT/QR/POLICY |
| 8 | 위협모델·보안설계 | 위협·암호·키·감사, D+4 | 4,7 | 보안 | 통제·시험 연결 | SEC/AUDIT |
| 9 | 구현계획 | P0 backlog·DoD, D+5 | 5~8 | Tech Lead | 담당·의존성 확정 | 전체 P0 |
| 10 | 시험계획·RTM | 정상·음성·장애, D+5 | 3~9 | QA | P0 100% 매핑 | T-* |
| 11 | 구현·E2E 결과 | 실행 결과, D+5~7 | 9~10 | 개발/QA | 결과·종료코드·증적 | T-* |
| 12 | 보안·개인정보 검토 | 잔여위험·법적 gate, D+7 | 8,11 | 보안/CPO | 과장 없는 상태 | SEC/PRIV |
| 13 | 운영·장애·PKI·키 계획 | 갱신·회수·대응, D+7 | 8,11 | 운영/PKI | drill 절차 | OPS/FAIL |
| 14 | 시연·증적집·최종보고·발표 | 제3자 재현, D+8 | 전체 | PM/QA | 발표 패키지 동결 | 전체 |

다음 산출물은 `구조변경 반영 요구사항정의서`이며, 본 문서의 FR/NFR을 세분화하고 업무 시나리오·API·시험 ID와 양방향 추적한다.

## 17. 착수 승인 게이트

착수 승인 전 다음을 결정한다.

1. MVP의 환자 본인·보호자 확인 가정과 QR 제시 방식
2. STOW-RS 우선 여부와 C-STORE fallback 범위
3. Relay 평문 메모리 처리 및 임시캐시 허용 여부
4. 캐시·재개파일의 보유시간 결정 절차와 삭제증적
5. Mock IdP/KMS의 경계 및 실제 외부 자원 BLOCKED 처리
6. 8주 팀 역할과 주차별 승인자

결정되지 않은 항목은 임의 구현하지 않고 `TBD`, `PLANNED` 또는 `BLOCKED`로 유지한다.

## 18. 자체 검수 결과

| 검수 항목 | 결과 |
|---|---|
| QR에 DICOM·직접식별정보·장기 인증정보 없음 | 충족 |
| 환자 휴대폰은 QR·동의·승인 역할, 영상 장기저장은 P1 | 충족 |
| A PACS 원본 유지 및 중앙 영구저장 금지 | 충족 |
| 원격조회와 선택적 PACS 편입 권한 분리 | 충족 |
| QIDO=검색, WADO=조회, STOW=저장 구분 | 충족 |
| 브라우저의 타 병원 PACS 직접 접근 금지 | 충족 |
| QR을 인증 자체로 표현하지 않음 | 충족 |
| 동의·기관·의료진·Study/Series·목적·기간 binding | 충족 |
| TLS/mTLS, AEAD, 캐시, 키, 감사 분리 | 충족 |
| PQC는 P1 암호민첩성 실험 | 충족 |
| 실제 운영·법률·인증 완료 주장 없음 | 충족 |
| 현 구현·미커밋 변경·외부 blocker 구분 | 충족 |
| 모든 P0 요구사항에 검증방법·산출물 연결 | 충족 |
| 8주 일정과 10월 말 발표 가정 명시 | 충족 |

---

**최종 한정:** `CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY — NOT A LEGAL DETERMINATION, HOSPITAL SECURITY APPROVAL, CERTIFICATION, OR PRODUCTION READINESS CLAIM.`
