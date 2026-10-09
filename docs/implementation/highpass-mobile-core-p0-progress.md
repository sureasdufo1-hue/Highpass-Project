# Highpass Mobile-Core P0 진행 현황

## 2026-10-09 모바일 시연 연결 보완 — B 배포 및 로그인 검증, 전체 E2E 미완료

- 상태: `PARTIAL / DRAFT / UNASSIGNED`. 아래 2026-09-12 내용은 당시의 도메인 구현 기준선이며 현재 모바일 클라이언트 전체 완료를 의미하지 않는다.
- 공유 기간 보완: 화면의 1시간·24시간·7일 선택을 실제 동의 생성 요청의 `validUntil`에 반영하고 확인 화면에도 표시한다. 미지원 기간은 HTTP 요청 전 차단한다. 동의 기간과 단기 접근토큰/QR의 TTL은 별개이며 서버 정책을 변경하지 않는다. 실제 VM·브라우저 적용 결과는 아직 `NOT VERIFIED`이다.
- 기간 보완 검증: `node --test test/mobile-capstone-auth.test.js test/consent-operations.test.js test/transfer-ticket.test.js` 33/33 PASS, `node --check public/mobile/app.js` 및 `git diff --check` PASS. `node scripts/security-secret-scan.js` 2026-10-09 12:18:19 KST PASS, findings 없음. 기간 테스트는 실제 클라이언트 제출 함수를 실행해 요청 payload를 확인하며 실제 서버/휴대폰 E2E 증적은 아니다.
- 배포 준비 체크포인트: `highpass-platform-mvp:capstone-mobile-duration-20261009` 빌드 PASS, image ID `sha256:16047795ce9aec2f228b2fb23cc8880087f9e3aa9b7c0517da0b8adb9d0bac0c`. `artifacts/security/container-scan/capstone-mobile-duration-20261009.json` 기준 HIGH 0 / CRITICAL 0. 배포 스크립트는 이미지 내부의 네 모바일 관련 파일과 현재 소스 SHA-256 일치 및 승격 직전 재확인을 요구한다. 초기 실행 방식 검사는 로컬 Docker 시작 45초 timeout으로 미검증이었으며, 실행하지 않는 소유 컨테이너 `create → cp → rm` 방식으로 변경 후 네 파일 실제 해시 일치를 확인했다. archive는 메모리에서만 읽고 symlink·과대 파일을 거부한다. 정상·불일치 거부·실패 cleanup·archive 테스트 4/4 PASS. 종료 후 검사 컨테이너가 남지 않았음을 확인했다. B 읽기 전용 점검은 `artifacts/workstation/mobile-b-rollout-20261009T032414Z/result.json` PASS: 기존 이미지·health·암호화 모드 유지 확인. B 교체와 rollback 실행은 아직 수행하지 않았다. 다음 작업은 최신 security gate 후 B-only 배포이다.
- 2026-10-09 12:25:08 KST 최신 Security Gate PASS (unit tests / secret scan / dependency audit 종료 코드 0). 첫 배포 시도는 `mobile-b-rollout-20261009T032521Z/result.json`에서 `ORIGINAL_COMPOSE_PATH_INVALID`로 교체 전 종료: 기존 timestamp의 `+00-00` 문자를 허용하지 않았던 검증 오류. 기존 A rollback과 동일한 소유 stage 형식 및 B의 정확한 `portal.yml,encryption.yml` 쌍만 허용하도록 보완했다. 경로·타 프로젝트·범위 이탈 거부를 포함한 Python 테스트 5/5 PASS. 재시도 결과와 실제 브라우저 E2E는 완료 증적 확인 전까지 `NOT VERIFIED`로 유지한다.
- 후속 배포 `mobile-b-rollout-20261009T032623Z/result.json`은 후보 적용 후 `RUNTIME_CONFIGURATION_CHANGED`로 중단했고 이전 이미지 rollback 및 health 확인 PASS. 이 결과는 배포 성공이 아니다. 기존 검사에는 env/binds 배열 순서 비교가 포함돼 있었으나 해당 결과만으로 실제 원인을 순서 차이라고 확정할 수 없다. 비교를 환경변수의 정확한 key/value와 mount 집합 기준으로 보완하고 Cmd/Entrypoint/User/WorkingDir 및 권한·네트워크 설정도 비교하도록 강화했다. 앞으로 차이가 있으면 비밀 값 대신 변경 필드 이름만 기록한다. 관련 Python 테스트 6/6 PASS, secret scan 2026-10-09 12:29:33 KST PASS. 다음 시도는 이 검증을 유지한 채 실행하며 완료 증적 전까지 배포·브라우저 E2E는 `NOT VERIFIED`이다.
- B Portal의 `/mobile`, `/mobile/`, `/mobile/index.html` 진입과 정확한 `/mobile/manifest.json` 제공을 구현했다. 임의 JSON 파일 공개는 허용하지 않는다.
- 모바일을 ES module로 전환하고 기존 `initializeCapstoneAuth`를 사용한다. 캡스톤 페이지는 메모리의 서명된 PATIENT 프로필만 사용하고, 세션 누락·만료 시 개발용 역할 헤더로 fallback하지 않는다. DOM 로딩 완료 이후에도 로그인 후 초기화할 수 있게 했다.
- PWA 캐시는 정확한 공개 shell allowlist만 사용한다. 인증 헤더·query URL·API·DICOMweb·알 수 없는 모바일 경로는 캐시하지 않는다. 이전 버전 정리는 자신의 cache prefix에만 적용하며 network-first 갱신과 10초 요청 timeout을 적용했다.
- 모바일 API 요청에 10초 timeout을 적용했다. 철회 성공은 정확한 consentId와 `REVOKED` 응답을 확인한 뒤만 표시하며, 일부 철회 실패를 전체 성공으로 표시하지 않는다.
- 관련 요구사항: FR-001~FR-005 동의 철회, FR-014~FR-025 서버 인증·토큰 경계, FR-032~FR-036 클라이언트 표시, FR-037~FR-041 기존 서버 감사 연결 유지.
- 테스트: 모바일 도메인 47/47 PASS. 모바일 인증·PWA·B Portal·Mock IdP·관련 접근거부 회귀 28/28 PASS (로컬).
- 최종 코드 Security Gate: 2026-10-09 12:06:31 KST, `node scripts/security-gate.js`, 종료 코드 0, 단위 회귀·secret scan·dependency audit 모두 PASS. 실행 pnpm 11.7.0은 프로젝트 pin과 일치하나 global manifest 11.22.0 불일치 경고는 남아 있다. 이 게이트는 실제 VM 배포나 휴대폰 E2E를 증명하지 않는다.
- 배포 전 확인된 실제 B 서버는 `/mobile/` 404, `/mobile/index.html` 200, manifest 404였다. 후속 B-only 배포는 아래 최신 증적으로 PASS이며 실제 모바일 브라우저 전체 종단검증은 아직 `NOT VERIFIED`이다.
- 여전히 미완료: 실제 휴대폰 PWA 설치, 실제 DICOM 슬라이스를 사용하는 모바일 Viewer, 실제 단말/보안 저장소/Vault 연동, 모바일 QR부터 B Viewer까지 현재 배포의 전체 E2E.
- 최신 배포 증적: `artifacts/workstation/mobile-b-rollout-20261009T032942Z/result.json` PASS / DRAFT / UNASSIGNED. 후보 이미지 ID와 소스 해시 일치, 기존 runtime 설정 보존, 엄격한 TLS `/api/health`, `/hipass/`, `/mobile/`, manifest, app.js, sw.js 200을 확인했다. 이 성공 시도에는 rollback이 필요하지 않았고 직전 실패 시도에서 이전 이미지 rollback·healthy 복구 PASS를 확인했다. A병원·클라우드 변경 없음.
- 실제 브라우저에서 캡스톤 키 로그인, 개발용 인증, 영상·동의 목록 로딩 확인. 키는 메모리에만 보관하고 출력하지 않았다. 화면 증적 `artifacts/mobile-browser-20261009/login-loaded.png`. 실제 단말 생체인증·전체 공유 E2E 증적은 아니다. 브라우저 확인 중 TEE `Risk: LOW` 및 공공기관 실제 연계로 오인할 수 있는 기존 문구를 발견했으며 다음 변경에서 미연동·시뮬레이션 표시로 바로잡아야 한다.
- 후속 로컬 수정 (배포 증적과 구분): TEE 위험도 LOW·갤러리 완전 차단·평문 잔류 0 Byte 및 공공기관 실제 연계 문구를 제거하고 미검증·미연동을 표시했다. 모바일 Cine의 Canvas 한계 및 법적 동의서가 아닌 합성 시연 동의를 표시하고, 실제 실행하지 않는 마스킹 checkbox는 비활성 예시로 표시했다. 실제 병원 이름을 가상 D/E로 바꾸되 기존 API 식별자는 유지했다. 개발용 인증은 HTTP 성공뿐 아니라 `authenticated:true`, 정확한 patientId, `simulation:true` 응답을 확인한 뒤만 잠금 해제·완료 표시한다. 관련 FR-001~FR-005, FR-014~FR-020, FR-032~FR-036. 관련 Node 테스트 18/18 PASS, 문법 검사 PASS, secret scan 2026-10-09 12:33:44 KST PASS. 새 후보 `capstone-mobile-disclosures-20261009` 빌드 PASS; 최신 게이트·배포·브라우저 표시 결과는 실제 완료 증적 확인 전 `NOT VERIFIED`로 유지한다.
- 최신 표시·인증 후보 검증: Security Gate 2026-10-09 12:35:02 KST PASS, 세 하위 게이트 종료 코드 0. `artifacts/security/container-scan/capstone-mobile-disclosures-20261009.json`: image ID `sha256:769bdc267e2da9617a4a52be3e7b12fc1dc56f4cdfb9892f5eb73e5f17230dce`, HIGH 0 / CRITICAL 0. B-only 배포를 시작했으며 종료 receipt와 브라우저 검증이 확인될 때까지 이 후보의 실제 적용은 `NOT VERIFIED`이다.
- 최신 완료 체크포인트: `artifacts/workstation/mobile-b-rollout-20261009T033526Z/result.json`로 표시·인증 후보 B 배포 PASS 확인. 브라우저에서 최신 미연동 표시·개발용 서버 인증·목록 로딩 확인 후, MRI 1건/B병원/VIEW_ONLY/1시간 선택으로 새 `consent_b50430ea1f63023a`, `ticket_2168f5f6945e96d2` 발급 및 B 수신 확인. 카메라가 아닌 시뮬레이션 접수로 서버 redeem 후 Viewer 전환. 이미지 blob 로딩은 확인했지만 2×2 fixture이므로 발표 품질 부족이며 실제 MRI 품질 검증이 아니다. 읽기 전용 receipt check에서 해당 동의 ACTIVE, 유효기간 1.000685시간, 발급 감사 및 hash chain 정상 확인. 첫 receipt check는 Origin 누락 403으로 종료됐고 기존 Origin 계약을 그대로 적용한 재검증은 종료 코드 0. 원래 동의는 철회하지 않았다. 새 동의 철회 confirm에서 브라우저 제어 timeout 발생, 사용자에게 확인창 처리 요청; 철회/철회 후 DENY/재사용 DENY/실제 휴대폰 PWA는 아직 NOT VERIFIED. 상세 `artifacts/mobile-browser-20261009/scenario-checkpoint.json`, 화면 `consent-confirmation-1h.png`, `receiver-viewer-qr.png`. 다음은 현재 확인창 해소 후 선택 동의 철회·차단 검증 및 발표용 합성 영상 품질 개선이다.
- 확인창 후속 개선 (로컬, 배포 전): 네이티브 `confirm`을 명시적 취소/실행 및 접근성 이름이 있는 앱 내부 `dialog`로 교체했다. Escape·120초 만료·미지원·열기 실패는 모두 취소이며 요청하지 않는다. 메시지는 textContent로 표시한다. 확인 중 현재 동의 ID가 바뀌면 다른 동의를 철회하지 않는다. bulk 철회도 선택 목록의 활성 상태를 재검증한다. 서버 권한·응답 확인 정책은 유지했다. 관련 Node 회귀 37/37 PASS, 문법 PASS, secret scan 2026-10-09 12:46:29 KST PASS. 처음 추가 테스트의 DOM fixture에서 style 누락으로 1 FAIL이 있었으며 fixture를 실제 DOM 형태로 수정 후 재실행했다. 실제 브라우저 7번 탭의 기존 확인창은 여전히 제어 timeout이고 에이전트 탭 종료 시도 역시 timeout; inventory에서 탭이 남아 있음을 확인했으므로 종료됐다고 주장하지 않는다. 사용자 원래 탭은 수정하지 않았다. 새 dialog 후보 이미지 빌드 및 Security Gate 실행 중이며 적용·실제 UI·철회 후 DENY는 아직 NOT VERIFIED이다.
- 새 dialog 후보: 빌드 종료 코드 0, Security Gate 2026-10-09 12:48:49 KST PASS (세 하위 게이트 종료 코드 0), `artifacts/security/container-scan/capstone-mobile-confirmation-20261009.json` HIGH 0 / CRITICAL 0, image ID `sha256:d3f27eb4ed35908621cbebb512178523ed6915394d8cb6c0232c68fef46b7ecb`. B-only 배포 시작. 이미 열려 있는 구버전 네이티브 확인창은 새 배포로 자동 해소된다고 주장하지 않는다. 새 후보 실제 적용 및 새 확인창 브라우저 동작은 배포 종료/실제 UI 증적 확인 전까지 NOT VERIFIED이다.
- 최신 배포·서버 철회 체크포인트: `artifacts/workstation/mobile-b-rollout-20261009T034937Z/result.json`으로 dialog 후보 B 배포 PASS 확인. 새 브라우저 9번 탭은 표시와 입력 변경은 가능했으나 로그인 클릭을 처리하지 못했으며 입력 키를 지웠다. 기존 네이티브 확인창이 남아 있어 브라우저 종단 검증은 NOT VERIFIED. 별도 API 검증은 증적의 동의·티켓과 발급 감사·환자·기관·합성 MRI 범위를 교차 확인한 대상만 사용했다. 최초 검증은 DPoP 없는 토큰 발급 전 실패로 끝나 철회하지 않았고, 해당 실패 receipt를 보존했다. 실제 proof-policy는 supported/required true, replayScope SHARED_POSTGRES. ephemeral P-256/ES256 DPoP client를 추가해 jti/htm/htu/ath 및 cnf-bound DPoP scheme을 실제 서버 계약에 맞추고 서명·cross-origin 거부·소유권·오류 분리 테스트 5/5 PASS. 재검증 `artifacts/mobile-browser-20261009/owned-api-revocation-dpop-result.json` 종료 코드 0 / API-only PASS: 철회 전 Gateway metadata 허용, `consent_b50430ea1f63023a` 철회 REVOKED, 신규 토큰 CONSENT_REVOKED 거부, 기존 토큰 Gateway 재접근 거부, 감사 체인 정상. 사용자 기존 동의는 수정하지 않았다. 네이티브 창 해소 요청은 이제 '확인'이 아니라 '취소'로 정정했다. 새 dialog UI·QR 재사용·실제 휴대폰·발표 영상 품질은 여전히 미검증 또는 미완료이다.
- 사용자 취소 후 브라우저 검증 재개: 구버전 네이티브 확인창 해소 후 새 9번 탭 로그인·개발용 서버 인증 시뮬레이션 정상 처리 확인. 이번에 새로 생성한 `consent_f1ea8981d8a32bfe` / `ticket_6e0798fbbf59e447`만 사용해 합성 MRI 1건·HOSP-B·VIEW_ONLY·1시간 동의 발급, 앱 내부 dialog의 취소 및 확인 후 실행을 검증했다. 취소 후 API ACTIVE, 실행 후 화면 REVOKED 및 QR 폐기, 읽기 전용 API REVOKED/effectiveStatus REVOKED, 발급 감사 및 hash chain 정상: PASS. 조회 두 번 모두 종료 코드 0. `artifacts/mobile-browser-20261009/dialog-browser-checkpoint.json`과 `dialog-revoked.png`에 DRAFT / UNASSIGNED로 기록했다. 이번 새 동의의 수신 Viewer·철회 후 Gateway DENY·동일 nonce 재사용은 별도 미검증이며, 이전 소유 동의의 API DENY 증적을 이번 대상 검증으로 대체하지 않는다. 최신 Security Gate 2026-10-09 12:59:22 KST PASS (unit-tests / secret-scan / dependency-audit 모두 종료 코드 0). 전체 모바일 MVP/v3 달성은 아직 선언하지 않는다.
- QR 재사용 후속 검증: 실제 B HTTPS API에서 새 합성 MRI 동의 `consent_e81e42ba8a669879`와 티켓 `ticket_19ebe83757ef08b6`를 생성해 동일 nonce를 두 번 제출했다. 매 요청은 별도의 ephemeral ES256 DPoP jti를 사용하며, 최초 ALLOWED 및 단기 토큰·범위 바인딩, 두 번째 `TICKET_ALREADY_USED` DENIED를 검증했다. 서버 오류·DNS 실패·DPoP 재사용 거부를 QR 재사용 정책 성공으로 분류하지 않는다. 검증용 동의만 철회해 cleanup PASS, 감사 체인 PASS. `artifacts/mobile-browser-20261009/ticket-replay-api-result.json` 종료 코드 0 / API-only PASS / DRAFT UNASSIGNED. 카메라 스캔·영상 픽셀 품질 증적은 아니다. 새 검증기·DPoP·모바일·티켓 관련 회귀 36/36 PASS. 관련 FR-021~FR-025, FR-037~FR-041 및 SEC-QR-02.
- 모바일 표시 보완: BroadcastChannel 신호만으로 CONSUMED/접수 완료 표시와 만료 타이머 중지를 하지 않도록 수정했다. 철회·만료 상태는 변경하지 않으며, ACTIVE 동의에서는 수신 화면에서 서버 결과 확인을 안내한다. 환자용 인증된 티켓 상태 조회·폴링은 아직 미구현이다. 최신 Security Gate 2026-10-09 13:07:17 KST PASS, 후보 `highpass-platform-mvp:capstone-mobile-sync-20261009` image ID `sha256:debcfb290bb104c5a6de38955d0c7dbb2708f078a628874be63929dae7d9024a` 빌드 종료 코드 0, 정확한 이미지 Trivy HIGH 0 / CRITICAL 0. B-only 배포 시작; 실제 적용 결과와 새 UI는 완료 receipt 전까지 NOT VERIFIED. A와 Azure는 변경 대상이 아니다.
- 표시 보완 B 배포 완료: `artifacts/workstation/mobile-b-rollout-20261009T040820Z/result.json` PASS. 후보의 정확한 소스 바이트·스캔 이미지 일치, 기존 Compose runtime 설정·암호화 유지, strict TLS 여섯 경로 정상 확인. 이전 이미지 보존, rollback 실행은 NOT REQUIRED이며 이번 rollback 실증을 의미하지 않는다. A와 Azure 변경 없음. 최신 브라우저의 BroadcastChannel 음성 E2E는 NOT VERIFIED로 유지한다. 다음은 환자 바인딩 티켓 상태 조회를 통한 수신 상태 동기화와 256×256 합성 phantom의 선택→동의→수신 Viewer 연결이다.
- 환자 티켓 상태 동기화 구현 (로컬, VM 미배포): `GET /api/consents/{consentId}/handoff-tickets/{ticketId}`를 추가했다. PATIENT principal 본인 소유만 조회 가능하며, 타 환자·동의 불일치·없는 티켓은 동일 404이다. 응답은 consentId/ticketId/status/expiresAt만 포함하고 nonce·hash·토큰·DICOM UID를 반환하지 않는다. 서버 시간·동의 철회/만료를 반영하고 잘못된 상태는 409, 응답 no-store 및 TICKET_STATUS_VIEWED 감사 기록을 적용했다. PostgreSQL 스킬의 최소권한 지침을 참고했고 DB 스키마·역할 권한 변경은 하지 않았다. 모바일은 서버의 정확한 동의·티켓·expiry 일치 receipt만 USED/REVOKED/EXPIRED로 표시하며 QR capability를 제거한다. BroadcastChannel은 조회 힌트일 뿐이고, 오류·늦은 응답·확정 철회를 성공 표시로 바꾸지 않는다. polling은 5초 간격, 요청 10초 timeout, 티켓 TTL 및 최대 10분 deadline, 잠금·새 티켓·종료 시 중지한다. 홈의 ACTIVE 동의 수를 활성 QR 수로 오인하던 문구도 분리했다.
- 해당 로컬 검증: 관련 Node 36/36 PASS, 후속 모바일 재검증 15/15 PASS. 실제 격리 HTTP에서 무인증 401·의료진 403·타 환자/없는 티켓 동일 404·본인 ISSUED·철회 후 REVOKED·no-store를 확인했다. 최초 HTTP 검증 FAIL은 기존 GET consent prefix가 하위 경로까지 처리한 원인이었고 정확한 길이 매칭으로 수정 후 PASS. 수정 중 실행된 Security Gate 2026-10-09 13:25:54 KST는 unit-tests FAIL(종료 코드 1), secret/dependency PASS이며 이 실패를 성공으로 대체하지 않는다. 최신 전체 회귀를 다시 실행 중. OpenAPI 변경은 additive GET이며 기존 발급·redeem 계약은 유지한다. 영향 화면 mobile QR, 관련 FR-021~FR-025/FR-037~FR-041. VM 적용·PostgreSQL runtime·브라우저 E2E는 NOT VERIFIED. 이번에는 server/services/domain/mobile을 함께 이미지에 포함해 스캔한 뒤 배포해야 하며 기존 네 파일 overlay로 모바일만 승격하지 않는다.
- 최신 로컬 전체 회귀는 `node --test --test-concurrency=4` 종료 코드 0 / 720개 PASS, 0 FAIL, 약 42.295초. OpenAPI YAML syntax/new-route 및 Node syntax/diff check PASS. 이후 기본 60초 Security Gate 재실행은 2026-10-09 13:28:26 KST 단위 테스트 SIGTERM/exitCode null로 FAIL, secret-scan/dependency-audit PASS이다. 이 timeout 결과를 게이트 통과로 기록하지 않는다. 테스트를 생략하지 않고 `HIPASS_SECURITY_GATE_TIMEOUT_MS=120000`으로 유한한 제한을 명시한 재검증 실행 중. 작업 기준 HEAD `089eecb5cd479a12aab28f4c92804e23dd101be0` + 현재 미커밋 변경이며 HEAD 단독 증적이 아니다.
- 120초 유한 제한 재검증 완료: 2026-10-09 13:29:31 KST Security Gate PASS, 전체 테스트 42.771초 및 secret/dependency 세 하위 명령 종료 코드 0. 앞선 60초 timeout은 별도 실패 이력으로 유지한다. 새 환자 상태 API와 모바일 동기화는 로컬 구현/회귀 완료이고 VM 배포 및 실제 브라우저 적용은 아직 NOT VERIFIED. 다음 실행은 서버+모바일 변경을 함께 묶은 정확한 소스 해시·이미지 검사/스캔→B-only 적용→새 합성 QR 소비 후 환자 화면 USED 및 철회/만료 재검증이다.
- 생체인증·PASS·카카오·TEE는 개발용 시뮬레이션이며, 웹의 Azure Key Vault 검증을 모바일 저장·복호화 완료 증적으로 대체하지 않는다.

기준일: 2026-09-12  
기준선: `4365f2c07d7ab9d69fc4b98db6f5e968b6a90464`

## 완료된 도메인 슬라이스

| WBS | 범위 | 상태 | 증적 |
|---|---|---|---|
| WBS-05 | 모바일 기기 등록·키 등록·활성화·분실·철회·위험도 | PASS (도메인 단위) | `test/mobile-device-registry.test.js` 7/7 |
| WBS-06 | 암호화 패키지 Builder·manifest·chunk hash | PASS (도메인 단위) | `test/mobile-package-crypto.test.js` |
| WBS-07 | AES-256-GCM nonce/tag/AAD 및 무결성 검증 | PASS (개발용 crypto adapter) | `test/mobile-package-crypto.test.js` |
| WBS-08 | 암호문 전용 Mobile Vault 저장·만료·철회·삭제 | PASS (인메모리 도메인 단위) | `test/mobile-vault.test.js` 4/4 |
| WBS-09 | Handoff 상태 전이·일회성 Ticket CAS·opaque QR | PASS (도메인 단위) | `test/mobile-handoff.test.js` 4/4 |
| WBS-10 | B Edge chunk 수신·재조립·hash/tag 검증·receipt | PASS (도메인 단위) | `test/mobile-receiver.test.js` 4/4 |
| WBS-11 step 1~2 | Key Release Authorization 서비스·release context 검증 | PASS (정책 도메인 단위) | `test/mobile-key-release.test.js` 6/6 |
| WBS-11 step 3 | Provider-neutral KMS envelope `rewrap` 계약·합성 adapter | PASS (계약/테스트 단위) | `test/mobile-kms-adapter.test.js` 5/5 |
| WBS-11 step 4~6 | 정책→adapter orchestration·key envelope 상태·감사·음성 경로 | PASS (로컬 도메인 단위) | `test/mobile-key-release-flow.test.js` 5/5 |
| WBS-11 step 7 | 외부 KMS 전환 경계·검증 체크리스트 | PASS (문서화) | `docs/integration/kms-integration.md` |
| WBS-12 | B Edge VERIFIED 패키지 transient decrypt·DEK/plaintext zeroize | PASS (로컬 도메인 단위) | `test/mobile-transient-decrypt.test.js` 5/5 |

## 구현 범위

- `src/mobile-device-registry.js`는 서버 측 기기 상태 전이와 public JWK 검증을 fail-closed로 처리한다.
- `src/mobile-package-crypto.js`는 합성 payload를 AES-256-GCM으로 chunk별 암호화하고, manifest·chunk·package hash를 검증한다.
- `src/mobile-vault.js`는 암호문 chunk만 저장하고 TTL 만료·철회·crypto erase 삭제 receipt를 처리한다. 백업·임의 공유는 fail-closed로 차단한다.
- `src/mobile-handoff.js`는 생성→발급→스캔→환자승인→권한승인→소비 상태를 강제하고, nonce hash만 저장하며 QR 재사용·병원 불일치·만료·철회를 거부한다.
- `src/mobile-receiver.js`는 암호문 chunk를 순서와 무관하게 수신하고 중복을 idempotent 처리하며, 누락·변조·재조립 hash 불일치를 거부한다. DEK가 제공된 경우에만 AES-GCM tag와 manifest를 검증해 VERIFIED receipt를 만든다.
- `src/mobile-key-release.js`는 환자 승인·B MFA·동의·기관·의료진·Ticket·기기·패키지 VERIFIED·manifest 무결성·scope·TTL을 모두 재검증한다. `validateKeyReleaseContext`가 교차 객체 검증 결과를 고정하고, 조건을 만족할 때만 raw DEK 없는 1회성 B Gateway rewrap 권한 artifact를 발급한다. KMS 호출과 envelope 상태 변경은 다음 WBS 단계로 분리한다.
- `src/mobile-kms-adapter.js`는 비동기 provider-neutral `rewrapEnvelope` 계약과 로컬 합성 adapter를 제공한다. 합성 adapter는 envelope 참조·keyRef·버전만 반환하고 raw DEK·개인키를 거부한다. 외부 KMS vendor 구현은 제공된 자원과 권한 검증 후 별도 추가한다.
- `src/mobile-key-release-flow.js`와 `src/mobile-key-envelope-store.js`는 정책 승인→rewrap→B Gateway envelope 메타데이터 저장 흐름과 ACTIVE/DISABLED/DESTROYED 상태·감사를 로컬에서 검증한다. 실제 PostgreSQL `key_envelopes` runtime wiring은 아직 외부 DB/API 작업으로 남아 있다.
- `src/mobile-transient-decrypt.js`는 B Edge에서 `VERIFIED`·미만료 패키지와 허용된 Key Release authorization만 복호화하고, plaintext 소비 콜백 이후 plaintext chunk와 transient DEK를 성공·실패 모든 경로에서 zeroize한다. 결과·감사에는 키와 원문을 남기지 않는다.
- 패키지 외부 envelope에는 암호화된 manifest만 포함하며 DICOM UID, 환자 식별자, 토큰, 개인키를 평문으로 넣지 않는다.
- 만료·변조·인증 태그 오류·범위 오류는 typed error로 거부한다.

## 아직 구현하지 않은 범위

- PostgreSQL `mobile_devices`, `package_manifests`, `package_chunks` 테이블과의 runtime wiring
- 실제 KMS/HSM/Vault envelope wrap/unwrap
- PostgreSQL `key_envelopes` runtime wiring·실제 KMS/HSM envelope wrap/unwrap·실제 B Edge 네트워크/스토리지 연결
- API/OpenAPI route 연결 및 실제 모바일 클라이언트
- 실제 IdP·PACS·병원망·외부 Staging 연동

위 항목은 Issue #11의 후속 P0 작업으로 유지한다. 현재 결과는 합성 로컬 MVP 기술 검증이며 상용 운영 또는 PIPA·ISMS-P·병원 승인 증적이 아니다.

## 관련 요구사항

- FR-021~FR-025: 단기·범위 제한 토큰과 재사용 방지 원칙(패키지 범위 검증 기반)
- FR-037~FR-041: 행위 추적을 위한 도메인 audit event hook
- NFR-SEC-KEY / PKG-INT-001 / CRYPTO-001: nonce, tag, hash, tamper deny

