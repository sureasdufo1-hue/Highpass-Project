# 건강도우미 요청별 모델 버전과 사용자 로그인 후 자동 복구

## 목적 / 관련 요구사항

FR-037~FR-041 감사·관제. 기존 환자 인증·동의·단기토큰·Gateway 경로는 변경하지 않았다.
2026-10-20 실제 Azure 환자 요청과 최소 필드 서버 조회를 기준으로 작성했다.

## 분석한 기존 구조와 결정

Azure Control → 고정 SSH Unix 소켓 → Windows loopback 중계 → Ollama.
기존 helper_metadata JSONB가 모델명·KB·근거 등을 보관하지만 실제 요청의 modelVersion은 null이었다.
PC의 프로세스 중단과 남은 소켓 파일 때문에 연결이 끊길 수 있었다.

요청별 버전은 Ollama 모델 아티팩트 매니페스트 다이제스트로 정의했다.
태그는 변경될 수 있으므로 추론 전/후 tags, 로드된 ps, 실제 응답 모델명을 함께 대조한다.
이는 개별 가중치 blob 직접 해시나 원격 실행 증명은 아니다. 오래된 기록에 추정값을 채우지 않는다.
확인 실패 시 모델 생성 성공으로 처리하지 않고 기존 안전한 대체 안내 경로를 사용한다.

로그인 전 SYSTEM 서비스보다 기존 사용자의 고정 SSH 키와 최소 권한을 유지하는
Interactive/Limited 사용자 로그온 작업을 선택했다. 비밀번호를 저장하지 않는다.
종료·절전·미로그인 중 모델은 사용 불가하다. 사용자 로그온 후의 자동 복구 구성이다.

## 생성/수정 파일과 기능

- src/helper-model-version.js: 고정 로컬 모델, 고유 태그·64자리 digest 검증.
- scripts/health-helper-local-relay.js: 추론 전/후·로드 모델 검증, protocolVersion=2, busy 상태.
- src/health-helper-candidate-generation.js / health-helper-patient-translation.js:
  환자 요청의 검증된 모델 버전 필수화.
- src/health-helper-ollama.js / health-helper-rag.js / helper-audit-metadata.js:
  진료 질문 경로와 완료 감사 메타데이터까지 버전 보존. 질문·답변 원문은 감사 메타데이터에서 제외.
- scripts/helper-runtime-supervisor.py: 정확한 실행 파일·인자별 감시, 모델 준비·유지,
  loopback 중계·SSH 복구, 소켓 종류·inode·리스너 확인, 단일 실행 mutex, 제한된 구조화 로그.
- scripts/install-helper-autostart.ps1: MediQ-HealthHelper-Runtime UserLogon 작업 등록,
  일반 실행 우선순위, IgnoreNew, 비밀번호 저장 없음.
- scripts/test-helper-auto-recovery.py: 신선한 READY 사전조건 후 정확한 세 프로세스만 종료하고
  동일 감시 작업의 새 PID 및 연결 복구 검증.
- scripts/helper-version-release.py: 현재 배포 이미지의 Control 5개 파일만 exact-context로 적용.
- 증적 수집·캡처·주석·통합 스크립트: 실제 화면 원본과 설명 레이어 분리.

## API와 보안 영향

공개 API 계약·DB 스키마 변경 없음. 기존 중계의 내부 JSON에 검증된 modelVersion을 추가했다.
환자 교육과 진료 질문의 실제 중계 응답은 모델 버전 누락 시 성공하지 않는다.
중계 모델·주소는 고정, loopback 바인딩과 고정 호스트키 SSH를 유지했다.
공개 포트·Azure 유료 리소스·관리자 권한 상승 없음. 키·토큰·환경변수 원문은 수집하지 않았다.
감시 상태/이벤트는 tmp/helper-runtime에 저장하며 Git 대상이 아니다.
동의·토큰·기존 감사 기록을 삭제/수정하거나 성공 로그를 직접 삽입하지 않았다.

## 검증 결과

|시험|결과|근거|
|---|---|---|
|선택 Node 테스트|PASS|36/36: 버전 불일치·누락 거부, 메타데이터/해시, 환자 RAG 회귀|
|Azure 배포·런타임 파일 일치|PASS|artifacts/azure/helper-version-20261020/verify.json, healthy|
|기존 보호 컨테이너 유지|PASS|protectedContainers PASS; DB 시작 시각 불변·DR streaming async|
|요청별 실제 모델 버전 저장|PASS|별칭 4d699ec9ed, 실제 환자 웹·DB 시작/완료 로그 대조|
|프로세스 장애 후 자동 복구|PASS|동일 감시 PID 28820, 세 worker 새 PID, 약 105초|
|자동 복구 후 실제 요청|PASS|20:03:13.121→20:03:31.539 KST, 생성 true·대체 false·근거 1개|
|작업 스케줄러 구성·실행 상태|PASS|Interactive/Limited, UserLogon, 현재 Running·감시 실제 동작|
|PC 전체 재부팅·실제 로그온 트리거|NOT VERIFIED|PC 재부팅/로그아웃을 수행하지 않음|
|CT·QR·의료진 뷰어 전체 흐름|NOT VERIFIED|이번 범위 밖|

digest: 2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd.
설정 모델 qwen3.5:4b. sourceIds=school-demo-medical-test-afp-tumor-marker-AFP-DEF-01.
KB 버전 medlineplus-upload-ko-20261012-v3 /
medlineplus-medical-tests-school-demo-ko-20261013-v1.
18,418ms는 감사 이벤트 간격으로 순수 모델 추론 시간이 아니다.
첫 두 자동 복구 시험은 실패했고 원본 JSON을 보존했다. CPU/I/O 우선순위·
진단 실행 중첩과 오래된 상태 판정을 보완한 뒤 실제 daemon을 기준으로 재시험했다.
Task lastResult=2147946720은 중복 시작 요청 거부 이력이다. 정상 종료 코드라고 표시하지 않는다.

## 배포와 복구

배포 Control image:
sha256:90d7765f83a923ce35d0e522d3aecc79ee812b8bbe2ecd12129f814d01b29167.
기존 compose/환경/인증/TLS/관제 mount를 보존한 Control-only 배포다. DB 재시작 없음.
이전 이미지·배포 기준은 로컬 artifacts/azure/helper-version-20261020에 보존했다.
롤백 시 현재 중계와 이전 Control의 응답 호환성을 확인해야 한다.
작업 중단은 해당 Task만 중단하고 정확히 소유한 worker만 대상으로 한다.
이 문서 작성 시 자동 복구 감시는 계속 가동 중이다. Git 커밋/푸시는 요청 범위가 아니다.

## 증적과 남은 위험

다운로드/MediQ_통합관제증적_20261020: 최신 실제 terminal 11장+browser 1장,
이전 장애·복구 terminal 27장, 보충 query-report 16장. 각각 원본·주석 분리.
구형 증적의 null 모델 버전과 실패 설명은 당시 상태이며 최신 결과와 구분한다.
원본 보존·파일 해시·ZIP 검증. 비밀정보·계정·토큰·원시 개인정보는 조회 단계부터 제한한다.

실제 OS 재부팅, 로그인 전 무인 운영, 장시간 안정성, PC 절전 복구는 별도 검증이다.
관측된 WireGuard 핸드셰이크를 병원 포털·영상 전체 성공으로 확대하지 않는다.
B overlay 포트 추가 탐색은 연결 미확인이다. 임상 콘텐츠 승인·실제 환자 서비스 승인을 뜻하지 않는다.
