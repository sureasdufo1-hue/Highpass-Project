# P0-04 식별자 보호·principal registry 및 JWT 보완 실행 결과

2026-10-07 / HEAD `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` + 미커밋 diff.
상태: IN PROGRESS — LOCAL SECURITY COMPONENTS TESTED / DRAFT / UNASSIGNED.
이 신규 코드에는 과거 legacy 사람 검토 PASS를 자동 승계하지 않는다.

## 작업 목적·순서

[식별자 보호 프롬프트](../implementation/highpass-v3-p0-04-identifier-prompt.md)를 작성하고 실행했다.
해당 단위 검증 후 [principal registry 프롬프트](../implementation/highpass-v3-p0-04-principal-prompt.md)를
작성·실행했다. 기존 인증기의 NumericDate 타입 우회 경계를 발견해
[JWT 보완 프롬프트](../implementation/highpass-jwt-numericdate-remediation-prompt.md)를 작성하고 실행했다.
P0-04 transactional repository·서비스·API를 완료한 것은 아니다.

관련: V3-FR-ID-001~005, V3-FR-TEN-001~004, V3-SR-IAM-001/004,
V3-SR-TEN-001~003, FR-014~025/037~041. 실제 환자정보는 사용하지 않았다.

## 분석한 기존 구조 및 결정

Node ESM + pg 기술 스택과 기존 auth API를 유지한다. OpenAPI의 보호값은 opaque string,
DDL은 bytea이며 보호 형식과 신뢰 경계가 미정이었다. 이를
[식별자 보호 계약](../security/highpass-v3-identifier-protection.md)으로 상세화했다.
기존 API 경로·필드 이름과 legacy UI는 유지한다. 신규 v3 request의 digest는 기존
43~86 chars에서 HMAC-SHA-256 canonical base64url 43 chars로 좁히고 보호값 pattern을 추가했다.
이전 v3 HTTP 클라이언트 구현은 없으며 아직 서버 endpoint 활성화도 하지 않았다.

## 구현 및 변경 파일

- `src/v3-identifier-protection.js`: AES-256-GCM/별도 HMAC-SHA-256 key, tenant/hospital/patientRef AAD,
  canonical bounded envelope, 서버 digest 재계산, 고정 오류, plaintext 비반환, key-ring/dispose.
- `src/v3-principal-registry.js`: 기존 TestProvider/OidcProvider 인증 후 issuer+subject registry 대조.
  내부 actor/tenant/hospital UUID, role·기관·양쪽 scope 교집합, 불변 config snapshot.
  Development Mock header나 요청 body가 UUID/권한을 설정하지 않는다.
- `src/auth.js`: signed JWT의 sub는 nonempty string, registered timestamp는 finite number로 검증한다.
  이전 `Number(exp)` 비교의 NaN 우회를 거부한다. 공통 NumericDate 소수는 허용하며
  v3 registry의 추가 정수 정책과 구분한다. signature/issuer/audience/expiry 검증을 완화하지 않았다.
- 신규 시험: `test/v3-identifier-protection.test.js`, `test/v3-principal-registry.test.js`,
  `test/jwt-registered-claims.test.js`.
- 위 실행 프롬프트/보호 계약/결과 문서, OpenAPI/API alignment/추적표/master plan을 갱신했다.

## 실제 검증

| 명령·검증 | 결과 | 근거 |
|---|---|---|
| identifier targeted | PASS | 16/16, exit 0 |
| identifier + registry targeted | PASS | 최종 28/28, exit 0 / 616.3904ms |
| 위 두 파일 + JWT registered claims targeted | PASS | 31/31, exit 0 / 470.2564ms |
| JWT 보완 전 전체 회귀 | PASS | 283/283, exit 0 / 41.0815128초; 이전 271개 결과와 구분 |
| JWT 보완 후 최종 `node --test` | PASS | 286/286, fail·skip 0, exit 0 / 42.4246139초 |
| `node scripts/security-secret-scan.js` | PASS | exit 0 / findings 0; 패턴 기반 검사 |
| Python PyYAML OpenAPI load + digest maxLength assertion | PASS | exit 0; YAML 문법/한 필드 확인이며 완전한 OpenAPI 의미 검증은 아님 |
| 신규 두 모듈·auth `node --check` | PASS | exit 0 |
| `git -c core.safecrlf=false diff --check` | PASS | exit 0; 미추적 파일 전체 형식 검증을 뜻하지 않음 |

최종 실행 코드 SHA-256:

| 파일 | SHA-256 |
|---|---|
| v3-identifier-protection.js | `2e6260dcf1006329a8d05bda4a3c4572537e446385d1c7790dba37a54d17040a` |
| v3-principal-registry.js | `c430f671bef16e83fd81ca05d9f053bdc54735b163b2ff0dbd8378726b6b4643` |
| auth.js | `04f9959ac9e35b6d012caf9fec9d576422cc5939b79d2da2f68932a89536f163` |

## 보안 결과와 한계

모든 시험은 임시 무작위 key·합성 subject/기관/ref를 사용하며 원문 key/token/local ID를 결과에
출력하지 않는다. 128회 nonce 표본 중복 0은 전역 무충돌이나 운영 사용량 한도 보장이 아니다.
keyId 변경과 old key 제거 거부를 시험했으나 외부 KMS/rotation 운영은 미검증이다.
digest는 patientRef를 제외해 같은 local ID의 다른 PatientRef 제출을 동일 lookup으로 탐지하지만
DB conflict 처리와 감사 workflow는 후속 서비스 책임이다. 암호화 성공은 VERIFIED 승인과 별개다.

registry는 서버 소유 불변 설정 snapshot이다. 레코드 실시간 철회/DB ACTIVE 검사/기관 trust
provisioning은 repository·service 단계에서 추가한다. Test JWT 검증은 실제 IdP 연동/MFA 승인이 아니다.
새 두 모듈은 아직 HTTP route에 연결하지 않았으며 라이브 Gateway mTLS identity 강제와 혼동하지 않는다.

`auth.js` 변경으로 기존 r3 이미지·17개 core attestation·HTTPS/mTLS 증적은 새 코드의 검증 증거가 아니다.
최신 코드 재빌드/runtime attest/독립 합성 HTTPS·mTLS 재검증과 신규 독립 사람 검토는 NOT VERIFIED다.
기존 Docker 스택·DB·볼륨을 변경하지 않았고 commit/push/merge/PR도 실행하지 않았다.

## 잔여 작업

P0-04 계속: principal registry와 DB tenant/hospital ACTIVE를 매 transaction에서 대조하는 repository,
real pg Pool reuse·SET LOCAL·joins 검증, mapping state/reviewer/version·idempotency·동일 transaction audit,
reconcile/metadata GET endpoint와 zero prohibited side effects 검증이 필요하다.
opaque PatientRef 생성/초기 권한 bootstrap과 Gateway 보호값 발행자 provisioning을 별도 내부 경계로
구현해야 한다. 원시 요청 patientRefId만으로 임상 접근이나 identity 확정을 허용하지 않는다.
전체 API HA·신규 v3 Grant·전체 MVP/v3 완료는 선언하지 않는다.

CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION,
ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM
