# MediQ 선별 원문 기록 발췌

2026-10-08 기록 병합. 아래는 당시 문서의 원문이며 **현재 종료 판정은 PROJECT-CLOSURE-2026-10-08.md가 우선**한다.
이 발췌 안의 Current/Next/PASS는 당시 범위다. 최신 Web PASS, 두 실패 및 PACS timeout을 함께 보존했다.
출처·전체 원본 SHA-256·줄 범위는 SOURCE-MANIFEST.json을 따른다. 발췌는 줄바꿈만 LF로 정규화했다.

## EXTRACT-1 — README.md (1–18)

<!-- EXTRACT-1:BEGIN -->
~~~text
# MediQ

Patient-Controlled Medical Imaging Mobility SaaS

MediQ는 Synthetic/Test DICOM 환경에서 환자의 요청 또는 동의를 기반으로 의료영상을 기관 간 조회·다운로드·PACS Import할 수 있도록 하는 캡스톤 Technical MVP입니다.

Hospital PACS는 의료영상의 Source of Record이며, MediQ Cloud에는 영구 PACS나 장기 영상 Archive를 구축하지 않습니다. 승인된 병원 또는 Synthetic Patient의 Cloud Viewer 요청은 MediQ Authorization Gateway를 거쳐 Source PACS의 DICOMweb 데이터를 온디맨드로 전달합니다. 환자 기기에 Export된 영상의 Mobile Vault 열람은 P1입니다.

## 현재 단계

**현재 검증 상태 (2026-10-08): backend Golden Path 검증 PASS / 전체 P0 PARTIAL.** `npm run p0:verify`가 종료 코드0으로15개 단계를 모두 통과했습니다. 현재 API1,396개 테스트,12개 DB 런타임 재검증, 실제 인증 HTTP A→MediQ→B 전송·무결성·출처·감사·완료·삭제·6개 거부 경로, 병원/합성 환자 Viewer의 보안·취소·프로세스 재시작·실제 PACS 장애 복구, 독립 Download의14개 거부·3개 실제 연결/감사 실패/복구 경로를 확인했습니다. 테스트 자원 정리와 기존 환경 보존도 통과했습니다. [최종 증거](artifacts/p0-verify/2026-10-07T15-19-28-779Z/summary.json) · [구현 보고서](docs/implementation/MEDIQ-PACS-001/IMPLEMENTATION-REPORT.md). Artifact는 로컬 ignored 실행 산출물이며 Git clone에 포함되지 않습니다.

실행 가능한 React 웹·Code+PKCE 로그인·일부 조회/Study 등록 업무 연결·실제 브라우저 Acceptance는 아직 남아 있습니다. API의 test-only opt-in 경계는 유지되며, 이 PASS는 운영 공개 또는 전체 화면 구현 완료를 뜻하지 않습니다. 다음 구현 프롬프트는 위 구현 보고서에 있고 사전 조사부터 실행합니다.

### 과거 검증 기록 (아래2026-10-06의 “최신”은 당시 기준이며 현재 상태 아님)

**최신 검증 상태 (2026-10-06): P0 PARTIAL.** 앞서 검증된 synthetic/Test Orthanc dispatch·terminalization 하위 경로는 범위가 제한된 PASS입니다. 이번 작업에서 authenticated PACS Import HTTP path를 실제 Test `AppModule`에서만 켜는 이중 opt-in gate와 `npm run p0:verify` evidence runner를 추가했습니다. 기본·개발·운영 구성에서는 route가 비활성입니다. API 53 files/1,240 tests 및 contract/migration 회귀는 통과했으나, full verifier는 DB-008 ScratchOnly에서 safe diagnostic 없이 실패했습니다. 별도 HTTP 성공 테스트 두 번은 각각 1/1이었지만 독립 DB observer는 tenant-bound 재시험에서도 `NO_OPERATION`을 반환해 route의 owned-status `COMPLETED` 응답과 모순됩니다. 이 discrepancy는 미해결이므로 Acceptance PASS가 아닙니다. HTTP 거부사례 6개와 전체 P0는 미완료입니다. `AT-E2E-003`은 0/1이며, 상세 판정은 [구현 현황](docs/implementation/README.md), [P0 실행 계획](docs/P0-EXECUTION-SCHEDULE.md), [PACS-001 시험 증거](docs/implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md)을 따릅니다.

~~~
<!-- EXTRACT-1:END -->

## EXTRACT-2 — docs/IMPLEMENTATION-PLAN.md (1–12)

<!-- EXTRACT-2:BEGIN -->
~~~text
# MediQ Implementation Plan

## Current authoritative state — 2026-10-08

- **Current baseline:** db4b750; dirty changes preserved, no commit/push.
- **Current active work:** MEDIQ-WEB-P0-001 full14-screen hospital/patient vertical workflow.
- **Current result:** PARTIAL overall. Actual native --workflow14474/91df3813d4cb PASS/all10 business+all8 imaging flags/cleanup; original compiled web clients drive real Consent/Grant/both-role metadata+JPEG/close/hospital ZIP/patient DOWNLOAD denial. Final Web105/105/build/whitespace PASS. Not browser or A→B Import E2E.
- **Completed this step:** same owned runner --workflow/real client loader, fixed incorrect JWT-bound server Viewer TTL response assumption (token expiry enforcement preserved), ordered independent hospital grants before imaging according to existing CONSENTED-only issuance. Two actual failures retained; no backend/API/schema/policy changes.
- **Remaining / observed obstacle:** IAB login produced no surfaced IdP tab; actual browser auth/Consent/whole14 screens remain NOT_VERIFIED. Popup cause NOT_PROVEN, not a global environment blocker. Current full API/root not rerun; previous fsync timeout and unapplied budget proposal retained.
- **Next action:** fix UI to prepare separate action Grants before imaging while preserving unknown key/known grants and aggregated lifetime locks; next prompt/actual state and replay inspection recorded. Then native signed Import+independent B/durable evidence, browser and full16-gate closure. Browser64MiB ZIP consumer, unknown-result recovery/history/deliberate-exit recovery remain limited; actual IAB login unresolved.

### Historical verification checkpoints (not current status)
~~~
<!-- EXTRACT-2:END -->

## EXTRACT-3 — docs/implementation/MEDIQ-WEB-P0-001/TEST-EVIDENCE.md (1–11)

<!-- EXTRACT-3:BEGIN -->
~~~text
# MEDIQ-WEB-P0-001 Test Evidence

## Actual signed native Web-client imaging command — 2026-10-08

Command `node scripts/verify-native-web-demo.mjs --workflow`,14474/91df3813d4cb: terminal exit0, phaseNATIVE_HTTP, bootstrapVerified=true/sourceVerified=true/nativeFailure=null/all10 nativeResult flags true/all8 workflowResult flags true/resultPASS/cleanuptrue. Explicit scope NATIVE_WEB_CLIENT_IMAGING_NOT_BROWSER_OR_PACS_IMPORT. Fresh scratch DB/original migrations/minimum role/default native AppModule/real signed Code+S256 IdP/Test TLS Orthanc A/B. Original web client functions transpiled on host and invoked with fixed authenticated local API transport; no mock fetch responses, preapproved Consent/Grant seed, browser-auth injection or product provider override. Real hospital request/patient approve, hospital VIEW/key replay + independent DOWNLOAD-only before admission, both hospital and own patient metadata/JPEG first-frame and204 close, actual bounded server ZIP and server403 for patient DOWNLOAD scope. All flags returned only after every assertion; summary contains no token/account/UID/pixels/SQL/raw exception.

First91844/7fce4775b0bd: exit1/PARTIAL, bootstrap/source true, workflowResult null, WORKFLOW_HOSPITAL_FRAME expected200/actual200, cleanuptrue. Combined stage cannot establish exact failed substep. Read-only code comparison found wrong JWT-bound server TTL assumption; corrected client response validation to actual5min/Consent/Grant/Session bounds, with JWT expiry independently enforced during all reads/UI consumption. Added regression confirming server TTL may exceed current JWT but expired identity has zero protected IO, and safe separate open/metadata/frame diagnostics. Second61776/2244694a01c8: exit1/PARTIAL, WORKFLOW_DOWNLOAD_GRANT201/403, cleanuptrue. Sequential assertions before that stage establish both actual role frame/close successes, but not complete workflow. Actual hospital issuance is CONSENTED-only, so reordered separate DOWNLOAD issuance before Viewer advances Session; patient self-VIEW remains allowed ACTIVE. No Authorization/Grant policy weakened. All failures preserved; no successful replacement of their summaries.

Focused runner12/12 PASS682.366ms; subsequent imaging+runner24/24 PASS687.8314ms. Final `$taskWebTests = @(rg --files tests/web -g '*.test.mjs'); node --test --test-reporter=tap @taskWebTests`:105/105 PASS,0 fail/cancelled/skipped,exit0,4201.6955ms. `npm run build --workspace=@mediq/web`:TypeScript/Vite75 modules/252ms/exit0. `git -c core.safecrlf=false diff --check`:exit0. Native source frozen during all live Docker commands; no full API/root/browser tests run. Independently scoped final container/volume/network/image inventory command for91df3813d4cb: exit0/empty; runner additionally checked exact ownership and all resource inventories during teardown. Earlier failed-owner volume/network/image inventories also empty. Only exact-owned temporary synthetic resources removed; existing persistent DB/PACS/.env unchanged.

Limitations: native signed-client API/JPEG/ZIP proof, not React/browser login/render/interaction/URL cleanup, independent post-run Audit/clinical integrity/ZIP CRC/source-byte comparison, STOW/destination/terminal purge or full P0. Empty B was verified at fixture setup, not claimed as a new post-workflow observation. Current GrantPanel still needs separate pre-imaging multi-action preparation, identified by actual test order. Full14-screen WEB/P0 PARTIAL; budget exception NOT_APPLIED, latest full API/root NOT_RUN, no commit/push.
~~~
<!-- EXTRACT-3:END -->

## EXTRACT-4 — docs/implementation/MEDIQ-PACS-001/TEST-EVIDENCE.md (1–17)

<!-- EXTRACT-4:BEGIN -->
~~~text
# MEDIQ-PACS-001 Test Evidence

## Cross-platform final diagnosis — 2026-10-08, PARTIAL

Final existing contract gate9860: `node --test tests/scripts/p0-import-signed-identity.test.mjs tests/scripts/p0-product-api-http-denials-contract.test.mjs tests/scripts/p0-api-regression.test.mjs tests/scripts/api-regression-failure-reporter.test.mjs tests/scripts/source-lifecycle-timing-diagnostic.test.mjs`, exit0,58/58 PASS22511.8463ms. `node --check` for p0-api-regression/diagnose-p0-ciphertext-sync/verify-p0-golden-path and `git -c core.safecrlf=false diff --check` exit0. Contract PASS is not full API/P0 PASS. No live test processes from this iteration remain; proposed deadline exception NOT_APPLIED.

Actual full Linux API94120 owner5ffa9fa0bea4,04:42:24.309Z–04:47:25.086Z,exit1/API_TEST_FAILED,62/63 files and1533/1534 tests PASS. F009/case0002 TEST_TIMEOUT; physical WRITE1/completed1; SYNC1/completed0/inflight1/oldest GTE4000MS; loop max28ms. Runner cleanupPASS; independent77033 exact containers0/images0/both exits0. Transient Dead lifecycle state was followed by container absence without intervention; no daemon failure inferred. No complete verifier retry after failure.

Owned local0-options volume probe36264 owner9d0c46559b10,04:50:51.387Z–04:53:08.196Z,exit0/measurement-only. Actual24 writes/syncs/removals/root absence; write max2ms/sync max184ms/loop max15ms, sync>=1000/4000 counts0. Previous container-rootfs measurement sync max111ms, so no demonstrated volume benefit; normal full API path unchanged. Runner cleanupPASS; independent62175 containers/images/volumes0/0/0 with all query exits0. Scope/ownership/cleanup contracts10/10 PASS; syntax/diff checksPASS. Named test disk volume and image removed, reproducible; existing volumes/services unchanged.

Native82465 command used exact bounded root executor with `node node_modules/vitest/vitest.mjs run tests/api/authorized-source-capture.test.mjs --maxWorkers=1 --reporter=default --reporter=./scripts/api-regression-failure-reporter.mjs`, existing compiled product modules, original deadlines/real physical store.04:55:01.832Z–04:55:57.442Z,exit1/no outer timeout,305/306 PASS,F009/case0013 TEST_TIMEOUT/observer1. WRITE3/completed3, SYNC3/completed2/inflight1/oldest LT4000MS/max LT4000MS; loop max25ms. Native comparison is diagnostic only, not substitute for Linux regression. Prior focused42507 PASS remains earlier evidence, not this run's result. Docker-only cause, kernel/host-storage cause and remediation remain unproven.

Installed Vitest default5000ms verified from local CLI description and runner option fallback; no explicit5-second fsync SLO found in authoritative Acceptance/Security. Proposed narrow15000ms real-I/O test budget is recorded but NOT_APPLIED pending exception to prior unchanged-deadline constraint. Product/network/DB/Grant/TTL/abort bounds unchanged, no assertions disabled. Full API/root/P0/browser PARTIAL.

## Probe47768 and focused42507 TERMINAL — scoped PASS, not cause repair — 2026-10-08

Probe command: same root bounded executor + `runIsolatedApiRegression({run,owner,storageProbe:true})`; exclusive fixed `node scripts/diagnose-p0-ciphertext-sync.mjs` inside original api-regression-test target. Ownere90583b81179,04:34:10.866Z–04:35:54.689Z,exit0/measurement-only. Actual24 exclusive0600 synthetic4096-byte files inside generated owned tmp directory, real fsync24, removals24/root absent. Write max2ms/sync max111ms/loop max24ms/sync>=1000ms0/>=4000ms0. No mounts/tmpfs/credentials; runner cleanupPASS, independent68858 container/image inventories0/0, both exits0. No production DICOM or permanent resources affected. This does not reproduce previous latency and is not API/P0 PASS.
~~~
<!-- EXTRACT-4:END -->
