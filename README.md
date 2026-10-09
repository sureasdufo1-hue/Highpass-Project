# HiPass Platform

현재 발표 환경·실제 사용자 흐름·남은 실패의 권위 위치는 [발표 환경 통합 상태](docs/implementation/mediq-presentation-integration-status-2026-10-09.md)의 현재 절입니다. 아래 날짜별 설명은 해당 시점의 이력이며 최신 배포의 PASS로 승계하지 않습니다. 전체 MVP/v3 미완료.

## MediQ 기록 계승 — 2026-10-08

일정·전체 P0 목표 미달로 종료한 MediQ의 회고·선별 검증 기록·코드 재사용 후보를 [계승 자료집](docs/inherited/mediq/README.md)에 등록했습니다.
기록 병합만 수행했으며 기존 실행 코드·DB·기술 스택을 덮어쓰거나 하이패스의 P0를 완료로 판정하지 않았습니다.

> **CAPSTONE MVP · 합성 데이터 · 비운영 기술 테스트 환경**
>
> NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM.

환자 동의를 기준으로 병원 간 의료영상을 안전하게 조회하는 PoC입니다.

CD로 영상을 옮기는 흐름을 줄이고, 필요한 병원과 의료진에게 필요한 Study/Series 범위만 열어주는 구조를 실험합니다. 실제 환자정보나 실제 병원 PACS에는 연결하지 않습니다.

## 현재 v3 전환 상태 (2026-10-07)

통합 기술 검토 → 수용기준 → P0 구현계획 이후, 독립 합성 검증환경과 패치된 Node 24/Debian 13 런타임을 추가했습니다. 기존 MVP HTTPS 검증 22개, mTLS 정상·음성 7개 및 Security Gate를 통과했습니다. 앱 이미지 스캔에서 Critical/High 0건을 확인했습니다. 실제 Chrome에서 내장 Viewer의 합성 영상 디코딩과 토큰 비노출, 양쪽 네임스페이스에서 DB/PACS 직접 접근 SYN 미도달을 확인했습니다. 동의 QR handoff의 PostgreSQL 계약 불일치와 화면 토큰 노출도 수정했습니다. 기존 계정 격리는 임의 해제하지 않았습니다. `/api/v3` 구현과 전체 MVP 달성은 아직 선언하지 않습니다. DPoP route enforcement와 사람 독립 검토는 남아 있으며, OHIF 전체 렌더링·임상 품질 검증을 수행한 것은 아닙니다.

- [통합 기술 검토](docs/governance/highpass-v3-integrated-review-2026-10-07.md)
- [수용기준 81개](docs/acceptance/highpass-v3-acceptance-criteria.md)
- [P0 구현계획](docs/implementation/highpass-v3-p0-master-plan.md)
- [이번 진행 결과와 다음 차단 해소 순서](docs/governance/highpass-v3-p0-execution-2026-10-07.md)
- [독립 합성 검증 명령과 데이터 보존 절차](docs/DEMO-RUNBOOK.md#독립-합성-회귀-검증-2026-10-07)

모바일 인증·보관함은 개발용 시뮬레이션입니다. FIDO2/TEE와 실제 STOW-RS 수신 PACS 등록은 미검증 또는 미구현입니다. 출처 검증 전 CD 유래 영상은 기본 시연경로와 새 Docker 이미지에서 제외합니다.

## 지금 들어있는 것

- 환자 동의 생성, 조회, 철회
- RBAC + ABAC 접근정책 검증
- 5분 단기 DICOMweb 접근 토큰
- DICOMweb Gateway
- Orthanc 기반 가상 PACS
- OHIF 기반 Viewer
- 감사로그와 이상행위 탐지
- 연구용 가명처리 시뮬레이션
- PF-1 로컬 텍스트 Privacy Filter preview·fail-closed 통합(실제 model checkpoint는 별도 준비)
- Docker Compose 실행 환경
- GitHub Security Gate와 운영 증적 문서

## 실행

개발용 환경 파일을 먼저 만듭니다. `.env`는 Git에 올리지 않습니다.

```bash
cp .env.development .env
```

Docker로 전체 스택을 빌드·시작하고 readiness를 확인합니다.

```powershell
pnpm run mvp:start
```

접속 주소:

```text
웹 포털: https://localhost:3443/hipass/
HTTP 진입점: http://localhost:3000
OHIF Viewer: https://localhost:3443/
Health Check: https://localhost:3443/api/health
```

상태 확인:

```powershell
pnpm run mvp:readiness
```

중지:

```powershell
pnpm run mvp:cleanup
```

컨테이너 제거:

```bash
docker compose down
```

검증 데이터를 포함한 DB/Orthanc 볼륨까지 지울 때만 사용합니다.

```bash
docker compose down -v
```

## 로컬 Node 실행

JSON 파일 저장소로 간단히 실행할 수 있습니다.

```powershell
pnpm install
$env:PORT="3000"
$env:HIPASS_STORE="json"
$env:HIPASS_DB_PATH="data\hipass-local-server.json"
$env:AUTH_MODE="DEVELOPMENT_MOCK"
$env:DICOM_TOKEN_SECRET="local-node-server-32-byte-minimum-secret"
$env:DICOM_TOKEN_TTL_MINUTES="5"
pnpm start
```

PostgreSQL로 실행하려면 DB만 먼저 올립니다.

```bash
pnpm install
docker compose up -d postgres
pnpm run start:postgres
```

서버는 시작할 때 필요한 테이블을 만들고, 비어 있으면 가상 병원과 가상 환자 데이터를 넣습니다.

## 주요 환경변수

- `NODE_ENV`: `development`, `test`, `production`
- `AUTH_MODE`: `DEVELOPMENT_MOCK`, `TEST`, `OIDC`
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `DICOM_TOKEN_SECRET`: 단기 DICOMweb 토큰 서명 secret
- `DICOM_TOKEN_TTL_MINUTES`: 토큰 유효시간. 기본 5분
- `HIPASS_INTERNAL_SERVICE_TOKEN`: 내부 서비스 호출용 토큰
- `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PUBLIC_KEY`: OIDC/JWT 검증 설정
- `ORTHANC_REST_URL`: Gateway가 바라보는 Orthanc 주소
- `ORTHANC_TLS_CA_FILE`, `ORTHANC_TLS_CERT_FILE`, `ORTHANC_TLS_KEY_FILE`: mTLS 파일 경로

`NODE_ENV=production`에서 `AUTH_MODE=DEVELOPMENT_MOCK`으로는 시작하지 않습니다.

## 테스트

기본 테스트:

```bash
pnpm test
```

실행 중인 Docker Compose 환경의 전체 캡스톤 MVP 검증:

```powershell
node scripts\mvp-verify.js
```

패키지 실행이 가능한 환경에서는 `pnpm run mvp:verify`도 같다. 자동 생성 증적은 `evidence/generated/`에 저장되며 검토 전 `DRAFT / UNASSIGNED`다. 발표 재현은 `docs/DEMO-RUNBOOK.md`, 범위는 `docs/MVP-SCOPE.md`, 상용화 전 작업은 `docs/COMMERCIALIZATION-BACKLOG.md`를 참고한다.

합성 PHR ImagingStudy–Orthanc 매핑 검증은 Docker Compose 네트워크 안에서 실행한다. 실행 중인 MVP 스택이 필요하며 기본 Compose 프로젝트명은 `highpass-phase2`다.

```powershell
pnpm run phr:verify-mapping
```

호스트에서 PACS를 직접 조회하는 원시 검증기는 테스트·디버깅 목적으로만 `pnpm run phr:verify-mapping:local`을 사용한다. 이 명령은 Compose 내부 DNS를 해석하지 못하는 호스트 환경에서 `SOURCE_UNAVAILABLE`이 될 수 있으며, 이를 PASS로 간주하지 않는다.

발표 전 최종 Gate는 PF-0 DB/RLS, 개발 인증서 rollback, 최신 컨테이너 스캔, CycloneDX SBOM과 전체 MVP를 고정된 순서로 실행한다.

```powershell
pnpm run mvp:finalize
```

보안 게이트:

```bash
pnpm run security:secrets
pnpm run security:gate
pnpm run security:network
pnpm run security:readiness
pnpm run security:container
pnpm run test:cert-fixtures
pnpm run test:mtls-negative
```

운영 증적 점검:

```bash
pnpm run ops:expiry
pnpm run ops:monitor
node scripts/ops-rollback-check.js
```

Privacy Filter 도입 기준, 처리정책과 현재 구현 백로그는
`docs/privacy/README.md`에서 확인한다. 등록된 정책은 합성 PoC용 검토 초안이며
실제 개인정보 처리의 법률 적합성이나 의료기관 승인을 의미하지 않는다.

PF-0/PF-1 합성 단위시험과 PostgreSQL/RLS Gate는 다음으로 실행한다.

```powershell
pnpm run test:privacy
pnpm run privacy:db-gate
pnpm run privacy:model-smoke
```

`privacy:db-gate`는 Docker Engine이 없으면 `ENVIRONMENT BLOCKED`를 반환한다. 실제 OPF model은 `HIPASS_PRIVACY_PYTHON`과 `HIPASS_PRIVACY_MODEL_PATH`에 명시적 local runtime/checkpoint가 준비된 경우에만 `privacy:model-smoke`가 성공한다.

개발 인증서 rollback 호환성은 현재 실행 스택을 교체하지 않는 격리된 Docker 네트워크에서 검증한다.

```powershell
pnpm run test:cert-rollback
```

인증서 수명주기는 `config/certificate-lifecycle.json`에서 관리합니다. Runtime 인증서는 `ops:expiry`에서 만료를 강제하고, 만료된 mTLS 거부 테스트용 인증서는 `test:cert-fixtures`에서 별도로 검증합니다.

Docker 스택이 떠 있을 때 HTTPS E2E를 실행합니다.

```powershell
$env:NODE_EXTRA_CA_CERTS=(Resolve-Path "tmp\certs\mtls\ca.crt").Path
$env:HIPASS_E2E_BASE_URL="https://localhost:3443"
$env:HIPASS_E2E_VIEWER_URL="https://localhost:3443/hipass/"
$env:HIPASS_E2E_DATABASE_DOCKER="1"
$env:HIPASS_E2E_REQUEST_TIMEOUT_MS="10000"
$env:HIPASS_E2E_DOCKER_TIMEOUT_MS="20000"
$env:HIPASS_E2E_TIMEOUT_MS="180000"
pnpm run e2e:https
```

E2E 스크립트는 각 단계의 START/PASS/FAIL 로그를 출력하고, HTTP 요청과 Docker 명령에 명시적인 timeout을 적용합니다. 실패 시 non-zero 종료 코드와 실패 단계를 반환합니다.

브라우저에서 토큰이 URL로 새지 않는지 확인합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-browser-authorization-trace.ps1
```

## 주요 API

- `GET /api/health`
- `POST /api/consents`
- `GET /api/consents/{id}`
- `POST /api/consents/{id}/revoke`
- `GET /api/imaging-studies?patientId=...`
- `POST /api/dicom-access/request`
- `POST /api/policies/access-check`
- `GET /api/audit-logs`
- `GET /api/transfer-usage`
- `GET /dicomweb/studies`
- `GET /dicomweb/studies/{studyUid}/series`
- `GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances`
- `GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid}`
- `POST /gateway/token/introspect`

중요한 검증은 서버에서 다시 수행합니다. 화면에서 버튼을 숨기는 것은 보안 통제가 아닙니다.

## 데모 흐름

1. 환자가 병원 B에 공유 동의를 만든다.
2. 의사가 환자와 동의, Study, Series, 목적을 선택해 접근을 요청한다.
3. 서버가 역할, 병원, 기간, 목적, Study/Series 범위를 확인한다.
4. 조건이 모두 맞으면 짧은 DICOMweb 토큰을 발급한다.
5. Gateway가 토큰 범위 안에서만 Orthanc를 조회한다.
6. Viewer가 허용된 Series/Instance만 불러온다.
7. 접근 허용, 거부, 토큰, 영상 조회가 감사로그에 남는다.

## 현재 기준선

최근 검증 기준:

```text
Target:
CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY

Repository SHA:
343021d62971724856ff351a277c6d71642c24a5

Local MVP E2E:
PASS — Phase 5 final Gate 5/5, nested MVP 14/14, Node tests 148/148

PF-0 PostgreSQL/RLS:
PASS — final-server readiness, migrations, FORCE RLS positive/negative gate

Container scan:
PASS — scanner 1 Critical / 0 High; confirmed runtime Critical 0

Phase 4 recovery rehearsal:
PASS — readiness recovered in 34.62 seconds; named volumes preserved
```

자세한 증적은 `docs/governance/phase-3-mvp-end-to-end-validation.md`, `docs/evidence/phase-3-evidence-index.md`, `docs/DEMO-RUNBOOK.md`를 봅니다. 자동 생성 증적은 검토 전 `DRAFT / UNASSIGNED`이며 로컬 PASS를 운영 승인으로 승격하지 않습니다.

## 아직 아닌 것

이 저장소는 실제 운영 시스템이 아닙니다.

- 실제 환자정보 사용 안 함
- 실제 병원망 연결 안 함
- 실제 PACS 연결 안 함
- 실제 병원 IdP 검증 안 함
- 실제 KMS/HSM 검증 안 함
- 실제 DR 사이트 검증 안 함
- PIPA 법률 인증 아님
- ISMS-P 인증 아님

운영 전에는 법률 검토, 병원 보안 승인, 실제 인프라 설계, 독립 보안 검토가 따로 필요합니다.
## DPoP strict synthetic validation (2026-10-07)

기존 DICOMweb 토큰의 공개키 바인딩·매 요청 증명·신뢰 ingress 강제 검증을
별도 합성 Docker 환경에서 실행한다. [실행 명령 및 한계](docs/DEMO-RUNBOOK.md#dpop--authenticated-ingress-strict-synthetic-profile-2026-10-07).
기본 Compose의 Bearer 호환 모드와 구분하며, 기존 스택에 strict 모드를 자동 적용하지 않는다.
PostgreSQL 공유 replay ledger와 저장소 장애 시 503 거부를 구현했다.
현재 시험 결과와 재시작/다중 프로세스 검증 범위는 [최신 실행 기록](docs/governance/highpass-v3-p0-execution-2026-10-07.md)을 따른다.
JSON 호환 profile의 재시작 보호, 전체 API HA, 독립 사람 검토와 신규 v3 Grant는 완료하지 않았다.
전체 MVP/v3 및 실제 병원 운영 준비 완료를 주장하지 않는다.

## v3 최초 환자 동의 결정 검증 (2026-10-08)

[최신 실행 결과](docs/governance/highpass-v3-patient-decision-execution-2026-10-08.md):
Node 464/464, owned 동의 PostgreSQL 120/120, identity 427/427 PASS.
동의 snapshot·결정·감사·원본 receipt의 원자성과 신규 7개 테이블의 제한된
RLS·불변성을 검증했다. runtime DB/공개 API/Grant/임상 접근은 활성화하지 않았다.
새 증적은 DRAFT / UNASSIGNED이며 전체 MVP/v3 완료가 아니다.
다음 필수 gate는 [COMMIT deadline·실제 lock 경쟁](docs/implementation/highpass-v3-p0-06-decision-deadline-races-prompt.md)이다.

후속 [만료·lock 대기 실행 결과](docs/governance/highpass-v3-patient-decision-deadline-execution-2026-10-08.md):
owned PG 127/127 및 단독 전체 Node 464/464 PASS. challenge·재인증 만료와
실제 COMMIT 거부·3종 lock 대기를 추가 검증했다. 전체 D6·부모 만료 경계·
철회/Grant는 미완료이며 다음은 [부모·변경 경쟁](docs/implementation/highpass-v3-p0-06-parent-expiry-mutation-races-prompt.md)이다.

[부모·변경 경쟁 결과](docs/governance/highpass-v3-patient-parent-mutation-execution-2026-10-08.md):
owned PG 135/135, 단독 Node 464/464 PASS. 기관/참조 변경의 commit·rollback,
부모 연동 만료 및 감사된 취소-first 경쟁을 확인했다. 다음은 승인-first 역순
경쟁과 [동의 철회·만료 계약 정렬](docs/implementation/highpass-v3-p0-06-consent-lifecycle-alignment-prompt.md)이다.

[역순 경쟁·lifecycle 정렬 결과](docs/governance/highpass-v3-consent-lifecycle-alignment-execution-2026-10-08.md):
PG 137/137 및 단독 Node 464/464 PASS. 기관·참조 변경의 승인-first 경쟁을 확인하고
철회/만료의 ADR·API·ERD·acceptance를 제안 수준으로 정렬했다. L1~L5 정책은 미결정이며
새 권한/API는 활성화하지 않았다. 다음은 실제 nonowner 취소 service의 양방향 경쟁이다.

[실제 nonowner 취소·승인 경쟁 결과](docs/governance/highpass-v3-nonowner-cancel-races-execution-2026-10-08.md):
PG 143/143, 단독 Node 464/464 PASS. 별도 취소·approval 계정의 양방향 실제 lock 경쟁,
취소 응답 유실·감사 누락·lock timeout을 검증했다. 새 증적은 DRAFT / UNASSIGNED이며
다음은 [등록된 다른 환자·기관 격리 행렬](docs/implementation/highpass-v3-p0-06-registered-patient-isolation-prompt.md)이다.
철회/만료·전체 D6·Grant·전체 MVP/v3는 미완료다.

[등록 환자·기관 격리 결과](docs/governance/highpass-v3-registered-patient-isolation-execution-2026-10-08.md):
PG 160/160, 단독 Node 464/464 PASS. 각 등록 환자의 정상 승인·own read와 교차 read/write
차단, actor/ref/tenant/audit tuple 변조 rollback을 검증했다. 초기 fixture 실패도 보존했다.
공개 evidence API·최소 관리자 read와 전체 CON-006은 PARTIAL이다. 다음은
[다중 Session 잠금 검증](docs/implementation/highpass-v3-p0-06-multisession-lock-order-prompt.md)이며
새 증적은 DRAFT / UNASSIGNED다.

[다중 Session·기관·Session 만료 경합](docs/governance/highpass-v3-multisession-contention-execution-2026-10-08.md):
최신 PG 169/169 및 단독 Node 464/464 PASS. 실제 nonowner 승인/취소의 두 Session 경쟁,
반대 방향 기관과 중지, 별도 maintenance의 SKIP LOCKED·승인 rollback 뒤 drain을 검증했다.
최초 관측 assertion 실패는 보존했다. 전체 D6·Consent lifecycle·전체 MVP/v3는 미완료이며
다음은 [실제 create/PENDING 경합](docs/implementation/highpass-v3-p0-06-create-pending-contention-prompt.md)이다.

[실제 create/PENDING 경합 결과](docs/governance/highpass-v3-create-pending-contention-execution-2026-10-08.md):
PG 181/181, 당시 Node 464/464 PASS; service-built parent와 실제 취소·만료 경합을 검증했다.
[Consent lifecycle L1~L5](docs/governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md)는
김범희가 2026-10-08 채택했다. 정책 승인과 새 기술 증적 독립 검토는 별개다.
[철회 입력 검증 결과](docs/governance/highpass-v3-consent-withdraw-command-execution-2026-10-08.md):
신규 8/8, 직렬 전체 Node 472/472 PASS. 병렬 회귀의 기존 Privacy HTTP 1개 실패는 보존했다.
다음은 [철회·만료 additive DDL](docs/implementation/highpass-v3-p0-06-consent-lifecycle-ddl-prompt.md)이다.
전체 lifecycle 서비스·공개 API·전체 MVP/v3는 아직 미완료다.

[Terminal DDL·private 철회 projection 결과](docs/governance/highpass-v3-consent-lifecycle-ddl-execution-2026-10-08.md):
최신 PG 208/208, command/projection scoped 13/13 PASS. initial event/receipt를 보존한
event3 조립·RLS·rollback 및 실제 최소권한 private projection을 검증했다.
이는 실제 철회/만료 서비스·공개 read·임상 Grant의 완료 증명이 아니다.
직렬 전체 Node 477/477 PASS. 다음은
[원자적 철회 서비스](docs/implementation/highpass-v3-p0-06-withdraw-service-prompt.md)이며 계약 분석을 시작했다.

[내부 원자적 철회 서비스 결과](docs/governance/highpass-v3-consent-withdraw-service-execution-2026-10-08.md):
최신 PG 226/226 및 scoped Node 19/19 PASS. 초기 증적 보존, 안전한 원본 결과 복구·감사,
동일/상이 key 동시 실행, ACK 유실·COMMIT 만료 rollback과 locale 안정성을 검증했다.
직렬 전체 Node 483/483 PASS.
전체 registered 격리·양방향 경합·expiry worker/공개 read·임상 권한은 미완료이며 새 증적은
DRAFT / UNASSIGNED다. 다음은 [철회 경합·환자/기관 경계](docs/implementation/highpass-v3-p0-06-withdraw-races-prompt.md)다.
