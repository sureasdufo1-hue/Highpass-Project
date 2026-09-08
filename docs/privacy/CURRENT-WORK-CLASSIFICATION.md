# Privacy Filter 현재 작업 분류

기준일: 2026-09-07  
대상: Highpass 저장소 현재 작업 트리  
판정값: `PASS`, `PARTIAL`, `NOT IMPLEMENTED`, `NOT VERIFIED`, `ENVIRONMENT BLOCKED`, `DEFERRED`

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. 현재 상태 요약

PF-0의 목적·상태·승인 binding·label mapping 계약은 code, JSON Schema, PostgreSQL migration, ADR 및 일치 시험으로 구현했다. PF-1은 서버 등록 `approved_use_ref` 검증, local-only OPF adapter, 한국어 필수 규칙, Unicode codepoint 역매핑, finding merge, 결정적 변환, 임상 표현 보호, 내부 API와 fail-closed 오류 처리를 구현했다.

다만 Docker Desktop Linux Engine이 응답하지 않아 PostgreSQL 16 migration/RLS Gate를 실행하지 못했다. `opf` Python package와 명시적 local checkpoint도 없어 실제 모델 smoke test는 실행하지 못했다. 따라서 fake bridge와 합성 자료 시험 성공을 실제 모델 실행이나 PF-0/PF-1 완료로 과장하지 않는다.

## 2. 단계별 분류

| 단계 | 현재 판정 | 확인된 자산 | 남은 종료 조건 |
| --- | --- | --- | --- |
| PF-0 계약 동결 | PARTIAL / ENVIRONMENT BLOCKED | enum·schema·migration·ADR·contract consistency test PASS | Docker PostgreSQL 16 migration 재적용과 RLS positive/negative Gate PASS |
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
| PostgreSQL migration/RLS | ENVIRONMENT BLOCKED | Gate script exit 2(`pnpm` wrapper exit 1), Docker engine named pipe 부재 |
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
| PF-R11 기관 격리 | PARTIAL / ENVIRONMENT BLOCKED | RLS migration·test 작성, 실제 PostgreSQL Gate 미실행 |
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
| `pnpm run privacy:db-gate` | ENVIRONMENT BLOCKED | wrapper exit 1, inner Gate exit 2, Docker engine unavailable |
| 실제 OPF smoke/latency/memory | ENVIRONMENT BLOCKED / NOT RUN | smoke runner가 explicit checkpoint 부재로 exit 2; 실제 inference·성능 미측정 |
| PF-T02~T08, T19 canary | PASS (synthetic/non-DB subset) | 실제 모델·DB·release 검증으로 확대 해석 금지 |
| PF-T01, T09~T18, T20 | NOT RUN | 해당 구성요소 또는 실제 환경 미준비 |

## 6. 다음 한 작업

Docker Desktop에서 Linux Engine이 정상 기동되어 `docker version`이 Client와 Server를 모두 반환하게 한 뒤 아래 Gate를 재실행한다.

```powershell
pnpm run privacy:db-gate
```

이 Gate가 PASS해야 PF-0을 `FROZEN`으로 올릴 수 있다. 그 다음 별도 승인된 환경에서 pinned OPF dependency와 checkpoint를 준비하고 실제 model smoke test를 수행한다.

상세 실행 증거와 차단 해제 절차는 [PF0-PF1 실행 보고서](PF0-PF1-EXECUTION-REPORT.md)를 따른다. commit, push, merge는 수행하지 않았다.
