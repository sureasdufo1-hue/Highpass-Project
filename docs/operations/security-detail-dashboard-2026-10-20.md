# 관제 요청 상세·보호 설정·QR 생애주기

관련 요구사항: FR-037~FR-041. 환자 동의/접근 정책은 FR-001~005,
FR-014~025 경로를 변경하지 않고 기존 이벤트만 표시한다.

## 변경

- 기존 상황판·이벤트 탐색기·보고서를 유지하고 건강도우미 요청, QR 생애주기,
  보호 설정 탭 추가. 상황판에는 QR 단계별 로그 건수와 상세 진입 버튼 제공.
- `/api/security/events` 응답에 `helperRequests`, `qrLifecycle` 추가. 기존
  보안관리자 인증 경로와 기간 검증 유지. 요청 최신 100개, 티켓 최신 30개.
- 요청 상세: 감사 세션 ID, 시작/종료, 두 감사 로그 간 간격, 단계·최종 결과,
  실패 코드. 과거 메타데이터 미수집 항목은 미기록 표시.
- 새 `audit_logs.helper_metadata jsonb` nullable 컬럼. 질문/답변/환자값 없이
  설정 모델 태그, KB/보완자료 버전, 근거 ID/개수, 생성/비생성 안내, 실패 코드만
  allowlist로 수집. 실제 모델 버전은 관측 정보가 없어 null이며 설정 태그와 구분.
- 메타데이터가 있는 신규 이벤트만 감사 hash payload에 canonical 메타데이터 추가.
  기존 이벤트 해시와 행은 변경하지 않음. JSONB 왕복 시 동일 canonical hash 확인.
- `/api/security/protection` GET: 서버 보안관리자 권한 검사, query 거부,
  no-store, 조회 감사기록. 공개 Edge는 이 정확한 GET 경로만 추가 허용.
- DB 접속 TLS는 현재 앱 연결에서 직접 확인. Azure 설정은 root가 작성한 읽기
  전용 `/run/security-protection/status.json` 조회본. 확인 시각과 24시간 경과 표시.
  앱에 Docker 소켓·추가 Azure 권한을 부여하지 않음.
- QR은 티켓 ID를 해시한 참조로 그룹화. 발급/조회/접수/철회/거부 로그를 연결.
  철회와 물리적 삭제, 기간 내 이력과 현재 유효 상태를 구분.

## 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| 관련 단위/HTTP/권한/무결성 회귀 | PASS | 39/39 |
| 환자·의료진·미인증 보호 설정 거부 | PASS | 격리 HTTP 시험 |
| 공개 미인증 경로 | PASS | protection 401, 새 JS 200, 웹 200 |
| 배포 파일·후속 모바일 CSS | PASS | 컨테이너 해시 및 공개 CSS/후보 일치 |
| 앱 실제 TLS 및 보호 조회본 6개 | PASS | live-component-check.json |
| 메타데이터 DB 저장/조회/롤백·해시 왕복 | PASS | 테스트 이벤트 잔존 0건 |
| 기존 로그 projection | PASS | 요청 162건 / QR 로그 1140건 / 최신 연결 티켓 30개 |
| 데스크톱·390px UI | PASS | 6장, 가로 넘침·pageerror 없음. 합성 UI fixture |
| DB·DR 유지 | PASS | DB 시작 시각, WAL sender PID 동일/streaming; TLS 1.3; 비TLS 0 |
| 실제 관리자 로그인 후 화면 클릭 | NOT VERIFIED | CUA 브라우저 연결 시간 초과 |
| 실제 모델 생성·가중치 버전 | NOT VERIFIED | 기존 SSH 전달 경로 장애는 별도 복구 필요 |

## 배포와 복구

Control: `sha256:a4c686e8640cc41d040cfc21690fb8b8e832263ea1dac06f2f4ca17371945286`

Web: `sha256:03c97ac8f238d1669f85ee55a99d20daca244408496c27e48f43b1ab6a093d24`

배포 후보는 현재 Azure 파일에 이번 작업의 delta만 적용했다. 기존 TLS 설정과
그 외 미커밋 DR 작업을 보존한다. 신규 DB 컬럼은 롤백 시 유지한다.

새 메타데이터가 기록된 후 옛 Control 이미지로 회귀하면 옛 코드가 새 감사 해시를
검증하지 못한다. 따라서 전체 rollback 도구는 해당 행이 존재하면 중단한다.
그 경우 새 감사 reader/hash 지원을 유지한 수정 후보를 배포하거나 웹만 되돌린다.
전체 복구 리허설은 수행하지 않았다.

증적: `artifacts/azure/security-detail-20261020/`,
`artifacts/azure/security-detail-mobile-20261020/`.
화면 검증: `output/playwright/security-detail-20261020/`.
운영 조회본은 `scripts/security-protection-snapshot.py`의 입력 JSON을 최신 조회로
갱신한 뒤 다시 생성해야 한다. 현재는 주기적인 Azure 설정 수집이 아니다.
