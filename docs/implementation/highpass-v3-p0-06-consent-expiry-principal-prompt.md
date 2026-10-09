# 다음 실행 — CONSENT_EXPIRY 등록 계약 및 private 명령

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 채택 김범희, 2026-10-08.
CON-003/005/006, IAM-003/004, AUTH-004, TEN-001/003, AUD-001,
legacy FR-001~005/014~025/037~041.

1. 최신 lifecycle ADR/contract, 정책 패킷, 027/028, 실제 withdrawal/SQL expiry 경쟁 증적,
   V3PrincipalRegistry와 SESSION_EXPIRY 계약/서비스/회귀 테스트를 읽고 현재 차이를 확인한다.
   SQL maintenance writer를 private authenticated worker로 주장하지 않는다.
2. registry에서 명시적으로 등록된 INTERNAL_SERVICE의 purpose를 SESSION_EXPIRY 또는
   CONSENT_EXPIRY로 한정한다. 전자는 sole exchange:expire, 후자는 sole consent:expire,
   patientRef=null, 등록 source actor/tenant/hospital 및 ACTIVE를 요구한다. 중복/mixed
   scope와 purpose/scope 교차 사용, human의 maintenance scope는 구성부터 거부한다.
   JWT/요청 body의 servicePurpose나 patientRef를 server-owned 등록 authority로 사용하지 않는다.
3. 서명 검증·issuer/audience·subject·병원·role·sole scope·유효기간을 기존 fail-closed 정책으로
   유지한다. operation requestedScope도 해당 등록 purpose와 정확히 일치해야 한다.
   SESSION_EXPIRY 기존 정상/음성 테스트를 손상하지 않는다.
4. pure consent-expiry batch command를 private issued binding에 묶고 bounded exact selector를
   검증한다. 복사/위조 command, getter/symbol/extra field, 만료 binding과 body actor authority를
   거부한다. 명령 검증은 DB ownership/expiry 성공 증거가 아니다.
5. 정상 2종 purpose와 모든 교차/혼합/human/expired/tampered claim 경계를 unit으로 검증하고,
   actual PG gate와 source hash closure를 재검증한다. 신규 runtime credential/registration이나
   scheduler를 배포하지 않는다. 기존 실제 DB 027 source-purpose 규칙과 Node를 맞춘다.
6. 이후 전용 minimum-capability guarded factory → finite batch private expiry service와
   same advisory actual races/rollback/ACK/cleanup → audited minimum DTO → clinical authority/
   Grant/HTTPS/Viewer로 진행한다. worker delay가 consent validity를 연장하지 않는다.

새 증적 DRAFT/UNASSIGNED. 독립 사람 검토/실 IdP·MFA·기관 운영 승인과 구분한다.
commit/push/merge/PR, 공개 API/운영 DB 적용/권한 활성화 금지. 전체 MVP/v3는 미완료다.
