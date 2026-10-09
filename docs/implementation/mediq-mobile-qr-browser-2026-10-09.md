# Medi Q 모바일 QR 실제 브라우저 검증

2026-10-09 · DRAFT / UNASSIGNED

## 범위

B 이미지 b61b4b84889c...의 모바일 웹/PWA에서 고정 팬텀 환자·CT를 선택한다. 실제 Chrome 390×844에서 개발용 로그인, 공유 범위·수신기관·기간 검토, 명시적 QR 발급, 사용 상태 polling, 확인 대화상자를 통한 철회를 검증한다. 수신기관 티켓 사용은 실제 인증 API와 요청마다 새로운 DPoP proof로 검증한다. 카메라 스캔·의료진 접수 UI·Viewer 픽셀·네이티브 앱·실제 생체인증·실시간 티켓 만료를 검증한 것은 아니다.

관련 FR: 001~005, 014~025, 032~036. 기존 API/DB·TLS·인증 정책 변경 없음.

## 실행 도구

- scripts/mobile-qr-browser-check.js: 새 UI 생성 영수증의 정확한 환자·기관·Study·권한 및 유일성을 확인한다. nonce/JWT/접근 키는 RAM에만 유지하며 로그·증적·파일에 출력하지 않는다. QR의 opaque payload 자체는 기능상 화면 SVG로 표시되며 이를 일반 본문·주소·브라우저 storage에 쓰지 않는지 확인한다.
- 기존 PowerShell Chrome launcher에 -MobileQr 선택 모드를 추가했다. 다른 시나리오 플래그와 혼용을 거부하고 종료 시 자신이 시작한 Chrome·검증된 임시 profile만 정리한다.
- 기존 Python wrapper가 Cloud의 접근 키를 strict SSH로 읽어 익명 stdin으로 전달한다. raw stderr를 출력하지 않는다.
- 각 실행의 생성 영수증에 있는 동의만 서버 재조회 후 철회한다. 기존 동의 전체 철회·최신 행 추정·DB 삭제 없음. 비밀이 아닌 생성 동의 영수증은 증적에 보존한다.

```powershell
powershell -NoProfile -File scripts/run-browser-authorization-trace.ps1 -Port 9231 -BrowserUrl https://192.168.111.149:9443/mobile/ -Capstone -MobileQr
```

## 실제 결과

`artifacts/workstation/b-browser-2026-10-09T09-21-12.032132+00-00/result.json`: PASS, exit 0.

| 검증 | 판정 |
|---|---|
| 팬텀 환자 서버 인증·모바일 개발용 잠금 해제 | PASS |
| CT 한 항목·HOSP-B·VIEW_ONLY·1시간 검토 후 동의/QR 생성 | PASS |
| 실제 의료진 인증 API로 티켓 사용 | PASS |
| 모바일 서버 상태 USED polling·QR SVG 제거 | PASS |
| 같은 QR nonce 재사용 거부 (새 DPoP proof) | PASS |
| 별도 새 동의의 모바일 명시적 철회·QR 제거 | PASS |
| 철회된 티켓 실제 API 거부·토큰 미발급 | PASS |
| 검증 시점 본문·현재 URL·web storage의 capability 미노출 | PASS |
| 새로 만든 두 동의의 정확한 서버 확인·정리 | PASS |
| QR 실시간 만료 및 서버 만료 거부 | NOT VERIFIED |

초기 세 실패는 검증기 대기 조건 문제로 보존한다: 09:19:06/09:19:48/09:20:27 result.json. 잠금 해제는 hidden이 아니라 unlocked class이며, 검사 목록은 비동기로 조회한 뒤 share 탭 진입 시 checkbox를 렌더한다. 성공 실행은 두 조건을 실제 DOM 계약에 맞춘 결과다. 실패 실행에서는 신규 동의 생성이 없었다.

## 만료 경로 로컬 보완 — 아직 미배포

코드 점검에서 countdown 종료가 EXPIRED 문구만 표시하고 QR payload를 제거하지 않는 경로를 확인했다. public/mobile/app.js에 정확한 현재 ticket의 유효기간이 지난 경우에만 QR SVG·메모리 payload·polling·timer를 제거하는 로컬 처리를 추가했다. 서버 접수 여부는 미확인임을 표시해 로컬 시간 판단을 서버 성공 영수증으로 오인하지 않게 한다. 늦게 도착한 ISSUED 응답도 로컬 종료 상태를 바꾸지 않는다.

test/mobile-qr-local-expiry.test.js 및 test/mobile-ticket-status-client.test.js: 6/6 PASS, exit 0. 이전·다른 티켓, 만료 직전, 잘못된 기한, 이미 종료된 티켓, 만료 중 도착한 ISSUED 응답을 실행 검증했다. 이 테스트는 시간을 주입한 단위 테스트이며 실제 서버 만료 증적이 아니다. 인증·상태·cache 관련 선택 테스트도 18/18 PASS였다(늦은 응답 테스트 추가 전).

다음: 전체 회귀 결과 확인 → 새 이미지 파일/보안 검사 → B 배포·rollback → 실제 기한 경과 QR 제거 및 새 인증으로 서버 만료·재사용 거부 확인. TTL·TLS·서명 검증을 완화하거나 시간을 변경해 실제 만료 PASS를 만들지 않는다. 이후 환자 본인 실영상 연결과 전체 발표 리허설을 진행한다.

전체 Node 회귀(만료 처리 변경 기준) 765/765 PASS, exit 0, 42.278초. 실행 시작 이후 추가한 늦은 ISSUED 응답 테스트는 별도 선택 6/6 PASS로 확인했으며 전체 765개에 포함됐다고 주장하지 않는다. 이 결과는 새 이미지 배포·실시간 만료·전체 HTTPS 게이트를 대신하지 않는다.

커밋·푸시 없음. 전체 MVP/v3 완료는 아직 미완료다.

## 최신 만료 수정 배포 및 실시간 검증 착수 — 09:30 UTC

- 전체 Node 최신 회귀 766/766 PASS, fail 0, exit 0, 45.436초. 늦은 ISSUED 응답 테스트 포함.
- B 후보 `highpass-platform-mvp:capstone-mobile-qr-expiry-20261009` / `sha256:940806f602ec282d6d03a9da6948b6a8453bb47ff9f71fdadb8aa40fa5521aea`. 파일 31개 일치 PASS.
- 새 scan HIGH 0 / CRITICAL 0, Container Gate PASS: `artifacts/security/container-scan/capstone-mobile-qr-expiry-20261009.json`.
- B-only 배포·이전 b61b4b84 실제 rollback·후보 재적용 PASS: `mobile-b-rollout-20261009T092728Z/result.json`. 기존 환경·보안 설정 보존, HTTPS 경로 11개 PASS, A/Cloud/DB 변경 없음.
- 현재 B 공개 자산 11/11 hash 일치 PASS: `presentation-ui-inventory-1791538223788/result.json`.
- 실시간 만료 모드를 추가했다. 모드는 실제 서버 영수증 expiresAt까지 기다리고, QR 제거 후 새로 로그인한 검증 주체로 정확한 Ticket 상태 EXPIRED와 TICKET_EXPIRED 음성 응답을 확인한다. 모바일 세션·서버/브라우저 시간·TTL은 변경하지 않는다. 접근 키는 검증기 RAM에만 유지하고 종료 시 참조를 제거한다. 최대 15분 실제 티켓과 1020초 전체 검증 한도, Python 외부 한도 1035초를 적용한다.
- 잘못된 `-MobileQrExpiry` 단독 호출은 Chrome 시작 전에 exit 1로 거부했다 (예상된 플래그 음성 검증).

```powershell
powershell -NoProfile -File scripts/run-browser-authorization-trace.ps1 -Port 9231 -BrowserUrl https://192.168.111.149:9443/mobile/ -Capstone -MobileQr -MobileQrExpiry
```

현재 이 명령의 최초 실제 만료 실행은 진행 중이다. 실행 중인 Chrome의 제한된 DOM 조회에서 qrVisible=true, issued=true, expired=false를 확인했다. 이는 QR 발급/대기 관측이며 만료 PASS가 아니다. 최종 종료 코드와 증적이 나온 뒤 결과를 반영해야 한다. 이 새 이미지의 used/revoked 재실행·전체 의료진 영상 회귀도 별도 미검증이다.

다음 본인 실영상 작업의 기존 계약 분석과 단계별 계획은 `docs/api/MEDI-Q-PATIENT-SELF-VIEW-IMPLEMENTATION-PLAN.md`에 기록했다. 제안 계약이지 구현·승인 완료가 아니며 기존 의료진 토큰 재사용으로 우회하지 않는다.

## 실시간 만료 최초 결과 — 09:40 UTC

`b-browser-2026-10-09T09-40-19.472435+00-00/result.json`: FAIL, exit 1, SERVER_EXPIRY_NOT_CONFIRMED. 코드의 실행 순서상 실제 기한 경과 및 EXPIRED 문구·QR SVG 제거 대기를 통과한 뒤 새 verifier 인증까지 수행했으나, 서버 상태 HTTP/결속/EXPIRED의 복합 조건에서 실패했다. 초기 검증기는 실패한 상태의 세부 필드를 보존하지 않아 어느 조건인지 아직 확정하지 못했다. 클라이언트/서버 시각 차이 등은 추정이며 원인으로 확정하지 않는다.

해당 실행의 정확한 생성 동의는 서버 확인 후 REVOKED 정리 PASS. 실패를 성공으로 덮어쓰지 않는다. QR 실제 기한·서버 정책·TTL 변경 없음.

검증기에 안전한 실패 진단을 추가했다: HTTP 상태, allowlist 상태 enum, consent/ticket/expiry 일치 boolean, 서버 Date가 기한 이전인지 boolean만 기록한다. QR payload·nonce·JWT·raw body·error stack은 출력하지 않는다. 새 영수증의 ticket ID도 비밀이 아닌 소유 정리 증거로 보존한다. script 문법 PASS.

최초 명령이 exit 1로 종료된 것을 확인한 뒤, 같은 B 이미지에서 별도 새 생성 동의로 두 번째 실시간 만료 실행을 시작했다. 결과 대기 중이며 NOT VERIFIED다. 이는 네트워크 오류에 대한 자동 재시도나 기존 실패 PASS 전환이 아니라 실패 진단을 보완한 독립 실행이다.
