# MediQ 기록 계승 — 선별·적용 기준

날짜: 2026-10-08 / 권한: 사용자의 MediQ 종료 및 하이패스 기록 병합 지시.
상태: **RECORDS IMPORTED / RUNTIME PORT NOT IMPLEMENTED**
권위: 하이패스 승인 기준선이 우선. 이 폴더는 참고·회고 자료이며 normative source가 아니다.

## 등록 자료

- [프로젝트 종료·실패 회고](PROJECT-CLOSURE-2026-10-08.md)
- [기존 성공·실패 기록 원문 발췌](RECORD-EXTRACTS.md)
- [원본 파일·SHA-256 manifest](SOURCE-MANIFEST.json)
- [이번 기록 병합 검증](TRANSFER-VERIFICATION.md)

발췌는 기록 자체를 보존한 것으로, 시험을 재실행하거나 하이패스에 적용 완료했다는 뜻이 아니다.
전체 MediQ 저장소와 914KB 규모 PACS 시험 이력은 원래 저장소에 보존한다.
선별된 15개 원본 파일의 hash는 미커밋 상태를 포함한 실제 파일 식별자다.
코드 후보는 manifest에 위치·hash만 등록하고 이 폴더에 실행 코드로 복사하지 않았다.

## 선택 결정 / MEDIQ-INHERIT-20261008

채택: 기록·교훈은 지금 등록하고 코드는 필요 책임별로 조건부 port.
대안: 전체 저장소 복사 또는 branch merge는 스택·schema·보안 경계 충돌과 증거 오승계 위험 때문에 제외.
완전 폐기는 검증된 알고리즘과 실패 사례를 잃으므로 제외.
영향: 문서만 추가·연결하며 API/DB/암호화/인가·배포는 변경하지 않는다.
잔여 위험: 기록된 과거 PASS는 현 HEAD+dirty 전체나 하이패스 코드의 PASS가 아니다.
하이패스의 독립 사람 검토 Gate도 이 사용자 지시만으로 대체하지 않는다.

## 계승 우선순위와 현재 계획 연결

| 우선 | MediQ 자산 | 하이패스 연결 | 판단 / 필요한 검증 |
|---|---|---|---|
| 지금 | 실패 회고·증거 분류·작업 단위 보고 | 전 P0 / 완료 판정 | DOCUMENTATION ADOPTED. 하위 PASS/제품 PASS/운영 승인을 구분 |
| 높음 | Orthanc DICOMweb adapter의 QIDO/WADO/STOW·응답/범위 처리 | 기존 orthanc-client, P0-09/10; FR-026~036 기능군 | PORT CANDIDATE. 기존 TLS/mTLS/DPoP gateway를 유지; 실제 A/B STOW·readback·거부 시험 필요 |
| 높음 | transfer dispatch Coordinator·Mandatory Preflight·durable claim | P0-08/09 | PATTERN CANDIDATE. 한 Study의 실제 경로를 검증하되 v3 다중 Study 요구를 삭제하거나 단일 Study로 전체 완료 주장 금지 |
| 높음 | 임시 암호화 Store·source capture 수명주기 | P0-07; 최소수집·보존 제한 | PATTERN CANDIDATE. 기존 package/chunk 구조 재사용; TTL·정상/취소/오류·실제 purge·quota 시험 필요 |
| 높음 | terminalization·무결성/출처·목적지 판정 | P0-09/11 | PATTERN CANDIDATE. STOW200만으로 완료 금지; 실제 목적지 byte/semantic 판정과 원자적 durable evidence 필요 |
| 높음 | Consent/Authorization/VIEW·DOWNLOAD·PACS_IMPORT scope 분리, tenant/RLS 음성 사례 | P0-04~06/12; FR-001~005/014~025 기능군 | 기존 v3 구현과 비교용. DB·상태를 병렬 재구축하지 않음; 신규 h-p 코드에서 거부 시험 |
| 중간 | 단일 명령 검증 orchestration·exact-owned cleanup | 기존 synthetic-validation 및 P0-12 | PATTERN CANDIDATE. 기존 runner를 확장하고 새 병렬 Gate 체계 금지; destructive cleanup 없이 재현 시험 |
| 중간 | Web Grant 발급 순서·unknown-result/no-blind-retry 교훈 | P0-10; FR-010~013/032~036 기능군 | UX PATTERN ONLY. 하이패스 실제 상태 모델로 재설계; MediQ CONSENTED-only 규칙 그대로 이식 금지 |
| 보류 | 79개 SaaS 화면·14개 구현 화면·모바일/QR/RAG/PQC | P1/후속 범위 | 이번 P0 확장에 사용하지 않음. 기존 하이패스 Viewer/디자인을 교체하지 않음 |
| 제외 | MediQ SQL migration·Nest modules·root package/Compose 전체 | 기존 ESM/PG/배포 | WHOLESALE IMPORT REJECTED. 임의 schema/backfill/framework 변경 금지 |

요구사항 FR 번호는 저장소의 기능군 기준 참조이며 원문 개별 FR 내용을 새로 추정하지 않는다.

## 기술 충돌과 이식 Gate

- MediQ NestJS/TypeScript/npm과 하이패스 Node ESM/pnpm은 실행 결합이 다르다.
- tenant/principal/patient binding, Consent 버전·Session 상태, v3 다중 Study·route-neutral package는 동일 모델이 아니다.
- MediQ의 중앙 임시 영상 처리 코드는 하이패스 Control/Data Plane 구분을 자동 대체할 수 없다.
- 신규 권한은 기존 VIEW_ONLY·DOWNLOAD_ALLOWED·DPoP 범위와 명시적으로 정렬해야 한다.
- 새로운 정책·외부 API·업무 schema를 바꾸면 하이패스 승인 절차와 관련 계약/Acceptance를 먼저 따른다.

코드 이식은 기존 P0 package 내에서 최소 책임을 선택 → 기존 구현과 비교 → 필요한 부분만 adapter/port →
focused 정상·거부 → 실제 Test Orthanc 및 독립 DB evidence → 단계 회귀 순으로 진행한다.
이 기록 등록 자체는 그 다음 구현을 이미 실행한 것으로 취급하지 않는다.

## 개발 방식 계승

새 Repository 단위 Decision이나 테스트 수 증가를 성과로 삼지 않는다.
실행 가능한 기존 화면/업무 경로와 현재 v3 구성요소를 연결하는 것을 우선한다.
개발 중 focused tests, 연결 단계 완료 시 회귀를 수행하고 보안 핵심 변경에는 필요한 추가 검증을 유지한다.
문서·증거는 같은 작업 단위에서 끝에 정리한다. Mandatory Preflight·fail closed·tenant isolation·감사·삭제 증거를 생략하지 않는다.
