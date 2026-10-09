# 동의 철회·만료 lifecycle — 구현 전 계약 정렬 ADR

2026-10-08 / DRAFT / PARTIAL ISOLATED IMPLEMENTATION / PRIVATE WITHDRAWAL IMPLEMENTED; PRIVATE EXPIRY PENDING / UNASSIGNED.
L1~L5 정책 검토자·승인자 김범희, 승인일 2026-10-08. 직접 답변 `L1~L5 기준안 채택`은
[정책 패킷](../governance/highpass-v3-consent-lifecycle-policy-packet-2026-10-08.md)에 등록했다.
정책 채택은 아래 물리 모델·서비스·새 기술 증적의 독립 검토 완료를 뜻하지 않는다.
CON-003~006, AUTH-001~003, GRT-004, TEN-003, V3-AT-CON-002~004,
legacy FR-001~005/014~025/037~041.

## 확인된 요구사항·현재 구조

동의는 versioned evidence이며 canonical 상태는 PENDING/ACTIVE/REJECTED/
WITHDRAWN/EXPIRED다. 내용·scope·기간 변경은 새 contentVersion과 새 evidence를
요구한다. 철회·만료는 새 권한을 거부하고 기존 권한의 정책효과를 기록해야 한다.
근거는 최신 요구사항 CON-001~006 및 acceptance CON-001~004다.

026은 contentVersion1, eventSequence1/2(PENDING→ACTIVE 또는 REJECTED)만 허용한다.
정확한 초기 event/audit/nonce consumption/receipt 조립은 고정 2개 event를
요구한다. event/audit의 patient_actor_id는 실제 최초 patient subject/actor다.
따라서 기존 CHECK에 상태 문자열만 추가하거나 maintenance actor를 patient로
위장하는 것은 구현이 아니다. 기존 ACTIVE receipt를 현재 ALLOW로 쓰지도 않는다.

## 제안한 최소 additive 모델

기존 초기 증적은 수정·삭제하지 않는다. 별도 `consent_lifecycle_events`를 추가해
초기 event1/2 다음 **동일 consentId/contentVersion의 eventSequence3**만 우선
수용하는 방안을 제안한다. event3은 ACTIVE→WITHDRAWN 또는 ACTIVE→EXPIRED이며
해당 version의 후속 terminal event는 하나만 존재한다. 전체 stream은 초기와
후속 event를 합친 읽기 projection으로 정의한다. 상태 event와 contentVersion을
혼용하지 않는다. 027에서 별도 terminal event/audit/results/cascade를 구현해
owned disposable DB에서 검증했다. runtime 적용 및 독립 기술 검토는 별도다.

027은 content의 identity/hash/window/policy 및 ACTIVE event2 predecessor를 FK로 연결한다.
event3는 content별 최대 한 개다. audit는 event 전체 typed tuple과 동일해야 하며
reciprocal deferred FK와 COMMIT full-row guard를 사용한다. results는 actor/source/op/
key/request digest와 state/time/evidence tuple을 연결한다. maintenance 결과의 key digest는
별도 CONSENT_EXPIRE 실행 식별 namespace이며 patient idempotency ledger가 아니다.
cascade는 정확한 event_id의 REQUESTED만 저장한다. 소비자 ACK/실제 중단 완료는 구현하지 않았다.
새 withdrawal/consent-expiry NOLOGIN capability에 runtime 권한이나 credential을 배포하지 않는다.
DB의 service-purpose 제약만 CONSENT_EXPIRY의 sole consent:expire를 추가하며 SESSION_EXPIRY와
교차 사용·혼합은 허용하지 않는다. CONSENT_EXPIRY Node registry 정렬과 private expiry service는
후속 gate다. private 환자 철회 service는 028 단계에서 구현됐으며 해당 합성 검증 결과는 별도 보고서에 기록한다.
직접 SQL fixture의 reauth metadata는 cryptographic 재인증 성공의 증거가 아니다.

후속 event 필드: eventId, consentId/contentVersion/eventSequence, predecessor
eventId/sequence/state, subjectPatientRef, tenant/sourceHospital, 실제 actorId/
actorRole/servicePurpose, fromState/resultingState, effectiveAt/recordedAt,
policyVersion, safe reasonCode, auditSessionId/traceId, command/evidence hash.
maintenance의 actorId는 실제 서비스 principal이며 환자 actor FK를 재사용하지 않는다.
본인 소유 대상은 content tuple/registered patient binding으로 검증한다.

새 immutable lifecycle audit는 event의 전체 identity/time/context tuple과
reciprocal deferred FK로 연결한다. patient operation의 typed original receipt는
actor/source/operation별 HMAC key/request digest에 묶는다. 같은 key 변경 command는
conflict, 성공 ACK 유실은 최초 receipt 복구, 다른 key 중복 terminal은 새 event를
만들지 않는다. nonce 재소비는 없다. maintenance는 finite batch와 별도 execution
receipt이며 patient 명의 idempotency ledger에 기록하지 않는다.

별도 최소권한 scope `consent:withdraw`와 maintenance `consent:expire`, 전용
NOLOGIN capability/제한된 pool/private factory를 제안한다. 기존 `consent:approve`,
clinical role, 일반 관리자 또는 서비스 token에 자동 권한을 추가하지 않는다.
withdraw command는 target consent/version과 expectedEventSequence만 받으며
actor/MFA/상태/증거/병원 정보를 body authority로 받지 않는다.

## 유효 상태·정책효과

effectiveConsent는 최신 terminal event 없음, validFrom≤DB clock<validUntil,
현재 등록 identity/parent/recipient/policy/resource/action의 모든 조건을 만족할
때만 후보가 된다. EXPIRED event worker가 늦거나 실패해도 DB clock 만료는
즉시 DENY다. 최초 event가 ACTIVE라는 이유만으로 ALLOW를 반환하지 않는다.

만료 event의 effectiveAt는 원본 validUntil, recordedAt는 실제 작성 시각이다.
철회 effectiveAt는 실제 원자적 terminal 기록 시각으로 제안한다. outbox에는
정확한 consent/version/event/policy의 cascade **REQUESTED**만 기록한다.
Grant/토큰/실행 중 작업의 중단 완료는 각 consumer의 실제 반영 ACK가 있어야 한다.
신규 authority admission은 event/DB clock을 동기적으로 재검증하여 outbox 지연과
분리한다. 아직 소비자가 없으므로 해당 정책효과 구현·시험은 NOT VERIFIED다.

withdrawal은 Session CANCELLED/REVOKED 전이와 별도다. 기존 REQUESTED 취소의
PATIENT_WITHDRAWN reasonCode도 새 Consent WITHDRAWN event의 대체 증거가 아니다.
REJECTED·WITHDRAWN·EXPIRED는 재활성화하지 않는다. 새로운 contentVersion/새
승인으로 교체하는 CON-004는 별도 계약/후속 구현이며 초기 version 제약을 풀지 않는다.

## lock·원자성 계약 제안

private principal 검증 및 persisted registry lock→actor/operation key advisory→
consent/source 공통 lifecycle advisory→필요한 parent/subject locks→정확한 현재
event/content 읽기→terminal event/audit/receipt/cascade INSERT→최종 확인→COMMIT.
승인·철회·만료·후속 authority의 lock domain과 행 순서를 함께 검토한다. 기존
Session/ref/기관 SHARE 뒤 Session UPDATE를 새로 요구하지 않는다. 현재 registry
JOIN의 여러 row lock 순서 및 전체 다중 Session D6는 미검증이라 완료 claim은 금지한다.
[기존 Session workflow의 제한된 실제 다중 경합](../governance/highpass-v3-multisession-contention-execution-2026-10-08.md)은
후속으로 검증했지만 아직 미구현인 Consent 철회/만료의 전체 lock domain 증명이 아니다.
DDL은 정확한 predecessor·시간·actor·scope 및 최소 조립을 COMMIT에서 검증해야 한다.
초기023~026 guard를 과거 challenge 만료 때문에 후속 lifecycle 전체에 재적용하지 않는다.

## 승인된 선택·구현 경계

| 선택 | 채택 기준 | 구현 경계 |
| --- | --- | --- |
| L1: parent terminal/target stop 중 환자 철회 | 현재 인증·재인증·ownership 확인 환자의 유효한 own consent 철회는 parent/target live admission과 분리 | 별도 revocation capability; 임상 접근 권한은 부여하지 않음 |
| L2: source stop/ref deletion 중 철회 | MVP는 환자 principal·source tenant/hospital ACTIVE 및 live own ref 요구 | 안전한 거부·별도 복구 검토; 철회 성공으로 표시 금지 |
| L3: 별도 최소 scope/maintenance identity | consent:withdraw/consent:expire 및 별도 감사 actor | registry/IdP provisioning 변경이며 기존 consent:approve에 암묵 승계 금지 |
| L4: 이미 deadline 지난 환자 command | worker와 무관하게 논리 EXPIRED로 DENY; 환자 command도 EXPIRED로 거부 | maintenance 별도 기록; terminal event 직렬화·과거 receipt/현재 유효성 분리 |
| L5: 최소 evidence read | patient own 최소 DTO와 명시적 source SECURITY_ADMIN + consent:evidence:read reviewer 분리 | 모든 조회 감사; 일반 admin 자동 읽기 금지; reviewer 등록/목적/필드 계약 후속 구현 |

L1~L5 정책은 채택됐지만 구현 및 시험 성공은 별도다. 외부 실제
IdP/MFA·KMS·기관 운영 승인도 로컬 설계로 대체하지 않는다.

## 완료 기준 — 아직 NOT VERIFIED

후속 internal withdrawal service는 구현·owned PG 검증 중이다. 028 retry/denial outcome은
initial/event3 audit와 별개이며 actual admitted actor/source/ref, HMAC selector/key digest,
fixed reason/correlation 및 optional 원본 event FK만 기록한다. 신규 철회와 역사적 receipt 복구의
projection을 분리했다. 후자는 새 authority가 아니며 validUntil 경과 후에도 현재 인증/재인증/
source ACTIVE/live own ref 확인 아래 원본만 복구한다. 공개 evidence read/사전 인증 거부 감사/
다운스트림 권한 차단은 별도 gate다. 초기 receipt 및 terminal tuple을 덮어쓰지 않는다.

현재 인증 환자 own-only 철회·외부 환자/기관/관리자 deny, 실제 service actor 만료,
원본 내용 불변/연속 sequence/정확한 audit, 누락 조립 rollback, same/different-key
경쟁·lost ACK, withdraw/expiry와 authority/Grant/DICOM access 경쟁, worker 미실행
만료 DENY, cascade REQUESTED와 ACK 구분, 현재/과거 receipt 분리, 통합 HTTPS/UI.
전체 CON-003~006 완료는 이 계약 작성이나 초기 동의 PG 결과로 증명되지 않는다.

## 최신 경합 보완 — 여전히 PARTIAL

[철회/SQL 만료 경쟁 증적](../governance/highpass-v3-withdraw-expiry-contention-execution-2026-10-08.md):
PG252/252, latest serial Node483/483 PASS. expiry-only source terminal observation은 기존
환자 WITHDRAWN을 확인하되 환자 audit/result/cascade를 읽거나 복사 INSERT하지 못한다.
만료 actor는 별도 실제 DB principal이며 SQL fixture 범위다. private expiry worker는 미구현이다.
COMMIT guard의 공통 검증과 withdrawal-only ref/재인증/deadline 검증을 별도 PL/pgSQL IF로
분리해 generic plan에서 maintenance가 불필요한 patient_refs 권한을 요구하지 않게 했다.
기존 환자 검증·원자성·불변성은 유지하며 force_generic_plan 회귀 및 과거 FAIL을 보존한다.

[CONSENT_EXPIRY 등록·private 명령](../api/highpass-v3-consent-expiry-principal-contract.md)은 Node/DB
purpose/sole scope 계약을 정렬한다. generic DB context 증적은 실제 서명 주체·DB source/service
일치 검증이지 전용 expiry factory/event service/worker 구현이 아니다. 해당 단계는 후속 gate다.

[Expiry transaction contract](../api/highpass-v3-consent-expiry-transaction-contract.md) and
[factory evidence](../governance/highpass-v3-consent-expiry-factory-execution-2026-10-08.md)
now provide dedicated expiry-only admission/private callback lifetime. No patient_refs
grant, runtime activation or event worker is added. Full expiry service and Grant/access
effects remain pending; generic SQL fixture results are not promoted to service evidence.
