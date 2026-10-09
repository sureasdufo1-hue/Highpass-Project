# Medi Q 검증 도구 안정화

2026-10-09 · DRAFT / UNASSIGNED

## 목적과 범위

발표용 CT/MRI 종단 흐름을 검증할 때 자동 영상 로딩과 검증기의 추가 로딩이 겹치지 않도록 한다. 서버·API·DB 계약, 인증, TLS/mTLS, DPoP 및 애플리케이션 요청 timeout은 변경하지 않았다. 관련 FR: 001~005, 014~025, 032~041.

## 구현

- PHANTOM 검증은 단기 토큰 발급이 수행하는 자동 Series/Instance 로딩과 후속 dashboard 조회가 완료되고 영상이 decode된 뒤 다음 슬라이스를 조작한다. 기존 비팬텀 검증 분기는 보존했다.
- 실패 정리는 기존 기본 환자 또는 명시적으로 선택한 고정 팬텀 환자만 허용한다. 해당 브라우저의 유일한 생성 영수증과 서버 재조회가 일치해야 철회한다. 목록 검색·최신 행 추정·DB 직접 수정·삭제는 없다.
- SSH 감사 조회 출력은 stdout/stderr를 함께 소비하되 stderr를 반환하지 않는다. 30초 deadline, 총 출력 1 MiB 제한, 성공·오류·timeout 모두 채널 종료를 적용했다.
- 감사 연결은 실제 단기 JWT 계약의 jti를 사용한다. raw 토큰이나 개인키를 증적에 보존하지 않는다.

## 테스트

| 검증 | 결과 | 근거 |
|---|---|---|
| 동의 정리·정확한 팬텀 증적 | PASS | Node 선택 테스트 10/10, exit 0 |
| SSH 출력·오류 비노출·제한시간 | PASS | Python 3/3, exit 0 |
| 전체 Node 회귀 | PASS | 754/754, exit 0, 41.416초 |
| 브라우저 스크립트 문법·diff whitespace | PASS | node --check / git diff --check, exit 0 |
| MRI B HTTPS 종단 | PASS | b-browser-2026-10-09T08-26-24.656337+00-00/result.json |
| MRI 실제 PG 감사 연결 | PASS | phantom-audit-2026-10-09T08-26-42.766426+00-00/result.json: 4/4, release 4개 소비, 전체 hash chain 4519개 |
| CT 반복 안정성 | FAIL | b-browser-2026-10-09T08-29-08.443530+00-00/result.json: QIDO 200/12 SOP, rendered 요청 없음 |
| 이번 팬텀 실패 동의 정리 | PASS | 동일 FAIL 증적의 ownedConsentCleanup: 200/200/200, REVOKED, 삭제 0 |

전체 Node 테스트는 별도 HTTPS E2E/외부 Staging 실행을 대신하지 않는다. 브라우저는 기존 프로젝트의 Chrome CDP 도구를 사용했다. 자동 DOM 조작 검증은 실제 사람이 사용하는 화면 흐름·키보드·시각 검토의 완료 증명이 아니다.

## CT 상태 진단 후속 — 08:36 UTC

- 실제 B app.js를 CDP에서 읽어 토큰 정리/영상 진입 위치를 찾는 선택 진단을 추가했다. boolean과 제한된 정수만 수집하며 raw 토큰·환자 ID·예외 문자열·스택은 내보내지 않는다. 수집 후 breakpoint를 제거한다. 서버 배포 변경 없음.
- 최초 pause 진단 CT PASS: `b-browser-2026-10-09T08-32-57.508257+00-00/result.json`. pause의 타이밍 영향 때문에 원인 해결 증적으로 사용하지 않는다.
- false 조건 breakpoint로 상태만 기록한 CT PASS: `b-browser-2026-10-09T08-35-18.293256+00-00/result.json`. 영상 진입 당시 tokenPresent/consentReady=true, consentPending=false, Instance 12였다. 실패 경로를 아직 재현하지 못해 근본 원인은 미확정이다.
- 위 CT의 읽기 전용 PG 감사 4/4 PASS: `phantom-audit-2026-10-09T08-36-31.607572+00-00/result.json`. 해당 release 4개 전부 소비·Vault-bound, 저장 감사체인 4739개 정상. Azure 공급자 로그 조회 증적은 아니다.
- 안전한 진단/기존 proof fixture Node 3/3 PASS, repeat 팬텀 계약 Python 1/1 PASS. 전체 Node 회귀 754개는 이전 변경 기준이며 이번 진단 변경 후 전체 재실행은 아직 미실행이다.
- 반복 도구에 `--phantom-modality CT|MR`을 추가했다. 디버거 없이 최대 세 번 새 브라우저를 실행하며 실패하면 중단한다. legacy 기본 모드는 보존한다. 진단 PASS를 반복 안정성 PASS로 승계하지 않는다.

과거 FAIL 증적을 보존한다. 과거 실패 동의의 정리는 NOT VERIFIED이며 현 소유권 증거 없이 추정 철회하지 않는다. CT 반복 실행은 실패하여 애플리케이션 영상 로딩 중 상태 변경 경로 분석이 다음 게이트다. 모바일 QR, 환자 본인 실영상, 최종 mTLS/네트워크·복구·사람 검토는 남아 있다. 전체 MVP/v3 완료를 선언하지 않는다. 커밋·푸시·애플리케이션 배포는 하지 않았다.

## CT 반복 실패 원인 정정과 로컬 수정 — 08:38 UTC 이후

진단 없는 repeat는 첫 회 FAIL에서 중단했다. `browser-repeat-2026-10-09T08-36-32.396103+00-00/result.json`, elapsed 129.563초, exit 1. 해당 browser 증적은 `b-browser-2026-10-09T08-38-40.562663+00-00/result.json`이다. 이번 동의 정리는 REVOKED 확인 PASS다.

**앞 절의 'rendered 요청 없음'은 잘못된 해석이다.** safeApiFailures를 확인하면 08:29 실패의 WADO_RENDERED는 net::ERR_ABORTED/10007ms, 최신 실패는 같은 오류/10003ms다. 성공 응답 목록에 없었다는 사실을 요청 자체가 없었다는 뜻으로 해석하면 안 된다.

공통 proofFetch는 capstone 영상에 기존 35000ms 제한을 적용한다. 하지만 displaySlice와 prefetchAdjacentSlices가 명시적인 AbortSignal.timeout(10000)을 전달해 공통 제한을 덮어썼다. 로컬에서 이 중복 설정 두 곳을 제거했다. 기존 공통 timeout, 토큰/receipt/package 만료, 권한 재검증, TLS/DPoP는 변경하지 않았다. 불필요한 재시도·평문 fallback 없음.

관련 Node 선택 테스트 12/12 PASS: foreground/prefetch 공통 35초 사용, metadata/non-capstone 기존 20초 및 caller cancellation 유지, 철회/변경 컨텍스트의 늦은 이미지 차단. 이 수정은 아직 B에 배포하지 않았으므로 실제 환경 반복 안정성은 FAIL/NOT VERIFIED 상태다. 다음은 전체 회귀 → 정확한 후보 이미지 보안 검사 → B-only 배포·rollback → 진단 없는 CT/MR 반복 및 감사 연결이다.

최종 로컬 검증: `node --test --test-concurrency=4` 758/758 PASS, exit 0, 41.825초. `node --check public/app.js`, `node --check scripts/browser-authorization-trace.js`, 해당 파일 `git diff --check` 모두 exit 0. Python repeat contract 1/1 PASS. 이 결과는 새 이미지 스캔·실제 B 배포·HTTPS 반복 통과를 대신하지 않는다.

## 배포 및 종단 재검증 완료 — 08:56 UTC

현재 B 이미지 7cbee1c7...의 31개 UI hash 일치, 새 스캔 HIGH/CRITICAL 0, Container Gate PASS. `mobile-b-rollout-20261009T084506Z/result.json`에서 배포/실제 rollback/재전환 및 원래 보안 설정 보존 PASS. HTTPS 주요 자산 11/11 일치 PASS.

디버거 없이 새 브라우저 CT 3/3 PASS(200.219초), MRI 3/3 PASS(322.146초). repeat 증적은 각각 `browser-repeat-2026-10-09T08-47-20.969900+00-00/result.json`, `browser-repeat-2026-10-09T08-50-53.947225+00-00/result.json`이다. 실제 WADO 10.349~18.975초 성공을 관측해 기존 10초 중단 문제의 수정 효과를 확인했다.

6개 실행 각각 동의 REVOKED/소비 release별 wrap·precheck·consume/미소비 release의 만료·명시적 거부/전체 PG 감사체인 검증 PASS. 최종 chain 5336개. 미소비를 소비로 처리하지 않도록 감사 판정을 보완했고, 최초 과도한 all-consumed 조건 FAIL 이력도 보존했다. 자세한 영수증 연결은 발표 환경 통합 상태 문서 참조.

최신 전체 Node 760/760 PASS, exit 0, 42.947초. 이번 작업 단위인 **영상 timeout 수정의 B 배포와 CT/MRI 반복 검증**은 완료다. 전체 MVP/v3, 모바일 QR, 환자 본인 실제 영상, 사람 사용성·독립 검토는 별도 미완료다. 신규 증적 DRAFT / UNASSIGNED. 커밋·푸시는 실행하지 않았다.
