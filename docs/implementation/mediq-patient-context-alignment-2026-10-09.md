# Medi Q 환자 컨텍스트 표시 정렬

2026-10-09 · DRAFT / UNASSIGNED · B 배포·CT 브라우저 확인 완료 (아래 최신 결과 참조)

## 작업 목적

선택한 합성 환자와 무관한 P-1001/가상환자 1001 표시를 제거하고 환자 웹·모바일 모의 미리보기를 실제 DICOM 영상과 구분한다. frontend-design의 명확하고 일관된 UI 문구 원칙을 적용하며 기존 A/B/C 레이아웃·색상·글꼴을 유지한다.

관련 FR: 006~013, 032~036. 인증·인가·API·DB 계약 변경 없음. 실제 환자 개인정보 사용 없음.

## 변경

- public/app.js: 선택한 서버 시연 컨텍스트의 이름·환자 ID를 PHR fallback, 의료진 Viewer HUD, 접수 표시와 환자 모의 그림에 사용한다. 출처는 선택한 검사 메타데이터를 사용한다.
- QR 방송 알림은 환자 확인이나 티켓 검증 성공을 주장하지 않으며 textContent로 안내한다. 실제 검증은 기존 서버 경로를 유지한다.
- public/mobile/app.js: 동일 환자의 서버 컨텍스트 이름을 문자 그대로 표시한다. 다른 환자 선택 시 그 이름을 승계하지 않는다.
- 환자 웹·모바일 canvas 미리보기는 한 개의 모의 프레임이며 실제 DICOM 아님을 제목에 명시한다. 임의의 50장/Instance 표시와 모의 연속재생을 제거했다. 실제 12장 DICOM의 환자 열람을 구현한 것이 아니다.
- public/index.html, public/mobile/index.html: 초기 모의 프레임 수를 동일하게 정렬한다.
- public/mobile/sw.js: 공개 shell cache 버전을 v4로 변경해 새 배포 시 이전 스크립트 갱신을 지원한다. 기존 API·인증·영상 cache 제외와 자기 cache만 정리하는 경계는 유지한다.

## 검증

- 선택 Node 테스트 29/29 PASS, exit 0. 이름의 HTML 문자열이 textContent로 표시됨, 잠금 상태에서 데이터 로딩 없음, 승인 실패 시 모의 화면을 열지 않음, 승인 후에도 12장 메타데이터를 모의 그림의 실제 슬라이스 수로 주장하지 않음, 단일 모의 프레임의 cine timer 미생성을 실행 검증했다.
- node --check public/app.js 및 public/mobile/app.js PASS, exit 0.
- 변경한 5개 public 파일의 git diff --check PASS, exit 0 (Git 줄바꿈 안내만 존재).
- 신규 회귀: test/patient-context-display.test.js.
- 현재 변경 기준 전체 Node 회귀 763/763 PASS, fail 0, exit 0, 42.270초. 별도 HTTPS E2E·VM 브라우저·Security Gate 실행을 대신하지 않는다.
- 실제 브라우저 시각 검토·새 이미지 검사·B VM 배포·rollback: NOT VERIFIED.

## 다음 작업

전체 회귀 결과 확인 후 로컬 실제 화면 검토 및 검증된 B 이미지 기반 후보 빌드·보안 검사·배포가 필요하다. 이어서 새 합성 환자의 모바일 QR 발급→수신기관 사용→재사용 거부→상태 polling·QR 제거와 별도 철회·만료를 실제 브라우저에서 확인한다. 환자 본인 실영상은 별도 소유권·단기 접근 계약을 구현해야 한다. 의료진 토큰 재사용이나 모의 그림으로 완료 처리하지 않는다.

커밋·푸시 없음. 신규 증적은 사람 검토 전 DRAFT / UNASSIGNED이며 전체 MVP/v3 완료를 선언하지 않는다.

## 최신 B 배포 및 CT 검증 — 09:14 UTC

- 새 후보 `highpass-platform-mvp:capstone-mobile-patient-context-20261009`, image ID `sha256:b61b4b84889cd83364a2a837f570eb72a3a795d71ed8705c47c20e9aa479ec62`. 기준 7cbee1c7 이미지 위에 UI만 적용. 31개 정적 파일 일치 PASS.
- 새 Trivy 검사 HIGH 0 / CRITICAL 0, Container Gate PASS. `artifacts/security/container-scan/capstone-mobile-patient-context-20261009.json`.
- B 현재 이미지·health·암호화 필수 모드 읽기 전용 점검 PASS: `mobile-b-rollout-20261009T091016Z/result.json`.
- 실제 B 배포, 7cbee1c7로 rollback, 후보 재적용 PASS: `mobile-b-rollout-20261009T091148Z/result.json`. 원래 환경·mount·포트·실행 사용자·보안 옵션 유지, HTTPS 경로 11개 PASS. A·Cloud·DB 변경 없음.
- 최신 B HTTPS 자산 hash 11/11 PASS: `presentation-ui-inventory-1791537248442/result.json`.
- 새 이미지 CT 실제 Chrome 검증 PASS: `b-browser-2026-10-09T09-14-24.874925+00-00/result.json`. 고정 팬텀 프로필·Viewer 환자 일치, 정확한 12 SOP·256×256 픽셀·다음 슬라이스, 무인증 401/DPoP 누락·재사용 403, 토큰 UI/storage/URL/history 미노출, 동의 철회·픽셀 제거. built-in Viewer이며 OHIF rendering 검증은 아니다.
- 같은 흐름 읽기 전용 PG 감사 PASS: `phantom-audit-2026-10-09T09-14-34.530875+00-00/result.json`. 해당 key release 4/4 소비·Vault-bound·개별 감사 연결, 저장 hash chain 5414개 PASS. Azure 공급자 서비스 로그 검증은 아니다.
- 검증기에서 환자 일치 boolean 검사 추가. 문법 및 팬텀·정확한 소유 동의 cleanup 테스트 10/10 PASS. 앞 절 전체 Node 763/763은 앱 수정 기준이며 이 후속 검증기 추가 후 전체 재실행은 미실행이다.

현재 배포 자산과 의료진 CT 동작 검증은 완료다. 환자·모바일 모의 미리보기의 실제 브라우저 시각 검토, 최신 MRI 재실행, 모바일 QR 실제 종단, 본인 실영상, 전체 MVP 최종 검증은 아직 NOT VERIFIED/미완료다. 위 결과가 앞 절의 미배포 상태를 대체하며 과거 상태는 이력으로 보존한다.
