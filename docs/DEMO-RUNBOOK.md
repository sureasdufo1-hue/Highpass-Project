# Capstone Demo Runbook

> **CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY**
> NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM.

## 1. 사전 준비

- Windows 11 + WSL2 + Docker Desktop(Linux containers)
- Node.js 20 이상, Repository에 고정된 `pnpm@11.7.0`
- 포트 `3000`, `3443` 사용 가능
- 합성 데이터와 개발 인증서만 사용하며 실제 환자정보·운영 인증서는 사용하지 않는다.

개발 인증서가 없거나 만료 정책을 통과하지 못할 때만 다음을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-dev-certs.ps1
```

브라우저에서 화면을 시연하려면 조직 정책에 따라 개발 CA를 사전에 신뢰한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\trust-dev-ca.ps1
```

TLS 경고 화면을 우회하거나 `--insecure`, `-k`, `verify=false`를 사용하지 않는다.

## 2. 시작과 readiness

한 명령으로 빌드·시작하고, 6개 핵심 서비스와 HTTPS health가 준비될 때까지 최대 120초 동안 확인한다.

```powershell
pnpm run mvp:start
```

패키지 실행이 어려운 제한망에서는 이미 설치된 Node.js로 같은 검증기를 직접 실행할 수 있다.

```powershell
node scripts\mvp-verify.js --start
```

이미 실행 중인 스택은 다음으로 재확인한다.

```powershell
pnpm run mvp:readiness
```

접속 주소:

- 데모 포털: `https://localhost:3443/hipass/`
- OHIF Viewer: `https://localhost:3443/`
- HTTPS health: `https://localhost:3443/api/health`
- HTTP 진입점: `http://localhost:3000` (HTTPS 리다이렉트 확인용)

Orthanc 직접 포트는 호스트에 공개되지 않는 것이 정상이다.

## 3. 발표 흐름

1. 포털 상단의 `CAPSTONE MVP · 합성 데이터 · 비운영 기술 테스트 환경` 배지를 확인한다.
2. 환자 역할에서 합성 환자 `P-1001`, 병원 A→B, 목적, Study/Series와 `VIEW_ONLY` 권한을 선택한다.
3. 동의를 생성하고 의료진 역할에서 단기 토큰을 요청한다.
4. Study→Series→Instance 순서로 조회하고 Viewer 진입과 영상 스트리밍을 확인한다.
5. VIEW_ONLY 다운로드 차단 및 감사로그의 actor/hospital/Study/Series/result/reason/trace/token 식별자를 확인한다.
6. 동의를 철회하고 기존 토큰 재사용과 신규 토큰 발급이 모두 거부되는지 확인한다.

화면에 토큰, 개인키, 인증서 경로, stack trace가 표시되면 즉시 시연을 중단한다.

## 4. 정상·음성 자동 검증

전체 로컬 검증:

```powershell
pnpm run mvp:verify
```

발표 패키지 동결 전 추가 로컬 Gate:

```powershell
pnpm run privacy:db-gate
pnpm run test:cert-rollback
pnpm run ops:expiry
```

위 순서와 fresh Trivy scan, 전체 MVP를 한 번에 실행하려면 다음을 사용한다.

```powershell
pnpm run mvp:finalize
```

검증기는 프로젝트명·네트워크명·mTLS 시험 이미지를 `highpass-phase2` 기준으로 결정한다. 필요하면 `HIPASS_COMPOSE_PROJECT`, `HIPASS_NETWORK_PREFIX`, `HIPASS_MTLS_TEST_NETWORK`, `HIPASS_MTLS_TEST_IMAGE`로 명시적으로 재정의한다.

포함 항목:

- Node 단위·통합 테스트
- 인증서 만료 정책과 만료 fixture
- HTTPS E2E: 동의→정책→토큰→DICOMweb→Viewer 경로→감사→철회/만료
- mTLS 정상 및 무인증·비신뢰·SAN/EKU 불일치·만료 인증서 거부
- Orthanc/DB 직접 접근 차단과 네트워크 경계
- Security/Container Gate
- `DRAFT / UNASSIGNED` 컴플라이언스 증적 생성 및 manifest 검증

각 명령은 `PASS`, `FAIL`, `ENVIRONMENT_BLOCKED` 중 하나와 적절한 종료 코드를 반환한다. 미실행 또는 외부 의존 검증을 PASS로 기록하지 않는다.

## 5. 장애 복구

| 증상 | 확인과 복구 |
|---|---|
| Docker daemon 오류 | Docker Desktop의 Linux Engine을 확인한 뒤 `pnpm run mvp:preflight` 재실행 |
| readiness timeout | `docker compose -p highpass-phase2 ps -a`와 해당 컨테이너 로그 확인 후 `pnpm run mvp:start` 재실행 |
| 브라우저 CA 오류 | `trust-dev-ca.ps1`을 조직 정책에 따라 실행하고 브라우저 재시작. 경고 우회 금지 |
| 포트 충돌 | `Get-NetTCPConnection -LocalPort 3000,3443`으로 점유 프로세스를 확인하고 충돌 해소 후 재시작 |
| mTLS 인증서 오류 | 개발 인증서 재생성 후 `pnpm run mvp:start`; 만료 `bad-client` fixture는 교체 금지 |

복구 리허설 기준선(2026-09-08): 전체 중지 8.94초, 재기동 후 readiness 34.62초, PostgreSQL 및 Orthanc named volume 보존 PASS.

## 6. 종료와 데이터 처리

기본 종료는 컨테이너만 중지하고 named volume을 보존한다.

```powershell
pnpm run mvp:cleanup
```

재시작:

```powershell
pnpm run mvp:start
```

`docker compose down -v`는 합성 DB와 Orthanc 데이터를 삭제하므로 명시적인 초기화 승인이 있을 때만 사용한다.
