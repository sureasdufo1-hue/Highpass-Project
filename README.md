# HiPass Platform

> **CAPSTONE MVP · 합성 데이터 · 비운영 기술 테스트 환경**
>
> NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM.

환자 동의를 기준으로 병원 간 의료영상을 안전하게 조회하는 PoC입니다.

CD로 영상을 옮기는 흐름을 줄이고, 필요한 병원과 의료진에게 필요한 Study/Series 범위만 열어주는 구조를 실험합니다. 실제 환자정보나 실제 병원 PACS에는 연결하지 않습니다.

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
