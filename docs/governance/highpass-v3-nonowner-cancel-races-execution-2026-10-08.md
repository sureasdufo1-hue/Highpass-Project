# 실제 nonowner 취소·환자 결정 경쟁 검증

2026-10-08 / PARTIAL / DRAFT / UNASSIGNED.
계획 채택 검토자·승인자: 김범희, 승인일: 2026-10-08.
이 기록은 계획 채택과 새 기술 증적의 독립 사람 검토를 구분한다.
CON-001~006, IAM-003/004, TEN-003, AUTH-001/004,
FR-001~005/014~025/037~041. 전체 MVP/v3 완료는 선언하지 않는다.

## 구현 범위

[실행 프롬프트](../implementation/highpass-v3-p0-06-nonowner-cancel-races-prompt.md)에 따라
별도 최소권한 취소 pool에서 실제 `V3ExchangeCancelService`를 호출했다.
환자 approval pool/role과 섞지 않았고 취소 role의 superuser/BYPASSRLS/approval
membership/consent INSERT 권한이 없음을 실제 PostgreSQL에서 확인했다.
등록된 합성 HOSPITAL_ADMIN과 서명 TestProvider를 사용하며 실제 IdP/MFA는 아니다.

`patient-decision-parent-fixture.js`의 부모 seed를 재사용 가능한 함수로 분리했다.
fixture 수명은 3~120초 정수로 제한하며 기존 부모 만료 시험은 3초를 유지한다.
새 경쟁은 독립 Session과 120초 부모를 사용한다. runtime 정책은 변경하지 않았다.
새 helper, 실제 취소 service/contract/audit를 gate source hash closure에 포함했다.

## 추가 검증 6개

| 검증 | 실제 결과 |
| --- | --- |
| 별도 취소 계정 권한 | nonowner, 비관리자, approval 권한 없음 |
| 취소-first | 실제 취소 COMMIT 후 환자 결정 VERSION_MISMATCH; 동의 7개 테이블 변화 없음 |
| 승인-first | 초기 ACTIVE artifact 저장 후 취소 CANCELLED v2; 과거 결정 receipt 재접근 거부 |
| 취소 COMMIT ACK 유실 | 호출자는 COMMIT_OUTCOME_UNKNOWN; 같은 HMAC key의 새 provider가 원본 receipt 복구, 중복 없음 |
| 취소 필수 감사 누락 | 호출자는 COMMIT_OUTCOME_UNKNOWN; DB 관측은 REQUESTED v1/취소 receipt 0, 환자 결정 가능 |
| 취소 lock 대기 timeout | 실제 대기 관측 후 DATABASE_UNAVAILABLE; 환자 결정 완료, Session 취소되지 않음 |

양방향 경쟁은 정확한 waiter/blocker PID 및 `pg_blocking_pids`/Lock wait를 관측했다.
각 성공 취소의 event/audit/receipt/cascade 1개씩을 확인했다. 원본 receipt는
현재 임상 권한이 아니다. ACK 유실과 실제 DB rollback은 호출자 관점에서 모두
불명확한 COMMIT으로 처리하므로 호출 오류만 보고 rollback이라고 단정하지 않는다.
모든 barrier/poll/query는 유한 timeout을 사용한다. fault injection과 owner 관측은
라벨이 일치하는 폐기용 합성 DB에서만 수행했다. cleanup 및 container 부재 PASS.

## 실행 결과

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| 최초 `node scripts/v3-patient-ceremony-schema-check.js` | 0 | PASS 140/140, 105,443 ms |
| fault 3개 추가 후 같은 PG gate | 0 | PASS 143/143, 104,323 ms |
| 최신 `node scripts/verify-evidence-manifest.js <manifest>` | 0 | 무결성 PASS, DRAFT 1 / UNASSIGNED 1 |
| PG 종료 후 `node --test --test-concurrency=1` | 0 | PASS 464/464, 82,208.222 ms, skip 0 |
| `node scripts/v3-lifecycle-document-check.js` | 0 | 문서 정적 검사 PASS; semantic OpenAPI/anchor/사람 승인 미검증 |
| `node scripts/security-secret-scan.js` | 0 | PASS, findings 0, 2026-10-08T05:21:01.487Z |
| `git diff --check` | 0 | tracked whitespace 오류 없음, 기존 CRLF 경고 |

최신 [manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-16-35-504Z-5192f3f0/manifest.json),
[143개 결과 및 소스 해시](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-16-35-504Z-5192f3f0/schema-check.json).
최초 [140개 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T05-14-07-776Z-93830304/manifest.json).
두 gate 모두 cleanup/sourceUnchanged PASS. Node v24.18.0,
HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` 및 미커밋 source hashes 기준이다.
manifest PASS는 파일 무결성만 뜻하며 기술 판정을 대신하지 않는다.

## 잔여 및 다음 작업

[등록된 다른 환자·기관 격리 실행 프롬프트](../implementation/highpass-v3-p0-06-registered-patient-isolation-prompt.md)를
작성했다. 실제 등록된 다른 환자/tenant의 7개 테이블 read·write 차단과 본인
positive 경로가 다음 안전한 검증이다. 전체 다중 Session D6는 아직 미완료다.
WITHDRAWN/EXPIRED service·DDL, content replacement, Grant 및 공개 임상 흐름은 미완료다.
철회 L1~L5는 미결정이며 질문의 기본 선택을 승인으로 간주하지 않는다.
실제 HTTPS/Viewer/IdP/KMS/PACS/model/외부 Staging은 이번 실행에서 재검증하지 않았다.
운영 DB 변경, commit/push/merge/PR은 수행하지 않았다.

권장 커밋 분리: 부모 seed 재사용과 별도 취소 fixture/gate hash 등록 →
실행 보고서·다음 프롬프트·README/작업분류 연결. 자동 증적은 ignored 생성물이며
개인키·토큰·원문 nonce를 커밋하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
