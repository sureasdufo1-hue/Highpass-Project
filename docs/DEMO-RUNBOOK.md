# Capstone Demo Runbook

## 현재 상태와 단일 흐름 재현 — 2026-10-09 KST

현재 배포·검증 범위·실패의 권위 위치는 [발표 환경 통합 상태](implementation/mediq-presentation-integration-status-2026-10-09.md)의 현재 절이다. 아래 과거 ‘현재 이미지’/‘실행 중’ 설명은 당시 이력이다.

20:09 KST 기준 Cloud는 `capstone-auth-denial-20261009` / `sha256:a54879068331c235fbd9636b899717fd06b5682ccf07ea9605a0a87ee1178783`, B는 기존 `capstone-mobile-qr-expiry-20261009`다. 아래 VerticalFlow는 음성9건의 거부 감사·DB 부작용 비교까지 실행하며, 반환한 browser receipt를 `scripts/capstone-phantom-audit-check.py`에 전달해 정확한 동의·사용자·키 소비·hash chain을 별도로 확인해야 한다. 최신 CT 실제 흐름·9건 감사 PASS이며 MRI·환자 본인 실영상·전체 MVP 완료 증거는 아니다. 기존 Cloud 이미지4315941d rollback 및 후보 재적용은 실제 검증했다. 기존 volume/DB/PACS를 삭제하지 않는다.

20:15 KST에는 같은 조합의 MRI 실제 흐름·음성9건·PG 감사도 별도 새 동의로 PASS했다. 위 MRI 미검증 설명은20:09 당시 상태다. MRI 재현은 아래 명령에 `-PhantomModality MR`을 추가하고, 반환한 MRI receipt에 같은 PG 확인 명령을 실행한다. CT/MRI 각각12 SOP·256×256·다음 슬라이스 및 철회 후 픽셀 제거를 확인하며 환자 본인 모의 화면을 실제 열람 증거로 쓰지 않는다.

실제 모바일 승인→의료진 QR 접수 버튼→합성 CT Viewer→철회·거부 재현:

```powershell
powershell -NoProfile -File scripts/run-browser-authorization-trace.ps1 -Port 9227 -Capstone -MobileQr -VerticalFlow -BrowserUrl 'https://192.168.111.149:9443/hipass/'
```

전용 headless Chrome과 실제 PHANTOM 개발 로그인을 사용한다. 접근 키는 기존 cloud secret에서 anonymous stdin으로만 전달한다. 신뢰된 개발 CA·VM·VPN·Cloud가 준비되어 있어야 한다. 카메라 대신 현재 제공되는 QR 인식 시뮬레이션 버튼과 실제 BroadcastChannel 수신을 시험하며 camera/native biometrics/환자 본인 실영상 검증은 아니다. 생성한 동의만 정확히 철회 정리하며 PACS volume·다른 동의는 삭제하지 않는다. wrapper는 자신이 시작한 Chrome/profile을 정리한다. 정리 실패는 FAIL이며 ownedReceipts로 별도 확인한다. 재배포·인증서 rollback은 이번 흐름에 불필요했으므로 실행하지 않았다.

브라우저 PASS receipt의 상대 경로를 그대로 감사 검사에 전달한다:

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-phantom-audit-check.py 'artifacts/workstation/<실제 b-browser 디렉터리>/result.json'
```

실제 QR 10분 만료는 `-VerticalFlow` 대신 `-MobileQrExpiry`를 사용한다. TTL·시계를 조작하지 않는다. 이 별도 실행의 PASS는 Viewer 흐름 PASS를 대신하지 않는다.

A병원에 발표용 CT/MR이 이미 적재돼 있으면 기존 자동 runner의 `verify-a-existing`을 사용한다. 이는 기본 합성 영상을 재적재하지 않으며 원래3개+발표 CT/MR2개의 정확한 Study UID5개를 확인한다. 원래 `verify-a`는 기존 seed/Study3 검증용이므로 발표 데이터 추가 이후 그대로 실행하면 expected3/actual5 FAIL을 반환한다. VM credential은 runner stdin에만 전달하며 문서·명령 인자에 기록하지 않는다.

## 최신 현재 이미지 — 2026-10-09 09:30 UTC

B 현재는 `highpass-platform-mvp:capstone-mobile-qr-expiry-20261009` / `sha256:940806f602ec282d6d03a9da6948b6a8453bb47ff9f71fdadb8aa40fa5521aea`. 모바일 만료 시 QR/메모리 capability 제거 및 늦은 ISSUED 응답 차단을 배포했다. 새 scan·파일 hash·rollback·HTTPS 자산 검증 PASS. 실제 기한 경과 브라우저 검증은 진행 중이며 아직 NOT VERIFIED다. 아래 과거 이미지의 CT/MRI/QR PASS와 구분한다.

## 최신 배포 기준 — 2026-10-09 09:14 UTC

B 현재는 `highpass-platform-mvp:capstone-mobile-patient-context-20261009` / `sha256:b61b4b84889cd83364a2a837f570eb72a3a795d71ed8705c47c20e9aa479ec62`이다. 환자 컨텍스트 표시 및 모의 그림 구분 UI를 배포했고, 기존 7cbee1c7 rollback·재전환·보안 설정 보존·HTTPS 경로/자산 검사 PASS다. 아래 08:56의 MRI 반복 결과는 이전 이미지 기준이다.

새 이미지 CT Chrome 검증 PASS: `artifacts/workstation/b-browser-2026-10-09T09-14-24.874925+00-00/result.json`. 선택 환자 프로필/Viewer 표시·12 SOP·256×256·다음 슬라이스·401/403 음성·철회 후 픽셀 제거 확인. 해당 PG 감사 및 hash chain 5414개 PASS. 새 MRI 반복·모바일 QR 브라우저·환자 본인 실제 영상·사람 시연 리허설은 별도 미완료다. 신규 증적 DRAFT / UNASSIGNED.

## 최신 검증 기준 — 2026-10-09 08:56 UTC

B 현재 이미지는 `highpass-platform-mvp:capstone-mobile-viewer-budget-20261009` / `sha256:7cbee1c7532733a78e0742d005fda2b17c527dbc895f709e60de96f56075e215`이다. 아래 과거 미등록/미배포 기록보다 이 절을 우선한다. 고정 팬텀 환자와 CT/MR 카탈로그가 등록됐고, B 배포·rollback·재전환·HTTPS 자산 일치 및 진단 없는 CT 3회/MRI 3회 브라우저 흐름이 PASS다.

VM A/B, Cloud, VPN 및 개발 CA 신뢰와 기존 Cloud SSH 인증이 준비된 환경에서 다음 명령으로 검증한다. 각 명령은 세 개의 새 브라우저를 순차 사용하고 실패하면 중단한다. 기존 기록 삭제/전역 cleanup 없이 각 실행의 동의를 철회한다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-repeat-check.py --phantom-modality CT
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-repeat-check.py --phantom-modality MR
```

증적: `artifacts/workstation/browser-repeat-2026-10-09T08-47-20.969900+00-00/result.json`(CT 200.219초), `browser-repeat-2026-10-09T08-50-53.947225+00-00/result.json`(MRI 322.146초). 여섯 실행 각각의 감사 연결과 최종 PG hash chain 5336개 PASS. 신규 증적은 DRAFT / UNASSIGNED. 모바일 QR와 환자 본인 실제 영상, 수동 화면 리허설은 아직 별도 검증 대상이다.

## A병원 팬텀 적재·읽기 전용 재검증 — 2026-10-09 KST

팬텀24장을 A PACS에 추가했다. 기존4장은 유지하며 총28장이다. 실제 mTLS
WADO 원본 해시·PNG256×256 렌더링·시리즈별12장 QIDO PASS. 이후 기존 암호화
브라우저 시연도 PASS였다. **새 팬텀의 환자 매핑과 Control 메타데이터는 아직
등록하지 않았으므로 새 영상의 전체 Viewer 시연 완료를 뜻하지 않는다.**

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-phantom-source-ops.py 'C:/Users/user/Documents/New project/artifacts/synthetic-phantom/2026-10-08T21-58-15-418Z-25704' --verify-only
```

로컬 concealed 암호 입력이 필요한 관리 명령이다. 암호는 환경변수·인수·파일에
저장하지 않는다. --verify-only는 데이터가 없으면 적재하지 않고 실패한다.
신규 적재가 필요할 때만 옵션 없이 실행한다. UID가 이미 있으면 정확한 파일
해시가 같을 때만 재사용하며 충돌은 적재 전 차단한다. 실패로 남은 신규
팬텀도 임의 삭제하지 않는다. Gateway/CA 개인키는 A 밖으로 복사하지 않는다.
첫 실패와 수정 후 검사 증적은 checkpoint에 모두 보존한다.

다음 작업은 신규 환자 식별자를 임의로 기존 P-1001과 합치지 않고 정식
인증·기관 소유권·매핑·감사 경로로 등록하는 것이다. 그 뒤 별도 동의 scope와
암호화 다중 슬라이스 Viewer E2E를 실행한다. 신규 증적 DRAFT / UNASSIGNED.

## 합성 영상 준비·독립 포맷 검증 — 2026-10-09 KST

실제 환자 영상 대신 직접 생성한 수학적 팬텀을 사용한다. CT/MR 이름은 데모
분류이며, 진단용 촬영 데이터나 임상 해부학 재현이 아니다. DICOM SOP Class는
Secondary Capture이고 화면 픽셀에 TEST가 표시된다. 각 유형256×256/12장,
합계24장이다. 신규 UID·HP-TEST 식별자로 기존 자료를 덮어쓰지 않는다.

```powershell
node scripts/generate-synthetic-phantom.js
# 위 명령이 출력한 새 output 디렉터리를 그대로 전달한다.
node scripts/verify-synthetic-phantom.js '<output 디렉터리>'
```

생성 manifest에 출처·한정문구·파일별 SHA256이 기록된다. 검증 명령은 로컬에
이미 있는 정확한 이미지 ID만 사용하며 다운로드하지 않는다. 외부 통신·포트
게시·기존 volume 없이 일회성 Orthanc에서24장 저장·원본 바이트 보존·PNG 렌더링을
검사하고 소유한 임시 컨테이너만 정리한다. 내부 loopback REST는 포맷 검사이며
운영 TLS/인증 검증을 대체하지 않는다. 최신 실제 검사24/24 PASS, 전체642개
테스트 PASS. 증적은 checkpoint 최신 절 참조.

**현재 이 팬텀은 VM 시연에 아직 등록하지 않았다.** A PACS 적재와 Control
환자 매핑·메타데이터·동의 scope 등록 후 별도 암호화 다중 슬라이스 Viewer
E2E가 필요하다. 기존2×2 Viewer 성공을 이 데이터의 성공으로 보고하지 않는다.

## 실패한 시연의 동의 정리 — 2026-10-09 KST

검증 브라우저가 이번 실행에서 생성한 동의의 정확한 응답을 보유한 경우에만
환자 인증으로 해당 동의를 조회·철회·재확인한다. 기존 동의 일괄 철회나 삭제는
하지 않는다. 원래 시연 FAIL은 그대로 보존하고 정리 성공만 별도 PASS로 기록한다.
생성 응답 누락·중복·소유권 불일치·서버 재확인 실패는 NOT VERIFIED다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-cleanup-check.py
```

이 명령은 동의 생성 직후 의도적으로 중단하는 **정리 전용 검사**다. 정상 발표
시연 성공을 뜻하지 않는다. 실제 검사에서 원래 FAIL/exit1, 정확한 동의의
GET200→철회200→GET200/REVOKED, 삭제0을 확인했다. 이후 별도 정상 브라우저
시연 PASS, 전체640개 테스트 PASS, 감사체인3824건 PASS다. 증적은 checkpoint의
최신 절을 참조한다. 포트9231 검사는 동시에 실행하지 않는다.

강제 종료·CDP 단절 시 정리를 보장하지 않으며, 과거 실행의 정확한 생성 응답이
없는 동의를 추정하여 변경하지 않는다. 해당 상황은 NOT VERIFIED로 기록하고
유효기간 만료 시 접근 차단 정책을 유지한다. 신규 증적 DRAFT / UNASSIGNED.

## 최근 암호화 진단 검증·A 앱 복구 — 2026-10-09 KST

실행 중인 A/B2c·Cloud38d 이미지는 그대로다. 검증용 클라이언트의 HTTPS 연결
단계 진단을 추가했고 전체633개·진단 안전성2개 테스트 PASS다. 실제 암호화14개
진단 실행 PASS:
`artifacts/workstation/encrypted-negatives-2026-10-08T21-42-35.066172+00-00/result.json`.
실제 unwrap 후 철회200, 후검증403, 평문 반환 차단을 확인했다. 이전 준비
timeout은 재현되지 않았으며 원인 해결을 주장하지 않는다. 진단용 연결 풀은
별도이므로 무진단 장기 안정성·전역 Key Vault 장애로 확대 해석하지 않는다.
원래 실패 증적과 검증 범위는 checkpoint에 보존한다.

현재2c A Gateway 롤백·복구6개 PASS/121.586초:
`artifacts/workstation/a-rollback-2026-10-08T21-45-20.028105+00-00/result.json`.
사전 검사한9d로 되돌렸을 때와 최신2c 복구 후 실제 브라우저가 모두 PASS였다.
B 포털·클라우드 API/DB·A PACS 컨테이너와 mount는 그대로다. A 앱만 잠시
교체하는 검사이며, VM power-off나 B/클라우드 롤백·DR 검증이 아니다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-a-rollback-check.py --current-image highpass-platform-mvp:capstone-interactive-capacity-20261009 --current-image-id sha256:2c7b366483f1c22855d3a98b6079c05ff4551beb67a77ead94152d623fe542a1
```

현재 이미지 ID와 보존 이미지의 최신 보안 검사를 먼저 확인한다. 리허설 때만
단독 실행하며 포트9231을 다른 검사와 공유하지 않는다. 실패 시 복구 결과와
실행 증적부터 확인하고 무조건 재시작하지 않는다. volume/기존 데이터 삭제는
없다. 모든 신규 증적 DRAFT / UNASSIGNED다.

## 현재 배포·대화형 요청 여유 — 2026-10-09 KST

A/B `capstone-interactive-capacity-20261009` (`2c7b366483f1`),
`/home/server/.highpass-app-2026-10-08T21-31-00.357148+00-00`.
백그라운드 조회는 최대2개이며 동의 변경·토큰 발급 중 대기 조회를 중단한다.
시작한 요청은 정리하고 부분 응답을 적용하지 않는다. 새 명시적 서버 조회와
기존 권한·DPoP·TLS·timeout·보안 지연은 유지한다. 전체631개·Security Gate·
정확한 이미지 HIGH0/CRITICAL0 검사·앱 배포10개 PASS. 이번 이미지의 실제
브라우저3회 PASS/151.322초, 현재 mTLS8개 PASS. 정책 조회39/2098/5110ms를
관측했다. 보안 지연에 따른 시점 차이가 있으므로 성능 비교·장기 안정성 완료로
해석하지 않는다. 실제 암호화 음성 게이트는13 PASS/1 NOT VERIFIED다.
복호화 도중 철회 테스트의 패키지 준비에서 ETIMEDOUT이 발생해 해당 테스트는
실행되지 못했다. 사용한 합성 동의는 REVOKED로 정리했으며 삭제하지 않았다.
이 timeout을 정책 DENY나 PASS로 표시하지 않는다. 진단 결과는 checkpoint를
따른다. 과거 증적은 재사용해
현재 이미지 PASS라고 표시하지 않는다. 전체 MVP/v3는 아직 미완료다.

## 이전9e 배포·반복 검증 — 2026-10-09 KST

A/B 이전 `capstone-poll-backpressure-20261009` (`9e2d9ac82492`),
`/home/server/.highpass-app-2026-10-08T21-15-27.511224+00-00`.
화면 갱신 중 백그라운드 폴링 누적을 제한한다. 명시적인 갱신은 새로운 서버
판단을 조회하며, 인증·권한·TLS·앱 timeout을 완화하지 않는다.
전체625개·Security/Container Gate·앱 배포10개 PASS. 첫 새 브라우저 반복은
2회 PASS/3회차 TOKEN 단계 FAIL로 전체 NOT VERIFIED다. 기존15초 Series 대기와
순차 요청의20초씩 제한을 구분하여 검증기 관찰시간만65초로 정렬했다.
65초 정렬 후에도 첫 실행 TOKEN 실패를 보존했다. 정책 조회 진단 추가 후
새 브라우저3회 모두 PASS/170.270초:
`artifacts/workstation/browser-repeat-2026-10-08T21-23-09.130094+00-00/result.json`.
각 실행의 동의·토큰·철회 연결 및 실제 암호화2x2 합성 영상 확인 PASS다.
3회차 정책 조회9.788초로10초 제한에 근접했다. 장기 반복 안정성·간헐 원인
완전 해결을 주장하지 않는다. 잔여 위험은 checkpoint를 따른다. 이전 실패는
삭제하지 않는다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-repeat-check.py
```

디버거·장애 주입·실패 자동 재시도 없이 새 브라우저3회를 순차 실행한다.
첫 실패에서 중단한다. 반복3회는 HA/부하 시험이나 전체 MVP 완료의 증명이 아니다.
실패 시 정확한 실행 증적·고정 진단 코드·응답시간을 확인하고 무조건 재실행하지 않는다.
암호는 숨겨진 입력에서만 사용하며 파일·로그에 남기지 않는다.

## 현재 배포와 동의 결과 구분 — 2026-10-09 KST

이전 e7 A/B `capstone-consent-result-20261009` (`e7dc852f99ab`), 컨텍스트
`/home/server/.highpass-app-2026-10-08T21-01-45.321385+00-00`.
생성 성공 응답 이후 화면 갱신 실패는 `CONSENT_REFRESH_FAILED`로 구분한다.
확인된 동의 ID를 보존하지만 재조회 전 접근을 허용하지 않는다. 서버 생성
응답 자체가 확인되지 않으면 기존 `CONSENT_REQUEST_FAILED`다. 오류를 보고
동의를 무조건 다시 만들지 말고 동의 이력을 먼저 재조회한다.
배포10개·전체622개·Security/Container Gate PASS. 이전 이미지 증적은 아래에
보존하며, 새로운 실브라우저 결과와 정확한 미완료 항목은 checkpoint를 따른다.

최신 e7 장애·복구6개 PASS/89.752초:
`artifacts/workstation/browser-outage-2026-10-08T21-03-36.964928+00-00/result.json`.
후속 새 브라우저 정상 암호화 열람·철회·동의 ID 연결 PASS:
`artifacts/workstation/b-browser-2026-10-08T21-05-31.004163+00-00/result.json`.
초기 UI에 진단 디버거를 사용한 실행이다. 이전 간헐 실패가 완전히 해결됐다고
간주하지 않으며, 진단 없는 반복 안정성 검증이 다음 P0다. 생성 후 갱신 실패
구분은 구현됐지만 이전 예외의 정확한 원인 및 실패 흐름 잔여 동의 정리는 미검증.

## 최신 장애 검증 상태 — 2026-10-09 KST

B 포털의 Key Vault·Control 연결을 개별 차단하면503/no image/영상 숨김을
확인했다. Control 상태를 확인할 수 없으면 기존 토큰을 폐기하며, 연결 복구
후에도 자동으로 복원하지 않는다. 임시 규칙 제거와 기존 B 컨테이너 보존 PASS.
다만 별도 새 브라우저가 동의 생성 `CONSENT_REQUEST_FAILED`로 실패해 전체
게이트는 NOT VERIFIED다. 발표 전 이 실패 원인 수정·재검증이 필요하다.
증적 `artifacts/workstation/browser-outage-2026-10-08T20-48-51.580581+00-00/result.json`.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-browser-outage-check.py
```

실제 시연 포털 연결을 잠시 차단하는 명령이므로 리허설/검증 때만 사용한다.
포트9231 독점, VM-local150초 exact-rule 삭제 watchdog과 finally 복구를 사용한다.
차단 범위는 B 컨테이너 egress 연결이며 전역 Key Vault 장애나 Cloud DR이 아니다.
실패 시 명령을 무조건 반복하지 말고 실행 핸들·state.json·브라우저 증적을 확인한다.

## VM 자동 시작·순차 재기동 게이트

관련 FR-026~FR-041. Docker와 `wg-quick@hp-capstone` 활성화, 현재 이미지와
모든 컨테이너의 프로젝트 소유권·재시작 정책을 먼저 확인한다. 두 VM의
`/etc/systemd/system/docker.service.d/90-highpass-capstone-overlay.conf`는
Docker가 터널 전용 IP 생성 이후 시작하도록 순서를 지정한다. 원본 설정이나
다른 drop-in을 덮어쓰지 않으며 서비스·VM을 즉시 재시작하지 않는다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-vm-autostart-check.py
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-vm-reboot-check.py
```

첫 명령은 읽기 전용이다. 둘째 명령은 A→B 각1회 게스트 재기동을 예약하고
240초/VM 관찰 기한으로 기존 SSH 키의 복구를 확인한다(개별 유한 SSH 검사가
기한 종료를 넘길 수 있다). 이어 최대235초 실제
브라우저 검증을 실행한다. 포트9231은 독점 사용한다. 이미 진행 중인 명령의
관찰이 지연됐다는 이유로 재실행하지 않는다. 해당 실행의 `state.json`과
실행 핸들을 확인한다. 실패 시 자동 추가 재기동·볼륨 삭제·재배포는 없다.
증적 범위는 게스트 재기동이며 VM 전원 차단·클라우드 재기동·DR은 제외한다.

2026-10-09 KST 실제 순차 재기동5개 PASS/191.337초, 수동 Compose 시작 없음:
`artifacts/workstation/vm-reboot-2026-10-08T20-33-56.888952+00-00/result.json`.
복구 후 브라우저 정상·음성·철회 및 동일 동의 연결 PASS:
`artifacts/workstation/b-browser-2026-10-08T20-37-22.491972+00-00/result.json`.
감사로그2103건 chain 검증 PASS. 전체 MVP/v3 완료 또는 DR 증적은 아니다.

## 현재 시연 배포 — 2026-10-09 KST

A/B `capstone-consent-flow-20261009` (`d6c38ee56bb8`), 컨텍스트
`/home/server/.highpass-app-2026-10-08T20-18-57.600800+00-00`.
클라우드38d·기존 PACS/DB 유지. 전체619개 및 Security/Container Gate PASS.
실제 브라우저 검증 PASS: 정상 암호화 영상, 중복 클릭 시 생성·발급·철회
각1건, 동일 동의 ID 연결, DPoP 음성 차단, 철회 후 영상 제거.
증적 `artifacts/workstation/b-browser-2026-10-08T20-21-15.312026+00-00/result.json`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-browser-authorization-trace.ps1 -Port 9231 -BrowserUrl https://192.168.111.149:9443/hipass/ -Capstone -NegativeBoundary
```

포트9231을 독점 사용하며 TLS 검증을 우회하지 않는다. 합성2x2 영상과
개발 인증만 사용한다. VM 전체 재기동, 전역 Vault/Control 장애 및 독립 사람
검토는 미검증이다. 아래 a7 롤백 명령/결과는 과거 이미지 검증 기록이며
현재 d6 복구 검증으로 간주하거나 그대로 실행하지 않는다.
새 증적 DRAFT / UNASSIGNED; 전체 MVP/v3 완료 선언 없음.

## 최신 UI 시작 순서·dashboard 응답 순서 수정 — 2026-10-09 KST

현재 A/B 이미지 `capstone-ui-bootstrap-20261009` (`a7c753acbdad`),
컨텍스트 `/home/server/.highpass-app-2026-10-08T20-04-05.591573+00-00`.
배포10개 PASS; 클라우드는 기존 `38d707e7a924`, PACS·DB 보존.
늦게 도착한 폴링 응답이 새 동의 선택/철회 결과를 덮어쓰지 않도록 수정했다.
DPoP·Viewer 상태 초기화 후 이벤트와 첫 조회를 시작하도록 순서도 수정했다.
전체613개 PASS, Security Gate PASS, 이미지 HIGH/CRITICAL0. 실제 최초
롤백 검증은 NOT VERIFIED였으며 기록을 보존한다. 최신 반복 결과는
governance checkpoint를 확인한다. 다음은 A Gateway 앱만 되돌렸다 복구하는
명령이며, B/클라우드 롤백 또는 VM 전체 재기동을 의미하지 않는다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-a-rollback-check.py --current-image highpass-platform-mvp:capstone-ui-bootstrap-20261009 --current-image-id sha256:a7c753acbdadc06de1ccaa3b49a493302c96d94b005598e7666f406db6114e5c
```

포트9231은 이 검사가 독점 사용한다. 사전 점검 실패 시 기존 앱을 변경하지
않으며, 변경 시작 후 실패하면 최신 A 이미지 복구를 시도하고 결과를 별도로
보고한다. DB·PACS volume 삭제, 클라우드 감사 수정 이전 버전 복귀, 인증 검증
완화는 하지 않는다. 생성 증적 DRAFT / UNASSIGNED, 전체 MVP 미완료.

최신 A 앱 롤백·복구6개 PASS/113.961초:
`artifacts/workstation/a-rollback-2026-10-08T20-05-33.100671+00-00/result.json`.
복구 후 실제 브라우저 정상/음성/철회 표시 PASS:
`artifacts/workstation/b-browser-2026-10-08T20-08-05.365112+00-00/result.json`.
B·클라우드·PG 컨테이너 및 A PACS 컨테이너/mount 구성은 동일했다. 이는
A 앱만 검증한 결과이며 VM 재기동, 전역 Vault 장애, B/클라우드 이미지
롤백을 PASS로 판단하지 않는다. 단일 전송의 동의 생성/토큰/철회 ID 연결과
동시 클릭 검증은 후속 게이트다. 이전 실패 기록은 보존한다.

## 최신 병원 UI 배포 — 2026-10-09 KST

A/B 이미지 `capstone-consent-ui-20261009` (`d5769004cebf`), 배포10개 PASS.
명시적으로 선택한 동의는 철회·만료 후에도 유지하며, 서버 확인이 없으면
철회 성공 알림을 보내지 않는다. 실제 브라우저 정상 조회/음성 경계/철회
표시/영상 제거 PASS:
`artifacts/workstation/b-browser-2026-10-08T19-42-46.264319+00-00/result.json`.
전체 Node609개 PASS, mTLS8개 PASS, 해당 이미지 HIGH/CRITICAL0.
테스트용2x2 합성 영상이며 임상 품질 또는 OHIF 검증을 주장하지 않는다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-browser-authorization-trace.ps1 -Port 9231 -BrowserUrl https://192.168.111.149:9443/hipass/ -Capstone -NegativeBoundary
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-encrypted-negatives-ops.py
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-encryption-ledger-ops.py
```

암호화 검사에서 필요한 VM 암호는 숨김 입력에만 전달한다. 공개 증적에
암호·토큰·DEK·원본 영상은 포함하지 않는다. 검사 자체 합성 동의는 종료 시
철회/만료 상태를 확인하고 기존 감사 기록은 삭제하지 않는다. 포트9231
검사는 순차 실행한다. 전체 분산 MVP 미완료, 증적 DRAFT / UNASSIGNED.
아래 타임아웃 이미지와 이전 검증 결과는 역사적 기록이다.

신규 이미지 암호화14개 PASS:
`artifacts/workstation/encrypted-negatives-2026-10-08T19-42-40.132365+00-00/result.json`.
이는 실제 B 복호화 모듈/A/클라우드/Private Vault 검사이며, 전역 Vault 장애
또는 브라우저 장애 주입 검증을 의미하지 않는다. 최종 감사1418건 유효,
키 해제61건/소비32건, 읽기 전용 검사5개 PASS:
`artifacts/workstation/encryption-ledger-2026-10-08T19-45-24.019680+00-00/result.json`.

## 최신 클라우드 배포 및 동시 감사 검증 — 2026-10-09 KST

감사로그 저장 snapshot 수정은 클라우드에 배포됐다. 이미지
`highpass-platform-mvp:capstone-save-snapshot-20261009` (digest `38d707e7a924`),
배포7개 PASS, 기존859건 해시/PG 컨테이너 동일. 전체604개 테스트 PASS.
실제 Viewer 요청 중 읽기 전용 동시 검사 PASS(31.520초, 겹치는 스냅샷11개,
감사964→1053건, 연결 오류/기존 해시 수정0). 증적:
`artifacts/workstation/concurrent-audit-2026-10-08T19-14-00.799731+00-00/result.json`.
이 검증은 제한된 단일 브라우저 환경이며 HA·임상 품질을 주장하지 않는다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-concurrent-audit-check.py --cloud-image-id sha256:38d707e7a92417e05112d67522b3819c7346b95f72eba6a19bb05aaed70cd807 --port 9231
```

이 명령은 자체 합성 동의를 만들고 철회하며 감사 기록은 남긴다. 포트9231의
다른 브라우저 검증과 동시 실행하지 않는다. 초기 출력 수집기 정지 결과는
NOT VERIFIED로 보존했고, 수정 후 재검증했다. 기존 정책12개 PASS는 아래에
보존하며 새 클라우드 기준 만료 정책·mTLS 게이트는 별도 재검증 중이다.

새 클라우드 기준 실제 만료 정책12개 재검증 PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T19-21-52.013142+00-00/result.json`.
후속 감사1115건/키 해제34건(소비27건) 읽기 전용 검증5개 PASS:
`artifacts/workstation/encryption-ledger-2026-10-08T19-22-12.773009+00-00/result.json`.
이 결과가 위 대기 상태를 대체하며, 이전 FAIL/NOT VERIFIED는 그대로 보존한다.

현재 A PACS mTLS 구성요소8개 PASS: 정상 인증서 ALLOW, 무인증·비신뢰 발급자·
잘못된 SAN/EKU·현재 CA의 만료 fixture·만료 bad-client DENY, 시험 키 cleanup.
증적: `artifacts/workstation/current-mtls-2026-10-08T19-15-38.287358+00-00/result.json`.
runtime 인증서나 PACS 데이터는 교체하지 않으며 다음 명령은 구성요소 테스트다.

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-mtls-check.py --image highpass-platform-mvp:capstone-timeouts-20261009 --image-id sha256:9d2a12f600d8ec7f114620a9f58ccdf18e69a6ca1ef513e8321168a561849b40
```

CLI 비밀번호 입력은 숨김이며 자동 작업 시 메모리로만 전달한다. 개인키는
증적/로그에 저장하지 않는다. CA 개인키는 VM으로 복사하지 않는다.

## 최신 완료 결과 — 2026-10-09 KST

실제 동의·토큰 정책12개 PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T18-55-42.380231+00-00/result.json`.
Viewer UI·QIDO·WADO·2x2 합성 영상 디코딩·철회 후 캐시 제거와
무인증/DPoP 누락/재사용 차단 PASS/exit0:
`artifacts/workstation/b-browser-2026-10-08T18-56-48.138546+00-00/result.json`.
포털: `https://192.168.111.149:9443/hipass/`.

감사로그는 한 번 연결 검증 FAIL 이후 수정 없이 두 번859건 PASS를 확인했다.
간헐적 실패를 숨기지 않으며, 저장 경합 수정 배포와 제한된 동시성 재검증은 위에
기록했다. 아래 이전 FAIL은 역사적 증적으로
보존한다. 전체 분산 MVP/v3 완료·운영 승인·법률 적합성을 선언하지 않는다.

## 재검증 중인 최신 배포 — 2026-10-09 KST

A/B timeout 보완 이미지 `highpass-platform-mvp:capstone-timeouts-20261009`
(digest `9d2a12f600d8ec7f114620a9f58ccdf18e69a6ca1ef513e8321168a561849b40`)
배포 점검10개 PASS. 증적:
`artifacts/workstation/hospital-app-rollout-2026-10-08T18-43-01.693768+00-00/result.json`.
B 정책 callback8초, 전체 Vault 처리25초, 암호화 영상 요청35초로 유한 시간을
정렬했다. 인증·TLS·동의·일회성 해제 검증과 receipt30초 상한은 유지한다.
실제 재검증12개는 위 증적에서 PASS이며 이전 FAIL 증적은 그대로 보존한다.

실제 만료 검증은 Windows/VM 시각 차이를 피하도록 서버가 서명한 토큰 수명과
브라우저 단조 시간을 사용한다. 서버 TTL은 변경하지 않는다. 짧은 합성 동의는
60초이며, 종료 시 생성한 동의만 서버에서 조회하여 REVOKED/EXPIRED를 확인한다.
EXPIRED는 철회 성공이나 삭제로 표시하지 않으며 감사로그를 보존한다.
신규 증적은 DRAFT / UNASSIGNED, 전체 분산 MVP/v3는 아직 NOT ACHIEVED다.

## 실제 시간 경과 동의·토큰 정책 게이트

최신 실행 결과는 전체 FAIL(8 PASS / 3 FAIL / 1 NOT VERIFIED)이다.
다른 Study·Series, 다운로드 제한, 토큰 변조, 철회 후 같은 토큰의 새 proof,
동의 만료는 실제403 DENY를 확인했다. 후반 정상 이미지2건과 실제 토큰
만료 요청은503으로 실패했고, 생성 동의 전체 cleanup은 미검증이다.
증적: `artifacts/workstation/b-browser-2026-10-08T18-17-37.501073+00-00/result.json`.
발표 완료 근거로 사용하지 말고 요청 단계/제한시간 진단 후 재실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-browser-authorization-trace.ps1 -BrowserUrl https://192.168.111.149:9443/hipass/ -Port 9231 -Capstone -LivePolicy
```

이 게이트는 현재 B 포털/클라우드 정책/A 암호화 경로에서 별도의 합성 동의를
생성하고, 정상 이미지·다른 Study/Series·VIEW_ONLY 다운로드·변조 토큰·철회 후
동일 토큰의 새 proof·동의 만료·실제 토큰 만료를 분리한다. 기본 토큰 수명은
바꾸지 않으므로 약5분 이상 걸린다. UI 시연 게이트와 별개이며 브라우저 메모리의
시험용 키/토큰만 사용한다. 요청 URL·파일·결과에 키/토큰을 저장하지 않는다.
자신이 만든 합성 동의만 철회하고 감사 기록은 보존한다. 오래 걸린 뒤의 cleanup은
정상 Mock IdP 로그인을 갱신한다. 실 운영 IdP나 임상 승인 검증이 아니다.

요청·브라우저·전체 실행에 유한 제한시간이 있다. 시간 초과/연결 실패는
정책 DENY의 PASS가 아니라 NOT VERIFIED다. 첫 실행의 검증기 명령 제한시간
실패와 이후 요청 지연 실패는 각각 원본 증적으로 보존했다. 현재 실행의 최종
판정이 나오기 전에는 이 새 게이트 전체를 PASS로 인용하지 않는다.

## 최신 실행 상태 — 2026-10-09 KST

현재 A/B의 암호화 필수 모드와 클라우드 동의 기반 키 해제 서비스가 실행 중이다.
실제 Azure Key Vault wrap/unwrap을 포함한 합성 환자 동의→DPoP→A 영상→B
내장 Viewer 정상 흐름 PASS. 증적:
`artifacts/workstation/b-browser-2026-10-08T17-51-31.508935+00-00/result.json`.
읽기 전용 DB 검증도 PASS(감사 435건, 일회성 키 해제 5건):
`artifacts/workstation/encryption-ledger-2026-10-08T17-56-05.886607+00-00/result.json`.

현재 실행환경의 비파괴 검증 명령:

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-encryption-ledger-ops.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-browser-authorization-trace.ps1 -BrowserUrl https://192.168.111.149:9443/hipass/ -Port 9231 -Capstone -NegativeBoundary
```

브라우저 검증은 합성 동의를 생성·철회하고 감사 기록을 남긴다. DB/PACS 볼륨은
삭제하지 않는다. 실제 배포된 암호화 모드의 음성·만료·장애·최신 mTLS 경계
검증과 재시작/rollback 재현은 아직 미검증이다. 철회 응답과 Viewer 캐시 제거는
PASS지만 화면이 다른 ACTIVE 동의를 표시하는 선택 문제는 남아 있다.

`-NegativeBoundary` 추가 검증은 무인증401·proof 누락403·proof 재사용403의
영상 미반환을 확인한다. 네트워크 오류/timeout은 NOT VERIFIED로 구분한다.
실제 실행 PASS 증적:
`artifacts/workstation/b-browser-2026-10-08T17-59-50.107760+00-00/result.json`.
이후 감사 527건/키 해제 8건의 읽기 전용 검증도 PASS:
`artifacts/workstation/encryption-ledger-2026-10-08T18-00-36.414065+00-00/result.json`.
이번 재실행에서는 REVOKED 문구도 확인됐지만 UI 선택 문제가 수정된 것은 아니다.
2x2 합성 영상의 내장 Viewer 증적이며 임상 영상/OHIF 성능을 주장하지 않는다.
새 증적은 DRAFT / UNASSIGNED, 전체 분산 MVP/v3는 미달성이다.

이하 이전 단계의 기록은 이 절이 대체한다. 특히 `capstone-protocol-ops.py`와
`capstone-key-crypto-ops.py`는 이전 이미지/평문 응답 기준의 검증기다. 현재 환경에
그대로 재실행하지 말고 이미지 기준 및 암호화 응답 계약부터 정렬한다.

실제 Key Vault 암호화 별도 게이트(2026-10-09 KST): A PACS 합성 DICOM 한 개를
A AES-GCM 암호화/실제 Key Vault wrapping → B 실제 unwrapping/무결성 확인으로
검증했다(13 PASS). 이는 운영자 암호화 검증이며, 환자 동의 기반 키 해제와
브라우저 암호화 Viewer 통합은 아직 미검증이다. 일반 Viewer PASS와 합쳐
전체 암호화 E2E 성공으로 발표하지 않는다. 명령은 infra/azure/README.md 참조.

최신 분산 브라우저 단계: B병원 `https://192.168.111.149:9443/hipass/`에서
개발용 로그인·동의·DPoP·QIDO·합성 영상 Viewer·철회 응답/캐시 제거 PASS.
아래 프로토콜 절은 그 이전 단계의 범위이다. 최신 재현 명령과 한정사항은
문서의 `Actual distributed B portal checkpoint` 절 및 governance checkpoint 참조.
실제 Key Vault 암호화와 전체 MVP/v3 완료는 아직 미검증·미달성이다.

## 실제 A/B VM + Azure 프로토콜 검증 (2026-10-09 KST)

Azure Control API/PostgreSQL/사설 TLS, A Gateway/PACS mTLS가 실제 실행 중이다.
이 단계는 브라우저 Viewer나 실제 Key Vault 암호화 시연 완료를 의미하지 않는다.
가상 환자·소형 합성 DICOM만 사용한다.

설치된 Azure CLI Python으로 다음을 실행한다:

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-cloud-client-check.py
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-protocol-ops.py
```

VM 암호는 숨김 입력에만 전달하며 채팅·명령 인자·로그로 출력하지 않는다.
프로토콜은 새 동의를 만들고 약5분짜리 DPoP 바인딩 토큰으로 허용 범위의
Study/Series/Instance 및 WADO를 실제 조회한 뒤 재사용·범위 밖·proof 없는 요청을
거부한다. 마지막에 새 동의를 철회하고 재접근 차단·감사 hash chain을 확인한다.
기존 seed 동의·DB·PACS 볼륨은 삭제하지 않는다. 테스트 토큰/키 파일은 종료 시
자신의 보호된 임시 디렉터리에서만 제거하고 감사 기록은 보존한다.

최신 실제 프로토콜 결과17 PASS이며 증적은 governance checkpoint에 기록했다.
철회 후 거부 요청까지 마친 뒤 감사 hash chain을 다시 확인한다(최종66개 기록).
출력의 `browserViewer`/`realKeyVaultCrypto`는 NOT VERIFIED가 정상이다.
실제 시간 경과 만료 DENY, 브라우저 화면, cloud Key Vault wrap/unwrap, 전체
운영 승인은 이 명령의 PASS로 주장하지 않는다. 증적은 DRAFT / UNASSIGNED.
A 신규 설치 명령 `capstone-a-gateway-ops.py`는 기존 Gateway/secret 경로가 있으면
중단한다. 장애 시 무조건 재설치하거나 Orthanc 데이터 볼륨을 삭제하지 않는다.

## DPoP / authenticated ingress strict synthetic profile (2026-10-07)

```powershell
docker build -t highpass-platform-mvp:dpop-persistent-20261007-r3 .
$env:HIPASS_VALIDATION_IMAGE = 'highpass-platform-mvp:dpop-persistent-20261007-r3'
node scripts/synthetic-validation.js --dpop
Remove-Item Env:HIPASS_VALIDATION_IMAGE
```

이 명령은 별도 프로젝트·포트·합성 DB·랜덤 ingress secret을 만들고 엄격 모드를
검증한 뒤 해당 프로젝트 컨테이너/네트워크만 종료한다. 데이터 볼륨은 삭제하지 않는다.
Chrome/Edge와 개발 CA의 신뢰 설정이 필요하며 인증서 경고를 우회하지 않는다.
실행 결과는 `evidence/generated/hp-validation-*/manifest.json`의 DRAFT / UNASSIGNED이다.

- `HIPASS_DPOP_REQUIRED=1`: 단기 토큰 발급/QR redeem에 proof가 필수이며 기존 unbound Bearer도 거부한다.
- strict API 시작에는 HTTPS `HIPASS_PUBLIC_BASE_URL`과 32바이트 이상 `HIPASS_INGRESS_SECRET`이 필요하다.
- edge와 API의 secret은 같아야 한다. 예제 secret을 커밋하거나 출력하지 않는다.
- 브라우저의 비추출 WebCrypto 개인키는 메모리에만 보관한다. 새로고침 후 새 키로 기존 토큰을 사용할 수 없으며 다시 발급한다.
- default Compose는 기존 Bearer 호환 모드이다. 기존 스택에 strict 모드가 적용됐다고 주장하지 않는다.
- HMAC envelope는 10초 freshness 및 method/path/IP/Authorization hash를 검증한다.
  공개 origin은 고정 설정만 사용하고 임의 Host/Forwarded/JA3/JA4는 신뢰하지 않는다.
- PostgreSQL profile은 `dpop_replay_entries`의 원자적 unique-key claim을 사용한다.
  proof hash와 만료시각만 저장하며 원문 proof·토큰·환자정보를 저장하지 않는다.
  TTL은 DB 시각 기준 200초, API/DB 시계 차이 30초 초과 또는 저장소 장애는 503으로 거부한다.
  장애 시 메모리 fallback은 없다. 만료 정리는 256회마다 최대 512행으로 제한한다.
  200초는 논리 만료이다. 요청이 없는 동안 만료 hash가 남을 수 있으며 즉시 물리 삭제를 뜻하지 않는다.
  replay query는 5초로 제한한다. 기존 데이터 bulk save는 별도 30초,
  다중 DDL 초기화는 별도 60초 client timeout을 적용해 cold start와 runtime을 구분한다.
  edge는 idle 40초/전체 50초, strict HTTPS 검증 요청은 55초로 제한한다.
  DB 최대 예산과 보안 tarpit을 허용하되 timeout을 정책상 DENY로 판정하지 않는다.
- JSON 호환 profile만 단일 프로세스 Map(200초/최대 10,000개)을 사용한다.
  production strict 모드는 비영속 저장소로 시작할 수 없다.
- strict 검증에는 공유 저장소의 별도 Node 프로세스 경쟁, 실제 API 컨테이너 재시작,
  합성 replay table의 일시적 접근 장애와 복구가 포함된다. 실패해도 PASS로 기록하지 않는다.
  전체 API의 다중 replica/HA와 PostgreSQL 운영 failover는 별도 미검증 항목이다.
- 검증 범위는 기존 단기 DICOM 토큰과 DICOMweb Gateway이다. 신규 `/api/v3` Grant,
  모바일 Vault 또는 OHIF 전체 경로까지 강제 적용된 것으로 해석하지 않는다.

HTTP 음성 테스트는 tarpit을 유지하므로 약 40초가 걸린다. 모든 요청과 전체 실행에는
유한한 timeout이 있고, timeout/전송 장애를 정책 DENY로 판정하지 않는다.

> **CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY**
> NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM.

## 1. 사전 준비

- Windows 11 + WSL2 + Docker Desktop(Linux containers)
- Node.js 20 이상, Repository에 고정된 `pnpm@11.7.0`
- 포트 `3000`, `3443` 사용 가능
- 합성 데이터와 개발 인증서만 사용하며 실제 환자정보·운영 인증서는 사용하지 않는다.

개발 인증서가 없거나 만료 정책을 통과하지 못할 때만 다음을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-dev-certs.ps1
```

브라우저에서 화면을 시연하려면 조직 정책에 따라 개발 CA를 사전에 신뢰한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\trust-dev-ca.ps1
```

TLS 경고 화면을 우회하거나 `--insecure`, `-k`, `verify=false`를 사용하지 않는다.

## 2. 시작과 readiness

한 명령으로 빌드·시작하고, 6개 핵심 서비스와 HTTPS health가 준비될 때까지 최대 120초 동안 확인한다.

```powershell
pnpm run mvp:start
```

패키지 실행이 어려운 제한망에서는 이미 설치된 Node.js로 같은 검증기를 직접 실행할 수 있다.

```powershell
node scripts\mvp-verify.js --start
```

이미 실행 중인 스택은 다음으로 재확인한다.

```powershell
pnpm run mvp:readiness
```

접속 주소:

- 데모 포털: `https://localhost:3443/hipass/`
- OHIF Viewer: `https://localhost:3443/`
- HTTPS health: `https://localhost:3443/api/health`
- HTTP 진입점: `http://localhost:3000` (HTTPS 리다이렉트 확인용)

Orthanc 직접 포트는 호스트에 공개되지 않는 것이 정상이다.

## 3. 발표 흐름

1. 포털 상단의 `CAPSTONE MVP · 합성 데이터 · 비운영 기술 테스트 환경` 배지를 확인한다.
2. 환자 역할에서 합성 환자 `P-1001`, 병원 A→B, 목적, Study/Series와 `VIEW_ONLY` 권한을 선택한다.
3. 동의를 생성하고 의료진 역할에서 단기 토큰을 요청한다.
4. Study→Series→Instance 순서로 조회하고 Viewer 진입과 영상 스트리밍을 확인한다.
5. VIEW_ONLY 다운로드 차단 및 감사로그의 actor/hospital/Study/Series/result/reason/trace/token 식별자를 확인한다.
6. 동의를 철회하고 기존 토큰 재사용과 신규 토큰 발급이 모두 거부되는지 확인한다.

화면에 토큰, 개인키, 인증서 경로, stack trace가 표시되면 즉시 시연을 중단한다.

## 4. 정상·음성 자동 검증

전체 로컬 검증:

```powershell
pnpm run mvp:verify
```

PHR ImagingStudy–Orthanc live mapping 확인은 실행 중인 Compose 스택의 내부 네트워크에서 수행한다.

```powershell
pnpm run phr:verify-mapping
```

이 명령은 `PHR-T04` 정상 매핑과 `PHR-T05` 비매핑 음성 케이스를 검사한다. 호스트 직접 실행용 `phr:verify-mapping:local`은 컨테이너 DNS에 접근할 수 없어 `SOURCE_UNAVAILABLE`이 될 수 있으므로 발표 검증 결과로 사용하지 않는다.

발표 패키지 동결 전 추가 로컬 Gate:

```powershell
pnpm run privacy:db-gate
pnpm run test:cert-rollback
pnpm run ops:expiry
```

위 순서와 fresh Trivy scan, 전체 MVP를 한 번에 실행하려면 다음을 사용한다.

```powershell
pnpm run mvp:finalize
```

검증기는 프로젝트명·네트워크명·mTLS 시험 이미지를 `highpass-phase2` 기준으로 결정한다. 필요하면 `HIPASS_COMPOSE_PROJECT`, `HIPASS_NETWORK_PREFIX`, `HIPASS_MTLS_TEST_NETWORK`, `HIPASS_MTLS_TEST_IMAGE`로 명시적으로 재정의한다.

포함 항목:

- Node 단위·통합 테스트
- 인증서 만료 정책과 만료 fixture
- HTTPS E2E: 동의→정책→토큰→DICOMweb→Viewer 경로→감사→철회/만료
- mTLS 정상 및 무인증·비신뢰·SAN/EKU 불일치·만료 인증서 거부
- Orthanc/DB 직접 접근 차단과 네트워크 경계
- Security/Container Gate
- `DRAFT / UNASSIGNED` 컴플라이언스 증적 생성 및 manifest 검증

각 명령은 `PASS`, `FAIL`, `ENVIRONMENT_BLOCKED` 중 하나와 적절한 종료 코드를 반환한다. 미실행 또는 외부 의존 검증을 PASS로 기록하지 않는다.

## 5. 장애 복구

| 증상 | 확인과 복구 |
|---|---|
| Docker daemon 오류 | Docker Desktop의 Linux Engine을 확인한 뒤 `pnpm run mvp:preflight` 재실행 |
| readiness timeout | `docker compose -p highpass-phase2 ps -a`와 해당 컨테이너 로그 확인 후 `pnpm run mvp:start` 재실행 |
| 브라우저 CA 오류 | `trust-dev-ca.ps1`을 조직 정책에 따라 실행하고 브라우저 재시작. 경고 우회 금지 |
| 포트 충돌 | `Get-NetTCPConnection -LocalPort 3000,3443`으로 점유 프로세스를 확인하고 충돌 해소 후 재시작 |
| mTLS 인증서 오류 | 개발 인증서 재생성 후 `pnpm run mvp:start`; 만료 `bad-client` fixture는 교체 금지 |

복구 리허설 기준선(2026-09-08): 전체 중지 8.94초, 재기동 후 readiness 34.62초, PostgreSQL 및 Orthanc named volume 보존 PASS.

## 6. 종료와 데이터 처리

기본 종료는 컨테이너만 중지하고 named volume을 보존한다.

```powershell
pnpm run mvp:cleanup
```

재시작:

```powershell
pnpm run mvp:start
```

`docker compose down -v`는 합성 DB와 Orthanc 데이터를 삭제하므로 명시적인 초기화 승인이 있을 때만 사용한다.


---

## 7. 3분 / 5분 캡스톤 현장 시연 가이드 (Live Demo Walkthrough)

심사위원 및 평가위원에게 설명할 현재 기술 시연 기준입니다. 모바일 QR 수동 시연은 검증 완료 후 별도 추가합니다.

### 7.1 화면 배치 권장
- **환자 웹·의료진 웹**: `https://192.168.111.149:9443/hipass/`
- **모바일 PWA**: `https://192.168.111.149:9443/mobile/` — 최신 QR 종단 수동 검증 후 시연에 편입한다.

### 7.2 현재 증적으로 설명할 수 있는 시연 흐름

| 순서 | 역할 | 검증된 행동 | 설명 범위 |
|---|---|---|---|
| 1 | 환자 웹 | 개발용 인증에서 팬텀 프로필 선택, CT 또는 MR와 Series 범위 지정, 동의 생성 | 합성 데이터와 개발용 인증을 사용한다. 실제 생체인증 완료 주장은 하지 않는다. |
| 2 | 의료진 웹 | 서버 정책 검증 후 단기 DPoP 토큰 발급, Gateway 목록·영상 조회 | 원본은 A PACS에 있으며 암호화 전송과 Key Vault 연결을 사용한다. 실제 임상 영상은 아니다. |
| 3 | Viewer | 256×256 팬텀 표시, 정확한 12 Instance 목록과 다음 슬라이스 확인 | 의료진 내장 Viewer 검증이다. 환자 본인 Viewer와 네이티브 앱은 별도 개발·검증 대상이다. |
| 4 | 환자/감사 | 동의 철회 확인, 영상 제거, 해당 동의·토큰의 키 발급 및 감사 기록 확인 | 서버 거부·해시체인 검증 증적을 제시한다. 영구 보관·절대적인 위변조 불가능성을 주장하지 않는다. |

위 흐름은 자동 브라우저에서 검증했다. 실제 발표자가 사용하는 버튼 동선과 전체 소요시간은 수동 리허설에서 확정한다. 모바일 QR 사용/만료/철회 표시를 자동 웹 동의 검증만으로 완료 처리하지 않는다.

### 7.3 핵심 보안 계약 (Security Invariants) 검증 포인트
- **토큰 노출 검사**: 이번 브라우저 흐름에서 토큰의 UI·URL·브라우저 기록·localStorage/sessionStorage 노출을 검사했다. 저장소 사용 자체가 전혀 없다는 의미는 아니다.
- **단기 접근권한**: 토큰의 실제 expiresAt을 기준으로 검증한다. 토큰 만료를 A PACS 원본 파일 삭제로 설명하지 않는다.
- **확인된 거부**: 이번 반복에서 무인증 401, DPoP 누락·재사용 403과 영상 미반환, 철회 후 픽셀 제거를 확인했다. 다른 정책·mTLS·네트워크 항목은 각각의 증적을 사용한다.
## 독립 합성 회귀 검증 (2026-10-07)

### 실제 Chrome Viewer 및 패킷 경계 추가 게이트

```powershell
docker build -t highpass-platform-mvp:browser-boundary-20261007 .
docker build -f scripts/test-support/Dockerfile.network-probe -t hipass-network-probe:local .
$env:HIPASS_VALIDATION_IMAGE='highpass-platform-mvp:browser-boundary-20261007'
node scripts/synthetic-validation.js --start-only --keep
$env:HIPASS_VALIDATION_PREFIX='<위 출력의 정확한 project>'
node scripts/browser-boundary-evidence.js
```

전용 Chrome/Edge headless 프로필과 CDP 포트 9227이 필요하다. 포트 충돌 시 실패하며 기존 브라우저를 종료하지 않는다.
기존 개발 CA가 브라우저에서 신뢰되지 않으면 FAIL/NOT VERIFIED로 기록한다. 인증서 경고 우회 플래그를 쓰거나
이 스크립트에서 신뢰 저장소를 임의 수정하지 않는다.
Viewer 성공은 UI 클릭 → 권한 발급 → QIDO/WADO 200 → rendered PNG 200 → blob 이미지 실제 디코딩을 모두 요구한다.
합성 2×2 fixture는 임상 품질·다중프레임·OHIF 전체 렌더링 검증이 아니다. HTTP/API fallback은 성공 판정에 쓰지 않는다.
현재 페이지·navigation history·요청 URL·화면·local/session storage의 토큰 원문 노출을 확인한다.
브라우저 디스크 forensic/cache/log 전체 검증을 수행했다는 주장은 하지 않는다.

패킷 helper는 공식 digest-pinned Alpine의 서명 검증된 apk로 tcpdump를 설치한다. 최초 build는 인터넷이 필요하다.
privileged/NET_ADMIN 없이 NET_RAW와 `--network container:<검증 대상>`만 사용하며 SYN 헤더만 수집한다.
정상 control 연결, 양쪽 namespace capture, source SYN 존재, destination의 control SYN 존재 및
negative SYN 미도달이 모두 확인돼야 경계 PASS다. timeout·DNS 실패만으로 PASS 처리하지 않는다.
특정 방화벽 룰의 counter 검증이나 외부 병원망 검증을 대신하지 않는다.
helper 컨테이너는 자동 제거한다. 전체 합성 stack은 `--keep`로 유지되므로 아래 정확한 project의 cleanup을 반드시 실행한다.
Collector 출력의 `evidence/generated/browser-boundary-<timestamp>/manifest.json`을 별도 manifest 명령으로 확인한다.
모든 증적은 DRAFT/UNASSIGNED이고 DPoP enforcement와 사람의 독립 검토는 별도 게이트다.

기존 데모 DB의 계정 격리를 풀거나 거부 이력을 삭제하지 않고, 별도 Compose 프로젝트로 검증한다.
관련 요구사항: FR-014~041, V3-SR-NET-002/003, V3-NFR-TST-001.

사전 준비: Docker Engine, 기존 개발용 CA/서버/클라이언트 인증서(`tmp/certs/mtls`),
Git for Windows의 OpenSSL 또는 `HIPASS_OPENSSL_COMMAND`, 필요한 Docker 이미지 및 스캔 DB.
실제 환자 데이터는 적재하지 않는다. 기존 개발용 CA를 재사용하므로 PKI까지 독립된 환경은 아니다.

```powershell
docker build -t highpass-platform-mvp:synthetic-patched-20261007 .
node scripts/synthetic-validation.js --preflight
node scripts/synthetic-validation.js
```

동일 명령의 package script는 `pnpm run mvp:synthetic`이다. pin은 pnpm@11.7.0이며,
서명/TLS 검증을 끄지 않는다. 로컬 pnpm 미기동 시 위 Node 명령으로 runner를 실행할 수 있지만,
runner 내부 Security Gate의 dependency audit 미실행은 PASS로 대체되지 않는다.

매 실행마다 `hp-validation-<UTC timestamp>` 프로젝트·컨테이너·네트워크·DB/PACS 볼륨,
임의 포트와 메모리상의 새 비밀값을 사용한다. 출력에 표시된 포트에서만 접근한다.
config → 시작 → readiness → runtime 해시 대조 → 단위 → network → HTTPS E2E → mTLS →
Security Gate → 신규 이미지 스캔 → Container Gate → cleanup 순서로 실행한다.
모든 외부 명령·요청·polling에 timeout이 있고 하나라도 미통과하면 non-zero로 종료한다.

`evidence/generated/<project>/`의 결과·manifest·scan은 DRAFT / UNASSIGNED이며 Git ignore 대상이다.
manifest 확인:

```powershell
node scripts/verify-evidence-manifest.js evidence/generated/<출력된-project>/manifest.json
```

기본 종료는 이번 프로젝트의 컨테이너/네트워크만 제거하고 볼륨은 보존한다.
기존 `highpass-phase2`, `mediq-*`, `soc-*`와 그 볼륨은 수정하지 않는다.
`--start-only --keep`는 이번 환경을 진단용으로 유지한다. 종료하려면 출력된 정확한 프로젝트를 사용한다:

```powershell
$env:HIPASS_VALIDATION_PREFIX='<출력된-project>'
docker compose -p '<출력된-project>' -f docker-compose.validation.yml down --remove-orphans
```

`down -v`나 전역 prune은 사용하지 않는다. 남은 합성 볼륨의 삭제는 이름·소유 프로젝트 확인 후 별도 처리한다.
fresh build, 최초 이미지 pull, 의존성 감사와 최신 취약점 DB 갱신은 인터넷이 필요하다.
오프라인 실행 가능한 부분만으로 최신 감사/스캔 성공을 주장하지 않는다.
HTTPS E2E의 Viewer 확인은 HTTP 초기 응답이며 브라우저 내 실제 렌더링 검증과 다르다.
network의 직접 Orthanc DENY는 현재 토폴로지 증적이며 packet-level 증적은 별도 필요하다.

## Workstation A/B deployment preparation — 2026-10-08

Status: FOUNDATION ONLY / NOT A RUNNING DISTRIBUTED DEMO. Existing VMs, host networking,
Hyper-V/WSL and existing Docker projects are preserved. No Azure hospital VM is required.

Windows host check:

```powershell
pnpm run workstation:preflight
# Or without invoking Corepack:
powershell -NoProfile -File scripts/workstation-demo-preflight.ps1
```

Exit0 is not used by this host-only gate: exit1 FAIL; exit2 NOT VERIFIED until actual
guest boot, dedicated networks and private cloud connectivity are separately proven.
Host memory/disk/vmrun checks can PASS without proving the distributed demo.

Prepare NEW Ubuntu24.04 LTS guests from a verified official image/base. Copy VMX
templates to separate new VM directories, provide independently owned disks, then
create dedicated VMnet20/21 after address/route conflict checks. No guest credentials
or cloud credentials belong in VMX, Git, screenshots or command output. Existing
SOC/training VMs must not be cloned/reconfigured without explicit selection.

On each guest, install a supported Docker Engine/Compose using official instructions,
load the reviewed application/Orthanc/Viewer images and set only role-specific
environment values in a protected, untracked local file. Private keys must be supplied
securely to that guest, never distributed as a shared VM image. Do not copy `.env`
from the Windows development stack. Do not build/pull unreviewed `latest` images.

From the repository root on A, validate configuration (no service startup):

```sh
docker compose --project-directory "$PWD" -p highpass-hospital-a \
  -f infra/workstation/hospital-a.compose.yml config --quiet
```

Required A values: `HIPASS_APP_IMAGE`, `HIPASS_ORTHANC_IMAGE`,
`HIPASS_VM_SECRETS_DIR` (absolute VM-local directory containing only the A server
cert/key and CA files referenced by the profile). Use VM-specific server SANs;
do not disable certificate or hostname validation for a changed network name.

From the repository root on B:

```sh
docker compose --project-directory "$PWD" -p highpass-hospital-b \
  -f infra/workstation/hospital-b.compose.yml config --quiet
```

Required B value: `HIPASS_VIEWER_IMAGE`. This profile has NO exposed viewer port;
it cannot yet be used as a browser demo. Authenticated HTTPS ingress, same-origin
config and authorized Gateway must be completed and tested before publishing it.

After guest/certificate/image validation only, A foundation may be started using
the same Compose arguments plus `up -d --wait --wait-timeout 120`; seed is opt-in
with `run --rm synthetic-seed` (each synthetic HTTP request has a10-second deadline).
Listener health does not prove mTLS identity ALLOW/DENY or token/consent validation.
Do not declare seeding successful unless the one-shot command actually exits0.
Stop only the exact A/B project using the matching Compose arguments plus `stop`.
No `down -v`, global prune, host adapter replacement or automatic clinical data reuse.

Sequence still required: new VM boot -> Docker/seed -> dedicated lab networks and
private Azure endpoint/DNS -> Gateway identity -> real Key Vault crypto -> authorized
A/B Viewer flow -> audit/revoke/expiry -> negative cases -> timed presentation rehearsal.
Key Vault remains private; no firewall/TLS relaxation is an installation workaround.

### User-selected hospital guests — 2026-10-08 checkpoint

User provided these existing copies as the dedicated A/B guests; this supersedes
the earlier assumption that a new official base image must first be obtained:

- A: `C:/Users/user/Documents/Virtual Machines/server - 복사본/server.vmx`
- B: `C:/Users/user/Documents/Virtual Machines/server - 복사본 - 복사본/server.vmx`

Read-only host checks confirmed both files and both running VM instances, VMware
Tools running on each. VMX metadata: ubuntu-64, hardware21, 2vCPU and4096MiB each;
different BIOS UUIDs/MACs. Actual Ubuntu version, guest hostname/machine-id/SSH host
key uniqueness, guest data contents, Docker and application readiness NOT VERIFIED.
No RAM increase or VMX/disk mutation was performed on a running guest.

Both currently attach to VMnet8, not the proposed distinct VMnet20/21. Host VMnet8
is192.168.111.0/24. A Tools IP lookup returns192.168.10.2, which does not match that
subnet; B IP lookup fails. No connection/scan to the mismatched IP was attempted,
because it might resolve/routably reach an unrelated host. Guest network diagnosis
and trusted A/B addressing must precede SSH/deployment. Do not reset shared VMnet8.

Both boot `server-000007.vmdk`. Each read-only descriptor traversal found3 descriptors
and81 referenced files, no missing/extents-outside-folder/parentCID/loop errors and
zero shared resolved path strings across A/B. This is reference-chain consistency,
not a full disk-integrity, physical hard-link, clone identity or synthetic-data audit.
Snapshots/memory/disk files were not deleted or consolidated; full paths stay local.

Next prerequisite: guest access method and Ubuntu username (no passwords in chat).
Use a locally entered credential or SSH public-key enrollment to inspect `ip -br a`,
`ip route`, `hostnamectl`, Ubuntu version and Docker before changing network settings.
Do not print private keys, credentials, machine-id or clinical files to evidence.
Unattended install/OS ISO media are still attached in VMX metadata; safely disconnect
installation media after confirming guest boot and rollback needs, not by deleting it.
Then choose collision-free dedicated networks, assign distinct guest identities and
addresses, and validate host/guest/overlay routes before application startup.

### SSH checkpoint — user-confirmed guest addresses, 2026-10-08

The earlier Tools/address mismatch is superseded: screenshots and subsequent Tools
lookups identify A as `192.168.111.129`, B as `192.168.111.149`, username `server`
on both. Both SSH endpoints respond with OpenSSH9.6p1 Ubuntu. This identifies the
reachable SSH service, not the complete OS or Docker/application readiness.

Both endpoints presented the SAME ED25519 fingerprint:
`SHA256:GQP81aMPoE6sZCi9Qb8zBJdvoxYvuGKNo3+Foau2PP4`.
A's existing Windows known-host entry also matches. B has no OpenSSH trust entry.
Duplicate SSH host identity is a deployment blocker: check the public fingerprints
at each VM console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) and rotate
B's copied host keys before establishing its independent trust entry. Audit all
configured host-key types, not only ED25519; never publish the corresponding private
keys. Back up the existing configured key pairs in a root-only VM-local directory,
generate fresh keys, validate `sudo sshd -t`, restart `ssh`, then compare the new
console fingerprint with the connecting client. Keep console access available for
rollback: restore the exact backed-up pairs, validate and restart SSH. Do not erase
the Windows known-hosts file or globally disable host verification.

No password was persisted or supplied as a process command-line argument. No guest
authentication succeeded: A key-only attempt was denied, B strict verification
rejected its unregistered identity. Guest Docker, package inventories, unique
machine identity and synthetic-only data contents remain NOT VERIFIED. Both
screenshots show hostname `mail`; distinct hospital hostnames are still pending.

After console validation / B key rotation, an operator can enter credentials at
the LOCAL SSH prompt (never paste a password into this command or repository):

```powershell
ssh -o StrictHostKeyChecking=ask -o ConnectTimeout=5 server@192.168.111.129 exit
ssh -o StrictHostKeyChecking=ask -o ConnectTimeout=5 server@192.168.111.149 exit
```

Only accept the fingerprint checked at the corresponding console. Then, from the
repository root, run the read-only guest inventory on each verified host:

```powershell
Get-Content -Raw scripts/workstation-guest-check.sh | ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 server@192.168.111.129 'timeout 30s sh -s'
Get-Content -Raw scripts/workstation-guest-check.sh | ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 server@192.168.111.149 'timeout 30s sh -s'
```

This intentionally does not install packages, change Docker permissions, deploy
containers or write clinical evidence. Exit0 means available guest tools/daemon
checks succeeded, exit1 means a detected failure, exit2 means prerequisites could
not be verified; the application and cloud E2E are always separate NOT VERIFIED.
SSH authentication prompts require a local operator and are not an automated gate.
Infrastructure rotation/inventory evidence remains DRAFT / UNASSIGNED.

#### A guest inventory — 2026-10-08

VMware Tools again mapped the selected VM paths to A `192.168.111.129` and B
`192.168.111.149`. The Windows Terminal enrollment output confirmed A's account
command completed and appended its dedicated public key. Follow-up SSH asked for
the VM password, so public-key-only authentication remains NOT VERIFIED.

The initial helper version did not pin the new identity on its enrollment
connection or verify key-only access. The helper now passes that identity
explicitly and requires a password-disabled key-authentication check before it can
report PASS. The older `PUBLIC_KEY_ENROLLMENT_DONE` output means only that the
append command ran, not that key authentication succeeded.

The read-only A guest inventory reported Ubuntu24.04.4 LTS, hostname
`mail.naver.com`, and `ens33` address `192.168.111.129/24`. The Docker and Compose
check returned `NOT VERIFIED (Docker or timeout command missing)`; because the
inventory checks them together this does not by itself prove which command is
missing. Docker Engine, project containers, and synthetic-only guest data remain
NOT VERIFIED. The guest also exposed its public SSH host-key fingerprints to the
local inventory; its ED25519 key matches B, confirming B's cloned SSH identity.

The prepared installer targets Ubuntu24.04/amd64 only, uses Docker's signed apt
repository, sets bounded package/network deadlines, refuses pre-existing Docker
package/configuration conflicts instead of uninstalling them, and does not add the
account to the root-equivalent `docker` group. Run only inside A's verified SSH
session; the local login and `sudo` prompts need local operator input. Installation
and Docker service status are NOT VERIFIED until the installer reports PASS.
Official procedure: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

Start the prepared setup directly in a local PowerShell terminal:

```powershell
powershell.exe -NoProfile -File scripts/workstation-docker-setup.ps1 -Hospital A
```

This launcher verifies A's known SSH host key and guest MAC/user, sends the LF-only
installer as the remote command, and reserves the interactive input for SSH/sudo.
The remote setup has a 900-second limit; privilege prompts and service startup
also have finite deadlines. Status-only results are written to the ignored
`artifacts/workstation/hospital-a-docker-setup.json`, with review
`DRAFT / UNASSIGNED`. SSH exit 0 is recorded as `NOT VERIFIED` until the terminal's
`DOCKER_SETUP=PASS`, Docker Engine version, and Compose version are all confirmed.
Docker setup PASS does not verify the application or A/B E2E.
B remains blocked until its cloned SSH host identity is rotated and verified.

2026-10-08 regression checkpoint: the full suite passed 526/526 with
`node --test --test-concurrency=4`. The default parallel run failed the large Privacy
bridge output assertion; the same case passed in isolation and with four concurrent
files. Process contention is a working explanation, not a proven application bug.
The standard test command and full gates
now use four concurrent test files, preserving every assertion and timeout.
The Orthanc seed-script digest in the FHIR fixture manifest was updated after
reviewing the timeout-only script change; synthetic patient/Study/Series/Instance
fixture data is unchanged and its owner review remains pending.

#### Local credential bootstrap for subsequent automation

Run the following interactively in local PowerShell, not a recorded automation:

```powershell
powershell -NoProfile -File .\scripts\workstation-ssh-enroll.ps1 -Hospital A
```

The tool verifies A against its existing strict OpenSSH known-host record, probes
the advertised fingerprint with a10-second deadline, creates an A-only development
identity under the user's `.ssh` directory, and restricts its private-key ACL.
`ssh-keygen` asks for a passphrase locally; the SSH client asks for the VM password
locally. Neither credential is an input argument to this tool. Do not approve a
stale/different known-host record.

The guest command verifies the expected `ens33` MAC and `server` user, rejects
symlinked SSH targets and appends only the validated public key without replacing
existing authorized keys. It does NOT change host keys, passwords, Docker access,
hostname or networking. B is explicitly blocked from key enrollment while it shares
A's SSH host fingerprint. Rotate B's keys locally first, verify its new console
fingerprint differs, then rerun with `-Hospital B`. Credential prompts are
intentionally interactive, not a bounded gate.
Load encrypted identities into a local SSH agent for later unattended use; never
send the key passphrase to an assistant. Key enrollment is not application completion.

#### Later automated VM checkpoint — 2026-10-08

The interactive installation/enrollment restrictions above describe earlier failed
attempts, not the current A/B state. Both VMs now have Docker Engine 29.8.2 and
Compose v5.6.0 running. B's cloned SSH host keys were rotated and its independent
key was verified through the local VMware management channel before strict SSH
reconnection. Existing unrelated guest services were preserved.

For the approved local A/B automation, use the existing Azure CLI Python runtime:

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/workstation-automatic-ops.py verify-a
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/workstation-automatic-ops.py boundary-check
```

The first input is concealed credential stdin; never supply a password in argv,
environment variables, source, transcripts or result files. The automated operator
may supply previously authorized credentials through concealed stdin without a
new approval prompt. Each VM's exact public host key comes from its specified VMX
via VMware VIX; unknown keys are rejected, and guest MAC/user are checked.

`verify-a` creates a unique mode-700 validation directory, temporarily copies only
development client fixtures/public CA, and runs bounded probes inside A's private
PACS network. It leaves the runtime server keys and PACS volume intact, removes the
temporary validation files, and exits nonzero for FAIL or NOT VERIFIED. It uploads
four synthetic instances using predefined UIDs, not actual patient images, then
requires exact expected QIDO Study UIDs over strict mTLS. Synthetic images are tiny
generated test pixels, not clinical MRI/CT interpretation examples.

Actual 13:49 UTC result: authorized client ALLOW; no certificate, wrong issuer,
wrong SAN, wrong EKU, expired current-CA and expired bad-client all DENY; QIDO 200
with three synthetic studies. Evidence is DRAFT / UNASSIGNED at
`artifacts/workstation/automatic-2026-10-08T13-49-07.267472+00-00/result.json`.
ECONNRESET counts as DENY only with the exact corresponding server certificate
rejection tuple. DNS errors, refusal and timeout are not certificate denial proof.

Orthanc's retained DICOMweb plugin must be explicitly listed in the JSON `Plugins`
field; its absence caused the initial actual QIDO 404. A's original configuration
is retained in the timestamped `before-dicomweb` backup documented in the cloud /
Workstation checkpoint. No PACS volume was recreated or deleted.

This gate does NOT complete patient/scope authorization, B authenticated Viewer,
VPN, Azure Key Vault crypto or distributed E2E. Do not present the foundation
listener as an authorized cross-hospital imaging service. The shared weak VM
password is an isolated-demo convenience, not a production credential policy.

#### Later private overlay checkpoint — 2026-10-08

A/B/cloud WireGuard connections are now live (10.90.88.2/.3/.1). No managed Azure
VPN Gateway was added. Repeat the bounded private-network gate with:

```powershell
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-overlay-ops.py verify
```

Use concealed credential stdin only. `configure` is for initial installation and
refuses existing interface/configurations; do not rerun it when observation times
out. `verify` reuses live interfaces and may install an exact raw-PACS DROP-counter
rule in its own cloud chain for evidence; it never restarts tunnels on timeout.
No key dumps: never run `wg showconf` or `wg show ... dump` in recorded commands.

PASS requires actual A/B cloud pings, authenticated handshakes, TLS-verified
Key Vault401 via private IP, and raw Orthanc timeout correlated with the exact
cloud firewall DROP counter. Current key-operation/Viewer gates remain NOT VERIFIED.
The Vault probe explicitly maps the ordinary hostname to the private endpoint;
this is not proof that automatic DNS already works inside future containers.

Interface `hp-capstone` and `wg-quick@hp-capstone` are dedicated to this demo.
To stop an individual tunnel, use `sudo systemctl stop wg-quick@hp-capstone` on
that verified machine. To restart use `sudo systemctl start wg-quick@hp-capstone`
then rerun `verify`. Stop is not deletion: keys/configs and PACS volumes remain.
Reboot recovery and loss-of-network recovery have not been exercised yet.
# Actual distributed B portal checkpoint — 2026-10-09 KST

Current B UI: `https://192.168.111.149:9443/hipass/`. Requires local access to
VMnet8 and trust in the existing public development CA. Never bypass certificate
warnings. A Gateway uses the private overlay; cloud receives only control
metadata, not persistent original DICOM or raw DEKs. This is synthetic capstone
TEST authentication, not a real hospital IdP or production approval.

Automated browser reproduction from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-browser-authorization-trace.ps1 -BrowserUrl https://192.168.111.149:9443/hipass/ -Port 9231 -Capstone
& 'C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe' scripts/capstone-b-login-check.py
```

The browser command uses an owned headless Chrome profile and cleans only that
profile/process. It requires the existing pinned cloud SSH identity; obtains the
presenter key through encrypted privileged SFTP and passes it via an anonymous
stdin pipe. It never writes the key/JWT to a file or command line. Do not record
raw network payloads or print the presenter. Service stacks remain running.
Results are timestamped under `artifacts/workstation/b-browser-*` and `b-login-*`,
DRAFT / UNASSIGNED. Browser login, consent, bound token, QIDO and rendered2x2
synthetic image are verified; terminal revoke acknowledgement and image cache
clear are checked. A previous text-only revoke assertion failed because the
dashboard selected another active consent; preserve that original failed result.
Same-token server denial and actual elapsed expiry require their separate gates.

`scripts/capstone-b-portal-deploy.py` is a one-time baseline-checked installer,
not a general restart command. It refuses existing B secrets/project and an
unexpected cloud image; do not rerun blindly or delete secrets to force it.
TLS key generated on B, public CSR signed with existing development CA for31days;
cloud signer/presenter keys never copied to B. Existing DB/PACS volumes retained.
Latest deployment and browser evidence are listed in the governance checkpoint.
Real Key Vault cryptography, full distributed cleanup/restart and full MVP/v3
completion remain NOT VERIFIED / NOT ACHIEVED.
