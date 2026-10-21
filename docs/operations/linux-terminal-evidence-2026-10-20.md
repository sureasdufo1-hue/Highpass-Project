# 실제 Linux 터미널 관제 증적

관련 요구사항: FR-037~FR-041. 기존 동의·권한·토큰 경로는 변경하지 않음.

## 목적과 범위

프론트엔드 집계/조회 보고 화면과 구분되는 실제 Azure Control VM SSH
터미널을 촬영했다. 고정 호스트키 인증을 사용하며 서비스 재기동,
DB/접근정책 변경, 동의·QR 업무 이벤트 생성은 수행하지 않았다.
원격 root 전용 조회 스크립트만 설치했다.

## 결과물

사용자 Downloads의 `MediQ_리눅스터미널_증적_20261020`에 원본 PNG 17장,
주석 PNG 17장, 명령 출력 TXT 17개, 편집용 HTML, 목록과 SHA-256을 보관한다.
원본은 실제 콘솔 HWND의 PrintWindow 캡처다. 출력 텍스트를 재그린 이미지가 아니다.
주석은 별도 DOM 레이어이며 원본 PNG를 수정하지 않았다.
질문/답변·환자/계정 식별자·개인키·토큰·해시 값은 출력하지 않았다.

## 관측 결과

| 항목 | 결과 | 증거 |
|---|---|---|
| 17개 조회 완료·SSH 성공 | PASS | capture-results.json, transcripts |
| QR 발급·접수·철회·교체·거부 이력 | PASS | 05-qr |
| 동의 생성·조회·철회 이력 | PASS | 06-consent |
| DB 위치·현재 TCP TLS·비TLS 거부 | PASS | 12~14 |
| 현재 helper SSH 연결 정상 | FAIL | 11: UNAVAILABLE / relay·model UNKNOWN |
| 모델/KB/근거 메타데이터 수집 실적 | NOT VERIFIED | 10: 242개 로그 중 metadata 0개 |
| A/B VM 내부 및 영상 종단 동작 | NOT VERIFIED | Control 측만 관측 |
| 환자 데이터 필드 암호화 | NOT VERIFIED | 15는 해시 건수/길이만 확인 |
| 새 Azure API 설정 재조회 | NOT VERIFIED | 16은 확인 시각이 붙은 운영자 스냅샷 |
| WAF 수집 정상 | NOT VERIFIED | 17의 제한된 Docker 로그 출력 0행 |

WireGuard 피어 1은 89초, 피어 2는 293,376초 전 핸드셰이크다.
인터페이스는 UP이나 피어 2의 최근 연결 확인이 필요하다. 별칭과 A/B의
대응은 이번 증적에서 추정하지 않는다. 과거 집계를 현재 공격 건수로 해석하지 않는다.
모든 SQL은 READ ONLY 트랜잭션 및 5초 statement timeout을 사용한다.
단일 비TLS 차단 시험은 비밀번호 없이 수행하며 연결 단계에서 거부됐다.

## 재현 도구

- linux-terminal-evidence.py: 원격 읽기 전용 명령·필드 최소화
- install-terminal-evidence.py: 고정 호스트키 SSH 설치
- show-linux-terminal-evidence.ps1: 전용 콘솔에서 실제 SSH 출력
- capture-terminal-window.ps1: 입력/포커스 조작 없는 창 촬영
- collect-terminal-screenshots.py: 조회·완료·촬영 순서 제어
- build-terminal-evidence.py / render-terminal-annotations.mjs: 별도 주석 레이어
- package-terminal-evidence.py: 목록·무결성 해시·ZIP

애플리케이션 배포 또는 Git 커밋·푸시는 이번 증적 작업에 포함하지 않았다.
