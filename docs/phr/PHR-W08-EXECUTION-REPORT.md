# PHR-W08 실행 보고서 — 환자 동의 Viewer handoff

작성일: 2026-09-10  
범위: CAPSTONE MVP / 합성 데이터 / 로컬 개발환경

## 결과

PHR 동의에서 수신 병원 의료진 Viewer로 이어지는 일회용 handoff 경로를 구현했다. 환자용 API 응답은 DICOM UID와 access token을 포함하지 않으며, nonce는 티켓 저장소에 해시로만 보관된다. `/t/{opaqueNonce}` 진입 직후 브라우저 주소를 `/hipass/#DOCTOR`로 치환하고, 의료진 인증 주체와 서버 보관 티켓의 동의 범위를 검증한 뒤 메모리에서만 단기 DICOM 토큰을 사용한다.

## 구현 항목

| 항목 | 구현 및 근거 | 상태 |
|---|---|---|
| 환자 동의 handoff 발급 | `POST /api/consents/{consentId}/handoff-ticket`, 환자 본인·ACTIVE·유효기간·범위 검증 | PASS |
| nonce 보호 | 32바이트 base64url nonce, 저장 시 `sha256:` 해시만 보관, 중복 ISSUED 차단 | PASS |
| 수신병원 Viewer 교환 | `POST /api/transfers/tickets/redeem-viewer`, doctor/hospital은 인증 principal에서만 취득 | PASS |
| 재사용·만료·철회 | 기존 `redeemTransferTicket` 검증기 재사용, replay·consent revoke fail closed | PASS |
| UI URL 위생 | `/t` nonce 즉시 `history.replaceState`, local/session storage 미사용 | PASS |
| Edge 경로 | `/t/{nonce}`를 Control API로 라우팅해 플랫폼 index 제공 | PASS |
| 실제 IdP·PACS | 개발 Mock principal·로컬 Orthanc만 사용 | DEFERRED |

## 테스트

- `pnpm test`: 148/148 PASS (Windows Python cold-start fixture limit adjusted to 2 seconds; 30ms timeout negative case remains unchanged)
- PHR HTTP 계약: 환자 동의 생성 → handoff 발급 → DOC-B-01 교환 → replay 403 PASS
- 서비스 티켓 테스트: patient binding, expiry/revocation, scope derivation PASS
- `pnpm run mvp:preflight`: PASS (Docker Engine 29.7.2)
- `pnpm run mvp:start`: Compose 6개 필수 서비스 healthy, HTTPS health 200 PASS
- `pnpm run mvp:verify`: 전체 게이트 PASS (HTTPS E2E, mTLS, network, security, container, compliance evidence 포함)
- `scripts/run-browser-authorization-trace.ps1`: HTTPS/Viewer/QIDO/WADO/Authorization header PASS, token URL 노출 없음

## 제한 및 후속

현재 handoff는 로컬 합성 데이터 데모용이다. 실제 OIDC/MFA, 병원 IdP, QR 스캐너, 운영 PACS와의 검증은 상용화 전 백로그로 남긴다. Docker Desktop의 stale IPC socket(`sailor-ingest.sock`, Secrets Engine)을 복구 가능한 백업으로 이동하고 WSL을 재시작한 뒤 Engine이 정상 기동했다. 이미지·볼륨 삭제나 factory reset은 수행하지 않았다.

최종 표기: `CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`
