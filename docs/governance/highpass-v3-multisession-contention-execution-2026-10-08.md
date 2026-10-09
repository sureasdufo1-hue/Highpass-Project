# 다중 Session·반대 기관·Session 만료 경합 결과

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자 김범희, 승인일 2026-10-08.
관련 D6, CON-006, EX-003/005/006, TEN-003, IAM-003/004, AUTH-001/004,
FR-001~005/014~025/037~041. 전체 MVP/v3 완료는 선언하지 않는다.
신규 기술 증적의 독립 사람 검토 및 철회 L1~L5 정책 승인은 미완료다.

## 실행 및 변경

[실행 프롬프트](../implementation/highpass-v3-p0-06-multisession-lock-order-prompt.md)에 따라
`patient-multisession-fixture.js`와 `patient-expiry-contention-fixture.js`를 작성했다.
기존 별도 nonowner 취소/approval pool을 재사용하고, Session expiry에는 전용
nonowner maintenance pool을 만들었다. 실제 등록된 source-scoped SESSION_EXPIRY
서비스 identity의 서명 TestProvider와 `V3ExchangeExpiryService`를 호출한다.
환자 명의 expiry audit이나 임의 INTERNAL_SERVICE header로 대신하지 않았다.
pool/role/grants와 bootstrap은 owned disposable DB 전용이며 runtime code/DDL은 변경하지 않았다.
새 helper와 expiry service/contract를 gate source hash closure에 포함했다.

| 추가 검증 | 실제 관측 및 기대 |
| --- | --- |
| 같은 source 두 승인-first | 각각 실제 결정 receipt INSERT에서 대기; 별도 취소 두 건의 Session lock 대기를 정확히 관측; ACTIVE 초기 기록 후 CANCELLED v2 |
| 같은 source 두 취소-first | 각각 실제 취소 COMMIT에서 대기; 두 결정이 각각 Session에 대기; 취소 후 VERSION_MISMATCH, 7개 동의 테이블 변화 없음 |
| 서로 다른 Session의 같은 취소 key | 실제 key advisory 대기 후 첫 CANCELLED, 둘째 IDEMPOTENCY_CONFLICT; 둘째 REQUESTED v1 유지, 취소 receipt 한 개 |
| A→C와 C→A 승인-first | 양쪽 실제 승인 lock을 잡은 뒤 owner C 중지 UPDATE가 대기; 정확한 blocker를 순차 관측·승인 COMMIT 후 중지 COMMIT |
| 반대 기관 중지-first COMMIT | A→C는 TARGET_UNAVAILABLE, C→A는 DB_PRINCIPAL_INACTIVE; 동의 기록 추가 없음 |
| 반대 기관 중지-first ROLLBACK | 양쪽 실제 lock 대기 후 중지 rollback, 두 승인 ACTIVE |
| expiry 등록 | 별도 실제 maintenance principal/role/grants, synthetic issuer |
| expiry 권한 분리 | superuser/BYPASSRLS/clinical/approval membership 및 consent INSERT 권한 없음 |
| expiry SKIP LOCKED | 승인 중 첫 Session FOR UPDATE NOWAIT는 55P03; 실제 batch가 둘째 만료 Session 처리; 잠금 해제 후 첫 Session 처리, 각 EXPIRED v2/단일 event |

승인-first 기관 중지 후 동일 key의 과거 receipt는 A→C target 중지와 C→A source
중지에 따라 각각 거부되며 추가 동의 기록이 없다. 생성·동의 내용은 불변이다.
expiry 시험은 DB clock으로 부모 deadline을 기다린다. 첫 승인 callback은 기록 INSERT
후 대기 중 deadline을 넘고 최종 factory 검증에서 CONSENT_EXPIRED로 rollback한다.
이는 기존 Session EXPIRED 전이이며 아직 미구현인 Consent EXPIRED lifecycle의
대체 증명이 아니다. cascade는 REQUESTED일 뿐 consumer 전달 완료가 아니다.
모든 query/poll/barrier/부모 수명/cleanup은 finite timeout이며 원문 SQL·secret·nonce는
증적에 넣지 않는다. 대기 Promise의 성공/실패를 모두 관측하고 pool을 종료한다.

## 실패 보존 및 재검증

최초 gate는 반대 기관 승인-first의 복합 assertion에서 ERR_ASSERTION으로 FAIL했다.
당시 두 blocker가 `pg_blocking_pids`에 동시에 나타난다고 가정한 관측을 사용했다.
원문 assertion operands를 수집하지 않았으므로 이 실패만으로 전체 원인을 확정하지 않는다.
후속 시험은 한 정확한 blocker 관측→그 승인 COMMIT→남은 blocker 관측→다음 COMMIT을
수행한다. 이후 모든 추가 시험이 통과했다. 서비스의 보안/잠금/인증 정책은 완화하지 않았다.
마지막 보완은 PID 배열의 길이가 아니라 두 정수 PID가 준비됐는지 확인하고,
expiry의 actor/audit/cascade 단일 기록까지 owner 관측을 확대했다.

| 실행 | 종료 코드 | 결과 |
| --- | --- | --- |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 1 | FAIL, 103,546 ms, cleanup/sourceUnchanged PASS |
| 단계별 관측 및 expiry 추가 후 같은 PG gate | 0 | PASS 169/169, 113,181 ms, cleanup/sourceUnchanged PASS |
| PID 준비 및 expiry proof 보완 후 최종 같은 PG gate | 0 | PASS 169/169, 125,224 ms, cleanup/sourceUnchanged PASS |

실패 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-39-29-170Z-cd4c98c3/manifest.json),
중간 [169개 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-42-46-549Z-2c4056b9/manifest.json).
실패 증적은 삭제/승격하지 않는다. HEAD
`59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 hashes, Node v24.18.0 기준이다.
manifest PASS는 파일 무결성만 뜻하며 실패 gate 판정을 대신하지 않는다.

최신 [169개 결과/source hashes](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-45-24-723Z-75a2deef/schema-check.json),
[manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-45-24-723Z-75a2deef/manifest.json).
실패·중간·최종 manifest 무결성 명령 모두 종료 0, 각 DRAFT 1 / UNASSIGNED 1이다.
최종 expiry는 두 대상 각각 정확한 maintenance actor의 event/audit/cascade 한 개씩도 확인했다.

PG 종료 후 `node --test --test-concurrency=1`: 종료 0, 464/464 PASS,
83,628.304 ms, fail/cancel/skip 0. `node scripts/v3-lifecycle-document-check.js`:
종료 0, 정적 문서 검사 PASS, semantic OpenAPI/anchor/사람 정책 승인 미검증.
최종 `node scripts/security-secret-scan.js`: 종료 0, PASS/findings 0,
2026-10-08T05:47:24.617Z(도구의 알려진 패턴 범위).
`git diff --check`: 종료 0, tracked whitespace 오류 없음, 기존 CRLF 경고.
README·작업분류·P0 master plan·정적 lock audit·lifecycle ADR에 현재 범위와 잔여를 연결했다.

## 남은 사항 및 다음 프롬프트

검증한 9개 추가 fixture scenario는 전체 D6가 아니다. JOIN 내부 row 취득 순서의
일반 보증, 기존 create/pending/identity linking과 모든 상태 변경 경쟁, production
다중 기관 workload는 미검증이다. WITHDRAWN/Consent EXPIRED/content replacement,
공개 evidence API/최소 admin view, Decision/Grant 및 통합 임상 HTTPS/Viewer는 미완료다.
이번 시험에서 현재 실행한 경로의 성공/거부를 확인한 것이지 모든 교착이 없다고
증명한 것은 아니다. 실제 IdP/MFA/KMS/PACS/model/Staging 및 법률·기관 운영 승인도
로컬 증적으로 대체하지 않는다.

[다음 create/PENDING 경합 프롬프트](../implementation/highpass-v3-p0-06-create-pending-contention-prompt.md)를
작성·읽고 실제 `V3ExchangeSessionService`, `V3PendingPreparationService`와 별도
guardPendingPool의 코드 분석을 시작했다. L1~L5 미응답은 승인으로 간주하지 않는다.
다른 안전한 검증이 가능하므로 전체 목표는 active 상태를 유지한다.
권장 커밋 분리: 다중 Session helper/기존 helper 연결 → maintenance fixture/hash closure →
보고서·다음 프롬프트·README/작업분류/정적 audit 연결. 실제 commit/push/merge/PR과
runtime DB 변경은 수행하지 않았다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
