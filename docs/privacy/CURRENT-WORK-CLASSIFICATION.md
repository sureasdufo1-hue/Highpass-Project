# Privacy Filter 현재 작업 분류

기준일: 2026-09-07  
대상: Highpass 저장소 현재 작업 트리  
판정값: `PASS`, `PARTIAL`, `NOT IMPLEMENTED`, `NOT VERIFIED`, `ENVIRONMENT BLOCKED`, `DEFERRED`

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. 현재 상태 요약

2026-10-08 다중 경합: [실행 결과](../governance/highpass-v3-multisession-contention-execution-2026-10-08.md)는 PG 169/169, 단독 Node 464/464 PASS다. 같은 source 두 Session의 실제 승인/취소 경쟁, 반대 기관과 상태 변경, 별도 Session expiry maintenance의 SKIP LOCKED/drain 및 정확한 actor/audit/cascade를 검증했다. 최초 관측 assertion FAIL도 보존했다. 전체 D6·Consent 철회/만료와 전체 MVP/v3는 미완료다. 다음은 기존 실제 create/PENDING 경합이며 신규 증적은 DRAFT / UNASSIGNED다.

2026-10-08 등록 환자 격리: [실행 결과](../governance/highpass-v3-registered-patient-isolation-execution-2026-10-08.md)는 PG 160/160, 단독 Node 464/464 PASS다. 같은 병원/다른 기관의 등록 환자 own positive와 교차 접근 DENY, 복사 INSERT 및 actor/ref/tenant/audit 변조 rollback을 확인했다. 초기 fixture 오류 2건도 보존했다. 공개 evidence read/최소 관리자 view와 전체 CON-006은 PARTIAL이며 다음은 다중 Session 잠금 순서 실제 검증이다. 신규 증적은 DRAFT / UNASSIGNED, 전체 MVP/v3는 미완료다.

2026-10-08 실제 nonowner 경쟁: [실행 결과](../governance/highpass-v3-nonowner-cancel-races-execution-2026-10-08.md)는 PG 143/143, 단독 Node 464/464 PASS다. 별도 최소권한 취소/approval 계정에서 실제 양방향 경쟁과 ACK 유실·감사 누락·lock timeout을 검증했다. 신규 증적은 DRAFT / UNASSIGNED다. 다음은 등록된 다른 환자·기관의 격리 행렬이며 철회 정책 L1~L5, 전체 D6·Grant·전체 MVP/v3는 미완료다.

2026-10-08 v3 역순/lifecycle 후속: [실행 결과](../governance/highpass-v3-consent-lifecycle-alignment-execution-2026-10-08.md)는 PG 137/137, 단독 Node 464/464 PASS다. 초기 기대 코드 불일치 FAIL도 보존했다. 철회·만료 ADR/API/ERD/acceptance는 DRAFT / NOT IMPLEMENTED, L1~L5 미결정이다. 다음 안전한 작업은 실제 nonowner 취소 service와 환자 결정의 양방향 경쟁이며 전체 MVP/v3는 미완료다.

2026-10-08 v3 부모/변경 후속: [실행 결과](../governance/highpass-v3-patient-parent-mutation-execution-2026-10-08.md)는 PG 135/135, 단독 Node 464/464 PASS다. 기관·참조 변경 commit/rollback, 연동된 부모 만료, 취소-first lock 경쟁을 확인했다. 전체 D6·철회/만료·Grant/임상 authority는 미완료이며 다음은 역순 경쟁과 lifecycle 계약 정렬이다. 새 증적은 DRAFT / UNASSIGNED다.

2026-10-08 v3 추가 증적: [challenge/재인증 만료·COMMIT·실제 lock 대기](../governance/highpass-v3-patient-decision-deadline-execution-2026-10-08.md) 추가 7개 및 전체 PG 127/127, PG 종료 후 Node 464/464 PASS. 새 증적은 DRAFT / UNASSIGNED이며, 다음은 부모 만료·기관/참조 변경·감사된 취소 경쟁이다. Privacy의 실제 모델·외부 승인과 전체 MVP/v3의 미완료 상태는 유지한다.

2026-10-08 v3 인계 실행: [최초 환자 동의 저장 검증](../governance/highpass-v3-patient-decision-execution-2026-10-08.md)은 최신 Node 464/464, 동의 PG 120/120, identity PG 427/427 PASS다. 동시 회귀 실행에서 발생한 Privacy HTTP 실패와 재실행 결과를 함께 기록했다. 최초 동의 artifact만 PARTIAL이며 임상 authority/Grant·전체 MVP/v3는 미완료다. 다음은 COMMIT deadline·실제 lock 경쟁 검증이다. 김범희의 계획 채택과 새 DRAFT / UNASSIGNED 증적의 독립 검토를 구분한다.

2026-10-08 격리 HTTP 후속: [shared handler 통합 증적](ISOLATED-HTTP-EVIDENCE-2026-10-08.md)을 수집했다. 정상 마스킹부터 인증·정책·body·모델 장애·취소·cleanup까지 31개 필수 시나리오 PASS, 소스 해시 44개와 manifest 무결성을 확인했다. 최신 Node 457/457 PASS, DRAFT / UNASSIGNED. 이는 fake model/loopback HTTP에 한정하며 실제 모델·TLS·외부 Staging·품질 평가·독립 검토는 미검증이다. Privacy 외부 인계를 보존하고, 핵심 v3 최초 환자 결정 저장의 실제 PostgreSQL 검증을 다음으로 재개한다.

2026-10-08 deadline 후속: [전체 요청 budget·abort](REQUEST-DEADLINE-EXECUTION-2026-10-08.md)를 구현했다. body·queue·두 단계 모델 호출이 한 budget을 공유하며 client abort/timeout 뒤 작업과 child를 취소한다. 신규 scoped 33/33, 최신 Node 455/455 PASS. 결과는 DRAFT / UNASSIGNED이다. 다음은 정상 마스킹까지 포함한 격리 HTTP 통합 증적 수집이며 actual model·외부 Staging·독립 검토는 미검증이다.

2026-10-08 최소권한 후속: [전용 서비스 identity](SERVICE-IDENTITY-EXECUTION-2026-10-08.md)를 구현·검증했다. 분리 활성 시 Privacy token은 inspection scope만 갖고 감사·Gateway HTTP 호출은 403이다. 신규 scoped 29/29, Node 451/451 PASS; 결과는 DRAFT / UNASSIGNED. 실제 환경 적용·승인 registry의 requester 변경은 수행하지 않았다. 다음은 전체 요청 deadline·abort 구현이며 actual model·외부 Staging은 계속 미검증이다.

2026-10-08 후속 갱신: [Privacy API 계약 정렬](API-CONTRACT-ALIGNMENT-2026-10-08.md)을 실행했다. 최신 Privacy 시험은 24/24, Node 회귀는 446/446 PASS다. 새 계약·시험 결과는 DRAFT / UNASSIGNED이며 실 model·live E2E·외부 Staging은 미검증을 유지한다. 다음 로컬 구현은 Privacy 전용 최소권한 서비스 identity 분리다.

2026-10-08 갱신: [비운영 연동 준비 계획](NONPRODUCTION-INTEGRATION-APPROVAL-2026-10-08.md)을 사용자 지시에 따라 채택했다. 검토자·승인자는 김범희이며 승인일은 2026-10-08이다. 계획 채택은 실제 모델 사용 승인·독립 검토·반출·운영 승인으로 확대하지 않는다. 최신 Privacy 단위 시험은 21/21 PASS이고, 실제 모델 smoke는 `EXPLICIT_CHECKPOINT_REQUIRED`로 exit 2 (`ENVIRONMENT BLOCKED`)이다. 공개 HTTPS edge에 내부 Privacy 경로가 연결되지 않았으며 외부 Staging URL·전용 최소권한 인증 계약도 미확정이다. 아래 과거 PASS·모델 차단 기록은 해당 날짜의 역사적 결과로 보존한다.

2026-09-09 갱신: Docker Engine 복구 후 `privacy-db-gate.ps1`의 PostgreSQL bootstrap readiness race를 수정했다. PostgreSQL 16에서 Mobile-Core/PF-0 migration과 FORCE RLS 기관격리 양·음성 SQL이 PASS했다. 따라서 아래의 과거 Docker `ENVIRONMENT BLOCKED` 기록은 해소됐으며 PF-0은 **로컬 기술 계약 FROZEN**이다. 실제 OPF checkpoint 부재는 계속 `ENVIRONMENT BLOCKED`다.

PF-0의 목적·상태·승인 binding·label mapping 계약은 code, JSON Schema, PostgreSQL migration, ADR 및 일치 시험으로 구현했다. PF-1은 서버 등록 `approved_use_ref` 검증, local-only OPF adapter, 한국어 필수 규칙, Unicode codepoint 역매핑, finding merge, 결정적 변환, 임상 표현 보호, 내부 API와 fail-closed 오류 처리를 구현했다.

과거 Docker 장애로 실행하지 못했던 PostgreSQL 16 migration/RLS Gate는 2026-09-09 PASS했다. `opf` Python package와 명시적 local checkpoint는 여전히 없어 실제 모델 smoke test는 실행하지 못했다. 따라서 fake bridge와 합성 자료 시험 성공을 실제 모델 실행이나 PF-1 완료로 과장하지 않는다.

## 2. 단계별 분류

| 단계 | 현재 판정 | 확인된 자산 | 남은 종료 조건 |
| --- | --- | --- | --- |
| PF-0 계약 동결 | PASS / LOCAL TECHNICAL FROZEN | enum·schema·migration·ADR·contract consistency·PostgreSQL 16 FORCE RLS Gate PASS | 운영 DB 변경승인과 외부 환경 검증은 상용화 전 수행 |
| PF-1 로컬 텍스트 | PARTIAL / ACTUAL MODEL BLOCKED | adapter·규칙·Unicode·merge·변환·internal API·fake bridge 시험 PASS | pinned OPF 환경과 checkpoint digest 확보, local-only 실제 모델 smoke/readiness PASS |
| PF-2 정책·작업 | PARTIAL / POST-MVP NEXT | 기존 연구 승인 simulation과 PF-0 persistence contract stub | job/artifact/review/lease/outbox 실제 저장·전이·stale/release E2E |
| PF-3 DICOM | PARTIAL | 기존 기본 header 정제·UID 가명화·고위험 영상 차단 | SOP/Transfer Syntax profile, 중첩/private/재파싱/참조 무결성 시험 |
| PF-4 서비스 연결 | PARTIAL | 기존 QR/패키지 계약·인가·감사 기반 | 검토 고정 사본, QR/키 릴리스 재인가, ACK/UNKNOWN E2E |
| PF-5 평가·정리 | NOT IMPLEMENTED | 일반 회귀·합성 정책 예시 연결 | 600건 분리 평가셋, 성능·누출·복구 측정과 evidence manifest |
| PF-6 OCR·픽셀 확장 | DEFERRED | 고위험 표시와 미구현 차단 | P0 완료 뒤 별도 범위·승인·평가기준 결정 |

## 3. 구현·검증 상태

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| purpose allowlist | PASS | `RESEARCH`, `TEACHING`, `DEMO`, `AI_LOCAL`; `CLINICAL` 제외 |
| approved_use_ref | PASS (file registry) | model 호출 전에 서버 등록 record의 org/action/artifact/version/purpose/recipient/policy/time 일치 검증 |
| 상태 분리·review binding | PASS (contract) | 독립 enum, 7개 binding field, 서버 release eligibility 계산 시험 |
| URL/account mapping | PASS (contract) | `URL_IDENTIFIER`, `FINANCIAL_ACCOUNT` additive mapping과 ADR |
| local adapter | PASS (fake bridge) | explicit checkpoint, offline env, stdin 전달, single concurrency, bounded queue/deadline, typed errors |
| 실제 OPF runtime | ENVIRONMENT BLOCKED | `opf_installed=False`, `HIPASS_PRIVACY_MODEL_PATH=not_configured` |
| 한국어 규칙·Unicode·변환 | PASS (unit/synthetic) | PF-T03~T07 범위와 규범 JSONL 8줄 offset self-check |
| internal API | PASS (process check) | 무인증 401 `AUTH_REQUIRED`; model 미준비 readiness/inspection 503 |
| PostgreSQL migration/RLS | PASS (local ephemeral PostgreSQL 16) | 최종 서버 readiness 확인 후 migration 적용, 기관 A 허용·기관 B 차단, rollback cleanup |
| Node 전체 회귀 | PASS | 기존 55건 유지, 신규 PF 시험 추가 후 전체 재실행 |
| secret scan | PASS | 0 findings; 합성 canary 응답/예외 비노출 시험 포함 |

## 4. 요구사항별 현재 판정

| 요구사항 | 판정 | 근거와 부족분 |
| --- | --- | --- |
| PF-R01 Edge 내부 추론 | PARTIAL | internal-only route와 child adapter 구현; 실제 모델·network egress 관찰 미검증 |
| PF-R02 규칙+모델 결합 | PARTIAL | merge와 필수 rule 우선 구현·fake model 시험; 실제 model smoke 미실행 |
| PF-R03 진료 경로 독립 | PASS (unit regression) | 기존 임상 경로 코드를 변경하지 않고 모델 장애 시험과 전체 기존 회귀 통과 |
| PF-R04 원본 보존·사본 | PARTIAL | inspection preview는 원문을 저장하지 않음; PF-2 artifact byte/version 미구현 |
| PF-R05 실패 시 반출 거부 | PARTIAL | PF-1 원문 fallback 0, release false; PF-2 반출 E2E 미구현 |
| PF-R06 한국어·Unicode·임상 보존 | PASS (synthetic unit) | NFC/NFD·emoji·CRLF·zero-width·prefix와 임상 충돌 시험 |
| PF-R07 DICOM 처리 | PARTIAL | 기존 단순 처리만 존재; 이번 단계 범위 밖 |
| PF-R08 QR binding | PARTIAL | 기존 계약 fixture만 존재; Privacy artifact binding E2E 없음 |
| PF-R09 승인-사본 byte binding | PARTIAL (contract only) | binding/stale contract 존재; PF-2 persistence 없음 |
| PF-R10 로그 금지값 | PASS (PF-1 unit) | 원문 미포함 응답 metadata와 synthetic canary 시험, secret scan 0 |
| PF-R11 기관 격리 | PASS (local PostgreSQL) / PARTIAL production | FORCE RLS migration과 실제 PostgreSQL 양·음성 Gate PASS; 운영 IAM/DB는 미검증 |
| PF-R12 재시작·중복 작업 | NOT IMPLEMENTED | PF-2 worker lease/fencing/ACK 범위 |
| PF-R13 파기 | PARTIAL | 기존 retention 기반만 존재; artifact/mapping 파기 E2E 없음 |
| PF-R14 고정 버전 재현 | PARTIAL | runtime commit·dependency lock·config digest 경로 구현; 실제 model artifact digest 없음 |
| PF-R15 픽셀 제거 | DEFERRED | 현재 미구현 차단 표시만 존재 |

## 5. 실행 결과

| 검증 | 결과 | 비고 |
| --- | --- | --- |
| `pnpm run test:privacy` | PASS | fake adapter·rule·Unicode·fail-closed·contract 시험 |
| `node --test` | PASS | 기존 55개 회귀 유지 + 신규 PF 시험 |
| 내부 API process check | PASS | 401/503/503 예상 상태 확인 |
| `node scripts/security-secret-scan.js` | PASS | findings 0 |
| `pnpm run privacy:db-gate` | PASS | PostgreSQL bootstrap 종료 race 수정, migration/RLS Gate exit 0 |
| 실제 OPF smoke/latency/memory | ENVIRONMENT BLOCKED / NOT RUN | smoke runner가 explicit checkpoint 부재로 exit 2; 실제 inference·성능 미측정 |
| PF-T02~T08, T19 canary | PASS (synthetic/non-DB subset) | 실제 모델·DB·release 검증으로 확대 해석 금지 |
| PF-T01, T09~T18, T20 | NOT RUN | 해당 구성요소 또는 실제 환경 미준비 |

## 6. 다음 한 작업

PF-0의 로컬 DB 종료조건은 충족했다. 다음 작업은 승인된 로컬 OPF dependency와 checkpoint digest를 준비하고 실제 model smoke/readiness를 실행하는 것이다.

```powershell
pnpm run privacy:model-smoke
```

모델 파일은 Git에 넣지 않는다. 실제 모델이 준비되기 전까지 PF-1은 `PARTIAL / ACTUAL MODEL BLOCKED`를 유지한다.

상세 실행 증거와 차단 해제 절차는 [PF0-PF1 실행 보고서](PF0-PF1-EXECUTION-REPORT.md)를 따른다. commit, push, merge는 수행하지 않았다.
