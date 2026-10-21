# 보안관제 거부 사유 해설 배포

- 관련 요구사항: FR-037~FR-041 (감사 기록 조회·분석 표현)
- 범위: 웹 관제 화면과 인쇄 보고서. 인증·정책·API 계약 변경 없음.
- 6개 사유에 한글 제목과 원래 코드를 병기하고 발생 사실·확인할 조치를 제공한다.
- 관련 이벤트 보기에서 해당 앱 사유로 검색한다. 개별 이벤트의 보고서 담기는 기존 검증 경로를 사용한다.
- 비율의 분모는 앱 거부·실패 로그이며 요청 수나 공격 수를 뜻하지 않는다.
- 원본 JSON/CSV 감사 근거는 유지하고 인쇄 보고서에 참고 해설을 추가한다.

## 배포

현재 Azure 웹 이미지를 기준으로 정확한 문맥의 변경만 적용했다. 기존 웹 시작 스크립트는 현재 배포본 그대로 보존했다.

- 진입점: https://highpass-demo.japaneast.cloudapp.azure.com/hipass/
- 웹 이미지: `sha256:b46a75cdb91256f53cf2e09f12fe9f6a39f5484ff8a7f700c9509b6746148b0a`
- 배포 도구: `scripts/security-reason-guide-release.py`
- 로컬 증적: `artifacts/azure/security-reason-guide-20261019/`
- 서버 복구 구성: `/opt/highpass/security-reason-guide-20261019/web/before.json`
- 복구 명령: `python scripts/security-reason-guide-release.py rollback`
- capture는 커밋 전 HEAD와 작업 트리의 차이를 사용한다. 이미 배포한 릴리스를 재캡처하지 않는다.

## 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| 관제·일반 보고서·기간 보고서 회귀 | PASS | Node 테스트 14/14 |
| 후보 JS 문법 | PASS | 배포 stage의 컨테이너 내부 검사 |
| 배포 및 컨테이너 실행 | PASS | deploy.json, verify.json |
| 공개 JS/CSS 3개 파일 | PASS | HTTPS 응답과 후보 파일 SHA-256 일치 |
| 웹·모바일 진입점 | PASS | 각각 HTTP 200 |
| 비로그인 관제 API | PASS | HTTP 401 |
| 관리자 로그인 후 실제 클릭·인쇄·모바일 레이아웃 | NOT VERIFIED | 인증된 브라우저 조작은 이번 배포 검증에 포함하지 않음 |
| 실제 롤백 실행 | NOT VERIFIED | 복구 구성 보존, 전환 시험 미실행 |

공개 파일 SHA-256:

- security-console.js: `a614b0a522175cfbc6893596a31f32c6e90e51349f045c957ac38656cad28e8e`
- security-console.css: `4bc2e31923f79c7c43e29c0b82ff1d56ed6e8f6546fbfaa651109f3964d7cdc9`
- security-report.js: `819e9d0055f3751918eaa7905455cda441a917fca2c0a22174348cf7a21d2fbc`
