# PF-0 계약 동결·PF-1 로컬 텍스트 처리 실행 보고서

작성일: 2026-09-07  
Repository 시작 SHA: `fb1e1a1eff2ab59ef5e11d62b0bb846e58580699`  
데이터: 합성 fixture 전용

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## Phase Result

```text
Previous:
PF-0 PARTIAL
PF-1 NOT IMPLEMENTED

Target:
PF-0 CONTRACT FROZEN & POSTGRESQL/RLS GATE VERIFIED
PF-1 LOCAL TEXT PRIVACY PROCESSING VALIDATED CANDIDATE

Achieved:
PARTIAL

Qualifier:
SYNTHETIC DATA / LOCAL TEST ENVIRONMENT ONLY
```

PF-0 contract와 PF-1 code path는 구현·단위검증됐지만 PostgreSQL/RLS Gate와 실제 OPF model smoke test가 각각 환경 차단 상태다. 따라서 PF-0 `FROZEN`, PF-1 `VALIDATED CANDIDATE` 또는 전체 PASS로 판정하지 않는다.

## Baseline

| 항목 | 확인 결과 |
| --- | --- |
| branch | `codex/fix-edge-platform-assets` |
| starting HEAD | `fb1e1a1eff2ab59ef5e11d62b0bb846e58580699` |
| working tree | 시작부터 dirty; 기존 사용자 변경 보존, reset/clean/commit/push 없음 |
| Node | `v24.18.0` |
| pnpm | local verified `11.7.0` |
| Python | `3.13.14` |
| Docker | client `29.5.3`; Desktop Linux Engine named pipe 없음 |
| PostgreSQL | Compose target `postgres:16-alpine`; 실행 미검증 |
| OPF | Python package 미설치, `HIPASS_PRIVACY_MODEL_PATH` 미설정 |
| 기존 회귀 | 시작 시 Node 55/55 PASS, 약 0.91초 |

## Contract decisions

| 결정 | 최종 값 | code·schema·ADR 증거 |
| --- | --- | --- |
| purpose allowlist | `RESEARCH`, `TEACHING`, `DEMO`, `AI_LOCAL`; `CLINICAL` 제외 | `src/privacy-contracts.js`, `schemas/privacy-contract.schema.json`, migration 003 |
| approved_use_ref | 서버 registry에서 org/action/artifact/version/purpose/recipient/basis/policy/time을 model 호출 전 일치 검증 | `src/privacy-policy.js`, `config/privacy/approved-uses.synthetic.json` |
| state separation | job/stage/policy/review/release/artifact 독립 enum | contract code·schema·migration, consistency test |
| review binding | artifact ID/version, manifest digest, policy version, purpose, recipient, approved use | schema와 `reviewBindingChanged` 시험 |
| URL/account mapping | additive `URL_IDENTIFIER`, `FINANCIAL_ACCOUNT`; native label 별도 보존 | `docs/privacy/decisions/ADR-PF-001-system-type-mapping.md` |

`approved-uses.synthetic.json` SHA-256는 `1E0303BB7CA5AC6A6BCCA4F43B73579C3B8F015EF676354F642F69F6A60AC0F7`, rule bundle SHA-256는 `2AFE6451D4AF9389E7FEBC37CBE74C388AC7E7219C6E8D55C9DF050D68FC3E66`이다. 두 파일은 합성 로컬 시험 설정이며 운영 승인 record가 아니다.

## Implemented changes

| 변경 | 실제 경로 | 이유와 보안 효과 |
| --- | --- | --- |
| PF contract | `src/privacy-contracts.js`, `schemas/privacy-*.schema.json` | 목적·상태·오류·review/release 조건 혼용 방지 |
| approved-use/rule registry | `src/privacy-policy.js`, `config/privacy/*.json` | body 문자열을 승인으로 신뢰하지 않고 model 호출 전 거부 |
| Unicode/rule/merge/transform | `src/privacy-unicode.js`, `src/privacy-rules.js` | codepoint 위치 검증, 필수 규칙 우선, 역매핑 실패 시 fail closed |
| local adapter | `src/privacy-adapter.js`, `services/privacy-inference/*` | explicit checkpoint, offline env, stdin, timeout, queue 제한, typed error |
| inspection service/API | `src/privacy-service.js`, `src/server.js`, `src/http-utils.js`, `src/auth.js` | internal service 전용, strict UTF-8, byte/token 한도, 원문 fallback 금지 |
| DB contract | `db/migrations/003_privacy_pf0_contract.sql`, `test/sql/privacy_pf0_rls_gate.sql` | 최소 persistence stub, FORCE RLS, PUBLIC 권한 제거, tenant 격리 Gate |
| API contract/ADR | `docs/api/highpass-privacy-internal.openapi.yaml`, ADR-PF-001 | runtime 형식과 mapping 결정을 명시 |
| tests | `test/privacy-filter.test.js`, `test/fixtures/privacy/*` | fake/negative/Unicode/merge/transform/log-safety 자동 검증 |

PF-1은 preview만 반환하며 artifact를 저장하거나 release 승인으로 만들지 않는다. finding이 0개여도 `REVIEW_REQUIRED`, `releaseEligible=false`다. 기존 진료 API는 Privacy Filter 장애와 독립된 기존 인가 경로를 유지한다.

## Gate results

| Gate | 결과 | 증거 |
| --- | --- | --- |
| Docker daemon | ENVIRONMENT BLOCKED | `docker version`: `dockerDesktopLinuxEngine` pipe 없음 |
| PostgreSQL migration | ENVIRONMENT BLOCKED | `privacy-db-gate.ps1` exit 2; 컨테이너 미생성 |
| RLS isolation | NOT RUN / ENVIRONMENT BLOCKED | positive/negative SQL 작성, 실제 PostgreSQL 16 실행 불가 |
| PF contract | PASS (static/unit) | code·JSON Schema·migration enum consistency test |
| adapter | PASS (fake), BLOCKED (actual model) | 정상·빈·malformed output·timeout·queue·load negative 시험 |
| Unicode | PASS | NFC/NFD, emoji, CRLF, zero-width, multiline, prefix, offset mismatch |
| fail-closed | PASS (unit/API) | policy pre-deny, 413/415/422/429/503/504, original fallback 0 |
| Node regression | PASS | 최종 전체 suite에서 기존 55건 유지 + 신규 PF 시험 |
| secret/PII scan | PASS | repository secret scan findings 0; synthetic canary response/exception 0 |
| PF-T subset | PASS (synthetic/non-DB) | PF-T02~T08, PF-T19 canary; 나머지는 NOT RUN |

## Test summary

| 명령·검사 | 종료/결과 |
| --- | --- |
| `node --test` (시작 기준선) | 0, 55 PASS |
| `pnpm run test:privacy` | 0, PF 전용 21/21 PASS |
| `node --test` (구현 후) | 0, 76/76 PASS(기존 55 유지 + 신규 21) |
| `node scripts/security-secret-scan.js` | 0, findings 0 |
| internal API process check | 무인증 readiness 401 `AUTH_REQUIRED`; 인증 readiness 503; inspection 503 |
| `pnpm run privacy:db-gate` | 1; 내부 PowerShell Gate exit 2, `ENVIRONMENT BLOCKED` |
| `pnpm run privacy:model-smoke` | 1; 내부 smoke exit 2, `MODEL_UNAVAILABLE / EXPLICIT_CHECKPOINT_REQUIRED` |
| OPF environment check | `opf_installed=False`, model path 미설정 |

실제 model test는 실행하지 않았다. fake bridge는 adapter contract 검증에만 사용했다. `node --test`가 안내한 live HTTPS E2E와 staging smoke도 이 명령 안에서는 실행되지 않았으며 별도 Docker 환경 검증으로 남는다. 실제 model latency, warm memory, 정확도와 egress는 모두 `NOT MEASURED / NOT RUN`이다. 600건 평가 전에는 정확도 주장을 하지 않는다.

## Remaining blockers

### 1. Docker/PostgreSQL/RLS

- 원인: Docker Desktop Linux Engine named pipe가 존재하지 않아 daemon API 연결 실패.
- 증거: PowerShell DB Gate exit 2(`pnpm` wrapper exit 1)와 `ENVIRONMENT BLOCKED - Docker engine unavailable`.
- 최소 사용자 action: Docker Desktop을 열고 Linux Engine이 기동될 때까지 기다린 후 `docker version`에서 Server 정보를 확인.
- 재검증: `pnpm run privacy:db-gate`.
- 영향: PF-0 PostgreSQL migration/RLS Gate, PF-R11.
- 판정 이유: 작성된 SQL의 정적 일치만으로 실제 PostgreSQL 16·RLS 격리를 PASS 처리할 수 없음.

### 2. 실제 OpenAI Privacy Filter model

- 원인: pinned `opf` package와 권한 있는 local checkpoint가 설치·등록되지 않음.
- 증거: `opf_installed=False`, `HIPASS_PRIVACY_MODEL_PATH=not_configured`, readiness 503.
- 최소 사용자 action: 승인된 networked 환경에서 `services/privacy-inference/requirements.lock` revision을 설치하고 checkpoint를 local read-only 경로에 제공. 모델 파일은 Git에 추가하지 않음.
- 재검증: `HIPASS_PRIVACY_PYTHON`, `HIPASS_PRIVACY_MODEL_PATH`, 필요 시 `HIPASS_PRIVACY_DEVICE=cpu`를 설정하고 `pnpm run privacy:model-smoke` 실행.
- 영향: PF-1 actual model Gate, PF-R01/R02/R14, latency/memory/egress evidence.
- 판정 이유: fake backend 시험은 actual model 결과·성능·artifact integrity의 증거가 아님.

## Final classification

| 단계 | 최종 판정 |
| --- | --- |
| PF-0 | PARTIAL / ENVIRONMENT BLOCKED |
| PF-1 | PARTIAL / CODE IMPLEMENTED / ACTUAL MODEL BLOCKED |
| PF-2 | PARTIAL / NEXT PHASE |
| PF-3 | PARTIAL / OUT OF CURRENT PHASE |
| PF-4 | PARTIAL / OUT OF CURRENT PHASE |
| PF-5 | NOT IMPLEMENTED |
| PF-6 | DEFERRED |

## Next recommended task

한 가지 우선 작업은 Docker Desktop Linux Engine 복구 후 PostgreSQL 16 migration/RLS Gate 재실행이다.

```powershell
docker version
pnpm run privacy:db-gate
```

이 결과가 PASS가 되기 전에는 PF-0을 `FROZEN`으로 변경하지 않는다. commit, push, merge, PR 또는 release는 수행하지 않았다.
