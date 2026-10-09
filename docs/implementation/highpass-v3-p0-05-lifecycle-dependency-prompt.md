# Next execution: full Session lifecycle dependency alignment

2026-10-08 / DRAFT / UNASSIGNED. Continue the full P0-05 and P0-04 cross-institution
objective, not a REQUESTED-only substitute. No runtime activation or clinical grant
is authorized by an enum or by passing component tests.

1. Inspect canonical requirements, security requirements, acceptance catalog,
   OpenAPI/ERD and migrations006..017 against implemented Session/Mapping services.
2. Align Identity -> ConsentArtifact -> AuthorizationDecision -> TransferGrant ->
   Preflight -> action -> Provenance prerequisites. Enumerate exact proposed transition
   commands, actor/source/participant authority, DB-time/version/If-Match, immutable
   scope and required evidence references. Label unspecified edges as proposed;
   do not present enum order as an approved transition graph.
3. Resolve the cross-institution PatientRef/membership dependency without broadening
   recipient access from INVITED or inferring consent from source creation. Specify
   patient-bound consent approval, identity maker/checker and receipt ownership.
4. Preserve original creation receipt and terminal retry DENY. Identify schema/API/RLS
   additions and exact acceptance tests before clinical transition implementation.
   Separate enqueue from downstream revocation acknowledgement and runtime denial.
5. Produce a scoped dependency contract and actionable next implementation prompt,
   execute it in the isolated synthetic environment only after prerequisites are
   specified. No fabricated approval, no real PHI, no commit/push/merge/PR.

## Initial execution findings

Reviewed canonical Session state coverage, EX-001..007 and CON-001..006 requirements,
EX acceptance cases and existing API/ERD artifact boundaries. Migrations006..017 and
v3 source inspection have no ConsentArtifact/AuthorizationDecision implementation.
Session destination participation remains INVITED; source own-ref Mapping work cannot
authorize destination membership. Requirements do not enumerate every directed edge.
The next concrete action is a dependency contract, not a timer advancing Session to
CONSENTED/READY or a legacy bearer mislabelled as a new v3 TransferGrant.

## 다음 실행용 프롬프트 — 2026-10-08 보강본

아래 범위를 다음 작업의 실행 기준으로 사용한다. 앞의 초기 조사 기록은 보존한다.
이번 단계는 **P0-05 전체 상태 전이와 P0-06 동의·인가·Grant 선행 계약 정렬**이다.
계약의 공백을 구현으로 덮지 말고, 구현 가능한 최소 선행 작업을 증적과 연결하여 정한다.

### 1. 역할과 목적

시니어 의료정보 시스템·백엔드·보안 아키텍트로서 최신 Highpass 저장소를 조사한다.
환자 동의 기반 의료영상 공유의 최종 흐름을 유지하면서 다음 의존성을 정렬한다.

Identity / PatientMapping
→ ExchangeSession / 기관 참여
→ 환자 승인 / ConsentArtifact
→ AuthorizationDecision
→ TransferGrant
→ PreflightResult
→ 승인된 영상 조회·다운로드·전송
→ Provenance / 감사 / 철회·만료 효과

순서 자체가 모든 상태 전이를 승인하는 것은 아니다. 특히 기관 간 Mapping과 환자
동의·기관 참여의 순환 의존성을 설명하고 안전한 bootstrap 절차를 별도로 정의한다.

### 2. 확인할 기준과 최신 증적

작업 시작 시 git status/HEAD, 실제 파일 및 최신 증적을 다시 확인한다.
기존 미커밋·미추적 변경을 보존하고 과거 보고서의 통과 수를 현재 결과로 복사하지 않는다.

- docs/requirements/highpass-v3-requirements-definition.md
- docs/security/highpass-v3-security-requirements.md
- docs/traceability/highpass-v3-traceability-matrix.md
- docs/acceptance/highpass-v3-acceptance-criteria.md
- docs/architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md
- docs/data/highpass-v3-erd.md
- docs/api/HIGHPASS-V3-API-ALIGNMENT.md 및 highpass-v3.openapi.yaml
- docs/api/highpass-v3-cross-institution-identity-contract.md
- docs/api/highpass-v3-session-state-cancel-contract.md
- db/migrations/006~017 및 src/v3-* 관련 코드·테스트
- docs/governance/highpass-v3-p0-05-original-receipt-2026-10-08.md

관련 요구사항: V3-FR-ID-001~006, EX-001~007, CON-001~006 및 해당 AUTH/GRT/TEN
요구사항을 실제 문서에서 식별한다. 연결되는 legacy FR-001~005/014~025/037~041도 명시한다.

최근 한정 증적은 Node 순차 회귀352 PASS, 독립 PG/loopback197 PASS이다.
기본 병렬 회귀 실패, cleanup 미확인 중간 실행, 미활성화 runtime 상태를 보존한다.
이는 전체 v3 구현·임상 접근 승인·전체 API HA·외부 인프라 검증을 의미하지 않는다.

### 3. 우선 수행할 분석

1. 각 기능을 구현·계약만 존재·일부 검증·미구현·외부 자원 필요로 나눈다.
2. canonical 상태 전체를 열거하고 실제 허용된 전이와 제안 전이를 분리한다.
   enum 순서를 승인된 선형 상태 머신으로 해석하지 않는다.
3. 각 제안 전이에 아래 항목을 표로 작성한다.
   - 출발/도착 상태와 command 또는 기존 API
   - 인증 주체, 역할, tenant/hospital/PatientRef 소유·참여 조건
   - 필요한 Mapping/Consent/Decision/Grant/Preflight 증적과 버전
   - DB 시각·유효기간·동시성 잠금·If-Match 및 멱등 처리
   - 허용·거부 감사, 원자적 저장, 오류코드, 정상·음성 수용기준
   - 확인된 계약인지, 제안인지, 미정인지
4. 누락된 전이는 NOT IMPLEMENTED/NOT VERIFIED로 남긴다. 기존 REQUESTED 취소·만료
   구현을 전체 상태 머신 완성으로 바꾸지 않는다.

### 4. 환자 승인·기관 참여·기관 간 Mapping 정렬

- 환자 신원은 서버 등록과 영속 active binding으로 확인한다. body의 PatientRef,
  관리자 입력의 digest 또는 test assurance만으로 실제 환자 승인이라고 주장하지 않는다.
- PROVIDER_INITIATED와 PATIENT_INITIATED 모두 Session 생성 자체는 동의가 아니다.
- 수신 기관 INVITED는 ACTIVE 참여·clinical access·키 접근 권한이 아니다.
- 누가 어떤 최소 정보로 초대를 조회·수락할 수 있는지, 환자 승인 이전에 어떤 정보가
  차단되는지, 참여와 영상 권한을 어떤 별도 조건으로 구분하는지 정의한다.
- 기관 로컬 식별자 연결 승인의 machine-readable clause를 제안하되 기존 clinical
  AccessAction을 임의 확대하지 않는다. generic ACTIVE consent나 pacs-transfer scope가
  identity linking 승인이라는 가정을 금지한다.
- source 소유권을 복사하거나 destination에 전역 PatientRef 탐색을 허용하지 않는다.
- 기관 간 Mapping은 로컬 UNVERIFIED와 별도 reviewer 검토를 유지한다. VERIFIED는
  신원 연결 검토 결과이지 동의·Grant 또는 PACS 편입 승인이 아니다.
- 동의 없이는 Mapping을 못 만들고 Mapping 없이는 동의를 못 만드는 순환이 있다면,
  임상 데이터 비공개인 승인 요청/연결 준비 단계를 제안하고 신뢰경계를 설명한다.
  요구사항으로 확인되지 않은 제품·정책 결정은 제안으로 표시하고 결정 필요사항에 남긴다.

### 5. 동의·인가·Grant의 독립 계약

ConsentArtifact는 환자, 제공/수신 기관, 목적, immutable Study/Series 및 action,
유효기간, 정책·증적 참조, 버전과 상태를 가진다. 내용을 확대하는 변경은 새 버전·증적을
만들며 기존 승인으로 승계하지 않는다. evidence 조회 권한·최소 필드도 정의한다.

AuthorizationDecision은 현재 정책 평가 증적이고 TransferGrant는 별도 단기 능력이다.
Decision ALLOW만으로 영상·키를 반환하지 않는다. Grant issuer/audience/recipient/scope/
TTL/jti/철회/PoP 및 raw token 비저장 계약을 기존 명세와 정렬한다. 이 단계에서 legacy
token이나 테스트 KMS adapter를 신규 v3 Grant·실제 KMS 구현으로 재명명하지 않는다.

### 6. 원자성·회수·재시도 불변조건

- 전체 lock 순서를 기존 registry/기관/Session/참여/동의 잠금과 정렬한다. 상태 변경과
  감사·event·멱등 결과가 하나의 트랜잭션으로 저장되도록 설계한다.
- 철회·만료가 commit된 뒤 신규 link/access/grant/key release는 stale ALLOW보다 우선해
  차단된다. 실제 실행 취소·Grant 철회 전달과 outbox enqueue를 별도로 추적한다.
- 생성 당시 응답은 immutable ledger 값에서 복원한다. 현재 상태와 혼합하지 않는다.
  terminal/effective expiry 재시도는 감사 후 DENY하며 Session을 재생성하지 않는다.
- RLS 재귀, broad SELECT, SECURITY DEFINER/BYPASSRLS, maintenance의 clinical 읽기를 금지한다.
- 감사 실패는 fail closed한다. raw patient identifier/token/secret/자유문자 의견은 감사에
  넣지 않으며 없는 자원·권한 없는 자원은 안전한 동일 응답으로 처리한다.

### 7. 필수 산출물과 검증 계획

기존 문서 형식을 유지하고 최소 관련 범위만 수정한다.

1. docs/api/highpass-v3-lifecycle-dependency-contract.md 신규 작성:
   현재 구현, 전체 전이·증적 의존성, bootstrap, 권한·잠금·철회 계약, 미정 결정 목록.
2. OpenAPI·ERD·Architecture·Requirements·Security·Traceability·Acceptance를 영향 범위만
   정렬한다. 확정되지 않은 요청 필드/API/DDL은 proposal로 표시한다.
3. docs/implementation/highpass-v3-p0-master-plan.md에 P0-04~06의 선행 작업과 종료조건 반영.
4. 날짜별 governance 보고서: 확인된 요구사항 / 합리적 가정 / 설계 결정 / 불확실성,
   변경 파일, 문서·계약 검사 명령과 종료코드, 미검증 항목 기록.
5. 다음 최소 구현 작업의 실행 프롬프트 작성. 단계별 파일·관련 ID·정상/음성 테스트,
   rollback·runtime 미활성화 경계를 포함한다.

수용기준에는 다른 환자/기관, INVITED, 미승인 link clause, maker/checker 동일인,
동의 scope 확대·철회·만료, stale If-Match, raw digest 승인 위조, 감사/outbox 오류,
동시 revoke/link 및 retry after revoke를 반드시 포함한다. 테스트 계획은 PASS가 아니다.

### 8. 실행 경계와 종료 조건

이번 게이트는 문서·계약 정렬이며 핵심 임상 상태 전이 코딩을 먼저 하지 않는다.
문서 자체의 논리적 충돌과 미결 정책·승인을 구분한다. 핵심 권한 의미가 미정이면
가정을 실제 승인으로 구현하지 말고 정확한 선택사항을 보고한다.
정렬이 끝나도 P0-04/05/06, 전체 MVP/v3가 완료됐다고 선언하지 않는다.

자동 실행되는 목표를 이어받은 경우, 다음 프롬프트의 선행조건이 확인된 범위에서만
초기 조사·격리된 구현을 이어간다. 미정 승인 항목을 건너뛰어 임상 권한을 활성화하지 않는다.
이 파일을 작성하라는 요청만 받은 경우에는 실행하지 않고 파일과 다음 작업 요약을 전달한다.

commit/push/merge/PR, 기존 DB migration 적용·runtime 교체, 다른 Docker 스택 종료,
실제 PHI 사용, 인증/TLS 완화, 미실행 시험 PASS 판정은 금지한다.
신규 증적은 DRAFT / UNASSIGNED이며 김범희의 legacy r3 검토는 승계하지 않는다.
PIPA·ISMS-P·병원 승인 및 실제 IdP/KMS/PACS는 DEFERRED/BLOCKED 상태를 유지한다.

최종 보고: 현재 단계 / 변경 산출물 / 요구사항 연결 / 확정·제안·미정 계약 /
실행한 검사와 종료코드 / 남은 차단·미검증 / 다음 프롬프트와 실행 여부.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## Execution result — 2026-10-08

Dependency contract and scoped document alignment delivered. See
[report](../governance/highpass-v3-lifecycle-alignment-2026-10-08.md).
D1..D6 remain proposals, not user policy approval. Next PENDING-contract prompt written
and its initial inspection executed; no clinical transition or DB activation performed.
