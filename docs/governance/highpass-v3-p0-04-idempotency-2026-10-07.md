# P0-04 durable Identity idempotency 실행 결과

기준일: 2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 변경.
상태: INTERNAL PATIENTREF IDEMPOTENCY TESTED / MAPPING WRITE NOT IMPLEMENTED.
관련 요구사항: V3-FR-ID-001~005, V3-FR-TEN-002/003, FR-037~041.
이전 PatientRef 단계는 실제 구현/DB 검증의 진행으로 분류했다.
[다음 프롬프트](../implementation/highpass-v3-p0-04-idempotency-prompt.md)를 작성하고 실행했다.

## 구조·생성·수정 파일

기존 V3TenantTransaction/PrincipalRegistry/PatientRefService와 독립 PG helper를 재사용했다.
생성: `009_highpass_v3_identity_idempotency.sql`, `src/v3-identity-idempotency.js`,
`test/v3-identity-idempotency.test.js`, 프롬프트, 이 보고서.
수정: PatientRefService, PG helper, API write 계약, ERD, Master Plan 및 후속 DPoP unit HTTP fixture.
기존 server.js/DB/영상/volume 및 사용자 변경, packageManager/lockfile을 변경하지 않았다.

## 구현 및 보안 검토

scoped key와 command를 domain-separated HMAC-SHA-256으로 저장한다. 고정 신뢰 key를 주입하며
raw key/payload/credential/envelope를 ledger에 저장하지 않는다. 결과는 metadata whitelist 및 DB JSONB key/type 제약을 통과해야 한다.
transaction advisory lock → 결과 조회 → 같은 tx의 callback(write+audit) → 결과 INSERT 순서다.
transaction lock은 tx 종료에 해제되며 협력하는 호출 경로만 순서화한다.
[PostgreSQL locking 문서](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS)를 기준으로 한다.
DB unique key도 유지한다. 사용자 입력을 SQL에 결합하지 않는다.

same scoped key + same canonical command는 callback 없이 원래 snapshot을 반환한다.
different command는 409. replay에도 현재 principal/tenant/hospital 및 resource 가시성을 검증한다.
PatientRef resource는 FOR SHARE로 잠근다. 필요한 UPDATE(patient_ref) column 권한은
WITH CHECK(false) 정책과 결합해 실제 변경을 금지한다. owner/삭제 권한은 부여하지 않는다.

등록 서비스의 `registerIdempotent`를 실제 coordinator에 연결했다. 이전 unkeyed register는 내부
테스트/호환 경로로 유지하며 HTTP에 그대로 노출하지 않는다. Mapping operation 이름은 extension point일 뿐
reconcile/review 구현 증거가 아니다. 결과 ledger는 UPDATE/DELETE 거부이며 WORM/superuser/TRUNCATE 방어 완료 주장이 아니다.

## 실행 결과

| 검증 | 결과 | 근거 |
|---|---|---|
| ledger + PatientRef unit | PASS | 8/8, exit 0, 222.795 ms |
| 독립 PG / metadata HTTP | PASS | 54 checks, exit 0, 20.917초 |
| 실제 두 PG backend 동시 요청 | PASS | 두 연결 확인, 같은 ref 결과 및 등록/감사 한 건 |
| coordinator 재생성 | PASS | 동일 HMAC config, 기존 durable 결과, callback 미실행; 실제 프로세스 kill 검증은 아님 |
| 다른 command/기관/actor/revoked/deleted | PASS | 409 및 scoped 결과/registry/resource 음성 검증 |
| ledger INSERT fault | PASS | ref+audit 모두 rollback, DB count 불변 |
| 실제 COMMIT + 응답 유실 주입 | PASS | 실제 커밋 직후 client 오류 주입, OUTCOME_UNKNOWN; same-key 재시도 ref/audit 각 한 건 |
| 006~009 rollback / fresh apply | PASS | 기존 DB 대신 임시 PG에서 실행 |
| manifest | PASS | 1 entry 검증, DRAFT / UNASSIGNED |
| secret scan | PASS | findings 0 / 2026-10-07T11:34:32.317Z; pattern 기반 |
| 최종 전체 Node 회귀 | PASS | 313/313, fail/skip 0, exit 0, 39.363초; 아래 초기 실패 보존 |
| mapping review/HTTP/live HTTPS | NOT VERIFIED | 후속 구현·이미지 gate 필요 |

최신 증적:
`evidence/generated/hp-v3-identity-tx-2026-10-07T11-33-36-742Z-45051593/manifest.json`.
manifest SHA-256: `0d74d11e10f5f19d3e6c173ab318b0a892357c1fc0b9a43679b90f655b842370`.
009 SHA-256: `5f04d22b4c842758aa3cf7b994280e93da96b26e6dd435b02f7f5e54d52b4d44`.
source snapshot 15개 시작/종료 일치. 앱 이미지 attestation 또는 전체 dirty diff 동일성 증명은 아니다.
중간 검증 증적은 보존하고 최종 schema/source 결과를 우선한다. 과거 timeout 실패는 이전 보고서에 유지한다.

### 회귀 timeout 후속 프롬프트

첫 전체 회귀는 312 PASS / 1 FAIL, exit 1, 23.248초였다. 기존 DPoP HTTP 테스트가 10초 요청
timeout으로 실패했다. 해당 코드의 기본 `hospital-a-orthanc:8042` 의존을 확인했다.
단독 DPoP+ledger 재실행 8/8 PASS(exit 0, 38.321초)였으나 timeout 원인을 단독 PASS로 해결했다고 주장하지 않는다.
전체 회귀 실패 후 [다음 isolation 프롬프트](../implementation/highpass-dpop-unit-isolation-prompt.md)를 작성·실행했다.
test만 ephemeral loopback REST double(`/studies` 빈 JSON)에 연결하고 curated data를 비활성화했다.
인가 전 upstream count 0, 인가 후 1, replay/scope/revocation 거부 후 여전히 1을 검증한다.
기존 200/502/503 허용 assertion을 정상 fixture의 200으로 강화했다. DPoP/ingress/tarpit/timeout은 완화하지 않았다.
이는 빈 목록 REST authorization unit 증거이며 actual DICOM/Orthanc/mTLS 성공 증거가 아니다.
isolation 이후 DPoP+ledger 대상 8/8 PASS(exit 0, 37.175초), 전체 313/313 PASS였다.
이전에 관찰한 Python fixture 부하 timeout 위험 및 이번 초기 DPoP timeout 이력을 없애지 않는다.
최종 문법/diff 검증 exit 0, 15개 대상 source의 증적 hash와 후속 파일 hash 차이 0이었다.
후속 secret scan도 findings 0(2026-10-07T11:38:21.389Z)이었다.

## 위험·미검증·다음 작업

- HMAC key 유실/즉시 rotation은 기존 key namespace를 찾지 못해 중복을 만들 수 있다. 유지/회전 migration과 실제 secret provisioning은 미완료다.
- ledger TTL 정리 없음. 인증된 요청의 rate/quota 제한과 보존 정책은 runtime 연결 전에 필요하다.
- callback은 신뢰 내부 코드만 허용하며 정규화된 command만 전달한다. 외부 임의 JSON/SQL callback 인터페이스가 아니다.
- same-key retry는 같은 key/config/actor/operation/DB가 유지되는 범위다. 모든 장애·DR·failover의 exactly-once 보장은 아니다.
- 최초 business audit 한 번만 남는다. replay/409/인증 이전 request audit 통합은 아직 아니다.
- 다음은 Mapping 등록 actor 및 own ref 기반 reconcile → reviewer 자기 승인 금지·version 전이·같은 tx audit → 실제 HTTP 및 동시성 검증.
- 외부 KMS/IdP/병원 PACS, API HA, 전체 MVP/v3는 미완료다. 새 사람 검토 UNASSIGNED이며 김범희 legacy 승인을 복사하지 않는다.
- 임시 PG는 소유 label 확인 후 제거했으며 synthetic tmpfs만 삭제했다. 기존 volume 삭제 없음. commit/push/merge/PR 없음.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
