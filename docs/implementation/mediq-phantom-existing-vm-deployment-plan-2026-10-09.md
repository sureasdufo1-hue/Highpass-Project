# Medi Q 합성 팬텀 기존 VM 업데이트 계획

2026-10-09. 상태: PROJECT PREFLIGHT PARTIAL / DRAFT / UNASSIGNED.
이 문서는 azd/azure-validate의 공식 Validated 판정이 아니다.

## 범위와 결정

기존 학생 구독의 highpass-cloud VM에서 control/ingress 컨테이너만 업데이트한다. VM, VNet, NSG, Key Vault, PostgreSQL 컨테이너/volume, 비밀정보, RBAC를 새로 만들거나 변경하지 않는다. 기존 승인 예산 $100 범위를 확대하지 않는다. 배포 도구는 기존 SSH/Docker Compose operator이며 azd/Bicep/Terraform provisioning이 아니다.

azure-prepare의 최신 적용 범위는 azd 명시 요청 또는 azure.yaml 존재 프로젝트이다. 이번 비-azd VM 업데이트에 azd 전환을 강제하지 않는다. 앞선 '해당 스킬 계획 파일 부재로만 배포 불가' 설명은 이 범위와 맞지 않아 정정한다. azure-validate의 AZCLI recipe도 main.bicep 및 ARM what-if 대상이므로, 수행하지 않은 IaC 검증을 PASS/Validated로 기록하지 않는다. 대신 현재 프로젝트의 실제 이미지·Compose·runtime·rollback 검증을 수행한다.

관련 요구사항: FR-006~009, FR-014~020, FR-037~041. 후속 Viewer 종단검증은 FR-021~036 및 기존 암호화/감사 요구사항에 영향.

## 고정 대상

- Azure CLI 읽기 전용 확인: Azure for Students 구독 a3c0e7d4-ce09-4991-946b-88574869edd9, Enabled. `python.exe -m azure.cli account show` exit 0. 기존 승인한 학생 구독이다.
- 실제 Azure 리소스명은 **vm-highpass-capstone**, RG-HIGHPASS-CAPSTONE-20261008, japaneast, VM running, public IP 138.91.2.60. `vm list -d --subscription <정확한 ID>` exit 0으로 SSH 대상과 일치 확인. OS hostname highpass-cloud와 Azure 리소스명이 다르므로 이름으로 임의 새 VM을 만들지 않는다. hostname 이름을 검색한 첫 CLI 조회는 []였고 전체 목록에서 실제 대상 일치를 확인했다.
- Cloud 기준 앱: sha256:7f0901aa0e7e8f6b70a07ee980dcb5c0cf480c6e4ea4fa17b28231ffd3d7009a.
- 후보 앱: sha256:d638ccf024fdb00ca31a8feede83abb14826af6626b4d6d3097f481bcd809f26 / highpass-platform-mvp:capstone-phantom-control-20261009.
- PG: sha256:8d0e686f1620c154c0c35ba8c7173a90f8f1a55ff8062f75677be1f3a4196568.
- 기존 context: /home/highpassadmin/.highpass-app-2026-10-08T19-03-15.237525+00-00, control.yml/ingress.yml/mock.yml/key-release.yml.
- 후보에서만 control.HIPASS_CAPSTONE_PHANTOM_CATALOG='1' overlay 허용. 다른 환경·포트·mount·private network 변경은 실패.

## 현재 실제 증거

`scripts/capstone-phantom-cloud-preflight.py` exit 0:
`artifacts/workstation/phantom-cloud-preflight-2026-10-09T07-53-14.368123+00-00/result.json`.
strict pinned SSH, VM hostname/WireGuard, 세 컨테이너의 기준 이미지·실행/health 상태, 소유 Compose context, 후보 정확한 ID와 24시간 미만 스캔 PASS. DB 읽기 전용 count: 환자 3 / Study 9 / 새 팬텀 환자 0. 감사 기록 4136개와 hash fingerprint 확보. 최신 기준값은 배포 직전에 다시 수집하며 이 값으로 고정 덮어쓰기하지 않는다.

`scripts/capstone-phantom-source-ops.py <고정 dataset> --verify-only` exit 0:
`artifacts/workstation/phantom-source-2026-10-09T07-53-39.587434+00-00/result.json`.
CT/MR 각 12장, 정확한 UID·manifest 원본 해시·mTLS WADO 무결성·256×256 PASS. QIDO Series 2개/각 Instance 12개. PACS 총 28개 그대로, 추가/삭제 0, 기존 Instance ID 보존, 소유 임시 probe/stage cleanup PASS. 병원 실제 데이터/임상 영상이 아니라 고정 수학적 팬텀이다. 이 증거는 B Viewer, 환자 동의, Key Vault 종단검증을 대체하지 않는다.

후보 이미지 11개 소스·문법 PASS, HIGH/CRITICAL 0, Container Gate PASS. 관련 배포 계약 테스트 4개 및 기존 rollback safety 2개 PASS. 세부 참조: docs/api/MEDI-Q-PHANTOM-CATALOG-CONTRACT.md.

## 실행 단계와 완료 증거

1. 계정/학생 구독과 기존 VM 대상 일치 확인. CLI 실패를 VM 장애로 분류하지 않는다. 확인 실패면 배포를 시도하지 않고 원인/재검증 명령을 기록한다.
2. 후보 이미지/scan/source attestation 최신성 및 현재 VM ID/context 재확인. 예전 증적 승계 금지.
3. `capstone-cloud-app-rollout.py`에 후보 image/image-id, 정확한 현재 ID, fresh scan, `--phantom-catalog --verify-rollback` 전달. 기존 bootstrap/migration/PG는 --no-deps로 실행하지 않는다.
4. 후보 readiness/runtime 확인 → 기존 이미지와 기존 overlay 없는 context로 실제 복원 → 후보 재승격. 실패 시 원래 설정 복구. PG 컨테이너 ID와 기존 감사 hash fingerprint 보존 확인. 서비스 교체 중 사용자의 동시 감사 추가가 발생하면 그대로 보존하고 무조건 데이터 손실로 단정하지 않는다. 현재 operator의 strict fingerprint 비교는 보수적으로 차단할 수 있으므로 외부 요청이 없는 점검창에서 실행한다.
5. 배포 결과 PASS 후에만 인증된 HOSP-A SECURITY_ADMIN으로 고정 등록 API 호출. 임의 patientId·UID 입력/DB 직접 INSERT 금지. 거부·정상·재요청·커밋 후 로그인 확인. 실패 시 신규 카탈로그/미발급 JWT 확인.
6. B 웹·모바일 최신 context 클라이언트 배포/rollback, PHANTOM 프로필 명시 선택.
7. Series 동의 → 의료진 RBAC/ABAC → 단기 토큰/DPoP → A mTLS → 실제 Key Vault → B Viewer 256×256 다중 슬라이스 → 감사 chain → 철회 후 차단. 범위 밖 Study/Series, 다른 사용자, QR 재사용, 토큰 만료·위변조도 분리 검증.
8. 반복/재시작/발표 Runbook과 독립 사람 검토. 신규 증적은 검토 전 DRAFT / UNASSIGNED.

후속 실제 실행: `artifacts/workstation/cloud-app-rollout-2026-10-09T07-56-55.256549+00-00/result.json` 배포/실제 rollback/재승격/기존 PG·감사 4136개 해시 보존 모두 PASS. 후보 d638ccf... 현재 실행. 카탈로그 정상/무인증·환자·의료진 거부/멱등성/PHANTOM 로그인·본인 Study 목록 PASS. 최신 확대 음성 검증 `phantom-catalog-live-1791532909608/result.json`은 임의 dataset 입력 500(기대 400)으로 FAIL. 실제 등록은 완료했으나 전체 HTTP 계약 검증은 미완료.

로컬 서버에서 입력 오류의 HTTP 변환 누락을 수정했다. 수정 이미지 재빌드/스캔/배포 및 실제 400 재검증이 다음 우선순위. 새 B 클라이언트 배포, 256×256 전체 Viewer/Key Vault/철회 시나리오는 아직 미검증. 전체 MVP/v3 완료 선언 금지.

실행 세션은 모두 종료했다. 새 preflight Python 문법 PASS, 비밀정보 검사 findings 0/exit 0. `az`가 현재 PATH에 없더라도 기존 설치된 Azure CLI의 Python module은 정상 실행되므로 재설치할 이유가 없다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
