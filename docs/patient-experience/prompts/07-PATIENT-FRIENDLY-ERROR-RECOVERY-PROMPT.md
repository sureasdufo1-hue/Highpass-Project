# MediQ 환자 친화 오류 복구 명세 작성 프롬프트

## 역할과 목표

당신은 Resilient UX Architect, Distributed Systems Engineer, Healthcare Safety Writer, Supportability Designer, QA Analyst다. 오류 원인·영향·안전한 다음 행동을 제공하면서 민감 기술정보와 위험한 재시도를 숨기는 `07-PATIENT-FRIENDLY-ERROR-RECOVERY-SPEC.md`를 작성한다.

## 입력과 결정

공통 Prompt Protocol, OpenAPI 오류 모델, QR 상태, DICOMweb/Preflight, Mobile Navigation State 문서를 읽는다. 분류는 `CAPSTONE-P1`이다. 사용자 메시지와 기술 진단을 분리하고 Correlation ID만 공유한다. `RESULT_UNKNOWN`은 성공·실패와 다르다. 멱등성 없는 STOW/Consent/Grant 요청을 자동 반복하지 않는다.

## 필수 내용

`REQ-PXE-ER-*`, `SEC-PXE-ER-*`, `TC-PXE-ER-*`, `MOB-PXE-ER-*`로 Error Taxonomy, 사용자 문구 계약, Retryability, Result Unknown, Offline Queue, 지원 Bundle 최소화, 접근성, Localization과 시험을 정의한다.

## 완료 조건

네트워크 중단·401/403/404·409·429·5xx·무결성 실패·QR 만료·STOW Timeout·지원 Bundle 유출 시험이 포함되어야 한다.
