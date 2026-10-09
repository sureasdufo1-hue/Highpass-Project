# Consent 철회·만료·증적 조회 정책 결정안

2026-10-08 / POLICY ADOPTED — IMPLEMENTATION AND TECHNICAL REVIEW PENDING.
정책 검토자·승인자: 김범희. 승인일: 2026-10-08 (Asia/Seoul).
사용자의 직접 답변 `L1~L5 기준안 채택`에 따라 아래 다섯 기준안을 채택했다.
이는 정책 선택 승인이지 신규 코드·증적의 독립 사람 검토 또는 기술 PASS가 아니다.
CON-003~006, AUTH-001/004, TEN-003, IAM-003/004, FR-001~005/014~025/037~041.
[기존 lifecycle ADR](../architecture/highpass-v3-consent-lifecycle-adr.md)의 L1~L5를
구현 가능한 결정 묶음으로 정리한다. 실제 외부 기관/법률/운영 승인은 별도다.

## 채택된 기준안

| 선택 | 제안 기준 | 제한·미검증 |
| --- | --- | --- |
| L1 | 현재 인증·재인증 및 ownership이 확인된 환자는 자신의 아직 유효한 동의를 Session 종료/수신 기관 중지와 무관하게 철회 | 기존 approval factory를 재사용하지 않고 별도 revocation capability; 임상 접근 권한은 부여하지 않음 |
| L2 | 초기 MVP에서는 환자 principal·source tenant/hospital ACTIVE와 살아 있는 own ref를 요구; source 중지/ref 삭제는 안전한 거부 및 별도 복구/ownership 검토 | source 장애 중 독립 환자 철회·삭제된 ref ownership/tombstone 증명을 구현했다고 주장하지 않음; 후속 검토 필수 |
| L3 | PATIENT의 consent:withdraw와 별도 INTERNAL_SERVICE/CONSENT_EXPIRY의 consent:expire를 분리; approval/clinical/SESSION_EXPIRY와 혼합 금지 | registry purpose 추가와 각 전용 role/pool은 승인 후 합성 fixture부터; 실제 IdP provisioning은 외부 자원 필요 |
| L4 | validUntil 이후는 worker와 무관하게 논리 EXPIRED로 신규 권한 거부; 환자 철회 명령은 EXPIRED로 거부하고 EXPIRED event는 maintenance가 별도 기록 | WITHDRAWN/EXPIRED 첫 terminal event는 직렬화, 과거 receipt와 현재 유효 상태 분리; 운영 API 오류 계약 추가 정렬 필요 |
| L5 | 환자 본인 최소 DTO와 명시적 source SECURITY_ADMIN+consent:evidence:read reviewer를 분리; 모든 조회 감사 | 일반 HOSPITAL_ADMIN/PLATFORM_ADMIN의 자동 읽기 금지; reviewer 등록·목적·기관 경계·최소 필드 계약은 승인 후 별도 구현/시험 |

L2는 현재 source registry 검증을 우회하지 않는 초기 제한이다. 환자가 source 장애
중에도 권한을 철회할 수 있도록 하는 별도 신원·ownership 증명 경로는 상용화 전
검토가 필요하다. 안전한 거부는 환자 철회가 성공했다는 의미가 아니며 UI/감사에서도
완료라고 표시하면 안 된다. 사용자는 L2 대신 별도 증명 경로를 선택할 수 있다.

L5의 최소 환자 DTO 후보: consentId/contentVersion/eventSequence/현재 표시 상태,
purpose/허용 action·Study/Series 범위/유효기간/독립 link 선택 및 결정 시각.
nonce/secret/원문 인증정보/내부 인증서 경로/다른 환자·기관 정보/전체 감사 원문은 제외한다.
관리자 view는 source 승인 reviewer의 승인 목적에 필요한 필드만 별도 정렬한다.
이 목록 작성만으로 개인정보 최소화·법률 적합성을 완료했다고 주장하지 않는다.

## 승인 이후 구현 순서

1. 실제 사람 답변·검토자·승인자·날짜·정확한 예외를 기록하고 ADR/API/ERD/traceability/
   acceptance를 정렬한다. 승인하지 않은 선택은 TBD로 유지한다.
2. 상태/event3/실제 actor와 subject 분리/reciprocal audit/typed receipt/cascade REQUESTED
   계약을 동결한다. 초기 contentVersion1/event1..2를 수정하거나 과거 challenge 만료
   검증을 후속 terminal event에 재사용하지 않는다.
3. 순수 command 입력 검증 → additive DDL의 owner/nonowner 음성 조립 검증 → private
   withdrawal/expiry 서비스 → actual race/ACK/rollback/권한 격리 → 최소 audited read를 구현한다.
4. worker 미실행에서도 만료/철회는 authority DENY, outbox REQUESTED와 downstream ACK를
   구분한다. 이후 AuthorizationDecision/Grant 구현으로 연결한다. 공개 활성화는 별도 gate다.

## 현재 결정 상태

L1~L5: 기준안 모두 채택. 이번 직접 답변을 승인 근거로 사용하며 기존 계획 승인이나
기본 선택·무응답을 근거로 사용하지 않는다. 별도의 예외 승인·기술 검토 판정은 추가하지 않았다.
이 패킷은 scope/role/권한/DB/API를 활성화하지 않는다. 후속 구현 및 기술 증적은
검증 전 NOT VERIFIED, 생성 후 DRAFT / UNASSIGNED로 유지한다. 전체 MVP/v3는 미완료다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
