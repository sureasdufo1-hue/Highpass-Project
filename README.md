# HiPass Platform

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
- Docker Compose 실행 환경
- GitHub Security Gate와 운영 증적 문서

## 실행

개발용 환경 파일을 먼저 만듭니다. `.env`는 Git에 올리지 않습니다.

```bash
cp .env.development .env
```

Docker로 전체 스택을 올립니다.

```bash
docker compose up -d --build
```

접속 주소:

```text
웹 포털: https://localhost:3443
HTTP 진입점: http://localhost:3000
Viewer 경로: https://localhost:3443/hipass/
Health Check: https://localhost:3443/api/health
```

상태 확인:

```bash
docker compose ps
```

중지:

```bash
docker compose stop
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

보안 게이트:

```bash
pnpm run security:secrets
pnpm run security:gate
pnpm run security:network
pnpm run security:readiness
pnpm run security:container
```

운영 증적 점검:

```bash
pnpm run ops:expiry
pnpm run ops:monitor
node scripts/ops-rollback-check.js
```

Docker 스택이 떠 있을 때 HTTPS E2E를 실행합니다.

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
$env:HIPASS_E2E_BASE_URL="https://localhost:3443"
$env:HIPASS_E2E_VIEWER_URL="https://localhost:3443/hipass/"
$env:HIPASS_E2E_DATABASE_DOCKER="1"
node scripts\e2e-integration-test.js
```

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
Level 6:
PRODUCTION GOVERNANCE & COMPLIANCE READINESS CANDIDATE

Release SHA:
db1189cab346f1b9c09aec617f81a03893bfb8b0

Hosted Security Gate:
PASS
```

자세한 증적은 `docs/operations/release-validation-manifest.md`와 `docs/operations/evidence-matrix.md`를 봅니다.

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
