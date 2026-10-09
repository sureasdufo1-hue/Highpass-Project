# Medi Q 캡스톤 합성 팬텀 카탈로그 등록 계약

2026-10-09. 구현/신규 증적 DRAFT / UNASSIGNED. VM·Azure 활성화 전.

## API 변경

기존: 카탈로그 등록 API 없음. 시연 Mock IdP의 환자 프로필은 P-1001 고정.

신규: `POST /api/capstone-demo/phantom-catalog`.

- production/TEST/Postgres/metadata-only/Mock IdP 및 `HIPASS_CAPSTONE_PHANTOM_CATALOG=1`일 때만 활성.
- 서명된 SECURITY_ADMIN, HOSP-A 소속만 허용. 환자/의료진/타기관 관리자 거부.
- 요청은 `{"datasetId":"SYNTHETIC_PHANTOM_24_SLICE_V1"}` 하나만 허용. 임의 환자 정보·UID·URL·영상 바이트를 받지 않음.
- 고정 생성기의 HP-TEST-PHANTOM-001, CT/MR Study 2개, 각각 Series 1개/Instance 12개만 등록.
- 기존 환자·Study·Series와 충돌하면 409. 동일 카탈로그 재요청은 추가 Study 0개. 임의 덮어쓰기 없음.
- 환자·Study·Series는 INSERT 트랜잭션으로 추가. 기존 기록/감사 hash chain을 재작성하지 않음.
- 인증된 등록 요청의 auditSessionId와 REQUESTED 감사 이벤트를 함께 보존. `registrationCommitAcknowledged=true` 응답은 저장 완료 후에만 반환. 거부는 안전한 reasonCode로 별도 감사. 실패 시 신규 미커밋 카탈로그는 메모리에서 제거하며 감사 chain 링크를 삭제하지 않음.
- 동의·접근토큰·TransferGrant를 발급하지 않음. 실제 A PACS 최신 검증, v3 PatientMapping, 독립 검토를 완료했다고 주장하지 않음.
- 스키마 필수 생년월일은 1970-01-01 합성 placeholder. 실제 환자 본인확인 값이 아님.

## 로그인 변경

`POST /api/capstone-demo/login`에 선택적 `patientProfile` 추가: DEFAULT(기존), PHANTOM만 허용. 강한 기존 시연 접근 키 검증 및 5분 JWT 유지. 클라이언트의 임의 patientId/role/등록 여부는 권한 근거로 사용하지 않음.

PHANTOM은 서버의 **커밋된** 환자·Study·Series 카탈로그와 정확히 일치할 때만 발급. 미등록/저장 실패 시 409. 응답의 demoContext는 선택한 합성 환자와 시작 Study를 전달한다. 웹·모바일은 그 컨텍스트를 사용하며 JWT와 접근 키는 메모리에만 보관한다. 모바일 환자 선택은 현재 서명 프로필에 고정한다.

## 영향과 검증

관련 요구사항: FR-006~009(메타데이터), FR-014~020(역할/기관/소유 범위), FR-037~041(감사). 동의·토큰·Gateway 기존 권한 계약은 유지. 환자 본인 픽셀 API와 신규 256×256 Viewer 흐름은 후속 작업.

영향 화면: 환자 웹·의료진 웹의 시연 환자 컨텍스트, 모바일 로그인. 영향 테스트: capstone-phantom-catalog, capstone-mock-idp, postgres-save-snapshot, mobile-capstone-auth 및 전체 회귀.

실제 독립 PostgreSQL 검증: `node scripts/verify-phantom-catalog-postgres.js`. 기존 서비스/volume을 사용하지 않는 tmpfs 테스트 DB에서 등록·보존·재연결·멱등성·타환자 차단·감사체인을 확인하고 소유한 임시 컨테이너만 정리한다. 실제 VM PACS/Viewer E2E를 대체하지 않는다.

첫 검증은 임시 init 서버 Unix socket readiness로 57P03 실패했다. TCP readiness로 수정했다. 다음 검증에서 한국 시간대의 DATE→UTC 변환이 전날을 반환하는 문제를 확인해 달력 날짜 보존으로 수정했다. 한국/UTC/미국 시간대 회귀를 추가했다. 실패 증적은 보존한다.

최신 실제 PG PASS 증적: `artifacts/workstation/phantom-catalog-postgres-1791531541784/result.json`. 추가 저장·기존 행 보존, 재연결 후 카탈로그/12장 Series/멱등성/감사 chain, 정확한 fixture cleanup PASS.

최종 현재 코드 검증: Node 전체 751/751 PASS, exit 0, 41.706초. 비밀정보 검사 PASS/findings 0. 서버·등록 모듈·웹·모바일 JS 문법 PASS. Supabase PostgreSQL 설계 스킬의 원자적 저장·충돌 검토 절차를 적용하되 기존 데이터와 충돌하는 경우 덮어쓰는 UPSERT 대신 거부하도록 구현했다.

## 서버 후보 이미지 검증 (2026-10-09 후속)

기존 로컬 Cloud 기준 이미지 `sha256:7f0901aa0e7e8f6b70a07ee980dcb5c0cf480c6e4ea4fa17b28231ffd3d7009a`를 확인하고 별도 로컬 base tag로 고정했다. `docker build --pull=false --build-arg CAPSTONE_BASE_IMAGE=highpass-platform-mvp:capstone-phantom-control-base-20261009 -f Dockerfile.phantom-catalog-control -t highpass-platform-mvp:capstone-phantom-control-20261009 .` exit 0.

후보 이미지 ID: `sha256:d638ccf024fdb00ca31a8feede83abb14826af6626b4d6d3097f481bcd809f26`.

- `node scripts/phantom-control-image-check.js <후보 ID>`: 11개 변경/핵심 의존 파일의 로컬 소스 SHA-256 일치 및 이미지 내부 문법 PASS, exit 0. 네트워크·포트·mount 없이 read-only/cap-drop 실행. 증적 `artifacts/workstation/phantom-control-image-1791532064519/result.json`.
- 같은 검사에 구버전 기준 ID 입력: 변경 파일 불일치/신규 파일 부재로 FAIL, exit 1. 예상된 음성 검증이며 구버전을 최신 구현으로 오판하지 않음. 증적 `artifacts/workstation/phantom-control-image-1791532112435/result.json`.
- 대상 이미지 지정 `container-scan.js`: HIGH 0 / CRITICAL 0, exit 0. `container-vulnerability-gate.js`: 동일 이미지 ID 기준 PASS, exit 0. 증적 `artifacts/security/container-scan/capstone-phantom-control-20261009.json`.
- 등록/로그인/Postgres snapshot 선택 회귀 16/16 PASS, exit 0. 비밀정보 검사 findings 0, exit 0. 이 후속 단계에서는 전체 751개 테스트를 다시 실행하지 않았으며 앞 단락의 전체 결과와 구분함.

배포 스크립트의 기본 image-only 검사는 유지했다. 별도 `--phantom-catalog --verify-rollback` 경로와 `infra/azure/capstone-phantom-catalog.compose.yml`을 추가했다. 이 경로는 control 서비스의 `HIPASS_CAPSTONE_PHANTOM_CATALOG='1'` 하나만 추가/활성화하며 나머지 Compose 설정은 기준과 완전 일치해야 한다. 신규 모듈·Mock IdP·생성기 소스도 이미지 attestation 대상이다. rollback은 기존 4개 파일/환경으로 복원하며 candidate 재승격 때만 선택 overlay를 적용한다. overlay는 고정된 소유 context의 정규 파일만 허용하고 기존 파일 덮어쓰기/심볼릭 링크를 거부한다. 등록 API 자체는 배포 스크립트에서 실행하지 않는다.

`test/capstone-cloud-phantom-rollout.test.py` 4/4 PASS: 기본 경로 opt-in 거부, 정확한 단일 opt-in 허용, 다른 환경변수·ingress·포트·mount·private network 변경 거부, context 경로 제한, 후보/rollback 환경 검사 구분. 실제 rollback 실행의 증거는 아니다. 비밀정보 검사 PASS/findings 0.

Azure 배포 스킬의 선행 조건 확인에서 `.azure/deployment-plan.md`가 없는 것을 확인했으나, 후속 검토에서 azure-prepare가 비-azd 기존 VM 업데이트에는 적용되지 않음을 확인했다. 이 파일 부재만을 배포 차단 원인으로 삼은 설명을 정정한다. 별도 기존 VM 계획과 실제 읽기 전용 preflight를 `docs/implementation/mediq-phantom-existing-vm-deployment-plan-2026-10-09.md`에 기록했다. Cloud 기준 실행 상태 PASS, A 팬텀 24장 원본/UID/mTLS/256×256 재검증 PASS. 공식 IaC Validated로 오인하지 않으며 Azure/B 서비스 교체 및 카탈로그 등록은 아직 실행하지 않았다. 모든 신규 증적은 DRAFT / UNASSIGNED.

미검증: 등록 HTTP 경로의 실제 Azure 호출, Cloud 배포·rollback, 새 B 이미지의 Container Gate·배포·rollback, A 팬텀 최신 원본 검증, 실제 256×256 암호화 Viewer, 모바일 QR의 신규 팬텀 종단 흐름. 기존 배포 PASS와 사람 검토를 신규 코드에 승계하지 않는다. 서버 이미지 소스·문법 및 취약점 검사는 실제 런타임 E2E의 증명이 아니다.

## 배포 다음 순서

## 400 응답 수정 실제 재검증 (2026-10-09 08:08 UTC)

수정 Cloud 이미지: highpass-platform-mvp:capstone-phantom-control-fix-20261009,
`sha256:4315941d000e93ffb7adda63f423b0c336662cff761d9aa7b0219db56ef0f6fa`.
새 이미지 11개 소스/문법 PASS (`phantom-control-image-1791533048526/result.json`), fresh Trivy HIGH/CRITICAL 0 및 Container Gate PASS (`artifacts/security/container-scan/capstone-phantom-control-fix-20261009.json`). 전체 Node 회귀를 다시 실행해 751/751 PASS, exit 0, 44.668초. Python 배포 계약 4/4 및 B 배포 안전성 7/7 PASS, 비밀정보 findings 0.

`artifacts/workstation/cloud-app-rollout-2026-10-09T08-05-02.064365+00-00/result.json`: 9개 검사 PASS. 기존 d638ccf 이미지로 실제 rollback 후 4315941 이미지 재승격 PASS. 이번 배포 전후 PG 컨테이너와 감사 4149개 해시 `8f075f4db40b7fa6cc4219d2eb37ca29dc47b07d166c55fdf3bc182aace4ef7c` 동일. 앞선 등록/로그인 검증으로 추가된 정상 감사 기록을 과거 4136개로 되돌리지 않았다.

`capstone-phantom-catalog-live-check.py --expected-image-id <4315941 전체 ID>` exit 0:
`artifacts/workstation/phantom-catalog-live-1791533289688/result.json` 8개 PASS. 실제 B HTTPS에서 임의 dataset 입력 400 및 정확한 `{error:SYNTHETIC_DATASET_REQUIRED}`, no-store 확인. 로그인, 무인증 401, 환자/의료진 403, 정상 카탈로그/중복 추가 0, PHANTOM 로그인/본인 Study 2개 모두 PASS. 과거 실패 증적은 삭제하지 않는다. wrapper의 정확한 image ID 인자는 필수이며 SHA-256 형식 검사 후 SSH 대상 실행 이미지와 비교한다.

B 클라이언트 후보는 `highpass-platform-mvp:capstone-mobile-phantom-ui-20261009`, ID `sha256:a495ae00fa15a12a5001ef46e463f843f94add39e37f0c476d3a85e810420913`. 기존 B d94f740 이미지 위에 최신 웹/모바일 정적 파일만 복사. 31개 자산 hash 일치, 새 Trivy HIGH/CRITICAL 0, Container Gate PASS. 이 준비 결과만으로 B 배포나 브라우저 성공을 주장하지 않는다.

후속 실제 B 배포: `artifacts/workstation/mobile-b-rollout-20261009T080850Z/result.json` PASS. d94f740 기준으로 실제 rollback/재승격 검증, 기존 암호화/진단/Compose/security/mount/port 구성 보존. 현재 B는 a495ae00 이미지다. `presentation-ui-inventory-1791533466763/result.json`에서 capstone-auth.js를 포함한 실제 HTTPS 자산 11/11 현재 소스 일치 PASS. 새 이미지의 브라우저 PHANTOM/256×256/QR/철회 E2E는 아직 NOT VERIFIED.

## 실제 Cloud 배포·HTTP 등록 결과 (2026-10-09 후속)

`cloud-app-rollout-2026-10-09T07-56-55.256549+00-00/result.json` (artifacts/workstation): 9개 배포 검사 PASS, exit 0. 후보 이미지 d638ccf...로 control/ingress 실행, 기존 이미지/4개 Compose 파일로 실제 rollback, 후보/등록 opt-in 재승격 PASS. PostgreSQL 컨테이너 ID 및 기존 감사 4136개 hash fingerprint `e48ef4cf247bdaf7995bc3c0ea59a30a57d76299d8cc9d92e75b8df3bee16922` 동일. 기존 DB/volume, 키, 역할, 네트워크 변경 없음.

`scripts/capstone-phantom-catalog-live-check.py`는 클라우드의 기존 시연 키를 root SFTP로 읽어 익명 stdin으로만 Node 검사에 전달한다. 키/JWT는 로그·파일·환경변수·URL에 보관하지 않는다. Node는 실제 B 포털의 strict HTTPS/CA 검증 및 정상 Origin을 사용한다.

- 첫 호출 `phantom-catalog-live-1791532811195/result.json`: 로그인 단계 FAIL. 검사 요청에 Origin 헤더가 없어 B 포털에서 정상 차단했으며, 검사 요청만 수정함. 보안 설정 변경 없음.
- 수정 후 `phantom-catalog-live-1791532840128/result.json`: 7개 검사 PASS, exit 0. 정상 시연 로그인, 무인증 401, 환자/의료진 등록 403, HOSP-A 보안 관리자 고정 카탈로그 등록 Study 2개/Instance 24개, 재요청 추가 0, PHANTOM 로그인 및 본인 Study 목록 2개. 등록 응답의 commit acknowledgement/동의 미발급/no-store 확인.
- 음성 입력을 확대한 최신 `phantom-catalog-live-1791532909608/result.json`: 전체 FAIL, exit 1. 앞선 7개는 다시 PASS(추가 Study 0)이나 임의 dataset은 차단하면서 400 대신 500 응답. ServiceValidationError의 HTTP 변환 누락을 확인했다. 정상 등록 PASS를 전체 HTTP 계약 PASS로 확대하지 않음.

로컬 src/server.js에서 이 등록 경로의 감사 저장 후 ServiceValidationError만 안전한 `{error:code}` 및 정의된 statusCode로 반환하도록 수정했다. 내부 stack/details를 응답에 넣지 않음. Node 문법, 관련 기존 회귀 16/16, 비밀정보 검사 PASS. 이 수정은 **현재 Azure 이미지에 아직 포함되지 않았고 실제 400 재검증은 NOT VERIFIED**. 기존 d638ccf 이미지 attestation은 당시 코드 기준이며 이후 로컬 수정에 승계하지 않는다. 다음은 수정 이미지 재빌드·새 스캔·배포/rollback·임의 입력 400 검증 후 B 클라이언트 및 Viewer 단계이다.

모든 신규 증적 DRAFT / UNASSIGNED. 현재 레거시 MVP 합성 환자 메타데이터 등록이지 v3 PatientMapping/Grant 승인 또는 전체 MVP 달성은 아니다.

1. A의 24장 실제 원본·UID·해시 재확인.
2. Dockerfile.phantom-catalog-control로 필요한 서버/고정 생성기 파일 포함, 소스 해시·Security/Container Gate.
3. 기존 Azure Compose context에 등록 opt-in만 명시적으로 추가해 배포·rollback 검증. 기존 DB·키·secret·감사 기록 보존.
4. 인증된 HOSP-A 보안 관리자 프로필로 등록 API 실행. DB 직접 INSERT 금지.
5. 새 카탈로그 등록 증적 확인 후 웹/모바일 새 클라이언트 배포.
6. PHANTOM 로그인, 명시적 Series 동의, B Viewer 256×256/12 슬라이스, 실제 Key Vault, 철회·범위 밖 접근 차단 검증.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
