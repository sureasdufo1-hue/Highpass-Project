# HiPass Platform MVP

환자 동의 기반 의료영상 보안 중계 플랫폼 MVP입니다. PDF 설계의 핵심인 Control Plane / Data Plane 분리, 동의 관리, 단기 DICOM 접근 토큰, 감사로그, 전송량 로깅, DICOMweb Gateway 시뮬레이션을 구현합니다.

## 현재 구성

- `hipass-control-api`: Node.js 기반 Control Plane API와 웹 포털
- `postgres`: PostgreSQL 저장소
- `hospital-a-orthanc`: A병원 PACS/Gateway 역할의 Orthanc + DICOMweb
- `hospital-b-viewer`: B병원 Viewer 역할의 OHIF
- Docker 웹 포털: `http://localhost:3300`
- 로컬 Node 웹 포털: `http://localhost:3000`
- OHIF Viewer: `http://localhost:3001`
- 기본 데모 환자: `P-1001`
- 기본 데모 병원: `HOSP-A`, `HOSP-B`, `HOSP-C`

## Docker Compose 실행

개발용 기본값은 `.env.development`에 있다. 반복 실행하려면 로컬 전용 `.env`를 만든다. `.env`는 Git에 저장하지 않는다.

```bash
cp .env.development .env
```

```bash
docker compose up -d --build
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

DB 볼륨까지 초기화하는 명령은 기존 검증 데이터를 삭제한다. 명시적으로 초기화할 때만 사용한다.

```bash
docker compose down -v
```

Orthanc는 host port로 직접 공개하지 않는다. 샘플 DICOM 로딩은 `hospital-a-orthanc-seed` 서비스가 내부 Docker network에서 수행한다.

## 로컬 실행

JSON 파일 저장소로 실행:

```powershell
npm install
$env:PORT="3000"
$env:HIPASS_STORE="json"
$env:HIPASS_DB_PATH="data\hipass-local-server.json"
$env:AUTH_MODE="DEVELOPMENT_MOCK"
$env:DICOM_TOKEN_SECRET="local-node-server-32-byte-minimum-secret"
$env:DICOM_TOKEN_TTL_MINUTES="5"
npm start
```

로컬 PostgreSQL로 실행:

```bash
npm install
docker compose up -d postgres
npm run start:postgres
```

서버 시작 시 `db/schema.sql`과 같은 구조의 테이블을 자동 생성하고, 데이터가 비어 있으면 데모 시드 데이터를 넣습니다.

## Environment

주요 환경변수:

- `NODE_ENV`: `development`, `test`, `production`
- `AUTH_MODE`: `DEVELOPMENT_MOCK`, `TEST`, `OIDC`
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `DICOM_TOKEN_SECRET`: 단기 DICOMweb 토큰 서명 secret
- `HIPASS_INTERNAL_SERVICE_TOKEN`: 내부 서비스용 감사로그/Gateway 토큰
- `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PUBLIC_KEY`: OIDC/JWT 검증 설정
- `ORTHANC_REST_URL`, `ORTHANC_USERNAME`, `ORTHANC_PASSWORD`: Gateway에서 Orthanc로 접근할 때 사용하는 설정

Production에서는 `NODE_ENV=production`과 `AUTH_MODE=DEVELOPMENT_MOCK` 조합으로 서버가 시작되지 않는다.

## 테스트

```bash
npm test
```

보안 게이트:

```bash
npm run security:secrets
npm run security:gate
```

운영 전 구성 점검은 현재 셸의 환경변수를 검사한다. 실제 운영 secret 값은 Git에 저장하지 않는다.

```bash
npm run security:readiness
```

Live Docker E2E는 Docker stack이 실행 중일 때 별도로 수행한다.

```powershell
$env:HIPASS_E2E_BASE_URL="http://localhost:3300"
$env:HIPASS_E2E_VIEWER_URL="http://localhost:3001"
$env:HIPASS_E2E_DATABASE_URL=$env:DATABASE_URL
node scripts\e2e-integration-test.js
```

Codex 데스크톱 번들 Node만 있는 환경에서는 아래처럼 직접 실행할 수 있습니다.

```powershell
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test
```

## 주요 API

- `GET /api/health`: 헬스체크
- `POST /api/consents`: 환자 동의 생성
- `GET /api/consents/{id}`: 동의 상세 조회
- `POST /api/consents/{id}/revoke`: 동의 철회
- `GET /api/imaging-studies?patientId=...`: 환자 영상검사 목록 조회
- `POST /api/dicom-access/request`: DICOMweb 접근토큰 발급 요청
- `POST /api/policies/access-check`: 접근정책 검증
- `GET /api/audit-logs`: 감사로그 조회
- `GET /api/transfer-usage`: 전송량 로그 조회
- `GET /api/hospitals/{id}/gateway`: 병원 Gateway 정보 조회
- `GET /dicomweb/studies`: QIDO-RS Study 검색 시뮬레이션
- `GET /dicomweb/studies/{studyUid}/series`: Series 목록 조회
- `GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances`: Instance 목록 조회
- `GET /dicomweb/studies/{studyUid}`: WADO-RS Study 조회 시뮬레이션
- `GET /dicomweb/studies/{studyUid}/series/{seriesUid}`: WADO-RS Series 조회 시뮬레이션
- `POST /gateway/token/introspect`: Gateway 토큰 검증
- `POST /gateway/audit`: Gateway 감사로그 등록

민감 API는 인증 principal이 필요하다. 개발 UI는 `AUTH_MODE=DEVELOPMENT_MOCK`에서만 mock principal header를 붙인다. 운영 인증은 OIDC/JWT Provider로 교체해야 한다.

## MVP 시연 시나리오

웹 포털에서 다음 흐름을 확인할 수 있습니다.

1. 동의 없는 접근 거부
2. 환자 동의 생성
3. DICOM 접근토큰 발급
4. Gateway Series 조회
5. 동의 철회 후 기존 토큰 거부

## Pre-Production Security Validation

현재 목표 수준:

- Closed PoC: PASS
- Security-hardened Closed PoC: PASS
- Pre-production Security-validated PoC: 진행 중
- Real patient data: PROHIBITED
- Production clinical use: PROHIBITED

남은 운영 전 과제:

- 실제 IdP/OIDC 연동
- KMS/HSM 기반 pseudonym mapping 보호
- Orthanc 인증 또는 mTLS 운영 검증
- Retention enforce와 backup 파기 정책
- 실제 OHIF token header 전달 브라우저 검증
