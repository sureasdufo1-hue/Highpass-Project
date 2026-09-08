# Capstone Demo Runbook

## 준비와 실행

- Windows 11, WSL2, Docker Desktop, Node.js 20 이상
- Docker Desktop Linux containers 실행 및 포트 `3000`, `3443` 사용 가능
- 실제 환자 데이터와 운영 인증서 사용 금지

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-dev-certs.ps1
docker compose up -d --build --wait
node scripts\mvp-verify.js --readiness
```

`https://localhost:3443`에 접속한다. 개발 CA는 조직 정책에 따라 `scripts/trust-dev-ca.ps1`로 신뢰하며 TLS 검증 우회 옵션은 사용하지 않는다.

## 발표 흐름

1. `CAPSTONE MVP · 합성 데이터 · 비운영` 배지를 확인한다.
2. 환자 화면에서 P-1001, 병원 A→B, 목적, Study/Series와 권한을 선택한다.
3. 동의를 생성하고 의료진 화면에서 단기 토큰을 요청한다.
4. Study→Series→Instance 순서로 조회하고 영상 스트리밍을 확인한다.
5. VIEW_ONLY 다운로드 차단과 감사로그를 확인한다.
6. 동의를 철회하고 기존·신규 토큰 접근 차단을 확인한다.

## 자동 검증

```powershell
node scripts\mvp-verify.js --preflight
node scripts\mvp-verify.js --readiness
node scripts\mvp-verify.js
```

`pnpm run mvp:verify`도 동일하다. 제한망의 Corepack/pnpm 레지스트리 차단은 `ENVIRONMENT_BLOCKED`이며 PASS가 아니다.

예상되는 mTLS 결과는 정상 인증서 ALLOW, 무인증·비신뢰·만료 인증서 DENY다. 동의 없음, 병원·목적·범위 불일치, 만료·철회·변조 토큰도 DENY여야 한다.

Docker 오류는 Docker Desktop 상태를 확인하고 readiness를 재실행한다. 인증서 오류는 개발 인증서를 재생성한 뒤 Compose 컨테이너를 recreate한다. 기본 종료는 볼륨을 보존한다.

```powershell
docker compose stop
```

`docker compose down -v`는 데모 데이터를 파괴하므로 명시적 초기화에만 사용한다.
