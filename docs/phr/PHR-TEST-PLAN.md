# PHR 통합 시험계획

## 2026-09-09 실행 갱신

| 시험 | 최신 로컬 판정 | 근거 |
|---|---|---|
| PHR-T01~T03 | PASS (합성 로컬 API) | 본인 binding, 타환자·비환자 거부, FHIR fixture 계약 |
| PHR-T04~T06 | PASS (합성 Orthanc) | live mapping validator와 W07 QIDO/WADO 수직경로 |
| PHR-T07 | PASS (local fail-closed) | 외부 endpoint 신뢰 금지와 provider allowlist |
| PHR-T08 | PASS (local service/E2E) | ImagingStudy reference에서 Study/Series 범위 동의 생성 |
| PHR-T09 | PASS (기존 QR 정책 회귀) | 재사용·만료·기관·범위·철회 거부 |
| PHR-T10 | NOT RUN / DEFERRED | Mobile-Core 암호문 package 경로 미구현 |
| PHR-T11 | PASS | 전체 Node 및 Compose MVP 회귀 |
| PHR-T12 | PARTIAL | 임상경로 독립/fallback 0 단위시험 PASS, 실제 OPF 모델 BLOCKED |
| PHR-T13~T14 | PASS (local) | MyHealthWay NOT_CONFIGURED outbound 0, 감사 UID·secret 비노출 |
| PHR-T15 | PARTIAL PASS | 환자 UI PHR 조회·동의 생성과 서비스 Viewer 수직경로는 각각 PASS, 단일 브라우저 역할전환 handoff 후속 |

기존 `NOT RUN` 표는 계획 당시 기준선으로 보존한다. 위 표가 최신 판정이며 실제 외부·운영환경으로 확대 해석하지 않는다.

상태: `PHR-W02~W04 LOCAL GATES PASS / INTEGRATED PHR-T01~T15 PARTIAL`  
주의: 이 문서 작성은 PHR 기능 시험 성공을 의미하지 않는다.

## 증적 형식

각 실행은 `evidence/phr/<run-id>/` 아래에 `manifest.json`, 명령 stdout/stderr, HTTP 결과(민감값 redacted), 감사 추출, 필요한 browser/network trace를 둔다. manifest는 Git SHA, dirty 상태, OS/runtime, Compose image digest, fixture version/checksum, 명령, 기대/실제 결과, `PASS|FAIL|BLOCKED|NOT RUN`, 시작/종료시각을 기록한다.

## 계약·단위·통합 시험

| 시험 ID | 시나리오 | 기대결과 | 단계/현재 |
|---|---|---|---|
| PHR-T01 | 환자 A 로그인·본인 PHR | A 자료만 반환, 조회 감사 | Phase 2 / NOT RUN |
| PHR-T02 | A principal로 B 직접조회 | 403, 안전한 reason, 거부 감사 | Phase 2 / NOT RUN |
| PHR-T03 | FHIR 정규화 | 값·코드·단위·출처·상태 보존 | Phase 2 / NOT RUN |
| PHR-T04 | 정상 ImagingStudy UID | 정확한 A Orthanc Study mapping | Phase 3 / NOT RUN |
| PHR-T05 | 누락·불일치·종류혼용 UID | 접근불가와 명시 상태 | Phase 3 / NOT RUN |
| PHR-T06 | PHR→DICOMweb | 승인 객체만 QIDO/WADO | Phase 3 / NOT RUN |
| PHR-T07 | endpoint를 내부/외부 URL로 변경 | outbound 0건, reference 차단 | Phase 2~3 / NOT RUN |
| PHR-T08 | 공유 consent/기관/scope | 선택 범위만 공유 | Phase 4 / NOT RUN |
| PHR-T09 | QR 재사용·만료·철회 | 전부 거부·감사 | Phase 4 / NOT RUN |
| PHR-T10 | 암호문/manifest 변조 | 수신·복호화·완료 처리 거부 | Phase 4 / NOT RUN |
| PHR-T11 | 기존 임상조회 회귀 | 기존 Node/Compose Gate 유지 | 각 Phase / NOT RUN |
| PHR-T12 | Privacy model 장애/CLINICAL 우회 | 임상조회 비침해, 비진료 fallback 0 | Phase 5 / NOT RUN |
| PHR-T13 | MyHealthWay 미설정 | `NOT_CONFIGURED`, outbound 0건 | Phase 2 / NOT RUN |
| PHR-T14 | 감사·로그·저장소 누출 | 원문·키·token 금지패턴 0건 | Phase 2~5 / NOT RUN |
| PHR-T15 | 전체 합성 PHR→Viewer→공유 | 재현 가능한 종단 PASS | Phase 5 / NOT RUN |

## Fixture 계획

`test/fixtures/phr/r4/<fixture-version>/`을 제안한다. `patient-a-bundle.json`, `patient-b-bundle.json`, `identity-map.synthetic.json`, `imaging-map.synthetic.json`, `invalid/` 음성자료와 `manifest.json`을 둔다. 자체 제작 합성자료를 우선하며 외부 Synthea 자료를 쓸 경우 생성기 버전, seed, 라이선스, 원본 URL/checksum, PHI 검토를 manifest에 기록한다.

최소 음성자료는 타환자 subject, 중복 identifier, 잘못된/중복 Study UID, Series/SOP 혼용, 외부·loopback·link-local endpoint, 순환 reference, 과대 Bundle, 미지원 resource/modifier, 값/단위 누락을 포함한다.

## 구현 전 Contract Gate

1. JSON fixture가 R4 구조와 내부 schema를 통과한다.
2. 모든 reference가 동일 Bundle/허용 registry 안에서 닫힌다.
3. A/B identity와 모든 DICOM UID 집합이 교차하지 않는다.
4. mapping의 정상 Study가 Compose seed manifest와 일치한다.
5. Provider와 API 오류/state enum이 문서 간 일치한다.
6. 신규 요구사항 PHR-FR-001~018에 정상·음성 test가 연결된다.
7. fixture secret/실제 개인정보 scan 결과가 0이다.

## 이번 Phase 0~1 문서 검증

PHR Provider/API 실행코드가 없으므로 PHR-T01~T15는 모두 `NOT RUN`이다. 이번 단계의 PASS는 문서와 PHR-W02 fixture/seed 계약검증 범위이며 PHR 조회기능 PASS로 확대 해석하지 않는다.

## PHR-W02 계약 Gate 실행

2026-09-08에 `node --test test/phr-fixture-contract.test.js`를 실행하여 5/5 PASS했다. checksum, R4 최소 리소스, closed reference, A/B identity·UID isolation, A 정적 Orthanc seed 계약, B `NOT_MAPPED`, code/value/unit 보존을 검증했다. 실제 Docker Orthanc QIDO와 PHR-T01~T15는 여전히 `NOT VERIFIED` 또는 `NOT RUN`이다. 상세 결과는 [PHR-W02 실행 보고서](PHR-W02-EXECUTION-REPORT.md)에 기록한다.

PHR-JA-001/002 공동승인 후 `node --test test/health-data-provider.test.js test/phr-fixture-contract.test.js`를 실행하여 11/11 PASS했다. Provider 환자격리, common metadata, pagination/cursor binding, 허용 query와 크기·기간 제한, fixture 무결성, MyHealthWay 외부호출 금지를 검증했다. HTTP API와 감사 연결 전이므로 PHR-T01~T03/T13은 아직 통합 PASS가 아니다. 상세 결과는 [PHR-W03 실행 보고서](PHR-W03-EXECUTION-REPORT.md)에 기록한다.

PHR-JA-003/004 공동승인 후 PHR-W04 targeted suite 17/17을 PASS했다. 로컬 DEVELOPMENT_MOCK HTTP 환경에서 `/me` 환자 binding, 타환자·비환자 거부, Problem Details, UID 비노출, canonical 감사와 감사실패 fail-closed를 검증했다. 따라서 PHR-T01/T02/T03/T14의 로컬 구성요소 범위는 `PARTIAL PASS`이며 실제 IdP/PostgreSQL/통합 UI가 없어 최종 통합 PASS는 아니다. 상세 결과는 [PHR-W04 실행 보고서](PHR-W04-EXECUTION-REPORT.md)에 기록한다.
