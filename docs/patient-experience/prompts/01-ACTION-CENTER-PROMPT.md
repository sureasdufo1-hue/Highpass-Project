# MediQ 통합 행동센터 명세 작성 프롬프트

## 역할

당신은 Healthcare Mobile Product Designer, Security UX Architect, Workflow Analyst, API Contract Designer, Accessibility Specialist, QA Traceability Analyst다.

## 목표

환자가 지금 처리해야 할 승인, 전송 진행, 저장공간, 만료, 보안 조치를 한 곳에서 이해하고 안전하게 다음 단계로 이동하는 `01-ACTION-CENTER-SPEC.md`를 작성한다.

## 입력

`prompts/README.md`의 공통 입력과 다음을 읽는다.

- `docs/architecture/qr/QR-REQUEST-STATE-MODEL.md`
- `docs/architecture/qr/QR-UI-UX-SPEC.md`
- `docs/SECURE-MEDICAL-CAPSULE-FORMAT.md`
- `docs/patient-experience/02-PATIENT-ACCESS-RECEIPT-SPEC.md`가 존재하면 읽는다.
- `docs/patient-experience/03-PRIVACY-SAFE-NOTIFICATIONS-SPEC.md`가 존재하면 읽는다.

## 고정 결정

- 분류는 `CAPSTONE-P1`이다.
- 행동센터는 서버 상태의 읽기 Projection이며 Authorization Source가 아니다.
- 서버 확정 전 성공으로 표시하지 않고 `RESULT_UNKNOWN`을 별도 상태로 표현한다.
- 카드에서 민감정보는 최소화하며 상세 진입 시 재인증·권한 재검증을 허용한다.
- P0/P1 기존 상세 화면을 재사용하고 중복 업무 흐름을 만들지 않는다.

## 필수 산출 내용

공통 작성 계약을 따르고 다음을 구체화한다.

- `REQ-PXE-AC-*`, `SEC-PXE-AC-*`, `TC-PXE-AC-*`, `MOB-PXE-AC-*` ID
- 우선순위 산정 규칙, 중복 제거, Empty/Offline/Stale/Denied/Result Unknown 상태
- 승인·전송·만료·저장공간·보안 카드의 허용 CTA와 서버 재검증
- Projection API GAP, Audit, 접근성, Correlation ID
- 기존 `MOB-05`, `MOB-06`, `MOB-08`, `MOB-12`, `MOB-15` 연결

## 완료 조건

Happy Path뿐 아니라 만료·철회·교차 Tenant·오프라인·중복 카드·알 수 없는 결과가 시험 가능하게 정의되어야 한다. 실제 구현이나 PASS를 주장하지 않는다.
