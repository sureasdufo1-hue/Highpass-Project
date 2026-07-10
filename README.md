# HiPass Platform MVP

환자 동의 기반 의료영상 보안 중계 플랫폼 MVP입니다. PDF 설계의 핵심인 Control Plane / Data Plane 분리, 동의 관리, 단기 DICOM 접근 토큰, 감사로그, 전송량 로깅, DICOMweb Gateway 시뮬레이션을 구현합니다.

## 현재 구성

- `hipass-control-api`: Node.js 기반 Control Plane API와 웹 포털
- `postgres`: PostgreSQL 저장소
- `hospital-a-orthanc`: A병원 PACS/Gateway 역할의 Orthanc + DICOMweb
- `hospital-b-viewer`: B병원 Viewer 역할의 OHIF
- 웹 포털: `http://localhost:3000`
- Orthanc Explorer: `http://localhost:8042`
- OHIF Viewer: `http://localhost:3001`
- 기본 데모 환자: `P-1001`
- 기본 데모 병원: `HOSP-A`, `HOSP-B`, `HOSP-C`

## Docker Compose 실행

```bash
docker compose up --build
```

백그라운드 실행:

```bash
docker compose up -d --build
```

상태 확인:

```bash
docker compose ps
```

중지:

```bash
docker compose down
```

DB 볼륨까지 초기화:

```bash
docker compose down -v
```

샘플 DICOM을 Orthanc에 업로드:

```bash
curl -X POST http://localhost:8042/instances --data-binary @sample.dcm
```

업로드 후 `http://localhost:3001`의 OHIF Study List에서 A병원 Orthanc 데이터를 확인합니다.

## 로컬 실행

JSON 파일 저장소로 실행:

```bash
npm install
npm start
```

로컬 PostgreSQL로 실행:

```bash
npm install
docker compose up -d postgres
npm run start:postgres
```

서버 시작 시 `db/schema.sql`과 같은 구조의 테이블을 자동 생성하고, 데이터가 비어 있으면 데모 시드 데이터를 넣습니다.

## 테스트

```bash
npm test
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

## MVP 시연 시나리오

웹 포털에서 다음 흐름을 확인할 수 있습니다.

1. 동의 없는 접근 거부
2. 환자 동의 생성
3. DICOM 접근토큰 발급
4. Gateway Series 조회
5. 동의 철회 후 기존 토큰 거부
