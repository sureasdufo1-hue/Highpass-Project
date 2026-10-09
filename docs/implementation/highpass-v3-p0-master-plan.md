# Highpass v3 P0 Implementation Master Plan

## 현재 실행 방식 — 2026-10-09

발표 환경의 상태 권위 위치는 [통합 상태의 현재 절](mediq-presentation-integration-status-2026-10-09.md)이다. 다음 모듈 추가보다 최신 배포에서 모바일 동의→실제 의료진 접수→DICOM Viewer→감사→철회/만료 차단을 하나의 작업 단위로 검증한다. 아래 이전 next/미구현 설명은 당시 기록으로 보존한다. 이 순서 변경은 승인된 전체 P0·다중 Study·STOW·Provenance 완료 조건을 축소하지 않는다.

## MediQ 종료·기록 계승 — 2026-10-08

[계승 자료집](../inherited/mediq/README.md)에 실패 회고, 제한된 성공·실패 증거와 P0-07~12 연결 후보를 등록했습니다.
이것은 기록 병합이며 기존 package의 상태·범위·Gate·사람 검토를 변경하지 않습니다.
중복 framework/schema를 도입하지 않고 기존 v3 구성요소와 실행 경로 연결을 우선합니다.
MediQ의 partial/native HTTP/backend PASS를 하이패스 runtime 또는 전체 P0 PASS로 승계하지 않습니다.

기준일: 2026-10-07 / 입력 SHA: `59dff9d` / 분류: CAPSTONE-P0
실행 지시: 사용자의 “권장 진행 순서에 따라 진행한다”를 근거로 순차 실행한다. 이는 법률·임상·운영 승인과 별개다.
기준: [Integrated review](../governance/highpass-v3-integrated-review-2026-10-07.md), [Acceptance Criteria](../acceptance/highpass-v3-acceptance-criteria.md), [Architecture](../architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md).

## Work packages

2026-10-08 preparation secure edge follow-up: actual complete isolated HTTPS proxy/
mTLS/backend/nonowner PG305 checks PASS with opaque request-bound network context.
This closes transport provenance rechecking only, not durable network audit, human
PoP, clinical approval or deployment. [Latest report](../governance/highpass-v3-p0-06-pending-network-provenance-2026-10-08.md);
[next atomic network-audit gate](highpass-v3-p0-06-pending-network-audit-persistence-prompt.md).

2026-10-08 [PENDING authority/write contract](../api/highpass-v3-consent-pending-authority-contract.md):
purpose-built consent:write DB projection and separate immutable staging/audit/ledger,
dedicated policy capability and PA-01..09 verification plan. No implemented persistence
or policy approval is claimed. Next [isolated persistence prompt](highpass-v3-p0-06-pending-persistence-prompt.md)
starts with structural/fresh/replay timing before schema/service tests.

2026-10-08 P0-06 [PENDING input contract](../api/highpass-v3-consent-pending-contract.md):
pure source-bound fixed-PENDING intent with shared action/resource normalization,
subset/time validation and UNVERIFIED submitted evidence. No DB artifact, approval,
membership/Grant or route. Next authoritative Session read/persistence contract remains
a separate gate; D1..D6 and full P0-04..06 completion are not bypassed.

2026-10-08 lifecycle dependency gate: [contract](../api/highpass-v3-lifecycle-dependency-contract.md)
aligns P0-04 own-ref foundation -> P0-05 source Session -> P0-06 patient approval ->
recipient acceptance/link authority -> return to P0-04 destination Mapping/review ->
P0-05/06 complete lifecycle/Decision/Grant. All three packages remain IN PROGRESS.
D1..D6 require explicit decisions before permission-bearing activation; next safe
work is [non-authorizing PENDING contract foundation](highpass-v3-p0-06-pending-contract-prompt.md).

2026-10-08 [original receipt/retry update](../governance/highpass-v3-p0-05-original-receipt-2026-10-08.md):
typed original ledger reconstruction, DB-clock fresh creation validation and elapsed
retry denial audit; 197 isolated PG/loopback checks PASS. P0-05 remains IN PROGRESS;
broader clinical state/membership/Consent/Grant and deployed runtime gates are pending.
Next [dependency alignment prompt](highpass-v3-p0-05-lifecycle-dependency-prompt.md).

Latest [P0-05 persisted expiry](../governance/highpass-v3-p0-05-expiry-transaction-2026-10-07.md):
017 dedicated nonowner maintenance pool, DB-time EXPIRED event/audit/durable cascade
request; 189 independent PG/loopback checks and 349 Node PASS. Evidence DRAFT/UNASSIGNED.
P0-05 remains IN PROGRESS: original receipt lifecycle, graceful drain, complete clinical
state dependencies, cascade delivery and runtime gates remain. No legacy approval inherited.
Next [receipt/drain prompt](highpass-v3-p0-05-receipt-drain-prompt.md) preserves the full target.

최신 [P0-05 internal Session create](../governance/highpass-v3-p0-05-session-create-2026-10-07.md):
012 비소유자 환자/제공기관 생성, 동시 멱등 재시도와 lost ACK 검증 포함 108 PG checks PASS.
수신자는 INVITED, 실제 서버/HTTP는 미활성화. 조회 감사·state/cancel·동의·기관 간 연결은 남아 있다.

추가 최신 [P0-05 Session schema 결과](../governance/highpass-v3-p0-05-session-schema-2026-10-07.md):
011 독립 PG 32 checks PASS; app write 정책·repository·HTTP는 아직 없고 수신자는 INVITED다.
Session 생성 완료가 아닌 schema/nonowner 조회 RLS 단계다. 기존 DB에는 적용하지 않았다.

최신 Session 입력 검증 결과는 [P0-05 contract gate](../governance/highpass-v3-p0-05-session-contract-2026-10-07.md)를 따른다.
전체 Node 325 PASS, Session DB/참여자/동의/공유 승인은 미구현이다.
[기관 간 의존성 계약](../api/highpass-v3-cross-institution-identity-contract.md)에 따라
P0-04 cross-institution 종료 전 필요한 P0-05/06 foundation을 먼저 정렬한다.
이는 P0-04 완료조건 삭제·축소 또는 공유 권한 확대가 아니다.

최신 후속: [Mapping write HTTP 결과](../governance/highpass-v3-p0-04-write-http-2026-10-07.md).
독립 PG/loopback HTTP 90 checks PASS; reconcile/review 어댑터를 추가했으나
기존 서버 활성화·HTTPS/mTLS·기관 간 PatientRef 승인/membership는 미완료다.
신규 증적 DRAFT/UNASSIGNED, P0-04 IN PROGRESS. 이전 legacy 사람 승인 승계 없음.

2026-10-07 후속: 독립 합성 Compose harness, Node 24/Debian 13 runtime 패치,
legacy HTTPS/mTLS 및 Security Gate 재검증을 진행했다.
[최신 실행 증적 요약](../governance/highpass-v3-p0-execution-2026-10-07.md#후속-실행-독립-합성-환경--런타임-패치--재검증)을 우선 확인한다.
후속 DPoP/ingress 강제 구현과 내장 Viewer Chrome 증적은
[최신 후속 기록](../governance/highpass-v3-p0-execution-2026-10-07.md#최신-후속-postgresql-영속-replay-및-재시작장애-검증)을 우선한다.
legacy PostgreSQL 공유 replay를 추가했다. 실제 재시작/다중 검증 프로세스/장애·복구 결과는
최신 실행 기록을 따른다. 이번 legacy 기술 검증 범위의 사용자 제공 독립 사람 검토는
김범희 / 2026-10-07 / PASS / 예외·의견 없음으로 등록했다. 전체 API HA 및 신규 v3 Grant 완료는 아니다.
이후 지속 실행 지시에 따라 [P0-04 실행 프롬프트](highpass-v3-p0-04-execution-prompt.md)를
작성하고 Identity 스키마·독립 PostgreSQL dry-run을 착수했다.
서비스/API 및 전체 P0-04 완료는 아니다. [실행 결과](../governance/highpass-v3-p0-04-schema-2026-10-07.md)를 따른다.
후속 식별자 보호·principal registry·JWT 타입 보완의
[최신 결과](../governance/highpass-v3-p0-04-identity-security-2026-10-07.md)를 우선한다.
최신 auth 코드 회귀는 PASS지만 기존 r3 이미지/사람 검토를 승계하지 않으며 재빌드·live gate는 미검증이다.
후속 트랜잭션 및 metadata GET의 [최신 결과](../governance/highpass-v3-p0-04-transactions-metadata-2026-10-07.md)는
독립 PG/loopback HTTP 33 checks와 전체 Node 300 PASS다. 기존 서버에는 활성화하지 않았고 새 변경 사람 검토는 UNASSIGNED다.
다음 [write 계약 프롬프트](highpass-v3-p0-04-write-contract-prompt.md)를 작성·실행해
review 목표 API와 write/review 입력 validator를 추가했다. [계약](../api/highpass-v3-mapping-write-contract.md)에
남은 PatientRef bootstrap/등록 actor/원자적 상태 전이/idempotency 구현 조건을 명시했다.
입력 검증은 실제 DB 상태 변경 완료를 뜻하지 않는다.
[write 계약 실행 결과](../governance/highpass-v3-p0-04-write-contract-2026-10-07.md):
관련 31개 및 최신 전체 Node 305개 PASS. DB 전이·write HTTP·idempotency는 미완료다.
후속 [PatientRef 등록 프롬프트](highpass-v3-p0-04-patient-ref-prompt.md)를 작성·실행했다.
008 소유권/RLS와 내부 등록+감사 서비스의 [검증 결과](../governance/highpass-v3-p0-04-patient-ref-2026-10-07.md)는
독립 PG/metadata HTTP 42 checks PASS다. 전체 회귀 결과는 이 최신 기록을 우선한다.
reconcile/review/idempotency/서버 활성화는 계속 미완료다.
후속 [durable idempotency 프롬프트](highpass-v3-p0-04-idempotency-prompt.md)를 실행해
PatientRef registerIdempotent와 scoped ledger를 구현했다. [최신 결과](../governance/highpass-v3-p0-04-idempotency-2026-10-07.md)는
독립 PG 54 checks PASS다. Mapping reconcile/review와 write HTTP는 아직 미완료다.
이후 [Mapping 전이 프롬프트](highpass-v3-p0-04-mapping-state-prompt.md)를 실행했다.
[최신 결과](../governance/highpass-v3-p0-04-mapping-state-2026-10-07.md)는 own-ref 내부 생성·검토,
maker/checker·5 states·원자적 감사·durable retries의 PG 73 checks 및 Node 316 PASS다.
write HTTP/cross-institution ref 연결/runtime gate는 미완료다.

| Order / ID | Deliverable and change boundary | Dependency | Exit gate / rollback |
|---|---|---|---|
| 1 / P0-00 | Integrated review, acceptance catalog, traceability and plan | existing aligned docs | exact IDs and contract review; preserve historical evidence |
| 2 / P0-01 | Mobile principal binding, archive/imaging ACL, viewer denial, simulation claims, key config, TLS/timeout/static routing | P0-00 | FIX-001~005/007 targeted tests; retain legacy contract except unsafe claims |
| 3 / P0-02 | Isolated test harness, synthetic-only fixtures, classified Network Gate, DPoP/ingress integration | P0-01 | FIX-006/009~011, current unit suite; no automatic clinical data import |
| 4 / P0-03 | Rebuild application image and attest mounted/runtime files; Compose readiness; latest legacy E2E | P0-01/02 | FIX-008, HTTPS/mTLS/network/gates; preserve DB volumes and old image digest |
| 5 / P0-04 | Add tenant/patientRef/mapping schema, strict service+API, synthetic migration dry-run+RLS | P0-03 | ID/TEN cases; additive tables, no drop/backfill of unverified clinical refs |
| 6 / P0-05 | ExchangeSession aggregate/participants/scope/state machine/idempotency | P0-04 | EX cases; legacy adapters behind feature flag |
| 7 / P0-06 | ConsentArtifact versions, AuthorizationDecision, scoped TransferGrant | P0-05 | CON/AUTH/GRT cases; dual legacy/v3 validation and revoke cascade |
| 8 / P0-07 | Multi-Study route-neutral package/encrypted manifest/chunks/temp-copy lifecycle | P0-06 | PKG/CLOUD cases; encrypted store outside Control DB, bounded TTL |
| 9 / P0-08 | Capability registry, deterministic route engine, immutable preflight | P0-06/07 | ROUTE/PRE/CONN cases; probes do not move payload |
| 10 / P0-09 | B Test Orthanc STOW connector, object receipt/readback/idempotent partial import | P0-08 | ACC-005/006; no direct browser PACS or file-simulator substitute |
| 11 / P0-10 | Real scoped Viewer/download and lifecycle UI integration | P0-06/08 | ACC-001~004/NFR-004/006; old viewer remains compatibility path |
| 12 / P0-11 | Per-package Provenance/hash/semantic evidence and full audit/correlation | P0-09/10 | PROV/AUD cases; append-only evidence, no fabricated destination verification |
| 13 / P0-12 | Full synthetic v3 E2E, security gates, current manifest, runbook and independent review packet | all previous | all applicable P0 acceptance PASS or explicit remaining statuses |

## API and schema implementation rules

- Keep existing APIs and tables until parity and rollback rehearsal. No new v3 migration is applied directly to existing data without dry-run.
- Resolve review clarifications in target API/ERD before implementation: consent response completeness, Grant retry, preflight inventory, per-package provenance.
- Actor/tenant/hospital come from authenticated principal and registry; request fields must match them.
- Identity/consent/grant/tenant/integrity failures stop before payload movement. Source technical errors must remain errors.
- Test crypto uses injected random keys. Missing runtime secrets fail startup or the relevant operation; no deterministic derivation fallback.
- Build an immutable application image with runtime source attestation. NODE/toolchain lock remains consistent and signature/TLS checks remain enabled.
- Rebuild only this project's application services. Preserve existing database/Orthanc volumes, unrelated `mediq-*` and `soc-*` stacks. No down -v, system prune or blanket process termination.

## Verification commands

Use targeted `node --test <affected tests>` before `node --test`. Then `node scripts/operations-expiry-check.js`, cert fixture/rollback, HTTPS E2E, mTLS and corrected Network Gate; dependency and fresh container gate; `mvp:verify` and manifest verification under the exact Compose project/network/port configuration.

Each command is bounded and its actual exit code recorded. Build/registry problems are ENVIRONMENT BLOCKED. Current HEAD tests and container health cannot stand in for runtime source parity or actual DICOM transaction evidence.

## Execution status

| Package | Status | Evidence |
|---|---|---|
| P0-00 | COMPLETE — TECHNICAL DOCUMENT GATE | OpenAPI refs valid; all 70 trace candidates covered by 81 acceptance cases; no human/legal approval inferred |
| P0-01 | PARTIAL — IMPLEMENTED AND TESTED | patient binding, archive ACL, viewer fail-closed, honest simulator claims, required KEK, source failure handling, synthetic-only default; legacy DPoP follow-up in P0-02; real STOW/new v3 enforcement remain pending |
| P0-02 | PARTIAL — LOCAL ENFORCEMENT | legacy bound-token + strict DPoP/ingress + PostgreSQL shared replay; latest evidence controls restart/failure verdicts; full API HA/v3 Grant pending |
| P0-03 | SCOPED HUMAN REVIEW PASS — OVERALL V3 GATE PARTIAL | user-provided 김범희 / 2026-10-07 / PASS / no exceptions; exact r3 image and manifest bound in execution record; old failures retained; full API HA/new v3 Grant and outstanding v3 acceptance are not approved or completed |
| P0-04 | IN PROGRESS — OWN-REF MAPPING HTTP TESTED | latest independent PG/mapping HTTP 90 checks; Node 320 PASS at write-HTTP gate; failed intermediate evidence retained; cross-institution linking/live image still NOT VERIFIED; no existing runtime migration |
| P0-05 | IN PROGRESS — CANCEL + EXPIRY IDENTITY VERIFIED | 174 isolated checks + Node347 PASS; 016 dedicated expiry purpose/scope and clinical isolation; persisted expiry/worker, full receipt lifecycle, actual cascade delivery and clinical transitions pending; recipient remains INVITED; runtime not activated; does not close P0-04 |
| P0-06 | IN PROGRESS — ACTUAL ISOLATED HTTP/HTTPS-TO-PG |018..020/internal preparation; PG283 adds real handler/registry/PG HTTP and TLS-server HTTPS, status/storage/input/TLS negatives and public-cert hashes. No runtime route; ingress/client mTLS/PoP/MFA and clinical approval remain. DRAFT/UNASSIGNED; not full MVP/v3 |
| P0-07~12 | NOT STARTED | v3 authorization and all downstream gates remain; local handlers are not a deployed `/api/v3` implementation |

2026-10-08 최신 P0-06 후속: [다중 Session/기관/expiry 경합](../governance/highpass-v3-multisession-contention-execution-2026-10-08.md)은
초기 동의 artifact PG를 169개로 확대했다. approval/cancel 및 전용 Session expiry의
실제 nonowner 경합 증적이며 전체 D6/Consent WITHDRAWN·EXPIRED·content replacement,
공개 evidence read/최소 admin view와 P0-07~12는 아직 미완료다. 신규 증적은 DRAFT /
UNASSIGNED; 다음은 기존 실제 create/PENDING 경합이다. 이전 gate 결과는 보존한다.

No commit/push/merge/PR is performed without a current explicit instruction. The user-provided scoped human review is registered in the execution record; generated evidence remains DRAFT / UNASSIGNED and technical changes remain reviewable as a local diff. This review is not a whole-MVP/v3 or production approval.

### P0-06 follow-up — 2026-10-08 pre-auth observation

Latest [observation record](../governance/highpass-v3-p0-06-preauth-observation-2026-10-08.md)
has 338 exact-source isolated transaction checks PASS plus actual TLS-to-test-sink
success/failure/timeout/overflow checks. This does not complete pre-auth durable
audit, actual IdP/human PoP, clinical decisions or P0-07~12. Earlier timeout remains
NOT VERIFIED with root cause open; no timeout/security policy was weakened.
Next [isolated storage execution prompt](highpass-v3-p0-06-preauth-storage-isolated-prompt.md)
has been written/read and migration/role convention inspection started. Its
schema/privilege implementation and actual storage acceptance remain pending.

### P0-06 follow-up — isolated actorless storage

[Migration022 storage record](../governance/highpass-v3-p0-06-preauth-storage-2026-10-08.md)
supersedes that pending schema status: 362 current-source isolated checks PASS,
including publisher/reader separation and append-only constraints; Node408 PASS.
No existing runtime migration or login enrollment. The
[durable adapter prompt](highpass-v3-p0-06-preauth-durable-adapter-prompt.md) has
been read/executed through contract analysis: acknowledgement uncertainty and
same-event reconciliation design are drafted, not implemented or approved for
production. Actual TLS-to-durable-PG delivery, hash chain/SIEM and downstream v3
gates remain incomplete; evidence DRAFT/UNASSIGNED, overall MVP/v3 IN PROGRESS.

### P0-06 follow-up — durable adapter / full-regression latency

[Durable execution record](../governance/highpass-v3-p0-06-preauth-durable-2026-10-08.md):
observer-owned input, separate publisher/reconciler, exact confirmation and actual
TLS-to-owned-PG tests passed. Node413 PASS. Latest actual full transaction command
is NOT VERIFIED, not PASS: existing maximum Session timeout persists, with late201
after approximately4982 ms post-body processing. All original gates/deadlines
remain; new independent checks run first without skipping the failing legacy gate.
[Latency diagnostic prompt](highpass-v3-session-maximum-latency-prompt.md) is written,
read and source/evidence inspection started before the remaining pre-auth fault
matrix. No runtime activation, production reader/retention approval or full-v3
completion claim. Fresh evidence DRAFT/UNASSIGNED; prior failures preserved.

### P0-06 follow-up — fixed diagnostics and actual adversarial checks

[SQL profile](../governance/highpass-v3-session-maximum-profile-2026-10-08.md)
adds bounded safe phase timing without changing runtime constraints/deadlines.
Latest [actual adversarial record](../governance/highpass-v3-p0-06-preauth-adversarial-2026-10-08.md)
has 382 isolated checks PASS, Node413 PASS and matching manifest/source hashes.
Current maximum Session completes within deadline, but earlier intermittent
timeout root cause is still unresolved, not declared fixed. Actual same-UUID
conflict, borrowed transaction/mixed roles and TLS publisher/reader grant faults
pass. Actual slow/disconnected sink/flood, real-clock expiry and HTTP publication
are pending. The next outage/HTTP prompt is written/read and contract alignment
started; no production, independent-review or full MVP/v3 completion inference.

### P0-06 follow-up — actual timeout/termination and admission expiry

[Outage gate record](../governance/highpass-v3-p0-06-preauth-outages-2026-10-08.md)
has 394 current-source isolated checks PASS, Node413 PASS and matching manifest/
source hashes. Actual witnessed blocked INSERT, backend termination, TLS burst
OVERFLOW and responsive synthetic health are verified; dispatched failures stay
OUTCOME_UNKNOWN. Row absence is established only after explicit owned backend
termination, not presumed from timeout. Real ten-second expiry prevents pool
access. Next paired HTTP observer binding prompt is written/read and authority/
stage contract analysis started; HTTP publication and long-outage reconciliation
are not implemented. Existing Session latency cause, organizational decisions,
actual IdP/PoP and overall MVP/v3 remain unresolved; no runtime deployment.

### P0-06 follow-up — paired HTTP pre-auth observation

[Binding execution record](../governance/highpass-v3-p0-06-preauth-http-binding-2026-10-08.md)
records optional branded emitter implementation and409 current-source isolated
checks PASS. Ten sequential HTTPS denials durably stored; real publisher privilege
fault preserves403 and explicit NOT_RECORDED. First unpaced storage-cardinality
FAIL is retained. Default behavior, authority pairing and disposed/slow emitter
remain fail closed. Full Node result belongs in the execution record. Next actual
HTTP PG outage/recovery prompt is written/read and source analysis started; that
matrix remains unverified. No runtime deployment, independent approval or overall
MVP/v3 completion claim; new evidence DRAFT/UNASSIGNED.

### P0-06 follow-up — HTTP outage and core lifecycle decision readiness

[Actual HTTP outage record](../governance/highpass-v3-p0-06-preauth-http-outages-2026-10-08.md):
427 current-source isolated checks PASS; Node417 PASS. Actual blocked publisher,
timeout/termination uncertainty, finite burst OVERFLOW, recovery and disposed emitter
retain403 with no clinical side effects. Frontend synthetic health is not clinical
readiness/HA. No runtime deployment or whole-MVP completion.
[Next decision prompt](highpass-v3-p0-06-decision-readiness-prompt.md) is written/read
and [D1..D6 decision draft](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md)
prepared. The next work returns to patient approval/recipient acceptance/Grant,
not further observability expansion as a substitute. Exact human policy choices,
full API/data detail review and technical lock DAG verification remain pending.

### P0-06 follow-up — existing lock graph and target consent conflicts

[D6 static audit](../governance/highpass-v3-lock-contract-audit-2026-10-08.md)
records exact source hashes and create/replay/pending/cancel/expiry/mapping lock
statement order. Opposite share-compatible orders are not proven deadlocks; new
mutation/link/suspension paths and COMMIT-time FK/trigger locks require actual
concurrency evidence. Consent state/content version and untrusted actor fields
need reviewed additive contracts. No runtime/DDL authority change was made.
D1..D5 choices remain NOT APPROVED, D6 NOT VERIFIED. Next permission-bearing
implementation needs exact policy decisions, not inherited synthetic approval.

### P0-06 follow-up — user adoption / patient command implementation

김범희2026-10-08 adopted D1..D4 proposals, D5 artifact-first sequence and D6 actual
contention verification in the [decision packet](../governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md).
This supersedes previous policy approval blocking, not technical/independent PASS.
[Command execution record](../governance/highpass-v3-patient-consent-command-2026-10-08.md)
documents pure patient-only command/signed synthetic reauth implementation and
scoped checks, including retained initial DPoP regression and PG-start failures.
Next ceremony/persistence prompt is written/read and patient projection RLS
analysis started. Persisted approval and full Consent/Decision/Grant lifecycle
remain incomplete; D6 still NOT VERIFIED. No deployed runtime authority changes.

### P0-06 follow-up — patient ceremony schema foundation

[Ceremony schema execution](../governance/highpass-v3-patient-ceremony-schema-2026-10-08.md)
records ADR before additive023, immutable patient-bound challenge/exact creation
audit and distinct default-deny approval capability. Owned PG39 checks PASS,
including rollback, foreign patient/context, clause/digest/window, immutability and
exact cleanup; full Node423 PASS. Retain initial cleanup-uncertain evidence and
existing PG-start failure. This is storage foundation, not verified challenge
issuance, approval, one-time consumption, D6 or full MVP completion.
Next [patient-only projection prompt](highpass-v3-p0-06-patient-projection-prompt.md)
is written/read and source RLS analysis started. Runtime DB/routes stay unchanged.
Existing full PG regression twice failed before assertions on Docker start ACK;
current result remains NOT VERIFIED. Resolve bounded owned startup diagnostics
before the next admitted service gate; older427 PASS is not current revalidation.

### P0-06 follow-up — startup recovery and patient READ/LOCK RLS

[Current startup recovery](../governance/highpass-v3-docker-start-recovery-2026-10-08.md)
records actual three-profile SQL/cleanup, Node430 and current existing PG427 PASS.
This clears the functional regression barrier; underlying Docker latency remains
unresolved and earlier failures are preserved.024
[patient RLS gate](../governance/highpass-v3-patient-approval-rls-2026-10-08.md) proves62
isolated schema/default-deny/patient-only minimum-column READ/LOCK checks. There
is no patient ceremony INSERT or runtime activation. Next guarded projection
prompt is written/read; JS helper, reauth and live eligibility remain incomplete.

### P0-06 follow-up — guarded patient projection

[Guarded projection execution](../governance/highpass-v3-patient-guarded-projection-2026-10-08.md)
implements private PATIENT/synthetic reauth, dedicated before-RLS pool guard and
same-live-transaction frozen projection. Node437 and existing PG427 PASS; current
patient schema/helper75 PASS with exact owned cleanup, cancellation/expiry and lock
waits. Preserve initial fixture/oracle failures. This is not public read audit,
challenge issuance, approval/Grant or D6 full races. Next
[challenge issuance prompt](highpass-v3-p0-06-patient-challenge-issuance-prompt.md)
requires nonce/idempotency/lost-ACK contract before new authority/persistence.

### P0-06 follow-up — hash-only patient challenge issuance

[Issuance execution](../governance/highpass-v3-patient-challenge-issuance-2026-10-08.md)
adds025 and internal patient service: exact challenge/audit/receipt,32-byte CSPRNG
hash-only nonce, post-COMMIT-only raw response, explicit nonce-unavailable retry,
same-key concurrent serialization and lost-ACK recovery. Actual PG98, Node443 and
existing PG427 PASS with owned cleanup/current hashes; initial42P08 failures retained.
No runtime endpoint, approved Consent or Grant. Next
[decision persistence prompt](highpass-v3-p0-06-patient-consent-decision-persistence-prompt.md)
is written/read and pre-DDL content/event/consumption design alignment started.
Full Consent lifecycle, D6, HTTPS/UI/recipient/Decision/Grant/MVP remain incomplete.

### P0-06 — Consent lifecycle policy adoption and pure withdrawal command

김범희 adopted [L1~L5](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md)
on 2026-10-08 by direct user reply. ADR/API/ERD/requirements/traceability/acceptance are
aligned without declaring technical approval. The separate
[withdrawal command gate](highpass-v3-p0-06-withdraw-command-prompt.md) validates
private PATIENT/consent:withdraw provenance and fresh synthetic reauth only.
DB ownership/current lifecycle, event3/audit/receipt/cascade and public API remain
unimplemented; no runtime enrollment/migration. Evidence DRAFT / UNASSIGNED.

### P0-06 — additive terminal schema and private withdrawal projection

[Actual execution](../governance/highpass-v3-consent-lifecycle-ddl-execution-2026-10-08.md):
027 event3/audit/results/REQUESTED cascade is PARTIAL ISOLATED IMPLEMENTATION,
latest PG208/208 and scoped Node13/13 PASS. Private signed patient withdrawal-only
factory/live projection also has actual PG evidence. Original initial events/receipt
unchanged; no runtime migration/enrollment. Atomic withdrawal/expiry services,
cryptographic original receipt recovery, complete race/read/Grant/HTTPS gates remain incomplete.

### P0-06 — internal atomic withdrawal and immutable retry/denial audit

[Actual service execution](../governance/highpass-v3-consent-withdraw-service-execution-2026-10-08.md):
027 terminal assembly + additive028 outcomes, scoped PG226/226/Node19/19 PASS.
Serial full Node483/483 PASS; technical evidence remains DRAFT / UNASSIGNED.
Private withdrawal factory/service separates current ownership/registry checks, historical
original receipt recovery and new live admission; raw keys/tokens not persisted.
COMMIT lost-ACK, atomic rollback/deadline and locale invariance have isolated evidence.
Still PARTIAL: full registered isolation/race matrix, expiry worker, public read and
clinical authority/Grant/HTTPS remain incomplete. No runtime enrollment/migration.

[Registered withdrawal isolation follow-up](../governance/highpass-v3-withdrawal-isolation-execution-2026-10-08.md):
scoped PG238/238 and serial Node483/483 PASS. Three actual signed synthetic patients and
six ordered foreign pairs prove own-positive and cross-read/write/retry isolation only.
Next: actual parent/target independence and witnessed source/principal/ref races;
withdraw-expiry races, private expiry worker and minimum audited read remain separate.

Follow-up actual PG246/246 additionally verifies actual parent cancel/target suspension
independence and exact backend lock witnesses in both directions of source/principal
suspension and own-ref deletion. Institutional changes are owned SQL fixtures; no
runtime institutional API or complete D6 proof is claimed. Next: withdrawal/expiry contention.

[SQL expiry contention execution](../governance/highpass-v3-withdraw-expiry-contention-execution-2026-10-08.md):
PG252/252 and latest serial Node483/483 PASS. Actual signed withdrawal competes with registered
nonowner SQL maintenance on the common advisory domain. Expiry's terminal observation does
not expose patient audit/results/cascade or permit copying writes. Generic-plan COMMIT guard
failure fixed without broadening patient_refs privileges; all FAIL snapshots retained.
Next prompt: CONSENT_EXPIRY Node registration/private command, then guarded factory/worker.
Public audited minimum read, authority/Grant/HTTPS/Viewer and whole v3 remain incomplete.

[CONSENT_EXPIRY registry/private command execution](../governance/highpass-v3-consent-expiry-principal-execution-2026-10-08.md):
Node/DB purpose+sole scope alignment and private binding-bound bounded command implemented.
Current PG256/256 and serial Node493/493 PASS; signed generic DB-context/source/principal
checks and no patient_refs/clinical/approval/Session-expiry inheritance are verified.
This is not the dedicated expiry factory/event worker. Next factory prompt was written,
read and started through source analysis. No public API/runtime enrollment or Git publication.

### P0-06 — dedicated consent expiry transaction boundary

[Factory execution](../governance/highpass-v3-consent-expiry-factory-execution-2026-10-08.md):
private signed binding/command admission, expiry-only nonowner guard, exact persisted source
registry checks, callback lifetime, UTC/ISO and finite budgets implemented. Actual PG261/261
and serial Node502/502 PASS; sourceUnchanged/owned cleanup/manifest integrity PASS.
No patient_refs privilege or runtime enrollment/migration. DRAFT/UNASSIGNED.
Factory success is not expiry event service/worker or clinical authority. Next
[service prompt](highpass-v3-p0-06-consent-expiry-service-prompt.md) was written/read and
DDL/withdrawal/contention source analysis started. Event service/races/ACK/drain,
minimum audited read and Decision/Grant/HTTPS/Viewer/full v3 remain incomplete.

### P0-06 — authenticated finite consent expiry batch

[Service execution](../governance/highpass-v3-consent-expiry-service-execution-2026-10-08.md):
additive029 durable empty/nonempty batch receipts, actor/source HMAC digests and actual
private expiry event3/audit/result/REQUESTED cascade implemented. Original approval
unchanged; actual committed lost ACK/recovery, same-key concurrency, missing-assembly
rollback and two-way withdrawal/expiry service lock witnesses verified. PG272/272,
serial Node506/506 PASS; sourceUnchanged/owned cleanup/manifest integrity PASS.
DRAFT/UNASSIGNED. Close/drain, retry invocation audit, new ledger full isolation and
multi-object bounds remain pending. Next drain/review prompt was written/read and
key-lifetime analysis started. No scheduler/runtime migration/credentials/Git publication.
Minimum audited read/Decision/Grant/downstream access/HTTPS/Viewer/full v3 remain incomplete.

### 2026-10-08 — presentation-first Azure execution track

User priority: synthetic hospital A/B VM demo on 2026-10-15, actual Azure Key Vault
encryption, Azure for Students subscription reported active; total declared cost
ceiling USD100. Subscription identity, remaining credit and regional quota are NOT VERIFIED.
This track does not cancel approved v3 requirements or certify full v3 completion.

Execution order:

1. P0: explicit subscription/read-only Azure CLI checks; confirm remaining credit,
   deployment region/VM quotas, cost estimate and alerts before creating resources.
2. P0: real Key Vault versioned RSA-OAEP-256 wrap/unwrap at the Data Plane boundary;
   reuse AES-256-GCM package encryption. Do not equate the test rewrap adapter with
   real Azure. Control API receives references only, never raw DEK. Gateway must
   revalidate current consent/authority before unwrap; no public ungated unwrap API.
3. P0: distinct A/B simulated hospital VMs and cloud control services; retain original
   images at A, enforce TLS/mTLS and deny direct Orthanc access. Verify managed identity
   minimum permissions and cross-VM connectivity before synthetic data transfer.
4. P0: sender consent/scope -> encrypted transfer -> approved B Viewer -> audit ->
   revoke/expire denial, with actual cloud and browser evidence, not local substitutes.
5. P0: negative cases, Key Vault outage/permission denial, tampered ciphertext,
   timeout, token leakage checks; cloud evidence remains DRAFT / UNASSIGNED.
6. P0: repeatable runbook, timed rehearsal, local contingency explicitly labelled
   LOCAL ONLY, resource stop/cleanup and final cost inspection after presentation.

The consent expiry drain/retry-isolation follow-up remains pending on the v3 track;
it is not falsely declared complete or automatically put ahead of this demo track.
Real legal/certification/hospital approval remain deferred, not waived or PASS.

Read-only command: `node scripts/azure-demo-preflight.js` (also `pnpm run azure:preflight`).
Set `HIPASS_AZURE_SUBSCRIPTION_ID` to the intended subscription UUID and
`HIPASS_AZURE_BUDGET_USD=100` locally; never submit credentials or access tokens.
CLI/sign-in prerequisites: install the official Azure CLI and run `az login` locally,
then obtain the intended subscription UUID without publishing account output.
Exit codes: 1 FAIL, 2 NOT VERIFIED / ENVIRONMENT BLOCKED. This preliminary gate never
returns overall PASS: account/provider access does not prove deployment, balance,
budget enforcement, key operations or clinical E2E. No resource creation/registration,
token retrieval, default subscription change, migration or Git publication is performed.

Execution evidence (2026-10-08, current uncommitted changes over HEAD089eecb):
`node --test test/azure-demo-preflight.test.js test/mobile-kms-adapter.test.js
test/mobile-transient-decrypt.test.js` — 17/17 PASS, exit0, 205.4717ms.
These are local/preflight contract tests, not live Azure Key Vault evidence.
Real preflight with declared USD100 — ENVIRONMENT BLOCKED, exit2: CLI not found
on PATH or either standard Windows CLI2 installation path; intended subscription
UUID absent. Remaining credit/VM quota/key operations/cloud E2E NOT VERIFIED.
Secret scan PASS, zero findings; no credentials/resource writes or lockfile changes.
Next prerequisite: official CLI installation, user-local interactive sign-in and
explicit intended subscription UUID, then rerun preflight. No cost ceiling is
technically enforced by this script, and it never claims otherwise.
