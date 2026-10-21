# 보안관제 상황판·탐색기·보고서 분리

관련 요구사항: FR-037~FR-041. 화면 구성 변경이며 서버의 인증·접근정책·감사 API 계약은 유지한다.

- 상황판: 앱 이벤트 지표, 시간 추이, 결과 비중, 주요 사유, 출처 수집 상태. 개별 로그 목록은 숨긴다.
- 이벤트 탐색기: 검색·필터·페이지 이동·사건 상세·검토 기록. 그래프 선택 시 해당 조건으로 이동한다.
- 보고서: 기간 보고서와 개별 사건 바구니. 탭 이동 시 기존 선택을 유지한다.
- 공통 기간 선택: 오늘·최근 24시간·최근 7일·이번 달·직접 선택(최대 31일).
- 발표 보기: 보조 그래프·긴 도움말을 접고 조회 기간과 수집 상태를 유지한다.
- 탭 키보드 탐색: 방향키·Home·End, aria-selected, tabpanel 연결.

## 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| 기존 관제·보고서 테스트 | PASS | 14/14 |
| 탭별 패널 표시·숨김 | PASS | 로컬 합성 fixture 브라우저 확인 |
| 최근 7일 조회 후 탭 이동 | PASS | 선택값 168과 조회 시작·종료 유지 |
| 모바일 가로 넘침 | PASS | 390px 뷰포트, 문서 폭 390px |
| 데스크톱 렌더링 | PASS | output/playwright/security-tabs-dashboard.png, 1440px |
| 후보 JS 문법·빌드 | PASS | Azure stage 결과 |
| Azure 배포·실행 | PASS | deploy 및 verify 결과, 웹 컨테이너 running |
| 공개 파일 일치 | PASS | JS/CSS 3개 응답과 배포 후보 SHA-256 일치 |
| 웹·모바일 진입점 | PASS | /hipass/ 및 /mobile/ HTTP 200 |
| Azure 로그인 후 실제 감사 데이터 상호작용 | NOT VERIFIED | 로컬 fixture와 공개 파일 확인은 인증된 운영 화면 검증과 구분 |

로컬 브라우저에는 합성 이벤트 60개만 사용했다. favicon 404 외 앱 오류는 관찰되지 않았다.

배포 도구: `scripts/security-console-tabs-release.py`.
배포 증적: `artifacts/azure/security-console-tabs-20261019/`.
복구 구성: `/opt/highpass/security-console-tabs-20261019/web/before.json`.
복구 명령: `python scripts/security-console-tabs-release.py rollback`.
capture는 커밋 전 HEAD와 작업 트리 차이를 현재 Azure 파일에 적용하므로 완료한 릴리스를 재캡처하지 않는다.
