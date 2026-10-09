# PatientMapping reconcile / review write contract

작성일: 2026-10-07. 상태: DRAFT TECHNICAL CONTRACT / LOCAL WRITE SERVICES TESTED.
기존 서버에 활성화하지 않았다. PatientRef 내부 등록의 durable idempotency 기반은 추가했지만
Mapping reconcile/review DB 전이와 독립 loopback HTTP를 검증했다. 교차기관 ref 연결·기존 서버 활성화는 아직 NOT VERIFIED다.
관련: V3-FR-ID-001~005, V3-FR-TEN-002/003, V3-AT-ID-001~003, FR-037~041.

## 확인된 요구사항과 결정

확인됨: 이름·생년월일만으로 자동 병합하지 않는다. 매핑 상태는 다섯 enum을 유지한다.
충돌은 사람 검토 대상으로 보내고 상태 변경은 version·기관·actor·evidence·old/new state를 감사한다.
기존 reconcile 입력 필드와 metadata 응답은 유지한다.

보수적 가정/신규 구현 결정: write와 review는 자체 기관 HOSPITAL_ADMIN/SECURITY_ADMIN으로 제한한다.
review는 별도 `mapping:review` scope가 필요하다. PLATFORM_ADMIN의 전체 기관 접근은 허용하지 않는다.
환자의 PatientRef bootstrap과 실제 병원 reviewer 위임은 별도 계약이 필요하다.
현실 환자 identity의 진실성을 digest나 암호화만으로 증명할 수 없다.

## 요청 및 응답

| 동작 | 계약 | 변경/영향 |
|---|---|---|
| POST /api/v3/patient-mappings/reconcile | 기존 5필드 + mapping:write 유지 | 독립 service/PG/HTTP 검증. crypto 검증 후 UNVERIFIED 생성; 서버 활성화 전. 신규 상태/actor 입력 금지 |
| GET /api/v3/patient-mappings/{mappingId} | 기존 mapping:read / safe metadata | local PG/HTTP 검증 완료, 서버 활성화 전 |
| POST /api/v3/patient-mappings/{mappingId}/reviews | expectedVersion, state, evidenceDigest + mapping:review | 독립 service/PG/HTTP 전이 검증; 서버 활성화 전 |

review body는 추가 필드 금지다. expectedVersion은 1..2147483646 integer,
state는 다섯 enum, evidenceDigest는 canonical base64url SHA-256 32 bytes다.
검토자·시간·기관은 request에 받지 않고 서버 binding/DB 시간에서 기록한다.
이 신규 경로는 기존 legacy UI/API를 변경하지 않는다. 영향 테스트는 새 write-contract suite와 후속 DB/HTTP suites다.

## 다음 DB 구현의 필수 조건

1. 정식 `patient_ref` 소유/등록 경로와 audit를 마련한다. 후속 008 DDL 및 V3PatientRefService는
   서버 UUID/기관 소유권/같은 tx 등록 감사의 내부 bootstrap을 추가했다. 후속 009 및
   V3IdentityIdempotency로 registerIdempotent 내부 경로를 추가했다. HTTP는 아직 없다.
   mapping 부재로 읽히지 않는 patient_ref를
   전역 SELECT grant나 SECURITY DEFINER 우회로 조회하지 않는다.
   신규 소유 ref는 기관 범위에서 조회 가능하다. 기존 global ref에는 owner를 임의 backfill하지 않는다.
   다른 기관의 동일 PatientRef 연결은 별도 승인·membership 계약으로 처리해야 하며 owner 재배정으로 대체하지 않는다.
2. reconcile 등록 actor를 기록한다. 단순 등록은 항상 UNVERIFIED이며 자동 VERIFIED가 아니다.
3. own tenant/hospital mapping을 lock하고 reviewer가 등록 actor와 다른지 검증한다.
   등록 actor 정보가 없는 기존 row는 임의 backfill하거나 자동 승인하지 않는다.
4. 모든 enum 간 검토 결과 변경은 명시적 검토로만 가능하다. VERIFIED 해제 시 verified_by/at는
   현재 row에서 비우되 과거 증적은 audit에 보존한다. protected ref/digest/PatientRef 재배정은 review에서 금지한다.
5. expectedVersion 불일치는 409; version은 정확히 1 증가. 동일 리뷰 idempotent retry는 증가하지 않는다.
6. mapping write, audit, idempotency result를 같은 tx에 저장한다. audit 실패는 모두 rollback이다.
7. tenant/hospital/actor/operation/key 범위의 idempotency를 사용한다. 저장 payload는 keyed digest,
   응답은 safe metadata만. raw identifiers, credential, protected envelope를 ledger에 복제하지 않는다.
8. 같은 key/다른 command는 409. concurrent 같은 key는 한 번만 수행한다.
   auth/registry 상태는 replay에도 검증한다. 현재 audit 읽기/버전 RLS를 피하는 방식은 금지한다.
9. foreign/missing은 동일한 404와 안전한 DENY 감사. COMMIT 장애는 outcome unknown으로 처리하고
   durable idempotency 확인 이전에는 무조건 새 동작으로 재시도하지 않는다.

## Durable 결과 ledger의 구현 경계

009 `identity_write_results`는 scoped key/request HMAC 및 strict safe metadata만 보존한다.
V3IdentityIdempotency는 transaction advisory lock 뒤 조회하고 callback write/audit/ledger를 같은 tx로 처리한다.
replay는 principal/기관 활성 여부와 자원 가시성을 재검증하며 callback을 실행하지 않는다.
원래 metadata snapshot을 반환하므로 현재 상태 조회는 GET으로 별도 수행한다.
PatientRef registerIdempotent와 Mapping write/review 내부 서비스를 연결했다. HTTP 활성화 완료는 아니다.

HMAC key는 고정된 신뢰 config로 주입한다. 즉시 rotation/유실은 과거 scoped key를 찾지 못해
중복 실행을 만들 수 있으므로, key/ledger 동시 보존과 명시적 migration 없이 변경하지 않는다.
TTL deletion/rotation/HTTP provisioning은 미구현이다. ledger는 raw key·payload·credential·envelope를 저장하지 않는다.
새 HTTP에서는 idempotent 경로를 필수로 해야 한다. 기존 unkeyed register는 내부 테스트/호환 경로이지 retry-safe HTTP 경로가 아니다.
성공 business mutation audit는 최초 동작 한 번만 남는다. 기본 legacy 경로의 retry/409 및
인증 이전 요청 감사 pipeline은 별도 미완료다. 명시적 `requireNetworkAudit` strict 경로는
재시도마다 현재 자원 가시성을 다시 확인하고, 현재 `MAPPING_READ` 또는 최소
`MAPPING_DENIED` 이벤트와 실제 네트워크 사실을 같은 transaction으로 기록한다.
현재 자원이 삭제되어 보이지 않으면 과거 성공 snapshot을 반환하지 않고
`404 V3_IDEMPOTENCY_RESOURCE_UNAVAILABLE`을 반환한다. 해당 거부에는 숨겨진
mapping/PatientRef/version/state를 복제하지 않는다. paired 감사 저장 장애는 503과
전체 rollback이며 기존 성공 ledger와 digest를 바꾸지 않는다. 이 계약은 삭제 API나
인증 이전 거부 감사의 구현 완료를 뜻하지 않는다.

010 후속에서는 registered_by, 변경 가드와 deferred audit 제약을 추가했다.
patient_ref_registrations는 명시적으로 기록된 owner tuple의 FK 기반 root record이며
환자 동의나 다른 기관으로의 공유 승인 객체가 아니다. PatientRef 등록과 같은 tx에 작성한다.
기존 non-NULL owner만 정확히 복사하고, 기존 NULL owner/maker는 추정하지 않는다.
정책 거부는 DENY 감사 commit 후 오류를 반환한다. 거부 결과는 success ledger에 저장하지 않는다.
동일 local digest에 다른 PatientRef를 붙이려 하면 기존 mapping을 IDENTITY_CONFLICT로 차단하며
PatientRef/protected ref/digest를 재배정하지 않는다. 반복 거부는 audit만 추가하고 version을 다시 올리지 않는다.
이름/생년월일로 후보를 만드는 검색·자동 matching은 구현하지 않았다.
retry 결과는 과거 snapshot이다. VERIFIED snapshot을 현재 승인으로 사용하지 말고 fresh mapping/preflight를 확인해야 한다.
현재 서비스 검증은 위 전체 HTTP·교차기관·조직 reviewer 위임 조건의 완료를 대신하지 않는다.
새 scope·계약에 대한 사람 검토는 UNASSIGNED다. 이전 김범희 검토를 승계하지 않는다.

## Strict runtime retry 검증 범위 — 2026-10-09

독립 HTTPS/mTLS/nonowner PG에서 실제 COMMIT 직후 ACK 유실을 주입하면 최초 응답은
`503 V3_COMMIT_OUTCOME_UNKNOWN`이다. 이를 rollback 확정으로 취급하거나 새로운 키로
재실행하지 않는다. 같은 scoped key·정규화 command의 신선한 요청은 원래 ledger snapshot을
반환하고 현재 접근 audit/network pair만 추가한다. 두 실제 PG 연결의 동시 동일-key 요청도
business mutation/receipt는 한 번이며 요청별 CREATED/READ pair를 보존한다.
DB principal 철회 또는 ingress capability 만료는 과거 결과로 우회하지 않는다.
이 증적은 fixture-only 장애 주입이며 배포·preauth 감사·모든 경합 완료를 뜻하지 않는다.
