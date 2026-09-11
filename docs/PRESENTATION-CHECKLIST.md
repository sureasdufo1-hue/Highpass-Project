# Capstone Presentation Checklist

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 전날

- [x] 합성 데이터만 사용하고 실제 환자정보가 없음을 확인한다.
- [x] Node·pnpm·Docker Compose 버전과 로컬 데모 포트 3300/3443을 점검한다(3000은 별도 서비스가 사용 중인 경우).
- [x] 개발 인증서 만료 정책과 만료 음성 fixture를 확인한다.
- [x] PF-0 PostgreSQL migration/RLS Gate를 실행한다.
- [x] 개발 인증서 rollback 호환성 리허설을 실행한다.
- [ ] 최신 생성 증적의 사람 검토자와 검토일을 기록한다.

## 발표 직전

```powershell
pnpm run mvp:start
pnpm run mvp:readiness
```

- [ ] 6개 서비스가 모두 healthy인지 확인한다.
- [ ] `https://localhost:3443/hipass/`에서 합성·비운영 배지를 확인한다.
- [ ] `https://localhost:3443/`에서 OHIF Viewer가 표시되는지 확인한다.
- [ ] TLS 경고나 인증 우회 없이 접속되는지 확인한다.

## 시연 순서

1. 합성 환자와 ImagingStudy를 선택한다.
2. 병원 B, 치료 목적, `VIEW_ONLY`, Study/Series 범위를 지정해 동의를 생성한다.
3. 병원 B 의료진이 단기 토큰을 발급받는다.
4. Viewer에서 QIDO/WADO lazy loading과 영상 표시를 확인한다.
5. 감사로그에서 actor, hospital, scope, result, reason, correlation을 추적한다.
6. 범위 밖 Series와 다운로드를 거부한다.
7. 동의를 철회하고 기존·신규 토큰 접근이 거부되는지 확인한다.
8. 무인증·비신뢰·만료 mTLS와 Orthanc 직접 접근 거부 결과를 제시한다.

## 장애 대응

- 서버가 준비되지 않으면 `pnpm run mvp:readiness`와 `docker compose -p highpass-phase2 ps`를 확인한다.
- 인증서 오류는 인증서 lifecycle Gate로 진단하며 TLS 검증을 우회하지 않는다.
- 네트워크·패키지 레지스트리 장애는 `ENVIRONMENT_BLOCKED`로 보고하며 PASS로 바꾸지 않는다.
- 실제 환자정보, 운영 credential, 개인키, 토큰이 화면이나 로그에 보이면 시연을 중단한다.

## 종료

```powershell
pnpm run mvp:cleanup
```

기본 종료는 named volume을 보존한다. `docker compose down -v`는 별도 초기화 승인이 없으면 실행하지 않는다.
