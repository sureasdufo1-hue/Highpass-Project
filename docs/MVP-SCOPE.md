# Capstone MVP Scope

현재 목표는 `CAPSTONE MVP`이며 운영 또는 법률 적합성 판정이 아니다.

`CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM`

| 상태 | 의미 |
|---|---|
| PASS | MVP 범위 안에서 구현과 테스트 증적 확인 |
| PARTIAL | 일부 구현됐으나 운영·조직 증적 부족 |
| DEFERRED | 상용화 결정 후 수행 |
| BLOCKED | 외부 자원·계약·승인 필요 |
| N/A-MVP | 캡스톤 MVP 범위 밖 |
| NOT VERIFIED | 실행 증적 없음 |

## 포함 범위

- 합성 환자와 가상 병원 A/B/C
- 환자 동의 생성·조회·철회와 Study/Series 범위
- 서버 측 RBAC + ABAC 접근정책
- 5분 기본값의 서명된 DICOMweb 토큰
- Gateway token introspection과 범위 제한
- mTLS Gateway-to-Orthanc 연결과 비인가 연결 거부
- QIDO-RS/WADO-RS 기반 lazy loading Viewer
- append-only 감사로그, hash chain, 룰 기반 이상행위 탐지
- 로컬 Docker Compose와 자동 정상·음성 테스트

관련 요구사항은 FR-014~FR-046이다. 연구 반출(FR-042~FR-046)은 확장 데모이며 실제 비식별 적정성·IRB 승인을 뜻하지 않는다.

## 제외 및 상용화 선행조건

- PIPA 법률 적합성: `DEFERRED — PRE-COMMERCIALIZATION`
- ISMS-P 인증: `DEFERRED — PRE-COMMERCIALIZATION`
- 병원 보안성 심의: `DEFERRED — PRE-PRODUCTION`
- 개인정보 영향평가·위탁계약: `DEFERRED / BLOCKED`
- 실제 IdP/MFA, KMS/HSM, PACS, WORM/SIEM, 외부 Staging, DR: `BLOCKED — EXTERNAL RESOURCE REQUIRED`
- 실제 환자정보, 임상 판단 및 의료기관 운영: `N/A-MVP`

`node scripts/mvp-verify.js`에서 핵심 로컬 게이트가 PASS여야 한다. 외부 또는 레지스트리 의존 항목은 숨김 없이 `ENVIRONMENT_BLOCKED`로 표시하며, 생성 증적은 검토 전 `DRAFT / UNASSIGNED`다.
