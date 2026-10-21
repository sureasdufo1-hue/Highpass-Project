# 건강도우미 SSH·WireGuard 복구

관련 요구사항: FR-037~FR-041. 기존 환자 인증·동의·RBAC/ABAC·토큰 경계를 변경하지 않았다.

## 장애 관측

- Azure Control의 helper Unix 소켓 파일은 있었으나 `ss -xlpn` 리스너는 없었다.
- 모델 호스트 PC의 11434·11436 loopback API가 응답하지 않았다.
- VMware 실행 목록에 A VM은 있었으나 B VM은 없었다. B 피어 핸드셰이크는 약 3.4일 전이었다.
- Control·DB 컨테이너는 healthy였고 DB 시작 시각은 유지됐다.

## 복구

1. 설치돼 있던 Ollama를 `127.0.0.1:11434`에만 바인딩해 실행했다.
2. 기존 `health-helper-local-relay.js`를 loopback 11436으로 실행했다.
3. 정확한 소켓 경로·파일 타입·inode 및 리스너 부재를 검사하고 끊어진 소켓만 제거했다.
   원래 키·known_hosts를 사용하는 reverse SSH 연결로 재생성했다.
   기존 UID/GID 및 0660 권한을 복원했다. 공개 TCP 포트나 인증 우회는 추가하지 않았다.
4. MAC/VMX 매핑이 확인된 기존 B VM을 `vmrun start ... nogui`로 재개했다.
   두 피어의 새 핸드셰이크를 관측했다. WireGuard 키·AllowedIPs·NSG는 변경하지 않았다.
5. 실제 환자 웹 요청으로 모델/근거 로그를 검증했다.

## 실제 환자 요청

Microsoft 계정 재로그인은 사용자가 수행했다. 인증 토큰을 새로 만들거나
서명 키로 시험 토큰을 발급하지 않았다. 일반 질문 “AFP 검사는 어떤 목적으로 하나요?”만
전송했고 환자 검사 수치·식별정보를 모델에 제공하지 않았다.

첫 요청은 MODEL_TIMEOUT 이후 원문 안내로 대체됐으며 실패 이력은 유지했다.
고정 모델의 빈 입력 로드 시험은 46.99초가 걸렸다. 사전 로드 후 두 번째 요청은
실제 AI 답변 및 MedlinePlus 출처가 표시됐다.

성공 요청 표시 별칭: `9f8e738a00` (실제 감사 세션의 표시용 MD5 별칭).
시작 `2026-10-20T10:07:39.175Z`, 완료 `10:08:00.661Z`.
21,486ms는 감사 이벤트 사이 간격이며 순수 모델 추론 시간으로 주장하지 않는다.

## 검증

|항목|결과|근거|
|---|---|---|
|SSH 전달·중계·모델 연결|PASS|REACHABLE / READY / AVAILABLE|
|두 WireGuard 피어 새 핸드셰이크|PASS|복구 후 양쪽 최근 관측|
|실제 환자 웹 모델 생성|PASS|HELPER_TRANSLATION_ANSWER_GENERATED / 화면 답변·출처|
|모델·근거 메타데이터|PASS|configuredModel=qwen3.5:4b, sourceCount=1, 두 KB 버전|
|생성·대체 여부 구분|PASS|generationUsed=true, fallbackUsed=false, failureCode=null|
|시작·완료 로그 연결|PASS|동일 요청 별칭의 실제 저장 로그|
|메타데이터 관련 단위 회귀|PASS|test/security-details.test.js 6/6|
|DB·DR 유지|PASS|시작 시각 동일, streaming, 비TLS TCP 0|
|요청별 가중치 버전 저장|NOT VERIFIED|modelVersion=null, 설정 태그와 구분|
|병원 포털·CT·QR 전체 종단 검증|NOT VERIFIED|이번 범위 밖. B overlay 포트 탐색은 연결 미확인|
|환자 웹 UI PNG 촬영|NOT VERIFIED|브라우저 캡처 시간 초과. 실제 터미널 원본은 별도 촬영|

실제 기록된 근거 ID는 `school-demo-medical-test-afp-tumor-marker-AFP-DEF-01`.
KB `medlineplus-upload-ko-20261012-v3`, 보완자료
`medlineplus-medical-tests-school-demo-ko-20261013-v1`.
메타데이터는 성공·실패 두 요청의 시작·종료 4개 행에 기록됐다. 과거 로그는 수정하지 않았다.

## 보안과 미검증 범위

- 애플리케이션 배포·DB 재기동·스키마 변경·동의/QR 생성·Git 커밋/푸시는 수행하지 않았다.
- 기존 SSH 키는 파일 경로로만 사용했고 개인키·암호·토큰은 출력하지 않았다.
- 진단 SQL은 읽기 전용이다. 감사 로그에 성공 행을 직접 삽입하지 않았다.
- 기존 WireGuard 피어의 정상 핸드셰이크는 병원 포털·CT 전체 동작 검증을 대신하지 않는다.
- 현재 Ollama는 PC의 CPU에서 실행된다. PC 종료·절전·터널 종료 시 중단된다.
- 재부팅 시 자동 복구, 30분 idle 후 콜드 스타트, 장시간 안정성은 별도 개선 대상이다.
- 모델 호스트에서 로드된 가중치 다이제스트는 확인했으나 요청별 DB 버전 바인딩은 없다.

## 증적과 변경 파일

`artifacts/azure/helper-recovery-20261020/`에 개인정보를 제외한 관측 JSON을 저장했다.
사용자 Downloads의 `MediQ_건강도우미_복구증적_20261020`에는 복구 후
원본·주석·실제 출력·편집용 HTML·SHA-256 목록·ZIP을 둔다. 복구 전 증적은 보존한다.

새 스크립트: helper-recovery-20261020.py, helper-clear-stale-socket.py,
helper-recovery-verify.py, helper-model-warm.py, query-linux-terminal.py,
package-helper-recovery-evidence.py.

증적 도구만 수정: linux-terminal-evidence.py, show-linux-terminal-evidence.ps1,
collect-terminal-screenshots.py, build-terminal-evidence.py, render-terminal-annotations.mjs.
## 후속 보완 안내

이 문서는 최초 복구 시점의 기록이다. 이후 요청별 모델 버전 저장과 Windows 사용자
로그인 후 자동 복구를 보완하고 실제 요청으로 확인했다. 최신 상태는
[요청별 모델 버전·자동 복구 기록](helper-version-autorecovery-2026-10-20.md)을 참조한다.
기존 본문의 modelVersion=null 및 자동 복구 미구현 설명은 당시 상태를 보존한 것이다.
