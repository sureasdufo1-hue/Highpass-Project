# 환자 승인·기관 수락·Grant 구현 전 의사결정 초안

2026-10-08 / USER-APPROVED POLICY CHOICES / IMPLEMENTATION IN PROGRESS.
검토자: 김범희. 승인자: 김범희. 검토일·승인일: 2026-10-08.
직접 사용자 회신: “제안사항 채택하여 진행, 검토자 승인자 모두 김범희”.
채택: D1~D4 제안, D5 환자 승인 artifact부터 순차 구현, D6 실제 경합 검증 진행.
신규 증적의 독립 검토 완료나 D6 기술 PASS를 의미하지 않는다.
기존2026-10-08 합성 비운영 연동 준비 승인과 구분한다.

기준: [의존성 계약](../api/highpass-v3-lifecycle-dependency-contract.md),
[요구사항](../requirements/highpass-v3-requirements-definition.md),
[보안 요구사항](../security/highpass-v3-security-requirements.md),
[추적성](../traceability/highpass-v3-traceability-matrix.md),
[수용시험](../acceptance/highpass-v3-acceptance-criteria.md).
관련 CON-001..006/AUTH-001..005/GRT-001..005, FR-001..005/014..025.

## 확인된 요구사항

PENDING 입력과 제출 evidence digest는 환자 승인이 아니다. 제공기관 Session
생성, 수신기관 INVITED, Mapping VERIFIED 역시 동의나 영상 접근 권한이 아니다.
ConsentArtifact, AuthorizationDecision, TransferGrant는 별도 객체이며 동의 범위
확장은 새 버전/증적이 필요하다. 운영 IdP는 외부 항목이나 합성 승인 정책의 결정까지
자동 면제하지 않는다. 신규 권한 부여 코드는 아래 결정과 별도 기술 검증이 필요하다.

## D1 — 환자 승인 절차

제안: 서버에 PatientRef가 결합된 PATIENT만 고정된 준비 요청을 열람하고, 제공·수신
기관, 목적, Study/Series/action, 기간, 정책 버전을 확인해 명시 승인/거절한다.
의료진·관리자는 환자를 대신해 승인하지 않는다. 합성 환경은 서명 검증된 mock MFA
assurance와 재인증을 사용하되 실제 MFA/본인확인으로 표시하지 않는다.
승인 명령은 준비 요청 버전/내용 digest에 결합하고 서버가 승인 증적을 생성한다.
대안: 환자 승인 구현 보류. 실제 IdP만 허용하는 선택은 별도 외부 리소스가 필요하다.
시험: 다른 환자, 관리자 대리 승인, assurance 누락, 내용/버전 변경, 만료, 재전송
거부 및 정상 승인 감사. 현행 OpenAPI ACTIVE 입력을 승인 증명으로 사용하지 않는다.

## D2 — 환자 식별 연결 동의

제안: 임상 공유 승인과 별도의 선택 항목으로 제공·수신기관 간 PatientRef 연결 목적,
범위, 기간을 설명하고 승인 증적에 독립 기록한다. 선택되지 않으면 자동 연결하지
않는다. 연결 승인도 동일인 Mapping VERIFIED나 임상 Grant가 아니다.
대안: 연결을 이번 단계에서 보류하고 관련 PACS_IMPORT를 차단한다.
시험: 임상 동의만 있는 경우 연결 DENY, 수신기관 변경 시 재승인, 철회와 연결
생성 경합에서 오래된 승인이 승리하지 않음. 보존·연결 해제 효과는 추가 정책 검토.

## D3 — 수신기관 수락

제안: 등록된 수신기관 HOSPITAL_ADMIN이 최소 초대를 수락한다. 초대에는 불투명
handle, 제공기관, 만료시각, 업무상태만 표시하고 환자·Study UID·동의 증적·토큰은
노출하지 않는다. 수락은 임상 권한이 아니며 의료진 권한은 후속 인가로 별도 결정한다.
대안: 기관별 지정 수락 담당자를 새 capability로 정의한다(새 계약/정책 필요).
시험: 타기관/의료진 단독 수락, 만료/재사용 handle, INVITED 목록의 식별정보 노출
차단. 현재011 제약/RLS는 수신기관 ACTIVE를 허용하지 않으므로 additive 변경 필요.

## D4 — 동의 내용과 상태

제안: 내용 버전은 불변으로 보관하고 승인/거절/철회/만료는 append-only 상태 이벤트로
기록한다. scope·기간·기관·목적 변경은 새 내용 버전과 재승인이 필요하다. 상태 이벤트
순번과 내용 버전을 분리하며 서버가 현재 유효 상태를 계산한다.
대안: 내용 변경 없이 상태 전이도 새 artifact 버전으로 표현한다(버전 의미 재정렬 필요).
시험: 기존 버전 변조/범위 확대 DENY, 정확한 승인 버전만 사용, 동시 철회 우선,
조회 권한 최소화. 물리 DDL/API 상세 정렬은 승인 이후이며 이 문서는 migration이 아니다.

## D5 — 상태 전이와 실행 완료

제안: 의존성 계약의 전이 표를 시작점으로 삼되 구현된 command만 활성화한다.
환자 승인·현재 정책 ALLOW·Grant·필수 Preflight·실제 실행 증적을 순서대로 요구하고
중간 상태 건너뛰기, terminal 재개, 조용한 scope 확대를 거부한다. 작업 접수/HTTP2xx를
COMPLETED나 integrity PASS로 바꾸지 않는다. 여러 action의 반복 실행/되돌아가기 및
거절·철회 허용 시작 상태는 아직 세부 전이 표 확정이 필요하다.
대안: 첫 구현 릴리스를 환자 승인 artifact까지만 활성화하되 전체 v3 범위는 유지한다.
시험: 미구현 전이 DENY, version412, terminal409, partial import 미완료, 철회 후
신규 접근/키/Grant 즉시 DENY; outbox 접수와 downstream 완료를 구분한다.

## D6 — 잠금 순서: 추가 기술 검증 필요

확인된 코드: registry/principal/tenant/hospital SHARE 선행, 취소의 actor-scoped
idempotency advisory lock 뒤 Session UPDATE, PENDING의 Session/ref/target SHARE,
expiry의 deadline/session 순 SKIP LOCKED가 공존한다. 단순히 기관 UUID 정렬만
추가한다고 전체 deadlock 안전성이 증명되지 않는다.
제안: 기존 create/cancel/expiry/pending과 신규 approval/accept/link/withdraw의
자원별 잠금 DAG를 작성하고 공통 순서로 정렬한 뒤 실제 PG 경합을 검증한다.
사람 승인은 기술 검증 착수 승인일 뿐 D6 PASS가 아니다. DDL/코드 변경 전 ADR 필요.
시험: 승인↔철회, 기관수락↔정지, 연결↔취소/만료, 동시 idempotency와 timeout rollback.
후속 [잠금·API 계약 점검](highpass-v3-lock-contract-audit-2026-10-08.md)은 실제 소스의
순서 차이와 deferred FK/trigger를 확인했다. 순서 차이만으로 현재 교착을 단정하지
않으며 신규 권한-bearing 경로의 실제 경합은 아직 NOT VERIFIED다.

## 승인 기록 및 다음 작업

현재 D1~D4 제안은 사용자 채택, D5는 환자 승인 artifact부터 순차 구현으로 채택했다.
D5 미확정 후속 전이는 별도 확정 전까지 비활성화한다. D6 실제 경합 검증 진행을
승인했으나 기술 판정은 NOT VERIFIED다. 승인일은 2026-10-08이다.
전체 OpenAPI/ERD의 후속 상세 정렬과 이 초안의 독립 검토는 아직 미완료다.
승인 계약·구현·검증을 순차 진행하되 기존 runtime에는 자동 활성화하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
