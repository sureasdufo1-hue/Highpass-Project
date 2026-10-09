# Highpass v3 — 권장 순서 실행 결과

## 최신 후속: PostgreSQL 영속 replay 및 재시작·장애 검증

2026-10-07 / 입력 HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 diff.
목적: 이전 단계의 단일 프로세스 replay 한계를 legacy DICOMweb 경로에서 보완한다.
전체 MVP/v3 완료, 신규 v3 Grant 구현 또는 운영 적합성 판정은 아니다.
이번 legacy 기술 검증 범위의 사용자 제공 독립 사람 검토 결과는 아래에 별도 등록한다.
관련 요구사항: FR-021~031/037~041, V3-SR-GRT-003, V3-AT-FIX-006.

### 구현·API·데이터 경계

- `src/dpop-replay-store.js`: PostgreSQL 원자적 unique-key claim과 DB 시각 기준 200초 TTL.
  proof iat ±60초와 API/DB clock guard ±30초를 고려한 보존기간이다.
  hash(issuer/key thumbprint/jti)와 만료시각만 저장하며 raw proof·토큰·개인키·임상정보는 저장하지 않는다.
- `db/migrations/005_dpop_replay_store.sql`: additive ledger/index, 임상 FK 없음.
  legacy bulk save/TRUNCATE 목록에서 제외해 재시작·기존 데이터 저장이 live claim을 지우지 않는다.
- replay Pool max 4, 연결/클라이언트 query 5초, 서버 statement 4초, lock 3초.
  256회마다 만료 hash 최대 512행을 정리한다. 임상·감사로그 삭제는 없다.
  200초는 논리 replay 판정 window이다. 물리 삭제는 요청 기반 opportunistic cleanup이며
  유휴 상태의 정확한 삭제시각/최대 물리 보존기간을 보장하지 않는다. 운영 정기 정리는 별도 backlog다.
  legacy 데이터 저장 Client는 연결 5초/query 30초/statement 25초/lock 3초로 별도 제한한다.
  edge는 idle 40초/전체 50초, strict HTTPS 요청은 55초이다. DB 30초+최대 5초 tarpit+
  전송 여유보다 바깥 계층 timeout이 짧아 먼저 연결을 끊지 않도록 정렬했다.
  전체 HTTPS 검증 300초 및 다른 gate의 유한 deadline은 유지한다.
- DB 오류/clock skew는 메모리 fallback 없이 503으로 거부한다. 정책상 403 DENY와 구분한다.
  발급/Ticket redeem/DICOMweb/Gateway introspection을 연결하고 실패 사유를 안전하게 감사한다.
  감사 저장까지 실패하면 허용하지 않으며 `auditStatus: NOT_RECORDED`와 고정 경고를 사용한다.
- JSON 호환 모드만 비영속 Map(200초/10,000개)을 사용한다. production strict + 비영속 저장소는 시작 거부다.
- 기존 mock IdP/Bearer 호환 스택을 자동 승격하지 않는다. 신규 v3 API·임상 ERD 구현으로 확대하지 않는다.
- 실제 스키마 초기화는 별도 유한 client timeout 60초이다. 초기 cold DDL을 runtime 5초에
  묶으면 시작 실패가 발생했으므로 분리했으며 replay runtime의 짧은 timeout은 유지했다.
  재시작 시 legacy seed migration/bulk save도 5초에 묶어 실패했던 것을 30초 유한 예산으로 분리했다.

계약 참고: [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html),
[node-postgres Pool API](https://node-postgres.com/apis/pool).

### 시험 및 증적

최종 실행: `evidence/generated/hp-validation-2026-10-07t09-45-58-051z`.
candidate: `highpass-platform-mvp:dpop-persistent-20261007-r3`, image ID
`sha256:f85ad3e634453b7f791d5e66729baba55d734de2d98cad17b7b8ff2e70aa9832`.
명령 `HIPASS_VALIDATION_IMAGE=<candidate> node scripts/synthetic-validation.js --dpop`:
12개 단계 전부 PASS/exit 0, 전체 명령 exit 0 / **SCOPED COMMANDS PASS**.
명령 실행시간 합계 562.213초(약 9분 22초; readiness/기타 overhead 별도)이다.
아래 실패 이력은 삭제·소급 수정하지 않는다. 전체 MVP/v3 달성 판정은 아니다.

| 최종 검증 | 결과 | 증적 파일 / 시간 |
|---|---|---|
| Compose 설정·기동·readiness | PASS | compose-config/start.json, 6개 서비스 healthy |
| core runtime source | PASS | runtime-attest.json, 17개 파일 일치 |
| DPoP 단위·HTTP | PASS | proof-http-unit.json, 15개 / 39.423초 |
| 실제 PostgreSQL 공유 replay | PASS | replay-postgres.json, 9개 / 8.930초 |
| 실제 Chrome 내장 Viewer | PASS | browser-strict-dpop.json, 23.808초 |
| strict HTTPS 재시작·저장소 장애·복구 | PASS | https-strict-dpop.json, 21개 / 128.151초 |
| 정상·음성 mTLS | PASS | mtls.json, 7개 / 110.604초 |
| Node 전체 회귀·secret scan·dependency audit | PASS | security-gate.json, 50.830초; 회귀 하위 명령 42.584초; 최종 단독 회귀 255/255 |
| 최신 candidate scan / Container Gate | PASS | scan/container-gate.json, Critical 0 / High 0 |
| cleanup | PASS | cleanup.json, 48.028초 / exit 0 |
| manifest digest 검사 | PASS | verify-evidence-manifest.js, 13개 digest / exit 0 |

실제 API 컨테이너 재시작 후 동일 proof는 403 `DPOP_NONCE_REPLAYED`였다.
재시작 fixture의 iat +50초는 기존 허용 window ±60초 안이며 정책을 변경하지 않았다.
합성 replay table 장애 시 503 `DPOP_REPLAY_STORE_UNAVAILABLE`, 복구 후 새 proof 200,
제한된 관리자 감사 조회에서 장애 사유 기록을 확인했다. whole DB daemon/failover 장애 시험은 아니다.
만료 정리 시험은 timestamp fixture이며 실제 200초 대기를 수행했다고 주장하지 않는다.
Chrome은 합성 2×2 DICOM의 내장 Viewer 디코딩/토큰 비노출이며 OHIF·임상 화질 판정이 아니다.
manifest 13개 모두 DRAFT / UNASSIGNED이다. digest 무결성 검증은 사람 검토 승인이 아니다.
사람 검토 결과는 아래 별도 기록으로 연결하며 자동 생성 증적의 상태와 내용을 소급 변경하지 않는다.
최종 프로젝트 잔여 컨테이너·네트워크 0, DB/PACS 볼륨 2개 보존을 확인했다.
기존 `highpass-phase2` 6개 서비스는 healthy이며 strict candidate로 교체하지 않았다.
pnpm 실제 실행 버전 11.7.0으로 고정 요구를 충족했다. global manifest 11.22.0 불일치 경고는
보존하며 서명/TLS 검증 완화 또는 lockfile 재생성은 하지 않았다.
최종 코드의 별도 `node --test`도 255/255 PASS, fail/skip 0, 42.892초/exit 0이다.
Node runner의 live E2E/Staging 스크립트 guard는 외부 Staging 실행을 의미하지 않는다.
최종 증적 JSON 15개에 대한 private-key/JWT 원문 패턴 검사 일치 0,
최종 `git diff --check`와 syntax 검사 exit 0이다. 이 검사는 패턴 기반 한정 검사이다.

### 중간 실패·미검증 이력

초기 `hp-validation-2026-10-07t09-02-26-231z`는 API 초기 DDL query timeout으로
Compose 시작 FAIL/exit 1이며 전체 검증 미실행이다. cleanup PASS/exit 0, 실패 증적을 보존한다.
초기화 수정 후 중간 Node 회귀는 254/255 PASS, 1 FAIL/exit 1이었다.
기존 schema mock이 query config object를 문자열로 검사하던 불일치였으며 SQL text 추출과
60초 초기화 예산 assertion으로 보완했다. 두 관련 파일의 8개 시험은 PASS/exit 0이다.
두 번째 `hp-validation-2026-10-07t09-07-13-050z`는 DB 초기화용 Unix socket 서버를
기존 healthcheck가 ready로 판정해 API TCP 연결이 ECONNREFUSED로 실패했다.
PostgreSQL readiness를 `pg_isready -h 127.0.0.1 -t 3`으로 강화했다. DENY나 PASS로 대체하지 않는다.
Docker cold start와 동시 실행한 추가 Node 회귀는 기존 OPF adapter 시험의 MODEL_TIMEOUT으로
254/255 PASS, 1 FAIL/exit 1이었다. 해당 파일 단독 재실행은 21/21 PASS/exit 0이다.
privacy-filter 런타임 timeout이나 테스트 조건을 완화하지 않았다. 최종 전체 회귀 결과와 구분한다.
세 번째 `hp-validation-2026-10-07t09-09-47-149z`는 전체 명령 exit 1이다.
PostgreSQL 경쟁 시험은 결과 전 오류로 NOT VERIFIED/exit 2였으며 정확한 하위 오류는
이 실행의 안전한 요약 출력만으로 특정하지 못했다. 해당 단계의 최초 판정은 유지한다.
같은 프로젝트에서 helper를 수동 단독 재실행한 9개 항목은 PASS/exit 0이었으나 최초
manifest를 교체하지 않았다. 이 실행의 Chrome/HTTPS 21개/mTLS/전체 Node Security Gate/
Container Gate/cleanup는 PASS/exit 0이고 Critical/High 0이다.
manifest digest 13개 검증 PASS/exit 0, 모두 DRAFT/UNASSIGNED이다. manifest 무결성 PASS는
미검증 시험을 PASS로 바꾸지 않는다. 새 합성 프로젝트로 동일 코드 전체 실행을 다시 수행한다.
네 번째 `hp-validation-2026-10-07t09-21-35-238z`에서 PostgreSQL 경쟁 9개와 Chrome은
PASS/exit 0이었지만 HTTPS 재시작 후 readiness가 확보되지 않아 14개 결과 뒤
NOT VERIFIED/exit 2로 중단했다. API 로그의 `PostgresStore.saveNow`/`load` Query read timeout과
반복 재시작을 확인했다. legacy startup bulk save에 적용된 5초 예산이 원인이므로
primary Client만 query 30초/statement 25초로 분리했다. replay pool 제한은 변경하지 않았다.
host HTTPS 검증은 실패 stage와 allowlisted transport code만 출력하도록 보강해 raw 예외/secret을 숨긴다.
PostgreSQL helper 역시 안전한 저장소/worker 오류코드를 구분한다. 수정 후 관련 10개 시험은 PASS/exit 0이다.
네 번째 실행의 cleanup는 90초 command timeout/exit 2로 NOT VERIFIED이며 그대로 보존한다.
종료 후 label 기반 read-only 조회에서 해당 프로젝트 컨테이너·네트워크가 없음을 확인했다.
사후 상태 확인으로 원래 command 결과를 변경하지 않는다. DB/PACS 볼륨은 삭제하지 않았다.
다섯 번째 `hp-validation-2026-10-07t09-34-04-548z` / r2 이미지에서는 API 재시작과 readiness는
완료됐으나 POST_RESTART_REPLAY 전송 단계가 NOT VERIFIED/exit 2였다. 코드 점검에서
primary DB 30초와 edge/host 요청 20초의 예산 불일치를 확인했다. 이 단계의 직접적인
전송 오류코드는 이전 allowlist가 DOMException 숫자 code를 먼저 골라 특정하지 못했으므로
불일치가 관찰된 모든 오류의 유일한 원인이라고 단정하지 않는다.
오류 code/name 후보를 allowlist로 선택하고 비JSON 응답의 안전한 상태만 기록하도록 보완했다.
edge 40초 idle/50초 absolute, host 55초를 적용한 관련 7개 시험은 PASS/exit 0이다.
이 실행의 나머지 gate와 cleanup는 PASS/exit 0이며 전체 명령은 exit 1로 보존한다.

### 변경 파일과 자체 보안 검토

신규: `src/dpop-replay-store.js`, `db/migrations/005_dpop_replay_store.sql`,
`test/dpop-replay-store.test.js`, `scripts/test-support/dpop-replay-worker.js`,
`scripts/test-support/dpop-replay-postgres-check.js`.
후속 수정: `src/postgres-store.js`, `src/services.js`, `src/server.js`,
`scripts/attest-runtime.js`, `scripts/synthetic-validation.js`, `scripts/dpop-https-check.js` 및
`scripts/edge-proxy.js`,
`docker-compose.yml`, `test/browser-boundary-gate.test.js`, `test/synthetic-validation.test.js`,
README/Runbook/SECURITY/보안 요구사항/수용기준/추적표/API/ERD/구현계획/이 실행 기록.
기존 미커밋 변경을 보존하고 dependency/lockfile 변경, TLS 검증 완화, commit/push/merge는 하지 않았다.
현재 전체 작업트리 40개 추적 변경 / 25개 미추적 파일이며 이전 작업을 포함한다.
이 숫자를 이번 작업만의 생성·수정 수로 해석하지 않는다.
시험용 table 장애는 신규 합성 프로젝트 label 확인 후 rename하며 finally에서 복구한다.
개인키와 원문 proof는 시험 프로세스 메모리/IPC에만 존재하고 증적에 출력하지 않는다.
자동 secret scan PASS와 `git ls-files '*.key' '*.pem' '*.p12' '*.pfx'` 추적 대상 0을 확인했다.
이는 모든 형태의 비밀정보/실제 개인정보에 대한 독립 감사 인증을 뜻하지 않는다.

권장 커밋 분리(실행하지 않음): ① ledger/DDL/서비스·API 통합,
② startup/readiness/timeout 정렬과 회귀·합성 검증기, ③ 요구사항 추적·계약·Runbook·실행 보고.
기존 겹치는 diff는 사용자 변경과 함께 검토해야 하며 생성 증적은 DRAFT 기준으로 선별 보존한다.

### 독립 사람 검토 결과 등록

아래는 사용자가 직접 제공한 검토 결과의 등록이며 자동 시험이나 작성자의 자체 검토 판정이 아니다.

| 항목 | 등록 내용 |
|---|---|
| 검토자 | 김범희 |
| 검토일 | 2026-10-07 |
| 판정 | PASS |
| 예외·의견 | 없음 |
| 근거 | 이번 대화의 사용자 제공 판정·예외 및 검토자·검토일 |
| 승인 범위 | 최신 legacy DICOMweb 경로의 DPoP·신뢰 ingress·PostgreSQL 공유 replay 구현 및 재시작·장애·복구 합성 검증 코드·증적 |
| 기준 코드 | HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 검토 대상 미커밋 diff |
| candidate | `highpass-platform-mvp:dpop-persistent-20261007-r3` |
| image ID | `sha256:f85ad3e634453b7f791d5e66729baba55d734de2d98cad17b7b8ff2e70aa9832` |
| 증적 | `evidence/generated/hp-validation-2026-10-07t09-45-58-051z/manifest.json` |
| manifest SHA-256 | `b95e86f2d49cf51d59affa70de9f60e554202f209e950a6ce4d51f4fd63eae1e` |

등록 시 manifest의 13개 digest 검증 PASS/exit 0 및 runtime attestation 대상 core 파일
17개와 현재 host 파일의 hash 일치를 확인했다. 이 17개 검사는 전체 미커밋 diff의
동일성을 증명하는 검사가 아니다. 이후 코드·이미지·증적 변경에는 이 승인을 자동 승계하지 않는다.
생성 증적 13개는 DRAFT / UNASSIGNED를 유지한다. 과거 실패·미검증 이력과 이전 검토 기록은 보존한다.
PASS는 위 legacy 기술 검토 범위에 한정하며 전체 API HA, 신규 v3 Grant, 전체 MVP/v3 완료,
PIPA 법률 적합성, ISMS-P 인증, 병원 보안 승인 또는 운영 준비도 승인이 아니다.

### 남은 gate 및 검증 범위

공유 replay 컴포넌트의 동시성 검증은 전체 API HA 검증이 아니다. 기존 PostgreSQL store의
메모리 snapshot/bulk save와 감사 chain의 다중 writer 정합성은 별도 검증/개선이 필요하다.
실제 DB failover·TLS verify-full·최소권한·clock monitoring·ingress secret 회전은 운영 전 backlog이다.
지속 부하·스토리지 지연 하의 timeout/가용성과 기존 Privacy Filter 시험의 부하 민감성도 추가 검토한다.
신규 v3 TransferGrant/mobile Vault/OHIF/실제 병원망은 미완료 또는 범위 밖이다.
이번 검토 기록은 위 사용자 제공 결과를 따르며 범위 밖 항목의 미완료·미검증 상태를 변경하지 않는다.
유효 proof window 동안 ledger를
삭제·초기화하거나 호환 모드로 무심코 downgrade하는 rollback은 허용하지 않는다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`

## 최신 후속: DPoP·신뢰 ingress 강제 구현 및 독립 검토 제출

이 절은 이전 candidate의 역사적 실행 기록이다. 현재 replay 구현과 판정은 위의
PostgreSQL 영속 replay 절을 우선한다. 이전 실패/한계 판정을 소급 수정하지 않는다.

2026-10-07 / Target: legacy DICOMweb strict synthetic enforcement.
입력 HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 diff.
아래 기존 실행 기록은 과거 시점이며 `DPoP NOT IMPLEMENTED` 등의 과거 판정은
이 절의 한정된 후속 판정으로 대체한다. 전체 MVP/v3 완료·운영 승인은 선언하지 않는다.

### 구현 및 계약 범위

- FR-021~031/037~041, V3-SR-GRT-003/NET-002/003, V3-AT-FIX-006.
- `cnf.jkt` binding은 proof signature로 검증한 공개키에서만 생성한다.
- DICOMweb QIDO/WADO/rendered/download 공통 검증에 proof, ath, key binding,
  HTTPS origin/대소문자를 보존한 path, 정확한 method, 정수 iat±60초, 유한 길이 jti를 연결했다.
- 서명을 먼저 검증한 후 key+jti 단위 replay를 기록한다. 위조 proof로 cache를 소진할 수 없다.
  Map은 120초/최대 10,000개, 한 프로세스 내 synchronous check-and-set이다.
- bound token은 호환 모드에서도 proof 없이 사용할 수 없다. strict 모드는 unbound Bearer도 거부한다.
- edge는 외부 Forwarded/JA3/JA4/ingress 인증 헤더를 제거하거나 덮어쓴다.
  API는 HMAC envelope의 10초 freshness, method/path/IP/Authorization hash를 검증한 경우에만
  forwarded IP를 사용한다. 임의 JA3/JA4는 네트워크 정체성으로 사용하지 않는다.
- 공개 origin은 고정된 HTTPS 설정이다. strict 환경에서 secret/origin 누락은 startup failure다.
- WebCrypto 비추출 개인키는 메모리 전용이다. 발급·QR redeem·모든 Viewer fetch에 proof를 연결하고
  tokenType을 명시했다. 새로고침 후 재발급 필요; proof를 만들지 못하면 Bearer로 fallback하지 않는다.
- 잘못된 proof는 QR Ticket을 소진하지 않는다. await 뒤 상태 재검증으로 동시 교환 한 번만 성공한다.
- dependency/lockfile 변경, TLS 검증 완화, 기존 데이터 삭제, commit/push/merge는 하지 않았다.

### 증적 및 상태

최종 합성 실행: `evidence/generated/hp-validation-2026-10-07t08-30-06-612z`.
최종 candidate: `highpass-platform-mvp:dpop-ingress-strict-20261007`,
image ID `sha256:8081cd263704adf6a463d7ea3f7a4a1f6fe6777d676747d405218b83b8e29b63`.
최종 source attestation는 core 16개 PASS/exit 0이다. 전체 Node 회귀는 250/250 PASS,
fail/skip 0, 40.038초/exit 0이다. DPoP targeted HTTP/단위 10개 PASS/exit 0이다.
실제 Chrome strict Viewer PASS/exit 0, 21.529초; TLS 음성·정상 16개 PASS/exit 0, 53.767초;
mTLS 7개 PASS/exit 0이다. Security Gate, 최신 이미지 scan, Container Gate, cleanup 모두 PASS/exit 0.
Container scan은 해당 image ID 기준 Critical 0 / High 0이다.
11개 실행 단계의 시간 합계 443.464초(약 7분 23초; readiness/기타 overhead 별도).
manifest 검증 exit 0 / 12개 digest 확인, DRAFT 12개 / UNASSIGNED 12개이다.
최종 합성 프로젝트의 잔여 컨테이너·네트워크는 없고 DB/PACS 볼륨은 보존했다.
기존 `highpass-phase2` 6개 서비스는 그대로 healthy임을 별도 확인했다.
정적 syntax와 `git diff --check`는 exit 0이다.
중간 candidate에서 Chrome proof 헤더/영상 디코딩 및 HTTPS 정상·음성 16개는 PASS였으나,
최종 코드 전체 판정으로 전용하지 않는다.
초기 `hp-validation-2026-10-07t08-17-20-847z`는 source/image mismatch FAIL로 중단·정리됐으며 보존한다.
`hp-validation-2026-10-07t08-24-53-397z`는 이후 Ticket 동시성/method 보완 전 이미지의 중간 결과다.
중간 실행의 cleanup는 timeout/exit 2 / NOT VERIFIED였고 그대로 보존한다. 이후 별도 read-only
label 조회에서 해당 프로젝트의 잔여 컨테이너·네트워크가 없음을 확인했지만 원래 종료 코드를 바꾸지 않는다.
과거 사람 검토자/일자/PASS는 복사하지 않는다. 증적은 DRAFT / UNASSIGNED를 유지한다.

### 기술 자체 검토와 남은 위험

이 절은 구현자가 수행한 자체 검토이며 독립 검토를 대체하지 않는다.
검토 중 발견한 QR 소진 순서, proof await 뒤 중복 교환 window, method 대소문자 검증,
UI token prefix 잔존을 수정하고 테스트에 추가했다.
재시작/다중 replica 간 replay cache는 **미구현 / NOT VERIFIED**이다.
원자적 공유 TTL 저장소·장애 시 fail-closed·재시작 재사용 시험이 상용화 전 필요하다.
HMAC secret 회전/secret manager/내부 전송 TLS/실제 ingress IdP는 운영 전 검토 대상이다.
신규 v3 TransferGrant/API, mobile Vault, 실제 OHIF, 실제 병원망에 대한 보장을 추가하지 않는다.
기존 `highpass-phase2` 서비스는 이 단계에서 strict candidate로 교체하지 않았다.
프로젝트 정책상 synthetic profile을 통과해도 독립 사람 검토와 남은 P0를 생략할 수 없다.

### 독립 검토 인계

| 필드 | 상태 |
|---|---|
| 검토자 | UNASSIGNED — 사용자 지정 필요 |
| 검토일 | 미정 |
| 판정 | NOT VERIFIED |
| 예외/의견 | 미작성 — 없음으로 간주하지 않음 |

검토자는 최종 diff와 manifest/hash/image ID를 확인하고 strict vs compatibility 범위,
nonce cache 재시작 한계, spoofed ingress, QR 단회성, WebCrypto 키 수명, scope·철회·감사를 검토한다.
특히 JSON 저장소의 HTTP 음성 시험과 실제 PostgreSQL/Chrome/TLS 시험을 구분한다.
검토자가 최신 결과에 대한 판정을 제공하기 전까지 P0-03/전체 MVP/v3는 완료로 판정하지 않는다.
권장 커밋 단위: (1) ingress/proof 서버와 계약, (2) WebCrypto Viewer 및 토큰 노출 제거,
(3) HTTP/TLS/Chrome 합성 검증과 증적·runbook. 기존 미커밋 변경은 별도 검토 후 묶는다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`

## 후속 실행: 독립 합성 환경 → 런타임 패치 → 재검증

2026-10-07 후속 작업. 아래 기존 실행 기록의 FAIL/BLOCKED는 당시 결과로 보존하며,
최신 결과는 이 절을 우선한다. 입력 SHA는 동일하지만 미커밋 변경을 포함한다.
관련 요구사항: FR-014~041, V3-SR-NET-002/003, V3-NFR-REL/TST-001.

- 신규 `docker-compose.validation.yml`과 `scripts/synthetic-validation.js`: 매 실행 새 project/principal 저장소,
  임의 포트·비밀값, 합성 seed, readiness, timeout, 명령별 종료 코드, manifest 및 제한된 cleanup.
  기존 계정 격리는 임의 해제하지 않았으며 기존 DB/감사로그/영상은 삭제하지 않았다.
- 공식 digest-pinned nonroot `nodejs24-debian13`로 앱 런타임 교체. Corepack 서명 검증과
  pnpm@11.7.0 frozen lockfile 검증은 유지. OS 스캔 정책 삭제나 CVE 예외 추가 없음.
- mTLS는 CA/hostname/client 인증서 검증을 유지. 로컬 OpenSSL로 개발용 음성 fixture 생성.
  TLS 서버의 typed authorizationError와 실제 연결 IP/port를 대조할 때만 모호한 reset을 DENY로 판정.
  DNS·timeout·Docker 오류 및 상관관계 없는 reset은 계속 NOT VERIFIED.
- Windows Security Gate 재실행 PASS: 실제 실행 pnpm 11.7.0 확인. global manifest 11.22.0 불일치 경고는 남김.
  과거 blocked 결과를 지우지 않았고 Docker 빌드 성공으로 로컬 dependency audit을 대체하지 않았다.

검증 실행·증적 경로:

- 첫 통합 실행 `evidence/generated/hp-validation-2026-10-07t07-07-29-341z`: Node 243 PASS,
  HTTPS 22 PASS / 0 FAIL (99.679초), Container Gate PASS, 앱 Critical/High 0.
  mTLS 4개 미검증 때문에 전체 runner exit 1. 이 실패는 그대로 보존한다.
- mTLS 진단 후 독립 환경에서 재실행: 7/7 PASS. 무인증, wrong issuer/SAN/EKU,
  expired current-CA, expired bad-client 거부와 정상 client 허용을 확인.
- 최종 통합 재실행 경로: `evidence/generated/hp-validation-2026-10-07t07-18-31-582z`.
  신규 이미지 digest: `sha256:fb0b1967e3fadf616ed5d607991300b35ad099a1b6f32642d7dbf14bc4579ed4`.

최종 runner 판정: **SCOPED COMMANDS PASS / exit 0**, 시작~manifest 생성 634.713초 (10분 34.7초).
readiness에서 필수 6개 서비스 healthy 확인. 명령별 실제 결과:

| 명령/검증 | 종료 코드 | 결과 및 근거 |
|---|---|---|
| compose-config / compose-start | 0 / 0 | 설정 유효, 별도 프로젝트 시작 |
| runtime-attest | 0 | 핵심 파일 13개 host/runtime 일치 |
| unit | 0 | 243 PASS / 0 FAIL / 0 skip; 실행 13.977초 |
| network | 0 | ALLOW transport 3개, DENY topology 2개 |
| https-e2e | 0 | 22 PASS / 0 FAIL; 167.375초 |
| mtls | 0 | 정상 ALLOW 및 음성 6종 DENY; 7 PASS; 173.650초 |
| security-gate | 0 | unit, secret scan, 실제 pnpm dependency audit PASS |
| scan / container-gate | 0 / 0 | 위 digest CRITICAL 0 / HIGH 0, 적용 위험 예외 0 |
| cleanup | 0 | 이번 컨테이너·네트워크 제거; 62.567초, DB/PACS 합성 볼륨 2개 보존 |
| verify-evidence-manifest | 0 | 증적 12개 hash/SHA 일치; DRAFT 12 / UNASSIGNED 12 |

`node scripts/operations-expiry-check.js`: exit 0. 개발용 runtime 인증서 유효기간은
2026-12-06, 약 60일 잔여이며 이번 작업에서 갱신하지 않았다. 해당 명령의 기본 image-risk 항목은
다른 기본 scan을 참조하므로 새 앱 CVE 판정에 쓰지 않았다. 새 앱 판정은 위 신규 scan을 사용한다.
개인키·`.env`·runtime 인증서 경로의 Git 추적 없음; 신규 음성 fixture의 키와 증적은 ignore 대상.
Secret scanner는 정의된 패턴 범위의 검사이며 모든 종류의 개인정보 부재를 증명하는 도구는 아니다.
수정한 JS 7개 문법 검증과 `git diff --check` exit 0.

기존 실행 스택 `highpass-phase2`의 API/mTLS/edge 3개를 위 digest로 교체했다.
기존 Config.Env의 비밀값 및 실제 HTTP/HTTPS 포트를 출력 없이 재사용하고 `--no-deps --wait`로 검증했다.
교체 종료 코드 0, 3개 healthy, trusted HTTPS `/api/health` 200/UP, API 파일 13개 및
실제 mTLS proxy 파일 host/runtime hash 일치. DB·PACS·Viewer 및 다른 프로젝트는 재생성하지 않았다.
기존 DB를 대상으로 음성 E2E를 반복하거나 격리를 수동 해제하지 않았다.
이전 `review-20261007` 이미지와 데이터는 보존; 실제 rollback 재교체는 NOT VERIFIED.
Node 실행 중 pg의 concurrent-query deprecation warning이 관찰돼 향후 pg@9 전환 전 점검 대상이다.

상태 한계: Viewer HTTP 응답은 실제 브라우저 영상 렌더링 검증이 아니다.
Network DENY는 topology-only이며 packet-level 차단 증적이 아니다.
스캔 범위는 새 앱 이미지이며 Orthanc/PostgreSQL/OHIF 전체 이미지의 별도 신규 스캔을 뜻하지 않는다.
P0-02 DPoP/ingress와 P0-03 사람 독립 검토는 남아 있으므로 전체 P0-03/전체 MVP/v3 달성을 선언하지 않는다.
PIPA/ISMS-P/병원 승인은 계속 DEFERRED이며 모든 새 증적은 DRAFT / UNASSIGNED.

공식 런타임 근거: [Distroless 지원 이미지](https://github.com/GoogleContainerTools/distroless),
[Debian CVE-2026-31789](https://security-tracker.debian.org/tracker/CVE-2026-31789),
[Debian CVE-2026-84782](https://security-tracker.debian.org/tracker/CVE-2026-84782).
스캐너 실행 시점·digest의 결과만 주장하며 미래 취약점 부재를 보장하지 않는다.

재현 명령과 정리는 [Demo Runbook](../DEMO-RUNBOOK.md#독립-합성-회귀-검증-2026-10-07)을 따른다.
권장 추가 커밋 단위: 독립 합성 harness/테스트, runtime/TLS 진단 패치, 최신 검증 문서.
이번 작업은 commit/push/merge/PR을 수행하지 않았다.

남은 순서: 실제 브라우저 Viewer/토큰 노출 검증 → packet-level 네트워크 경계 증적 →
DPoP/ingress의 요구사항·구현 상태 정렬 → 새 결과의 독립 사람 검토 → P0-03 종료 여부 판정.
이를 완료한 뒤 P0-04 PatientMapping/tenant/patientRef 신규 구현을 진행한다.

## 추가 게이트: 브라우저 / 패킷 / DPoP·ingress / 독립 검토 준비

2026-10-07. 관련 FR-021~041, V3-SR-GRT-003/IAM-001/NET-003,
V3-AT-FIX-006/011. 사람 검토는 DRAFT / UNASSIGNED이다.

확인된 요구사항: 실제 브라우저 영상 렌더링, 토큰 비노출, 직접 DB/PACS 경계 차단,
PoP 보호의 실제 강제 여부를 분리하고 기존 데이터를 보존한다.
합리적 가정: 캡스톤 내장 DICOM Viewer도 허용 가능한 Viewer이며 OHIF 렌더링과 혼동하지 않는다.
구현 결정: DOM 기반 실제 Chrome 검증에서 API-fetch 우회 성공을 제거하고 decoded blob 이미지와
Gateway rendered 200 응답을 함께 요구한다. 토큰 원문/일부는 화면 출력에서 제거한다.
남은 불확실성: 전체 v3 PoP 계약 승인, 외부 IdP/신뢰 ingress, 사람 독립 검토.

### 발견 및 최소 수정

- 브라우저 기존 script는 요소 표시를 실제 영상 렌더링으로 오인할 수 있었고 UI 실패를 fetch로 대체했다.
  이제 naturalWidth/complete/blob 이미지 및 image MIME 응답을 검증한다. 내장 Viewer PASS와 OHIF 미검증을 구분한다.
- 실제 UI가 QR consent handoff를 발급할 때 legacy domain은 requestId=null이지만 Postgres DDL은 NOT NULL이었다.
  SQL 23502와 후속 저장 실패로 token 요청이 502가 됐다. nullable requestId 계약을 DDL 및
  `004_legacy_consent_handoff.sql`로 정렬했다. consent/patient FK, nonce_hash unique는 그대로 유지하며
  가짜 의사 요청을 만들거나 기존 행을 삭제하지 않는다. v3 UUID 스키마 migration과는 별도 legacy 변경이다.
- 디버그 renderOutput에서 accessToken/nonce/key envelope 및 embedded ticket/token 문자열을 redaction,
  scanned token prefix 표시 제거. 토큰은 검증기 메모리에서만 비교하고 증적에 원문을 출력하지 않는다.
- Chrome 전용 임시 profile 삭제는 TEMP 하위 절대경로 및 UUID 이름을 확인한 뒤 실행한다.
  인증서 예외 플래그나 CA trust store 변경은 사용하지 않는다.
- `scripts/packet-boundary-check.js`: 정확한 synthetic project에 한해 source Viewer와 대상 namespace를
  tcpdump로 관찰한다. NET_RAW만 추가하고 privileged/NET_ADMIN은 사용하지 않는다.
  listener 정상 연결 + source SYN + destination에서 control SYN 관찰 + negative SYN 미도달을 모두 요구한다.
  timeout 하나만으로 DENY라 하지 않는다. 데이터 payload를 dump하지 않는다.

### DPoP·ingress 정렬 — 구현 승인 전 계약 후보

기존 verifyDPoPProof 단위 테스트 존재는 보호 API enforcement가 아니다.
requestMeta의 dpopProof가 검증 함수 호출로 이어지지 않는다. 현재 Bearer 경로는 DPoP 강제 **NOT IMPLEMENTED**.
edge는 X-Forwarded-For/Proto를 overwrite하고 외부 JA3/JA4를 제거하지만 API는 내부 호출의
forwarded/JA3를 무조건 신뢰한다. 따라서 end-to-end trusted ingress **PARTIAL**.

기존 verifier의 추가 갭: htu에서 origin을 버리고 path를 lowercase 비교, ath 검증 없음,
iat/jti 타입·유한값 제약 부족, 서명 확인 전에 nonce cache 소비, 프로세스별 replay cache.
기존 6개 unit PASS만으로 RFC 적합성이나 운영 replay 방어를 주장하지 않는다.

승인 후보 순서: (1) 정식 origin/신뢰 proxy 계약 → (2) 발급 시 공개키 thumbprint cnf.jkt binding →
(3) 보호 route 공통 DPoP enforcement → (4) client WebCrypto 및 실패 UI → (5) replay store와 다중 replica 검증.
기본 요구: ES256/P-256 공개 JWK, private member 거부, signature 우선 검증,
case-sensitive path 및 scheme/authority 포함 htu(쿼리/fragment 제외), htm, finite iat,
필수 jti, access-token ath, token cnf.jkt, 원자적 replay 저장 및 TTL.
bound token에 missing/wrong key/invalid ath/replay/origin mismatch는 DENY+audit;
Bearer로 downgrade하지 않는다. consent/병원/환자/Study/Series/action 조건도 계속 AND로 평가한다.
legacy Bearer 경로는 명시적 compatibility 범위로만 보존하며 v3 보호 경로와 혼동하지 않는다.
ingress는 외부 forwarded/JA3 값을 삭제하거나 검증된 proxy가 덮어쓰고,
API는 authenticated proxy만 신뢰하며 정식 origin은 임의 Host header로 만들지 않는다.
이 절은 문서 정렬이며 새 enforcement를 구현·승인한 기록이 아니다.
근거: [RFC 9449 §§4.3, 6, 7](https://www.rfc-editor.org/rfc/rfc9449.html).

### 독립 검토 제출 항목

고정한 앱 이미지: `highpass-platform-mvp:browser-boundary-20261007`,
digest `sha256:a5cf756adb97f67bafc41a753b4d3e2eb26eebe30f13f047f29c5c68067fae8a`.
통합 증적: `evidence/generated/browser-boundary-1791359238637`.
collector exit 0, 전체 405.113초(6분 45.1초), manifest 10개 hash/SHA 검증 PASS.
실행 도구는 host 소스이며 앱 core 14개 파일(신규 PostgresStore 포함)은 host/runtime hash 일치.
수정 이미지를 만들기 전 mutable 컨테이너 진단 결과와 고정 이미지 검증을 구분한다.

| 검증 | 결과 | 근거 |
|---|---|---|
| 실제 Chrome 내장 Viewer | PASS | UI flow, QIDO/WADO 200, rendered image/png 200, 실제 blob 디코딩 2×2; 22.552초 |
| 토큰 비노출 | PASS (검사 범위 한정) | UI/local/session storage/current URL/navigation history/관찰한 요청 URL에서 원문 미검출 |
| Viewer→PostgreSQL 직접 IP | PASS | negative source SYN 3, destination SYN 0, positive control SYN 1 및 연결 성공 |
| Viewer→Orthanc 직접 IP | PASS | 동일 dual-namespace 결과; DNS 실패를 차단으로 오인하지 않음 |
| Node 단위·통합 | PASS | 246/246, fail/skip 0; DPoP 기존 unit 6개는 PoC 검증으로만 해석 |
| 최신 이미지 HTTPS E2E | PASS | 22 PASS / 0 FAIL, 120.938초 |
| mTLS 정상·음성 | PASS | 정상 허용 및 무인증/wrong issuer/SAN/EKU/만료 2종 거부: 7개 |
| Security Gate | PASS | unit, secret pattern scan, 실제 pnpm@11.7.0 dependency audit |
| 새 앱 Container Gate | PASS | 이 digest Critical 0 / High 0; 기존 예외 적용 0 |
| DPoP/ingress 계약 정렬 | 문서 완료 / 구현 미완료 | route enforcement NOT IMPLEMENTED; trusted ingress PARTIAL |
| 사람 독립 검토 | NOT VERIFIED | 아래 제출 항목을 새 결과 기준으로 검토 필요 |

패킷 검사 최초 helper는 기존 Alpine 3.20이었으나 지원 정책을 확인해 공식 3.24 digest로 교체했다.
최종 helper는 APK 서명 검증 및 TLS를 유지, tcpdump 4.99.6/libpcap 1.10.7이다.
[Alpine 공식 지원 정책](https://alpinelinux.org/releases/)을 참고한다.
추가 캡처 손실 검증 증적은 별도 manifest로 수집하며, 위 최초 패킷 기록을 덮어쓰지 않는다.
최종 추가 증적: `evidence/generated/browser-boundary-1791359859430`, packet-only collector exit 0,
manifest 1개 hash/SHA 검증 PASS. helper digest:
`sha256:3c1218d1d00c02aad313b0ad14d70d219e66f441cf53f1abaaf8830232b65e6a`.
DB/PACS 각각 source SYN 3 / destination SYN 0 / positive control SYN 1,
양쪽 `0 packets dropped by kernel` 확인, `captureLossFree=true`.
중간 `browser-boundary-1791359691284` 실행은 Docker ETIMEDOUT/helper cleanup 지연으로
NOT VERIFIED였으며 그대로 보존했다. 이후 orphan helper가 없음을 확인하고 재실행했다.
특정 iptables rule attribution, 외부 병원망·호스트 firewall 전체 검증 및 임상 영상 품질은 미검증이다.
새 migration의 requestId nullable은 legacy consent handoff에만 해당하며 다른 필수 FK를 완화하지 않는다.
운영 rolling migration의 table lock/rollback은 별도 검토 대상; 이 결과는 운영 변경 승인이 아니다.
기존 `highpass-phase2` API만 수정 이미지로 교체했다(`up --no-deps --wait`, exit 0).
기존 비밀값을 출력 없이 재사용했고 edge/DB/PACS/Viewer/다른 프로젝트는 재생성하지 않았다.
API healthy, trusted HTTPS 200/UP, runtime core 14개 host hash 일치,
DB `transfer_tickets.request_id` nullable=YES 확인. 기존 계정 격리를 수동 해제하지 않았다.
운영 rollback을 실행한 것은 아니며 이전 이미지·볼륨은 보존했다.
검증 종료 후 synthetic 프로젝트의 `compose down --remove-orphans` exit 0,
검증 컨테이너/네트워크만 제거했다. DB/PACS 볼륨은 복구용으로 보존했다.
hp-validation/hp-packet 실행 컨테이너와 전용 Chrome profile 실행 프로세스 0개 확인.
기존 highpass-phase2 필수 6개 서비스 healthy; 다른 프로젝트 및 실제 영상 파일 삭제 없음.
최종 도구 변경 후 Security Gate 재실행(2026-10-07T08:01:55Z) exit 0:
unit/secret-pattern scan/pnpm dependency audit PASS. 최종 `git diff --check` exit 0.

이번 생성 파일: `db/migrations/004_legacy_consent_handoff.sql`,
`scripts/browser-boundary-evidence.js`, `scripts/packet-boundary-check.js`,
`scripts/test-support/Dockerfile.network-probe`, `test/browser-boundary-gate.test.js`.
수정 코드: `public/app.js`, `src/postgres-store.js`, browser trace/PowerShell runner,
runtime attest 및 HTTPS E2E fixture의 synthetic runtime secret 바인딩.
고정 앱의 원문 secret은 inspect 메모리에서만 읽고 출력하지 않았다.
문서: README, Demo Runbook, Security Requirements, Acceptance Criteria, Traceability 및 이 실행 기록.
권장 커밋 단위: (1) handoff DDL/store 계약과 테스트, (2) UI secret redaction/browser 검증,
(3) packet helper/evidence 수집, (4) DPoP/ingress 계약·추적·독립 검토 자료.
실제 commit/push/merge/PR은 수행하지 않았다.

검토자: UNASSIGNED / 검토일: 미정 / 판정: NOT VERIFIED / 예외·의견: 미작성.
과거 김범희 검토 서명을 새 변경에 재사용하지 않는다.
검토 대상: UI secret redaction, handoff nullable FK migration 안전성,
packet capture 판정·도구 권한·cleanup, 브라우저 실제 디코딩 증적, DPoP 미구현 표기.
검토자가 최신 source/digest/manifest를 확인하고 각 gate 및 예외를 판단한 뒤에만 독립 검토 PASS로 전환한다.
전체 CAPSTONE MVP/v3 및 PIPA/ISMS-P/병원 운영 승인 달성은 선언하지 않는다.

## 이전 실행 기록 (후속 결과와 구분)

기준일: 2026-10-07. 입력 HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`.
현재 작업트리 변경 포함. 사람 검토: DRAFT / UNASSIGNED. 기존 승인 서명을 새 변경에 재사용하지 않았다.

변경 집계: 기존 파일 수정 30개, 신규 파일 9개. 생성 증적은 ignore 대상이다. 최신 전체 Node 실행시간 10.091초, 마지막 HTTPS 검증은 16.156초 후 `HTTP 403 / ACTOR_QUARANTINED` 선행조건 실패로 종료(코드 1)했다. 전체 MVP E2E 완료 시간은 미확인이다.

## Phase Result

- Previous Level: legacy/mobile-core 기능 및 과거 검증 증적 존재; v3는 설계 정렬 단계.
- Target: 승인된 요구사항 순서에 따른 v3 전환 및 기존 MVP 재검증.
- Achieved: NO — 전체 CAPSTONE MVP/v3 달성 아님.
- Qualifier: `CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`

## 진행한 순서

1. 통합 기술 검토: R-01~11과 요구사항·수용기준 연결.
2. Acceptance Criteria: 81개 작성. 추적표의 개별 후보 70개 모두 포함; OpenAPI 로컬 `$ref` 오류 0. 명세 연결 검증이지 기능 81개 실행 PASS가 아니다.
3. P0 Implementation Master Plan: P0-00~12 의존성·완료 기준·데이터 보존 규칙 작성.
4. 기존 보안 갭 수정 및 테스트.
5. 최신 이미지 빌드, 기존 데이터 유지 재기동, 소스 해시 대조, 새 기술 증적 생성.
6. 새 v3 도메인 코딩: 미착수. 현재 기준선의 실패를 해결하기 전 확장하지 않는다.

## 구현한 변경

| 묶음 | 실제 변경 | 관련 요구사항 |
|---|---|---|
| 환자·기관 접근통제 | 모바일 API 인증·환자 바인딩; 영상 목록 자기 환자 제한; B 보관 목록 환자/A병원 접근 차단; 키 envelope·내부 경로 제거 | FR-014~020, FR-032~036, V3-SR-TEN/IAM |
| Viewer | self-view 거부 시 진입 중단; 합성 영상·예시 설명 표시 | FR-032~036, V3-AT-FIX-003 |
| 모의 성공 제거 | 모바일 TEE/FIDO2·보관함 파기 성공 주장 제거; 미연동 파기 501; 로컬 보관과 STOW/PACS 등록 구분 | V3-AT-FIX-001/004 |
| 키·파일 보호 | 설정된 256-bit KEK 요구; 테스트 random key 주입; DEK finally zeroize; UID 검증; 클라이언트 저장 경로 거부; 기존 보관 폴더 덮어쓰기 차단 | V3-SR-CRY/OPS, V3-AT-FIX-005 |
| 원본 실패 처리 | 로컬 보관은 기본 strict source; 원본 조회 오류의 합성 성공 대체 차단; 작업 실패 감사기록 | FR-026~031, FR-037~041 |
| 개발 데이터 | 미확인 curated DICOM/clinical preview 기본 비활성화; 정적 clinical 경로 차단; 새 이미지에서 clinical assets 제외 | V3-SR-AUD-003, V3-NFR-COMP-001 |
| 경계·가용성 | CA/hostname 검증 healthcheck; 프록시 idle 20초/총 30초; mTLS 클라이언트 4초/총 5초; mobile 자산 라우팅; 외부 JA3/JA4 제거; health만 tarpit 제외 | V3-SR-NET-002/003, V3-NFR-REL-001 |
| 테스트·증적 | 기존 서버 의존 REST 2개 격리; 인프라 오류를 DENY로 오판하지 않음; runtime attest 및 scoped evidence 스크립트; dirty source hash·DRAFT/UNASSIGNED 기록 | V3-NFR-TST-001 |

기존 데이터·영상 파일은 삭제하지 않았다. `mediq-*`, `soc-*`는 수정하지 않았다. 사용자 기존 변경 덮어쓰기, commit/push/merge/PR 없음.

## 테스트 결과

| 검증 | 결과 | 근거/한계 |
|---|---|---|
| Node 단위·통합 | PASS | 최신 scoped 증적: 241/241, 실패·skip 0. 자동 발견된 live 스크립트는 내부 guard가 실행을 하지 않으므로 이 숫자만으로 live E2E PASS를 주장하지 않음 |
| Secret scanner | PASS | 설정된 scanner 범위의 finding 0; 미확인 원본 영상의 완전 비식별 적합성은 주장하지 않음 |
| 인증서 만료 정책 | PASS | runtime dev 인증서 2026-12-06 만료, 약 60일 잔여; 이 작업에서 갱신하지 않음 |
| 최신 이미지 빌드·Compose 시작 | PASS | `highpass-platform-mvp:review-20261007`, project `highpass-phase2`; API/edge/mTLS healthy, 데이터 볼륨 보존 |
| Runtime parity | PASS | 핵심 코드·화면·프록시 13개 파일 host/runtime SHA-256 일치 |
| Network Gate | PASS | ALLOW 3개 transport probe; DENY 2개는 `NETWORK_TOPOLOGY_ONLY` — 별도 패킷 차단 증적과 혼동 금지 |
| 정상 mTLS·무인증·wrong-SAN | PASS | 마지막 전체 mTLS 실행의 ALLOW/DENY 일치; 이후 앱 변경은 이 TLS 정책을 바꾸지 않음 |
| wrong issuer / wrong EKU / expired current-CA / bad-client | NOT VERIFIED | fixture 생성 실패 또는 `ECONNRESET`; 일반 reset을 인증서 정책 DENY로 단정하지 않음 |
| HTTPS E2E | FAIL | 초기 10초 제한/502; 이어진 검증은 토큰 미발급으로 중단. 격리 조회에서 DOC-B-01의 REPEATED_ACCESS_FAILURE 확인 |
| Security Gate | ENVIRONMENT BLOCKED | Windows local pnpm 실행 실패; 실제 global manifest 11.22.0, 프로젝트 pin 11.7.0. unit/secret 부분 PASS, dependency audit 미완료 |
| Fresh container scan | 실행 완료 | 새 이미지 digest `sha256:eb57a025e1501c044818ef07d7c14d19cc8cf492f28b289c2493d3faa6a4a7b2`; scanner CRITICAL 1 / HIGH 6 |
| Container policy gate | FAIL | libssl3 3.0.18-1~deb12u2; CRITICAL CVE-2026-31789, HIGH 6개. 스캐너 완료와 정책 통과를 구분; 임의 예외 승인 없음 |
| Manifest integrity | PASS | scoped 기술 증적 파일 hash/Git SHA 검증; 모든 항목 DRAFT/UNASSIGNED, 내용의 기능 PASS를 뜻하지 않음 |

최종 명령별 종료 코드·출력·실행시간은 `evidence/generated/current-gap-20261007/*.json`에 기록한다. Manifest는 `manifest.json`; 원본 scan은 `app-trivy.json`. 생성물은 Git ignore 대상이고 이 보고서는 기준 요약이다. scoped collector 전체는 Container/HTTPS 실패로 non-zero이다.

## 발견된 차단과 다음 순서

1. **격리된 반복 검증환경:** 기존 DB/계정과 분리한 합성 데이터 Compose 환경·전용 test principal·정리 절차. 현재 DOC-B-01 격리를 임의 해제하거나 감사로그/거부 횟수를 지우지 않는다. E2E 선행 토큰 실패를 `E2E_TOKEN_PREREQUISITE_FAILED`로 보고하도록 수정했다.
2. **패치된 런타임 이미지:** libssl3의 최신 공식 패치/실제 Node 런타임 의존성을 근거로 검토하고 재빌드·재스캔. 버전이 없는 HIGH 항목은 vendor 영향성 확인 또는 독립 위험검토 필요. 과거 다른 digest의 예외를 복사하지 않는다.
3. **mTLS 실패 원인 증적:** fixture 생성 단계의 실패 분리, server-side TLS 거부 사유와 client reset 상관관계 수집. DNS·경로·timeout·daemon 오류는 계속 NOT VERIFIED.
4. **Windows pnpm:** 신뢰할 수 있는 pnpm@11.7.0의 실제 실행 경로로 재검증. Corepack 서명/TLS 검증을 끄지 않는다. Docker 빌드 안의 서명·lockfile 검증 성공을 Windows audit PASS로 대체하지 않는다.
5. **기존 전체 E2E 재실행·독립 검토:** 위 실패를 해결한 뒤 P0-03 완료 판정. UI 브라우저, packet-level 직접 Orthanc 차단, DPoP 강제 적용은 여전히 미검증/미구현.
6. **v3 P0-04 이후:** PatientMapping → ExchangeSession → Consent/Grant → Package → Route/Preflight → STOW → Viewer → Provenance → 전체 회귀. 실제 KMS/PACS/IdP·법률·병원 승인과 분리.

## 재검증 명령과 권장 커밋

PowerShell에서 현재 런타임에 맞춰 `COMPOSE_PROJECT_NAME=highpass-phase2`, `HIPASS_NETWORK_PREFIX=highpass-phase2`, `HIPASS_APP_IMAGE=highpass-platform-mvp:review-20261007`을 설정한다. HTTPS 검증은 `NODE_EXTRA_CA_CERTS`에 `tmp/certs/mtls/ca.crt` 절대경로, BASE_URL에 `https://localhost:3443`, VIEWER_URL에 `https://localhost:3443/hipass/`, DATABASE_DOCKER=1, REQUEST_TIMEOUT_MS=20000을 사용한다.

```text
node --test
node scripts/attest-runtime.js
node scripts/security-network-check.js
node scripts/mtls-negative-check.js
node scripts/security-gate.js
node scripts/e2e-integration-test.js
node scripts/current-gap-evidence.js
node scripts/verify-evidence-manifest.js evidence/generated/current-gap-20261007/manifest.json
```

mTLS에는 `HIPASS_MTLS_TEST_NETWORK=highpass-phase2_dicom_gateway_net`, `HIPASS_MTLS_TEST_IMAGE=highpass-platform-mvp:review-20261007` 설정이 필요하다. Current collector에는 `HIPASS_TRIVY_RESULT=evidence/generated/current-gap-20261007/app-trivy.json`을 지정하여 과거 Orthanc scan으로 새 앱을 판정하지 않는다.

권장 커밋 분리안: (1) v3 계약·수용기준·구현계획, (2) 환자/기관/Viewer 보안·정직한 UI, (3) archive crypto·source/data 보호, (4) TLS/proxy/test/evidence 및 회귀 결과. 실제 커밋은 수행하지 않았다.

PIPA 법률 검토·ISMS-P 인증은 DEFERRED — PRE-COMMERCIALIZATION, 병원 승인은 DEFERRED — PRE-PRODUCTION. 외부 운영 IdP/KMS/PACS/계약은 BLOCKED/DEFERRED. 현재 판정은 **기술 문서 게이트 완료 / 보안 보강 진행 / 전체 MVP 완료 미충족**이다.
