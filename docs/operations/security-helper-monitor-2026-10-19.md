# 건강도우미 RAG 관제 연결

관련 요구사항: FR-037~FR-041. 기존 보안관리자 권한 경계를 유지한다.

## 구현

- `HEALTH_HELPER_REQUEST`를 건강도우미 분류로 검색한다.
- 조회 기간 내 auditSessionId 기준 요청 수와 로그 수를 분리한다. 연결 불가 로그는 별도 집계한다.
- 생성·근거/시나리오 안내·안전 안내·실패·종료/결과 미확인을 구분한다.
- 시작·종료 로그가 모두 있는 요청만 감사 로그 간 간격 중앙값/P95를 계산한다. 모델 추론 시간 또는 전체 요청 지연시간으로 주장하지 않는다.
- 기존 `/api/security/events` 응답에 `chart.helper`와 `helperConnection` 필드를 추가했다. 기존 필드는 유지한다.
- 보안관리자의 관제 조회 시 고정된 비공개 소켓 `/health`를 확인한다. 3초 제한, 응답 4KiB 제한, 30초 캐시, 동시 조회 공유. 외부 URL 입력이나 모델 생성은 하지 않는다.
- 연결 상태 변경 시 `HEALTH_HELPER_CONNECTION_CHECK` 감사 기록을 저장한다. 조회 기반 확인이며 상시 SSH 로그 수집 또는 연속 모니터링은 아니다. 첫 조회와 프로세스 재시작 후에도 기록한다.
- SSH 전달 경로의 응답 도달과 SSH 프로세스 자체 상태를 구분한다. 중계 응답이 없으면 모델 상태는 미확인이다.
- 로컬 중계의 `/health`는 loopback Ollama 모델 목록에서 `qwen3.5:4b` 존재만 확인한다. 모델의 생성 성능이나 응답 품질을 검증하지 않는다.
- 질문·답변·프롬프트·환자 검사값·키를 관제 수집 필드에 추가하지 않았다.
- 관련 이벤트와 기존 사건/기간 보고서 경로를 사용한다. 상태 확인은 현재 시점이고 요청 집계는 선택 기간 기준이다.

## 배포·검증

| 항목 | 결과 | 근거 |
|---|---|---|
| 요청 집계 및 기존 관제·보고서 테스트 | PASS | 17/17 |
| Azure Control/Web 실행 | PASS | Control healthy, Web running |
| 배포 파일 해시 | PASS | 컨테이너 소스 및 공개 JS/CSS 일치 |
| 다른 컨테이너 보존 | PASS | 배포 전 ID·이미지·실행 상태 비교 |
| 비로그인 관제 접근 | PASS | HTTP 401 |
| 실제 건강도우미 전달 경로 | FAIL | 배포 전 Azure Control의 비공개 소켓 GET /health 응답 불가 |
| 현재 중계·모델 정상 동작 | NOT VERIFIED | 소켓 응답 불가. 로컬 11436 리스너·중계 프로세스도 조회되지 않음 |
| Azure 관리자 로그인 화면 조작 | NOT VERIFIED | 실제 관리자 세션 미사용 |

로컬 중계 `/health` 코드 변경은 저장소에 포함했으나 실행 중인 중계 프로세스를 찾지 못해 재기동하지 않았다. 모델 호스트와 터널 운영 위치를 확인한 뒤 중계 재기동과 전체 응답 시험이 필요하다. 관제 연결 구현과 기존 RAG 연결 장애 복구를 구분한다.

배포 증적: `artifacts/azure/security-helper-monitor-20261019/`.
배포 도구: `scripts/security-helper-monitor-release.py`.
복구 구성: `/opt/highpass/security-helper-monitor-20261019/{control,web}/before.json`.
복구 명령: `python scripts/security-helper-monitor-release.py rollback`.
