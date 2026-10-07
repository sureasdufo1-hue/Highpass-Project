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

PHR ImagingStudy–Orthanc live mapping 확인은 실행 중인 Compose 스택의 내부 네트워크에서 수행한다.

```powershell
pnpm run phr:verify-mapping
```

이 명령은 `PHR-T04` 정상 매핑과 `PHR-T05` 비매핑 음성 케이스를 검사한다. 호스트 직접 실행용 `phr:verify-mapping:local`은 컨테이너 DNS에 접근할 수 없어 `SOURCE_UNAVAILABLE`이 될 수 있으므로 발표 검증 결과로 사용하지 않는다.

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


---

## 7. 3분 / 5분 캡스톤 현장 시연 가이드 (Live Demo Walkthrough)

심사위원 및 평가위원을 대상으로 한 모바일 PWA ↔ 병원 SaaS 실시간 연동 시연 대본입니다.

### 7.1 화면 배치 권장
- **좌측 화면 (또는 스마트폰 단말)**: 환자용 MediQ 모바일 PWA (`http://localhost:3000/mobile/`)
- **우측 화면 (PC 브라우저)**: 가상 B병원 전자의무기록/PACS SaaS (`http://localhost:3000/`)

### 7.2 3분 핵심 시연 타임라인

| 시간 | 역할 | 시연 행동 | 핵심 설명 멘트 |
|---|---|---|---|
| **0:00 ~ 0:45** | 환자 (모바일) | 1. `1초 생체인증` 터치하여 앱 잠금 해제<br>2. [영상열람] 탭에서 50-Slice Brain MRI **Cine 연속 재생** 스크러빙 시연<br>3. [공유·QR] 탭에서 **4단계 위저드** 진행: 가상 병원 B 선택, 24시간 제한, 1회용 QR 발급 | "기존의 번거로운 플라스틱 CD 발급 대신, 환자가 모바일 PWA에서 FIDO2 1초 간편인증으로 본인 영상을 멀티슬라이스 동영상(Cine)처럼 부드럽게 직접 확인하고, B병원으로의 공유 동의와 1회용 암호학적 QR 티켓을 즉시 생성합니다." |
| **0:45 ~ 1:45** | B병원 의사 (SaaS) | 1. B병원 화면에 **'모바일 QR 수신 감지'** 알림 실시간 표시 확인<br>2. [QR 현장 접수] 탭에서 **원클릭 접수** (또는 카메라 스캔)<br>3. ABAC 검증 후 **단기 DICOMweb 토큰(10분)** 발급<br>4. Cloud DICOM 뷰어로 자동 전환되어 슬라이스 렌더링 확인 | "환자가 발급한 QR 코드가 브로드캐스트 채널을 통해 B병원 진료실에 실시간 감지되었습니다. 의사가 현장 접수하는 순간, 서버에서 환자 동의·병원 일치 여부를 Fail-Closed로 검증하고 10분짜리 단기 WADO-RS 토큰을 발급하여 안전하게 스트리밍합니다." |
| **1:45 ~ 2:30** | 보안 / 상호작용 | 1. 모바일 앱 화면이 실시간으로 **'B병원 접수 완료 (소진됨)'**으로 자동 변경된 것 확인<br>2. SaaS에서 동일 티켓을 재접수 시도 -> **TICKET_ALREADY_USED 재사용 공격 차단** 확인 | "환자 모바일 앱은 원격에서 티켓 소진 상태를 실시간 통보받습니다. 악의적인 재사용 공격을 방지하기 위해 1회 소진된 티켓은 암호학적으로 즉시 파기되며 재사용이 원천 차단됩니다." |
| **2:30 ~ 3:00** | 환자 / 감사 | 1. 모바일에서 **[공유 즉시 철회 (QR 폐기)]** 클릭<br>2. B병원 화면에 **동의 철회 경고** 실시간 연동 확인<br>3. B병원 [감사로그] 탭에서 `CONSENT_REVOKED`, `CLAIM_VERIFIED` 무결성 로그 확인 | "환자가 언제든지 동의를 즉시 철회할 수 있으며, 철회 즉시 모든 단기 토큰이 무효화되고 접근이 차단됩니다. 모든 과정은 보안 감사로그에 위변조 불가능하게 영구 기록됩니다." |

### 7.3 핵심 보안 계약 (Security Invariants) 검증 포인트
- **Zero Browser Plaintext Storage**: `localStorage` 및 `sessionStorage` 사용 일체 없음 (브라우저 DevTools Application 탭에서 증명 가능).
- **단기 토큰 강제**: 영상 원본이 Control Plane에 영구 저장되지 않고 10분 유효기간 만료 시 자동 파기.
- **Fail-Closed 원칙**: 동의 불일치, 병원 불일치, 만료 티켓 요청 시 어떠한 영상도 유출되지 않고 즉시 차단.
