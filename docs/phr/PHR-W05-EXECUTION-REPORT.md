# PHR-W05 최소 환자 UI 실행 보고서

실행일: 2026-09-09
상태: `LOCAL SYNTHETIC UI PASS / PHR-T15 PARTIAL`
관련 요구사항: PHR-FR-004, PHR-FR-009~011, PHR-T01, PHR-T08, PHR-T14~15

## 구현 범위

- 환자 포털 `나의 PHR` 탭
- `/api/v1/me/phr/summary` 기반 환자·진료·검사·영상검사 요약
- `/api/v1/me/phr/imaging-studies` 기반 FHIR ImagingStudy 목록
- `MAPPED` 영상만 공유 동의 버튼 활성화
- `NOT_MAPPED` 영상의 Viewer 연결 비활성 상태
- 로딩·성공·빈 상태·안전한 오류 안내
- opaque `imagingStudyRef`를 사용한 서버 측 동의 생성
- PHR OpenAPI 계약 및 DICOM UID 비노출 정적 Gate

## 보안 결정

- PHR URL과 query에 `patientId`, DICOM UID, 접근 token을 전달하지 않는다.
- 합성 account subject `synthetic-account-a`와 patient reference `P-1001`을 분리한다.
- 브라우저의 `localStorage`와 `sessionStorage`에 token을 저장하지 않는다.
- 매핑 상태가 `MAPPED`가 아니면 공유 동의 CTA를 제공하지 않는다.
- 동의 범위의 실제 DICOM UID 해석은 서버 내부에서만 수행한다.
- 실제 MyHealthWay, 실제 IdP, 실제 환자정보는 사용하지 않았다.

## 검증 결과

| 시험 | 결과 | 근거 |
|---|---|---|
| PHR UI 계약 | PASS | 로딩·빈/오류·매핑·동의 상태 정적 시험 |
| `/me` 환자 binding | PASS | API 시험 및 실제 HTTPS 200 |
| PHR→동의 생성 | PASS | 브라우저에서 `MAPPED / CONSENT_REQUIRED` 확인 후 ACTIVE 동의 생성 |
| UID/token URL 비노출 | PASS | 브라우저 URL은 `/hipass/#PATIENT`, UI·OpenAPI 정적 검사 |
| 브라우저 console error | PASS | warning/error 0건 |
| Compose readiness | PASS | 6/6 healthy |
| 전체 Node 회귀 | PASS | 144/144 |
| Phase 5 최종 Gate | PASS | 5/5, 기준 SHA `1754f259a5e06b6a6ca96a13f0e132d30c7b058d` |
| 전용 PHR UI→의료진 Viewer 전체 브라우저 경로 | PARTIAL | 서비스 W07은 PASS이나 opaque handoff를 사용하는 역할 전환 UI는 후속 W08/W09 |
| 실제 MyHealthWay/IdP/PACS | NOT VERIFIED | 외부 자원 및 운영 승인이 필요한 MVP 제외 범위 |

실행 명령:

```powershell
node --test test/phr-ui-contract.test.js test/phr-api.test.js test/phr-vertical-path.test.js
docker compose -p highpass-phase2 up -d --build hipass-control-api hospital-b-viewer hipass-edge
pnpm run mvp:finalize
```

## 판정

PHR-W05 최소 환자 UI와 문서화된 API 계약은 로컬 합성 환경에서 완료했다. PHR-T15는 환자 UI의 PHR 조회·동의 생성과 서비스 수직경로가 각각 검증됐지만, 단일 브라우저에서 환자 역할의 opaque handoff를 의료진 Viewer까지 이어주는 W08/W09가 없어 `PARTIAL PASS`를 유지한다.

`SYNTHETIC LOCAL PoC / NOT A CLINICAL OR PRODUCTION SYSTEM`
